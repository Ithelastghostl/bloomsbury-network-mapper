/**
 * Confidence refinement (F4.1-T4).
 *
 * Refines extraction_confidence after validation:
 * - Low extraction confidence (below 0.40) -> quarantine with 'low_extraction_confidence'
 * - Boost confidence if: registration number validates, name appears multiple times,
 *   address has valid postcode
 * - Reduce confidence if: evidence span is very short (<20 chars), entity appears
 *   only once in document
 *
 * PRD refs: R1.8, §14, Appendix A thresholds
 */

import type { EntityMention } from '@/types/database';
import type { QuarantineItem } from './schema-validator';

// -------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------

const LOW_CONFIDENCE_THRESHOLD = 0.40;
const SHORT_EVIDENCE_THRESHOLD = 20;

/** Adjustment amounts — kept small to avoid overshooting 0-1 range. */
const BOOST_REG_NUMBER_VALID = 0.05;
const BOOST_NAME_REPEATED = 0.05;
const BOOST_POSTCODE_PRESENT = 0.03;
const PENALTY_SHORT_EVIDENCE = -0.05;
const PENALTY_SINGLE_OCCURRENCE = -0.03;

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface ConfidenceResult {
  accepted: EntityMention[];
  quarantined: QuarantineItem[];
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

/** Count how many times each normalised_value appears per entity_type. */
function buildFrequencyMap(mentions: EntityMention[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of mentions) {
    const key = `${m.entity_type}||${m.normalised_value}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Clamp a number to [0, 1]. */
function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

// -------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------

/**
 * Refine confidence scores and quarantine low-confidence mentions.
 *
 * Mutates extraction_confidence on accepted mentions (boosts/penalties).
 * Returns new arrays — does not modify the input array.
 */
export function refineConfidence(mentions: EntityMention[]): ConfidenceResult {
  const freq = buildFrequencyMap(mentions);
  const accepted: EntityMention[] = [];
  const quarantined: QuarantineItem[] = [];

  for (const mention of mentions) {
    // Start with extraction confidence
    let conf = mention.extraction_confidence;

    // --- Boosts ---

    // Registration number validates (entity has valid reg in attributes)
    const attrs = mention.attributes as Record<string, unknown> | null;
    if (mention.entity_type === 'registration_number' && attrs?.valid === true) {
      conf += BOOST_REG_NUMBER_VALID;
    }

    // Name appears multiple times in document
    const freqKey = `${mention.entity_type}||${mention.normalised_value}`;
    const occurrences = freq.get(freqKey) ?? 1;
    if (mention.entity_type === 'person' && occurrences > 1) {
      conf += BOOST_NAME_REPEATED;
    }

    // Address has valid postcode
    if (mention.entity_type === 'address' && attrs?.postcode) {
      conf += BOOST_POSTCODE_PRESENT;
    }

    // --- Penalties ---

    // Evidence span is very short
    if (mention.evidence_span && mention.evidence_span.length < SHORT_EVIDENCE_THRESHOLD) {
      conf += PENALTY_SHORT_EVIDENCE;
    }

    // Entity appears only once in document
    if (occurrences === 1) {
      conf += PENALTY_SINGLE_OCCURRENCE;
    }

    conf = clamp01(conf);

    // Quarantine if below threshold after adjustments
    if (conf < LOW_CONFIDENCE_THRESHOLD) {
      quarantined.push({
        source_record: mention as unknown as Record<string, unknown>,
        reason_code: 'low_extraction_confidence',
        details: `Confidence ${conf.toFixed(3)} below threshold ${LOW_CONFIDENCE_THRESHOLD}`,
      });
      continue;
    }

    // Update confidence on a shallow copy (preserve input immutability)
    accepted.push({ ...mention, extraction_confidence: conf });
  }

  return { accepted, quarantined };
}
