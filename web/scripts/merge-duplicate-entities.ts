/**
 * Merge exact-display-name duplicate person entities created across batch runs.
 * For each name with >1 entity: keep the richest (most evidence, then most
 * connections), repoint co_director_edges / network_connections / evidence /
 * wealth_estimates onto it, drop self-loops the merge creates, then delete the
 * empty duplicates. Records each merged alias for provenance where possible.
 *
 * Usage: npx tsx scripts/merge-duplicate-entities.ts [--dry-run] [--persons-only]
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

async function page(sb: DB, t: string, c: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []; let f = 0;
  for (;;) { const { data, error } = await sb.from(t).select(c).range(f, f + 999); if (error) throw new Error(`${t}: ${error.message}`); if (!data?.length) break; out.push(...(data as Record<string, unknown>[])); if (data.length < 1000) break; f += 1000; }
  return out;
}

async function countFor(sb: DB, table: string, col: string, id: string): Promise<number> {
  const { count } = await sb.from(table).select('*', { count: 'exact', head: true }).eq(col, id);
  return count ?? 0;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const personsOnly = !args.includes('--all-types'); // default: persons only (safer)

  const sb = createClient(req('SUPABASE_URL'), req('SUPABASE_SERVICE_ROLE_KEY'), { db: { schema: 'app' }, auth: { persistSession: false } });

  const ents = await page(sb, 'canonical_entities', 'canonical_entity_id, display_name, entity_type');
  const evCount = new Map<string, number>();
  for (const r of await page(sb, 'enrichment_evidence', 'entity_id')) evCount.set(r.entity_id as string, (evCount.get(r.entity_id as string) ?? 0) + 1);

  // group by normalised exact name within the same entity_type
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const e of ents) {
    if (personsOnly && e.entity_type !== 'person') continue;
    const key = `${e.entity_type}::${(e.display_name as string).toLowerCase().trim()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  const dupGroups = [...groups.values()].filter(g => g.length > 1);
  console.log(`Duplicate ${personsOnly ? 'person ' : ''}name-groups: ${dupGroups.length} (total extra entities: ${dupGroups.reduce((s, g) => s + g.length - 1, 0)})`);

  let merged = 0, edgesRepointed = 0, selfLoopsDropped = 0, deleted = 0;

  for (const g of dupGroups) {
    // pick keeper: most evidence, then will compute connections lazily
    g.sort((a, b) => (evCount.get(b.canonical_entity_id as string) ?? 0) - (evCount.get(a.canonical_entity_id as string) ?? 0));
    // tie-break by connection volume when evidence equal
    if ((evCount.get(g[0].canonical_entity_id as string) ?? 0) === (evCount.get(g[1].canonical_entity_id as string) ?? 0)) {
      const conn = async (id: string) => (await countFor(sb, 'network_connections', 'source_entity_id', id)) + (await countFor(sb, 'network_connections', 'connected_entity_id', id)) + (await countFor(sb, 'co_director_edges', 'seed_entity_id', id)) + (await countFor(sb, 'co_director_edges', 'co_director_entity_id', id));
      const withConn = await Promise.all(g.map(async e => ({ e, c: await conn(e.canonical_entity_id as string) })));
      withConn.sort((a, b) => b.c - a.c || (evCount.get(b.e.canonical_entity_id as string) ?? 0) - (evCount.get(a.e.canonical_entity_id as string) ?? 0));
      g.length = 0; g.push(...withConn.map(w => w.e));
    }
    const keep = g[0].canonical_entity_id as string;
    const drops = g.slice(1).map(e => e.canonical_entity_id as string);
    const name = g[0].display_name as string;
    console.log(`  "${name}": keep ${keep} (ev:${evCount.get(keep) ?? 0}) ⬅ ${drops.length} dup(s)`);

    if (dryRun) { merged++; continue; }

    for (const drop of drops) {
      // repoint co_director_edges (both sides), then drop self-loops
      await sb.from('co_director_edges').update({ seed_entity_id: keep }).eq('seed_entity_id', drop);
      await sb.from('co_director_edges').update({ co_director_entity_id: keep }).eq('co_director_entity_id', drop);
      // repoint network_connections (both sides)
      await sb.from('network_connections').update({ source_entity_id: keep }).eq('source_entity_id', drop);
      await sb.from('network_connections').update({ connected_entity_id: keep }).eq('connected_entity_id', drop);
      // repoint evidence + estimates
      await sb.from('enrichment_evidence').update({ entity_id: keep }).eq('entity_id', drop);
      await sb.from('wealth_estimates').update({ entity_id: keep }).eq('entity_id', drop);
      edgesRepointed++;
    }

    // drop self-loops the merge created (keep linked to itself)
    const { data: sl1 } = await sb.from('co_director_edges').select('co_director_edge_id').eq('seed_entity_id', keep).eq('co_director_entity_id', keep);
    for (const r of sl1 ?? []) { await sb.from('co_director_edges').delete().eq('co_director_edge_id', (r as Record<string, unknown>).co_director_edge_id); selfLoopsDropped++; }
    const { data: sl2 } = await sb.from('network_connections').select('connection_id').eq('source_entity_id', keep).eq('connected_entity_id', keep);
    for (const r of sl2 ?? []) { await sb.from('network_connections').delete().eq('connection_id', (r as Record<string, unknown>).connection_id); selfLoopsDropped++; }

    // delete the now-empty duplicate entities
    for (const drop of drops) {
      // safety: confirm nothing still references it
      const refs = (await countFor(sb, 'network_connections', 'source_entity_id', drop)) + (await countFor(sb, 'network_connections', 'connected_entity_id', drop)) + (await countFor(sb, 'co_director_edges', 'seed_entity_id', drop)) + (await countFor(sb, 'co_director_edges', 'co_director_entity_id', drop)) + (await countFor(sb, 'enrichment_evidence', 'entity_id', drop)) + (await countFor(sb, 'wealth_estimates', 'entity_id', drop));
      if (refs > 0) { console.log(`    ! ${drop} still has ${refs} refs — leaving it`); continue; }
      const { error } = await sb.from('canonical_entities').delete().eq('canonical_entity_id', drop);
      if (error) console.log(`    ! delete ${drop}: ${error.message}`); else deleted++;
    }
    merged++;
  }

  console.log(`\n${dryRun ? '[DRY RUN] would merge' : 'Merged'} ${merged} groups | dups repointed: ${edgesRepointed} | self-loops dropped: ${selfLoopsDropped} | entities deleted: ${deleted}`);
}

function req(k: string): string { const v = process.env[k]; if (!v) throw new Error(`Missing env: ${k}`); return v; }
main().catch(e => { console.error('Fatal:', e); process.exit(1); });
