/**
 * Path score calculation for candidate discovery (F7.1-T2, F7.1-T3, F7.1-T4, §16.2).
 *
 * path_score = template_weight x average(edge_weight) x path_length_penalty x path_evidence_confidence
 * candidate_path_score = strongest_path_score + 0.25 x log(1 + additional_qualifying_paths)
 */

import type { DirectedGraph, GraphEdge } from '@/lib/graph/networkx';
import { matchTemplate, type PathTemplate } from './path-templates';

/** §16.2 — Length penalty lookup. 4+ edges excluded by default. */
const LENGTH_PENALTY: Record<number, number> = {
  1: 1.0,
  2: 0.85,
  3: 0.65,
};

/** Maximum edge count before a path is excluded (Appendix A.4). */
const MAX_PATH_EDGES = 3;

export interface PathScoreInput {
  /** Ordered node IDs forming the path (seed first, candidate last). */
  path: string[];
  /** The template that matched this path (null if no template matched). */
  template: PathTemplate | null;
  /** Pre-computed edge weights along the path. */
  edgeWeights: number[];
  /** Evidence confidence values along the path (one per edge). */
  evidenceConfidences: number[];
}

export interface PathScoreResult {
  pathScore: number;
  templateWeight: number;
  avgEdgeWeight: number;
  lengthPenalty: number;
  pathEvidenceConfidence: number;
  edgeCount: number;
}

/**
 * Score a single path per §16.2.
 */
export function scorePath(input: PathScoreInput): PathScoreResult {
  const edgeCount = input.path.length - 1;

  if (edgeCount < 1 || edgeCount > MAX_PATH_EDGES) {
    return {
      pathScore: 0,
      templateWeight: 0,
      avgEdgeWeight: 0,
      lengthPenalty: 0,
      pathEvidenceConfidence: 0,
      edgeCount,
    };
  }

  const templateWeight = input.template?.weight ?? 0.5; // unmatched templates get half weight
  const avgEdgeWeight =
    input.edgeWeights.reduce((a, b) => a + b, 0) / input.edgeWeights.length;
  const lengthPenalty = LENGTH_PENALTY[edgeCount] ?? 0;
  const pathEvidenceConfidence =
    input.evidenceConfidences.reduce((a, b) => a + b, 0) /
    input.evidenceConfidences.length;

  const pathScore =
    templateWeight * avgEdgeWeight * lengthPenalty * pathEvidenceConfidence;

  return {
    pathScore,
    templateWeight,
    avgEdgeWeight,
    lengthPenalty,
    pathEvidenceConfidence,
    edgeCount,
  };
}

export interface CandidatePathScoreResult {
  /** Combined score: strongest + 0.25 * log(1 + additional). */
  candidatePathScore: number;
  /** The strongest individual path score. */
  strongestPathScore: number;
  /** Number of additional qualifying paths beyond the strongest. */
  additionalPaths: number;
  /** The strongest path (node IDs). */
  strongestPath: string[];
  /** The shortest path by hop count (node IDs). */
  shortestPath: string[];
  /** All scored paths for transparency. */
  allPaths: { path: string[]; score: PathScoreResult }[];
}

/**
 * Compute the candidate-level path score from all qualifying paths (§16.2, F7.1-T3, R3.7).
 *
 * candidate_path_score = strongest_path_score + 0.25 * log(1 + additional_qualifying_paths)
 *
 * Also returns both shortest and strongest path per R3.7.
 */
export function scoreCandidatePaths(
  scoredPaths: { path: string[]; score: PathScoreResult }[],
): CandidatePathScoreResult {
  if (scoredPaths.length === 0) {
    return {
      candidatePathScore: 0,
      strongestPathScore: 0,
      additionalPaths: 0,
      strongestPath: [],
      shortestPath: [],
      allPaths: [],
    };
  }

  // Sort by pathScore descending
  const sorted = [...scoredPaths].sort(
    (a, b) => b.score.pathScore - a.score.pathScore,
  );

  const strongestPathScore = sorted[0].score.pathScore;
  const additionalPaths = sorted.length - 1;
  const candidatePathScore =
    strongestPathScore + 0.25 * Math.log(1 + additionalPaths);

  // Shortest path by hop count (fewest nodes), break ties by higher score
  const shortestSorted = [...scoredPaths].sort((a, b) => {
    const lenDiff = a.path.length - b.path.length;
    if (lenDiff !== 0) return lenDiff;
    return b.score.pathScore - a.score.pathScore;
  });

  return {
    candidatePathScore,
    strongestPathScore,
    additionalPaths,
    strongestPath: sorted[0].path,
    shortestPath: shortestSorted[0].path,
    allPaths: scoredPaths,
  };
}

/**
 * Extract the edges along a path from the graph and compute their weights
 * and confidence values.
 */
export function extractPathEdges(
  graph: DirectedGraph,
  path: string[],
): { edgeWeights: number[]; evidenceConfidences: number[] } {
  const edgeWeights: number[] = [];
  const evidenceConfidences: number[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const from = path[i];
    const to = path[i + 1];

    // Check outgoing edges from -> to
    let bestEdge = findBestEdge(graph, from, to);
    // Also check incoming edges (reverse direction in template)
    if (!bestEdge) {
      bestEdge = findBestEdge(graph, to, from);
    }

    if (bestEdge) {
      edgeWeights.push(bestEdge.weight);
      evidenceConfidences.push(
        (bestEdge.attributes.confidence as number) ?? bestEdge.weight,
      );
    } else {
      edgeWeights.push(0);
      evidenceConfidences.push(0);
    }
  }

  return { edgeWeights, evidenceConfidences };
}

/** Find the highest-weight edge between two nodes. */
function findBestEdge(
  graph: DirectedGraph,
  source: string,
  target: string,
): GraphEdge | null {
  const edges = graph.getOutEdges(source).filter((e) => e.target === target);
  if (edges.length === 0) return null;
  return edges.reduce((best, e) => (e.weight > best.weight ? e : best));
}
