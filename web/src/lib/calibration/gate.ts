/**
 * Cold-start gate enforcement per §19.1.
 * PRD ref: §19.1 — no automatic or semi-automatic weight updates
 * until at least 100 reviewer decisions across at least 10 distinct seeds.
 *
 * Before the threshold, Phase 6 emits monitoring only.
 */

import {
  checkColdStartThreshold,
  type ColdStartStatus,
  COLD_START_DECISION_THRESHOLD,
  COLD_START_SEED_THRESHOLD,
} from './cold-start';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface GateResult {
  allowed: boolean;
  status: ColdStartStatus;
  reason: string | null;
}

// -------------------------------------------------------------------
// Pure logic
// -------------------------------------------------------------------

/**
 * Check if the cold-start gate is complete (calibration is allowed).
 * Returns a gate result with reason if blocked.
 */
export function isColdStartComplete(
  totalDecisions: number,
  distinctSeeds: number,
): GateResult {
  const status = checkColdStartThreshold(totalDecisions, distinctSeeds);

  if (status.cold_start_complete) {
    return { allowed: true, status, reason: null };
  }

  const reasons: string[] = [];
  if (!status.decisions_met) {
    reasons.push(
      `Need ${COLD_START_DECISION_THRESHOLD} decisions, have ${totalDecisions}`,
    );
  }
  if (!status.seeds_met) {
    reasons.push(
      `Need ${COLD_START_SEED_THRESHOLD} distinct seeds, have ${distinctSeeds}`,
    );
  }

  return {
    allowed: false,
    status,
    reason: reasons.join('; '),
  };
}

/**
 * Enforce the cold-start gate. Throws if calibration is not yet allowed.
 * Use this before any weight-update or calibration operation.
 */
export function enforceCalibrationGate(
  totalDecisions: number,
  distinctSeeds: number,
): void {
  const gate = isColdStartComplete(totalDecisions, distinctSeeds);
  if (!gate.allowed) {
    throw new CalibrationGateError(gate.reason!);
  }
}

// -------------------------------------------------------------------
// Error class
// -------------------------------------------------------------------

export class CalibrationGateError extends Error {
  constructor(reason: string) {
    super(`Calibration gate not met: ${reason}`);
    this.name = 'CalibrationGateError';
  }
}
