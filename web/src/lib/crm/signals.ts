/**
 * Unified enrichment-signal model.
 *
 * The real signal data lives in TWO stores (the `enrichment_signals` and
 * `donation_events` tables are empty in this dataset — do not depend on them):
 *
 *   1. `wealth_estimates.evidence` — structured scoring signals with
 *      {signal, detail, contribution, source_layer}: active_directorships,
 *      co_director_network, philanthropy, property_signals, rich_list_mention,
 *      billionaire_reference, million_reference, fund_management, …
 *   2. `enrichment_evidence` — sourced facts with {source, source_layer,
 *      evidence_text, evidence_url, confidence}: companies_house (with filing
 *      URLs), web_search, charity_commission, …
 *
 * This module reads both, normalises them into one typed `EntitySignals` per
 * entity, and is the single source every surface uses: the Observe signal
 * column, the Orient signal visualisation, the Decide toggles, and the
 * per-connection dossier.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

/** Coarse signal categories the UI groups by. */
export type SignalCategory =
  | 'directorship'
  | 'co_director'
  | 'philanthropy'
  | 'property'
  | 'rich_list'
  | 'fund_management'
  | 'political'
  | 'charity'
  | 'news'
  | 'web'
  | 'other';

export const SIGNAL_CATEGORY_LABEL: Record<SignalCategory, string> = {
  directorship: 'Directorships',
  co_director: 'Co-director network',
  philanthropy: 'Philanthropy',
  property: 'Property',
  rich_list: 'Rich-list / press',
  fund_management: 'Fund management',
  political: 'Political donations',
  charity: 'Charity / Commission',
  news: 'News coverage',
  web: 'Web research',
  other: 'Other',
};

export interface Signal {
  category: SignalCategory;
  label: string;
  detail: string;
  /** 'A' official registry, 'B' web/secondary, 'C' manual. */
  sourceLayer: string;
  source: string;
  sourceUrl: string | null;
  /** Wealth-score contribution 0–1 when this came from wealth_estimates. */
  contribution: number | null;
  /** Match/evidence confidence 0–1 when from enrichment_evidence. */
  confidence: number | null;
  /** ISO timestamp when the evidence was recorded (freshness). */
  at: string | null;
}

export interface EntitySignals {
  entityId: string;
  signals: Signal[];
  /** Per-category counts, for chips and the coverage matrix. */
  byCategory: Record<string, number>;
  /** Distinct source systems backing this entity (corroboration breadth). */
  sources: string[];
  /** True when ≥2 distinct source systems back the entity (§18.2 corroboration). */
  multiSource: boolean;
  /** Newest evidence timestamp (freshness). */
  newestAt: string | null;
}

/** Map a wealth-evidence `signal` key to a category. */
function wealthSignalCategory(signal: string): SignalCategory {
  const s = signal.toLowerCase();
  if (s.includes('co_director') || s.includes('co-director')) return 'co_director';
  if (s.includes('director')) return 'directorship';
  if (s.includes('philanthrop')) return 'philanthropy';
  if (s.includes('property') || s.includes('real_estate') || s.includes('land')) return 'property';
  if (s.includes('rich_list') || s.includes('billionaire') || s.includes('million') || s.includes('forbes')) return 'rich_list';
  if (s.includes('fund') || s.includes('asset_management')) return 'fund_management';
  if (s.includes('charit') || s.includes('trust') || s.includes('foundation')) return 'charity';
  return 'other';
}

/** Map an enrichment_evidence row (source + text) to a category. */
function evidenceCategory(source: string, text: string): SignalCategory {
  const src = source.toLowerCase();
  const t = (text ?? '').toLowerCase();
  if (src.includes('companies_house')) return /trustee|charit|foundation/.test(t) ? 'charity' : 'directorship';
  if (src.includes('charity_commission') || src.includes('360giving')) return 'charity';
  if (src.includes('electoral')) return 'political';
  if (src.includes('land_registry')) return 'property';
  if (src.includes('forbes') || src.includes('rich')) return 'rich_list';
  if (src.includes('news') || src.includes('guardian') || src.includes('gdelt')) return 'news';
  if (src.includes('web_search') || src.includes('wiki')) return 'web';
  return 'other';
}

interface WealthRow { entity_id: string; evidence: unknown; assessed_at: string }
interface EvidenceRow { entity_id: string; source: string; source_layer: string; evidence_text: string; evidence_url: string | null; confidence: number; created_at: string }

async function chunkedIn<T>(supabase: SupabaseClient, table: string, columns: string, column: string, ids: string[]): Promise<T[]> {
  if (!ids.length) return [];
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from(table).select(columns).in(column, ids.slice(i, i + 200));
    if (data) out.push(...(data as T[]));
  }
  return out;
}

