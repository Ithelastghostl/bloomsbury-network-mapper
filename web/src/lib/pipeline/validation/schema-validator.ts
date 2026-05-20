/**
 * Schema validation for extraction output (F4.1-T1, F4.1-T2, F4.1-T3).
 *
 * Validates every entity mention has required fields, plausible dates,
 * valid registration numbers, positive amounts, and non-empty evidence spans.
 * Records failing validation are quarantined with specific reason codes.
 *
 * PRD refs: R1.5.1, R1.5.2, R1.5.8, §14
 */

import type { EntityMention, Quarantine } from '@/types/database';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface SchemaValidationResult {
  valid: EntityMention[];
  quarantined: QuarantineItem[];
}

export interface QuarantineItem {
  source_record: Record<string, unknown>;
  reason_code: string;
  details: string;
}

// -------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------

const VALID_ENTITY_TYPES = ['person', 'organisation', 'address', 'registration_number'];
const MIN_DATE_YEAR = 1900;
const MAX_DATE_YEAR = 2030;

// Charity numbers: 6-7 digits
const CHARITY_NUMBER_RE = /^\d{6,7}$/;
// Company numbers: 8 chars, optional SC/NI prefix, rest digits
const COMPANY_NUMBER_RE = /^(?:SC|NI|[0-9])\d{7}$/i;

// -------------------------------------------------------------------
// Validation
// -------------------------------------------------------------------

/** Validate required fields are present and non-empty (R1.5.1). */
function validateRequiredFields(mention: EntityMention): string | null {
  if (!mention.entity_type || !VALID_ENTITY_TYPES.includes(mention.entity_type)) {
    return 'invalid or missing entity_type';
  }
  if (!mention.raw_value || mention.raw_value.trim() === '') {
    return 'missing raw_value';
  }
  if (mention.extraction_confidence == null || mention.extraction_confidence < 0 || mention.extraction_confidence > 1) {
    return 'invalid extraction_confidence';
  }
  return null;
}

/** Validate evidence span exists and has valid offsets (R1.5.2). */
function validateEvidence(mention: EntityMention): string | null {
  if (!mention.document_id || mention.document_id.trim() === '') {
    return 'missing source document';
  }
  if (!mention.evidence_span || mention.evidence_span.trim() === '') {
    return 'missing evidence span';
  }
  if (mention.span_start == null || mention.span_end == null) {
    return 'missing span offsets';
  }
  if (mention.span_start >= mention.span_end) {
    return 'span_start must be less than span_end';
  }
  return null;
}

/** Validate dates are in plausible range 1900-2030 (R1.5.8). */
function validateDates(mention: EntityMention): string | null {
  const attrs = mention.attributes as Record<string, unknown> | null;
  if (!attrs) return null;

  const dateFields = ['date_of_birth', 'date', 'year', 'valid_from', 'valid_to'];
  for (const field of dateFields) {
    const val = attrs[field];
    if (val == null) continue;

    let year: number | null = null;
    if (typeof val === 'number') {
      year = val;
    } else if (typeof val === 'string') {
      // Try to extract a 4-digit year
      const match = val.match(/(\d{4})/);
      if (match) year = parseInt(match[1], 10);
    }

    if (year != null && (year < MIN_DATE_YEAR || year > MAX_DATE_YEAR)) {
      return `impossible date: ${field}=${val} (year ${year} outside ${MIN_DATE_YEAR}-${MAX_DATE_YEAR})`;
    }
  }
  return null;
}

/** Validate registration numbers match expected formats (R1.5.8). */
function validateRegistrationNumber(mention: EntityMention): string | null {
  if (mention.entity_type !== 'registration_number') return null;

  const attrs = mention.attributes as Record<string, unknown> | null;
  const regType = attrs?.registration_type as string | undefined;
  const raw = mention.raw_value.trim();

  if (regType === 'charity' && !CHARITY_NUMBER_RE.test(raw)) {
    return `invalid charity number format: "${raw}" (expected 6-7 digits)`;
  }
  if (regType === 'company' && !COMPANY_NUMBER_RE.test(raw)) {
    return `invalid company number format: "${raw}" (expected 8 chars, optional SC/NI prefix)`;
  }
  return null;
}

/** Validate monetary amounts are positive (R1.5.8). */
function validateAmounts(mention: EntityMention): string | null {
  const attrs = mention.attributes as Record<string, unknown> | null;
  if (!attrs) return null;

  const amountFields = ['amount', 'donation_amount', 'value'];
  for (const field of amountFields) {
    const val = attrs[field];
    if (val != null && typeof val === 'number' && val <= 0) {
      return `non-positive monetary amount: ${field}=${val}`;
    }
  }
  return null;
}

// -------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------

/**
 * Run all schema validations on a list of entity mentions.
 * Returns valid mentions and quarantine items for failures.
 */
export function schemaValidate(
  mentions: EntityMention[],
  documentId: string,
  runId: string,
): SchemaValidationResult {
  const valid: EntityMention[] = [];
  const quarantined: QuarantineItem[] = [];

  for (const mention of mentions) {
    const checks: Array<{ fn: (m: EntityMention) => string | null; reasonCode: string }> = [
      { fn: validateRequiredFields, reasonCode: 'invalid_json' },
      { fn: validateEvidence, reasonCode: 'missing_evidence_span' },
      { fn: validateDates, reasonCode: 'impossible_date' },
      { fn: validateRegistrationNumber, reasonCode: 'invalid_registration_number' },
      { fn: validateAmounts, reasonCode: 'invalid_json' },
    ];

    let failed = false;
    for (const { fn, reasonCode } of checks) {
      const error = fn(mention);
      if (error) {
        quarantined.push({
          source_record: mention as unknown as Record<string, unknown>,
          reason_code: reasonCode,
          details: error,
        });
        failed = true;
        break; // first failure quarantines the record
      }
    }

    if (!failed) {
      valid.push(mention);
    }
  }

  return { valid, quarantined };
}
