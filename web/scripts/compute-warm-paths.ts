/**
 * Compute, for every non-seed person who carries wealth/evidence (a Lead), the
 * shortest relationship path back to a known seed — the "who can introduce us"
 * route — and store it on attributes.warm_path:
 *   { via: [names…], seed: "<seed name>", hops: N }
 *
 * The graph is undirected over person↔person ties:
 *   - co_director_edges (shared board)
 *   - network_connections that link two persons (FAMILY_MEMBER, CO_TRUSTEE,
 *     ASSOCIATED_WITH, etc.) — company endpoints are ignored (people-only).
 * BFS from each lead until it reaches any seed. Org nodes are not traversed,
 * so a path is a genuine chain of people who know each other.
 *
 * Usage: npx tsx scripts/compute-warm-paths.ts [--dry-run]
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSeedPerson } from '../src/lib/crm/seed-reference';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

async function page(sb: DB, t: string, c: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []; let f = 0;
  for (;;) { const { data, error } = await sb.from(t).select(c).range(f, f + 999); if (error) throw new Error(`${t}: ${error.message}`); if (!data?.length) break; out.push(...(data as Record<string, unknown>[])); if (data.length < 1000) break; f += 1000; }
  return out;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const sb = createClient(req('SUPABASE_URL'), req('SUPABASE_SERVICE_ROLE_KEY'), { db: { schema: 'app' }, auth: { persistSession: false } });

  const ents = await page(sb, 'canonical_entities', 'canonical_entity_id, display_name, entity_type, attributes');
  const name = new Map(ents.map(e => [e.canonical_entity_id as string, e.display_name as string]));
  const isPerson = new Map(ents.map(e => [e.canonical_entity_id as string, e.entity_type === 'person']));
  const persons = ents.filter(e => e.entity_type === 'person');
  const seedIds = new Set(persons.filter(p => isSeedPerson(p.display_name as string)).map(p => p.canonical_entity_id as string));

  // who has wealth/evidence → the Lead set we compute paths for
  const evEnt = new Set((await page(sb, 'enrichment_evidence', 'entity_id')).map(r => r.entity_id as string));
  const estEnt = new Set((await page(sb, 'wealth_estimates', 'entity_id')).map(r => r.entity_id as string));

  // build undirected person↔person adjacency
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!a || !b || a === b) return;
    if (!isPerson.get(a) || !isPerson.get(b)) return; // people only
    if (!adj.has(a)) adj.set(a, new Set()); if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b); adj.get(b)!.add(a);
  };
  for (const e of await page(sb, 'co_director_edges', 'seed_entity_id, co_director_entity_id')) link(e.seed_entity_id as string, e.co_director_entity_id as string);
  for (const c of await page(sb, 'network_connections', 'source_entity_id, connected_entity_id')) link(c.source_entity_id as string, c.connected_entity_id as string);

  // BFS from a lead to the nearest seed
  function nearestSeed(start: string): { seed: string; via: string[]; hops: number } | null {
    if (seedIds.has(start)) return { seed: name.get(start)!, via: [], hops: 0 };
    const prev = new Map<string, string>();
    const q = [start]; const seen = new Set([start]);
    while (q.length) {
      const cur = q.shift()!;
      for (const nb of adj.get(cur) ?? []) {
        if (seen.has(nb)) continue;
        seen.add(nb); prev.set(nb, cur);
        if (seedIds.has(nb)) {
          // reconstruct path start → … → nb
          const path: string[] = []; let n: string | undefined = nb;
          while (n && n !== start) { path.unshift(n); n = prev.get(n); }
          // path = [intermediate…, seed]; "via" excludes the seed itself
          return { seed: name.get(nb)!, via: path.slice(0, -1).map(id => name.get(id)!), hops: path.length };
        }
        q.push(nb);
      }
    }
    return null;
  }

  const leads = persons.filter(p => !isSeedPerson(p.display_name as string) && (evEnt.has(p.canonical_entity_id as string) || estEnt.has(p.canonical_entity_id as string)));
  console.log(`Leads to route: ${leads.length} | seeds in graph: ${seedIds.size}`);

  let direct = 0, indirect = 0, noPath = 0;
  const updates: { id: string; attrs: Record<string, unknown>; name: string; desc: string }[] = [];
  for (const lead of leads) {
    const id = lead.canonical_entity_id as string;
    const r = nearestSeed(id);
    if (!r) { noPath++; continue; }
    if (r.hops === 1) direct++; else indirect++;
    const attrs = { ...(lead.attributes as Record<string, unknown> ?? {}), warm_path: { seed: r.seed, via: r.via, hops: r.hops } };
    const chain = r.hops === 1 ? `direct → ${r.seed}` : `→ ${[...r.via, r.seed].join(' → ')}`;
    updates.push({ id, attrs, name: lead.display_name as string, desc: `${r.hops} hop ${chain}` });
  }

  console.log(`Direct (1 hop to a seed): ${direct} | indirect: ${indirect} | no path to any seed: ${noPath}`);
  console.log('\nSample:'); for (const u of updates.slice(0, 15)) console.log(`  ${u.name}: ${u.desc}`);

  if (dryRun) { console.log('\n[DRY RUN] nothing written.'); return; }
  for (const u of updates) { const { error } = await sb.from('canonical_entities').update({ attributes: u.attrs }).eq('canonical_entity_id', u.id); if (error) console.log(`  ! ${u.name}: ${error.message}`); }
  console.log(`\nDone. Stored warm_path on ${updates.length} leads.`);
}

function req(k: string): string { const v = process.env[k]; if (!v) throw new Error(`Missing env: ${k}`); return v; }
main().catch(e => { console.error('Fatal:', e); process.exit(1); });
