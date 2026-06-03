import type { SupabaseClient } from '@supabase/supabase-js';
import { ulid } from 'ulid';
import { processImport, createBootstrapRun } from './bootstrap';
import { reviewStagedEntities } from './staging';
import { runCorpusCrossRef } from './corpus-crossref';
import { scoreIntroductionRoutes } from './introduction-scoring';
import { runSeedAugmentation, type OrchestratorConfig } from '@/lib/augmentation/orchestrator';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

export interface FullPipelineConfig {
  importId: string;
  userId: string;
  anthropicApiKey: string;
  maxConcurrent?: number;
  costCapUsd?: number;
  skipAugmentation?: boolean;
}

export interface FullPipelineResult {
  run_id: string;
  phases: Record<string, PhaseResult>;
  total_cost_usd: number;
}

interface PhaseResult {
  status: 'completed' | 'skipped' | 'failed';
  duration_ms: number;
  details: unknown;
  error?: string;
}

export async function runFullSeedPipeline(
  supabase: AnySupabaseClient,
  config: FullPipelineConfig,
): Promise<FullPipelineResult> {
  const pipelineResult: FullPipelineResult = {
    run_id: '',
    phases: {},
    total_cost_usd: 0,
  };

  // Phase 1: Bootstrap (seed_import + seed_bootstrap)
  const bootstrapStart = Date.now();
  try {
    const { data: importRecord } = await supabase
      .from('seed_imports')
      .select('import_type')
      .eq('import_id', config.importId)
      .single();

    if (!importRecord) throw new Error('Import not found');

    const runId = await createBootstrapRun(supabase, config.userId);
    pipelineResult.run_id = runId;

    const bootstrapResult = await processImport(supabase, config.importId, {
      runId,
      importType: importRecord.import_type,
      userId: config.userId,
    });

    pipelineResult.phases.seed_bootstrap = {
      status: 'completed',
      duration_ms: Date.now() - bootstrapStart,
      details: bootstrapResult,
    };
  } catch (err) {
    pipelineResult.phases.seed_bootstrap = {
      status: 'failed',
      duration_ms: Date.now() - bootstrapStart,
      details: {},
      error: err instanceof Error ? err.message : String(err),
    };
    return pipelineResult;
  }

  // Phase 2: Augmentation (research + network mapping)
  if (config.skipAugmentation) {
    pipelineResult.phases.seed_augmentation = {
      status: 'skipped',
      duration_ms: 0,
      details: { reason: 'skipAugmentation=true' },
    };
  } else {
    const augStart = Date.now();
    try {
      const augConfig: OrchestratorConfig = {
        anthropicApiKey: config.anthropicApiKey,
        maxConcurrent: config.maxConcurrent ?? 5,
        costCapUsd: config.costCapUsd ?? 50,
      };

      const augResult = await runSeedAugmentation(supabase, pipelineResult.run_id, augConfig);
      pipelineResult.total_cost_usd += augResult.total_cost_usd;

      pipelineResult.phases.seed_augmentation = {
        status: augResult.errors.length > 0 ? 'completed' : 'completed',
        duration_ms: Date.now() - augStart,
        details: {
          research_completed: augResult.research_completed,
          network_mapped: augResult.network_mapped,
          errors: augResult.errors.length,
        },
      };
    } catch (err) {
      pipelineResult.phases.seed_augmentation = {
        status: 'failed',
        duration_ms: Date.now() - augStart,
        details: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // Phase 3: Entity staging review
  const stagingStart = Date.now();
  try {
    const stagingResult = await reviewStagedEntities(supabase, pipelineResult.run_id);

    pipelineResult.phases.entity_staging_review = {
      status: 'completed',
      duration_ms: Date.now() - stagingStart,
      details: stagingResult,
    };
  } catch (err) {
    pipelineResult.phases.entity_staging_review = {
      status: 'failed',
      duration_ms: Date.now() - stagingStart,
      details: {},
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Phase 4: Corpus cross-reference
  const crossrefStart = Date.now();
  try {
    const crossrefResult = await runCorpusCrossRef(supabase, pipelineResult.run_id);

    pipelineResult.phases.corpus_crossref = {
      status: 'completed',
      duration_ms: Date.now() - crossrefStart,
      details: crossrefResult,
    };
  } catch (err) {
    pipelineResult.phases.corpus_crossref = {
      status: 'failed',
      duration_ms: Date.now() - crossrefStart,
      details: {},
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Phase 5: Introduction scoring
  const scoringStart = Date.now();
  try {
    const scoringResult = await scoreIntroductionRoutes(supabase, pipelineResult.run_id);

    pipelineResult.phases.introduction_scoring = {
      status: 'completed',
      duration_ms: Date.now() - scoringStart,
      details: scoringResult,
    };
  } catch (err) {
    pipelineResult.phases.introduction_scoring = {
      status: 'failed',
      duration_ms: Date.now() - scoringStart,
      details: {},
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Finalize run
  const failedPhases = Object.values(pipelineResult.phases).filter(p => p.status === 'failed');
  const finalStatus = failedPhases.length > 0 ? 'completed_with_warnings' : 'completed';

  await supabase.from('runs').update({
    status: finalStatus,
    total_cost_usd: pipelineResult.total_cost_usd,
    completed_at: new Date().toISOString(),
  }).eq('run_id', pipelineResult.run_id);

  return pipelineResult;
}
