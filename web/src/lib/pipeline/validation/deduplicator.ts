/**
 * Exact deduplication (F4.3-T1).
 *
 * Detects exact duplicate entity mentions: same normalised_value +
 * same entity_type + same document_id + same evidence span.
 * Keeps the first occurrence; quarantines duplicates with
 * reason_code = 'duplicate_exact'.
 *
 * PRD ref: R1.5.6, §14
 */

import type { EntityMention } from '@/types/database';
import type { QuarantineItem } from './schema-validator';

export interface DeduplicationResult {
  unique: EntityMention[];
  duplicates: QuarantineItem[];
}

/**
 * Build a dedup key from the fields that define an exact duplicate.
 */
function dedupKey(mention: EntityMention): string {
  return [
    mention.normalised_value,
    mention.entity_type,
    mention.document_id,
    String(mention.span_start),
    String(mention.span_end),
  ].join('||');
}

/**
 * Remove exact-duplicate entity mentions.
 * First occurrence is kept; subsequent duplicates are quarantined.
 */
export function deduplicateExact(mentions: EntityMention[]): DeduplicationResult {
  const seen = new Set<string>();
  const unique: EntityMention[] = [];
  const duplicates: QuarantineItem[] = [];

  for (const mention of mentions) {
    const key = dedupKey(mention);
    if (seen.has(key)) {
      duplicates.push({
        source_record: mention as unknown as Record<string, unknown>,
        reason_code: 'duplicate_exact',
        details: `Exact duplicate of earlier mention: ${mention.normalised_value} (${mention.entity_type})`,
      });
    } else {
      seen.add(key);
      unique.push(mention);
    }
  }

  return { unique, duplicates };
}
