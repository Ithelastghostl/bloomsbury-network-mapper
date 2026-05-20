/**
 * Extraction status checker (F3.3 utility).
 *
 * Reports progress for a given extraction run: counts by status,
 * entity mention counts by type, and evidence span totals.
 *
 * Usage:
 *   npx tsx scripts/check-extraction-status.ts --run-id <id>
 */
import { resolve } from 'path';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const PROJECT_ROOT = resolve(import.meta.dirname, '..');
config({ path: resolve(PROJECT_ROOT, 'web', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in web/.env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: { schema: 'app' },
});

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function getRunId(): string {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--run-id' && args[i + 1]) {
      return args[i + 1];
    }
  }
  console.error('Usage: npx tsx scripts/check-extraction-status.ts --run-id <id>');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

async function countByStatus(runId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  let from = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('extraction_runs')
      .select('status')
      .eq('run_id', runId)
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`Failed to fetch extraction_runs: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      counts[row.status] = (counts[row.status] ?? 0) + 1;
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return counts;
}

async function countTotalDocs(runId: string): Promise<number> {
  const { count, error } = await supabase
    .from('extraction_runs')
    .select('extraction_run_id', { count: 'exact', head: true })
    .eq('run_id', runId);

  if (error) throw new Error(`Failed to count extraction_runs: ${error.message}`);
  return count ?? 0;
}

async function countEntityMentionsByType(runId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  let from = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('entity_mentions')
      .select('entity_type')
      .eq('run_id', runId)
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`Failed to fetch entity_mentions: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      counts[row.entity_type] = (counts[row.entity_type] ?? 0) + 1;
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return counts;
}

async function countEvidenceSpans(runId: string): Promise<number> {
  const { count, error } = await supabase
    .from('evidence_spans')
    .select('evidence_id', { count: 'exact', head: true })
    .eq('run_id', runId);

  if (error) throw new Error(`Failed to count evidence_spans: ${error.message}`);
  return count ?? 0;
}

async function countQuarantined(runId: string): Promise<number> {
  const { count, error } = await supabase
    .from('quarantine')
    .select('quarantine_id', { count: 'exact', head: true })
    .eq('run_id', runId)
    .eq('source_phase', 'extraction');

  if (error) throw new Error(`Failed to count quarantine: ${error.message}`);
  return count ?? 0;
}

async function getRunStatus(runId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('runs')
    .select('status')
    .eq('run_id', runId)
    .limit(1);

  if (error) throw new Error(`Failed to fetch run: ${error.message}`);
  return data?.[0]?.status ?? null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const runId = getRunId();

  const runStatus = await getRunStatus(runId);
  if (!runStatus) {
    console.error(`Run ${runId} not found.`);
    process.exit(1);
  }

  const [total, statusCounts, entityCounts, evidenceCount, quarantinedCount] = await Promise.all([
    countTotalDocs(runId),
    countByStatus(runId),
    countEntityMentionsByType(runId),
    countEvidenceSpans(runId),
    countQuarantined(runId),
  ]);

  console.log(`=== Extraction Status: ${runId} ===`);
  console.log(`Run status: ${runStatus}`);
  console.log('');

  console.log('Document counts:');
  console.log(`  Total in run:  ${total}`);
  console.log(`  Completed:     ${statusCounts['completed'] ?? 0}`);
  console.log(`  Failed:        ${statusCounts['failed_final'] ?? 0}`);
  console.log(`  Pending:       ${total - Object.values(statusCounts).reduce((a, b) => a + b, 0) > 0 ? total - Object.values(statusCounts).reduce((a, b) => a + b, 0) : 0}`);
  console.log(`  Quarantined:   ${quarantinedCount}`);
  console.log('');

  console.log('Entity mentions by type:');
  const totalEntities = Object.values(entityCounts).reduce((a, b) => a + b, 0);
  if (totalEntities === 0) {
    console.log('  (none)');
  } else {
    for (const [type, count] of Object.entries(entityCounts).sort()) {
      console.log(`  ${type}: ${count}`);
    }
    console.log(`  TOTAL: ${totalEntities}`);
  }
  console.log('');

  console.log(`Evidence spans: ${evidenceCount}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
