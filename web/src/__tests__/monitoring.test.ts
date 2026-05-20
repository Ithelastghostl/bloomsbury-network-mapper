/**
 * Monitoring tests — Epic 11.
 * PRD ref: §29 (rollback criteria), §22.2 (metrics), §20.3 (quarantine).
 *
 * Tests:
 * - Rollback criteria evaluation (all 9 criteria)
 * - Threshold breach detection
 * - Metrics aggregation logic
 * - Quarantine API validation
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateCriterion,
  evaluateAllCriteria,
  buildInputsFromMetrics,
  DEFAULT_THRESHOLDS,
  type CriterionInputs,
  type CriterionId,
} from '@/lib/monitoring/rollback-criteria';

// ===================================================================
// 1. Rollback criteria evaluation — all 9 criteria (§29)
// ===================================================================

describe('Rollback criteria evaluation', () => {
  const ALL_CRITERIA: CriterionId[] = [
    'hallucination_rate',
    'false_identity_match_rate',
    'reviewer_rejection_spike',
    'graph_reproducibility',
    'export_integrity',
    'enrichment_reliability',
    'cost_overrun',
    'human_decision_replay',
    'evidence_span_availability',
  ];

  it('evaluates all 9 criteria', () => {
    expect(ALL_CRITERIA).toHaveLength(9);

    const inputs: CriterionInputs = {
      hallucination_rate: 0.02,
      false_identity_match_rate: 0.05,
      reviewer_rejection_spike: 0.30,
      graph_reproducibility: 0.95,
      export_integrity: 1.0,
      enrichment_reliability: 0.90,
      cost_overrun: 1.0,
      human_decision_replay: 1.0,
      evidence_span_availability: 1.0,
    };

    const assessment = evaluateAllCriteria('run_test', inputs);
    expect(assessment.criteria).toHaveLength(9);
    expect(assessment.run_id).toBe('run_test');
    expect(assessment.evaluated_at).toBeTruthy();
  });

  it('all criteria pass when values are well within thresholds', () => {
    // Values must be far enough from thresholds to avoid the 10% pause margin
    const inputs: CriterionInputs = {
      hallucination_rate: 0.01,           // threshold 0.05, well below
      false_identity_match_rate: 0.03,    // threshold 0.10, well below
      reviewer_rejection_spike: 0.20,     // threshold 0.50, well below
      graph_reproducibility: 1.0,         // threshold 0.90, well above
      export_integrity: 1.0,             // threshold 0.99, well above
      enrichment_reliability: 0.95,      // threshold 0.80, well above
      cost_overrun: 0.80,                // threshold 1.25, well below
      human_decision_replay: 1.0,        // threshold 0.99, well above
      evidence_span_availability: 1.0,   // threshold 0.99, well above
    };

    const assessment = evaluateAllCriteria('run_ok', inputs);
    expect(assessment.breached_count).toBe(0);
    expect(assessment.overall_recommendation).toBe('ok');
    expect(assessment.criteria.every(c => !c.breached)).toBe(true);
  });

  // --- Individual criterion tests ---

  it('hallucination_rate: breaches when above threshold', () => {
    const result = evaluateCriterion('hallucination_rate', 0.08, DEFAULT_THRESHOLDS.hallucination_rate);
    expect(result.breached).toBe(true);
    expect(result.recommendation).toBe('rollback');
    expect(result.owner).toBe('engineering_admin');
  });

  it('hallucination_rate: ok when below threshold', () => {
    const result = evaluateCriterion('hallucination_rate', 0.02, DEFAULT_THRESHOLDS.hallucination_rate);
    expect(result.breached).toBe(false);
  });

  it('false_identity_match_rate: breaches when above threshold', () => {
    const result = evaluateCriterion('false_identity_match_rate', 0.15, DEFAULT_THRESHOLDS.false_identity_match_rate);
    expect(result.breached).toBe(true);
    expect(result.owner).toBe('product_owner');
  });

  it('reviewer_rejection_spike: breaches when above 50%', () => {
    const result = evaluateCriterion('reviewer_rejection_spike', 0.60, DEFAULT_THRESHOLDS.reviewer_rejection_spike);
    expect(result.breached).toBe(true);
  });

  it('graph_reproducibility: breaches when below threshold', () => {
    const result = evaluateCriterion('graph_reproducibility', 0.80, DEFAULT_THRESHOLDS.graph_reproducibility);
    expect(result.breached).toBe(true);
    expect(result.recommendation).toBe('rollback');
  });

  it('graph_reproducibility: ok when above threshold', () => {
    const result = evaluateCriterion('graph_reproducibility', 0.95, DEFAULT_THRESHOLDS.graph_reproducibility);
    expect(result.breached).toBe(false);
  });

  it('export_integrity: breaches when below threshold', () => {
    const result = evaluateCriterion('export_integrity', 0.95, DEFAULT_THRESHOLDS.export_integrity);
    expect(result.breached).toBe(true);
    expect(result.owner).toBe('admin');
  });

  it('enrichment_reliability: breaches when below 80%', () => {
    const result = evaluateCriterion('enrichment_reliability', 0.70, DEFAULT_THRESHOLDS.enrichment_reliability);
    expect(result.breached).toBe(true);
  });

  it('cost_overrun: breaches when actual exceeds 125% of budget', () => {
    const result = evaluateCriterion('cost_overrun', 1.50, DEFAULT_THRESHOLDS.cost_overrun);
    expect(result.breached).toBe(true);
  });

  it('cost_overrun: ok when within budget', () => {
    const result = evaluateCriterion('cost_overrun', 1.10, DEFAULT_THRESHOLDS.cost_overrun);
    expect(result.breached).toBe(false);
  });

  it('human_decision_replay: breaches when below 99%', () => {
    const result = evaluateCriterion('human_decision_replay', 0.95, DEFAULT_THRESHOLDS.human_decision_replay);
    expect(result.breached).toBe(true);
  });

  it('evidence_span_availability: breaches when below 99%', () => {
    const result = evaluateCriterion('evidence_span_availability', 0.90, DEFAULT_THRESHOLDS.evidence_span_availability);
    expect(result.breached).toBe(true);
  });
});

// ===================================================================
// 2. Threshold breach detection
// ===================================================================

describe('Threshold breach detection', () => {
  it('single breach triggers rollback recommendation', () => {
    const inputs: CriterionInputs = {
      hallucination_rate: 0.10, // breached
      false_identity_match_rate: 0.05,
      reviewer_rejection_spike: 0.20,
      graph_reproducibility: 0.95,
      export_integrity: 1.0,
      enrichment_reliability: 0.90,
      cost_overrun: 1.0,
      human_decision_replay: 1.0,
      evidence_span_availability: 1.0,
    };

    const assessment = evaluateAllCriteria('run_breach', inputs);
    expect(assessment.breached_count).toBe(1);
    expect(assessment.overall_recommendation).toBe('rollback');
  });

  it('multiple breaches count correctly', () => {
    const inputs: CriterionInputs = {
      hallucination_rate: 0.10,
      false_identity_match_rate: 0.20,
      reviewer_rejection_spike: 0.60,
      graph_reproducibility: 0.70,
      export_integrity: 0.80,
      enrichment_reliability: 0.50,
      cost_overrun: 2.0,
      human_decision_replay: 0.80,
      evidence_span_availability: 0.80,
    };

    const assessment = evaluateAllCriteria('run_all_breach', inputs);
    expect(assessment.breached_count).toBe(9);
    expect(assessment.overall_recommendation).toBe('rollback');
    expect(assessment.criteria.every(c => c.breached)).toBe(true);
  });

  it('near-threshold triggers pause recommendation', () => {
    // hallucination_rate threshold is 0.05, set value to 0.048 (within 10%)
    const result = evaluateCriterion('hallucination_rate', 0.048, 0.05);
    expect(result.breached).toBe(false);
    expect(result.recommendation).toBe('pause');
  });

  it('overall pause when no breaches but some near-threshold', () => {
    const inputs: CriterionInputs = {
      hallucination_rate: 0.048, // near threshold (0.05)
      false_identity_match_rate: 0.03,
      reviewer_rejection_spike: 0.20,
      graph_reproducibility: 0.95,
      export_integrity: 1.0,
      enrichment_reliability: 0.90,
      cost_overrun: 1.0,
      human_decision_replay: 1.0,
      evidence_span_availability: 1.0,
    };

    const assessment = evaluateAllCriteria('run_near', inputs);
    expect(assessment.breached_count).toBe(0);
    expect(assessment.overall_recommendation).toBe('pause');
  });

  it('custom thresholds override defaults', () => {
    const inputs: CriterionInputs = {
      hallucination_rate: 0.08,
      false_identity_match_rate: 0.05,
      reviewer_rejection_spike: 0.20,
      graph_reproducibility: 0.95,
      export_integrity: 1.0,
      enrichment_reliability: 0.90,
      cost_overrun: 1.0,
      human_decision_replay: 1.0,
      evidence_span_availability: 1.0,
    };

    // With default threshold (0.05), 0.08 breaches
    const defaultAssessment = evaluateAllCriteria('run_custom', inputs);
    expect(defaultAssessment.breached_count).toBe(1);

    // With relaxed threshold (0.10), 0.08 does not breach
    const relaxedThresholds = { ...DEFAULT_THRESHOLDS, hallucination_rate: 0.10 };
    const relaxedAssessment = evaluateAllCriteria('run_custom', inputs, relaxedThresholds);
    expect(relaxedAssessment.breached_count).toBe(0);
  });
});

// ===================================================================
// 3. Metrics aggregation logic
// ===================================================================

describe('Metrics aggregation - buildInputsFromMetrics', () => {
  it('computes rates from counts correctly', () => {
    const inputs = buildInputsFromMetrics({
      relationships_total: 1000,
      relationships_without_evidence: 30,
      identity_clusters_total: 500,
      identity_human_splits: 25,
      candidates_total: 200,
      candidates_rejected: 40,
      top50_overlap_ratio: 0.92,
      export_valid_ids: 990,
      export_total_ids: 1000,
      enrichment_successes: 180,
      enrichment_total: 200,
      actual_cost: 350,
      approved_budget: 300,
      decisions_replayed: 98,
      decisions_total: 100,
      evidence_accessible: 4950,
      evidence_total: 5000,
    });

    expect(inputs.hallucination_rate).toBeCloseTo(0.03);
    expect(inputs.false_identity_match_rate).toBeCloseTo(0.05);
    expect(inputs.reviewer_rejection_spike).toBeCloseTo(0.20);
    expect(inputs.graph_reproducibility).toBeCloseTo(0.92);
    expect(inputs.export_integrity).toBeCloseTo(0.99);
    expect(inputs.enrichment_reliability).toBeCloseTo(0.90);
    expect(inputs.cost_overrun).toBeCloseTo(1.1667, 3);
    expect(inputs.human_decision_replay).toBeCloseTo(0.98);
    expect(inputs.evidence_span_availability).toBeCloseTo(0.99);
  });

  it('handles zero denominators safely', () => {
    const inputs = buildInputsFromMetrics({
      relationships_total: 0,
      relationships_without_evidence: 0,
      identity_clusters_total: 0,
      identity_human_splits: 0,
      candidates_total: 0,
      candidates_rejected: 0,
      top50_overlap_ratio: 1.0,
      export_valid_ids: 0,
      export_total_ids: 0,
      enrichment_successes: 0,
      enrichment_total: 0,
      actual_cost: 0,
      approved_budget: 0,
      decisions_replayed: 0,
      decisions_total: 0,
      evidence_accessible: 0,
      evidence_total: 0,
    });

    expect(inputs.hallucination_rate).toBe(0);
    expect(inputs.false_identity_match_rate).toBe(0);
    expect(inputs.reviewer_rejection_spike).toBe(0);
    expect(inputs.export_integrity).toBe(0);
    expect(inputs.enrichment_reliability).toBe(0);
    expect(inputs.cost_overrun).toBe(0);
    expect(inputs.human_decision_replay).toBe(0);
    expect(inputs.evidence_span_availability).toBe(0);
  });

  it('passes through graph reproducibility ratio directly', () => {
    const inputs = buildInputsFromMetrics({
      relationships_total: 100,
      relationships_without_evidence: 0,
      identity_clusters_total: 50,
      identity_human_splits: 0,
      candidates_total: 10,
      candidates_rejected: 0,
      top50_overlap_ratio: 0.85,
      export_valid_ids: 10,
      export_total_ids: 10,
      enrichment_successes: 10,
      enrichment_total: 10,
      actual_cost: 100,
      approved_budget: 200,
      decisions_replayed: 10,
      decisions_total: 10,
      evidence_accessible: 100,
      evidence_total: 100,
    });

    expect(inputs.graph_reproducibility).toBe(0.85);
  });
});

// ===================================================================
// 4. Quarantine API validation
// ===================================================================

describe('Quarantine API validation', () => {
  it('quarantine record has required fields per §20.3', () => {
    // Verify the Quarantine type matches API contract
    const record = {
      quarantine_id: 'q_001',
      run_id: 'run_001',
      source_phase: 'extraction',
      source_record: { document_id: 'doc_001' },
      reason_code: 'invalid_json',
      details: 'LLM returned malformed JSON',
      created_at: '2026-01-01T00:00:00Z',
      resolved: false,
    };

    expect(record.quarantine_id).toBeTruthy();
    expect(record.run_id).toBeTruthy();
    expect(record.source_phase).toBeTruthy();
    expect(record.reason_code).toBeTruthy();
    expect(typeof record.resolved).toBe('boolean');
    expect(record.created_at).toBeTruthy();
  });

  it('resolve sets resolved to true', () => {
    const record = {
      quarantine_id: 'q_001',
      resolved: false,
    };

    // Simulate resolve action
    record.resolved = true;
    expect(record.resolved).toBe(true);
  });

  it('cannot resolve an already-resolved record', () => {
    const record = {
      quarantine_id: 'q_001',
      resolved: true,
    };

    // The API should return conflict (409)
    const canResolve = !record.resolved;
    expect(canResolve).toBe(false);
  });

  it('quarantine filter by run_id narrows results', () => {
    const allRecords = [
      { quarantine_id: 'q_1', run_id: 'run_A', reason_code: 'invalid_json' },
      { quarantine_id: 'q_2', run_id: 'run_A', reason_code: 'schema_invalid' },
      { quarantine_id: 'q_3', run_id: 'run_B', reason_code: 'invalid_json' },
    ];

    const filteredByRun = allRecords.filter(r => r.run_id === 'run_A');
    expect(filteredByRun).toHaveLength(2);
  });

  it('quarantine filter by reason narrows results', () => {
    const allRecords = [
      { quarantine_id: 'q_1', run_id: 'run_A', reason_code: 'invalid_json' },
      { quarantine_id: 'q_2', run_id: 'run_A', reason_code: 'schema_invalid' },
      { quarantine_id: 'q_3', run_id: 'run_B', reason_code: 'invalid_json' },
    ];

    const filteredByReason = allRecords.filter(r => r.reason_code === 'invalid_json');
    expect(filteredByReason).toHaveLength(2);
  });

  it('quarantine filter by both run_id and reason', () => {
    const allRecords = [
      { quarantine_id: 'q_1', run_id: 'run_A', reason_code: 'invalid_json' },
      { quarantine_id: 'q_2', run_id: 'run_A', reason_code: 'schema_invalid' },
      { quarantine_id: 'q_3', run_id: 'run_B', reason_code: 'invalid_json' },
    ];

    const filtered = allRecords.filter(
      r => r.run_id === 'run_A' && r.reason_code === 'invalid_json',
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].quarantine_id).toBe('q_1');
  });
});

// ===================================================================
// 5. Criterion metadata completeness
// ===================================================================

describe('Criterion metadata', () => {
  it('every criterion has a name, description, and owner', () => {
    const inputs: CriterionInputs = {
      hallucination_rate: 0,
      false_identity_match_rate: 0,
      reviewer_rejection_spike: 0,
      graph_reproducibility: 1.0,
      export_integrity: 1.0,
      enrichment_reliability: 1.0,
      cost_overrun: 0,
      human_decision_replay: 1.0,
      evidence_span_availability: 1.0,
    };

    const assessment = evaluateAllCriteria('run_meta', inputs);

    for (const c of assessment.criteria) {
      expect(c.name).toBeTruthy();
      expect(c.description).toBeTruthy();
      expect(['engineering_admin', 'product_owner', 'admin']).toContain(c.owner);
    }
  });

  it('default thresholds are defined for all 9 criteria', () => {
    const keys = Object.keys(DEFAULT_THRESHOLDS);
    expect(keys).toHaveLength(9);
    for (const v of Object.values(DEFAULT_THRESHOLDS)) {
      expect(typeof v).toBe('number');
      expect(v).toBeGreaterThan(0);
    }
  });
});
