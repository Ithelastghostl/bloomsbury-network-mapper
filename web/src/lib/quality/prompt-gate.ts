/**
 * Prompt promotion gate — F12.2-T2.
 * PRD ref: §23.2 — a new extraction prompt version can be promoted only if:
 *
 * 1. Precision stable on gold set (does not decline)
 * 2. Hallucination rate stable (does not increase)
 * 3. Evidence span coverage above threshold
 * 4. Invalid JSON rate below threshold
 * 5. Sample candidate rankings reviewed
 */

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface PromptGateInput {
  /** Current precision on gold set. */
  gold_set_precision: number;
  /** Previous (baseline) precision on gold set. */
  baseline_precision: number;

  /** Current hallucination rate (relationships with no evidence). */
  hallucination_rate: number;
  /** Previous hallucination rate. */
  baseline_hallucination_rate: number;

  /** Current evidence span coverage ratio. */
  evidence_span_coverage: number;

  /** Current invalid JSON rate. */
  invalid_json_rate: number;

  /** Whether sample candidate rankings have been reviewed by a human. */
  rankings_reviewed: boolean;
}

export interface PromptGateCriterion {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
}

export interface PromptGateResult {
  passed: boolean;
  criteria: PromptGateCriterion[];
  failures: string[];
}

// -------------------------------------------------------------------
// Thresholds (from §7.2)
// -------------------------------------------------------------------

/** Evidence span coverage must be above this. */
export const EVIDENCE_COVERAGE_THRESHOLD = 0.95;

/** Invalid JSON rate must be below this. */
export const INVALID_JSON_THRESHOLD = 0.02;

/**
 * Small tolerance for precision/hallucination comparisons.
 * A metric is "stable" if it does not degrade beyond this margin.
 */
export const STABILITY_TOLERANCE = 0.005;

// -------------------------------------------------------------------
// Gate check
// -------------------------------------------------------------------

/**
 * Evaluate all 5 prompt promotion criteria per §23.2.
 * Returns pass/fail for each criterion and an overall result.
 */
export function checkPromptGate(input: PromptGateInput): PromptGateResult {
  const criteria: PromptGateCriterion[] = [];

  // 1. Precision stable on gold set
  const precisionDelta = input.gold_set_precision - input.baseline_precision;
  const precisionStable = precisionDelta >= -STABILITY_TOLERANCE;
  criteria.push({
    id: 'precision_stable',
    name: 'Precision stable on gold set',
    passed: precisionStable,
    detail: precisionStable
      ? `Precision ${input.gold_set_precision.toFixed(3)} vs baseline ${input.baseline_precision.toFixed(3)}`
      : `Precision declined: ${input.gold_set_precision.toFixed(3)} vs baseline ${input.baseline_precision.toFixed(3)} (delta ${precisionDelta.toFixed(3)})`,
  });

  // 2. Hallucination rate stable
  const hallucinationDelta = input.hallucination_rate - input.baseline_hallucination_rate;
  const hallucinationStable = hallucinationDelta <= STABILITY_TOLERANCE;
  criteria.push({
    id: 'hallucination_stable',
    name: 'Hallucination rate stable',
    passed: hallucinationStable,
    detail: hallucinationStable
      ? `Hallucination rate ${input.hallucination_rate.toFixed(3)} vs baseline ${input.baseline_hallucination_rate.toFixed(3)}`
      : `Hallucination rate increased: ${input.hallucination_rate.toFixed(3)} vs baseline ${input.baseline_hallucination_rate.toFixed(3)} (delta +${hallucinationDelta.toFixed(3)})`,
  });

  // 3. Evidence span coverage above threshold
  const coverageOk = input.evidence_span_coverage >= EVIDENCE_COVERAGE_THRESHOLD;
  criteria.push({
    id: 'evidence_coverage',
    name: 'Evidence span coverage above threshold',
    passed: coverageOk,
    detail: coverageOk
      ? `Coverage ${input.evidence_span_coverage.toFixed(3)} >= ${EVIDENCE_COVERAGE_THRESHOLD}`
      : `Coverage ${input.evidence_span_coverage.toFixed(3)} < ${EVIDENCE_COVERAGE_THRESHOLD}`,
  });

  // 4. Invalid JSON rate below threshold
  const jsonOk = input.invalid_json_rate <= INVALID_JSON_THRESHOLD;
  criteria.push({
    id: 'invalid_json_rate',
    name: 'Invalid JSON rate below threshold',
    passed: jsonOk,
    detail: jsonOk
      ? `Invalid JSON rate ${input.invalid_json_rate.toFixed(3)} <= ${INVALID_JSON_THRESHOLD}`
      : `Invalid JSON rate ${input.invalid_json_rate.toFixed(3)} > ${INVALID_JSON_THRESHOLD}`,
  });

  // 5. Sample candidate rankings reviewed
  criteria.push({
    id: 'rankings_reviewed',
    name: 'Sample candidate rankings reviewed',
    passed: input.rankings_reviewed,
    detail: input.rankings_reviewed
      ? 'Rankings have been reviewed'
      : 'Rankings have not been reviewed',
  });

  const failures = criteria.filter(c => !c.passed).map(c => c.name);

  return {
    passed: failures.length === 0,
    criteria,
    failures,
  };
}
