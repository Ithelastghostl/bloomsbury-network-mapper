/**
 * Execution harness: runs the mandatory multi-layer enrichment sweep
 * for all HNW seeds. Every layer runs for every seed, every time.
 *
 * Usage:
 *   npx tsx web/scripts/run-enrichment-sweep.ts [--seed "Name"] [--dry-run]
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   COMPANIES_HOUSE_API_KEY, ANTHROPIC_API_KEY
 *
 * Optional:
 *   GUARDIAN_API_KEY, SWEEP_LLM_MODEL, SWEEP_CONCURRENCY (default 3)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { runAndPersistSweep } from '../src/lib/enrichment/unified-sweep';
import { buildSweepConfig } from '../src/lib/enrichment/sweep-config';
import { generateId } from '../src/lib/ulid';
import type { CanonicalEntity } from '../src/types/database';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>;

const CONCURRENCY = parseInt(process.env.SWEEP_CONCURRENCY ?? '3', 10);

interface SweepStats {
  processed: number;
  succeeded: number;
  failed: number;
  totalSignals: number;
  totalRelationships: number;
  totalArticles: number;
  totalCoDirectors: number;
  wealthBands: Record<string, number>;
  errors: Array<{ name: string; error: string }>;
}

async function main() {
  const args = process.argv.slice(2);
  const singleSeed = getArg(args, '--seed');
  const dryRun = args.includes('--dry-run');

  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase: AnySupabase = createClient(supabaseUrl, supabaseKey, {
    db: { schema: 'app' },
    auth: { persistSession: false },
  });

  const config = buildSweepConfig();

  // Fetch seeds
  let seedQuery = supabase
    .from('seeds')
    .select('canonical_entity_id, canonical_entities!inner(*)');

  if (singleSeed) {
    seedQuery = seedQuery.ilike('canonical_entities.display_name', `%${singleSeed}%`);
  }

  const { data: seedRows, error: seedError } = await seedQuery;
  if (seedError) {
    console.error('Failed to fetch seeds:', seedError.message);

    // Fallback: read from spreadsheet data if no DB seeds
    console.log('\nFalling back to spreadsheet seed import...');
    await runFromSpreadsheetSeeds(supabase, config, singleSeed, dryRun);
    return;
  }

  const seeds: CanonicalEntity[] = (seedRows ?? []).map(
    (r: Record<string, unknown>) => (r as Record<string, unknown>).canonical_entities as CanonicalEntity,
  );

  if (seeds.length === 0) {
    console.log('No seeds found in database. Falling back to spreadsheet import...');
    await runFromSpreadsheetSeeds(supabase, config, singleSeed, dryRun);
    return;
  }

  console.log(`\n=== ENRICHMENT SWEEP ===`);
  console.log(`Seeds: ${seeds.length}`);
  console.log(`Layers: A (gov registries + co-directors) → B (web + news + LLM) → persist`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  if (dryRun) console.log(`DRY RUN — no data will be persisted\n`);

  // Create a run record
  const runId = generateId();
  if (!dryRun) {
    await supabase.from('runs').insert({
      run_id: runId,
      run_type: 'seed',
      schema_version: '00010',
      status: 'running',
      started_at: new Date().toISOString(),
    });
  }

  const stats = await processSeedsWithConcurrency(seeds, config, supabase, runId, dryRun);
  printReport(stats);

  // Mark run complete
  if (!dryRun) {
    await supabase.from('runs').update({
      status: stats.failed === 0 ? 'completed' : 'completed_with_warnings',
      completed_at: new Date().toISOString(),
    }).eq('run_id', runId);
  }

  // Query and display network net worth
  if (!dryRun && stats.succeeded > 0) {
    const { data: nnw } = await supabase
      .from('entity_wealth_summary')
      .select('*')
      .not('personal_wealth_band', 'eq', 'unknown')
      .order('total_ecosystem_value_gbp', { ascending: false })
      .limit(20);

    if (nnw && nnw.length > 0) {
      console.log('\n=== TOP 20 BY ECOSYSTEM VALUE ===');
      console.log('Name                           | Personal Band  | Network Worth    | Ecosystem Total');
      console.log('-------------------------------|----------------|------------------|----------------');
      for (const row of nnw) {
        const name = (row.display_name as string).padEnd(30);
        const band = ((row.personal_wealth_band as string) ?? 'unknown').padEnd(14);
        const netWorth = `£${formatLargeNumber(row.network_net_worth_gbp as number)}`.padEnd(16);
        const total = `£${formatLargeNumber(row.total_ecosystem_value_gbp as number)}`;
        console.log(`${name} | ${band} | ${netWorth} | ${total}`);
      }
    }
  }
}

async function processSeedsWithConcurrency(
  seeds: CanonicalEntity[],
  config: ReturnType<typeof buildSweepConfig>,
  supabase: AnySupabase,
  runId: string,
  dryRun: boolean,
): Promise<SweepStats> {
  const stats: SweepStats = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    totalSignals: 0,
    totalRelationships: 0,
    totalArticles: 0,
    totalCoDirectors: 0,
    wealthBands: {},
    errors: [],
  };

  const queue = [...seeds];
  const active: Promise<void>[] = [];

  const processOne = async (entity: CanonicalEntity) => {
    stats.processed++;
    const progress = `[${stats.processed}/${seeds.length}]`;

    try {
      console.log(`${progress} Sweeping: ${entity.display_name}...`);

      if (dryRun) {
        console.log(`  → DRY RUN — skipped`);
        stats.succeeded++;
        return;
      }

      const { sweep, persist } = await runAndPersistSweep(
        entity, config, supabase, runId,
      );

      const coDirectorSignals = sweep.signals.filter(s => s.source === 'companies_house_co_director');
      const coDirectorCount = coDirectorSignals.reduce((sum, s) => sum + s.discovered_relationships.length, 0);

      stats.succeeded++;
      stats.totalSignals += sweep.signals.length;
      stats.totalRelationships += persist.relationshipsCreated;
      stats.totalArticles += persist.articlesStored;
      stats.totalCoDirectors += coDirectorCount;
      stats.wealthBands[sweep.wealth_band ?? 'unknown'] = (stats.wealthBands[sweep.wealth_band ?? 'unknown'] ?? 0) + 1;

      console.log(
        `  → ${sweep.signals.length} signals, ${persist.relationshipsCreated} relationships, ` +
        `${coDirectorCount} co-directors, ${persist.articlesStored} articles, ` +
        `wealth: ${sweep.wealth_band}`,
      );
    } catch (err) {
      stats.failed++;
      const msg = err instanceof Error ? err.message : String(err);
      stats.errors.push({ name: entity.display_name, error: msg });
      console.error(`  → FAILED: ${msg}`);
    }
  };

  for (const entity of queue) {
    if (active.length >= CONCURRENCY) {
      await Promise.race(active);
    }
    const p = processOne(entity).then(() => {
      active.splice(active.indexOf(p), 1);
    });
    active.push(p);
  }

  await Promise.all(active);
  return stats;
}

function printReport(stats: SweepStats) {
  console.log(`\n${'='.repeat(60)}`);
  console.log('SWEEP COMPLETE');
  console.log('='.repeat(60));
  console.log(`  Processed:       ${stats.processed}`);
  console.log(`  Succeeded:       ${stats.succeeded}`);
  console.log(`  Failed:          ${stats.failed}`);
  console.log(`  Total signals:   ${stats.totalSignals}`);
  console.log(`  Relationships:   ${stats.totalRelationships}`);
  console.log(`  Co-directors:    ${stats.totalCoDirectors}`);
  console.log(`  Articles:        ${stats.totalArticles}`);
  console.log(`\n  Wealth bands:`);
  for (const [band, count] of Object.entries(stats.wealthBands).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${band}: ${count}`);
  }
  if (stats.errors.length > 0) {
    console.log(`\n  Errors:`);
    for (const e of stats.errors) {
      console.log(`    ${e.name}: ${e.error}`);
    }
  }
}

async function runFromSpreadsheetSeeds(
  supabase: AnySupabase,
  config: ReturnType<typeof buildSweepConfig>,
  singleSeed: string | null,
  dryRun: boolean,
) {
  // Import seeds directly from the HNW spreadsheet
  let openpyxl;
  try {
    // This is a TypeScript script — we'll read the JSON we extracted earlier
    const fs = await import('fs');
    const hnwPath = '/tmp/hnw_clean.json';
    if (!fs.existsSync(hnwPath)) {
      console.error('No seed data found. Run the analysis script first or populate the database.');
      process.exit(1);
    }

    const hnwData = JSON.parse(fs.readFileSync(hnwPath, 'utf-8')) as Array<{
      first: string; last: string; full: string;
      account: string; affiliation: string; introduced_by: string;
    }>;

    let seeds = hnwData;
    if (singleSeed) {
      seeds = seeds.filter(s => s.full.toLowerCase().includes(singleSeed.toLowerCase()));
    }

    console.log(`\nLoaded ${seeds.length} seeds from spreadsheet cache`);

    // Create canonical entities for each seed if they don't exist
    const entities: CanonicalEntity[] = [];
    for (const seed of seeds) {
      const entityId = generateId();

      if (!dryRun) {
        const { data: existing } = await supabase
          .from('canonical_entities')
          .select('canonical_entity_id, display_name')
          .eq('display_name', seed.full)
          .eq('entity_type', 'person')
          .limit(1)
          .single();

        if (existing) {
          entities.push(existing as unknown as CanonicalEntity);
          continue;
        }

        await supabase.from('canonical_entities').insert({
          canonical_entity_id: entityId,
          entity_type: 'person',
          display_name: seed.full,
          first_seen_run_id: 'spreadsheet_import',
          last_seen_run_id: 'spreadsheet_import',
          attributes: {
            affiliation: seed.affiliation || null,
            introduced_by: seed.introduced_by || null,
            source_list: 'HNW',
          },
          source: 'seed_import',
        });
      }

      entities.push({
        canonical_entity_id: entityId,
        entity_type: 'person',
        display_name: seed.full,
        first_seen_run_id: 'spreadsheet_import',
        last_seen_run_id: 'spreadsheet_import',
        source: 'seed_import',
        attributes: { affiliation: seed.affiliation },
      } as CanonicalEntity);
    }

    const runId = generateId();
    if (!dryRun) {
      await supabase.from('runs').insert({
        run_id: runId,
        run_type: 'seed',
        schema_version: '00010',
        status: 'running',
        started_at: new Date().toISOString(),
      });
    }

    const stats = await processSeedsWithConcurrency(entities, config, supabase, runId, dryRun);
    printReport(stats);
  } catch (err) {
    console.error('Spreadsheet fallback failed:', err);
    process.exit(1);
  }
}

function getArg(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function formatLargeNumber(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
