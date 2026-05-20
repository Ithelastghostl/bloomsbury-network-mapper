/**
 * Dossier assembly — builds a full Dossier from database records.
 * PRD ref: §18.7 — one dossier per candidate recommendation.
 *
 * Pure function: takes pre-fetched data, returns Dossier object.
 * No database calls — the caller is responsible for fetching data.
 */

import type {
  CandidateRecommendation,
  CanonicalEntity,
  EnrichmentSignal,
  HumanDecision,
  IdentityCluster,
  Relationship,
  EntityMention,
  EvidenceSpan,
} from '@/types/database';
import type {
  Dossier,
  DossierPath,
  DossierEvidence,
  DossierRole,
  DossierEnrichmentSignal,
  DossierIdentityNotes,
  DossierDecision,
  PriorityScoreBreakdown,
  ConfidenceScoreBreakdown,
} from './types';
import { generateSkeleton } from '@/lib/intro-angle/skeleton';

// ---------------------------------------------------------------
// Input bundle: everything needed to build a dossier
// ---------------------------------------------------------------

export interface DossierInput {
  candidate: CandidateRecommendation;
  entity: CanonicalEntity;
  /** Seed entity — for intro angle and path descriptions. */
  seedEntity: CanonicalEntity;
  enrichmentSignals: EnrichmentSignal[];
  decisions: HumanDecision[];
  /** Identity clusters for this entity. */
  clusters: IdentityCluster[];
  /** Relationships where this entity is source or target. */
  relationships: Relationship[];
  /** Entity mentions contributing to this canonical entity. */
  mentions: EntityMention[];
  /** Evidence spans for relationships involving this entity. */
  evidenceSpans: EvidenceSpan[];
  /** Map of entity ID to display name for path rendering. */
  entityNames: Record<string, string>;
}

// ---------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------

/**
 * Assemble a Dossier from pre-fetched data.
 * Every section in §18.7 is populated.
 */
export function assembleDossier(input: DossierInput): Dossier {
  const {
    candidate,
    entity,
    seedEntity,
    enrichmentSignals,
    decisions,
    clusters,
    relationships,
    mentions,
    evidenceSpans,
    entityNames,
  } = input;

  const paths = buildPaths(candidate, entityNames);
  const strongest = paths.length > 0 ? paths[0] : null;
  const shortest = findShortestPath(paths);

  const evidence = buildEvidence(relationships, evidenceSpans, mentions);
  const roles = buildRoles(relationships, entityNames);
  const enrichment = buildEnrichment(enrichmentSignals);
  const identityNotes = buildIdentityNotes(clusters, mentions);
  const decision = buildDecision(decisions);

  const priorityScore = buildPriorityBreakdown(candidate);
  const confidenceScore = buildConfidenceBreakdown(candidate);

  // Generate intro angle from strongest path facts
  const skeletonText = generateSkeleton({
    seedName: seedEntity.display_name,
    candidateName: entity.display_name,
    pathNodes: strongest?.nodes ?? [],
    entityNames,
    roles: roles.map((r) => ({
      entity: r.entity,
      role: r.role,
      start: r.start,
      end: r.end,
    })),
    sharedAffiliations: extractSharedAffiliations(candidate),
  });

  const discoveryMethods = deriveDiscoveryMethods(candidate);

  return {
    candidateRecommendationId: candidate.candidate_recommendation_id,
    runId: candidate.run_id,
    candidateName: entity.display_name,
    candidateEntityId: entity.canonical_entity_id,
    candidateType: entity.entity_type,
    priorityScore,
    confidenceScore,
    aggregatedMentions: mentions.length,
    reasonCodes: candidate.reason_codes,

    introAngle: {
      skeleton: skeletonText,
      natural: null, // populated by optional rephrase step
      recommendedIntroducer: seedEntity.display_name,
      recommendedIntroducerId: seedEntity.canonical_entity_id,
    },

    paths,
    sharedAffiliations: extractSharedAffiliations(candidate),
    discoveryMethods,

    strongestPath: strongest,
    shortestPath: shortest,

    evidence,
    roles,
    enrichmentSignals: enrichment,
    identityNotes,
    decision,
    identityWarnings: candidate.identity_warnings,
  };
}

