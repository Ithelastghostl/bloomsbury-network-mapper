/**
 * Tests for Epic 10 — Outcome Tracking & Calibration.
 *
 * Covers:
 * - Cold-start threshold logic (below/above 100 decisions, 10 seeds) (F10.1-T3, §18.5)
 * - Cold-start flag application (F10.1-T3)
 * - Calibration gate enforcement (F10.2-T1, §19.1)
 * - Report generation (all sections) (F10.2-T2, §19.2)
 * - Scoring config versioning and promotion gate (F10.2-T3, §23.3)
 * - Quality drift detection (F10.3-T1, R6.6)
 * - Identity resolution failure rates (F10.3-T2, R6.7)
 * - Failure mode breakdown (F10.3-T3, R6.8)
 * - Decision views aggregation (F10.1-T1, R6.1)
 * - Funnel tracking views (F10.1-T2, R6.2)
 *
 * Pure functions — no Supabase required.
 */

import { describe, it, expect } from 'vitest';

import {
  checkColdStartThreshold,
  flagColdStartDecision,
  COLD_START_DECISION_THRESHOLD,
  COLD_START_SEED_THRESHOLD,
} from '@/lib/calibration/cold-start';

import {
  isColdStartComplete,
  enforceCalibrationGate,
  CalibrationGateError,
} from '@/lib/calibration/gate';

import {
  generateCalibrationReport,
} from '@/lib/calibration/report';

import {
  checkPromotionGate,
  PromotionGateError,
  type PromotionGateInput,
} from '@/lib/calibration/scoring-config';

import {
  computeExtractionMetrics,
  computeIdentityMetrics,
  detectExtractionDrift,
  detectIdentityDrift,
  buildReasonCodeBreakdown,
  DRIFT_THRESHOLD,
} from '@/lib/calibration/quality-monitor';

import {
  DECISION_LABELS,
  scoreBandFor,
  aggregateByReasonCode,
  aggregateBySeed,
  aggregateByRun,
  aggregateByScoreBand,
  SCORE_BANDS,
} from '@/lib/calibration/decision-views';

import {
  countFunnelStages,
  buildFunnelSummary,
  aggregateFunnelBySeed,
  FUNNEL_STAGES,
} from '@/lib/calibration/funnel-views';

import type { HumanDecision, IntroOutcome } from '@/types/database';

// ===================================================================
// Helpers
// ===================================================================

function makeDecision(
  overrides: Partial<HumanDecision> & { human_decision_id: string },
): HumanDecision {
  return {
    candidate_recommendation_id: 'cr_001',
    decision: 'qualified',
    reason_code: null,
    notes: null,
    decided_by: 'user_001',
    decided_at: new Date().toISOString(),
    cold_start_decision: false,
    ...overrides,
  };
}

type DecisionWithContext = HumanDecision & {
  candidate_recommendations?: {
    run_id: string;
    seed_id: string;
    priority_score: number;
  };
};

function makeDecisionWithContext(
  overrides: Partial<DecisionWithContext> & { human_decision_id: string },
): DecisionWithContext {
  return {
    ...makeDecision(overrides),
    candidate_recommendations: {
      run_id: 'run_001',
      seed_id: 'seed_001',
      priority_score: 0.5,
      ...overrides.candidate_recommendations,
    },
    ...overrides,
  };
}

