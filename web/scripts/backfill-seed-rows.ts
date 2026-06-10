/**
 * Backfill app.seed_imports + app.seed_import_rows from the static
 * seed-people.json reference, so the database (not the bundled JSON) is the
 * source of truth the Observe sheets read. Idempotent: skips if a backfill
 * import already exists for the type.
 *
 * Usage: npx tsx scripts/backfill-seed-rows.ts [--dry-run]
 * Env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 */
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { ulid } from 'ulid';
import seedPeople from '../src/lib/crm/data/seed-people.json';
import type { SeedPerson } from '../src/lib/crm/seed-reference';

for (const line of (fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8').split(/\r?\n/) : [])) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
function req(k: string, fallback?: string): string {
  const v = process.env[k] ?? (fallback ? process.env[fallback] : undefined);
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
}

const FILE_NAME = 'seed-people.json (reference backfill)';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const sb = createClient(
    req('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'),
    req('SUPABASE_SERVICE_ROLE_KEY'),
    { db: { schema: 'app' }, auth: { persistSession: false } },
  );

  const people = seedPeople as SeedPerson[];

  for (const importType of ['supporters', 'hnw_targets'] as const) {
    const rows = people.filter(p => p.source === importType);

    const { data: existing } = await sb
      .from('seed_imports')
      .select('import_id')
      .eq('import_type', importType)
      .eq('file_name', FILE_NAME)
      .limit(1);
    if (existing?.length) {
      console.log(`${importType}: backfill already present (${existing[0].import_id}) — skipping.`);
      continue;
    }

    console.log(`${importType}: ${rows.length} rows`);
    if (dryRun) continue;

    const importId = ulid();
    const { error: impErr } = await sb.from('seed_imports').insert({
      import_id: importId,
      import_type: importType,
      file_name: FILE_NAME,
      row_count: rows.length,
      processed_count: rows.length,
      status: 'completed',
      imported_by: 'backfill-seed-rows',
    });
    if (impErr) throw new Error(`seed_imports: ${impErr.message}`);

    const inserts = rows.map((p, i) => {
      const tokens = p.name.trim().split(/\s+/);
      return {
        row_id: ulid(),
        import_id: importId,
        row_number: i + 1,
        raw_data: p,
        first_name: tokens[0] ?? p.name,
        last_name: tokens.slice(1).join(' ') || tokens[0] || p.name,
        tier: p.tier,
        primary_affiliation: p.affiliation,
        introduced_by_raw: p.introduced_by,
        email: null,
        funder_type: p.funder_type,
        sub_type: p.funder_sub_type,
        status: 'reference',
      };
    });
    for (let i = 0; i < inserts.length; i += 500) {
      const { error } = await sb.from('seed_import_rows').insert(inserts.slice(i, i + 500));
      if (error) throw new Error(`seed_import_rows: ${error.message}`);
    }
    console.log(`${importType}: inserted ${inserts.length} rows under import ${importId}.`);
  }
  console.log('Done.');
}
main().catch(e => { console.error('Fatal:', e); process.exit(1); });
