import type { SupabaseClient } from '@supabase/supabase-js';
import { generateId } from '@/lib/ulid';
import { EntityCache, resolveOrCreate, cleanName } from './entity-dedup';
import { assessWealth } from './wealth-scorer';
import type {
  ParsedAgentOutput,
  IngestResult,
  SeedIngestResult,
} from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>;

export interface IngestOptions {
  sourcePath: string;
  dryRun?: boolean;
}

/**
 * Ingest a batch of parsed agent outputs into the graph database.
 * Sequential per-seed to avoid entity creation races.
 */
export async function runBatchIngest(
  supabase: AnySupabase,
  outputs: ParsedAgentOutput[],
  options: IngestOptions,
): Promise<IngestResult> {
  const runId = generateId();
  const result: IngestResult = {
    runId,
    seedsProcessed: 0,
    seedsSucceeded: 0,
    seedsFailed: 0,
    entitiesCreated: 0,
    entitiesReused: 0,
    connectionsCreated: 0,
    coDirectorEdgesCreated: 0,
    wealthEstimatesCreated: 0,
    evidenceRecordsCreated: 0,
    errors: [],
  };

  // Create run record
  if (!options.dryRun) {
    await supabase.from('runs').insert({
      run_id: runId,
      run_type: 'seed',
      schema_version: '00011',
      status: 'running',
      started_at: new Date().toISOString(),
    });
  }

  // Pre-load entity cache (skip in dry-run mode)
  let cache: EntityCache;
  if (options.dryRun) {
    cache = new EntityCache();
    console.log('Dry run — entity cache skipped');
  } else {
    console.log('Loading entity cache...');
    cache = await EntityCache.load(supabase);
    console.log(`Entity cache loaded: ${cache.size} entities`);
  }

  // Process seeds sequentially
  for (const output of outputs) {
    result.seedsProcessed++;
    const progress = `[${result.seedsProcessed}/${outputs.length}]`;

    try {
      console.log(`${progress} Ingesting: ${output.seed_name}...`);

      if (options.dryRun) {
        console.log(`  → DRY RUN — skipped`);
        result.seedsSucceeded++;
        continue;
      }

      const seedResult = await ingestOneSeed(supabase, cache, output, runId);

      result.seedsSucceeded++;
      result.entitiesCreated += seedResult.entitiesCreated;
      result.entitiesReused += seedResult.entitiesReused;
      result.connectionsCreated += seedResult.connectionsCreated;
      result.coDirectorEdgesCreated += seedResult.coDirectorEdgesCreated;
      result.wealthEstimatesCreated += seedResult.wealthEstimateCreated ? 1 : 0;
      result.evidenceRecordsCreated += seedResult.evidenceRecordsCreated;

      console.log(
        `  → ${seedResult.entitiesCreated} new entities, ` +
        `${seedResult.entitiesReused} reused, ` +
        `${seedResult.connectionsCreated} connections, ` +
        `${seedResult.coDirectorEdgesCreated} co-directors`,
      );
    } catch (err) {
      result.seedsFailed++;
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push({ seedName: output.seed_name, error: msg });
      console.error(`  → FAILED: ${msg}`);
    }
  }

  // Mark run complete
  if (!options.dryRun) {
    await supabase.from('runs').update({
      status: result.seedsFailed === 0 ? 'completed' : 'completed_with_warnings',
      completed_at: new Date().toISOString(),
    }).eq('run_id', runId);
  }

  return result;
}

