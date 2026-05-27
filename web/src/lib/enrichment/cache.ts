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

const DAY_MS = 24 * 60 * 60 * 1000;

/** TTL in milliseconds per source (R4.8) */
const SOURCE_TTL_MS: Record<EnrichmentSource, number> = {
  companies_house: 30 * DAY_MS,
  companies_house_psc: 30 * DAY_MS,
  charity_commission: 30 * DAY_MS,
  charity_commission_bulk: 30 * DAY_MS,
  electoral_commission: 14 * DAY_MS,
  '360giving': 30 * DAY_MS,
  fca_register: 30 * DAY_MS,
  land_registry: 90 * DAY_MS,
  wikidata: 90 * DAY_MS,
  wikipedia: 90 * DAY_MS,
  news: 7 * DAY_MS,
  gdelt: 7 * DAY_MS,
  guardian: 7 * DAY_MS,
  forbes: 90 * DAY_MS,
  web_search: 14 * DAY_MS,
  manual_research: 365 * DAY_MS,
  hnw_research: 90 * DAY_MS,
  network_mapping: 90 * DAY_MS,
};

/** TTL in days for display / DB storage */
export const SOURCE_TTL_DAYS: Record<EnrichmentSource, number> = {
  companies_house: 30,
  companies_house_psc: 30,
  charity_commission: 30,
  charity_commission_bulk: 30,
  electoral_commission: 14,
  '360giving': 30,
  fca_register: 30,
  land_registry: 90,
  wikidata: 90,
  wikipedia: 90,
  news: 7,
  gdelt: 7,
  guardian: 7,
  forbes: 90,
  web_search: 14,
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
