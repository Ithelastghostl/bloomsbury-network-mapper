/**
 * Calibration-specific query views for reviewer decisions.
 * PRD ref: §18.10 (structured decision labels), §19.2 (calibration process), R6.1.
 *
 * All decisions queryable for calibration; reason codes match §18.10.
 * Aggregation: by reason code, by seed, by run, by score band.
 */

import { createClient } from '@/lib/supabase/server';
import type { HumanDecision } from '@/types/database';

// -------------------------------------------------------------------
// §18.10 Decision labels — canonical set
// -------------------------------------------------------------------

export const DECISION_LABELS = [
  'qualified',
  'rejected_wrong_person',
  'rejected_weak_connection',
  'rejected_bad_fit',
  'rejected_already_known',
  'needs_more_research',
  'intro_requested',
  'intro_declined',
  'meeting_booked',
  'converted',
] as const;

export type DecisionLabel = typeof DECISION_LABELS[number];

// -------------------------------------------------------------------
// Score bands for calibration bucketing
// -------------------------------------------------------------------

export interface ScoreBand {
  label: string;
  min: number; // inclusive
  max: number; // exclusive (except last band)
}

export const SCORE_BANDS: ScoreBand[] = [
  { label: '0.0–0.2', min: 0.0, max: 0.2 },
  { label: '0.2–0.4', min: 0.2, max: 0.4 },
  { label: '0.4–0.6', min: 0.4, max: 0.6 },
  { label: '0.6–0.8', min: 0.6, max: 0.8 },
  { label: '0.8–1.0', min: 0.8, max: 1.01 },
];

export function scoreBandFor(score: number): string {
  for (const band of SCORE_BANDS) {
    if (score >= band.min && score < band.max) return band.label;
  }
  return SCORE_BANDS[SCORE_BANDS.length - 1].label;
}

// -------------------------------------------------------------------
// Aggregation types
// -------------------------------------------------------------------

export interface ReasonCodeCount {
  reason_code: string;
  count: number;
}

export interface SeedDecisionSummary {
  seed_id: string;
  total: number;
  by_reason: ReasonCodeCount[];
}

export interface RunDecisionSummary {
  run_id: string;
  total: number;
  by_reason: ReasonCodeCount[];
}

export interface ScoreBandDecisionSummary {
  band: string;
  total: number;
  qualified: number;
  rejected: number;
  qualification_rate: number;
}

// -------------------------------------------------------------------
// Query helpers
// -------------------------------------------------------------------

/** Fetch all decisions, optionally filtered by run_id. */
export async function queryDecisions(filters?: {
  run_id?: string;
  seed_id?: string;
  limit?: number;
}): Promise<HumanDecision[]> {
  const supabase = await createClient();
  const limit = filters?.limit ?? 1000;

  let query = supabase
    .from('human_decisions')
    .select('*, candidate_recommendations!inner(run_id, seed_id, priority_score)')
    .order('decided_at', { ascending: false })
    .limit(limit);

  if (filters?.run_id) {
    query = query.eq('candidate_recommendations.run_id', filters.run_id);
  }
  if (filters?.seed_id) {
    query = query.eq('candidate_recommendations.seed_id', filters.seed_id);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as HumanDecision[];
}

// -------------------------------------------------------------------
// Pure aggregation functions (work on in-memory arrays)
// -------------------------------------------------------------------

interface DecisionWithContext extends HumanDecision {
  candidate_recommendations?: {
    run_id: string;
    seed_id: string;
    priority_score: number;
  };
}

/** Aggregate decisions by reason code. */
export function aggregateByReasonCode(decisions: HumanDecision[]): ReasonCodeCount[] {
  const counts = new Map<string, number>();
  for (const d of decisions) {
    const key = d.reason_code ?? d.decision;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([reason_code, count]) => ({ reason_code, count }))
    .sort((a, b) => b.count - a.count);
}

/** Aggregate decisions by seed. */
export function aggregateBySeed(decisions: DecisionWithContext[]): SeedDecisionSummary[] {
  const bySeed = new Map<string, DecisionWithContext[]>();
  for (const d of decisions) {
    const seedId = d.candidate_recommendations?.seed_id ?? 'unknown';
    const list = bySeed.get(seedId) ?? [];
    list.push(d);
    bySeed.set(seedId, list);
  }
  return Array.from(bySeed.entries()).map(([seed_id, decs]) => ({
    seed_id,
    total: decs.length,
    by_reason: aggregateByReasonCode(decs),
  }));
}

/** Aggregate decisions by run. */
export function aggregateByRun(decisions: DecisionWithContext[]): RunDecisionSummary[] {
  const byRun = new Map<string, DecisionWithContext[]>();
  for (const d of decisions) {
    const runId = d.candidate_recommendations?.run_id ?? 'unknown';
    const list = byRun.get(runId) ?? [];
    list.push(d);
    byRun.set(runId, list);
  }
  return Array.from(byRun.entries()).map(([run_id, decs]) => ({
    run_id,
    total: decs.length,
    by_reason: aggregateByReasonCode(decs),
  }));
}

/** Aggregate decisions by priority score band. */
export function aggregateByScoreBand(
  decisions: DecisionWithContext[],
): ScoreBandDecisionSummary[] {
  const buckets = new Map<string, { qualified: number; rejected: number; total: number }>();
  for (const band of SCORE_BANDS) {
    buckets.set(band.label, { qualified: 0, rejected: 0, total: 0 });
  }

  for (const d of decisions) {
    const score = d.candidate_recommendations?.priority_score ?? 0;
    const band = scoreBandFor(score);
    const bucket = buckets.get(band)!;
    bucket.total++;
    if (d.decision === 'qualified' || d.decision === 'converted' || d.decision === 'meeting_booked') {
      bucket.qualified++;
    } else if (d.decision.startsWith('rejected') || d.reason_code?.startsWith('rejected')) {
      bucket.rejected++;
    }
  }

  return Array.from(buckets.entries()).map(([band, b]) => ({
    band,
    total: b.total,
    qualified: b.qualified,
    rejected: b.rejected,
    qualification_rate: b.total > 0 ? b.qualified / b.total : 0,
  }));
}
