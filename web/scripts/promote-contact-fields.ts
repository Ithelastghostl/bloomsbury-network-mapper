/**
 * Make leads/seeds actionable by storing contact + next-action fields:
 *   attributes.email        — from the supporters spreadsheet (matched by name)
 *   attributes.next_action  — a concrete suggested step derived from warm_path
 *                             (who can introduce) + affiliation + email presence
 *
 * next_action logic (deterministic, no model):
 *   - has email           → "Email directly (<email>)"
 *   - else warm_path 1hop  → "Ask <seed> for a warm intro"
 *   - else warm_path Nhop  → "Warm intro via <chain>"
 *   - else has affiliation → "Approach via <affiliation>"
 *   - else                 → "Research contact route"
 * Seeds already-known just get the email; leads get email + next_action.
 *
 * Usage: npx tsx scripts/promote-contact-fields.ts [--dry-run]
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { readFileSync } from 'fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSeedPerson } from '../src/lib/crm/seed-reference';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

const norm = (s: string) => s.toLowerCase()
  .replace(/\b(sir|dr|mr|mrs|ms|lord|lady|dame|prof|professor|baron|baroness)\b/g, '')
  .replace(/\(.*?\)/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const firstLast = (s: string) => { const p = norm(s).split(' ').filter(Boolean); return p.length < 2 ? norm(s) : `${p[0]} ${p[p.length - 1]}`; };

async function page(sb: DB, t: string, c: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []; let f = 0;
  for (;;) { const { data, error } = await sb.from(t).select(c).range(f, f + 999); if (error) throw new Error(`${t}: ${error.message}`); if (!data?.length) break; out.push(...(data as Record<string, unknown>[])); if (data.length < 1000) break; f += 1000; }
  return out;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const sb = createClient(req('SUPABASE_URL'), req('SUPABASE_SERVICE_ROLE_KEY'), { db: { schema: 'app' }, auth: { persistSession: false } });

  const rows: { name: string; affil: string; email: string; intro: string }[] = JSON.parse(readFileSync('/tmp/supporter-fields.json', 'utf8'));
  const emailByFL = new Map<string, string>();
  for (const r of rows) if (r.email) emailByFL.set(firstLast(r.name), r.email);

  const persons = (await page(sb, 'canonical_entities', 'canonical_entity_id, display_name, entity_type, attributes')).filter(e => e.entity_type === 'person');
  // who has wealth/evidence → leads we add next_action for
  const evEnt = new Set((await page(sb, 'enrichment_evidence', 'entity_id')).map(r => r.entity_id as string));
  const estEnt = new Set((await page(sb, 'wealth_estimates', 'entity_id')).map(r => r.entity_id as string));

  let setEmail = 0, setAction = 0;
  const updates: { id: string; attrs: Record<string, unknown>; name: string; what: string[] }[] = [];

  for (const p of persons) {
    const attrs = { ...(p.attributes as Record<string, unknown> ?? {}) };
    const what: string[] = [];

    // email
    const email = emailByFL.get(firstLast(p.display_name as string));
    if (email && !attrs.email) { attrs.email = email; what.push(`email`); setEmail++; }

    // next_action — only for leads (non-seed with data) or seeds; skip bare pipeline names
    const isLeadOrSeed = isSeedPerson(p.display_name as string) || evEnt.has(p.canonical_entity_id as string) || estEnt.has(p.canonical_entity_id as string);
    if (isLeadOrSeed && !attrs.next_action) {
      const wp = attrs.warm_path as { seed?: string; via?: string[]; hops?: number } | undefined;
      const finalEmail = (attrs.email as string) || email;
      let action: string;
      if (finalEmail) action = `Email directly (${finalEmail})`;
      else if (wp && wp.hops === 1 && wp.seed) action = `Ask ${wp.seed} for a warm intro`;
      else if (wp && wp.via && wp.via.length && wp.seed) action = `Warm intro via ${[...wp.via, wp.seed].join(' → ')}`;
      else if (attrs.affiliation) action = `Approach via ${attrs.affiliation}`;
      else action = `Research contact route`;
      attrs.next_action = action; what.push('next_action'); setAction++;
    }

    if (what.length) updates.push({ id: p.canonical_entity_id as string, attrs, name: p.display_name as string, what });
  }

  console.log(`Persons: ${persons.length} | email set: ${setEmail} | next_action set: ${setAction} | total updated: ${updates.length}`);
  console.log('\nSample next_action:');
  for (const u of updates.filter(u => u.what.includes('next_action')).slice(0, 12)) console.log(`  ${u.name}: ${(u.attrs.next_action as string)}`);

  if (dryRun) { console.log('\n[DRY RUN] nothing written.'); return; }
  for (const u of updates) { const { error } = await sb.from('canonical_entities').update({ attributes: u.attrs }).eq('canonical_entity_id', u.id); if (error) console.log(`  ! ${u.name}: ${error.message}`); }
  console.log(`\nDone. Updated ${updates.length} persons.`);
}

function req(k: string): string { const v = process.env[k]; if (!v) throw new Error(`Missing env: ${k}`); return v; }
main().catch(e => { console.error('Fatal:', e); process.exit(1); });
