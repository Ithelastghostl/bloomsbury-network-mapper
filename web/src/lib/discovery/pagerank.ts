/**
 * Personalised PageRank discovery module (F7.2-T2, F7.2-T3, §16.1).
 *
 * Uses the DirectedGraph.personalizedPageRank method with alpha=0.85
 * and personalization concentrated on seed entities.
 *
 * Supports single-seed and multi-seed (intersection/union) discovery (R3.1).
 */

import type { DirectedGraph } from '@/lib/graph/networkx';

export interface PPRCandidate {
  entityId: string;
  score: number;
  entityType: string;
}

export interface PPRResult {
  /** Ranked candidates (descending score), excluding seeds and non-person entities. */
  candidates: PPRCandidate[];
  /** Raw PPR scores for all nodes (for debugging/transparency). */
  rawScores: Map<string, number>;
}

/** Default PPR damping factor per §16.1. */
const DEFAULT_ALPHA = 0.85;

/**
 * Run Personalised PageRank from a single seed entity.
 *
 * Returns person-like candidates ranked by PPR score, excluding the seed itself.
 */
export function runPPR(
  graph: DirectedGraph,
  seedId: string,
  options?: {
    alpha?: number;
    maxIterations?: number;
    tolerance?: number;
    /** Entity types to include as candidates (default: ['person']). */
    candidateTypes?: string[];
  },
): PPRResult {
  const alpha = options?.alpha ?? DEFAULT_ALPHA;
  const candidateTypes = options?.candidateTypes ?? ['person'];

  const personalization = new Map<string, number>([[seedId, 1.0]]);

  const rawScores = graph.personalizedPageRank(
    personalization,
    alpha,
    options?.maxIterations,
    options?.tolerance,
  );

  const candidates = rankCandidates(graph, rawScores, new Set([seedId]), candidateTypes);

  return { candidates, rawScores };
}

/**
 * Run multi-seed PPR and combine results.
 *
 * - 'union': candidates connected to any seed (scores summed).
 * - 'intersection': only candidates connected to all seeds (R3.1).
 */
export function runMultiSeedPPR(
  graph: DirectedGraph,
  seedIds: string[],
  mode: 'union' | 'intersection',
  options?: {
    alpha?: number;
    maxIterations?: number;
    tolerance?: number;
    candidateTypes?: string[];
  },
): PPRResult {
  if (seedIds.length === 0) {
    return { candidates: [], rawScores: new Map() };
  }

  if (seedIds.length === 1) {
    return runPPR(graph, seedIds[0], options);
  }

  // Run PPR for each seed independently
  const perSeedResults: Map<string, number>[] = [];
  for (const seedId of seedIds) {
    const result = runPPR(graph, seedId, options);
    perSeedResults.push(result.rawScores);
  }

  const candidateTypes = options?.candidateTypes ?? ['person'];
  const seedSet = new Set(seedIds);

  if (mode === 'union') {
    return combineUnion(graph, perSeedResults, seedSet, candidateTypes);
  } else {
    return combineIntersection(graph, perSeedResults, seedSet, candidateTypes);
  }
}

/**
 * Union: sum scores across all seed PPR runs.
 */
function combineUnion(
  graph: DirectedGraph,
  perSeedScores: Map<string, number>[],
  seedSet: Set<string>,
  candidateTypes: string[],
): PPRResult {
  const combined = new Map<string, number>();

  for (const scores of perSeedScores) {
    for (const [nodeId, score] of scores) {
      combined.set(nodeId, (combined.get(nodeId) ?? 0) + score);
    }
  }

  const candidates = rankCandidates(graph, combined, seedSet, candidateTypes);
  return { candidates, rawScores: combined };
}

/**
 * Intersection: only include candidates that appear with non-zero score
 * in every seed's PPR result. Use minimum score across seeds.
 */
function combineIntersection(
  graph: DirectedGraph,
  perSeedScores: Map<string, number>[],
  seedSet: Set<string>,
  candidateTypes: string[],
): PPRResult {
  const combined = new Map<string, number>();

  // Start with all nodes from the first seed
  const firstScores = perSeedScores[0];
  for (const [nodeId, score] of firstScores) {
    if (score > 0) {
      combined.set(nodeId, score);
    }
  }

  // Intersect with subsequent seeds: keep only nodes present in all, use min score
  for (let i = 1; i < perSeedScores.length; i++) {
    const seedScores = perSeedScores[i];
    for (const [nodeId, currentMin] of combined) {
      const seedScore = seedScores.get(nodeId) ?? 0;
      if (seedScore > 0) {
        combined.set(nodeId, Math.min(currentMin, seedScore));
      } else {
        combined.delete(nodeId);
      }
    }
  }

  const candidates = rankCandidates(graph, combined, seedSet, candidateTypes);
  return { candidates, rawScores: combined };
}

/**
 * Convert raw scores to a ranked candidate list, filtering to desired types
 * and excluding seed nodes.
 */
function rankCandidates(
  graph: DirectedGraph,
  scores: Map<string, number>,
  excludeIds: Set<string>,
  candidateTypes: string[],
): PPRCandidate[] {
  const candidates: PPRCandidate[] = [];
  const typeSet = new Set(candidateTypes);

  for (const [nodeId, score] of scores) {
    if (excludeIds.has(nodeId)) continue;

    const node = graph.getNode(nodeId);
    if (!node) continue;
    if (!typeSet.has(node.type)) continue;

    candidates.push({
      entityId: nodeId,
      score,
      entityType: node.type,
    });
  }

  // Sort descending by score
  candidates.sort((a, b) => b.score - a.score);

  return candidates;
}
