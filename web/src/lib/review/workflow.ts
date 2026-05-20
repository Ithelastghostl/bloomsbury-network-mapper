/**
 * Reviewer workflow state machine — §18.9
 *
 * 11 states with enforced valid transitions.
 * Transitions follow the natural review funnel:
 *   Discovered → Enriched → Ready for Review → In Review →
 *     Qualified → Intro Requested → Intro Made → Meeting → Opportunity → Converted
 *     (or Rejected at any review stage)
 */

// ---------------------------------------------------------------
// States — exactly the 11 from §18.9
// ---------------------------------------------------------------

export const WORKFLOW_STATES = [
  'Discovered',
  'Enriched',
  'Ready for Review',
  'In Review',
  'Qualified',
  'Intro Requested',
  'Intro Made',
  'Meeting',
  'Opportunity',
  'Converted',
  'Rejected',
] as const;

export type WorkflowState = (typeof WORKFLOW_STATES)[number];

// ---------------------------------------------------------------
// Decision labels — §18.10
// ---------------------------------------------------------------

export const DECISION_LABELS = [
  'Qualified',
  'Rejected — wrong person',
  'Rejected — weak connection',
  'Rejected — bad fit',
  'Rejected — already known',
  'Needs more research',
] as const;

export type DecisionLabel = (typeof DECISION_LABELS)[number];

// ---------------------------------------------------------------
// Rejection reason codes (all Rejected — * labels)
// ---------------------------------------------------------------

export const REJECTION_REASON_CODES = [
  'wrong_person',
  'weak_connection',
  'bad_fit',
  'already_known',
] as const;

export type RejectionReasonCode = (typeof REJECTION_REASON_CODES)[number];

/** Map decision labels to reason codes for rejections */
const LABEL_TO_REASON: Record<string, RejectionReasonCode> = {
  'Rejected — wrong person': 'wrong_person',
  'Rejected — weak connection': 'weak_connection',
  'Rejected — bad fit': 'bad_fit',
  'Rejected — already known': 'already_known',
};

export function isRejection(decision: DecisionLabel): boolean {
  return decision.startsWith('Rejected');
}

export function rejectionReasonCode(decision: DecisionLabel): RejectionReasonCode | null {
  return LABEL_TO_REASON[decision] ?? null;
}

// ---------------------------------------------------------------
// Valid transitions
// ---------------------------------------------------------------

const VALID_TRANSITIONS: Record<WorkflowState, readonly WorkflowState[]> = {
  'Discovered': ['Enriched'],
  'Enriched': ['Ready for Review'],
  'Ready for Review': ['In Review'],
  'In Review': ['Qualified', 'Rejected', 'Ready for Review'],
  'Qualified': ['Intro Requested', 'Rejected'],
  'Intro Requested': ['Intro Made', 'Rejected'],
  'Intro Made': ['Meeting', 'Rejected'],
  'Meeting': ['Opportunity', 'Rejected'],
  'Opportunity': ['Converted', 'Rejected'],
  'Converted': [],
  'Rejected': [],
};

// ---------------------------------------------------------------
// Public API
// ---------------------------------------------------------------

export function isValidState(state: string): state is WorkflowState {
  return WORKFLOW_STATES.includes(state as WorkflowState);
}

export function isValidTransition(from: WorkflowState, to: WorkflowState): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return allowed.includes(to);
}

export function getValidTransitions(from: WorkflowState): readonly WorkflowState[] {
  return VALID_TRANSITIONS[from];
}

/**
 * Attempt a state transition. Returns the new state on success,
 * or throws with a descriptive error for invalid transitions.
 */
export function transition(from: WorkflowState, to: WorkflowState): WorkflowState {
  if (!isValidState(from)) {
    throw new Error(`Invalid current state: "${from}"`);
  }
  if (!isValidState(to)) {
    throw new Error(`Invalid target state: "${to}"`);
  }
  if (!isValidTransition(from, to)) {
    const allowed = getValidTransitions(from);
    throw new Error(
      `Invalid transition from "${from}" to "${to}". ` +
      `Valid transitions: [${allowed.join(', ')}]`,
    );
  }
  return to;
}

/**
 * Map a decision label to the resulting workflow state.
 */
export function decisionToState(decision: DecisionLabel): WorkflowState {
  if (decision === 'Qualified') return 'Qualified';
  if (decision === 'Needs more research') return 'Ready for Review';
  if (isRejection(decision)) return 'Rejected';
  throw new Error(`Unknown decision label: "${decision}"`);
}

// ---------------------------------------------------------------
// Cold-start threshold — §18.5
// ---------------------------------------------------------------

export const COLD_START_DECISION_THRESHOLD = 100;
export const COLD_START_SEED_THRESHOLD = 10;

export interface ColdStartCounts {
  totalDecisions: number;
  distinctSeeds: number;
}

/**
 * Returns true if the system is still in cold-start mode.
 * Cold start = fewer than 100 decisions across fewer than 10 seeds.
 */
export function isColdStart(counts: ColdStartCounts): boolean {
  return (
    counts.totalDecisions < COLD_START_DECISION_THRESHOLD ||
    counts.distinctSeeds < COLD_START_SEED_THRESHOLD
  );
}
