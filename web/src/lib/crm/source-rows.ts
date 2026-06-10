import { cache } from 'react';
import seedPeople from './data/seed-people.json';
import type { SeedPerson } from './seed-reference';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

/**
 * Source-sheet rows for the Observe views. Reads app.seed_import_rows (the
 * database is the source of truth); falls back to the bundled JSON reference
 * when the table has no rows for the type (pre-backfill).
 */
export const loadSourceRows = cache(async (
  supabase: SupabaseClient,
  importType: 'supporters' | 'hnw_targets',
): Promise<{ rows: SeedPerson[]; origin: 'database' | 'bundled json' }> => {
  try {
    const { data: imports } = await supabase
      .from('seed_imports')
      .select('import_id')
      .eq('import_type', importType);
    const importIds = (imports ?? []).map((i: { import_id: string }) => i.import_id);

    if (importIds.length) {
      const rows: SeedPerson[] = [];
      let offset = 0;
      for (;;) {
        const { data } = await supabase
          .from('seed_import_rows')
          .select('raw_data, first_name, last_name, tier, primary_affiliation, introduced_by_raw, funder_type, sub_type')
          .in('import_id', importIds)
          .range(offset, offset + 999);
        if (!data?.length) break;
        for (const r of data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const raw = (r.raw_data ?? {}) as Record<string, any>;
          rows.push({
            name: raw.name ?? `${r.first_name} ${r.last_name}`.trim(),
            source: importType,
            funder_type: r.funder_type ?? raw.funder_type ?? null,
            funder_sub_type: r.sub_type ?? raw.funder_sub_type ?? null,
            tier: r.tier ?? null,
            account_name: raw.account_name ?? null,
            affiliation: r.primary_affiliation ?? raw.affiliation ?? null,
            account_owner: raw.account_owner ?? null,
            introduced_by: r.introduced_by_raw ?? raw.introduced_by ?? null,
          });
        }
        if (data.length < 1000) break;
        offset += 1000;
      }
      if (rows.length) return { rows, origin: 'database' };
    }
  } catch { /* fall through to bundled reference */ }

  return {
    rows: (seedPeople as SeedPerson[]).filter(p => p.source === importType),
    origin: 'bundled json',
  };
});
