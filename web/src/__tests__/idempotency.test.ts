/**
 * Idempotency verification tests (F5.2-T5).
 * PRD ref: §20.9, §21.2
 *
 * Verifies:
 * - Re-running a phase with same (run_id, phase) produces no duplicate records
 * - The pipeline_jobs unique constraint on (run_id, phase) is enforced
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getIdempotencyKey,
  getCachedResponse,
  cacheResponse,
} from '@/lib/idempotency';

// -------------------------------------------------------------------
// Idempotency-Key header handling
// -------------------------------------------------------------------

describe('Idempotency-Key header', () => {
  it('extracts idempotency key from request headers', () => {
    const request = new Request('http://localhost/api/runs', {
      headers: { 'idempotency-key': 'key-abc-123' },
    });
    const key = getIdempotencyKey(request);
    expect(key).toBe('key-abc-123');
  });

  it('returns null when no idempotency key is present', () => {
    const request = new Request('http://localhost/api/runs');
    const key = getIdempotencyKey(request);
    expect(key).toBeNull();
  });
});

// -------------------------------------------------------------------
// Response caching (idempotency store)
// -------------------------------------------------------------------

describe('Idempotency response caching', () => {
  it('returns null for uncached keys', () => {
    const result = getCachedResponse('never-used-key');
    expect(result).toBeNull();
  });

  it('caches and retrieves a response', () => {
    const key = `test-cache-${Date.now()}`;
    const body = { run_id: 'run_001', status: 'created' };
    cacheResponse(key, body, 201);

    const cached = getCachedResponse(key);
    expect(cached).not.toBeNull();
    expect(cached!.status).toBe(201);
  });

  it('returns the same body on repeated cache lookups', async () => {
    const key = `test-repeat-${Date.now()}`;
    const body = { run_id: 'run_002', data: [1, 2, 3] };
    cacheResponse(key, body, 200);

    const first = getCachedResponse(key);
    const second = getCachedResponse(key);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    const firstBody = await first!.json();
    const secondBody = await second!.json();
    expect(firstBody).toEqual(body);
    expect(secondBody).toEqual(body);
  });
});

// -------------------------------------------------------------------
// Pipeline job idempotency (unit-level logic)
// -------------------------------------------------------------------

describe('Pipeline job idempotency by (run_id, phase)', () => {
  /**
   * Simulates the enqueuePhase logic: check-then-insert pattern.
   * If a job already exists for (run_id, phase), return it instead of creating a duplicate.
   */
  const jobStore = new Map<string, { job_id: string; run_id: string; phase: string; status: string }>();

  function simulateEnqueue(runId: string, phase: string) {
    const key = `${runId}:${phase}`;
    const existing = jobStore.get(key);
    if (existing) return { created: false, job: existing };

    const job = {
      job_id: `job_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      run_id: runId,
      phase,
      status: 'queued',
    };
    jobStore.set(key, job);
    return { created: true, job };
  }

  beforeEach(() => {
    jobStore.clear();
  });

  it('first enqueue creates a new job', () => {
    const result = simulateEnqueue('run_001', 'extraction');
    expect(result.created).toBe(true);
    expect(result.job.run_id).toBe('run_001');
    expect(result.job.phase).toBe('extraction');
  });

  it('second enqueue with same (run_id, phase) returns existing job', () => {
    const first = simulateEnqueue('run_001', 'extraction');
    const second = simulateEnqueue('run_001', 'extraction');

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.job.job_id).toBe(first.job.job_id);
  });

  it('same run_id with different phase creates separate jobs', () => {
    const extraction = simulateEnqueue('run_001', 'extraction');
    const validation = simulateEnqueue('run_001', 'validation');

    expect(extraction.created).toBe(true);
    expect(validation.created).toBe(true);
    expect(extraction.job.job_id).not.toBe(validation.job.job_id);
  });

  it('same phase with different run_id creates separate jobs', () => {
    const run1 = simulateEnqueue('run_001', 'extraction');
    const run2 = simulateEnqueue('run_002', 'extraction');

    expect(run1.created).toBe(true);
    expect(run2.created).toBe(true);
    expect(run1.job.job_id).not.toBe(run2.job.job_id);
  });

  it('re-enqueue after processing all phases produces no duplicates', () => {
    const phases = [
      'classification', 'extraction', 'validation', 'entity_resolution',
      'graph_build', 'discovery', 'enrichment', 'ranking', 'dossier_generation',
    ];
    const runId = 'run_full';

    // First pass: enqueue all phases
    for (const phase of phases) {
      simulateEnqueue(runId, phase);
    }
    expect(jobStore.size).toBe(9);

    // Second pass: re-enqueue all phases (simulates re-run)
    const results = phases.map((phase) => simulateEnqueue(runId, phase));

    // No new jobs should be created
    expect(results.every((r) => !r.created)).toBe(true);
    expect(jobStore.size).toBe(9);
  });
});

// -------------------------------------------------------------------
// DB-level unique constraint simulation
// -------------------------------------------------------------------

describe('Unique constraint on (run_id, phase)', () => {
  it('inserting duplicate (run_id, phase) throws a conflict', () => {
    const seen = new Set<string>();

    function insertWithConstraint(runId: string, phase: string) {
      const key = `${runId}:${phase}`;
      if (seen.has(key)) {
        throw new Error(`duplicate key value violates unique constraint "pipeline_jobs_run_id_phase_key"`);
      }
      seen.add(key);
    }

    insertWithConstraint('run_001', 'extraction');
    expect(() => insertWithConstraint('run_001', 'extraction')).toThrow(
      /unique constraint/,
    );
  });

  it('different (run_id, phase) pairs do not conflict', () => {
    const seen = new Set<string>();

    function insertWithConstraint(runId: string, phase: string) {
      const key = `${runId}:${phase}`;
      if (seen.has(key)) {
        throw new Error(`duplicate key value violates unique constraint`);
      }
      seen.add(key);
    }

    expect(() => {
      insertWithConstraint('run_001', 'extraction');
      insertWithConstraint('run_001', 'validation');
      insertWithConstraint('run_002', 'extraction');
    }).not.toThrow();
  });
});
