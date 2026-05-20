/**
 * Cold-start decision handling per §18.5.
 * PRD ref: §18.5, §19.1.
 *
 * Decisions made before the cold-start threshold (100 decisions across 10 seeds)
 * are flagged cold_start_decision=true but retained.
 */

import { createClient } from '@/lib/supabase/server';

// -------------------------------------------------------------------
// Constants per §18.5 / §19.1
// -------------------------------------------------------------------

export const COLD_START_DECISION_THRESHOLD = 100;
export const COLD_START_SEED_THRESHOLD = 10;

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface ColdStartStatus {
  total_decisions: number;
  distinct_seeds: number;
  decisions_met: boolean;
  seeds_met: boolean;
  cold_start_complete: boolean;
}

// -------------------------------------------------------------------
// Pure logic (testable without DB)
// -------------------------------------------------------------------

/** Check whether cold-start thresholds have been met. */
export function checkColdStartThreshold(
  totalDecisions: number,
  distinctSeeds: number,
): ColdStartStatus {
  const decisionsMet = totalDecisions >= COLD_START_DECISION_THRESHOLD;
  const seedsMet = distinctSeeds >= COLD_START_SEED_THRESHOLD;
  return {
    total_decisions: totalDecisions,
    distinct_seeds: distinctSeeds,
    decisions_met: decisionsMet,
    seeds_met: seedsMet,
    cold_start_complete: decisionsMet && seedsMet,
  };
}

/** Determine whether a new decision should be flagged as cold-start. */
export function flagColdStartDecision(
  totalDecisionsBefore: number,
  distinctSeedsBefore: number,
): boolean {
  const status = checkColdStartThreshold(totalDecisionsBefore, distinctSeedsBefore);
  return !status.cold_start_complete;
}

// -------------------------------------------------------------------
// Database queries
// -------------------------------------------------------------------

/** Fetch current cold-start status from DB. */
export async function getColdStartStatus(): Promise<ColdStartStatus> {
  const supabase = await createClient();

  // Count total decisions
  const { count: totalDecisions, error: countError } = await supabase
    .from('human_decisions')
    .select('*', { count: 'exact', head: true });

  if (countError) throw countError;

  // Count distinct seeds with decisions
  const { data: seedRows, error: seedError } = await supabase
    .from('human_decisions')
    .select('candidate_recommendations!inner(seed_id)')
    .limit(10000);

  if (seedError) throw seedError;

  const distinctSeeds = new Set(
    (seedRows ?? []).map((r) =>
      (r as { candidate_recommendations: { seed_id: string } }).candidate_recommendations.seed_id,
    ),
  ).size;

  return checkColdStartThreshold(totalDecisions ?? 0, distinctSeeds);
}
