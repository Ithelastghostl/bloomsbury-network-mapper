/**
 * CLI: Parse agent transcript files and persist enrichment data to Supabase.
 *
 * Usage:
 *   npx tsx web/scripts/batch-ingest.ts <transcript-dir> [--dry-run] [--seed "Name"]
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Examples:
 *   npx tsx web/scripts/batch-ingest.ts /tmp/agent-outputs
 *   npx tsx web/scripts/batch-ingest.ts /tmp/agent-outputs --dry-run
 *   npx tsx web/scripts/batch-ingest.ts /tmp/agent-outputs --seed "Howard Shore"
 */

import { createClient } from '@supabase/supabase-js';
import { parseTranscriptDir } from '../src/lib/batch-ingest/transcript-parser';
import { runBatchIngest } from '../src/lib/batch-ingest/ingest-pipeline';

async function main() {
  const args = process.argv.slice(2);
  const transcriptDir = args.find(a => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  const seedFilter = getArg(args, '--seed');

  if (!transcriptDir) {
    console.error('Usage: npx tsx web/scripts/batch-ingest.ts <transcript-dir> [--dry-run] [--seed "Name"]');
    process.exit(1);
  }

  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseKey, {
    db: { schema: 'app' },
    auth: { persistSession: false },
  });

  // 1. Parse all transcripts
  console.log(`\n=== BATCH INGEST ===`);
  console.log(`Source: ${transcriptDir}`);
  console.log(`Dry run: ${dryRun}`);
  if (seedFilter) console.log(`Seed filter: ${seedFilter}`);

  console.log('\nParsing transcripts...');
  let outputs = parseTranscriptDir(transcriptDir);
  console.log(`Parsed ${outputs.length} agent outputs`);

  if (seedFilter) {
    const filterLower = seedFilter.toLowerCase();
    outputs = outputs.filter(o => o.seed_name.toLowerCase().includes(filterLower));
    console.log(`Filtered to ${outputs.length} matching "${seedFilter}"`);
  }

  if (outputs.length === 0) {
    console.log('No outputs to ingest.');
    process.exit(0);
  }

  // Show summary before ingesting
  let totalRels = 0;
  let totalCoDirs = 0;
  let totalDirships = 0;
  for (const o of outputs) {
    totalRels += o.relationships_found.length;
    totalCoDirs += o.co_directors.length;
    totalDirships += o.directorships.length;
  }
  console.log(`\nPre-ingest summary:`);
  console.log(`  Seeds:          ${outputs.length}`);
  console.log(`  Directorships:  ${totalDirships}`);
  console.log(`  Co-directors:   ${totalCoDirs}`);
  console.log(`  Relationships:  ${totalRels}`);

  // 2. Run the ingest pipeline
  console.log('\nIngesting...\n');
  const result = await runBatchIngest(supabase, outputs, {
    sourcePath: transcriptDir,
    dryRun,
  });

  // 3. Print report
  console.log(`\n${'='.repeat(60)}`);
  console.log('BATCH INGEST COMPLETE');
  console.log('='.repeat(60));
  console.log(`  Run ID:            ${result.runId}`);
  console.log(`  Seeds processed:   ${result.seedsProcessed}`);
  console.log(`  Seeds succeeded:   ${result.seedsSucceeded}`);
  console.log(`  Seeds failed:      ${result.seedsFailed}`);
  console.log(`  Entities created:  ${result.entitiesCreated}`);
  console.log(`  Entities reused:   ${result.entitiesReused}`);
  console.log(`  Connections:       ${result.connectionsCreated}`);
  console.log(`  Co-director edges: ${result.coDirectorEdgesCreated}`);
  console.log(`  Wealth estimates:  ${result.wealthEstimatesCreated}`);
  console.log(`  Evidence records:  ${result.evidenceRecordsCreated}`);

  if (result.errors.length > 0) {
    console.log(`\n  Errors:`);
    for (const e of result.errors) {
      console.log(`    ${e.seedName}: ${e.error}`);
    }
  }

  // 4. Quick DB summary
  if (!dryRun) {
    const { count: entityCount } = await supabase
      .from('canonical_entities')
      .select('*', { count: 'exact', head: true });
    const { count: connectionCount } = await supabase
      .from('network_connections')
      .select('*', { count: 'exact', head: true });
    const { count: coDirectorCount } = await supabase
      .from('co_director_edges')
      .select('*', { count: 'exact', head: true });

    console.log(`\n  Database totals:`);
    console.log(`    Canonical entities:  ${entityCount}`);
    console.log(`    Network connections: ${connectionCount}`);
    console.log(`    Co-director edges:   ${coDirectorCount}`);
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

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
