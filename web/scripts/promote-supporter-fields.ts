/**
 * Promote affiliation (employer/org) and introduced_by from the supporters
 * spreadsheet into structured attributes on the matching person entities, so
 * leads are filterable by firm and the warm-intro source is visible without
 * digging through evidence text.
 *
 * Reads /tmp/supporter-fields.json (produced from the supporters xlsx:
 *   [{ name, affil, intro }]). Matches by normalised first+last name to an
 * existing person entity and sets attributes.affiliation / attributes.introduced_by
 * (only when currently empty — never overwrites a richer value).
 *
 * Usage: npx tsx scripts/promote-supporter-fields.ts [--dry-run]
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { readFileSync } from 'fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

const norm = (s: string) => s.toLowerCase()
  .replace(/\b(sir|dr|mr|mrs|ms|lord|lady|dame|prof|professor|baroness|baron)\b/g, '')
  .replace(/\(.*?\)/g, '')
  .replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const firstLast = (s: string) => { const p = norm(s).split(' ').filter(Boolean); return p.length < 2 ? norm(s) : `${p[0]} ${p[p.length - 1]}`; };
const cleanIntro = (s: string) => s.replace(/\s*\((household account|household)\)\s*/i, '').trim();

async function page(sb: DB, t: string, c: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []; let f = 0;
  for (;;) { const { data, error } = await sb.from(t).select(c).range(f, f + 999); if (error) throw new Error(`${t}: ${error.message}`); if (!data?.length) break; out.push(...(data as Record<string, unknown>[])); if (data.length < 1000) break; f += 1000; }
  return out;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const sb = createClient(req('SUPABASE_URL'), req('SUPABASE_SERVICE_ROLE_KEY'), { db: { schema: 'app' }, auth: { persistSession: false } });

  const rows: { name: string; affil: string; intro: string }[] = JSON.parse(readFileSync('/tmp/supporter-fields.json', 'utf8'));
  const persons = (await page(sb, 'canonical_entities', 'canonical_entity_id, display_name, entity_type, attributes')).filter(e => e.entity_type === 'person');
  const byFL = new Map<string, Record<string, unknown>>();
  for (const p of persons) byFL.set(firstLast(p.display_name as string), p); // last write wins; fine for our roster

  let setAffil = 0, setIntro = 0, noMatch = 0;
  const updates: { id: string; attrs: Record<string, unknown>; name: string; what: string[] }[] = [];

  for (const r of rows) {
    const p = byFL.get(firstLast(r.name));
    if (!p) { if (r.affil || r.intro) noMatch++; continue; }
    const attrs = { ...(p.attributes as Record<string, unknown> ?? {}) };
    const what: string[] = [];
    if (r.affil && !attrs.affiliation) { attrs.affiliation = r.affil; what.push(`affiliation=${r.affil}`); setAffil++; }
    if (r.intro) { const intro = cleanIntro(r.intro); if (intro && !attrs.introduced_by) { attrs.introduced_by = intro; what.push(`introduced_by=${intro}`); setIntro++; } }
    if (what.length) updates.push({ id: p.canonical_entity_id as string, attrs, name: p.display_name as string, what });
  }

  console.log(`Supporter rows: ${rows.length} | matched updates: ${updates.length} | affiliation set: ${setAffil} | introduced_by set: ${setIntro} | unmatched-with-data: ${noMatch}`);
  if (updates.length) { console.log('\nSample:'); for (const u of updates.slice(0, 12)) console.log(`  ${u.name}: ${u.what.join(', ')}`); }

  if (dryRun) { console.log('\n[DRY RUN] nothing written.'); return; }
  for (const u of updates) {
    const { error } = await sb.from('canonical_entities').update({ attributes: u.attrs }).eq('canonical_entity_id', u.id);
    if (error) console.log(`  ! ${u.name}: ${error.message}`);
  }
  console.log(`\nDone. Updated ${updates.length} entities.`);
}

function req(k: string): string { const v = process.env[k]; if (!v) throw new Error(`Missing env: ${k}`); return v; }
main().catch(e => { console.error('Fatal:', e); process.exit(1); });
