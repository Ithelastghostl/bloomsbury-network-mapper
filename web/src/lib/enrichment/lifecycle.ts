/**
 * Enrichment lifecycle state machine per PRD §17.2.
 *
 * States: not_started, queued, in_progress, matched, ambiguous_match,
 *         no_result, failed_retryable, failed_final, stale, manual_required
 */

export type EnrichmentLifecycleState =
  | 'not_started'
  | 'queued'
  | 'in_progress'
  | 'matched'
  | 'ambiguous_match'
  | 'no_result'
  | 'failed_retryable'
  | 'failed_final'
  | 'stale'
  | 'manual_required';

/** Valid transitions from each state */
const TRANSITIONS: Record<EnrichmentLifecycleState, EnrichmentLifecycleState[]> = {
  not_started: ['queued'],
  queued: ['in_progress', 'failed_retryable'],
  in_progress: ['matched', 'ambiguous_match', 'no_result', 'failed_retryable', 'failed_final', 'manual_required'],
  matched: ['stale'],
  ambiguous_match: ['manual_required', 'stale'],
  no_result: ['queued', 'stale'],
  failed_retryable: ['queued', 'failed_final'],
  failed_final: ['queued'], // allow manual re-queue
  stale: ['queued'],
  manual_required: ['matched', 'no_result'],
};

/**
 * Check whether a transition from `from` to `to` is valid.
 */
export function isValidTransition(
  from: EnrichmentLifecycleState,
  to: EnrichmentLifecycleState,
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Get all valid next states from the current state.
 */
export function getValidNextStates(
  current: EnrichmentLifecycleState,
): EnrichmentLifecycleState[] {
  return TRANSITIONS[current] ?? [];
}

/**
 * Attempt a state transition. Returns the new state or throws if invalid.
 */
export function transition(
  from: EnrichmentLifecycleState,
  to: EnrichmentLifecycleState,
): EnrichmentLifecycleState {
  if (!isValidTransition(from, to)) {
    throw new Error(
      `Invalid enrichment state transition: ${from} -> ${to}. Valid: [${TRANSITIONS[from]?.join(', ') ?? 'none'}]`,
    );
  }
  return to;
}

/**
 * Whether a state represents a terminal success (data is available for scoring).
 * Per R4.6: ambiguous_match stored but NOT accepted for scoring.
 */
export function isAcceptedForScoring(state: EnrichmentLifecycleState): boolean {
  return state === 'matched';
}

/**
 * Whether a state represents a terminal failure (no further automatic retries).
 */
export function isTerminalFailure(state: EnrichmentLifecycleState): boolean {
  return state === 'failed_final';
}

/**
 * Whether a state means the enrichment can be retried.
 */
export function isRetryable(state: EnrichmentLifecycleState): boolean {
  return state === 'failed_retryable';
}
