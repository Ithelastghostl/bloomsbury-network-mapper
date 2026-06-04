/**
 * Classify organisation entities and flag confirmed BFF funders/partners.
 * Writes two attributes on each company entity:
 *   attributes.org_class = "charity" | "company"
 *   attributes.bff_funder = true   (only on orgs we CONFIRMED fund/partner BFF)
 *
 * org_class mirrors the graph's charity test (CHARITY_KEYWORDS in
 * graph-queries.ts) since org evidence carries no charity_commission source.
 * bff_funder is a curated allow-list of orgs the research established as
 * actual BFF funders/partners (360Giving GrantNav, their own press, or a
 * named partnership) — not inferred, so no false "funder" labels.
 *
 * Usage: npx tsx scripts/classify-orgs.ts [--dry-run]
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

// Match graph-queries.ts exactly so org_class agrees with the Charities graph.
const CHARITY_KEYWORDS = ['foundation', 'trust', 'charity', 'charitable', 'endowment'];

// Confirmed BFF funders/partners from the research (match by lowercased substring).
const BFF_FUNDERS = [
  'tuixen', 'westminster foundation', 'hargreaves foundation', "john lyon", 'parasol',
  'mastercard', 'xtx', 'childhood trust', 'stelios', 'three points law', 'evercore',
  'adobe', 'laliga', 'fifa foundation', 'oak foundation', 'berkeley foundation',
  'london marathon', 'nns foundation', 'sawiris',
];

async function page(sb: DB, t: string, c: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []; let f = 0;
  for (;;) { const { data, error } = await sb.from(t).select(c).range(f, f + 999); if (error) throw new Error(`${t}: ${error.message}`); if (!data?.length) break; out.push(...(data as Record<string, unknown>[])); if (data.length < 1000) break; f += 1000; }
  return out;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const sb = createClient(req('SUPABASE_URL'), req('SUPABASE_SERVICE_ROLE_KEY'), { db: { schema: 'app' }, auth: { persistSession: false } });

  const orgs = (await page(sb, 'canonical_entities', 'canonical_entity_id, display_name, entity_type, attributes')).filter(e => e.entity_type === 'company');
  let charities = 0, companies = 0, funders = 0;
  const updates: { id: string; attrs: Record<string, unknown>; name: string; cls: string; funder: boolean }[] = [];
  const funderNames: string[] = [];

  for (const o of orgs) {
    const lname = (o.display_name as string).toLowerCase();
    const cls = CHARITY_KEYWORDS.some(w => lname.includes(w)) ? 'charity' : 'company';
    const isFunder = BFF_FUNDERS.some(f => lname.includes(f));
    if (cls === 'charity') charities++; else companies++;
    const attrs = { ...(o.attributes as Record<string, unknown> ?? {}), org_class: cls };
    if (isFunder) { attrs.bff_funder = true; funders++; funderNames.push(o.display_name as string); }
    updates.push({ id: o.canonical_entity_id as string, attrs, name: o.display_name as string, cls, funder: isFunder });
  }

  console.log(`Orgs: ${orgs.length} | charity: ${charities} | company: ${companies} | BFF-funder flagged: ${funders}`);
  console.log('\nFlagged BFF funders:'); for (const n of funderNames.sort()) console.log(`  • ${n}`);

  if (dryRun) { console.log('\n[DRY RUN] nothing written.'); return; }
  for (let i = 0; i < updates.length; i += 1) {
    const u = updates[i];
    const { error } = await sb.from('canonical_entities').update({ attributes: u.attrs }).eq('canonical_entity_id', u.id);
    if (error) console.log(`  ! ${u.name}: ${error.message}`);
    if (i % 200 === 0) process.stdout.write(`  ${i}/${updates.length}\r`);
  }
  console.log(`\nDone. Classified ${updates.length} orgs (${funders} funder-flagged).`);
}

function req(k: string): string { const v = process.env[k]; if (!v) throw new Error(`Missing env: ${k}`); return v; }
main().catch(e => { console.error('Fatal:', e); process.exit(1); });
