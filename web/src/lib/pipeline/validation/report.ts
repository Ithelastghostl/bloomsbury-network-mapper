/**
 * Validation report generator (F4.3-T2).
 *
 * Produces per-reason-code counts and normalisation success rates
 * for a validation run.
 *
 * PRD ref: R1.5.9, §14
 */

import type { QuarantineItem } from './schema-validator';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface ValidationReport {
  run_id: string;
  accepted_count: number;
  quarantined_count: number;
  quarantined_by_reason: Record<string, number>;
  normalisation_rates: {
    names_normalised: number;
    names_total: number;
    names_rate: number;
    addresses_normalised: number;
    addresses_total: number;
    addresses_rate: number;
    registration_numbers_normalised: number;
    registration_numbers_total: number;
    registration_numbers_rate: number;
  };
}

// -------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------

/**
 * Build a validation report from pipeline results.
 *
 * @param runId - The pipeline run ID
 * @param acceptedCount - Number of accepted entity mentions
 * @param quarantined - All quarantine items from the validation pipeline
 * @param normalisationStats - Counts of successful/total normalisations by type
 */
export function buildValidationReport(
  runId: string,
  acceptedCount: number,
  quarantined: QuarantineItem[],
  normalisationStats: {
    names: { normalised: number; total: number };
    addresses: { normalised: number; total: number };
    registrations: { normalised: number; total: number };
  },
): ValidationReport {
  // Count quarantined by reason code
  const quarantinedByReason: Record<string, number> = {};
  for (const item of quarantined) {
    quarantinedByReason[item.reason_code] = (quarantinedByReason[item.reason_code] ?? 0) + 1;
  }

  const safeRate = (n: number, d: number) => (d === 0 ? 1 : n / d);

  return {
    run_id: runId,
    accepted_count: acceptedCount,
    quarantined_count: quarantined.length,
    quarantined_by_reason: quarantinedByReason,
    normalisation_rates: {
      names_normalised: normalisationStats.names.normalised,
      names_total: normalisationStats.names.total,
      names_rate: safeRate(normalisationStats.names.normalised, normalisationStats.names.total),
      addresses_normalised: normalisationStats.addresses.normalised,
      addresses_total: normalisationStats.addresses.total,
      addresses_rate: safeRate(normalisationStats.addresses.normalised, normalisationStats.addresses.total),
      registration_numbers_normalised: normalisationStats.registrations.normalised,
      registration_numbers_total: normalisationStats.registrations.total,
      registration_numbers_rate: safeRate(normalisationStats.registrations.normalised, normalisationStats.registrations.total),
    },
  };
}
