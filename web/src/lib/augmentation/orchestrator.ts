import type { SupabaseClient } from '@supabase/supabase-js';
import { ulid } from 'ulid';
import { runHnwResearch } from './hnw-research';
import { runNetworkMapping } from './network-mapping';
import type { CanonicalEntity } from '@/types/database';

type AnySupabaseClient = SupabaseClient<any, any, any>;

const DEFAULT_MAX_CONCURRENT = 5;
const DEFAULT_COST_CAP_USD = 50;

export interface OrchestratorConfig {
  anthropicApiKey: string;
  maxConcurrent?: number;
  costCapUsd?: number;
  phases?: ('research' | 'network_mapping')[];
}

export interface OrchestratorResult {
  run_id: string;
  seeds_processed: number;
  research_completed: number;
  network_mapped: number;
  total_cost_usd: number;
  errors: Array<{ entity_id: string; phase: string; error: string }>;
}

export async function runSeedAugmentation(
  supabase: AnySupabaseClient,
  runId: string,
  config: OrchestratorConfig,
): Promise<OrchestratorResult> {
  const maxConcurrent = config.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
  const costCap = config.costCapUsd ?? DEFAULT_COST_CAP_USD;
  const phases = config.phases ?? ['research', 'network_mapping'];

  await supabase.from('runs').update({
    cost_cap_usd: costCap,
  }).eq('run_id', runId);

  const result: OrchestratorResult = {
    run_id: runId,
    seeds_processed: 0,
    research_completed: 0,
    network_mapped: 0,
    total_cost_usd: 0,
    errors: [],
  };

  if (phases.includes('research')) {
    const { data: seedsForResearch } = await supabase
      .from('seeds')
      .select('canonical_entity_id')
      .eq('augmentation_status', 'not_started')
      .eq('active', true);

    if (seedsForResearch) {
      await processInBatches(
        seedsForResearch.map(s => s.canonical_entity_id),
        maxConcurrent,
        async (entityId) => {
          if (await isOverCostCap(supabase, runId, costCap)) {
            throw new Error('Cost cap exceeded');
          }

          const { data: entity } = await supabase
            .from('canonical_entities')
            .select('*')
            .eq('canonical_entity_id', entityId)
            .single();

          if (!entity) return;

          await enqueueJob(supabase, runId, 'seed_augmentation_research', entityId);

          try {
            const res = await runHnwResearch(
              entity as CanonicalEntity,
              supabase,
              runId,
              config.anthropicApiKey,
            );
            result.research_completed++;
            result.total_cost_usd += res.estimated_cost_usd;
          } catch (err) {
            result.errors.push({
              entity_id: entityId,
              phase: 'research',
              error: err instanceof Error ? err.message : String(err),
            });
          }
          result.seeds_processed++;
        },
      );
    }
  }

  if (phases.includes('network_mapping')) {
    const { data: seedsForMapping } = await supabase
      .from('seeds')
      .select('canonical_entity_id')
      .eq('augmentation_status', 'research_complete')
      .eq('active', true);

    if (seedsForMapping) {
      await processInBatches(
        seedsForMapping.map(s => s.canonical_entity_id),
        maxConcurrent,
        async (entityId) => {
          if (await isOverCostCap(supabase, runId, costCap)) {
            throw new Error('Cost cap exceeded');
          }

          const { data: entity } = await supabase
            .from('canonical_entities')
            .select('*')
            .eq('canonical_entity_id', entityId)
            .single();

          if (!entity) return;

          const { data: researchRun } = await supabase
            .from('seed_augmentation_runs')
            .select('result_storage_uri')
            .eq('canonical_entity_id', entityId)
            .eq('phase', 'research')
            .eq('status', 'completed')
            .order('completed_at', { ascending: false })
            .limit(1)
            .single();

          if (!researchRun?.result_storage_uri) {
            result.errors.push({
              entity_id: entityId,
              phase: 'network_mapping',
              error: 'No completed research profile found',
            });
            return;
          }

          const { data: profileData } = await supabase
            .storage
            .from('augmentation')
            .download(researchRun.result_storage_uri);

          const researchProfile = profileData ? await profileData.text() : '';

          await enqueueJob(supabase, runId, 'seed_augmentation_network', entityId);

          try {
            const res = await runNetworkMapping(
              entity as CanonicalEntity,
              researchProfile,
              supabase,
              runId,
              config.anthropicApiKey,
            );
            result.network_mapped++;
            result.total_cost_usd += res.estimated_cost_usd;
          } catch (err) {
            result.errors.push({
              entity_id: entityId,
              phase: 'network_mapping',
              error: err instanceof Error ? err.message : String(err),
            });
          }
        },
      );
    }
  }

  await supabase.from('runs').update({
    total_cost_usd: result.total_cost_usd,
    status: result.errors.length > 0 ? 'completed_with_warnings' : 'completed',
    completed_at: new Date().toISOString(),
  }).eq('run_id', runId);

  return result;
}

