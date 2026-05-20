/**
 * Validation pipeline orchestrator.
 *
 * Runs Phase 1.5: schema validation -> normalisation -> deduplication ->
 * confidence refinement. Returns accepted mentions, quarantine items,
 * and a validation report.
 *
 * PRD refs: §14, R1.5.1–R1.5.9
 */

import type { EntityMention } from '@/types/database';
import { schemaValidate, type QuarantineItem } from './schema-validator';
import { normaliseName, normaliseAddress, normaliseRegistrationNumber } from './normaliser';
import { deduplicateExact } from './deduplicator';
import { refineConfidence } from './confidence';
import { buildValidationReport, type ValidationReport } from './report';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface ValidationPipelineResult {
  accepted: EntityMention[];
  quarantined: QuarantineItem[];
  report: ValidationReport;
}

// Re-export child types for consumers
export type { QuarantineItem } from './schema-validator';
export type { ValidationReport } from './report';

// -------------------------------------------------------------------
// Normalisation step
// -------------------------------------------------------------------

interface NormalisationStats {
  names: { normalised: number; total: number };
  addresses: { normalised: number; total: number };
  registrations: { normalised: number; total: number };
}

/**
 * Apply normalisation to all valid mentions, preserving raw_value (R1.5.7).
 * Returns a new array of mentions with normalised_value populated.
 */
function normaliseMentions(mentions: EntityMention[]): {
  normalised: EntityMention[];
  stats: NormalisationStats;
} {
  const stats: NormalisationStats = {
    names: { normalised: 0, total: 0 },
    addresses: { normalised: 0, total: 0 },
    registrations: { normalised: 0, total: 0 },
  };

  const normalised = mentions.map((mention) => {
    const copy = { ...mention };

    switch (mention.entity_type) {
      case 'person': {
        stats.names.total++;
        const result = normaliseName(mention.raw_value);
        if (result.normalised) {
          copy.normalised_value = result.normalised;
          // Store aliases in attributes
          if (result.aliases.length > 0) {
            copy.attributes = { ...mention.attributes, aliases: result.aliases };
          }
          stats.names.normalised++;
        }
        break;
      }

      case 'address': {
        stats.addresses.total++;
        const result = normaliseAddress(mention.raw_value);
        if (result.normalised) {
          copy.normalised_value = result.normalised;
          if (result.postcode) {
            copy.attributes = { ...mention.attributes, postcode: result.postcode };
          }
          stats.addresses.normalised++;
        }
        break;
      }

      case 'registration_number': {
        stats.registrations.total++;
        const attrs = mention.attributes as Record<string, unknown> | null;
        const regType = attrs?.registration_type as 'charity' | 'company' | undefined;
        if (regType === 'charity' || regType === 'company') {
          const result = normaliseRegistrationNumber(mention.raw_value, regType);
          copy.normalised_value = result.normalised;
          copy.attributes = { ...mention.attributes, valid: result.valid };
          if (result.valid) {
            stats.registrations.normalised++;
          }
        }
        break;
      }

      default:
        // Organisations and others: basic whitespace normalisation
        copy.normalised_value = mention.raw_value.trim().replace(/\s+/g, ' ');
        break;
    }

    return copy;
  });

  return { normalised, stats };
}

// -------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------

/**
 * Run the full Phase 1.5 validation pipeline.
 *
 * 1. Schema-validate all mentions
 * 2. Normalise valid mentions
 * 3. Deduplicate
 * 4. Refine confidence
 * 5. Build report
 */
export function validateAndNormalise(
  mentions: EntityMention[],
  documentId: string,
  runId: string,
): ValidationPipelineResult {
  const allQuarantined: QuarantineItem[] = [];

  // Step 1: Schema validation (R1.5.1, R1.5.2, R1.5.8)
  const { valid: schemaValid, quarantined: schemaQuarantined } =
    schemaValidate(mentions, documentId, runId);
  allQuarantined.push(...schemaQuarantined);

  // Step 2: Normalisation (R1.5.3, R1.5.4, R1.5.5, R1.5.7)
  const { normalised, stats } = normaliseMentions(schemaValid);

  // Step 3: Deduplication (R1.5.6)
  const { unique, duplicates } = deduplicateExact(normalised);
  allQuarantined.push(...duplicates);

  // Step 4: Confidence refinement (R1.8)
  const { accepted, quarantined: lowConfidence } = refineConfidence(unique);
  allQuarantined.push(...lowConfidence);

  // Step 5: Build report (R1.5.9)
  const report = buildValidationReport(runId, accepted.length, allQuarantined, stats);

  return { accepted, quarantined: allQuarantined, report };
}
