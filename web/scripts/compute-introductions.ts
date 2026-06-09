/**
 * Compute, for every canonical person, the warm introduction route from one of
 * our 62 donors (the hnw_targets) and store it on attributes.introduction:
 *   { degree, introducer, via, root_donor, path:[names…], computed_at }
 *
 *   degree 0 = the person IS a donor (core, direct relationship)
 *   degree 1 = a donor knows them directly  → ask the donor to introduce us
 *   degree 2 = a 1st-order person knows them → reach them via that person
 *
 * People over 2 hops from any donor get no introduction (cleared). Mirrors the
 * Introduction Graph (src/lib/crm/introduction-graph.ts). People-only chains,
 * where two people are linked by a shared board/org or a direct tie.
 *
 * Usage: npx tsx scripts/compute-introductions.ts [--dry-run]
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-loaded from web/.env.local)
 */
import fs from 'fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { seedInfo } from '../src/lib/crm/seed-reference';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

for (const line of (fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8').split(/\r?\n/) : [])) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
function req(k: string): string { const v = process.env[k]; if (!v) throw new Error(`Missing env: ${k}`); return v; }

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
  const isCompany = (id: string) => (ents.find(e => e.canonical_entity_id === id)?.entity_type) === 'company';
  const persons = ents.filter(e => e.entity_type === 'person');

  const donors = new Set(persons.filter(p => seedInfo(p.display_name as string)?.source === 'hnw_targets').map(p => p.canonical_entity_id as string));

  // person↔person adjacency with the linking org (via)
  const adj = new Map<string, Map<string, string | undefined>>();
  const companyMembers = new Map<string, Set<string>>();
  const link = (a: string, b: string, via?: string) => {
    if (!a || !b || a === b || !isPerson.get(a) || !isPerson.get(b)) return;
    if (!adj.has(a)) adj.set(a, new Map()); if (!adj.has(b)) adj.set(b, new Map());
    if (!adj.get(a)!.has(b) || via) adj.get(a)!.set(b, via);
    if (!adj.get(b)!.has(a) || via) adj.get(b)!.set(a, via);
  };
  for (const c of await page(sb, 'network_connections', 'source_entity_id, connected_entity_id, connection_type, via_organisation')) {
    const s = c.source_entity_id as string, t = c.connected_entity_id as string | null;
    if (!t) continue;
    if (isPerson.get(s) && isPerson.get(t)) link(s, t, (c.via_organisation as string) ?? undefined);
    else if (isPerson.get(s) && isCompany(t) && c.connection_type === 'DIRECTOR_OF') {
      if (!companyMembers.has(t)) companyMembers.set(t, new Set()); companyMembers.get(t)!.add(s);
    }
  }
  for (const d of await page(sb, 'co_director_edges', 'seed_entity_id, co_director_entity_id, company_name')) {
    link(d.seed_entity_id as string, d.co_director_entity_id as string, (d.company_name as string) ?? undefined);
  }
  for (const [co, members] of companyMembers) {
    if (members.size < 2 || members.size > 40) continue;
    const arr = [...members], org = name.get(co);
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) link(arr[i], arr[j], org);
  }

  // multi-source BFS from donors, depth ≤ 2
  const degree = new Map<string, number>(), introducer = new Map<string, string>(), viaOf = new Map<string, string | undefined>(), root = new Map<string, string>();
  let frontier: string[] = [];
  for (const d of donors) { degree.set(d, 0); root.set(d, d); frontier.push(d); }
  for (let deg = 0; deg < 2 && frontier.length; deg++) {
    const next: string[] = [];
    for (const cur of frontier) for (const [nb, via] of adj.get(cur) ?? []) {
      if (degree.has(nb)) continue;
      degree.set(nb, deg + 1); introducer.set(nb, cur); viaOf.set(nb, via); root.set(nb, root.get(cur)!); next.push(nb);
    }
    frontier = next;
  }
  const pathTo = (id: string): string[] => { const out: string[] = []; let n: string | undefined = id; const seen = new Set<string>(); while (n && !seen.has(n)) { seen.add(n); out.unshift(name.get(n)!); if (degree.get(n) === 0) break; n = introducer.get(n); } return out; };

  let d0 = 0, d1 = 0, d2 = 0, cleared = 0;
  const updates: { id: string; attrs: Record<string, unknown> }[] = [];
  for (const p of persons) {
    const id = p.canonical_entity_id as string;
    const attrs = { ...(p.attributes as Record<string, unknown> ?? {}) };
    const deg = degree.get(id);
    if (deg === 0) {
      attrs.introduction = { degree: 0, core_donor: true, note: 'Core donor — direct relationship', computed_at: new Date().toISOString() }; d0++;
    } else if (deg === 1 || deg === 2) {
      attrs.introduction = { degree: deg, introducer: name.get(introducer.get(id)!), via: viaOf.get(id) ?? null, root_donor: name.get(root.get(id)!), path: pathTo(id), computed_at: new Date().toISOString() };
      if (deg === 1) d1++; else d2++;
    } else {
      if (attrs.introduction === undefined) continue; // nothing to clear
      delete attrs.introduction; cleared++;
    }
    updates.push({ id, attrs });
  }

  console.log(`Donors: ${donors.size} | core(0): ${d0} | 1st-order: ${d1} | 2nd-order: ${d2} | cleared (no route ≤2): ${cleared}`);
  if (dryRun) { console.log('[DRY RUN] nothing written.'); return; }
  for (let i = 0; i < updates.length; i++) {
    const u = updates[i];
    const { error } = await sb.from('canonical_entities').update({ attributes: u.attrs }).eq('canonical_entity_id', u.id);
    if (error) console.log(`  ! ${name.get(u.id)}: ${error.message}`);
    if (i % 300 === 0) process.stdout.write(`  ${i}/${updates.length}\r`);
  }
  console.log(`\nDone. Wrote introduction routes on ${updates.length} people.`);
}
main().catch(e => { console.error('Fatal:', e); process.exit(1); });
