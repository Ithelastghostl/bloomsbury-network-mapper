/**
 * Shared-affiliation scoring for candidate discovery (F7.2-T1, §16.1).
 *
 * Scores candidates based on shared organisations/affiliations with a seed entity.
 * Shared address is weighted lower per §16.1.
 */

import type { DirectedGraph } from '@/lib/graph/networkx';

/** Affiliation types and their weights. */
export const AFFILIATION_WEIGHTS: Record<string, number> = {
  charity: 1.0,
  trust: 0.95,
  company: 0.9,
  donation_target: 0.85,
  board_network: 0.8,
  address: 0.3, // weighted lower per §16.1
};

/** Edge types that indicate affiliation with an intermediary entity. */
const AFFILIATION_EDGE_TYPES: Record<string, string> = {
  TRUSTEE_OF: 'charity',
  DIRECTOR_OF: 'company',
  MADE_DONATION: 'donation_target',
  SHARES_AFFILIATION_WITH: 'board_network',
  REGISTERED_AT: 'address',
};

export interface SharedAffiliation {
  /** The intermediary entity both seed and candidate connect to. */
  intermediaryId: string;
  intermediaryType: string;
  /** The affiliation category determining the weight. */
  affiliationType: string;
  /** Weight from AFFILIATION_WEIGHTS. */
  weight: number;
  /** Edge types connecting seed and candidate to the intermediary. */
  seedEdgeType: string;
  candidateEdgeType: string;
}

export interface AffiliationScoreResult {
  /** Combined affiliation score for this candidate. */
  affiliationScore: number;
  /** All shared affiliations found. */
  sharedAffiliations: SharedAffiliation[];
  /** Count of distinct shared intermediary entities. */
  sharedCount: number;
}

/**
 * Find shared affiliations between a seed and a candidate.
 *
 * Looks for intermediary entities that both the seed and the candidate
 * connect to via affiliation-type edges. Returns a weighted score.
 */
export function scoreSharedAffiliations(
  graph: DirectedGraph,
  seedId: string,
  candidateId: string,
): AffiliationScoreResult {
  // Collect intermediaries reachable from seed (one hop out and in)
  const seedIntermediaries = collectIntermediaries(graph, seedId);
  const candidateIntermediaries = collectIntermediaries(graph, candidateId);

  const sharedAffiliations: SharedAffiliation[] = [];

  for (const [intermediaryId, seedInfo] of seedIntermediaries) {
    const candidateInfo = candidateIntermediaries.get(intermediaryId);
    if (!candidateInfo) continue;

    // Don't count the seed or candidate themselves as intermediaries
    if (intermediaryId === seedId || intermediaryId === candidateId) continue;

    const intermediaryNode = graph.getNode(intermediaryId);
    const intermediaryType = intermediaryNode?.type ?? 'unknown';

    // Determine affiliation type from the intermediary's node type or edge type
    const affiliationType = resolveAffiliationType(
      intermediaryType,
      seedInfo.edgeType,
    );
    const weight = AFFILIATION_WEIGHTS[affiliationType] ?? 0.5;

    sharedAffiliations.push({
      intermediaryId,
      intermediaryType,
      affiliationType,
      weight,
      seedEdgeType: seedInfo.edgeType,
      candidateEdgeType: candidateInfo.edgeType,
    });
  }

  // Score: sum of weights, normalized to [0, 1] range by dividing by max possible
  // Use diminishing returns: sum of weights with a cap
  const rawScore = sharedAffiliations.reduce((sum, a) => sum + a.weight, 0);
  // Normalize: 1 - 1/(1 + rawScore) gives diminishing returns in [0, 1)
  const affiliationScore =
    sharedAffiliations.length > 0 ? 1 - 1 / (1 + rawScore) : 0;

  return {
    affiliationScore,
    sharedAffiliations,
    sharedCount: sharedAffiliations.length,
  };
}

interface IntermediaryInfo {
  edgeType: string;
}

/**
 * Collect all intermediary entities reachable from a node via one hop
 * (both outgoing and incoming edges).
 */
function collectIntermediaries(
  graph: DirectedGraph,
  nodeId: string,
): Map<string, IntermediaryInfo> {
  const result = new Map<string, IntermediaryInfo>();

  // Outgoing edges: node → intermediary
  for (const edge of graph.getOutEdges(nodeId)) {
    if (!result.has(edge.target)) {
      result.set(edge.target, { edgeType: edge.type });
    }
  }

  // Incoming edges: intermediary → node
  for (const edge of graph.getInEdges(nodeId)) {
    if (!result.has(edge.source)) {
      result.set(edge.source, { edgeType: edge.type });
    }
  }

  return result;
}

/**
 * Map intermediary node type and edge type to an affiliation category.
 */
function resolveAffiliationType(
  nodeType: string,
  edgeType: string,
): string {
  // First try the edge type mapping
  const fromEdge = AFFILIATION_EDGE_TYPES[edgeType];
  if (fromEdge) return fromEdge;

  // Fall back to node type
  if (nodeType === 'charity' || nodeType === 'trust') return nodeType;
  if (nodeType === 'company') return 'company';
  if (nodeType === 'address') return 'address';

  return 'board_network';
}