function makeOutcome(
  overrides: Partial<IntroOutcome> & { intro_outcome_id: string },
): IntroOutcome {
  return {
    candidate_recommendation_id: 'cr_001',
    seed_id: 'seed_001',
    intro_status: 'made',
    decline_reason: null,
    meeting_at: null,
    converted: null,
    notes: null,
    recorded_by: 'user_001',
    recorded_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeDecisions(count: number, seedCount: number): DecisionWithContext[] {
  const decisions: DecisionWithContext[] = [];
  for (let i = 0; i < count; i++) {
    const seedIndex = i % seedCount;
    decisions.push(
      makeDecisionWithContext({
        human_decision_id: `hd_${i}`,
        candidate_recommendation_id: `cr_${i}`,
        decision: i % 3 === 0 ? 'qualified' : 'rejected_wrong_person',
        reason_code: i % 3 === 0 ? 'qualified' : 'rejected_wrong_person',
        candidate_recommendations: {
          run_id: `run_${Math.floor(i / 20)}`,
          seed_id: `seed_${seedIndex}`,
          priority_score: (i % 10) / 10,
        },
      }),
    );
  }
  return decisions;
}

// ===================================================================
// F10.1-T1: Decision Views (R6.1, §18.10)
// ===================================================================

describe('Decision Views (F10.1-T1, R6.1)', () => {
  it('DECISION_LABELS contains all §18.10 labels', () => {
    expect(DECISION_LABELS).toContain('qualified');
    expect(DECISION_LABELS).toContain('rejected_wrong_person');
    expect(DECISION_LABELS).toContain('rejected_weak_connection');
    expect(DECISION_LABELS).toContain('rejected_bad_fit');
    expect(DECISION_LABELS).toContain('rejected_already_known');
    expect(DECISION_LABELS).toContain('needs_more_research');
    expect(DECISION_LABELS).toContain('intro_requested');
    expect(DECISION_LABELS).toContain('intro_declined');
    expect(DECISION_LABELS).toContain('meeting_booked');
    expect(DECISION_LABELS).toContain('converted');
    expect(DECISION_LABELS).toHaveLength(10);
  });

  it('scoreBandFor maps scores to correct bands', () => {
    expect(scoreBandFor(0.0)).toBe('0.0–0.2');
    expect(scoreBandFor(0.1)).toBe('0.0–0.2');
    expect(scoreBandFor(0.2)).toBe('0.2–0.4');
    expect(scoreBandFor(0.5)).toBe('0.4–0.6');
    expect(scoreBandFor(0.8)).toBe('0.8–1.0');
    expect(scoreBandFor(1.0)).toBe('0.8–1.0');
  });

  it('SCORE_BANDS covers 0 to 1', () => {
    expect(SCORE_BANDS[0].min).toBe(0.0);
    expect(SCORE_BANDS[SCORE_BANDS.length - 1].max).toBeGreaterThan(1.0);
    expect(SCORE_BANDS).toHaveLength(5);
  });

  it('aggregateByReasonCode counts and sorts descending', () => {
    const decisions = [
      makeDecision({ human_decision_id: 'hd_1', decision: 'qualified', reason_code: 'qualified' }),
      makeDecision({ human_decision_id: 'hd_2', decision: 'rejected_bad_fit', reason_code: 'rejected_bad_fit' }),
      makeDecision({ human_decision_id: 'hd_3', decision: 'rejected_bad_fit', reason_code: 'rejected_bad_fit' }),
      makeDecision({ human_decision_id: 'hd_4', decision: 'qualified', reason_code: 'qualified' }),
      makeDecision({ human_decision_id: 'hd_5', decision: 'qualified', reason_code: 'qualified' }),
    ];
    const result = aggregateByReasonCode(decisions);
    expect(result[0].reason_code).toBe('qualified');
    expect(result[0].count).toBe(3);
    expect(result[1].reason_code).toBe('rejected_bad_fit');
    expect(result[1].count).toBe(2);
  });

  it('aggregateByReasonCode uses decision as fallback when reason_code is null', () => {
    const decisions = [
      makeDecision({ human_decision_id: 'hd_1', decision: 'qualified', reason_code: null }),
    ];
    const result = aggregateByReasonCode(decisions);
    expect(result[0].reason_code).toBe('qualified');
    expect(result[0].count).toBe(1);
  });

  it('aggregateBySeed groups correctly', () => {
    const decisions = [
      makeDecisionWithContext({
        human_decision_id: 'hd_1',
        candidate_recommendations: { run_id: 'r1', seed_id: 'seed_A', priority_score: 0.5 },
      }),
      makeDecisionWithContext({
        human_decision_id: 'hd_2',
        candidate_recommendations: { run_id: 'r1', seed_id: 'seed_B', priority_score: 0.5 },
      }),
      makeDecisionWithContext({
        human_decision_id: 'hd_3',
        candidate_recommendations: { run_id: 'r1', seed_id: 'seed_A', priority_score: 0.5 },
      }),
    ];
    const result = aggregateBySeed(decisions);
    const seedA = result.find((s) => s.seed_id === 'seed_A');
    const seedB = result.find((s) => s.seed_id === 'seed_B');
    expect(seedA?.total).toBe(2);
    expect(seedB?.total).toBe(1);
  });

  it('aggregateByRun groups correctly', () => {
    const decisions = [
      makeDecisionWithContext({
        human_decision_id: 'hd_1',
        candidate_recommendations: { run_id: 'run_1', seed_id: 's1', priority_score: 0.5 },
      }),
      makeDecisionWithContext({
        human_decision_id: 'hd_2',
        candidate_recommendations: { run_id: 'run_2', seed_id: 's1', priority_score: 0.5 },
      }),
      makeDecisionWithContext({
        human_decision_id: 'hd_3',
        candidate_recommendations: { run_id: 'run_1', seed_id: 's1', priority_score: 0.5 },
      }),
    ];
    const result = aggregateByRun(decisions);
    const run1 = result.find((r) => r.run_id === 'run_1');
    const run2 = result.find((r) => r.run_id === 'run_2');
    expect(run1?.total).toBe(2);
    expect(run2?.total).toBe(1);
  });

  it('aggregateByScoreBand calculates qualification rates', () => {
    const decisions: DecisionWithContext[] = [
      makeDecisionWithContext({
        human_decision_id: 'hd_1',
        decision: 'qualified',
        candidate_recommendations: { run_id: 'r1', seed_id: 's1', priority_score: 0.85 },
      }),
      makeDecisionWithContext({
        human_decision_id: 'hd_2',
        decision: 'rejected_bad_fit',
        reason_code: 'rejected_bad_fit',
        candidate_recommendations: { run_id: 'r1', seed_id: 's1', priority_score: 0.82 },
      }),
      makeDecisionWithContext({
        human_decision_id: 'hd_3',
        decision: 'qualified',
        candidate_recommendations: { run_id: 'r1', seed_id: 's1', priority_score: 0.15 },
      }),
    ];
    const result = aggregateByScoreBand(decisions);
    const highBand = result.find((b) => b.band === '0.8–1.0');
    expect(highBand?.total).toBe(2);
    expect(highBand?.qualified).toBe(1);
    expect(highBand?.rejected).toBe(1);
    expect(highBand?.qualification_rate).toBe(0.5);

    const lowBand = result.find((b) => b.band === '0.0–0.2');
    expect(lowBand?.total).toBe(1);
    expect(lowBand?.qualified).toBe(1);
    expect(lowBand?.qualification_rate).toBe(1);
  });

  it('aggregateByScoreBand returns 0 rate for empty bands', () => {
    const result = aggregateByScoreBand([]);
    for (const band of result) {
      expect(band.qualification_rate).toBe(0);
      expect(band.total).toBe(0);
    }
  });
});

// ===================================================================
// F10.1-T2: Funnel Tracking Views (R6.2)
// ===================================================================

describe('Funnel Tracking Views (F10.1-T2, R6.2)', () => {
  it('FUNNEL_STAGES contains all stages', () => {
    expect(FUNNEL_STAGES).toContain('intro_requested');
    expect(FUNNEL_STAGES).toContain('intro_made');
    expect(FUNNEL_STAGES).toContain('intro_declined');
    expect(FUNNEL_STAGES).toContain('meeting_booked');
    expect(FUNNEL_STAGES).toContain('converted');
  });

  it('countFunnelStages counts empty outcomes', () => {
    const counts = countFunnelStages([]);
    expect(counts.intro_requested).toBe(0);
    expect(counts.intro_made).toBe(0);
    expect(counts.meeting_booked).toBe(0);
    expect(counts.converted).toBe(0);
  });

  it('countFunnelStages counts intro requests', () => {
    const outcomes = [
      makeOutcome({ intro_outcome_id: 'io_1', intro_status: 'made' }),
      makeOutcome({ intro_outcome_id: 'io_2', intro_status: 'declined' }),
    ];
    const counts = countFunnelStages(outcomes);
    expect(counts.intro_requested).toBe(2);
    expect(counts.intro_made).toBe(1);
    expect(counts.intro_declined).toBe(1);
  });

  it('countFunnelStages counts meetings', () => {
    const outcomes = [
      makeOutcome({ intro_outcome_id: 'io_1', intro_status: 'made', meeting_at: '2026-01-15T10:00:00Z' }),
      makeOutcome({ intro_outcome_id: 'io_2', intro_status: 'made' }),
    ];
    const counts = countFunnelStages(outcomes);
    expect(counts.meeting_booked).toBe(1);
  });

  it('countFunnelStages counts conversions', () => {
    const outcomes = [
      makeOutcome({
        intro_outcome_id: 'io_1',
        intro_status: 'converted',
        meeting_at: '2026-01-15T10:00:00Z',
        converted: true,
      }),
      makeOutcome({ intro_outcome_id: 'io_2', intro_status: 'made', converted: false }),
    ];
    const counts = countFunnelStages(outcomes);
    expect(counts.converted).toBe(1);
  });

  it('buildFunnelSummary calculates conversion rates', () => {
    const outcomes = [
      makeOutcome({ intro_outcome_id: 'io_1', intro_status: 'made', meeting_at: '2026-01-15', converted: true }),
      makeOutcome({ intro_outcome_id: 'io_2', intro_status: 'made', meeting_at: '2026-01-16', converted: false }),
      makeOutcome({ intro_outcome_id: 'io_3', intro_status: 'made' }),
      makeOutcome({ intro_outcome_id: 'io_4', intro_status: 'declined' }),
    ];
    const summary = buildFunnelSummary(50, outcomes);
    expect(summary.total_candidates).toBe(50);
    expect(summary.funnel.intro_requested).toBe(4);
    expect(summary.funnel.intro_made).toBe(3);
    expect(summary.funnel.meeting_booked).toBe(2);
    expect(summary.funnel.converted).toBe(1);
    expect(summary.conversion_rates.request_to_made).toBe(3 / 4);
    expect(summary.conversion_rates.made_to_meeting).toBeCloseTo(2 / 3);
    expect(summary.conversion_rates.meeting_to_converted).toBe(1 / 2);
    expect(summary.conversion_rates.request_to_converted).toBe(1 / 4);
  });

  it('buildFunnelSummary handles zero outcomes', () => {
    const summary = buildFunnelSummary(10, []);
    expect(summary.conversion_rates.request_to_made).toBe(0);
    expect(summary.conversion_rates.request_to_converted).toBe(0);
  });

  it('aggregateFunnelBySeed groups by seed', () => {
    const outcomes = [
      makeOutcome({ intro_outcome_id: 'io_1', seed_id: 'seed_A', intro_status: 'made' }),
      makeOutcome({ intro_outcome_id: 'io_2', seed_id: 'seed_B', intro_status: 'declined' }),
      makeOutcome({ intro_outcome_id: 'io_3', seed_id: 'seed_A', intro_status: 'made', converted: true }),
    ];
    const result = aggregateFunnelBySeed(outcomes);
    const seedA = result.find((s) => s.seed_id === 'seed_A');
    const seedB = result.find((s) => s.seed_id === 'seed_B');
    expect(seedA?.funnel.intro_requested).toBe(2);
    expect(seedA?.funnel.intro_made).toBe(2);
    expect(seedA?.funnel.converted).toBe(1);
    expect(seedB?.funnel.intro_requested).toBe(1);
    expect(seedB?.funnel.intro_declined).toBe(1);
  });
});

// ===================================================================
// F10.1-T3: Cold-Start Decision Handling (§18.5)
// ===================================================================

describe('Cold-Start Threshold (F10.1-T3, §18.5)', () => {
  it('thresholds match §18.5 / §19.1', () => {
    expect(COLD_START_DECISION_THRESHOLD).toBe(100);
    expect(COLD_START_SEED_THRESHOLD).toBe(10);
  });

  it('below both thresholds — cold start not complete', () => {
    const status = checkColdStartThreshold(50, 5);
    expect(status.cold_start_complete).toBe(false);
    expect(status.decisions_met).toBe(false);
    expect(status.seeds_met).toBe(false);
  });

  it('decisions met but seeds not met', () => {
    const status = checkColdStartThreshold(100, 5);
    expect(status.cold_start_complete).toBe(false);
    expect(status.decisions_met).toBe(true);
    expect(status.seeds_met).toBe(false);
  });

  it('seeds met but decisions not met', () => {
    const status = checkColdStartThreshold(50, 10);
    expect(status.cold_start_complete).toBe(false);
    expect(status.decisions_met).toBe(false);
    expect(status.seeds_met).toBe(true);
  });

  it('both thresholds met — cold start complete', () => {
    const status = checkColdStartThreshold(100, 10);
    expect(status.cold_start_complete).toBe(true);
    expect(status.decisions_met).toBe(true);
    expect(status.seeds_met).toBe(true);
  });

  it('well above both thresholds', () => {
    const status = checkColdStartThreshold(500, 25);
    expect(status.cold_start_complete).toBe(true);
  });

  it('exactly at thresholds', () => {
    const status = checkColdStartThreshold(100, 10);
    expect(status.cold_start_complete).toBe(true);
  });

  it('at 99 decisions (below threshold)', () => {
    const status = checkColdStartThreshold(99, 10);
    expect(status.cold_start_complete).toBe(false);
  });

  it('at 9 seeds (below threshold)', () => {
    const status = checkColdStartThreshold(100, 9);
    expect(status.cold_start_complete).toBe(false);
  });

  it('zero decisions and zero seeds', () => {
    const status = checkColdStartThreshold(0, 0);
    expect(status.cold_start_complete).toBe(false);
    expect(status.total_decisions).toBe(0);
    expect(status.distinct_seeds).toBe(0);
  });
});

// ===================================================================
// F10.1-T3: Cold-Start Flag (§18.5)
// ===================================================================

describe('Cold-Start Flag (F10.1-T3, §18.5)', () => {
  it('flags decision as cold-start when below threshold', () => {
    expect(flagColdStartDecision(50, 5)).toBe(true);
  });

  it('does not flag when both thresholds met', () => {
    expect(flagColdStartDecision(100, 10)).toBe(false);
  });

  it('flags when only decisions met', () => {
    expect(flagColdStartDecision(100, 9)).toBe(true);
  });

  it('flags when only seeds met', () => {
    expect(flagColdStartDecision(99, 10)).toBe(true);
  });

  it('flags at 0,0', () => {
    expect(flagColdStartDecision(0, 0)).toBe(true);
  });

  it('does not flag well above threshold', () => {
    expect(flagColdStartDecision(500, 25)).toBe(false);
  });
});

// ===================================================================
// F10.2-T1: Calibration Gate Enforcement (§19.1)
// ===================================================================

describe('Calibration Gate (F10.2-T1, §19.1)', () => {
  it('isColdStartComplete returns allowed=true above threshold', () => {
    const gate = isColdStartComplete(100, 10);
    expect(gate.allowed).toBe(true);
    expect(gate.reason).toBeNull();
  });

  it('isColdStartComplete returns allowed=false below threshold', () => {
    const gate = isColdStartComplete(50, 5);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain('100 decisions');
    expect(gate.reason).toContain('10 distinct seeds');
  });

  it('isColdStartComplete reports only missing criterion', () => {
    const gate = isColdStartComplete(100, 5);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain('10 distinct seeds');
    expect(gate.reason).not.toContain('100 decisions');
  });

  it('enforceCalibrationGate does not throw above threshold', () => {
    expect(() => enforceCalibrationGate(100, 10)).not.toThrow();
  });

  it('enforceCalibrationGate throws CalibrationGateError below threshold', () => {
    expect(() => enforceCalibrationGate(50, 5)).toThrow(CalibrationGateError);
  });

  it('CalibrationGateError has correct name', () => {
    try {
      enforceCalibrationGate(0, 0);
    } catch (e) {
      expect(e).toBeInstanceOf(CalibrationGateError);
      expect((e as CalibrationGateError).name).toBe('CalibrationGateError');
    }
  });

  it('CalibrationGateError message is descriptive', () => {
    try {
      enforceCalibrationGate(50, 3);
    } catch (e) {
      expect((e as Error).message).toContain('Calibration gate not met');
    }
  });
});

// ===================================================================
// F10.2-T2: Calibration Report (§19.2)
// ===================================================================

describe('Calibration Report (F10.2-T2, §19.2)', () => {
  it('throws when cold-start threshold not met', () => {
    const decisions = makeDecisions(50, 5);
    expect(() => generateCalibrationReport(decisions, 5)).toThrow(CalibrationGateError);
  });

  it('generates report when threshold is met', () => {
    const decisions = makeDecisions(120, 15);
    const report = generateCalibrationReport(decisions, 15);
    expect(report.total_decisions).toBe(120);
    expect(report.distinct_seeds).toBe(15);
    expect(report.generated_at).toBeDefined();
  });

  it('report contains rejection reason distribution', () => {
    const decisions = makeDecisions(100, 10);
    const report = generateCalibrationReport(decisions, 10);
    expect(report.rejection_reason_distribution.length).toBeGreaterThan(0);
    // Our test data has 'qualified' and 'rejected_wrong_person'
    const reasons = report.rejection_reason_distribution.map((r) => r.reason_code);
    expect(reasons).toContain('qualified');
    expect(reasons).toContain('rejected_wrong_person');
  });

  it('report contains score band qualification rates', () => {
    const decisions = makeDecisions(100, 10);
    const report = generateCalibrationReport(decisions, 10);
    expect(report.score_band_qualification).toHaveLength(5);
    for (const band of report.score_band_qualification) {
      expect(band.band).toBeDefined();
      expect(typeof band.qualification_rate).toBe('number');
    }
  });

  it('report contains false positive causes', () => {
    const decisions = makeDecisions(100, 10);
    const report = generateCalibrationReport(decisions, 10);
    expect(report.false_positive_causes).toBeDefined();
    // Our test data includes rejected_wrong_person
    if (report.false_positive_causes.length > 0) {
      expect(report.false_positive_causes[0].reason_code).toBe('rejected_wrong_person');
      expect(report.false_positive_causes[0].percentage).toBeGreaterThan(0);
    }
  });

  it('report false positive percentages sum to 1', () => {
    const decisions = makeDecisions(100, 10);
    const report = generateCalibrationReport(decisions, 10);
    if (report.false_positive_causes.length > 0) {
      const totalPct = report.false_positive_causes.reduce((s, c) => s + c.percentage, 0);
      expect(totalPct).toBeCloseTo(1.0, 5);
    }
  });

  it('report at exactly the threshold', () => {
    const decisions = makeDecisions(100, 10);
    const report = generateCalibrationReport(decisions, 10);
    expect(report.total_decisions).toBe(100);
    expect(report.distinct_seeds).toBe(10);
  });
});

// ===================================================================
// F10.2-T3: Scoring Config Promotion Gate (§23.3)
// ===================================================================

describe('Scoring Config Promotion Gate (F10.2-T3, §23.3)', () => {
  const validInput: PromotionGateInput = {
    ranking_quality_ok: true,
    false_positive_rate_ok: true,
    top_candidates_explainable: true,
    config_version: 'scoring_v2',
    rationale: 'Improved weights after calibration cycle 1',
  };

  it('passes when all checks are satisfied', () => {
    const result = checkPromotionGate(validInput);
    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it('fails when ranking quality is not ok', () => {
    const result = checkPromotionGate({ ...validInput, ranking_quality_ok: false });
    expect(result.passed).toBe(false);
    expect(result.failures).toContain('Validation seed ranking quality degraded');
  });

  it('fails when false positive rate is not ok', () => {
    const result = checkPromotionGate({ ...validInput, false_positive_rate_ok: false });
    expect(result.passed).toBe(false);
    expect(result.failures).toContain('False positive rate materially increased');
  });

  it('fails when top candidates are not explainable', () => {
    const result = checkPromotionGate({ ...validInput, top_candidates_explainable: false });
    expect(result.passed).toBe(false);
    expect(result.failures).toContain('Top candidates are not explainable');
  });

  it('fails when config_version is missing', () => {
    const result = checkPromotionGate({ ...validInput, config_version: '' });
    expect(result.passed).toBe(false);
    expect(result.failures).toContain('Config version is required');
  });

  it('fails when rationale is missing', () => {
    const result = checkPromotionGate({ ...validInput, rationale: '' });
    expect(result.passed).toBe(false);
    expect(result.failures).toContain('Rationale is required');
  });

  it('accumulates all failures', () => {
    const result = checkPromotionGate({
      ranking_quality_ok: false,
      false_positive_rate_ok: false,
      top_candidates_explainable: false,
      config_version: '',
      rationale: '',
    });
    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(5);
  });

  it('PromotionGateError has failures array', () => {
    const err = new PromotionGateError(['failure 1', 'failure 2']);
    expect(err.failures).toHaveLength(2);
    expect(err.name).toBe('PromotionGateError');
    expect(err.message).toContain('failure 1');
    expect(err.message).toContain('failure 2');
  });
});

// ===================================================================
// F10.3-T1: Quality Drift Detection (R6.6)
// ===================================================================

describe('Extraction Quality Drift (F10.3-T1, R6.6)', () => {
  it('DRIFT_THRESHOLD is 5%', () => {
    expect(DRIFT_THRESHOLD).toBe(0.05);
  });

  it('computeExtractionMetrics calculates success rate', () => {
    const m = computeExtractionMetrics('run_1', 100, 90, 10, 5, 0.85);
    expect(m.success_rate).toBe(0.9);
    expect(m.total_extractions).toBe(100);
    expect(m.avg_confidence).toBe(0.85);
  });

  it('computeExtractionMetrics handles zero total', () => {
    const m = computeExtractionMetrics('run_1', 0, 0, 0, 0, 0);
    expect(m.success_rate).toBe(0);
  });

  it('detectExtractionDrift reports no drift with null previous', () => {
    const current = computeExtractionMetrics('run_1', 100, 90, 10, 5, 0.85);
    const result = detectExtractionDrift(current, null);
    expect(result.drift.drifted).toBe(false);
    expect(result.drift.success_rate_delta).toBeNull();
    expect(result.previous).toBeNull();
  });

  it('detectExtractionDrift detects significant success rate drop', () => {
    const previous = computeExtractionMetrics('run_1', 100, 95, 5, 0, 0.90);
    const current = computeExtractionMetrics('run_2', 100, 80, 20, 5, 0.88);
    const result = detectExtractionDrift(current, previous);
    expect(result.drift.drifted).toBe(true);
    expect(result.drift.success_rate_delta).toBeCloseTo(-0.15);
  });

  it('detectExtractionDrift does not flag small changes', () => {
    const previous = computeExtractionMetrics('run_1', 100, 92, 8, 0, 0.85);
    const current = computeExtractionMetrics('run_2', 100, 90, 10, 0, 0.84);
    const result = detectExtractionDrift(current, previous);
    expect(result.drift.drifted).toBe(false);
  });

  it('detectExtractionDrift detects confidence drift', () => {
    const previous = computeExtractionMetrics('run_1', 100, 90, 10, 0, 0.90);
    const current = computeExtractionMetrics('run_2', 100, 90, 10, 0, 0.80);
    const result = detectExtractionDrift(current, previous);
    expect(result.drift.drifted).toBe(true);
    expect(result.drift.avg_confidence_delta).toBeCloseTo(-0.10);
  });
});

// ===================================================================
// F10.3-T2: Identity Resolution Failure Rates (R6.7)
// ===================================================================

describe('Identity Resolution Failure Rates (F10.3-T2, R6.7)', () => {
  it('computeIdentityMetrics calculates false match rate', () => {
    const m = computeIdentityMetrics('run_1', 50, 0.8, 5, 3);
    expect(m.false_match_rate).toBe(3 / 50);
    expect(m.total_clusters).toBe(50);
    expect(m.low_confidence_clusters).toBe(5);
  });

  it('computeIdentityMetrics handles zero clusters', () => {
    const m = computeIdentityMetrics('run_1', 0, 0, 0, 0);
    expect(m.false_match_rate).toBe(0);
  });

  it('detectIdentityDrift reports no drift with null previous', () => {
    const current = computeIdentityMetrics('run_1', 50, 0.85, 3, 2);
    const result = detectIdentityDrift(current, null);
    expect(result.drift.drifted).toBe(false);
    expect(result.drift.false_match_rate_delta).toBeNull();
  });

  it('detectIdentityDrift detects false match rate increase', () => {
    const previous = computeIdentityMetrics('run_1', 100, 0.85, 5, 2);
    const current = computeIdentityMetrics('run_2', 100, 0.84, 8, 10);
    const result = detectIdentityDrift(current, previous);
    expect(result.drift.drifted).toBe(true);
    expect(result.drift.false_match_rate_delta!).toBeGreaterThan(DRIFT_THRESHOLD);
  });

  it('detectIdentityDrift does not flag small changes', () => {
    const previous = computeIdentityMetrics('run_1', 100, 0.85, 5, 2);
    const current = computeIdentityMetrics('run_2', 100, 0.84, 6, 3);
    const result = detectIdentityDrift(current, previous);
    expect(result.drift.drifted).toBe(false);
  });
});

// ===================================================================
// F10.3-T3: Failure Mode Breakdown (R6.8)
// ===================================================================

describe('Failure Mode Breakdown (F10.3-T3, R6.8)', () => {
  it('buildReasonCodeBreakdown aggregates reason codes', () => {
    const rejections = [
      { reason_code: 'rejected_wrong_person' },
      { reason_code: 'rejected_weak_connection' },
      { reason_code: 'rejected_wrong_person' },
      { reason_code: 'rejected_bad_fit' },
      { reason_code: 'rejected_wrong_person' },
    ];
    const result = buildReasonCodeBreakdown('run_1', rejections);
    expect(result.run_id).toBe('run_1');
    expect(result.total_failures).toBe(5);
    expect(result.reason_codes[0].reason_code).toBe('rejected_wrong_person');
    expect(result.reason_codes[0].count).toBe(3);
    expect(result.reason_codes[1].count).toBe(1);
  });

  it('buildReasonCodeBreakdown sorts by count descending', () => {
    const rejections = [
      { reason_code: 'a' },
      { reason_code: 'b' },
      { reason_code: 'b' },
      { reason_code: 'c' },
      { reason_code: 'c' },
      { reason_code: 'c' },
    ];
    const result = buildReasonCodeBreakdown('run_1', rejections);
    expect(result.reason_codes[0].reason_code).toBe('c');
    expect(result.reason_codes[0].count).toBe(3);
    expect(result.reason_codes[1].reason_code).toBe('b');
    expect(result.reason_codes[1].count).toBe(2);
    expect(result.reason_codes[2].reason_code).toBe('a');
    expect(result.reason_codes[2].count).toBe(1);
  });

  it('buildReasonCodeBreakdown handles empty input', () => {
    const result = buildReasonCodeBreakdown('run_1', []);
    expect(result.total_failures).toBe(0);
    expect(result.reason_codes).toHaveLength(0);
  });

  it('buildReasonCodeBreakdown handles single reason code', () => {
    const result = buildReasonCodeBreakdown('run_1', [{ reason_code: 'rejected_bad_fit' }]);
    expect(result.total_failures).toBe(1);
    expect(result.reason_codes).toHaveLength(1);
    expect(result.reason_codes[0].reason_code).toBe('rejected_bad_fit');
  });
});

// ===================================================================
// API Route Structure Validation
// ===================================================================

describe('API Route Structure', () => {
  it('scoring-configs route exports POST and GET', async () => {
    const route = await import('@/app/api/scoring-configs/route');
    expect(route.POST).toBeDefined();
    expect(typeof route.POST).toBe('function');
    expect(route.GET).toBeDefined();
    expect(typeof route.GET).toBe('function');
  });

  it('scoring-configs promote route exports POST', async () => {
    const route = await import(
      '@/app/api/scoring-configs/[config_id]/promote/route'
    );
    expect(route.POST).toBeDefined();
    expect(typeof route.POST).toBe('function');
  });
});
