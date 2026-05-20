/**
 * Extraction regression test suite — F3.4-T4.
 * PRD ref: §7.2, §23.2 — compare extraction output against gold set baseline,
 * detect regressions, and gate deployment.
 */

import {
  compareGoldSet,
  type ExtractionResult,
  type GoldLabel,
  type GoldSetComparisonResult,
} from './gold-set-comparison';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface BaselineScores {
  precision: number;
  recall: number;
  f1: number;
}

export interface RegressionResult {
  current: GoldSetComparisonResult;
  baseline: BaselineScores;
  regressions: RegressionDetail[];
  passed: boolean;
}

export interface RegressionDetail {
  metric: 'precision' | 'recall' | 'f1';
  baseline_value: number;
  current_value: number;
  delta: number;
  /** A drop exceeding the tolerance triggers a regression. */
  tolerance: number;
}

// -------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------

/**
 * Default regression tolerance. A drop of more than this amount
 * (absolute) from baseline triggers a regression.
 */
export const DEFAULT_REGRESSION_TOLERANCE = 0.02;

// -------------------------------------------------------------------
// Core regression detection
// -------------------------------------------------------------------

/**
 * Compare current extraction results against a gold-set baseline.
 * Detects precision drops, recall drops, and F1 drops beyond tolerance.
 */
export function detectRegression(
  extracted: ExtractionResult[],
  goldLabels: GoldLabel[],
  baseline: BaselineScores,
  tolerance: number = DEFAULT_REGRESSION_TOLERANCE,
): RegressionResult {
  const current = compareGoldSet(extracted, goldLabels);
  const regressions: RegressionDetail[] = [];

  const checks: { metric: 'precision' | 'recall' | 'f1'; baseVal: number; curVal: number }[] = [
    { metric: 'precision', baseVal: baseline.precision, curVal: current.aggregate.precision },
    { metric: 'recall', baseVal: baseline.recall, curVal: current.aggregate.recall },
    { metric: 'f1', baseVal: baseline.f1, curVal: current.aggregate.f1 },
  ];

  for (const check of checks) {
    const delta = check.curVal - check.baseVal;
    if (delta < -tolerance) {
      regressions.push({
        metric: check.metric,
        baseline_value: check.baseVal,
        current_value: check.curVal,
        delta,
        tolerance,
      });
    }
  }

  return {
    current,
    baseline,
    regressions,
    passed: regressions.length === 0,
  };
}

/**
 * Gate deployment based on regression results.
 * Throws if any regression is detected.
 */
export function gateDeployment(result: RegressionResult): void {
  if (!result.passed) {
    const details = result.regressions
      .map(r => `${r.metric}: ${r.baseline_value.toFixed(3)} -> ${r.current_value.toFixed(3)} (delta ${r.delta.toFixed(3)}, tolerance ${r.tolerance})`)
      .join('; ');
    throw new RegressionGateError(details, result.regressions);
  }
}

// -------------------------------------------------------------------
// Error class
// -------------------------------------------------------------------

export class RegressionGateError extends Error {
  public regressions: RegressionDetail[];
  constructor(details: string, regressions: RegressionDetail[]) {
    super(`Extraction regression detected: ${details}`);
    this.name = 'RegressionGateError';
    this.regressions = regressions;
  }
}
