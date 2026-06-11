/**
 * Attribute-conflict detection (IDEA 13).
 *
 * An entity carries attributes from several sources that can disagree:
 *   - attributes.wealth_band     — LLM augmentation (web research)
 *   - wealth_estimates.band      — the deterministic wealth sweep (surfaced as
 *                                  entity.wealth.band, or .override.automated_band
 *                                  when a human has corrected it)
 *   - attributes.estimated_net_worth_gbp — a figure that implies a band of its own
 *   - attributes.sector          — may be stored both bare and inside a nested bag
 *
 * This flags those disagreements so an analyst can pick the trustworthy value.
 * Pure: no I/O. Honest to the data we actually hold — when sources agree (the
 * common case) it returns []. A human wealth override is NOT a conflict (it is
 * the resolution), so it is excluded.
 */

import type { EnrichedEntity, WealthBand } from './types';
import { WEALTH_BAND_LABELS } from './types';

export interface ConflictValue {
  value: string;
  source: string;
}

export interface AttributeConflict {
  field: string;
  /** The disagreeing values, each with where it came from. */
  values: ConflictValue[];
  /** Plain-language note on why these disagree (no fabrication). */
  detail: string;
}

/** Order weakest→strongest so we can compare bands as ranks. */
const BAND_RANK: Record<WealthBand, number> = {
  unknown: 0,
  '1m_5m': 1,
  '5m_25m': 2,
  '25m_100m': 3,
  '100m_plus': 4,
};

/**
 * Lower bound (in GBP) of each band, from the band labels (£1M–5M, £5M–25M, …).
 * Used to derive the band an `estimated_net_worth_gbp` figure implies.
 */
function bandFromNetWorth(nw: number): WealthBand {
  if (nw >= 100_000_000) return '100m_plus';
  if (nw >= 25_000_000) return '25m_100m';
  if (nw >= 5_000_000) return '5m_25m';
  if (nw >= 1_000_000) return '1m_5m';
  return 'unknown';
}

const KNOWN_BANDS = new Set<WealthBand>(['unknown', '1m_5m', '5m_25m', '25m_100m', '100m_plus']);
function asBand(v: unknown): WealthBand | null {
  return typeof v === 'string' && KNOWN_BANDS.has(v as WealthBand) ? (v as WealthBand) : null;
}

function bandLabel(b: WealthBand): string {
  return WEALTH_BAND_LABELS[b] ?? b;
}

/**
 * Detect attribute/evidence disagreements for one entity.
 * Returns [] when everything we can compare agrees.
 */
export function detectAttributeConflicts(entity: EnrichedEntity): AttributeConflict[] {
  const conflicts: AttributeConflict[] = [];
  const attrs = entity.attributes ?? {};

  // The sweep band is the automated estimate. If a human has overridden it,
  // compare against the ORIGINAL automated band, not the corrected one — the
  // override is the resolution, never itself a conflict.
  const sweepBand = entity.wealth?.override
    ? asBand(entity.wealth.override.automated_band)
    : asBand(entity.wealth?.band);
  const attrBand = asBand(attrs.wealth_band);

  // 1. LLM-augmented band vs the wealth-sweep band, when both are known and differ.
  if (sweepBand && attrBand && sweepBand !== 'unknown' && attrBand !== 'unknown' && sweepBand !== attrBand) {
    conflicts.push({
      field: 'wealth_band',
      values: [
        { value: bandLabel(attrBand), source: 'attributes (augmentation)' },
        { value: bandLabel(sweepBand), source: 'wealth_estimates (sweep)' },
      ],
      detail: `Augmentation says ${bandLabel(attrBand)} but the wealth sweep estimated ${bandLabel(sweepBand)}.`,
    });
  }

  // 2. estimated_net_worth_gbp implies a band — flag when it disagrees with the
  //    stated wealth_band by more than one rank (a one-band gap is boundary noise).
  const nw = typeof attrs.estimated_net_worth_gbp === 'number' ? attrs.estimated_net_worth_gbp : null;
  const statedBand = attrBand ?? sweepBand;
  if (nw != null && nw > 0 && statedBand && statedBand !== 'unknown') {
    const impliedBand = bandFromNetWorth(nw);
    if (impliedBand !== 'unknown' && Math.abs(BAND_RANK[impliedBand] - BAND_RANK[statedBand]) > 1) {
      conflicts.push({
        field: 'wealth_band',
        values: [
          { value: bandLabel(statedBand), source: 'stated wealth_band' },
          { value: `${bandLabel(impliedBand)} (£${nw.toLocaleString()})`, source: 'estimated_net_worth_gbp' },
        ],
        detail: `Stated band ${bandLabel(statedBand)} but the net-worth figure £${nw.toLocaleString()} implies ${bandLabel(impliedBand)}.`,
      });
    }
  }

  // 3. sector disagreement across sources — bare attributes.sector vs a nested
  //    enrichment bag's sector (some augmentation writes both). Case-insensitive.
  const bareSector = typeof attrs.sector === 'string' ? attrs.sector.trim() : '';
  const nested = (attrs.enrichment ?? attrs.augmentation) as Record<string, unknown> | undefined;
  const nestedSector = nested && typeof nested.sector === 'string' ? nested.sector.trim() : '';
  if (bareSector && nestedSector && bareSector.toLowerCase() !== nestedSector.toLowerCase()) {
    conflicts.push({
      field: 'sector',
      values: [
        { value: bareSector, source: 'attributes.sector' },
        { value: nestedSector, source: 'enrichment.sector' },
      ],
      detail: `Sector recorded as "${bareSector}" in one place and "${nestedSector}" in another.`,
    });
  }

  return conflicts;
}