async function ingestOneSeed(
  supabase: AnySupabase,
  cache: EntityCache,
  output: ParsedAgentOutput,
  runId: string,
): Promise<SeedIngestResult> {
  const result: SeedIngestResult = {
    seedName: output.seed_name,
    seedEntityId: '',
    entitiesCreated: 0,
    entitiesReused: 0,
    connectionsCreated: 0,
    coDirectorEdgesCreated: 0,
    wealthEstimateCreated: false,
    evidenceRecordsCreated: 0,
  };

  // 1. Resolve seed entity
  const seedEntity = await resolveOrCreate(
    supabase, cache, output.seed_name, 'person', runId,
  );
  result.seedEntityId = seedEntity.canonicalEntityId;
  if (seedEntity.isNew) result.entitiesCreated++;
  else result.entitiesReused++;

  // 2. Create sweep_run record
  const sweepRunId = generateId();
  await supabase.from('sweep_runs').insert({
    sweep_run_id: sweepRunId,
    entity_id: seedEntity.canonicalEntityId,
    run_id: runId,
    layers_completed: ['A', 'B'],
    signals_count: output.directorships.length + output.co_directors.length + output.wealth_signals.length,
    relationships_found: output.relationships_found.length,
    articles_found: 0,
    status: 'running',
    started_at: new Date().toISOString(),
  });

  // 3. Ingest directorships as company entities + connections
  for (const d of output.directorships) {
    if (!d.company_name) continue;

    const companyEntity = await resolveOrCreate(
      supabase, cache, d.company_name, 'company', runId, d.company_number,
    );
    if (companyEntity.isNew) result.entitiesCreated++;
    else result.entitiesReused++;

    const evidenceId = generateId();
    await supabase.from('enrichment_evidence').insert({
      evidence_id: evidenceId,
      entity_id: seedEntity.canonicalEntityId,
      source: 'companies_house',
      source_layer: 'A',
      evidence_url: d.company_number
        ? `https://find-and-update.company-information.service.gov.uk/company/${d.company_number}`
        : null,
      evidence_text: `${d.role} of ${d.company_name}${d.company_number ? ` (${d.company_number})` : ''}`,
      confidence: 0.95,
      sweep_run_id: sweepRunId,
    });
    result.evidenceRecordsCreated++;

    await upsertConnection(supabase, {
      sourceEntityId: seedEntity.canonicalEntityId,
      targetEntityId: companyEntity.canonicalEntityId,
      connectionType: 'DIRECTOR_OF',
      viaOrganisation: null,
      confidence: 0.95,
      evidenceId,
      source: 'companies_house',
      sourceLayer: 'A',
    });
    result.connectionsCreated++;
  }

  // 4. Ingest co-directors as person entities + co_director_edges
  for (const cd of output.co_directors) {
    const cleaned = cleanName(cd.name);
    if (!cleaned || cleaned.length < 3) continue;

    const coDirectorEntity = await resolveOrCreate(
      supabase, cache, cleaned, 'person', runId,
    );
    if (coDirectorEntity.isNew) result.entitiesCreated++;
    else result.entitiesReused++;

    // Determine the company for this co-director edge
    const companies = cd.companies ?? (cd.company_name ? [cd.company_name] : []);
    for (const companyName of companies) {
      const companyEntity = cache.findByName(companyName, 'company')
        ?? cache.findByName(companyName);

      const companyNumber = companyEntity
        ? '' // Already resolved
        : output.directorships.find(d =>
            d.company_name.toLowerCase() === companyName.toLowerCase(),
          )?.company_number ?? '';

      await supabase.from('co_director_edges').upsert({
        co_director_edge_id: generateId(),
        seed_entity_id: seedEntity.canonicalEntityId,
        co_director_entity_id: coDirectorEntity.canonicalEntityId,
        company_number: companyNumber,
        company_name: companyName,
        seed_role: cd.role ?? 'director',
        co_director_role: cd.role ?? 'director',
        co_director_name: cleaned,
        confidence: 0.90,
        sweep_run_id: sweepRunId,
      }, {
        onConflict: 'seed_entity_id,co_director_entity_id,company_number',
        ignoreDuplicates: true,
      });
      result.coDirectorEdgesCreated++;
    }

    // Also create a network_connection
    await upsertConnection(supabase, {
      sourceEntityId: seedEntity.canonicalEntityId,
      targetEntityId: coDirectorEntity.canonicalEntityId,
      connectionType: 'CO_DIRECTOR_OF',
      viaOrganisation: companies[0] ?? null,
      confidence: 0.90,
      source: 'companies_house_co_director',
      sourceLayer: 'A',
    });
    result.connectionsCreated++;
  }

  // 5. Ingest relationships_found as person entities + connections
  const seenRelNames = new Set<string>();
  for (const rel of output.relationships_found) {
    const cleaned = cleanName(rel);
    if (!cleaned || cleaned.length < 3) continue;

    const normKey = cleaned.toLowerCase();
    if (seenRelNames.has(normKey)) continue;
    seenRelNames.add(normKey);

    // Skip if it's the seed themselves
    if (normKey === output.seed_name.toLowerCase()) continue;

    const relEntity = await resolveOrCreate(
      supabase, cache, cleaned, 'person', runId,
    );
    if (relEntity.isNew) result.entitiesCreated++;
    else result.entitiesReused++;

    // Determine connection type from the relationship text
    const relLower = rel.toLowerCase();
    let connectionType = 'ASSOCIATED_WITH';
    if (relLower.includes('co-director') || relLower.includes('co-founder')) {
      connectionType = 'CO_DIRECTOR_OF';
    } else if (relLower.includes('trustee')) {
      connectionType = 'CO_TRUSTEE';
    } else if (relLower.includes('family') || relLower.includes('spouse') || relLower.includes('brother') || relLower.includes('sister') || relLower.includes('wife') || relLower.includes('husband')) {
      connectionType = 'FAMILY_MEMBER';
    } else if (relLower.includes('advisor') || relLower.includes('counsel')) {
      connectionType = 'ADVISOR_TO';
    }

    // Extract via_organisation from parenthetical context
    const orgMatch = rel.match(/(?:at|of|via)\s+([^;,()]+)/i);
    const viaOrg = orgMatch ? orgMatch[1].trim() : null;

    const evidenceId = generateId();
    await supabase.from('enrichment_evidence').insert({
      evidence_id: evidenceId,
      entity_id: seedEntity.canonicalEntityId,
      source: 'web_search',
      source_layer: 'B',
      evidence_text: rel.slice(0, 500),
      confidence: 0.75,
      sweep_run_id: sweepRunId,
    });
    result.evidenceRecordsCreated++;

    await upsertConnection(supabase, {
      sourceEntityId: seedEntity.canonicalEntityId,
      targetEntityId: relEntity.canonicalEntityId,
      connectionType,
      viaOrganisation: viaOrg,
      confidence: 0.75,
      evidenceId,
      source: 'web_search',
      sourceLayer: 'B',
    });
    result.connectionsCreated++;
  }

  // 6. Wealth assessment
  const wealth = assessWealth(output);
  if (wealth.band !== 'unknown') {
    await supabase.from('wealth_estimates').upsert({
      wealth_estimate_id: generateId(),
      entity_id: seedEntity.canonicalEntityId,
      band: wealth.band,
      score: wealth.score,
      confidence: wealth.confidence,
      evidence: wealth.evidence,
      sweep_run_id: sweepRunId,
    }, { onConflict: 'entity_id,sweep_run_id' });
    result.wealthEstimateCreated = true;

    // Update canonical entity attributes
    const { data: existing } = await supabase
      .from('canonical_entities')
      .select('attributes')
      .eq('canonical_entity_id', seedEntity.canonicalEntityId)
      .single();

    const attrs = (existing?.attributes ?? {}) as Record<string, unknown>;
    await supabase
      .from('canonical_entities')
      .update({
        attributes: {
          ...attrs,
          wealth_band: wealth.band,
          wealth_score: wealth.score,
          wealth_assessed_at: new Date().toISOString(),
        },
      })
      .eq('canonical_entity_id', seedEntity.canonicalEntityId);
  }

  // 7. Mark sweep run complete
  await supabase.from('sweep_runs').update({
    status: 'completed',
    completed_at: new Date().toISOString(),
    wealth_band: wealth.band,
    wealth_score: wealth.score,
    relationships_found: result.connectionsCreated,
  }).eq('sweep_run_id', sweepRunId);

  return result;
}

