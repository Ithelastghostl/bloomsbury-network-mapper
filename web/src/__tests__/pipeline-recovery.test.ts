/**
 * Pipeline recovery tests (F5.5-T5).
 * PRD ref: §21.1 (phase failure behaviour), §21.2 (idempotency)
 *
 * Tests:
 * - Each phase failure → retry/rollback behaviour
 * - Failed phases record proper error details
 * - Retry increments attempts and respects max_attempts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { type PipelinePhase } from '@/lib/pipeline/phases';

// -------------------------------------------------------------------
// In-memory pipeline job simulator for unit testing
// -------------------------------------------------------------------

interface SimJob {
  job_id: string;
  run_id: string;
  phase: PipelinePhase;
  status: string;
  attempts: number;
  max_attempts: number;
  error: { type: string; message: string; affected_records: number } | null;
  started_at: string | null;
  finished_at: string | null;
}

let jobCounter = 0;
let jobs: Map<string, SimJob>;

function createJob(runId: string, phase: PipelinePhase, maxAttempts = 3): SimJob {
  jobCounter++;
  const job: SimJob = {
    job_id: `job_${jobCounter}`,
    run_id: runId,
    phase,
    status: 'queued',
    attempts: 0,
    max_attempts: maxAttempts,
    error: null,
    started_at: null,
    finished_at: null,
  };
  jobs.set(job.job_id, job);
  return job;
}

function startJob(jobId: string): SimJob {
  const job = jobs.get(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  if (job.status !== 'queued') throw new Error(`Job ${jobId} is not queued`);
  job.status = 'running';
  job.started_at = new Date().toISOString();
  job.attempts += 1;
  return job;
}

function completeJob(jobId: string): SimJob {
  const job = jobs.get(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  job.status = 'completed';
  job.finished_at = new Date().toISOString();
  return job;
}

function failJob(
  jobId: string,
  errorDetail: { type: string; message: string; affected_records: number },
  retryable = true,
): SimJob {
  const job = jobs.get(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  job.error = errorDetail;
  job.finished_at = new Date().toISOString();

  const exhausted = job.attempts >= job.max_attempts;
  job.status = !retryable || exhausted ? 'failed_final' : 'failed_retryable';

  return job;
}

function retryJob(jobId: string): SimJob {
  const job = jobs.get(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  if (job.status !== 'failed_retryable') {
    throw new Error(`Job ${jobId} is not retryable (status: ${job.status})`);
  }
  if (job.attempts >= job.max_attempts) {
    throw new Error(`Job ${jobId} has exhausted max_attempts`);
  }

  job.status = 'queued';
  job.error = null;
  job.started_at = null;
  job.finished_at = null;
  return job;
}

beforeEach(() => {
  jobCounter = 0;
  jobs = new Map();
});

// -------------------------------------------------------------------
// Phase failure → retry behaviour (§21.1)
// -------------------------------------------------------------------

describe('Phase failure and retry', () => {
  it('failed retryable phase can be retried', () => {
    const job = createJob('run_001', 'extraction');
    startJob(job.job_id);
    failJob(job.job_id, {
      type: 'invalid_llm_output',
      message: 'LLM returned invalid JSON',
      affected_records: 5,
    });

    expect(job.status).toBe('failed_retryable');
    expect(job.attempts).toBe(1);

    // Retry
    retryJob(job.job_id);
    expect(job.status).toBe('queued');
    expect(job.error).toBeNull();
  });

  it('non-retryable failure goes directly to failed_final', () => {
    const job = createJob('run_001', 'graph_build');
    startJob(job.job_id);
    failJob(
      job.job_id,
      {
        type: 'graph_build_failure',
        message: 'Cannot build graph: no entities found',
        affected_records: 0,
      },
      false, // not retryable
    );

    expect(job.status).toBe('failed_final');
  });

  it('retry increments attempts count', () => {
    const job = createJob('run_001', 'extraction');

    // Attempt 1
    startJob(job.job_id);
    expect(job.attempts).toBe(1);
    failJob(job.job_id, { type: 'timeout', message: 'API timeout', affected_records: 10 });

    // Retry → Attempt 2
    retryJob(job.job_id);
    startJob(job.job_id);
    expect(job.attempts).toBe(2);
    failJob(job.job_id, { type: 'timeout', message: 'API timeout again', affected_records: 10 });

    // Retry → Attempt 3
    retryJob(job.job_id);
    startJob(job.job_id);
    expect(job.attempts).toBe(3);
  });

  it('respects max_attempts — marks failed_final when exhausted', () => {
    const job = createJob('run_001', 'extraction', 3);

    // Attempt 1
    startJob(job.job_id);
    failJob(job.job_id, { type: 'error', message: 'fail 1', affected_records: 1 });
    expect(job.status).toBe('failed_retryable');

    // Attempt 2
    retryJob(job.job_id);
    startJob(job.job_id);
    failJob(job.job_id, { type: 'error', message: 'fail 2', affected_records: 1 });
    expect(job.status).toBe('failed_retryable');

    // Attempt 3 — exhausts max_attempts
    retryJob(job.job_id);
    startJob(job.job_id);
    failJob(job.job_id, { type: 'error', message: 'fail 3', affected_records: 1 });
    expect(job.status).toBe('failed_final');
  });

  it('cannot retry a failed_final job', () => {
    const job = createJob('run_001', 'extraction', 1);
    startJob(job.job_id);
    failJob(job.job_id, { type: 'error', message: 'fail', affected_records: 0 });

    expect(job.status).toBe('failed_final');
    expect(() => retryJob(job.job_id)).toThrow(/not retryable/);
  });

  it('cannot retry a job that has exhausted max_attempts even if status would be retryable', () => {
    const job = createJob('run_001', 'validation', 2);

    // Attempt 1
    startJob(job.job_id);
    failJob(job.job_id, { type: 'error', message: 'fail 1', affected_records: 0 });

    // Attempt 2
    retryJob(job.job_id);
    startJob(job.job_id);
    failJob(job.job_id, { type: 'error', message: 'fail 2', affected_records: 0 });

    // Now at max_attempts
    expect(job.status).toBe('failed_final');
    expect(() => retryJob(job.job_id)).toThrow(/not retryable/);
  });
});

// -------------------------------------------------------------------
// Error detail recording (§21.1)
// -------------------------------------------------------------------

describe('Failed phase error recording', () => {
  it('records error type, message, and affected_records', () => {
    const job = createJob('run_001', 'extraction');
    startJob(job.job_id);
    failJob(job.job_id, {
      type: 'invalid_llm_output',
      message: 'Model returned malformed JSON after 3 retries',
      affected_records: 42,
    });

    expect(job.error).not.toBeNull();
    expect(job.error!.type).toBe('invalid_llm_output');
    expect(job.error!.message).toBe('Model returned malformed JSON after 3 retries');
    expect(job.error!.affected_records).toBe(42);
  });

  it('records errors for each phase type per §21.1', () => {
    const phaseErrors: Record<string, { type: string; message: string; affected_records: number }> = {
      classification: { type: 'classification_failure', message: 'Unknown document type', affected_records: 3 },
      extraction: { type: 'invalid_llm_output', message: 'Invalid JSON', affected_records: 5 },
      validation: { type: 'schema_invalid', message: 'Schema validation failed', affected_records: 12 },
      entity_resolution: { type: 'resolution_conflict', message: 'Conflicting identity signals', affected_records: 2 },
      graph_build: { type: 'graph_build_failure', message: 'Snapshot not published', affected_records: 0 },
      discovery: { type: 'seed_not_found', message: 'Seed entity missing', affected_records: 1 },
      enrichment: { type: 'api_rate_limit', message: 'Companies House rate limited', affected_records: 8 },
      ranking: { type: 'scoring_failure', message: 'Missing scoring config', affected_records: 0 },
      dossier_generation: { type: 'export_failure', message: 'Template rendering failed', affected_records: 4 },
    };

    for (const [phase, errorDetail] of Object.entries(phaseErrors)) {
      const job = createJob('run_errors', phase as PipelinePhase);
      startJob(job.job_id);
      failJob(job.job_id, errorDetail);

      expect(job.error).not.toBeNull();
      expect(job.error!.type).toBe(errorDetail.type);
      expect(job.error!.message).toBe(errorDetail.message);
      expect(job.error!.affected_records).toBe(errorDetail.affected_records);
    }
  });

  it('clears error on retry', () => {
    const job = createJob('run_001', 'extraction');
    startJob(job.job_id);
    failJob(job.job_id, { type: 'timeout', message: 'Timed out', affected_records: 1 });

    expect(job.error).not.toBeNull();

    retryJob(job.job_id);
    expect(job.error).toBeNull();
    expect(job.finished_at).toBeNull();
    expect(job.started_at).toBeNull();
  });

  it('preserves timestamps on failure', () => {
    const job = createJob('run_001', 'extraction');
    startJob(job.job_id);

    expect(job.started_at).not.toBeNull();

    failJob(job.job_id, { type: 'error', message: 'fail', affected_records: 0 });
    expect(job.finished_at).not.toBeNull();
  });
});

// -------------------------------------------------------------------
// Rollback behaviour
// -------------------------------------------------------------------

describe('Pipeline rollback', () => {
  it('cancels all queued/running jobs on rollback', () => {
    const phases: PipelinePhase[] = ['classification', 'extraction', 'validation'];
    const runJobs = phases.map((phase) => createJob('run_rollback', phase));

    // Start first two, leave third queued
    startJob(runJobs[0].job_id);
    completeJob(runJobs[0].job_id);
    startJob(runJobs[1].job_id);
    // runJobs[2] stays queued

    // Simulate rollback: cancel queued/running jobs
    for (const job of runJobs) {
      if (job.status === 'queued' || job.status === 'running') {
        job.status = 'cancelled';
        job.finished_at = new Date().toISOString();
      }
    }

    expect(runJobs[0].status).toBe('completed'); // already done, not touched
    expect(runJobs[1].status).toBe('cancelled');  // was running
    expect(runJobs[2].status).toBe('cancelled');  // was queued
  });

  it('completed phases are not affected by rollback', () => {
    const job = createJob('run_rollback', 'classification');
    startJob(job.job_id);
    completeJob(job.job_id);

    // Rollback should not change completed status
    // (only queued/running are cancelled)
    if (job.status === 'queued' || job.status === 'running') {
      job.status = 'cancelled';
    }

    expect(job.status).toBe('completed');
  });
});

// -------------------------------------------------------------------
// Full pipeline recovery scenario
// -------------------------------------------------------------------

describe('Full pipeline recovery scenario', () => {
  it('runs pipeline, fails at extraction, retries, succeeds', () => {
    const runId = 'run_recovery';

    // Phase 1: classification — succeeds
    const classifyJob = createJob(runId, 'classification');
    startJob(classifyJob.job_id);
    completeJob(classifyJob.job_id);
    expect(classifyJob.status).toBe('completed');

    // Phase 2: extraction — fails on first attempt
    const extractJob = createJob(runId, 'extraction');
    startJob(extractJob.job_id);
    failJob(extractJob.job_id, {
      type: 'invalid_llm_output',
      message: 'Invalid JSON from LLM',
      affected_records: 10,
    });
    expect(extractJob.status).toBe('failed_retryable');
    expect(extractJob.attempts).toBe(1);

    // Retry extraction — succeeds
    retryJob(extractJob.job_id);
    startJob(extractJob.job_id);
    completeJob(extractJob.job_id);
    expect(extractJob.status).toBe('completed');
    expect(extractJob.attempts).toBe(2);

    // Remaining phases succeed
    const remainingPhases: PipelinePhase[] = [
      'validation', 'entity_resolution', 'graph_build',
      'discovery', 'enrichment', 'ranking', 'dossier_generation',
    ];

    for (const phase of remainingPhases) {
      const job = createJob(runId, phase);
      startJob(job.job_id);
      completeJob(job.job_id);
      expect(job.status).toBe('completed');
    }

    // Verify all 9 phases completed
    const allJobs = Array.from(jobs.values()).filter((j) => j.run_id === runId);
    expect(allJobs).toHaveLength(9);
    expect(allJobs.every((j) => j.status === 'completed')).toBe(true);
  });

  it('runs pipeline, fails permanently at graph_build, remaining phases not started', () => {
    const runId = 'run_permanent_fail';

    // Succeed through first 4 phases
    const earlyPhases: PipelinePhase[] = [
      'classification', 'extraction', 'validation', 'entity_resolution',
    ];

    for (const phase of earlyPhases) {
      const job = createJob(runId, phase);
      startJob(job.job_id);
      completeJob(job.job_id);
    }

    // graph_build fails permanently (not retryable per §21.1)
    const graphJob = createJob(runId, 'graph_build');
    startJob(graphJob.job_id);
    failJob(
      graphJob.job_id,
      {
        type: 'graph_build_failure',
        message: 'Do not publish snapshot',
        affected_records: 0,
      },
      false,
    );

    expect(graphJob.status).toBe('failed_final');

    // Later phases should NOT have been created
    const laterPhases = ['discovery', 'enrichment', 'ranking', 'dossier_generation'];
    for (const phase of laterPhases) {
      const phaseJobs = Array.from(jobs.values()).filter(
        (j) => j.run_id === runId && j.phase === phase,
      );
      expect(phaseJobs).toHaveLength(0);
    }
  });
});
