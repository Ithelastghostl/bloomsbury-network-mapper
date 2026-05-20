/**
 * Extraction and ranking quality thresholds — F2.2-T5.
 * PRD ref: §7.2, §7.4, R0.7 — define starting quality targets.
 *
 * All thresholds are from PRD §7.2 and §7.4 tables.
 */

// -------------------------------------------------------------------
// Threshold definitions
// -------------------------------------------------------------------

export interface QualityThreshold {
  id: string;
  name: string;
  /** PRD reference for traceability. */
  prd_ref: string;
  target: number;
  /** true = pass when value >= target; false = pass when value <= target. */
  pass_when_above: boolean;
}

export const QUALITY_THRESHOLDS: QualityThreshold[] = [
  {
    id: 'extraction_precision',
    name: 'Entity extraction precision',
    prd_ref: '§7.2',
    target: 0.90,
    pass_when_above: true,
  },
  {
    id: 'extraction_recall',
    name: 'Entity extraction recall',
    prd_ref: '§7.2',
    target: 0.85,
    pass_when_above: true,
  },
  {
    id: 'invalid_json_rate',
    name: 'Invalid JSON rate',
    prd_ref: '§7.2',
    target: 0.02,
    pass_when_above: false,
  },
  {
    id: 'evidence_span_coverage',
    name: 'Evidence span coverage',
    prd_ref: '§7.2',
    target: 0.95,
    pass_when_above: true,
  },
  {
    id: 'identity_resolution_accuracy',
    name: 'Identity cluster stability across runs',
    prd_ref: '§7.4',
    target: 0.95,
    pass_when_above: true,
  },
  {
    id: 'false_positive_rate',
    name: 'Hallucinated relationship rate',
    prd_ref: '§7.2',
    target: 0.05,
    pass_when_above: false,
  },
];

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface ThresholdInput {
  id: string;
  value: number;
}

export interface ThresholdResult {
  id: string;
  name: string;
  target: number;
  actual: number;
  passed: boolean;
}

export interface ThresholdCheckOutput {
  results: ThresholdResult[];
  all_passed: boolean;
  failed_count: number;
}

// -------------------------------------------------------------------
// Check thresholds
// -------------------------------------------------------------------

/**
 * Check a set of metric values against quality thresholds.
 * Only thresholds with a matching input are evaluated.
 * Returns per-threshold pass/fail and an overall result.
 */
export function checkThresholds(inputs: ThresholdInput[]): ThresholdCheckOutput {
  const inputMap = new Map(inputs.map(i => [i.id, i.value]));
  const results: ThresholdResult[] = [];

  for (const threshold of QUALITY_THRESHOLDS) {
    const value = inputMap.get(threshold.id);
    if (value === undefined) continue;

    const passed = threshold.pass_when_above
      ? value >= threshold.target
      : value <= threshold.target;

    results.push({
      id: threshold.id,
      name: threshold.name,
      target: threshold.target,
      actual: value,
      passed,
    });
  }

  const failedCount = results.filter(r => !r.passed).length;

  return {
    results,
    all_passed: failedCount === 0,
    failed_count: failedCount,
  };
}