async function processInBatches<T>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.allSettled(batch.map(fn));
  }
}

async function isOverCostCap(
  supabase: AnySupabaseClient,
  runId: string,
  costCap: number,
): Promise<boolean> {
  const { data: run } = await supabase
    .from('runs')
    .select('total_cost_usd')
    .eq('run_id', runId)
    .single();

  return (run?.total_cost_usd ?? 0) >= costCap;
}

async function enqueueJob(
  supabase: AnySupabaseClient,
  runId: string,
  phase: string,
  entityId: string,
): Promise<void> {
  await supabase.from('pipeline_jobs').insert({
    job_id: ulid(),
    run_id: runId,
    phase,
    status: 'running',
    payload: { canonical_entity_id: entityId },
  });
}

export async function augmentSingleSeed(
  supabase: AnySupabaseClient,
  seedId: string,
  anthropicApiKey: string,
): Promise<{ research_run_id?: string; network_run_id?: string; cost: number }> {
  const { data: seed } = await supabase
    .from('seeds')
    .select('canonical_entity_id, augmentation_status')
    .eq('seed_id', seedId)
    .single();

  if (!seed) throw new Error('Seed not found');

  const { data: entity } = await supabase
    .from('canonical_entities')
    .select('*')
    .eq('canonical_entity_id', seed.canonical_entity_id)
    .single();

  if (!entity) throw new Error('Entity not found');

  const runId = ulid();
  await supabase.from('runs').insert({
    run_id: runId,
    run_type: 'seed',
    schema_version: '00008',
    status: 'running',
    cost_cap_usd: DEFAULT_COST_CAP_USD,
  });

  let totalCost = 0;
  let researchRunId: string | undefined;
  let networkRunId: string | undefined;

  if (seed.augmentation_status === 'not_started') {
    const res = await runHnwResearch(entity as CanonicalEntity, supabase, runId, anthropicApiKey);
    researchRunId = res.augmentation_run_id;
    totalCost += res.estimated_cost_usd;
  }

  if (seed.augmentation_status === 'not_started' || seed.augmentation_status === 'research_complete') {
    const { data: researchRun } = await supabase
      .from('seed_augmentation_runs')
      .select('result_storage_uri')
      .eq('canonical_entity_id', seed.canonical_entity_id)
      .eq('phase', 'research')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .single();

    const researchProfile = researchRun?.result_storage_uri
      ? await (await supabase.storage.from('augmentation').download(researchRun.result_storage_uri)).data?.text() ?? ''
      : '';

    const res = await runNetworkMapping(entity as CanonicalEntity, researchProfile, supabase, runId, anthropicApiKey);
    networkRunId = res.augmentation_run_id;
    totalCost += res.estimated_cost_usd;
  }

  await supabase.from('runs').update({
    status: 'completed',
    total_cost_usd: totalCost,
    completed_at: new Date().toISOString(),
  }).eq('run_id', runId);

  return { research_run_id: researchRunId, network_run_id: networkRunId, cost: totalCost };
}