// ---------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------

function buildPaths(
  candidate: CandidateRecommendation,
  entityNames: Record<string, string>,
): DossierPath[] {
  const sp = candidate.strongest_path as Record<string, unknown>;
  if (!sp) return [];

  const allPaths = (sp.allPaths ?? []) as Array<{
    path: string[];
    score: { pathScore: number; templateWeight?: number };
    templateId?: string;
    templateName?: string;
  }>;

  if (allPaths.length === 0 && Array.isArray(sp.path)) {
    // Fallback: single path stored directly
    return [
      {
        nodes: sp.path as string[],
        description: descriptionFromPath(sp.path as string[], entityNames),
        score: (sp.score as number) ?? 0,
        templateId: (sp.templateId as string) ?? null,
        templateName: (sp.templateName as string) ?? null,
      },
    ];
  }

  return allPaths.map((p, i) => ({
    nodes: p.path,
    description: descriptionFromPath(p.path, entityNames),
    score: p.score?.pathScore ?? 0,
    templateId: p.templateId ?? null,
    templateName: p.templateName ?? null,
  }));
}

function descriptionFromPath(
  nodeIds: string[],
  entityNames: Record<string, string>,
): string {
  return nodeIds.map((id) => entityNames[id] ?? id).join(' -> ');
}

function findShortestPath(paths: DossierPath[]): DossierPath | null {
  if (paths.length === 0) return null;
  return paths.reduce((shortest, p) =>
    p.nodes.length < shortest.nodes.length ? p : shortest,
  );
}

function buildEvidence(
  relationships: Relationship[],
  evidenceSpans: EvidenceSpan[],
  mentions: EntityMention[],
): DossierEvidence[] {
  const spanMap = new Map<string, EvidenceSpan>();
  for (const span of evidenceSpans) {
    spanMap.set(span.evidence_id, span);
  }

  const fromRelationships: DossierEvidence[] = relationships
    .filter((r) => r.evidence_id && spanMap.has(r.evidence_id))
    .map((r) => {
      const span = spanMap.get(r.evidence_id)!;
      return {
        claim: `${r.relationship_type} relationship`,
        evidenceSpan: span.text,
        sourceDocument: span.source_section ?? span.document_id,
        documentId: span.document_id,
        confidence: r.confidence,
      };
    });

  const fromMentions: DossierEvidence[] = mentions
    .filter((m) => m.evidence_span)
    .map((m) => ({
      claim: `${m.entity_type} mention: ${m.normalised_value}`,
      evidenceSpan: m.evidence_span,
      sourceDocument: m.document_id,
      documentId: m.document_id,
      confidence: m.extraction_confidence,
    }));

  return [...fromRelationships, ...fromMentions];
}

function buildRoles(
  relationships: Relationship[],
  entityNames: Record<string, string>,
): DossierRole[] {
  const roleTypes = new Set([
    'TRUSTEE_OF',
    'DIRECTOR_OF',
    'OFFICER_OF',
    'MEMBER_OF',
    'CHAIR_OF',
    'SECRETARY_OF',
    'PATRON_OF',
  ]);

  return relationships
    .filter((r) => roleTypes.has(r.relationship_type))
    .map((r) => ({
      entity: entityNames[r.target_entity_id] ?? r.target_entity_id,
      entityId: r.target_entity_id,
      role: r.relationship_type.replace('_OF', '').toLowerCase(),
      start: r.valid_from,
      end: r.valid_to,
      confidence: r.confidence,
    }));
}

function buildEnrichment(
  signals: EnrichmentSignal[],
): DossierEnrichmentSignal[] {
  return signals.map((s) => ({
    source: s.source,
    signal: s.signal_type,
    matchConfidence: s.match_confidence,
    freshness: s.cache_expires_at,
  }));
}

