/**
 * Gold-set comparison tooling — F2.2-T4.
 * PRD ref: §7.2, §13 — compare extraction output against gold labels.
 *
 * Calculates precision, recall, F1 per entity type and aggregate.
 * Entity types: person, organisation, address, registration_number,
 *               donation, role, date.
 */

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

/** Entity types covered by gold-set evaluation. */
export type GoldEntityType =
  | 'person'
  | 'organisation'
  | 'address'
  | 'registration_number'
  | 'donation'
  | 'role'
  | 'date';

export const GOLD_ENTITY_TYPES: GoldEntityType[] = [
  'person',
  'organisation',
  'address',
  'registration_number',
  'donation',
  'role',
  'date',
];

/** A single labelled entity in the gold set. */
export interface GoldLabel {
  entity_type: GoldEntityType;
  normalised_value: string;
  /** Optional: document-level identifier for multi-doc comparisons. */
  document_id?: string;
}

/** A single extracted entity from the pipeline. */
export interface ExtractionResult {
  entity_type: GoldEntityType;
  normalised_value: string;
  document_id?: string;
}

/** Precision/recall/F1 scores for one entity type. */
export interface TypeScore {
  entity_type: GoldEntityType;
  true_positives: number;
  false_positives: number;
  false_negatives: number;
  precision: number;
  recall: number;
  f1: number;
}

/** A single mismatch between extraction and gold set. */
export interface Mismatch {
  entity_type: GoldEntityType;
  kind: 'false_positive' | 'false_negative';
  value: string;
  document_id?: string;
}

/** Full comparison result. */
export interface GoldSetComparisonResult {
  per_type: TypeScore[];
  aggregate: {
    precision: number;
    recall: number;
    f1: number;
  };
  mismatches: Mismatch[];
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

function safeDiv(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function computeF1(precision: number, recall: number): number {
  const sum = precision + recall;
  return sum === 0 ? 0 : (2 * precision * recall) / sum;
}

// -------------------------------------------------------------------
// Core comparison
// -------------------------------------------------------------------

/**
 * Compare extraction results against gold labels.
 * Matching is done on (entity_type, normalised_value) pairs after
 * case-insensitive normalisation. When document_id is present on both
 * sides, it is included in the match key.
 */
export function compareGoldSet(
  extracted: ExtractionResult[],
  goldLabels: GoldLabel[],
): GoldSetComparisonResult {
  const perType: TypeScore[] = [];
  const mismatches: Mismatch[] = [];

  let totalTp = 0;
  let totalFp = 0;
  let totalFn = 0;

  for (const entityType of GOLD_ENTITY_TYPES) {
    const extractedOfType = extracted.filter(e => e.entity_type === entityType);
    const goldOfType = goldLabels.filter(g => g.entity_type === entityType);

    const extractedKeys = new Set(
      extractedOfType.map(e => makeKey(e)),
    );
    const goldKeys = new Set(
      goldOfType.map(g => makeKey(g)),
    );

    let tp = 0;
    let fp = 0;
    let fn = 0;

    // True positives and false positives
    for (const e of extractedOfType) {
      const key = makeKey(e);
      if (goldKeys.has(key)) {
        tp++;
      } else {
        fp++;
        mismatches.push({
          entity_type: entityType,
          kind: 'false_positive',
          value: e.normalised_value,
          document_id: e.document_id,
        });
      }
    }

    // False negatives
    for (const g of goldOfType) {
      const key = makeKey(g);
      if (!extractedKeys.has(key)) {
        fn++;
        mismatches.push({
          entity_type: entityType,
          kind: 'false_negative',
          value: g.normalised_value,
          document_id: g.document_id,
        });
      }
    }

    const precision = safeDiv(tp, tp + fp);
    const recall = safeDiv(tp, tp + fn);
    const f1 = computeF1(precision, recall);

    perType.push({ entity_type: entityType, true_positives: tp, false_positives: fp, false_negatives: fn, precision, recall, f1 });

    totalTp += tp;
    totalFp += fp;
    totalFn += fn;
  }

  const aggPrecision = safeDiv(totalTp, totalTp + totalFp);
  const aggRecall = safeDiv(totalTp, totalTp + totalFn);
  const aggF1 = computeF1(aggPrecision, aggRecall);

  return {
    per_type: perType,
    aggregate: { precision: aggPrecision, recall: aggRecall, f1: aggF1 },
    mismatches,
  };
}

// -------------------------------------------------------------------
// Internal key builder
// -------------------------------------------------------------------

function makeKey(item: { entity_type: string; normalised_value: string; document_id?: string }): string {
  const base = `${item.entity_type}::${normalise(item.normalised_value)}`;
  return item.document_id ? `${item.document_id}::${base}` : base;
}
