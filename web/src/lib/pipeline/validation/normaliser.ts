/**
 * Normalisation functions (F4.2-T1 through F4.2-T4).
 *
 * - Name normalisation: canonical casing, title removal, alias capture (R1.5.4)
 * - Address normalisation: UK postcode extraction via regex (R1.5.3, v1 fallback)
 * - Registration number normalisation: zero-padding, format validation (R1.5.5)
 * - Always preserves both raw_value and normalised_value (R1.5.7)
 *
 * PRD refs: R1.5.3, R1.5.4, R1.5.5, R1.5.7, §14
 */

// -------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------

/** Titles to strip during name normalisation. Order: longest first. */
const NAME_TITLES = [
  'professor', 'prof',
  'reverend', 'rev',
  'dame', 'sir',
  'lord', 'lady',
  'dr', 'mr', 'mrs', 'ms', 'miss',
];

/** Regex that matches any title at the start, case-insensitive. */
const TITLE_RE = new RegExp(
  `^(${NAME_TITLES.join('|')})\\.?\\s+`,
  'i',
);

/**
 * UK postcode regex. Matches standard UK formats:
 * A9 9AA, A99 9AA, A9A 9AA, AA9 9AA, AA99 9AA, AA9A 9AA
 * Allows optional space between outward and inward parts.
 */
const UK_POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;

// -------------------------------------------------------------------
// Name normalisation (R1.5.4)
// -------------------------------------------------------------------

export interface NormalisedName {
  normalised: string;
  aliases: string[];
}

/**
 * Normalise a person name: canonical title-case, title removal, alias capture.
 * "MR JOHN SMITH" -> { normalised: "John Smith", aliases: ["Mr John Smith"] }
 */
export function normaliseName(raw: string): NormalisedName {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { normalised: '', aliases: [] };
  }

  // Title-case the whole string first for consistent alias capture
  const titleCased = toTitleCase(trimmed);

  // Strip title prefix
  const withoutTitle = titleCased.replace(TITLE_RE, '').trim();

  // If title was removed, the title-cased full form is an alias
  const aliases: string[] = [];
  if (withoutTitle !== titleCased) {
    aliases.push(titleCased);
  }

  // Collapse multiple spaces
  const normalised = withoutTitle.replace(/\s+/g, ' ');

  return { normalised, aliases };
}

/** Convert a string to Title Case. */
function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (ch) => ch.toUpperCase());
}

// -------------------------------------------------------------------
// Address normalisation (R1.5.3)
// -------------------------------------------------------------------

export interface NormalisedAddress {
  normalised: string;
  postcode?: string;
}

/**
 * Normalise a UK address: extract postcode, format consistently.
 * Uses regex as the v1 fallback per PRD R1.5.3 (no libpostal).
 */
export function normaliseAddress(raw: string): NormalisedAddress {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { normalised: '' };
  }

  // Extract postcode
  const match = trimmed.match(UK_POSTCODE_RE);
  let postcode: string | undefined;
  if (match) {
    // Canonical format: "SW1A 1AA" (outward + space + inward, uppercased)
    postcode = `${match[1].toUpperCase()} ${match[2].toUpperCase()}`;
  }

  // Normalise whitespace, collapse commas followed by spaces
  const normalised = trimmed
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .trim();

  return { normalised, postcode };
}

// -------------------------------------------------------------------
// Registration number normalisation (R1.5.5)
// -------------------------------------------------------------------

export interface NormalisedRegistration {
  normalised: string;
  valid: boolean;
}

/**
 * Normalise a registration number.
 * - Charity numbers: 6-7 digits, zero-pad to 7.
 * - Company numbers: 8 chars, zero-pad digits, handle SC/NI prefixes.
 */
export function normaliseRegistrationNumber(
  raw: string,
  type: 'charity' | 'company',
): NormalisedRegistration {
  const trimmed = raw.trim().toUpperCase();

  if (type === 'charity') {
    // Strip any non-digit characters
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length < 6 || digits.length > 7) {
      return { normalised: trimmed, valid: false };
    }
    // Zero-pad to 7 digits
    const normalised = digits.padStart(7, '0');
    return { normalised, valid: true };
  }

  if (type === 'company') {
    // Check for SC/NI prefix
    const prefixMatch = trimmed.match(/^(SC|NI)(\d+)$/);
    if (prefixMatch) {
      const prefix = prefixMatch[1];
      const digits = prefixMatch[2];
      if (digits.length > 6) {
        return { normalised: trimmed, valid: false };
      }
      // Pad digits to make total length 8 (prefix + digits)
      const normalised = prefix + digits.padStart(6, '0');
      return { normalised, valid: true };
    }

    // Pure numeric company number
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length < 1 || digits.length > 8) {
      return { normalised: trimmed, valid: false };
    }
    const normalised = digits.padStart(8, '0');
    return { normalised, valid: true };
  }

  return { normalised: trimmed, valid: false };
}