/** Build a Signal[] for one entity from its raw rows. */
function buildSignals(wealthRows: WealthRow[], evidenceRows: EvidenceRow[]): Signal[] {
  const signals: Signal[] = [];

  // Wealth-estimate evidence — keep only the newest estimate's evidence per entity.
  const latest = wealthRows.sort((a, b) => String(b.assessed_at).localeCompare(String(a.assessed_at)))[0];
  if (latest && Array.isArray(latest.evidence)) {
    for (const e of latest.evidence as Array<{ signal?: string; detail?: string; contribution?: number; source_layer?: string }>) {
      if (!e.signal) continue;
      signals.push({
        category: wealthSignalCategory(e.signal),
        label: e.signal.replace(/_/g, ' '),
        detail: e.detail ?? '',
        sourceLayer: e.source_layer ?? 'A',
        source: 'wealth_model',
        sourceUrl: null,
        contribution: typeof e.contribution === 'number' ? e.contribution : null,
        confidence: null,
        at: latest.assessed_at ?? null,
      });
    }
  }

  for (const e of evidenceRows) {
    signals.push({
      category: evidenceCategory(e.source, e.evidence_text),
      label: e.source.replace(/_/g, ' '),
      detail: e.evidence_text ?? '',
      sourceLayer: e.source_layer ?? 'B',
      source: e.source,
      sourceUrl: e.evidence_url,
      contribution: null,
      confidence: typeof e.confidence === 'number' ? e.confidence : null,
      at: e.created_at ?? null,
    });
  }
  return signals;
}

function summarise(entityId: string, signals: Signal[]): EntitySignals {
  const byCategory: Record<string, number> = {};
  const sources = new Set<string>();
  let newestAt: string | null = null;
  for (const s of signals) {
    byCategory[s.category] = (byCategory[s.category] ?? 0) + 1;
    sources.add(s.source);
    if (s.at && (!newestAt || s.at > newestAt)) newestAt = s.at;
  }
  return {
    entityId,
    signals,
    byCategory,
    sources: [...sources],
    multiSource: sources.size >= 2,
    newestAt,
  };
}

/**
 * Build an EntitySignals from rows ALREADY loaded elsewhere (e.g. enrichEntities
 * has the wealth_estimates + enrichment_evidence rows in hand). Avoids a second
 * round-trip. `wealthEvidence` is the parsed `evidence` array from the entity's
 * latest wealth estimate (or null); `evidenceRows` is its enrichment_evidence.
 */
export function buildEntitySignalsFromRows(
  entityId: string,
  wealthEvidence: Array<{ signal?: string; detail?: string; contribution?: number; source_layer?: string }> | null,
  wealthAt: string | null,
  evidenceRows: Array<{ source: string; source_layer: string; evidence_text: string; evidence_url: string | null; confidence: number; created_at: string }>,
): EntitySignals {
  const wealthRows: WealthRow[] = wealthEvidence ? [{ entity_id: entityId, evidence: wealthEvidence, assessed_at: wealthAt ?? '' }] : [];
  const evRows: EvidenceRow[] = evidenceRows.map(e => ({ entity_id: entityId, ...e }));
  return summarise(entityId, buildSignals(wealthRows, evRows));
}

/** Load + normalise signals for one entity. */
export async function loadEntitySignals(supabase: SupabaseClient, entityId: string): Promise<EntitySignals> {
  const [wealth, evidence] = await Promise.all([
    supabase.from('wealth_estimates').select('entity_id, evidence, assessed_at').eq('entity_id', entityId),
    supabase.from('enrichment_evidence').select('entity_id, source, source_layer, evidence_text, evidence_url, confidence, created_at').eq('entity_id', entityId).order('created_at', { ascending: false }),
  ]);
  return summarise(entityId, buildSignals(wealth.data ?? [], evidence.data ?? []));
}

/** Batch-load signal summaries for many entities (chunked). Returns a map by id. */
export async function loadSignalsForEntities(supabase: SupabaseClient, ids: string[]): Promise<Map<string, EntitySignals>> {
  const [wealthRows, evidenceRows] = await Promise.all([
    chunkedIn<WealthRow>(supabase, 'wealth_estimates', 'entity_id, evidence, assessed_at', 'entity_id', ids),
    chunkedIn<EvidenceRow>(supabase, 'enrichment_evidence', 'entity_id, source, source_layer, evidence_text, evidence_url, confidence, created_at', 'entity_id', ids),
  ]);
  const wealthByEntity = new Map<string, WealthRow[]>();
  for (const w of wealthRows) (wealthByEntity.get(w.entity_id) ?? wealthByEntity.set(w.entity_id, []).get(w.entity_id)!).push(w);
  const evByEntity = new Map<string, EvidenceRow[]>();
  for (const e of evidenceRows) (evByEntity.get(e.entity_id) ?? evByEntity.set(e.entity_id, []).get(e.entity_id)!).push(e);

  const out = new Map<string, EntitySignals>();
  for (const id of ids) {
    out.set(id, summarise(id, buildSignals(wealthByEntity.get(id) ?? [], evByEntity.get(id) ?? [])));
  }
  return out;
}