function buildIdentityNotes(
  clusters: IdentityCluster[],
  mentions: EntityMention[],
): DossierIdentityNotes {
  const possibleDuplicates: string[] = [];
  const conflictingData: string[] = [];
  const missingData: string[] = [];

  // Check for low-confidence clusters
  for (const cluster of clusters) {
    if (cluster.cluster_confidence < 0.7) {
      possibleDuplicates.push(
        `Cluster ${cluster.cluster_id} has low confidence (${cluster.cluster_confidence.toFixed(2)})`,
      );
    }
    if (cluster.decision_status === 'disputed') {
      conflictingData.push(
        `Cluster ${cluster.cluster_id} has been disputed`,
      );
    }
  }

  // Check for mentions with validation issues
  for (const mention of mentions) {
    if (mention.validation_status === 'quarantined') {
      missingData.push(
        `Mention ${mention.entity_mention_id} was quarantined`,
      );
    }
  }

  const topCluster = clusters.length > 0 ? clusters[0] : null;

  return {
    possibleDuplicates,
    conflictingData,
    missingData,
    underlyingMentions: mentions.map((m) => m.entity_mention_id),
    clusterConfidence: topCluster?.cluster_confidence ?? null,
    decisionStatus: topCluster?.decision_status ?? null,
  };
}

function buildDecision(
  decisions: HumanDecision[],
): DossierDecision | null {
  if (decisions.length === 0) return null;
  const latest = decisions[0]; // Already sorted desc by decided_at
  return {
    status: latest.decision,
    notes: latest.notes,
    outcome: latest.reason_code,
    identityDecision: null,
    decidedBy: latest.decided_by,
    decidedAt: latest.decided_at,
  };
}

/**
 * Build priority score breakdown from candidate.
 * The candidate stores the total; component scores are in strongest_path metadata.
 * Per §18.1: 0.30 intro + 0.25 affinity + 0.20 capacity + 0.15 influence + 0.10 strategic_fit
 */
function buildPriorityBreakdown(
  candidate: CandidateRecommendation,
): PriorityScoreBreakdown {
  const sp = candidate.strongest_path as Record<string, unknown>;
  const breakdown = (sp?.priorityBreakdown ?? {}) as Record<string, number>;

  return {
    total: candidate.priority_score,
    introability: breakdown.introability ?? 0,
    affinity: breakdown.affinity ?? 0,
    capacitySignal: breakdown.capacitySignal ?? 0,
    influence: breakdown.influence ?? 0,
    strategicFit: breakdown.strategicFit ?? 0,
  };
}

/**
 * Build confidence score breakdown from candidate.
 * Per §18.2: 0.35 identity + 0.30 relationship + 0.20 source_corroboration + 0.15 freshness
 */
function buildConfidenceBreakdown(
  candidate: CandidateRecommendation,
): ConfidenceScoreBreakdown {
  const sp = candidate.strongest_path as Record<string, unknown>;
  const breakdown = (sp?.confidenceBreakdown ?? {}) as Record<string, number>;

  return {
    total: candidate.confidence_score,
    identityConfidence: breakdown.identityConfidence ?? 0,
    relationshipConfidence: breakdown.relationshipConfidence ?? 0,
    sourceCorroboration: breakdown.sourceCorroboration ?? 0,
    freshness: breakdown.freshness ?? 0,
  };
}

function extractSharedAffiliations(
  candidate: CandidateRecommendation,
): string[] {
  const sp = candidate.strongest_path as Record<string, unknown>;
  return (sp?.sharedAffiliations ?? []) as string[];
}

function deriveDiscoveryMethods(
  candidate: CandidateRecommendation,
): string[] {
  const methods: string[] = [];
  const codes = candidate.reason_codes;

  if (codes.some((c) => c.includes('trustee') || c.includes('director'))) {
    methods.push('path-template');
  }
  if (codes.some((c) => c.includes('affiliation'))) {
    methods.push('shared-affiliation');
  }
  if (codes.includes('high_pagerank_proximity')) {
    methods.push('personalised-pagerank');
  }
  if (codes.includes('multi_path_convergence')) {
    methods.push('multi-path');
  }
  if (codes.includes('direct_relationship')) {
    methods.push('direct');
  }
  if (methods.length === 0) {
    methods.push('path-template');
  }

  return methods;
}
