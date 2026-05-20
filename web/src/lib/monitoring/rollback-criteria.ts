/**
 * Rollback criteria monitoring — F11.5-T1.
 * PRD ref: §29 — rollback or pause conditions.
 *
 * Monitors all 9 rollback trigger conditions:
 * 1. Hallucination rate
 * 2. False identity match rate
 * 3. Reviewer rejection spike
 * 4. Graph reproducibility
 * 5. Export integrity
 * 6. Enrichment reliability
 * 7. Cost overrun
 * 8. Human decision replay fidelity
 * 9. Evidence span availability
 */

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export type CriterionId =
  | 'hallucination_rate'
  | 'false_identity_match_rate'
  | 'reviewer_rejection_spike'
  | 'graph_reproducibility'
  | 'export_integrity'
  | 'enrichment_reliability'
  | 'cost_overrun'
  | 'human_decision_replay'
  | 'evidence_span_availability';

export type CriterionOwner =
  | 'engineering_admin'
  | 'product_owner'
  | 'admin';

export type Recommendation = 'ok' | 'pause' | 'rollback';

export interface CriterionResult {
  id: CriterionId;
  name: string;
  description: string;
  owner: CriterionOwner;
  current_value: number;
  threshold: number;
  breached: boolean;
  recommendation: Recommendation;
}

export interface RollbackAssessment {
  run_id: string;
  evaluated_at: string;
  criteria: CriterionResult[];
  overall_recommendation: Recommendation;
  breached_count: number;
}

// -------------------------------------------------------------------
// Default thresholds (§29)
// -------------------------------------------------------------------

export interface RollbackThresholds {
  hallucination_rate: number;
  false_identity_match_rate: number;
  reviewer_rejection_spike: number;
  graph_reproducibility: number;
  export_integrity: number;
  enrichment_reliability: number;
  cost_overrun: number;
  human_decision_replay: number;
  evidence_span_availability: number;
}

export const DEFAULT_THRESHOLDS: RollbackThresholds = {
  hallucination_rate: 0.05,            // 5% — relationships with no evidence
  false_identity_match_rate: 0.10,     // 10% — identity splits from humans
  reviewer_rejection_spike: 0.50,      // 50% — rejection rate threshold
  graph_reproducibility: 0.90,         // 90% — top-50 path overlap across re-runs
  export_integrity: 0.99,             // 99% — valid IDs/links in exports
  enrichment_reliability: 0.80,       // 80% — enrichment success rate
  cost_overrun: 1.25,                 // 125% — max budget multiplier
  human_decision_replay: 0.99,        // 99% — decisions replayed correctly
  evidence_span_availability: 0.99,   // 99% — evidence spans accessible
};

// -------------------------------------------------------------------
// Criterion metadata
// -------------------------------------------------------------------

interface CriterionMeta {
  name: string;
  description: string;
  owner: CriterionOwner;
  /** true = breach when current > threshold; false = breach when current < threshold */
  breach_when_above: boolean;
}

const CRITERION_META: Record<CriterionId, CriterionMeta> = {
  hallucination_rate: {
    name: 'Hallucination Rate',
    description: 'Rate of relationships with no supporting evidence span',
    owner: 'engineering_admin',
    breach_when_above: true,
  },
  false_identity_match_rate: {
    name: 'False Identity Match Rate',
    description: 'Rate of identity clusters overridden by human not_same_person decisions',
    owner: 'product_owner',
    breach_when_above: true,
  },
  reviewer_rejection_spike: {
    name: 'Reviewer Rejection Spike',
    description: 'Rate of candidates rejected by reviewers in current run',
    owner: 'product_owner',
    breach_when_above: true,
  },
  graph_reproducibility: {
    name: 'Graph Reproducibility',
    description: 'Top-50 path overlap when re-running with same inputs',
    owner: 'engineering_admin',
    breach_when_above: false,
  },
  export_integrity: {
    name: 'Export Integrity',
    description: 'Rate of valid IDs and links in spreadsheet exports',
    owner: 'admin',
    breach_when_above: false,
  },
  enrichment_reliability: {
    name: 'Enrichment Reliability',
    description: 'Overall enrichment API success rate',
    owner: 'engineering_admin',
    breach_when_above: false,
  },
  cost_overrun: {
    name: 'Cost Overrun',
    description: 'Ratio of actual cost to approved budget',
    owner: 'admin',
    breach_when_above: true,
  },
  human_decision_replay: {
    name: 'Human Decision Replay Fidelity',
    description: 'Rate of prior human decisions correctly replayed in new run',
    owner: 'engineering_admin',
    breach_when_above: false,
  },
  evidence_span_availability: {
    name: 'Evidence Span Availability',
    description: 'Rate of evidence spans that are accessible and not broken',
    owner: 'engineering_admin',
    breach_when_above: false,
  },
};

