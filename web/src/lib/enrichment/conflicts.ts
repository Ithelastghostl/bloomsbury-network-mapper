/**
 * Conflicting signal detection per PRD R4.7.
 *
 * Conflicting signals are stored and surfaced as warnings in the dossier.
 * Per §17.4: "Conflicting match → Store conflict, show warning."
 */

import type { EnrichmentSignalPayload } from './types';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface SignalConflict {
  /** Type of conflict detected */
  type: ConflictType;
  /** The two signals that conflict */
  signalA: EnrichmentSignalPayload;
  signalB: EnrichmentSignalPayload;
  /** Human-readable description of the conflict */
  description: string;
  /** Severity: how much this conflict should concern a reviewer */
  severity: 'low' | 'medium' | 'high';
}

export type ConflictType =
  | 'name_mismatch'        // Same external ID but different names
  | 'role_conflict'        // Incompatible roles in the same time period
  | 'date_conflict'        // Conflicting dates (e.g. DOB, appointment)
  | 'registration_conflict' // Conflicting registration numbers
  | 'source_disagreement'; // Different sources assign very different confidences

// -------------------------------------------------------------------
// Conflict detection
// -------------------------------------------------------------------

/**
 * Detect conflicts among a set of enrichment signals for the same entity.
 * Returns all detected conflicts (R4.7).
 */
export function detectConflicts(
  signals: EnrichmentSignalPayload[],
): SignalConflict[] {
  const conflicts: SignalConflict[] = [];

  for (let i = 0; i < signals.length; i++) {
    for (let j = i + 1; j < signals.length; j++) {
      const a = signals[i];
      const b = signals[j];

      // 1. Same external record from different sources with large confidence gap
      if (a.external_record_id === b.external_record_id && a.source !== b.source) {
        const gap = Math.abs(a.match_confidence - b.match_confidence);
        if (gap > 0.30) {
          conflicts.push({
            type: 'source_disagreement',
            signalA: a,
            signalB: b,
            description: `Sources ${a.source} and ${b.source} assign very different confidence (${a.match_confidence.toFixed(2)} vs ${b.match_confidence.toFixed(2)}) to the same external record ${a.external_record_id}`,
            severity: gap > 0.50 ? 'high' : 'medium',
          });
        }
      }

      // 2. Same source, similar external records with conflicting names
      if (a.source === b.source) {
        const nameA = extractName(a);
        const nameB = extractName(b);
        if (nameA && nameB && a.external_record_id !== b.external_record_id) {
          // Both high-confidence but different names suggest the source found
          // multiple different people
          if (a.match_confidence >= 0.75 && b.match_confidence >= 0.75) {
            const normalized = [nameA.toLowerCase().trim(), nameB.toLowerCase().trim()];
            if (normalized[0] !== normalized[1]) {
              conflicts.push({
                type: 'name_mismatch',
                signalA: a,
                signalB: b,
                description: `Source ${a.source} matched two high-confidence records with different names: "${nameA}" vs "${nameB}"`,
                severity: 'high',
              });
            }
          }
        }
      }

      // 3. Conflicting roles in the same time period
      const roleConflict = detectRoleConflict(a, b);
      if (roleConflict) {
        conflicts.push(roleConflict);
      }

      // 4. Conflicting dates (e.g. DOB)
      const dateConflict = detectDateConflict(a, b);
      if (dateConflict) {
        conflicts.push(dateConflict);
      }

      // 5. Conflicting registration numbers
      const regConflict = detectRegistrationConflict(a, b);
      if (regConflict) {
        conflicts.push(regConflict);
      }
    }
  }

  return conflicts;
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function extractName(signal: EnrichmentSignalPayload): string | null {
  const payload = signal.signal_payload;
  return (
    (payload.officer_name as string) ??
    (payload.trustee_name as string) ??
    (payload.label as string) ??
    (payload.title as string) ??
    null
  );
}

function detectRoleConflict(
  a: EnrichmentSignalPayload,
  b: EnrichmentSignalPayload,
): SignalConflict | null {
  // Only relevant if both are officer/trustee signals
  const roleA = (a.signal_payload.officer_role as string) ?? (a.signal_payload.trustee_role as string);
  const roleB = (b.signal_payload.officer_role as string) ?? (b.signal_payload.trustee_role as string);

  if (!roleA || !roleB) return null;

  // Mutually exclusive roles in the same period
  const exclusiveRoles = [
    ['director', 'secretary'],
    ['chair', 'trustee'],
  ];

  const normA = roleA.toLowerCase();
  const normB = roleB.toLowerCase();

  for (const [r1, r2] of exclusiveRoles) {
    if ((normA.includes(r1) && normB.includes(r2)) || (normA.includes(r2) && normB.includes(r1))) {
      // Check if time periods overlap
      if (periodsOverlap(a.signal_payload, b.signal_payload)) {
        return {
          type: 'role_conflict',
          signalA: a,
          signalB: b,
          description: `Conflicting roles "${roleA}" and "${roleB}" in overlapping time periods`,
          severity: 'medium',
        };
      }
    }
  }

  return null;
}

function detectDateConflict(
  a: EnrichmentSignalPayload,
  b: EnrichmentSignalPayload,
): SignalConflict | null {
  const dobA = a.signal_payload.date_of_birth as { month?: number; year?: number } | null;
  const dobB = b.signal_payload.date_of_birth as { month?: number; year?: number } | null;

  if (!dobA || !dobB) return null;
  if (dobA.year == null || dobB.year == null) return null;

  if (dobA.year !== dobB.year || (dobA.month != null && dobB.month != null && dobA.month !== dobB.month)) {
    return {
      type: 'date_conflict',
      signalA: a,
      signalB: b,
      description: `Conflicting dates of birth: ${dobA.year}${dobA.month ? '-' + dobA.month : ''} vs ${dobB.year}${dobB.month ? '-' + dobB.month : ''}`,
      severity: 'high',
    };
  }

  return null;
}

function detectRegistrationConflict(
  a: EnrichmentSignalPayload,
  b: EnrichmentSignalPayload,
): SignalConflict | null {
  const regA = (a.signal_payload.company_number as string) ?? (a.signal_payload.charity_number as string);
  const regB = (b.signal_payload.company_number as string) ?? (b.signal_payload.charity_number as string);

  if (!regA || !regB) return null;

  // Same source, different registration numbers, both high confidence
  if (
    a.source === b.source &&
    regA !== regB &&
    a.match_confidence >= 0.55 &&
    b.match_confidence >= 0.55
  ) {
    return {
      type: 'registration_conflict',
      signalA: a,
      signalB: b,
      description: `Same source ${a.source} matched records with different registration numbers: ${regA} vs ${regB}`,
      severity: 'medium',
    };
  }

  return null;
}

function periodsOverlap(
  payloadA: Record<string, unknown>,
  payloadB: Record<string, unknown>,
): boolean {
  const startA = payloadA.appointed_on as string | null ?? payloadA.date_of_appointment as string | null;
  const endA = payloadA.resigned_on as string | null;
  const startB = payloadB.appointed_on as string | null ?? payloadB.date_of_appointment as string | null;
  const endB = payloadB.resigned_on as string | null;

  // If no date info, assume overlap (conservative)
  if (!startA && !startB) return true;

  const sA = startA ? new Date(startA) : new Date(0);
  const eA = endA ? new Date(endA) : new Date('2099-12-31');
  const sB = startB ? new Date(startB) : new Date(0);
  const eB = endB ? new Date(endB) : new Date('2099-12-31');

  return sA <= eB && sB <= eA;
}
