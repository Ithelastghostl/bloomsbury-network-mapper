/**
 * Pipeline augmentation — Tier A + Tier B (see PIPELINE_AUGMENTATION_PLAN.md).
 * For discovered people with no evidence/estimate, derive general-level data
 * from STORED relationships only (no web research, nothing fabricated):
 *   Tier A (has a company/named link): org_general, connected_seed[],
 *     sector_general, pipeline_tier="A-derivable", next_action
 *   Tier B (bare name): pipeline_tier="B-needs-research", next_action
 *
 * Usage: npx tsx scripts/derive-pipeline-context.ts [--dry-run]
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

function sectorOf(org: string): string {
  const n = (org || '').toLowerCase();
  if (/\b(capital|partners|llp|asset|invest|securities|equity|fund|advisers?|advisors?|bank|wealth)\b/.test(n)) return 'finance';
  if (/\b(propert|estates?|homes|land|developments?|real estate)\b/.test(n)) return 'property';
  if (/\b(foundation|trust|charit|endowment)\b/.test(n)) return 'charity';
  if (/\b(fc|football|sport|athletic|rugby|cricket|stadium)\b/.test(n)) return 'sport';
  if (/\b(media|publishing|news|productions?|films?|entertainment)\b/.test(n)) return 'media';
  if (/\b(ventures?|tech|software|labs|digital|data|ai|cyber)\b/.test(n)) return 'tech';
  if (/\b(law|legal|solicitors?|chambers)\b/.test(n)) return 'legal';
  return 'other';
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const sb = createClient(req('SUPABASE_URL'), req('SUPABASE_SERVICE_ROLE_KEY'), { db: { schema: 'app' }, auth: { persistSession: false } });

  const ents = await page(sb, 'canonical_entities', 'canonical_entity_id, display_name, entity_type, attributes');
  const name = new Map(ents.map(e => [e.canonical_entity_id as string, e.display_name as string]));
  const isCompany = new Map(ents.map(e => [e.canonical_entity_id as string, e.entity_type === 'company']));
  const persons = ents.filter(e => e.entity_type === 'person');
  const evEnt = new Set((await page(sb, 'enrichment_evidence', 'entity_id')).map(r => r.entity_id as string));
  const estEnt = new Set((await page(sb, 'wealth_estimates', 'entity_id')).map(r => r.entity_id as string));

  // derive company set + connected-seed set per person from stored edges
  const cos = new Map<string, Set<string>>();        // id -> org names
  const seedLinks = new Map<string, Set<string>>();  // id -> seed names they connect through

  for (const e of await page(sb, 'co_director_edges', 'seed_entity_id, co_director_entity_id, company_name')) {
    const a = e.seed_entity_id as string, b = e.co_director_entity_id as string, co = e.company_name as string;
    for (const [me, other] of [[a, b], [b, a]] as [string, string][]) {
      if (co) { if (!cos.has(me)) cos.set(me, new Set()); cos.get(me)!.add(co); }
      const on = name.get(other); if (on && isSeedPerson(on)) { if (!seedLinks.has(me)) seedLinks.set(me, new Set()); seedLinks.get(me)!.add(on); }
    }
  }
  for (const c of await page(sb, 'network_connections', 'source_entity_id, connected_entity_id, connection_type, via_organisation')) {
    const src = c.source_entity_id as string;
    if (c.connection_type === 'DIRECTOR_OF' && isCompany.get(c.connected_entity_id as string)) { const on = name.get(c.connected_entity_id as string); if (on) { if (!cos.has(src)) cos.set(src, new Set()); cos.get(src)!.add(on); } }
    if (c.via_organisation) { if (!cos.has(src)) cos.set(src, new Set()); cos.get(src)!.add(c.via_organisation as string); }
    // a person connected to a seed directly
    const on = name.get(c.connected_entity_id as string); if (on && isSeedPerson(on)) { if (!seedLinks.has(src)) seedLinks.set(src, new Set()); seedLinks.get(src)!.add(on); }
  }

  const pipeline = persons.filter(p => !isSeedPerson(p.display_name as string) && !evEnt.has(p.canonical_entity_id as string) && !estEnt.has(p.canonical_entity_id as string));

  let tierA = 0, tierB = 0;
  const updates: { id: string; attrs: Record<string, unknown> }[] = [];
  const sectorTally: Record<string, number> = {};

  for (const p of pipeline) {
    const id = p.canonical_entity_id as string;
    const orgs = [...(cos.get(id) ?? [])].filter(Boolean);
    const seeds = [...(seedLinks.get(id) ?? [])];
    const attrs = { ...(p.attributes as Record<string, unknown> ?? {}) };

    if (orgs.length) {
      const primary = orgs[0];
      const sector = sectorOf(primary);
      attrs.org_general = primary;
      attrs.org_all = orgs.slice(0, 5);
      attrs.sector_general = sector;
      if (seeds.length) attrs.connected_seed = seeds.slice(0, 5);
      attrs.pipeline_tier = 'A-derivable';
      if (!attrs.next_action) attrs.next_action = seeds.length ? `Profile via ${primary} (shared with ${seeds[0]})` : `Profile via ${primary}`;
      sectorTally[sector] = (sectorTally[sector] ?? 0) + 1;
      tierA++;
    } else {
      attrs.pipeline_tier = 'B-needs-research';
      if (!attrs.next_action) attrs.next_action = 'Research identity (bare co-director name)';
      tierB++;
    }
    updates.push({ id, attrs });
  }

  console.log(`Pipeline people: ${pipeline.length} | Tier A (derivable): ${tierA} | Tier B (needs research): ${tierB}`);
  console.log('Tier-A sector spread:', JSON.stringify(sectorTally));

  if (dryRun) { console.log('\n[DRY RUN] nothing written.'); return; }
  for (let i = 0; i < updates.length; i++) {
    const u = updates[i];
    const { error } = await sb.from('canonical_entities').update({ attributes: u.attrs }).eq('canonical_entity_id', u.id);
    if (error) console.log(`  ! ${name.get(u.id)}: ${error.message}`);
    if (i % 250 === 0) process.stdout.write(`  ${i}/${updates.length}\r`);
  }
  console.log(`\nDone. Stamped ${updates.length} pipeline people (${tierA} Tier A, ${tierB} Tier B).`);
}

function req(k: string): string { const v = process.env[k]; if (!v) throw new Error(`Missing env: ${k}`); return v; }
main().catch(e => { console.error('Fatal:', e); process.exit(1); });
