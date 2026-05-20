/**
 * Seed Quality Score — F7.3-T6
 * PRD ref: §16.4
 *
 * seed_quality_score =
 *   0.30 * strong_edge_count_score
 * + 0.25 * recent_edge_score
 * + 0.20 * affiliation_count_score
 * + 0.15 * historical_intro_success_score
 * + 0.10 * identity_confidence_score
 *
 * Behaviour bands:
 *   >= 0.70 — normal discovery
 *   0.40–0.69 — show warning, normal output
 *   < 0.40 — cap at top 25, require higher confidence, block Tier 2/3
 */

export interface SeedQualityInput {
  /** Score 0-1: proportion of edges with weight >= 0.5 */
  strongEdgeCountScore: number;
  /** Score 0-1: proportion of edges from last 3 years */
  recentEdgeScore: number;
  /** Score 0-1: normalised count of distinct affiliations */
  affiliationCountScore: number;
  /** Score 0-1: historical intro success rate (0 if no data) */
  historicalIntroSuccessScore: number;
  /** Score 0-1: identity resolution confidence for the seed entity */
  identityConfidenceScore: number;
}

export type SeedQualityBand = 'normal' | 'warning' | 'low_quality';

export interface SeedQualityResult {
  score: number;
  band: SeedQualityBand;
  /** Maximum candidates to return (null = no cap) */
  candidateCap: number | null;
  /** Minimum confidence required for candidates */
  minConfidence: number;
  /** Whether Tier 2/3 enrichment is blocked without manual approval */
  enrichmentBlocked: boolean;
}

const WEIGHTS = {
  strongEdgeCount: 0.30,
  recentEdge: 0.25,
  affiliationCount: 0.20,
  historicalIntroSuccess: 0.15,
  identityConfidence: 0.10,
} as const;

/**
 * Calculate seed quality score per §16.4 formula.
 */
export function calculateSeedQuality(input: SeedQualityInput): SeedQualityResult {
  const score =
    WEIGHTS.strongEdgeCount * clamp01(input.strongEdgeCountScore) +
    WEIGHTS.recentEdge * clamp01(input.recentEdgeScore) +
    WEIGHTS.affiliationCount * clamp01(input.affiliationCountScore) +
    WEIGHTS.historicalIntroSuccess * clamp01(input.historicalIntroSuccessScore) +
    WEIGHTS.identityConfidence * clamp01(input.identityConfidenceScore);

  const rounded = Math.round(score * 1000) / 1000;

  if (rounded >= 0.70) {
    return {
      score: rounded,
      band: 'normal',
      candidateCap: null,
      minConfidence: 0.40,
      enrichmentBlocked: false,
    };
  }

  if (rounded >= 0.40) {
    return {
      score: rounded,
      band: 'warning',
      candidateCap: null,
      minConfidence: 0.40,
      enrichmentBlocked: false,
    };
  }

  return {
    score: rounded,
    band: 'low_quality',
    candidateCap: 25,
    minConfidence: 0.60,
    enrichmentBlocked: true,
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
