/**
 * Enrichment framework tests (F8.1).
 * Covers: mod interface, lifecycle state transitions, cache TTL,
 * retry backoff, orchestrator flow.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  type EnrichmentModule,
  type EnrichmentSource,
  type EnrichmentSignalPayload,
  SOURCE_TIER,
} from '@/lib/enrichment/types';
import {
  type EnrichmentLifecycleState,
  isValidTransition,
  getValidNextStates,
  transition,
  isAcceptedForScoring,
  isTerminalFailure,
  isRetryable,
} from '@/lib/enrichment/lifecycle';
import {
  EnrichmentCache,
  cacheKey,
  getTtlMs,
  computeExpiresAt,
  isStale,
  SOURCE_TTL_DAYS,
  type CacheEntry,
} from '@/lib/enrichment/cache';
import {
  withRetry,
  getBackoffDelay,
  isRateLimitError,
  extractRetryAfterMs,
  BACKOFF_DELAYS_MS,
  MAX_RETRIES,
  type RetryResult,
} from '@/lib/enrichment/retry';
import {
  enrichCandidate,
  EnrichmentRegistry,
  filterSourcesByPriority,
} from '@/lib/enrichment/index';
import type { CanonicalEntity, EnrichmentSignal } from '@/types/database';

// ===================================================================
// Helpers
// ===================================================================

function makeEntity(id = 'ent_001'): CanonicalEntity {
  return {
    canonical_entity_id: id,
    entity_type: 'person',
    display_name: 'Test Person',
    first_seen_run_id: 'run_001',
    last_seen_run_id: 'run_001',
    attributes: {},
    source: 'corpus',
  };
}

function makeSignalPayload(
  overrides: Partial<EnrichmentSignalPayload> = {},
): EnrichmentSignalPayload {
  return {
    source: 'companies_house',
    signal_type: 'company_officer',
    external_record_id: 'ext_001',
    signal_payload: { officer_name: 'Test' },
    match_confidence: 0.85,
    match_features: [{ feature: 'name', weight: 0.5, score: 0.9 }],
    ...overrides,
  };
}

function makeCachedSignal(
  overrides: Partial<EnrichmentSignal> = {},
): EnrichmentSignal {
  return {
    enrichment_signal_id: 'sig_001',
    candidate_entity_id: 'ent_001',
    source: 'companies_house',
    external_record_id: 'ext_001',
    signal_type: 'company_officer',
    signal_payload: { officer_name: 'Test' },
    match_confidence: 0.85,
    retrieved_at: new Date().toISOString(),
    cache_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    accepted_for_scoring: true,
    status: 'matched',
    ...overrides,
  };
}

function makeModule(
  source: EnrichmentSource,
  results: EnrichmentSignalPayload[] = [makeSignalPayload({ source })],
  shouldFail = false,
): EnrichmentModule {
  return {
    source,
    tier: SOURCE_TIER[source],
    enrich: shouldFail
      ? vi.fn().mockRejectedValue(new Error(`${source} API error`))
      : vi.fn().mockResolvedValue(results),
  };
}

// ===================================================================
// Module Interface (F8.1-T1)
// ===================================================================

describe('EnrichmentModule interface', () => {
  it('has required source property', () => {
    const mod = makeModule('companies_house');
    expect(mod.source).toBe('companies_house');
  });

  it('has required tier property', () => {
    const mod = makeModule('companies_house');
    expect(mod.tier).toBe(1);
  });

  it('enrich returns structured signal payloads', async () => {
    const mod = makeModule('companies_house');
    const signals = await mod.enrich(makeEntity());

    expect(signals).toHaveLength(1);
    expect(signals[0]).toHaveProperty('source', 'companies_house');
    expect(signals[0]).toHaveProperty('signal_type');
    expect(signals[0]).toHaveProperty('external_record_id');
    expect(signals[0]).toHaveProperty('signal_payload');
    expect(signals[0]).toHaveProperty('match_confidence');
    expect(signals[0]).toHaveProperty('match_features');
  });

  it('maps sources to correct tiers', () => {
    expect(SOURCE_TIER.companies_house).toBe(1);
    expect(SOURCE_TIER.charity_commission).toBe(1);
    expect(SOURCE_TIER.wikidata).toBe(2);
    expect(SOURCE_TIER.news).toBe(2);
  });
});

// ===================================================================
// Lifecycle State Machine (F8.1-T2, §17.2)
// ===================================================================

describe('Lifecycle state transitions', () => {
  it('allows not_started -> queued', () => {
    expect(isValidTransition('not_started', 'queued')).toBe(true);
    expect(transition('not_started', 'queued')).toBe('queued');
  });

  it('allows queued -> in_progress', () => {
    expect(isValidTransition('queued', 'in_progress')).toBe(true);
  });

  it('allows in_progress -> matched', () => {
    expect(isValidTransition('in_progress', 'matched')).toBe(true);
  });

  it('allows in_progress -> ambiguous_match', () => {
    expect(isValidTransition('in_progress', 'ambiguous_match')).toBe(true);
  });

  it('allows in_progress -> no_result', () => {
    expect(isValidTransition('in_progress', 'no_result')).toBe(true);
  });

  it('allows in_progress -> failed_retryable', () => {
    expect(isValidTransition('in_progress', 'failed_retryable')).toBe(true);
  });

  it('allows in_progress -> failed_final', () => {
    expect(isValidTransition('in_progress', 'failed_final')).toBe(true);
  });

  it('allows matched -> stale', () => {
    expect(isValidTransition('matched', 'stale')).toBe(true);
  });

  it('allows stale -> queued (refresh)', () => {
    expect(isValidTransition('stale', 'queued')).toBe(true);
  });

  it('allows failed_retryable -> queued', () => {
    expect(isValidTransition('failed_retryable', 'queued')).toBe(true);
  });

  it('allows failed_retryable -> failed_final', () => {
    expect(isValidTransition('failed_retryable', 'failed_final')).toBe(true);
  });

  it('allows failed_final -> queued (manual re-queue)', () => {
    expect(isValidTransition('failed_final', 'queued')).toBe(true);
  });

  it('rejects not_started -> matched (must go through queued/in_progress)', () => {
    expect(isValidTransition('not_started', 'matched')).toBe(false);
  });

  it('rejects matched -> in_progress', () => {
    expect(isValidTransition('matched', 'in_progress')).toBe(false);
  });

  it('throws on invalid transition', () => {
    expect(() => transition('not_started', 'matched')).toThrow(
      'Invalid enrichment state transition',
    );
  });

  it('getValidNextStates returns correct states for in_progress', () => {
    const next = getValidNextStates('in_progress');
    expect(next).toContain('matched');
    expect(next).toContain('ambiguous_match');
    expect(next).toContain('no_result');
    expect(next).toContain('failed_retryable');
    expect(next).toContain('failed_final');
    expect(next).toContain('manual_required');
    expect(next).not.toContain('queued');
  });
});

describe('Lifecycle state classification', () => {
  it('matched is accepted for scoring', () => {
    expect(isAcceptedForScoring('matched')).toBe(true);
  });

  it('ambiguous_match is NOT accepted for scoring (R4.6)', () => {
    expect(isAcceptedForScoring('ambiguous_match')).toBe(false);
  });

  it('no_result is NOT accepted for scoring', () => {
    expect(isAcceptedForScoring('no_result')).toBe(false);
  });

  it('failed_final is terminal failure', () => {
    expect(isTerminalFailure('failed_final')).toBe(true);
  });

  it('failed_retryable is not terminal', () => {
    expect(isTerminalFailure('failed_retryable')).toBe(false);
  });

  it('failed_retryable is retryable', () => {
    expect(isRetryable('failed_retryable')).toBe(true);
  });

  it('matched is not retryable', () => {
    expect(isRetryable('matched')).toBe(false);
  });
});

// ===================================================================
// Cache TTL (F8.1-T3, R4.8)
// ===================================================================

describe('Cache', () => {
  describe('TTL values', () => {
    it('Companies House TTL is 30 days', () => {
      expect(SOURCE_TTL_DAYS.companies_house).toBe(30);
      expect(getTtlMs('companies_house')).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it('Charity Commission TTL is 30 days', () => {
      expect(SOURCE_TTL_DAYS.charity_commission).toBe(30);
    });

    it('Wikidata TTL is 90 days', () => {
      expect(SOURCE_TTL_DAYS.wikidata).toBe(90);
      expect(getTtlMs('wikidata')).toBe(90 * 24 * 60 * 60 * 1000);
    });

    it('News TTL is 7 days', () => {
      expect(SOURCE_TTL_DAYS.news).toBe(7);
      expect(getTtlMs('news')).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });

  describe('cacheKey', () => {
    it('builds key from entity_id and source', () => {
      expect(cacheKey('ent_001', 'companies_house')).toBe('ent_001:companies_house');
    });
  });

  describe('computeExpiresAt', () => {
    it('adds correct TTL for companies_house', () => {
      const now = new Date('2026-01-01T00:00:00Z');
      const expires = computeExpiresAt(now, 'companies_house');
      expect(expires.getTime()).toBe(now.getTime() + 30 * 86400000);
    });

    it('adds correct TTL for news', () => {
      const now = new Date('2026-01-01T00:00:00Z');
      const expires = computeExpiresAt(now, 'news');
      expect(expires.getTime()).toBe(now.getTime() + 7 * 86400000);
    });
  });

  describe('isStale', () => {
    it('returns false when within TTL', () => {
      const entry: CacheEntry = {
        signals: [],
        retrievedAt: new Date('2026-01-01'),
        expiresAt: new Date('2026-01-31'),
        source: 'companies_house',
      };
      expect(isStale(entry, new Date('2026-01-15'))).toBe(false);
    });

    it('returns true when past TTL', () => {
      const entry: CacheEntry = {
        signals: [],
        retrievedAt: new Date('2026-01-01'),
        expiresAt: new Date('2026-01-31'),
        source: 'companies_house',
      };
      expect(isStale(entry, new Date('2026-02-01'))).toBe(true);
    });

    it('returns true at exact expiry time', () => {
      const expiresAt = new Date('2026-01-31T00:00:00Z');
      const entry: CacheEntry = {
        signals: [],
        retrievedAt: new Date('2026-01-01'),
        expiresAt,
        source: 'companies_house',
      };
      expect(isStale(entry, expiresAt)).toBe(true);
    });
  });

  describe('EnrichmentCache', () => {
    let cache: EnrichmentCache;

    beforeEach(() => {
      cache = new EnrichmentCache();
    });

    it('returns miss for uncached entity', () => {
      const result = cache.lookup('ent_001', 'companies_house');
      expect(result.status).toBe('miss');
      expect(result.signals).toEqual([]);
    });

    it('returns hit for cached and fresh entity', () => {
      const signal = makeCachedSignal();
      const now = new Date('2026-01-15');
      cache.put('ent_001', 'companies_house', [signal], new Date('2026-01-01'));

      const result = cache.lookup('ent_001', 'companies_house', now);
      expect(result.status).toBe('hit');
      expect(result.signals).toHaveLength(1);
    });

    it('returns stale for expired cache entry', () => {
      const signal = makeCachedSignal();
      cache.put('ent_001', 'companies_house', [signal], new Date('2025-12-01'));

      const result = cache.lookup(
        'ent_001',
        'companies_house',
        new Date('2026-02-01'), // 62 days later, past 30-day TTL
      );
      expect(result.status).toBe('stale');
      expect(result.signals).toHaveLength(1); // still returns stale data
    });

    it('news cache expires after 7 days', () => {
      const signal = makeCachedSignal({ source: 'news' });
      cache.put('ent_001', 'news', [signal], new Date('2026-01-01'));

      // 6 days later: still fresh
      expect(
        cache.lookup('ent_001', 'news', new Date('2026-01-07')).status,
      ).toBe('hit');

      // 8 days later: stale
      expect(
        cache.lookup('ent_001', 'news', new Date('2026-01-09')).status,
      ).toBe('stale');
    });

    it('wikidata cache expires after 90 days', () => {
      const signal = makeCachedSignal({ source: 'wikidata' });
      cache.put('ent_001', 'wikidata', [signal], new Date('2026-01-01'));

      // 89 days later: still fresh
      expect(
        cache.lookup('ent_001', 'wikidata', new Date('2026-03-31')).status,
      ).toBe('hit');

      // 91 days later: stale
      expect(
        cache.lookup('ent_001', 'wikidata', new Date('2026-04-02')).status,
      ).toBe('stale');
    });

    it('invalidate removes cache entry', () => {
      cache.put('ent_001', 'companies_house', [makeCachedSignal()]);
      expect(cache.size).toBe(1);

      const removed = cache.invalidate('ent_001', 'companies_house');
      expect(removed).toBe(true);
      expect(cache.size).toBe(0);
      expect(cache.lookup('ent_001', 'companies_house').status).toBe('miss');
    });

    it('invalidate returns false for non-existent key', () => {
      expect(cache.invalidate('ent_999', 'news')).toBe(false);
    });

    it('keeps entries separate per source', () => {
      cache.put('ent_001', 'companies_house', [makeCachedSignal({ source: 'companies_house' })]);
      cache.put('ent_001', 'news', [makeCachedSignal({ source: 'news' })]);

      expect(cache.size).toBe(2);
      expect(cache.lookup('ent_001', 'companies_house').status).toBe('hit');
      expect(cache.lookup('ent_001', 'news').status).toBe('hit');
      expect(cache.lookup('ent_001', 'wikidata').status).toBe('miss');
    });
  });
});

// ===================================================================
// Retry Backoff (F8.1-T4, R4.9)
// ===================================================================

describe('Retry', () => {
  describe('backoff delays', () => {
    it('follows R4.9 schedule: 1s, 4s, 16s', () => {
      expect(BACKOFF_DELAYS_MS).toEqual([1000, 4000, 16000]);
    });

    it('getBackoffDelay returns correct delay per attempt', () => {
      expect(getBackoffDelay(0)).toBe(1000);
      expect(getBackoffDelay(1)).toBe(4000);
      expect(getBackoffDelay(2)).toBe(16000);
    });

    it('getBackoffDelay clamps to last delay for out-of-range attempt', () => {
      expect(getBackoffDelay(5)).toBe(16000);
    });

    it('getBackoffDelay handles negative attempt', () => {
      expect(getBackoffDelay(-1)).toBe(1000);
    });

    it('MAX_RETRIES matches backoff schedule length', () => {
      expect(MAX_RETRIES).toBe(3);
    });
  });

  describe('rate limit detection', () => {
    it('detects HTTP 429 as rate limit', () => {
      expect(isRateLimitError({ status: 429 })).toBe(true);
    });

    it('does not flag non-429 as rate limit', () => {
      expect(isRateLimitError({ status: 500 })).toBe(false);
      expect(isRateLimitError({ status: 200 })).toBe(false);
    });

    it('handles non-object errors', () => {
      expect(isRateLimitError('error')).toBe(false);
      expect(isRateLimitError(null)).toBe(false);
    });
  });

  describe('extractRetryAfterMs', () => {
    it('extracts Retry-After header in seconds', () => {
      const error = { headers: { 'retry-after': '30' } };
      expect(extractRetryAfterMs(error)).toBe(30000);
    });

    it('returns null when no Retry-After header', () => {
      expect(extractRetryAfterMs({ headers: {} })).toBeNull();
      expect(extractRetryAfterMs({})).toBeNull();
    });
  });

  describe('withRetry', () => {
    it('returns success on first try', async () => {
      const fn = vi.fn().mockResolvedValue('ok');
      const result = await withRetry(fn, {
        backoffDelays: [0, 0, 0], // no actual delay in tests
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('ok');
        expect(result.attempts).toBe(1);
      }
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on failure and succeeds on second attempt', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('ok');

      const result = await withRetry(fn, {
        backoffDelays: [0, 0, 0],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('ok');
        expect(result.attempts).toBe(2);
      }
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('exhausts retries and returns failed_retryable', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fail'));
      const onExhausted = vi.fn();

      const result = await withRetry(fn, {
        backoffDelays: [0, 0, 0],
        onExhausted,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.retryable).toBe(true);
        expect(result.attempts).toBe(4); // 1 initial + 3 retries
      }
      expect(onExhausted).toHaveBeenCalledTimes(1);
    });

    it('calls onRetry for each retry attempt', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('ok');

      const onRetry = vi.fn();

      await withRetry(fn, {
        backoffDelays: [0, 0, 0],
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), 0);
      expect(onRetry).toHaveBeenCalledWith(2, expect.any(Error), 0);
    });
  });
});

// ===================================================================
// Orchestrator Flow (F8.1-T5)
// ===================================================================

describe('Enrichment orchestrator', () => {
  let registry: EnrichmentRegistry;
  let cache: EnrichmentCache;

  beforeEach(() => {
    registry = new EnrichmentRegistry();
    cache = new EnrichmentCache();
  });

  it('runs enrichment module and returns signals', async () => {
    const mod = makeModule('companies_house');
    registry.register(mod);

    const result = await enrichCandidate(
      makeEntity(),
      ['companies_house'],
      registry,
      cache,
      { backoffDelays: [0, 0, 0] },
    );

    expect(result.entityId).toBe('ent_001');
    expect(result.results).toHaveLength(1);
    expect(result.results[0].source).toBe('companies_house');
    expect(result.results[0].state).toBe('matched');
    expect(result.results[0].fromCache).toBe(false);
    expect(result.acceptedSignals).toHaveLength(1);
  });

  it('returns cached signals on cache hit', async () => {
    const mod = makeModule('companies_house');
    registry.register(mod);

    // Pre-populate cache
    cache.put('ent_001', 'companies_house', [makeCachedSignal()]);

    const result = await enrichCandidate(
      makeEntity(),
      ['companies_house'],
      registry,
      cache,
      { backoffDelays: [0, 0, 0] },
    );

    expect(result.results[0].fromCache).toBe(true);
    expect(result.results[0].state).toBe('matched');
    // Module should NOT have been called
    expect(mod.enrich).not.toHaveBeenCalled();
  });

  it('calls module when cache is stale', async () => {
    const mod = makeModule('companies_house');
    registry.register(mod);

    // Pre-populate with expired cache
    cache.put('ent_001', 'companies_house', [makeCachedSignal()], new Date('2025-01-01'));

    const result = await enrichCandidate(
      makeEntity(),
      ['companies_house'],
      registry,
      cache,
      { backoffDelays: [0, 0, 0] },
    );

    expect(result.results[0].fromCache).toBe(false);
    expect(mod.enrich).toHaveBeenCalledTimes(1);
  });

  it('handles missing module gracefully', async () => {
    // No module registered for 'wikidata'
    const result = await enrichCandidate(
      makeEntity(),
      ['wikidata'],
      registry,
      cache,
      { backoffDelays: [0, 0, 0] },
    );

    expect(result.results).toHaveLength(1);
    expect(result.results[0].state).toBe('failed_final');
    expect(result.results[0].error).toContain('No module registered');
  });

  it('handles module failure with failed_retryable state', async () => {
    const mod = makeModule('companies_house', [], true);
    registry.register(mod);

    const result = await enrichCandidate(
      makeEntity(),
      ['companies_house'],
      registry,
      cache,
      { backoffDelays: [0, 0, 0] },
    );

    expect(result.results[0].state).toBe('failed_retryable');
    expect(result.results[0].signals).toEqual([]);
    expect(result.acceptedSignals).toEqual([]);
  });

  it('marks ambiguous matches as ambiguous_match (R4.6)', async () => {
    const ambiguousSignal = makeSignalPayload({ match_confidence: 0.65 });
    const mod = makeModule('companies_house', [ambiguousSignal]);
    registry.register(mod);

    const result = await enrichCandidate(
      makeEntity(),
      ['companies_house'],
      registry,
      cache,
      { backoffDelays: [0, 0, 0] },
    );

    expect(result.results[0].state).toBe('ambiguous_match');
    // Ambiguous signals should NOT be accepted for scoring
    expect(result.acceptedSignals).toHaveLength(0);
  });

  it('marks no_result when module returns empty array', async () => {
    const mod = makeModule('companies_house', []);
    registry.register(mod);

    const result = await enrichCandidate(
      makeEntity(),
      ['companies_house'],
      registry,
      cache,
      { backoffDelays: [0, 0, 0] },
    );

    expect(result.results[0].state).toBe('no_result');
  });

  it('runs multiple sources in sequence', async () => {
    const chModule = makeModule('companies_house', [
      makeSignalPayload({ source: 'companies_house' }),
    ]);
    const ccModule = makeModule('charity_commission', [
      makeSignalPayload({ source: 'charity_commission', signal_type: 'charity_trustee' }),
    ]);
    registry.register(chModule);
    registry.register(ccModule);

    const result = await enrichCandidate(
      makeEntity(),
      ['companies_house', 'charity_commission'],
      registry,
      cache,
      { backoffDelays: [0, 0, 0] },
    );

    expect(result.results).toHaveLength(2);
    expect(result.acceptedSignals).toHaveLength(2);
  });
});

// ===================================================================
// Source Filtering by Priority (§17.1)
// ===================================================================

describe('filterSourcesByPriority', () => {
  const allSources: EnrichmentSource[] = [
    'companies_house',
    'charity_commission',
    'wikidata',
    'news',
  ];

  it('includes all Tier 1 sources regardless of priority', () => {
    const result = filterSourcesByPriority(allSources, 0.30);
    expect(result).toContain('companies_house');
    expect(result).toContain('charity_commission');
  });

  it('excludes Tier 2 sources when priority <= 0.50', () => {
    const result = filterSourcesByPriority(allSources, 0.50);
    expect(result).not.toContain('wikidata');
    expect(result).not.toContain('news');
  });

  it('includes Tier 2 sources when priority > 0.50', () => {
    const result = filterSourcesByPriority(allSources, 0.51);
    expect(result).toContain('wikidata');
    expect(result).toContain('news');
  });

  it('returns only Tier 1 for low priority', () => {
    const result = filterSourcesByPriority(allSources, 0.10);
    expect(result).toHaveLength(2);
    expect(result).toContain('companies_house');
    expect(result).toContain('charity_commission');
  });
});

// ===================================================================
// EnrichmentRegistry
// ===================================================================

describe('EnrichmentRegistry', () => {
  it('registers and retrieves modules', () => {
    const registry = new EnrichmentRegistry();
    const mod = makeModule('companies_house');
    registry.register(mod);

    expect(registry.has('companies_house')).toBe(true);
    expect(registry.get('companies_house')).toBe(mod);
  });

  it('returns undefined for unregistered source', () => {
    const registry = new EnrichmentRegistry();
    expect(registry.get('wikidata')).toBeUndefined();
    expect(registry.has('wikidata')).toBe(false);
  });

  it('lists all registered modules', () => {
    const registry = new EnrichmentRegistry();
    registry.register(makeModule('companies_house'));
    registry.register(makeModule('news'));

    expect(registry.all()).toHaveLength(2);
  });
});
