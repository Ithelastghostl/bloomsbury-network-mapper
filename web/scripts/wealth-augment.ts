/**
 * CLI: Wealth augmentation — select targets from Supabase + store research results.
 *
 * Research runs through Claude Code agents (web search on your subscription).
 * This script handles two things: picking WHO to research, and STORING results.
 *
 * Workflow:
 *   1. Run with --select to pick targets → writes /tmp/wealth-targets.json
 *   2. Claude Code agents research each target using web search
 *   3. Run with --import to store results → writes to Supabase
 *
 * Or just ask Claude Code: "run wealth augmentation for entities with no wealth data"
 * and it will orchestrate all three steps automatically.
 *
 * Usage:
 *   npx tsx web/scripts/wealth-augment.ts [options]
 *
 * Selection options:
 *   --min-connections N   Only entities with >= N connections (default: 2)
 *   --band BAND           Only entities with this wealth band (e.g. "25m_100m", "none")
 *   --entity-type TYPE    Filter by entity type: "person" | "company" (default: person)
 *   --entity-ids ID,...   Comma-separated entity IDs
 *   --names "Name,..."    Comma-separated display names
 *   --limit N             Max entities to process (default: 50)
 *
 * Mode flags:
 *   --select              Select targets → /tmp/wealth-targets.json, then exit
 *   --import FILE         Import research results from JSON and store to Supabase
 *   --dry-run             Show what would be selected without writing anything
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Examples:
 *   npx tsx web/scripts/wealth-augment.ts --dry-run
 *   npx tsx web/scripts/wealth-augment.ts --band none --select
 *   npx tsx web/scripts/wealth-augment.ts --names "Jon Moulton,Danny Rimer" --select
 *   npx tsx web/scripts/wealth-augment.ts --import /tmp/wealth-results.json
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { generateId } from '../src/lib/ulid';

type AnySupabase = SupabaseClient<any, any, any>;

interface TargetEntity {
  canonical_entity_id: string;
  display_name: string;
  entity_type: string;
  attributes: Record<string, unknown>;
  connection_count: number;
  current_band: string | null;
}

export interface WealthResearchResult {
  entity_id: string;
  display_name: string;
  estimated_net_worth_gbp: number | null;
  wealth_band: string;
  wealth_score: number;
  confidence: number;
  wealth_source: string;
  wealth_origin: string;
  evidence_summary: string;
  sources: string[];
}

async function main() {
  const args = process.argv.slice(2);
  const minConnections = parseInt(getArg(args, '--min-connections') ?? '2', 10);
  const bandFilter = getArg(args, '--band');
  const entityType = getArg(args, '--entity-type') ?? 'person';
  const entityIds = getArg(args, '--entity-ids')?.split(',').map(s => s.trim());
  const names = getArg(args, '--names')?.split(',').map(s => s.trim());
  const limit = parseInt(getArg(args, '--limit') ?? '50', 10);
  const dryRun = args.includes('--dry-run');
  const selectOnly = args.includes('--select');
  const importFile = getArg(args, '--import');

  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(supabaseUrl, supabaseKey, {
    db: { schema: 'app' },
    auth: { persistSession: false },
  });

  console.log('\n=== WEALTH AUGMENTATION ===');

  // --- IMPORT MODE: store research results ---
  if (importFile) {
    console.log(`Importing results from: ${importFile}`);
    const raw = readFileSync(importFile, 'utf-8');
    const results: WealthResearchResult[] = JSON.parse(raw);
    console.log(`Found ${results.length} results to store.\n`);

    let stored = 0;
    for (const r of results) {
      try {
        if (!r.entity_id && r.display_name) {
          const { data } = await supabase
            .from('canonical_entities')
            .select('canonical_entity_id')
            .eq('display_name', r.display_name)
            .limit(1)
            .single();
          if (data) r.entity_id = data.canonical_entity_id;
        }
        if (!r.entity_id) {
          console.log(`  ✗ ${r.display_name}: entity not found in DB`);
          continue;
        }
        await storeWealthResult(supabase, r);
        stored++;
        const nw = r.estimated_net_worth_gbp ? `£${formatGbp(r.estimated_net_worth_gbp)}` : 'unknown';
        console.log(`  ✓ ${r.display_name}: ${nw} (${r.wealth_band})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  ✗ ${r.display_name}: ${msg}`);
      }
    }

    console.log(`\nStored ${stored}/${results.length} results.`);
    return;
  }

  // --- SELECT MODE: pick targets ---
  console.log(`Entity type:      ${entityType}`);
  console.log(`Min connections:  ${minConnections}`);
  if (bandFilter) console.log(`Band filter:      ${bandFilter}`);
  if (entityIds) console.log(`Entity IDs:       ${entityIds.join(', ')}`);
  if (names) console.log(`Names:            ${names.join(', ')}`);
  console.log(`Limit:            ${limit}`);

  console.log('\nSelecting targets...');
  const targets = await selectTargets(supabase, {
    minConnections, bandFilter, entityType, entityIds, names, limit,
  });

  if (targets.length === 0) {
    console.log('No entities match the criteria.');
    process.exit(0);
  }

  console.log(`Found ${targets.length} targets:`);
  for (const t of targets) {
    const band = t.current_band ?? 'none';
    console.log(`  ${t.display_name} (${t.canonical_entity_id}) — ${t.connection_count} connections, band: ${band}`);
  }

  if (dryRun) {
    console.log('\nDry run — stopping here.');
    return;
  }

  if (selectOnly) {
    const outPath = '/tmp/wealth-targets.json';
    writeFileSync(outPath, JSON.stringify(targets, null, 2));
    console.log(`\nTargets written to: ${outPath}`);
    console.log('Next: Claude Code agents research these targets, then run --import to store.');
    return;
  }

  // Default: select and print, same as --dry-run
  console.log('\nUse --select to export targets, or --import FILE to store results.');
}

async function selectTargets(
  supabase: AnySupabase,
  opts: {
    minConnections: number;
    bandFilter: string | null;
    entityType: string;
    entityIds: string[] | undefined;
    names: string[] | undefined;
    limit: number;
  },
): Promise<TargetEntity[]> {
  if (opts.entityIds?.length) {
    const { data, error } = await supabase
      .from('canonical_entities')
      .select('canonical_entity_id, display_name, entity_type, attributes')
      .in('canonical_entity_id', opts.entityIds);
    if (error) throw new Error(`Failed to fetch entities: ${error.message}`);
    return (data ?? []).map(e => ({ ...e, connection_count: 0, current_band: null }));
  }

  if (opts.names?.length) {
    const { data, error } = await supabase
      .from('canonical_entities')
      .select('canonical_entity_id, display_name, entity_type, attributes')
      .in('display_name', opts.names);
    if (error) throw new Error(`Failed to fetch entities: ${error.message}`);
    return (data ?? []).map(e => ({ ...e, connection_count: 0, current_band: null }));
  }

  const { data: connections, error: connErr } = await supabase
    .from('network_connections')
    .select('source_entity_id');
  if (connErr) throw new Error(`Failed to fetch connections: ${connErr.message}`);

  const countMap = new Map<string, number>();
  for (const c of connections ?? []) {
    countMap.set(c.source_entity_id, (countMap.get(c.source_entity_id) ?? 0) + 1);
  }

  const { data: entities, error: entErr } = await supabase
    .from('canonical_entities')
    .select('canonical_entity_id, display_name, entity_type, attributes')
    .eq('entity_type', opts.entityType);
  if (entErr) throw new Error(`Failed to fetch entities: ${entErr.message}`);

  const { data: wealthData } = await supabase
    .from('wealth_estimates')
    .select('entity_id, band')
    .order('assessed_at', { ascending: false });

  const latestBand = new Map<string, string>();
  for (const w of wealthData ?? []) {
    if (!latestBand.has(w.entity_id)) {
      latestBand.set(w.entity_id, w.band);
    }
  }

  const targets: TargetEntity[] = (entities ?? [])
    .map(e => ({
      ...e,
      connection_count: countMap.get(e.canonical_entity_id) ?? 0,
      current_band: latestBand.get(e.canonical_entity_id) ?? null,
    }))
    .filter(e => e.connection_count >= opts.minConnections)
    .filter(e => !opts.bandFilter || (e.current_band ?? 'none') === opts.bandFilter);

  targets.sort((a, b) => b.connection_count - a.connection_count);
  return targets.slice(0, opts.limit);
}

async function storeWealthResult(
  supabase: AnySupabase,
  result: WealthResearchResult,
): Promise<void> {
  const evidenceId = generateId();

  await supabase.from('enrichment_evidence').insert({
    evidence_id: evidenceId,
    entity_id: result.entity_id,
    source: 'web_search',
    source_layer: 'B',
    evidence_text: result.evidence_summary.slice(0, 1000),
    confidence: result.confidence,
    raw_payload: {
      estimated_net_worth_gbp: result.estimated_net_worth_gbp,
      wealth_source: result.wealth_source,
      wealth_origin: result.wealth_origin,
      sources: result.sources,
    },
  });

  const { error: weError } = await supabase.from('wealth_estimates').upsert({
    wealth_estimate_id: generateId(),
    entity_id: result.entity_id,
    band: result.wealth_band,
    score: result.wealth_score,
    confidence: result.confidence,
    evidence: [
      {
        signal: 'web_research_net_worth',
        source_layer: 'B',
        contribution: result.wealth_score,
        detail: result.evidence_summary,
        estimated_net_worth_gbp: result.estimated_net_worth_gbp,
        wealth_source: result.wealth_source,
        wealth_origin: result.wealth_origin,
        sources: result.sources,
      },
    ],
    assessed_at: new Date().toISOString(),
  }, {
    onConflict: 'entity_id,sweep_run_id',
    ignoreDuplicates: false,
  });

  if (weError && !weError.code?.startsWith('23505')) {
    console.warn(`    Warning: wealth_estimates upsert failed: ${weError.message}`);
  }

  const { data: existing } = await supabase
    .from('canonical_entities')
    .select('attributes')
    .eq('canonical_entity_id', result.entity_id)
    .single();

  const attrs = (existing?.attributes ?? {}) as Record<string, unknown>;
  const { error: updateErr } = await supabase
    .from('canonical_entities')
    .update({
      attributes: {
        ...attrs,
        estimated_net_worth_gbp: result.estimated_net_worth_gbp,
        wealth_band: result.wealth_band,
        wealth_score: result.wealth_score,
        wealth_source: result.wealth_source,
        wealth_origin: result.wealth_origin,
        wealth_augmented_at: new Date().toISOString(),
      },
    })
    .eq('canonical_entity_id', result.entity_id);

  if (updateErr) {
    console.warn(`    Warning: entity attributes update failed: ${updateErr.message}`);
  }
}

function formatGbp(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}bn`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
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