/** Absolute distance from threshold that triggers a pause recommendation. */
const PAUSE_MARGIN = 0.005;

// -------------------------------------------------------------------
// Evaluation inputs
// -------------------------------------------------------------------

export interface CriterionInputs {
  hallucination_rate: number;
  false_identity_match_rate: number;
  reviewer_rejection_spike: number;
  graph_reproducibility: number;
  export_integrity: number;
  enrichment_reliability: number;
  cost_overrun: number;
  human_decision_replay: number;
  evidence_span_availability: number;
}

// -------------------------------------------------------------------
// Evaluate a single criterion
// -------------------------------------------------------------------

export function evaluateCriterion(
  id: CriterionId,
  currentValue: number,
  threshold: number,
): CriterionResult {
  const meta = CRITERION_META[id];
  const breached = meta.breach_when_above
    ? currentValue > threshold
    : currentValue < threshold;

  // Determine severity: if breached -> rollback, if near threshold -> pause.
  // "Near" = absolute distance to threshold is less than PAUSE_MARGIN.
  let recommendation: Recommendation = 'ok';
  if (breached) {
    recommendation = 'rollback';
  } else {
    const distance = Math.abs(currentValue - threshold);
    if (distance < PAUSE_MARGIN) {
      recommendation = 'pause';
    }
  }

  return {
    id,
    name: meta.name,
    description: meta.description,
    owner: meta.owner,
    current_value: currentValue,
    threshold,
    breached,
    recommendation,
  };
}

// -------------------------------------------------------------------
// Evaluate all criteria for a run
// -------------------------------------------------------------------

export function evaluateAllCriteria(
  runId: string,
  inputs: CriterionInputs,
  thresholds: RollbackThresholds = DEFAULT_THRESHOLDS,
): RollbackAssessment {
  const criterionIds = Object.keys(CRITERION_META) as CriterionId[];

  const criteria = criterionIds.map(id =>
    evaluateCriterion(id, inputs[id], thresholds[id]),
  );

  const breachedCount = criteria.filter(c => c.breached).length;

  let overall: Recommendation = 'ok';
  if (breachedCount > 0) {
    overall = 'rollback';
  } else if (criteria.some(c => c.recommendation === 'pause')) {
    overall = 'pause';
  }

  return {
    run_id: runId,
    evaluated_at: new Date().toISOString(),
    criteria,
    overall_recommendation: overall,
    breached_count: breachedCount,
  };
}

// -------------------------------------------------------------------
// Helper: collect inputs from metrics (for use by the monitoring page)
// -------------------------------------------------------------------

export function buildInputsFromMetrics(params: {
  relationships_total: number;
  relationships_without_evidence: number;
  identity_clusters_total: number;
  identity_human_splits: number;
  candidates_total: number;
  candidates_rejected: number;
  top50_overlap_ratio: number;
  export_valid_ids: number;
  export_total_ids: number;
  enrichment_successes: number;
  enrichment_total: number;
  actual_cost: number;
  approved_budget: number;
  decisions_replayed: number;
  decisions_total: number;
  evidence_accessible: number;
  evidence_total: number;
}): CriterionInputs {
  const safe = (n: number, d: number) => (d === 0 ? 0 : n / d);

  return {
    hallucination_rate: safe(params.relationships_without_evidence, params.relationships_total),
    false_identity_match_rate: safe(params.identity_human_splits, params.identity_clusters_total),
    reviewer_rejection_spike: safe(params.candidates_rejected, params.candidates_total),
    graph_reproducibility: params.top50_overlap_ratio,
    export_integrity: safe(params.export_valid_ids, params.export_total_ids),
    enrichment_reliability: safe(params.enrichment_successes, params.enrichment_total),
    cost_overrun: safe(params.actual_cost, params.approved_budget),
    human_decision_replay: safe(params.decisions_replayed, params.decisions_total),
    evidence_span_availability: safe(params.evidence_accessible, params.evidence_total),
  };
}
