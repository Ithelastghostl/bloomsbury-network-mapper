/**
 * POST /api/discovery/query — run discovery for given seeds (F7.4-T1, §20.5)
 *
 * Accepts seed_ids array, optional run_id, optional limit.
 * Returns candidate recommendations with paths and reason codes.
 * Stores results in app.candidate_recommendations (F7.4-T3).
 */

import { createClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/ulid';
import { apiError, serverError } from '@/lib/api-error';
import { withIdempotency } from '@/lib/with-idempotency';
import { DirectedGraph } from '@/lib/graph/networkx';
import { scorePath, scoreCandidatePaths, extractPathEdges } from '@/lib/discovery/path-scoring';
import { matchTemplate } from '@/lib/discovery/path-templates';
import { runMultiSeedPPR } from '@/lib/discovery/pagerank';
import { scoreSharedAffiliations } from '@/lib/discovery/affiliation';
import { generateReasonCodes } from '@/lib/discovery/reason-codes';
import { checkEligibility, applyQueueLimit, type ExclusionContext } from '@/lib/discovery/eligibility';
import { calculateSeedQuality, type SeedQualityInput } from '@/lib/discovery/seed-quality';
import type { CandidateRecommendation } from '@/types/database';

interface DiscoveryRequest {
  seed_ids: string[];
  run_id?: string;
  limit?: number;
}

export const POST = withIdempotency(async (request: Request) => {
  try {
    const body: DiscoveryRequest = await request.json();

    if (!body.seed_ids || !Array.isArray(body.seed_ids) || body.seed_ids.length === 0) {
      return apiError('bad_request', 'seed_ids must be a non-empty array', undefined, 400);
    }

    const supabase = await createClient();
    const runId = body.run_id ?? generateId();

    // 1. Load the latest graph snapshot
    const { data: snapshot, error: snapError } = await supabase
      .from('graph_snapshots')
      .select()
      .order('built_at', { ascending: false })
      .limit(1)
      .single();

    if (snapError || !snapshot) {
      return apiError('not_found', 'No graph snapshot available. Run graph build first.', undefined, 404);
    }

    // 2. Load graph data from storage
    const { data: graphBlob, error: blobError } = await supabase
      .storage
      .from('graph-snapshots')
      .download(snapshot.storage_uri);

    if (blobError || !graphBlob) {
      return serverError('Failed to load graph snapshot', blobError?.message);
    }

    const graphData = JSON.parse(await graphBlob.text());
    const graph = DirectedGraph.deserialize(graphData);

    // 3. Load seeds
    const { data: seeds, error: seedError } = await supabase
      .from('seeds')
      .select()
      .in('seed_id', body.seed_ids)
      .eq('active', true);

    if (seedError) {
      return serverError('Failed to load seeds', seedError.message);
    }

    if (!seeds || seeds.length === 0) {
      return apiError('not_found', 'No active seeds found for provided seed_ids', undefined, 404);
    }

    // 4. Load exclusion context
    const exclusions = await loadExclusions(supabase, body.seed_ids);

    // 5. Run discovery per seed
    const allRecommendations: CandidateRecommendation[] = [];
    const limit = body.limit ?? 50;

    for (const seed of seeds) {
      const seedEntityId = seed.canonical_entity_id;

      // Verify seed exists in graph
      if (!graph.hasNode(seedEntityId)) {
        continue;
      }

      // Calculate seed quality
      const seedQuality = calculateSeedQuality(
        computeSeedQualityInput(graph, seedEntityId),
      );

      // Run PPR from this seed
      const pprResult = runMultiSeedPPR(graph, [seedEntityId], 'union');

      // Discover candidates: all person-like nodes reachable from seed
      const candidateMap = new Map<string, {
        paths: { path: string[]; score: ReturnType<typeof scorePath> }[];
        pprScore: number;
        affiliationScore: number;
        sharedAffiliationTypes: string[];
      }>();

      for (const pprCandidate of pprResult.candidates) {
        const entityId = pprCandidate.entityId;

        // Check eligibility
        const eligibility = checkEligibility(
          {
            entityId,
            entityType: pprCandidate.entityType,
            hasPathToSeed: true,
            hasQualifyingSignal: true,
            confidence: 0.50, // default; refined below
          },
          exclusions,
          seedQuality.minConfidence,
        );

        if (!eligibility.eligible) continue;

        // Find paths from seed to candidate
        const pathNodeIds = graph.shortestPath(seedEntityId, entityId);
        const reversePathNodeIds = graph.shortestPath(entityId, seedEntityId);

        const paths: { path: string[]; score: ReturnType<typeof scorePath> }[] = [];

        for (const p of [pathNodeIds, reversePathNodeIds]) {
          if (!p || p.length < 2 || p.length > 4) continue;
          const orderedPath = p[0] === seedEntityId ? p : [...p].reverse();
          const { edgeWeights, evidenceConfidences } = extractPathEdges(graph, orderedPath);

          if (edgeWeights.some((w) => w === 0)) continue;

          const template = matchTemplate(
            orderedPath,
            (id) => graph.getNode(id),
            (id, type) => graph.getOutEdges(id, type),
            (id, type) => graph.getInEdges(id, type),
          );

          const score = scorePath({
            path: orderedPath,
            template,
            edgeWeights,
            evidenceConfidences,
          });

          paths.push({ path: orderedPath, score });
        }

        if (paths.length === 0) continue;

        // Shared affiliation scoring
        const affResult = scoreSharedAffiliations(graph, seedEntityId, entityId);

        candidateMap.set(entityId, {
          paths,
          pprScore: pprCandidate.score,
          affiliationScore: affResult.affiliationScore,
          sharedAffiliationTypes: affResult.sharedAffiliations.map((a) => a.affiliationType),
        });
      }

      // Score and rank candidates
      const scored = [...candidateMap.entries()].map(([entityId, data]) => {
        const candidateScore = scoreCandidatePaths(data.paths);
        const strongestPathTypes = candidateScore.strongestPath.length > 1
          ? extractEdgeTypes(graph, candidateScore.strongestPath)
          : [];

        const reasonCodes = generateReasonCodes({
          pathRelationshipTypes: strongestPathTypes,
          pathCount: data.paths.length,
          sharedAffiliationTypes: data.sharedAffiliationTypes,
          pprScore: data.pprScore,
          directRelationship: candidateScore.strongestPath.length === 2,
        });

        return {
          entityId,
          candidatePathScore: candidateScore.candidatePathScore,
          strongestPath: candidateScore.strongestPath,
          reasonCodes,
          pprScore: data.pprScore,
        };
      });

      // Sort by candidatePathScore descending
      scored.sort((a, b) => b.candidatePathScore - a.candidatePathScore);

      // Apply queue limit
      const effectiveLimit = seedQuality.candidateCap
        ? Math.min(seedQuality.candidateCap, limit)
        : limit;
      const limited = applyQueueLimit(scored, 'review', effectiveLimit);

      // Build recommendations (F7.4-T3: store in candidate_recommendations)
      for (let rank = 0; rank < limited.length; rank++) {
        const c = limited[rank];
        const rec: CandidateRecommendation = {
          candidate_recommendation_id: generateId(),
          run_id: runId,
          seed_id: seed.seed_id,
          candidate_entity_id: c.entityId,
          presentation_group_id: null,
          rank: rank + 1,
          priority_score: c.candidatePathScore,
          confidence_score: c.pprScore,
          status: 'pending_review',
          strongest_path: {
            node_ids: c.strongestPath,
            score: c.candidatePathScore,
          },
          reason_codes: c.reasonCodes,
          identity_warnings: [],
          introduction_route_id: null,
          target_seed_id: null,
          created_at: new Date().toISOString(),
        };
        allRecommendations.push(rec);
      }
    }

    // 6. Store recommendations in batch (F7.4-T3)
    if (allRecommendations.length > 0) {
      const { error: insertError } = await supabase
        .from('candidate_recommendations')
        .insert(allRecommendations);

      if (insertError) {
        return serverError('Failed to store candidate recommendations', insertError.message);
      }
    }

    return Response.json(allRecommendations, { status: 201 });
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
});

/** Load exclusion context from the database */
async function loadExclusions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  seedIds: string[],
): Promise<ExclusionContext> {
  // Load known contacts
  const { data: knownContacts } = await supabase
    .from('known_contacts')
    .select('canonical_entity_id');

  // Load rejections for these seeds
  const { data: rejections } = await supabase
    .from('rejection_log')
    .select('candidate_entity_id')
    .in('seed_id', seedIds);

  // Load prior leads
  const { data: priorLeads } = await supabase
    .from('candidate_recommendations')
    .select('candidate_entity_id')
    .in('status', ['qualified', 'intro_requested', 'intro_success']);

  return {
    knownContactIds: new Set((knownContacts ?? []).map((r) => r.canonical_entity_id)),
    rejectedForSeedIds: new Set((rejections ?? []).map((r) => r.candidate_entity_id)),
    priorLeadIds: new Set((priorLeads ?? []).map((r) => r.candidate_entity_id)),
    excludedIntermediaryIds: new Set(),
    genericServiceEntityIds: new Set(),
  };
}

/** Compute seed quality input from graph data */
function computeSeedQualityInput(
  graph: DirectedGraph,
  seedEntityId: string,
): SeedQualityInput {
  const outEdges = graph.getOutEdges(seedEntityId);
  const inEdges = graph.getInEdges(seedEntityId);
  const allEdges = [...outEdges, ...inEdges];
  const currentYear = new Date().getFullYear();

  const strongEdges = allEdges.filter((e) => e.weight >= 0.5);
  const recentEdges = allEdges.filter((e) => {
    const year = e.attributes.valid_from
      ? new Date(e.attributes.valid_from as string).getFullYear()
      : null;
    return year !== null && currentYear - year <= 3;
  });

  const affiliations = new Set(
    allEdges.map((e) => e.target).concat(allEdges.map((e) => e.source)),
  );
  affiliations.delete(seedEntityId);

  return {
    strongEdgeCountScore: allEdges.length > 0 ? strongEdges.length / allEdges.length : 0,
    recentEdgeScore: allEdges.length > 0 ? recentEdges.length / allEdges.length : 0,
    affiliationCountScore: Math.min(affiliations.size / 10, 1),
    historicalIntroSuccessScore: 0,
    identityConfidenceScore: 0.7,
  };
}

/** Extract edge types along a path */
function extractEdgeTypes(graph: DirectedGraph, pathNodeIds: string[]): string[] {
  const types: string[] = [];
  for (let i = 0; i < pathNodeIds.length - 1; i++) {
    const outEdges = graph.getOutEdges(pathNodeIds[i]).filter(
      (e) => e.target === pathNodeIds[i + 1],
    );
    const inEdges = graph.getInEdges(pathNodeIds[i]).filter(
      (e) => e.source === pathNodeIds[i + 1],
    );
    const bestEdge = [...outEdges, ...inEdges].sort((a, b) => b.weight - a.weight)[0];
    if (bestEdge) types.push(bestEdge.type);
  }
  return types;
}
