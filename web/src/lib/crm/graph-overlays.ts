/**
 * Dimension overlays for the network graphs: per-node scoring metrics that
 * the graph components can encode as node size (wealth / path score /
 * affinity) or colour (hops from a supporter), instead of degree only.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export interface NodeMetrics {
  /** Wealth score 0–1 (attributes.wealth_score). */
  wealth: number | null;
  /** Best introduction-path score 0–100 (attributes.intro_paths[0].score). */
  path: number | null;
  /** Affinity proxy 0–100 from target category. */
  affinity: number | null;
  /** Hops from the nearest supporter (0 = supporter), null = unreached. */
  hops: number | null;
}

export type SizeBy = 'degree' | 'wealth' | 'paths' | 'affinity';
export type ColorBy = 'default' | 'hops';

export const SIZE_BY_OPTIONS: Array<{ value: SizeBy; label: string }> = [
  { value: 'degree', label: 'Size: connections' },
  { value: 'wealth', label: 'Size: wealth score' },
  { value: 'paths', label: 'Size: path score' },
  { value: 'affinity', label: 'Size: affinity' },
];

const AFFINITY_BY_CATEGORY: Record<string, number> = {
  hnw_target: 80,
  charity_donor: 60,
  wealth_identified: 40,
};

/** Scale a metric into NetworkGraph's connectionCount domain (radius = sqrt(v)*2.5+4). */
export function sizeValue(sizeBy: SizeBy, m: NodeMetrics | undefined, degree: number): number {
  switch (sizeBy) {
    case 'wealth': return m?.wealth != null ? Math.max(0.5, m.wealth * 40) : 0.5;
    case 'paths': return m?.path != null ? Math.max(0.5, m.path * 0.4) : 0.5;
    case 'affinity': return m?.affinity != null ? Math.max(0.5, m.affinity * 0.4) : 0.5;
    default: return degree;
  }
}

export const HOP_COLORS: Record<string, string> = {
  '0': '#2f6f6b',   // supporter
  '1': '#c9a227',   // 1 hop
  '2': '#6b7280',   // 2 hops
  none: '#3a3f45',  // unreached
};

/** Slim per-entity metric load (paged; JSON-path selects keep the payload small). */
export async function loadNodeMetrics(supabase: SupabaseClient): Promise<Record<string, NodeMetrics>> {
  const out: Record<string, NodeMetrics> = {};
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('canonical_entities')
      .select('canonical_entity_id, ws:attributes->wealth_score, ps:attributes->intro_paths->0->score, deg:attributes->introduction->degree, cat:attributes->>target_category')
      .eq('entity_type', 'person')
      .range(offset, offset + 999);
    if (error || !data?.length) break;
    for (const r of data as Array<{ canonical_entity_id: string; ws: number | null; ps: number | null; deg: number | null; cat: string | null }>) {
      out[r.canonical_entity_id] = {
        wealth: typeof r.ws === 'number' ? r.ws : null,
        path: typeof r.ps === 'number' ? r.ps : null,
        affinity: r.cat ? (AFFINITY_BY_CATEGORY[r.cat] ?? 10) : null,
        hops: typeof r.deg === 'number' ? r.deg : null,
      };
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  return out;
}
