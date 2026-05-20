/**
 * Calibration report generation per §19.2.
 * PRD ref: §19.2, R6.4.
 *
 * Report includes:
 * - Rejection reason distribution
 * - Score band vs. qualification rate
 * - False positive causes
 *
 * Only generated when cold-start threshold is met.
 */

import { enforceCalibrationGate } from './gate';
import {
  aggregateByReasonCode,
  aggregateByScoreBand,
  type ReasonCodeCount,
  type ScoreBandDecisionSummary,
} from './decision-views';
import type { HumanDecision } from '@/types/database';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface FalsePositiveCause {
  reason_code: string;
  count: number;
  percentage: number;
}

export interface CalibrationReport {
  generated_at: string;
  total_decisions: number;
  distinct_seeds: number;
  rejection_reason_distribution: ReasonCodeCount[];
  score_band_qualification: ScoreBandDecisionSummary[];
  false_positive_causes: FalsePositiveCause[];
}

// -------------------------------------------------------------------
// False positive identification
// -------------------------------------------------------------------

/** Rejection reason codes that indicate false positives (surfaced but shouldn't have been). */
const FALSE_POSITIVE_REASONS = [
  'rejected_wrong_person',
  'rejected_weak_connection',
  'rejected_bad_fit',
  'rejected_already_known',
] as const;

function isFalsePositiveReason(reason: string): boolean {
  return (FALSE_POSITIVE_REASONS as readonly string[]).includes(reason);
}

// -------------------------------------------------------------------
// Report generation
// -------------------------------------------------------------------

interface DecisionWithContext extends HumanDecision {
  candidate_recommendations?: {
    run_id: string;
    seed_id: string;
    priority_score: number;
  };
}

/**
 * Generate a calibration report.
 * Throws CalibrationGateError if the cold-start threshold is not met.
 */
export function generateCalibrationReport(
  decisions: DecisionWithContext[],
  distinctSeeds: number,
): CalibrationReport {
  // Enforce gate — §19.1
  enforceCalibrationGate(decisions.length, distinctSeeds);

  // 1. Rejection reason distribution
  const rejectionReasons = aggregateByReasonCode(decisions);

  // 2. Score band vs qualification rate
  const scoreBandQualification = aggregateByScoreBand(decisions);

  // 3. False positive causes — subset of rejections
  const falsePositiveDecisions = decisions.filter(
    (d) => isFalsePositiveReason(d.reason_code ?? '') || isFalsePositiveReason(d.decision),
  );
  const fpByReason = aggregateByReasonCode(falsePositiveDecisions);
  const totalFP = falsePositiveDecisions.length;
  const falsePositiveCauses: FalsePositiveCause[] = fpByReason.map((r) => ({
    reason_code: r.reason_code,
    count: r.count,
    percentage: totalFP > 0 ? r.count / totalFP : 0,
  }));

  return {
    generated_at: new Date().toISOString(),
    total_decisions: decisions.length,
    distinct_seeds: distinctSeeds,
    rejection_reason_distribution: rejectionReasons,
    score_band_qualification: scoreBandQualification,
    false_positive_causes: falsePositiveCauses,
  };
}
