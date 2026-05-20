/**
 * Candidate priority score per PRD §18.1, Appendix A.3.
 *
 * priority_score =
 *   0.30 x introability_score
 * + 0.25 x affinity_score
 * + 0.20 x capacity_signal_score
 * + 0.15 x influence_score
 * + 0.10 x strategic_fit_score
 */

/** Weights per §18.1 / Appendix A.3 */
export const PRIORITY_WEIGHTS = {
  introability: 0.30,
  affinity: 0.25,
  capacity_signal: 0.20,
  influence: 0.15,
  strategic_fit: 0.10,
} as const;

export interface PriorityInput {
  /** How introducible the candidate is (0-1) */
  introabilityScore: number;
  /** Affinity / shared interest alignment (0-1) */
  affinityScore: number;
  /** Capacity signal from §18.3 (0-1) */
  capacitySignalScore: number;
  /** Influence / network centrality (0-1) */
  influenceScore: number;
  /** Strategic fit to ICP (0-1) */
  strategicFitScore: number;
}

export interface PriorityScoreBreakdown {
  introability: { raw: number; weighted: number };
  affinity: { raw: number; weighted: number };
  capacity_signal: { raw: number; weighted: number };
  influence: { raw: number; weighted: number };
  strategic_fit: { raw: number; weighted: number };
}

export interface PriorityResult {
  /** Final priority score (0-1) */
  score: number;
  /** Per-component breakdown */
  breakdown: PriorityScoreBreakdown;
}

/**
 * Calculate candidate priority score per §18.1.
 * All inputs should be normalized 0-1.
 */
export function calculatePriorityScore(input: PriorityInput): PriorityResult {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));

  const introability = clamp(input.introabilityScore);
  const affinity = clamp(input.affinityScore);
  const capacity = clamp(input.capacitySignalScore);
  const influence = clamp(input.influenceScore);
  const strategicFit = clamp(input.strategicFitScore);

  const breakdown: PriorityScoreBreakdown = {
    introability: { raw: introability, weighted: PRIORITY_WEIGHTS.introability * introability },
    affinity: { raw: affinity, weighted: PRIORITY_WEIGHTS.affinity * affinity },
    capacity_signal: { raw: capacity, weighted: PRIORITY_WEIGHTS.capacity_signal * capacity },
    influence: { raw: influence, weighted: PRIORITY_WEIGHTS.influence * influence },
    strategic_fit: { raw: strategicFit, weighted: PRIORITY_WEIGHTS.strategic_fit * strategicFit },
  };

  const score =
    breakdown.introability.weighted +
    breakdown.affinity.weighted +
    breakdown.capacity_signal.weighted +
    breakdown.influence.weighted +
    breakdown.strategic_fit.weighted;

  return {
    score: Math.min(1, Math.max(0, score)),
    breakdown,
  };
}
