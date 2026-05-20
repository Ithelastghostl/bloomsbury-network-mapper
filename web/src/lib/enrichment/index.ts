/**
 * Enrichment orchestrator and barrel export (F8.1-T5).
 *
 * enrichCandidate(entity, sources[]) — runs all requested enrichment modules.
 * Respects cache, retry, lifecycle states.
 */

export { type EnrichmentModule, type EnrichmentSource, type EnrichmentSignalPayload, type MatchFeature, type SignalType, type EnrichmentTier, SOURCE_TIER } from './types';
export { type EnrichmentLifecycleState, isValidTransition, getValidNextStates, transition, isAcceptedForScoring, isTerminalFailure, isRetryable } from './lifecycle';
export { EnrichmentCache, type CacheStatus, type CacheLookupResult, type CacheEntry, cacheKey, getTtlMs, computeExpiresAt, isStale, SOURCE_TTL_DAYS } from './cache';
export { withRetry, type RetryResult, type RetryOptions, BACKOFF_DELAYS_MS, MAX_RETRIES, getBackoffDelay, isRateLimitError, extractRetryAfterMs } from './retry';
export { detectConflicts, type SignalConflict, type ConflictType } from './conflicts';

import type { CanonicalEntity } from '@/types/database';
import type { EnrichmentModule, EnrichmentSource, EnrichmentSignalPayload } from './types';
import { SOURCE_TIER } from './types';
import { EnrichmentCache } from './cache';
import { withRetry, type RetryOptions } from './retry';
import {
  type EnrichmentLifecycleState,
  transition,
  isAcceptedForScoring,
} from './lifecycle';

/** Result for a single source enrichment */
export interface SourceEnrichmentResult {
  source: EnrichmentSource;
  state: EnrichmentLifecycleState;
  signals: EnrichmentSignalPayload[];
  fromCache: boolean;
  attempts: number;
  error?: unknown;
}

/** Result of enriching a candidate across all requested sources */
export interface EnrichCandidateResult {
  entityId: string;
  results: SourceEnrichmentResult[];
  acceptedSignals: EnrichmentSignalPayload[];
}

/** Registry of enrichment modules keyed by source */
export class EnrichmentRegistry {
  private modules = new Map<EnrichmentSource, EnrichmentModule>();

  register(module: EnrichmentModule): void {
    this.modules.set(module.source, module);
  }

  get(source: EnrichmentSource): EnrichmentModule | undefined {
    return this.modules.get(source);
  }

  has(source: EnrichmentSource): boolean {
    return this.modules.has(source);
  }

  all(): EnrichmentModule[] {
    return [...this.modules.values()];
  }
}

/**
 * Run enrichment for a candidate entity across the requested sources.
 * Respects cache (check before API call), retry (exponential backoff), and lifecycle states.
 *
 * Per §17.1:
 * - Tier 1 runs on all eligible candidates
 * - Tier 2 runs only on Priority > 0.50
 * - Tier 3 is reviewer-triggered only (not handled here)
 *
 * Per R4.6: ambiguous matches (confidence 0.55-0.74) stored but not accepted for scoring.
 */
export async function enrichCandidate(
  entity: CanonicalEntity,
  sources: EnrichmentSource[],
  registry: EnrichmentRegistry,
  cache: EnrichmentCache,
  retryOptions?: RetryOptions,
): Promise<EnrichCandidateResult> {
  const results: SourceEnrichmentResult[] = [];
  const acceptedSignals: EnrichmentSignalPayload[] = [];

  for (const source of sources) {
    const module = registry.get(source);
    if (!module) {
      results.push({
        source,
        state: 'failed_final',
        signals: [],
        fromCache: false,
        attempts: 0,
        error: `No module registered for source: ${source}`,
      });
      continue;
    }

    // Check cache first (R4.8)
    const cacheResult = cache.lookup(entity.canonical_entity_id, source);
    if (cacheResult.status === 'hit') {
      // Cache hit: return cached signals, mark as matched
      const cachedPayloads: EnrichmentSignalPayload[] = cacheResult.signals.map((s) => ({
        source,
        signal_type: s.signal_type as EnrichmentSignalPayload['signal_type'],
        external_record_id: s.external_record_id,
        signal_payload: s.signal_payload,
        match_confidence: s.match_confidence,
        match_features: [],
      }));
      results.push({
        source,
        state: 'matched',
        signals: cachedPayloads,
        fromCache: true,
        attempts: 0,
      });
      // Add accepted signals
      for (const sig of cachedPayloads) {
        if (sig.match_confidence >= 0.75) {
          acceptedSignals.push(sig);
        }
      }
      continue;
    }

    // Cache miss or stale: call the module with retry (R4.9)
    let state: EnrichmentLifecycleState = 'not_started';
    state = transition(state, 'queued');
    state = transition(state, 'in_progress');

    const retryResult = await withRetry(
      () => module.enrich(entity),
      retryOptions,
    );

    if (retryResult.ok) {
      const signals = retryResult.value;

      if (signals.length === 0) {
        state = transition(state, 'no_result');
        results.push({ source, state, signals: [], fromCache: false, attempts: retryResult.attempts });
      } else {
        // Check for ambiguous matches (R4.6: confidence 0.55-0.74)
        const hasAmbiguous = signals.some(
          (s) => s.match_confidence >= 0.55 && s.match_confidence < 0.75,
        );
        const hasMatch = signals.some((s) => s.match_confidence >= 0.75);

        if (hasMatch) {
          state = transition(state, 'matched');
        } else if (hasAmbiguous) {
          state = transition(state, 'ambiguous_match');
        } else {
          state = transition(state, 'no_result');
        }

        results.push({ source, state, signals, fromCache: false, attempts: retryResult.attempts });

        // Only accept matched signals for scoring (R4.6)
        if (isAcceptedForScoring(state)) {
          for (const sig of signals) {
            if (sig.match_confidence >= 0.75) {
              acceptedSignals.push(sig);
            }
          }
        }
      }
    } else {
      // Retry exhausted
      state = transition(state, 'failed_retryable');
      results.push({
        source,
        state,
        signals: [],
        fromCache: false,
        attempts: retryResult.attempts,
        error: retryResult.error,
      });
    }
  }

  return {
    entityId: entity.canonical_entity_id,
    results,
    acceptedSignals,
  };
}

/**
 * Filter sources based on candidate priority and tier rules (§17.1).
 * Tier 1: all eligible. Tier 2: priority > 0.50. Tier 3: manual only (excluded).
 */
export function filterSourcesByPriority(
  sources: EnrichmentSource[],
  priorityScore: number,
): EnrichmentSource[] {
  return sources.filter((source) => {
    const tier = SOURCE_TIER[source];
    if (tier === 1) return true;
    if (tier === 2) return priorityScore > 0.50;
    return false; // Tier 3 excluded from automatic enrichment
  });
}
