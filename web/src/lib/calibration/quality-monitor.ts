/**
 * Quality monitoring for extraction and identity resolution.
 * PRD ref: R6.6, R6.7, R6.8.
 *
 * F10.3-T1: Monitor extraction quality drift across runs
 * F10.3-T2: Monitor identity resolution failure rates
 * F10.3-T3: Surface failure modes by reason code
 */

import { createClient } from '@/lib/supabase/server';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface ExtractionQualityMetrics {
  run_id: string;
  total_extractions: number;
  successful: number;
  failed: number;
  quarantined: number;
  avg_confidence: number;
  success_rate: number;
}

export interface IdentityResolutionMetrics {
  run_id: string;
  total_clusters: number;
  avg_cluster_confidence: number;
  low_confidence_clusters: number;
  false_match_decisions: number;
  false_match_rate: number;
}

export interface QualityDriftResult {
  current: ExtractionQualityMetrics;
  previous: ExtractionQualityMetrics | null;
  drift: {
    success_rate_delta: number | null;
    avg_confidence_delta: number | null;
    drifted: boolean;
  };
}

export interface IdentityDriftResult {
  current: IdentityResolutionMetrics;
  previous: IdentityResolutionMetrics | null;
  drift: {
    false_match_rate_delta: number | null;
    avg_confidence_delta: number | null;
    drifted: boolean;
  };
}

export interface ReasonCodeBreakdown {
  run_id: string;
  reason_codes: { reason_code: string; count: number }[];
  total_failures: number;
}

// -------------------------------------------------------------------
// Drift threshold
// -------------------------------------------------------------------

/** A quality metric is considered to have drifted if it moves more than 5%. */
export const DRIFT_THRESHOLD = 0.05;

// -------------------------------------------------------------------
// Pure computation (testable without DB)
// -------------------------------------------------------------------

/** Compute extraction quality metrics from raw counts. */
export function computeExtractionMetrics(
  runId: string,
  total: number,
  successful: number,
  failed: number,
  quarantined: number,
  avgConfidence: number,
): ExtractionQualityMetrics {
  return {
    run_id: runId,
    total_extractions: total,
    successful,
    failed,
    quarantined,
    avg_confidence: avgConfidence,
    success_rate: total > 0 ? successful / total : 0,
  };
}

/** Compute identity resolution metrics from raw counts. */
export function computeIdentityMetrics(
  runId: string,
  totalClusters: number,
  avgClusterConfidence: number,
  lowConfidenceClusters: number,
  falseMatchDecisions: number,
): IdentityResolutionMetrics {
  return {
    run_id: runId,
    total_clusters: totalClusters,
    avg_cluster_confidence: avgClusterConfidence,
    low_confidence_clusters: lowConfidenceClusters,
    false_match_decisions: falseMatchDecisions,
    false_match_rate: totalClusters > 0 ? falseMatchDecisions / totalClusters : 0,
  };
}

/** Compare two extraction quality snapshots for drift. */
export function detectExtractionDrift(
  current: ExtractionQualityMetrics,
  previous: ExtractionQualityMetrics | null,
): QualityDriftResult {
  if (!previous) {
    return {
      current,
      previous: null,
      drift: {
        success_rate_delta: null,
        avg_confidence_delta: null,
        drifted: false,
      },
    };
  }

  const successDelta = current.success_rate - previous.success_rate;
  const confidenceDelta = current.avg_confidence - previous.avg_confidence;
  const drifted =
    Math.abs(successDelta) > DRIFT_THRESHOLD ||
    Math.abs(confidenceDelta) > DRIFT_THRESHOLD;

  return {
    current,
    previous,
    drift: {
      success_rate_delta: successDelta,
      avg_confidence_delta: confidenceDelta,
      drifted,
    },
  };
}

