/**
 * Edge weight calculation per §15.7 and Appendix A.
 *
 * edge_weight = relationship_strength x evidence_confidence x freshness_decay x source_reliability
 */

// Appendix A.1 — Edge Base Strengths
const BASE_STRENGTHS: Record<string, number> = {
  TRUSTEE_OF: 1.0,
  DIRECTOR_OF: 0.9,
  MADE_DONATION: 0.85,
  RECEIVED_BY: 0.85,
  SHARES_AFFILIATION_WITH: 0.8,
  REGISTERED_AT: 0.3,
  CO_OCCURS_WITH: 0.2,
  MENTIONED_IN: 0.2,
};

// Appendix A.2 — Freshness Decay
const FRESHNESS_BRACKETS: { maxAge: number; multiplier: number }[] = [
  { maxAge: 2, multiplier: 1.0 },
  { maxAge: 5, multiplier: 0.75 },
  { maxAge: 10, multiplier: 0.5 },
  { maxAge: Infinity, multiplier: 0.25 },
];

const UNKNOWN_DATE_MULTIPLIER = 0.6;

export interface EdgeWeightInput {
  relationshipType: string;
  evidenceConfidence: number;
  sourceReliability: number;
  /** Year of the relationship evidence; null if unknown. */
  evidenceYear: number | null;
  /** Reference year for freshness calculation (defaults to current year). */
  referenceYear?: number;
}

export interface EdgeWeightResult {
  edgeWeight: number;
  relationshipStrength: number;
  freshnessMultiplier: number;
  evidenceConfidence: number;
  sourceReliability: number;
}

/**
 * Calculate the freshness multiplier based on evidence age (Appendix A.2).
 */
export function calculateFreshnessMultiplier(
  evidenceYear: number | null,
  referenceYear?: number,
): number {
  if (evidenceYear === null || evidenceYear === undefined) {
    return UNKNOWN_DATE_MULTIPLIER;
  }

  const ref = referenceYear ?? new Date().getFullYear();
  const age = ref - evidenceYear;

  for (const bracket of FRESHNESS_BRACKETS) {
    if (age <= bracket.maxAge) {
      return bracket.multiplier;
    }
  }

  return FRESHNESS_BRACKETS[FRESHNESS_BRACKETS.length - 1].multiplier;
}

/**
 * Get the base relationship strength for an edge type (Appendix A.1).
 * Returns 0.2 for unrecognised types.
 */
export function getBaseStrength(relationshipType: string): number {
  return BASE_STRENGTHS[relationshipType] ?? 0.2;
}

/**
 * Calculate edge weight per §15.7:
 * edge_weight = relationship_strength x evidence_confidence x freshness_decay x source_reliability
 */
export function calculateEdgeWeight(input: EdgeWeightInput): EdgeWeightResult {
  const relationshipStrength = getBaseStrength(input.relationshipType);
  const freshnessMultiplier = calculateFreshnessMultiplier(
    input.evidenceYear,
    input.referenceYear,
  );

  const edgeWeight =
    relationshipStrength *
    input.evidenceConfidence *
    freshnessMultiplier *
    input.sourceReliability;

  return {
    edgeWeight,
    relationshipStrength,
    freshnessMultiplier,
    evidenceConfidence: input.evidenceConfidence,
    sourceReliability: input.sourceReliability,
  };
}