interface ConnectionInput {
  sourceEntityId: string;
  targetEntityId: string;
  connectionType: string;
  viaOrganisation: string | null;
  confidence: number;
  evidenceId?: string;
  source: string;
  sourceLayer: 'A' | 'B' | 'C';
}

async function upsertConnection(
  supabase: AnySupabase,
  input: ConnectionInput,
): Promise<void> {
  // Unique index uses coalesce expressions — insert and silently skip on conflict
  const { error } = await supabase.from('network_connections').insert({
    connection_id: generateId(),
    source_entity_id: input.sourceEntityId,
    connected_entity_id: input.targetEntityId,
    staged_entity_id: null,
    connection_type: input.connectionType,
    via_organisation: input.viaOrganisation,
    via_organisation_id: null,
    priority: input.confidence >= 0.90 ? 1 : input.confidence >= 0.75 ? 2 : 3,
    augmentation_run_id: null,
    background_check: {},
    evidence: {
      evidence_id: input.evidenceId,
      source: input.source,
      source_layer: input.sourceLayer,
      confidence: input.confidence,
    },
  });
  // Ignore duplicate key violations (23505) — means this connection already exists
  if (error && !error.code?.startsWith('23505')) {
    throw new Error(`Failed to create connection: ${error.message}`);
  }
}