/** Compare two identity resolution snapshots for drift. */
export function detectIdentityDrift(
  current: IdentityResolutionMetrics,
  previous: IdentityResolutionMetrics | null,
): IdentityDriftResult {
  if (!previous) {
    return {
      current,
      previous: null,
      drift: {
        false_match_rate_delta: null,
        avg_confidence_delta: null,
        drifted: false,
      },
    };
  }

  const fmrDelta = current.false_match_rate - previous.false_match_rate;
  const confidenceDelta = current.avg_cluster_confidence - previous.avg_cluster_confidence;
  const drifted =
    Math.abs(fmrDelta) > DRIFT_THRESHOLD ||
    Math.abs(confidenceDelta) > DRIFT_THRESHOLD;

  return {
    current,
    previous,
    drift: {
      false_match_rate_delta: fmrDelta,
      avg_confidence_delta: confidenceDelta,
      drifted,
    },
  };
}

/** Build reason code breakdown from rejection data. */
export function buildReasonCodeBreakdown(
  runId: string,
  rejections: { reason_code: string }[],
): ReasonCodeBreakdown {
  const counts = new Map<string, number>();
  for (const r of rejections) {
    counts.set(r.reason_code, (counts.get(r.reason_code) ?? 0) + 1);
  }
  const reasonCodes = Array.from(counts.entries())
    .map(([reason_code, count]) => ({ reason_code, count }))
    .sort((a, b) => b.count - a.count);

  return {
    run_id: runId,
    reason_codes: reasonCodes,
    total_failures: rejections.length,
  };
}

// -------------------------------------------------------------------
// Database-backed queries
// -------------------------------------------------------------------

/** Fetch extraction quality metrics for a run. */
export async function getExtractionMetricsForRun(
  runId: string,
): Promise<ExtractionQualityMetrics> {
  const supabase = await createClient();

  const { data: extractions, error } = await supabase
    .from('extraction_runs')
    .select('status, extraction_run_id')
    .eq('run_id', runId);

  if (error) throw error;

  const rows = extractions ?? [];
  const total = rows.length;
  const successful = rows.filter((r) => r.status === 'completed').length;
  const failed = rows.filter((r) => r.status === 'failed').length;

  const { count: quarantined, error: qError } = await supabase
    .from('quarantine')
    .select('*', { count: 'exact', head: true })
    .eq('run_id', runId)
    .eq('source_phase', 'extraction');

  if (qError) throw qError;

  // Average confidence from entity mentions
  const { data: mentions, error: mError } = await supabase
    .from('entity_mentions')
    .select('extraction_confidence')
    .eq('run_id', runId);

  if (mError) throw mError;

  const confidences = (mentions ?? []).map((m) => m.extraction_confidence);
  const avgConfidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;

  return computeExtractionMetrics(
    runId,
    total,
    successful,
    failed,
    quarantined ?? 0,
    avgConfidence,
  );
}

/** Fetch identity resolution metrics for a run. */
export async function getIdentityMetricsForRun(
  runId: string,
): Promise<IdentityResolutionMetrics> {
  const supabase = await createClient();

  const { data: clusters, error } = await supabase
    .from('identity_clusters')
    .select('cluster_confidence')
    .eq('run_id', runId);

  if (error) throw error;

  const rows = clusters ?? [];
  const totalClusters = rows.length;
  const confidences = rows.map((r) => r.cluster_confidence);
  const avgConfidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;
  const lowConfidence = rows.filter((r) => r.cluster_confidence < 0.5).length;

  // Count "wrong person" decisions (false matches)
  const { count: falseMatches, error: fmError } = await supabase
    .from('human_decisions')
    .select('*, candidate_recommendations!inner(run_id)', { count: 'exact', head: true })
    .eq('candidate_recommendations.run_id', runId)
    .eq('reason_code', 'rejected_wrong_person');

  if (fmError) throw fmError;

  return computeIdentityMetrics(
    runId,
    totalClusters,
    avgConfidence,
    lowConfidence,
    falseMatches ?? 0,
  );
}

/** Fetch reason code breakdown for a run. */
export async function getReasonCodeBreakdownForRun(
  runId: string,
): Promise<ReasonCodeBreakdown> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('human_decisions')
    .select('reason_code, candidate_recommendations!inner(run_id)')
    .eq('candidate_recommendations.run_id', runId)
    .not('reason_code', 'is', null);

  if (error) throw error;

  const rejections = (data ?? [])
    .filter((d) => d.reason_code != null)
    .map((d) => ({ reason_code: d.reason_code as string }));

  return buildReasonCodeBreakdown(runId, rejections);
}
