/**
 * Intro funnel tracking views for R6.2.
 * PRD ref: §18.9 (workflow states), §19.2, R6.2.
 *
 * Full funnel: intro request -> intro outcome -> meeting -> conversion.
 * Linked to candidate, seed, run.
 */

import { createClient } from '@/lib/supabase/server';
import type { IntroOutcome } from '@/types/database';

// -------------------------------------------------------------------
// Funnel stage definitions matching §18.9
// -------------------------------------------------------------------

export const FUNNEL_STAGES = [
  'intro_requested',
  'intro_made',
  'intro_declined',
  'meeting_booked',
  'converted',
] as const;

export type FunnelStage = typeof FUNNEL_STAGES[number];

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface FunnelCounts {
  intro_requested: number;
  intro_made: number;
  intro_declined: number;
  meeting_booked: number;
  converted: number;
}

export interface FunnelSummary {
  total_candidates: number;
  funnel: FunnelCounts;
  conversion_rates: {
    request_to_made: number;
    made_to_meeting: number;
    meeting_to_converted: number;
    request_to_converted: number;
  };
}

export interface SeedFunnelSummary {
  seed_id: string;
  funnel: FunnelCounts;
}

export interface RunFunnelSummary {
  run_id: string;
  funnel: FunnelCounts;
}

// -------------------------------------------------------------------
// Query helpers
// -------------------------------------------------------------------

export async function queryIntroOutcomes(filters?: {
  seed_id?: string;
  run_id?: string;
  limit?: number;
}): Promise<IntroOutcome[]> {
  const supabase = await createClient();
  const limit = filters?.limit ?? 1000;

  let query = supabase
    .from('intro_outcomes')
    .select('*, candidate_recommendations!inner(run_id)')
    .order('recorded_at', { ascending: false })
    .limit(limit);

  if (filters?.seed_id) {
    query = query.eq('seed_id', filters.seed_id);
  }
  if (filters?.run_id) {
    query = query.eq('candidate_recommendations.run_id', filters.run_id);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as IntroOutcome[];
}

// -------------------------------------------------------------------
// Pure funnel aggregation (works on in-memory arrays)
// -------------------------------------------------------------------

function emptyFunnel(): FunnelCounts {
  return {
    intro_requested: 0,
    intro_made: 0,
    intro_declined: 0,
    meeting_booked: 0,
    converted: 0,
  };
}

function safeRate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

/** Count funnel stages from intro outcome records. */
export function countFunnelStages(outcomes: IntroOutcome[]): FunnelCounts {
  const counts = emptyFunnel();
  for (const o of outcomes) {
    // Every outcome starts as a request
    counts.intro_requested++;

    if (o.intro_status === 'declined') {
      counts.intro_declined++;
    } else if (o.intro_status === 'made' || o.intro_status === 'meeting' || o.intro_status === 'converted') {
      counts.intro_made++;
    }

    if (o.meeting_at != null) {
      counts.meeting_booked++;
    }

    if (o.converted === true) {
      counts.converted++;
    }
  }
  return counts;
}

/** Build full funnel summary with conversion rates. */
export function buildFunnelSummary(
  totalCandidates: number,
  outcomes: IntroOutcome[],
): FunnelSummary {
  const funnel = countFunnelStages(outcomes);
  return {
    total_candidates: totalCandidates,
    funnel,
    conversion_rates: {
      request_to_made: safeRate(funnel.intro_made, funnel.intro_requested),
      made_to_meeting: safeRate(funnel.meeting_booked, funnel.intro_made),
      meeting_to_converted: safeRate(funnel.converted, funnel.meeting_booked),
      request_to_converted: safeRate(funnel.converted, funnel.intro_requested),
    },
  };
}

/** Aggregate funnel by seed. */
export function aggregateFunnelBySeed(outcomes: IntroOutcome[]): SeedFunnelSummary[] {
  const bySeed = new Map<string, IntroOutcome[]>();
  for (const o of outcomes) {
    const list = bySeed.get(o.seed_id) ?? [];
    list.push(o);
    bySeed.set(o.seed_id, list);
  }
  return Array.from(bySeed.entries()).map(([seed_id, ocs]) => ({
    seed_id,
    funnel: countFunnelStages(ocs),
  }));
}

/** Aggregate funnel by run. */
export function aggregateFunnelByRun(
  outcomes: (IntroOutcome & { candidate_recommendations?: { run_id: string } })[],
): RunFunnelSummary[] {
  const byRun = new Map<string, IntroOutcome[]>();
  for (const o of outcomes) {
    const runId = (o as { candidate_recommendations?: { run_id: string } }).candidate_recommendations?.run_id ?? 'unknown';
    const list = byRun.get(runId) ?? [];
    list.push(o);
    byRun.set(runId, list);
  }
  return Array.from(byRun.entries()).map(([run_id, ocs]) => ({
    run_id,
    funnel: countFunnelStages(ocs),
  }));
}
