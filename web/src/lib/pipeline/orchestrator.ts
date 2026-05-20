import { createClient } from '@/lib/supabase/server';
import { PIPELINE_PHASES, nextPhase, type PipelinePhase } from './phases';
import { enqueuePhase, getPhaseStatus } from './queue';

export async function startPipeline(runId: string) {
  const supabase = await createClient();

  // Enqueue the first phase
  await enqueuePhase(runId, PIPELINE_PHASES[0]);

  // Set run to 'queued'
  const { error } = await supabase
    .from('runs')
    .update({ status: 'queued' })
    .eq('run_id', runId);

  if (error) throw error;
}

export async function advancePhase(
  runId: string,
  completedPhase: PipelinePhase,
) {
  const supabase = await createClient();

  // Check if completed phase is actually done
  const status = await getPhaseStatus(runId, completedPhase);
  const phaseJobs = status[completedPhase];
  if (!phaseJobs || !phaseJobs['completed']) {
    return { advanced: false, reason: 'phase_not_complete' };
  }

  const next = nextPhase(completedPhase);
  if (!next) {
    // All phases done -- mark run completed
    const { error } = await supabase
      .from('runs')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('run_id', runId);
    if (error) throw error;
    return { advanced: false, reason: 'pipeline_complete' };
  }

  await enqueuePhase(runId, next);
  return { advanced: true, nextPhase: next };
}

export async function getPipelineProgress(runId: string) {
  const status = await getPhaseStatus(runId);

  return PIPELINE_PHASES.map((phase) => ({
    phase,
    status: status[phase] ?? {},
  }));
}
