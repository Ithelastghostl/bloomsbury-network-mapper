/**
 * Enrichment cache with source-specific TTL per PRD R4.8.
 *
 * Cache key: (entity_id, source)
 * TTLs: Companies House 30d, Charity Commission 30d, Wikidata 90d, News 7d
 *
 * Check cache before calling external API; refresh stale entries.
 */

import type { EnrichmentSource } from './types';
import type { EnrichmentSignal } from '@/types/database';

/** TTL in milliseconds per source (R4.8) */
const SOURCE_TTL_MS: Record<EnrichmentSource, number> = {
  companies_house: 30 * 24 * 60 * 60 * 1000,
  charity_commission: 30 * 24 * 60 * 60 * 1000,
  wikidata: 90 * 24 * 60 * 60 * 1000,
  wikipedia: 90 * 24 * 60 * 60 * 1000,
  news: 7 * 24 * 60 * 60 * 1000,
  manual_research: 365 * 24 * 60 * 60 * 1000,
  hnw_research: 90 * 24 * 60 * 60 * 1000,
  network_mapping: 90 * 24 * 60 * 60 * 1000,
};

/** TTL in days for display / DB storage */
export const SOURCE_TTL_DAYS: Record<EnrichmentSource, number> = {
  companies_house: 30,
  charity_commission: 30,
  wikidata: 90,
  wikipedia: 90,
  news: 7,
  manual_research: 365,
  hnw_research: 90,
  network_mapping: 90,
};

export type CacheStatus = 'hit' | 'miss' | 'stale';

export interface CacheEntry {
  signals: EnrichmentSignal[];
  retrievedAt: Date;
  expiresAt: Date;
  source: EnrichmentSource;
}

export interface CacheLookupResult {
  status: CacheStatus;
  signals: EnrichmentSignal[];
}

/** Build cache key from entity_id and source */
export function cacheKey(entityId: string, source: EnrichmentSource): string {
  return `${entityId}:${source}`;
}

/**
 * Get TTL in milliseconds for a given source.
 */
export function getTtlMs(source: EnrichmentSource): number {
  return SOURCE_TTL_MS[source];
}

/**
 * Compute expiry date from retrieval date and source TTL.
 */
export function computeExpiresAt(retrievedAt: Date, source: EnrichmentSource): Date {
  return new Date(retrievedAt.getTime() + SOURCE_TTL_MS[source]);
}

/**
 * Check whether a cache entry is stale based on the current time.
 */
export function isStale(entry: CacheEntry, now: Date = new Date()): boolean {
  return now.getTime() >= entry.expiresAt.getTime();
}

/**
 * In-memory enrichment cache.
 * In production this reads from/writes to app.enrichment_signals via Supabase.
 * This in-memory implementation is used for unit tests and as a reference.
 */
export class EnrichmentCache {
  private store = new Map<string, CacheEntry>();

  /**
   * Look up cached signals for an entity+source pair.
   */
  lookup(entityId: string, source: EnrichmentSource, now: Date = new Date()): CacheLookupResult {
    const key = cacheKey(entityId, source);
    const entry = this.store.get(key);

    if (!entry) {
      return { status: 'miss', signals: [] };
    }

    if (isStale(entry, now)) {
      return { status: 'stale', signals: entry.signals };
    }

    return { status: 'hit', signals: entry.signals };
  }

  /**
   * Store enrichment signals in the cache.
   */
  put(
    entityId: string,
    source: EnrichmentSource,
    signals: EnrichmentSignal[],
    retrievedAt: Date = new Date(),
  ): void {
    const key = cacheKey(entityId, source);
    this.store.set(key, {
      signals,
      retrievedAt,
      expiresAt: computeExpiresAt(retrievedAt, source),
      source,
    });
  }

  /**
   * Invalidate a cache entry (force refresh).
   */
  invalidate(entityId: string, source: EnrichmentSource): boolean {
    return this.store.delete(cacheKey(entityId, source));
  }

  /** Number of entries in the cache */
  get size(): number {
    return this.store.size;
  }
}
