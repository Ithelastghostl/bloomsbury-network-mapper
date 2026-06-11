/**
 * Analyst connection suppressions (app.connection_overrides).
 *
 * A suppression is a human decision that an edge is wrong or unusable. Per the
 * platform rule that human decisions always win, every graph builder, path
 * computation, and connection list must replay these overrides: suppressed
 * edges are filtered out at load time and must never resurface after
 * re-augmentation. Rows are never hard-deleted, so the decision is auditable.
 *
 * Pure module — usable from Next server code and from tsx scripts.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export interface OverrideRow {
  override_id: string;
  connection_id: string | null;
  co_director_edge_id: string | null;
  source_entity_id: string | null;
  connected_entity_id: string | null;
  action: 'remove' | 'downweight';
  reason: string | null;
  author: string;
  created_at: string;
}

/** Undirected pair key, order-independent (matches graph-queries pairKey). */
export function suppressionPairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Multiplier applied to a downweighted edge's tie-strength / path-score. A
 * downweight says "this tie is real but weak or suspect": the edge is kept (so
 * the graph stays connected) but its contribution is halved so warmer routes
 * outrank it. 0.5 is a deliberately blunt single knob — there is no per-edge
 * weight yet, and tuning is out of scope (no scoring change without approval).
 */
export const DOWNWEIGHT_FACTOR = 0.5;

export class SuppressionSet {
  readonly connectionIds = new Set<string>();
  readonly coDirectorEdgeIds = new Set<string>();
  readonly pairs = new Set<string>();
  /** Pairs an analyst marked "real but weak/suspect": kept, but down-scored. */
  readonly downweightedPairs = new Set<string>();
  readonly rows: OverrideRow[];

  constructor(rows: OverrideRow[]) {
    this.rows = rows;
    for (const r of rows) {
      if (r.action === 'downweight') {
        // Downweights never suppress — they only flag the pair as weak. A pair
        // suppressed by another row still wins (a removed edge is gone, period).
        if (r.source_entity_id && r.connected_entity_id) {
          this.downweightedPairs.add(suppressionPairKey(r.source_entity_id, r.connected_entity_id));
        }
        continue;
      }
      if (r.action !== 'remove') continue;
      if (r.connection_id) this.connectionIds.add(r.connection_id);
      if (r.co_director_edge_id) this.coDirectorEdgeIds.add(r.co_director_edge_id);
      if (r.source_entity_id && r.connected_entity_id) {
        this.pairs.add(suppressionPairKey(r.source_entity_id, r.connected_entity_id));
      }
    }
  }

  get size(): number {
    return this.rows.length;
  }

  isSuppressedPair(a: string | null | undefined, b: string | null | undefined): boolean {
    if (!a || !b) return false;
    return this.pairs.has(suppressionPairKey(a, b));
  }

  /** True when an analyst flagged this pair as a real-but-weak tie (downweight). */
  isDownweightedPair(a: string | null | undefined, b: string | null | undefined): boolean {
    if (!a || !b) return false;
    return this.downweightedPairs.has(suppressionPairKey(a, b));
  }

  /**
   * Tie-strength / path-score multiplier for a pair: DOWNWEIGHT_FACTOR when the
   * analyst flagged it weak, otherwise 1 (no change). A suppressed pair never
   * reaches here — those edges are filtered out before scoring.
   */
  downweightFactor(a: string | null | undefined, b: string | null | undefined): number {
    return this.isDownweightedPair(a, b) ? DOWNWEIGHT_FACTOR : 1;
  }

  isSuppressedConnection(row: {
    connection_id?: string | null;
    source_entity_id?: string | null;
    connected_entity_id?: string | null;
  }): boolean {
    if (row.connection_id && this.connectionIds.has(row.connection_id)) return true;
    return this.isSuppressedPair(row.source_entity_id, row.connected_entity_id);
  }

  isSuppressedCoDirector(row: {
    co_director_edge_id?: string | null;
    seed_entity_id?: string | null;
    co_director_entity_id?: string | null;
  }): boolean {
    if (row.co_director_edge_id && this.coDirectorEdgeIds.has(row.co_director_edge_id)) return true;
    return this.isSuppressedPair(row.seed_entity_id, row.co_director_entity_id);
  }
}

export const EMPTY_SUPPRESSIONS = new SuppressionSet([]);

/** Load all overrides. Small table; no pagination needed below 1000 rows. */
export async function loadSuppressions(supabase: SupabaseClient): Promise<SuppressionSet> {
  const rows: OverrideRow[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('connection_overrides')
      .select('*')
      .range(offset, offset + 999);
    if (error || !data?.length) break;
    rows.push(...(data as OverrideRow[]));
    if (data.length < 1000) break;
    offset += 1000;
  }
  return new SuppressionSet(rows);
}

/**
 * Drop suppressed intro paths from a person's attributes.intro_paths.
 * A path is dead if any adjacent id pair in path_ids is a suppressed pair.
 * Returns the surviving paths re-ranked, or null when nothing changed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pruneIntroPaths(attrs: Record<string, any>, sup: SuppressionSet): Record<string, any> | null {
  const paths = Array.isArray(attrs.intro_paths) ? attrs.intro_paths : null;
  if (!paths?.length) return null;

  const survives = paths.filter((p: { path_ids?: string[] }) => {
    const ids = p.path_ids ?? [];
    for (let i = 0; i + 1 < ids.length; i++) {
      if (sup.isSuppressedPair(ids[i], ids[i + 1])) return false;
    }
    return true;
  });
  if (survives.length === paths.length) return null;

  const next = { ...attrs };
  if (survives.length === 0) {
    delete next.intro_paths;
    delete next.introduction;
    return next;
  }
  next.intro_paths = survives.map((p: Record<string, unknown>, i: number) => ({ ...p, rank: i + 1 }));
  const best = next.intro_paths[0] as {
    hops?: number; path_names?: string[]; via_orgs?: string[]; root_supporter?: string;
  };
  // Default-guard every field: a hand-edited or legacy intro_paths entry missing
  // path_names/via_orgs must not throw here — that would 500 the suppress call
  // *after* the override row is already written.
  const pathNames = Array.isArray(best.path_names) ? best.path_names : [];
  const viaOrgs = Array.isArray(best.via_orgs) ? best.via_orgs : [];
  next.introduction = {
    ...(next.introduction && typeof next.introduction === 'object' ? next.introduction : {}),
    degree: best.hops ?? null,
    introducer: pathNames.length === 3 ? pathNames[1] : undefined,
    via: viaOrgs[0] ?? null,
    root_supporter: best.root_supporter ?? null,
    path: pathNames,
    computed_at: new Date().toISOString(),
  };
  return next;
}
