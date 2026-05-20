/**
 * GET /api/candidates/:candidate_id/dossier — full dossier per §18.7, §20.5.
 * Returns complete dossier data including all sections:
 * summary, paths, evidence, roles, enrichment, identity notes, decision panel.
 */

import { createClient } from '@/lib/supabase/server';
import { notFound, serverError } from '@/lib/api-error';
import { assembleDossier, type DossierInput } from '@/lib/dossier/assemble';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ candidate_id: string }> },
) {
  try {
    const { candidate_id } = await params;
    const supabase = await createClient();

    // 1. Fetch the candidate recommendation
    const { data: candidate, error: candidateError } = await supabase
      .from('candidate_recommendations')
      .select()
      .eq('candidate_recommendation_id', candidate_id)
      .single();

    if (candidateError || !candidate) {
      return notFound('Candidate recommendation not found');
    }

    // 2. Fetch all related data in parallel
    const [
      entityResult,
      seedEntityResult,
      enrichmentResult,
      decisionsResult,
      clustersResult,
      relationshipsResult,
      mentionsResult,
    ] = await Promise.all([
      // Candidate entity
      supabase
        .from('canonical_entities')
        .select()
        .eq('canonical_entity_id', candidate.candidate_entity_id)
        .single(),

      // Seed entity (via seed -> canonical_entity)
      supabase
        .from('seeds')
        .select('canonical_entity_id')
        .eq('seed_id', candidate.seed_id)
        .single()
        .then(async (seedResult) => {
          if (seedResult.error || !seedResult.data) {
            return { data: null, error: seedResult.error };
          }
          return supabase
            .from('canonical_entities')
            .select()
            .eq('canonical_entity_id', seedResult.data.canonical_entity_id)
            .single();
        }),

      // Enrichment signals
      supabase
        .from('enrichment_signals')
        .select()
        .eq('candidate_entity_id', candidate.candidate_entity_id)
        .order('retrieved_at', { ascending: false }),

      // Human decisions
      supabase
        .from('human_decisions')
        .select()
        .eq('candidate_recommendation_id', candidate_id)
        .order('decided_at', { ascending: false }),

      // Identity clusters
      supabase
        .from('identity_clusters')
        .select()
        .eq('canonical_entity_id', candidate.candidate_entity_id)
        .order('created_at', { ascending: false }),

      // Relationships (source or target)
      supabase
        .from('relationships')
        .select()
        .or(
          `source_entity_id.eq.${candidate.candidate_entity_id},target_entity_id.eq.${candidate.candidate_entity_id}`,
        ),

      // Entity mentions (via clusters)
      supabase
        .from('identity_clusters')
        .select('member_mention_ids')
        .eq('canonical_entity_id', candidate.candidate_entity_id)
        .then(async (clusterResult) => {
          if (clusterResult.error || !clusterResult.data?.length) {
            return { data: [], error: null };
          }
          const mentionIds = clusterResult.data.flatMap(
            (c: { member_mention_ids: string[] }) => c.member_mention_ids,
          );
          if (mentionIds.length === 0) {
            return { data: [], error: null };
          }
          return supabase
            .from('entity_mentions')
            .select()
            .in('entity_mention_id', mentionIds);
        }),
    ]);

    if (entityResult.error || !entityResult.data) {
      return serverError(
        'Failed to fetch candidate entity',
        entityResult.error?.message,
      );
    }

    // Build entity name map from relationships for path rendering
    const entityNames: Record<string, string> = {};
    entityNames[entityResult.data.canonical_entity_id] =
      entityResult.data.display_name;

    if (seedEntityResult.data) {
      entityNames[seedEntityResult.data.canonical_entity_id] =
        seedEntityResult.data.display_name;
    }

    // Collect entity IDs from relationships and fetch their names
    const relatedEntityIds = new Set<string>();
    for (const rel of relationshipsResult.data ?? []) {
      relatedEntityIds.add(rel.source_entity_id);
      relatedEntityIds.add(rel.target_entity_id);
    }

    // Also collect from strongest_path
    const sp = candidate.strongest_path as Record<string, unknown>;
    if (sp) {
      const allPaths = (sp.allPaths ?? []) as Array<{ path: string[] }>;
      for (const p of allPaths) {
        for (const nodeId of p.path) {
          relatedEntityIds.add(nodeId);
        }
      }
      if (Array.isArray(sp.path)) {
        for (const nodeId of sp.path as string[]) {
          relatedEntityIds.add(nodeId);
        }
      }
    }

    // Fetch display names for related entities
    const entityIdsToFetch = [...relatedEntityIds].filter(
      (id) => !entityNames[id],
    );
    if (entityIdsToFetch.length > 0) {
      const { data: relatedEntities } = await supabase
        .from('canonical_entities')
        .select('canonical_entity_id, display_name')
        .in('canonical_entity_id', entityIdsToFetch);

      for (const e of relatedEntities ?? []) {
        entityNames[e.canonical_entity_id] = e.display_name;
      }
    }

    // Fetch evidence spans for the relationships
    const evidenceIds = (relationshipsResult.data ?? [])
      .map((r: { evidence_id: string }) => r.evidence_id)
      .filter(Boolean);

    let evidenceSpans: unknown[] = [];
    if (evidenceIds.length > 0) {
      const { data: spans } = await supabase
        .from('evidence_spans')
        .select()
        .in('evidence_id', evidenceIds);
      evidenceSpans = spans ?? [];
    }

    // Assemble the dossier
    const input: DossierInput = {
      candidate,
      entity: entityResult.data,
      seedEntity: seedEntityResult.data ?? {
        canonical_entity_id: '',
        entity_type: 'person',
        display_name: 'Unknown Seed',
        first_seen_run_id: '',
        last_seen_run_id: '',
        attributes: {},
      },
      enrichmentSignals: enrichmentResult.data ?? [],
      decisions: decisionsResult.data ?? [],
      clusters: clustersResult.data ?? [],
      relationships: relationshipsResult.data ?? [],
      mentions: mentionsResult.data ?? [],
      evidenceSpans: evidenceSpans as DossierInput['evidenceSpans'],
      entityNames,
    };

    const dossier = assembleDossier(input);

    return Response.json(dossier);
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
}
