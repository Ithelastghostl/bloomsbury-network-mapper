/**
 * Evidence confidence score per PRD §18.2, Appendix A.3.
 *
 * confidence_score =
 *   0.35 x identity_confidence
 * + 0.30 x relationship_confidence
 * + 0.20 x source_corroboration_score
 * + 0.15 x freshness_score
 */

/** Weights per §18.2 / Appendix A.3 */
export const CONFIDENCE_WEIGHTS = {
  identity: 0.35,
  relationship: 0.30,
  source_corroboration: 0.20,
  freshness: 0.15,
} as const;

export interface ConfidenceInput {
  /** Identity resolution confidence (0-1) */
  identityConfidence: number;
  /** Relationship evidence confidence (0-1) */
  relationshipConfidence: number;
  /** Source corroboration — multiple independent sources (0-1) */
  sourceCorroborationScore: number;
  /** Freshness of evidence per Appendix A.2 (0-1) */
  freshnessScore: number;
}

export interface ConfidenceScoreBreakdown {
  identity: { raw: number; weighted: number };
  relationship: { raw: number; weighted: number };
  source_corroboration: { raw: number; weighted: number };
  freshness: { raw: number; weighted: number };
}

export interface ConfidenceResult {
  /** Final confidence score (0-1) */
  score: number;
  /** Per-component breakdown */
  breakdown: ConfidenceScoreBreakdown;
}

/**
 * Calculate evidence confidence score per §18.2.
 * All inputs should be normalized 0-1.
 */
export function calculateConfidenceScore(input: ConfidenceInput): ConfidenceResult {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));

  const identity = clamp(input.identityConfidence);
  const relationship = clamp(input.relationshipConfidence);
  const corroboration = clamp(input.sourceCorroborationScore);
  const freshness = clamp(input.freshnessScore);

  const breakdown: ConfidenceScoreBreakdown = {
    identity: { raw: identity, weighted: CONFIDENCE_WEIGHTS.identity * identity },
    relationship: { raw: relationship, weighted: CONFIDENCE_WEIGHTS.relationship * relationship },
    source_corroboration: { raw: corroboration, weighted: CONFIDENCE_WEIGHTS.source_corroboration * corroboration },
    freshness: { raw: freshness, weighted: CONFIDENCE_WEIGHTS.freshness * freshness },
  };

  const score =
    breakdown.identity.weighted +
    breakdown.relationship.weighted +
    breakdown.source_corroboration.weighted +
    breakdown.freshness.weighted;

  return {
    score: Math.min(1, Math.max(0, score)),
    breakdown,
  };
}
