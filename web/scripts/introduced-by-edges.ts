/**
 * CLI: persist "introduced by" links as co_director_edges.
 *
 * The augment-people workflow's research phase captures, for each supporter,
 * who introduced them to BFF (the `introduced_by` field). This script turns
 * each such link into a co_director_edges row so it becomes a real graph edge
 * (the ingest pipeline only builds edges from co_directors, not relationships).
 *
 * Why a sentinel company: co_director_edges.company_number is NOT NULL and the
 * unique key is (seed_entity_id, co_director_entity_id, company_number). An
 * "introduced by" link has no company, so we use a fixed sentinel so the row is
 * insertable and idempotent. These edges are clearly distinguishable by their
 * sentinel company_number and source (layer C, human-asserted relationship).
 *
 * Input JSON (array): [{ entity_id, display_name, introduced_by }]
 *   - entity_id      : the supporter's canonical_entity_id (the "seed" side)
 *   - introduced_by  : the introducer's name ("" / absent → skipped)
 *
 * The introducer is resolved to an existing canonical_entities row by
 * first+last name token (the project's dedup convention — see the Mike≠Michael
 * note in memory). If not found, a new person entity is created so the FK holds.
 *
 * Usage:
 *   npx tsx web/scripts/introduced-by-edges.ts --import /tmp/introduced-by.json [--dry-run]
 *
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { generateId } from '../src/lib/ulid';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>;

const SENTINEL_COMPANY_NUMBER = 'INTRODUCED_BY';
const SENTINEL_COMPANY_NAME = 'Introduced via BFF network';

interface IntroLink {
  entity_id: string;
  display_name: string;
  introduced_by: string;
}

/** first+last token key, matching the project's fuzzy-dedup convention. */
function nameKey(name: string): string {
  const parts = name.toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

/** Find an existing person entity by name-key, else create one. Returns its id. */
async function resolveOrCreateEntity(
  supabase: AnySupabase,
  name: string,
  runId: string,
): Promise<string> {
  const key = nameKey(name);
  // Pull candidate persons and match on name-key (can't do token logic in SQL cleanly).
  const { data: candidates, error } = await supabase
    .from('canonical_entities')
    .select('canonical_entity_id, display_name')
    .eq('entity_type', 'person')
    .ilike('display_name', `%${name.split(' ')[0]}%`);
  if (error) throw new Error(`lookup failed for "${name}": ${error.message}`);

  const match = (candidates ?? []).find(c => nameKey(c.display_name) === key);
  if (match) return match.canonical_entity_id;

  // Create a new person entity for the introducer so the FK holds.
  const id = generateId();
  const { error: insErr } = await supabase.from('canonical_entities').insert({
    canonical_entity_id: id,
    entity_type: 'person',
    display_name: name.trim(),
    first_seen_run_id: runId,
    last_seen_run_id: runId,
    attributes: { source: 'introduced_by_link', created_by: 'introduced-by-edges' },
  });
  if (insErr) throw new Error(`create failed for "${name}": ${insErr.message}`);
  return id;
}

/**
 * The edge needs a run_id-shaped FK only via sweep_run_id (nullable) — we leave
 * it null. But canonical_entities.first_seen_run_id is NOT NULL and references
 * runs(run_id), so creating a new introducer entity requires a real run. We
 * find the most recent run to attach to rather than inventing one.
 */
async function getAnchorRunId(supabase: AnySupabase): Promise<string> {
  const { data, error } = await supabase
    .from('runs')
    .select('run_id')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error || !data) {
    throw new Error(`no runs found to anchor new entities (${error?.message ?? 'empty'}). Cannot create introducer entities without a run.`);
  }
  return data.run_id;
}

async function main() {
  const args = process.argv.slice(2);
  const importIdx = args.indexOf('--import');
  const importFile = importIdx >= 0 ? args[importIdx + 1] : null;
  const dryRun = args.includes('--dry-run');

  if (!importFile) {
    console.error('Usage: introduced-by-edges.ts --import FILE [--dry-run]');
    process.exit(1);
  }

  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseKey, {
    db: { schema: 'app' },
    auth: { persistSession: false },
  });

  const links: IntroLink[] = JSON.parse(readFileSync(importFile, 'utf-8'))
    .filter((l: IntroLink) => l && l.entity_id && l.introduced_by && l.introduced_by.trim());

  console.log('\n=== INTRODUCED-BY EDGES ===');
  console.log(`${links.length} links with an introducer to process.`);
  if (links.length === 0) return;

  if (dryRun) {
    for (const l of links) console.log(`  ${l.display_name}  ←introduced by←  ${l.introduced_by}`);
    console.log('\nDry run — no writes.');
    return;
  }

  const runId = await getAnchorRunId(supabase);
  let stored = 0;

  for (const l of links) {
    try {
      // Don't self-link if the introducer resolves to the same person.
      const introId = await resolveOrCreateEntity(supabase, l.introduced_by, runId);
      if (introId === l.entity_id) {
        console.log(`  ⊘ ${l.display_name}: introducer resolves to self — skipped`);
        continue;
      }

      // Evidence row (layer C — human-asserted relationship from the supporter list).
      const evidenceId = generateId();
      await supabase.from('enrichment_evidence').insert({
        evidence_id: evidenceId,
        entity_id: l.entity_id,
        source: 'supporter_list_introduced_by',
        source_layer: 'C',
        evidence_text: `${l.display_name} was introduced to Bloomsbury Football by ${l.introduced_by} (supporter list).`.slice(0, 1000),
        confidence: 0.9,
      });

      const { error: edgeErr } = await supabase.from('co_director_edges').upsert({
        co_director_edge_id: generateId(),
        seed_entity_id: l.entity_id,
        co_director_entity_id: introId,
        company_number: SENTINEL_COMPANY_NUMBER,
        company_name: SENTINEL_COMPANY_NAME,
        seed_role: null,
        co_director_role: 'introducer',
        co_director_name: l.introduced_by.trim(),
        confidence: 0.9,
        evidence_id: evidenceId,
      }, { onConflict: 'seed_entity_id,co_director_entity_id,company_number', ignoreDuplicates: true });

      if (edgeErr && !edgeErr.code?.startsWith('23505')) {
        throw new Error(edgeErr.message);
      }
      stored++;
      console.log(`  ✓ ${l.display_name}  ←  ${l.introduced_by}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ ${l.display_name} ← ${l.introduced_by}: ${msg}`);
    }
  }

  console.log(`\nStored ${stored}/${links.length} introduced-by edges.`);
}

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
