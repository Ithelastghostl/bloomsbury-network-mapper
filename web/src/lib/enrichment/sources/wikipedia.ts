/**
 * Wikipedia enrichment module (F8.3-T2).
 * Tier 2 source per PRD §17.1 — runs only on Priority > 0.50.
 *
 * Wikipedia article lookup and summary extraction.
 * Returns structured signals with match confidence (R4.5).
 *
 * API: https://en.wikipedia.org/api/rest_v1/ (summary endpoint)
 */

import type { CanonicalEntity } from '@/types/database';
import type {
  EnrichmentModule,
  EnrichmentSignalPayload,
  MatchFeature,
} from '../types';
import { normaliseName, nameTokenOverlap } from './companies-house';

// -------------------------------------------------------------------
// API types
// -------------------------------------------------------------------

export interface WikipediaSummary {
  title: string;
  displaytitle?: string;
  extract: string;
  extract_html?: string;
  description?: string;
  content_urls?: {
    desktop?: { page?: string };
  };
  thumbnail?: {
    source?: string;
    width?: number;
    height?: number;
  };
  timestamp?: string;
}

export interface WikipediaSearchResult {
  pages: WikipediaSearchPage[];
}

export interface WikipediaSearchPage {
  id: number;
  key: string;
  title: string;
  description?: string;
  excerpt?: string;
  thumbnail?: { url?: string };
}

// -------------------------------------------------------------------
// Config
// -------------------------------------------------------------------

export interface WikipediaConfig {
  /** Base URL (default: https://en.wikipedia.org) */
  baseUrl?: string;
  /** Language (default: 'en') */
  language?: string;
}

const DEFAULT_BASE_URL = 'https://en.wikipedia.org';

// -------------------------------------------------------------------
// Match confidence helpers
// -------------------------------------------------------------------

/**
 * Compute match confidence for a Wikipedia article against a candidate (R4.5).
 */
export function computeWikipediaMatchConfidence(
  entity: CanonicalEntity,
  page: WikipediaSearchPage,
): { confidence: number; features: MatchFeature[] } {
  const features: MatchFeature[] = [];

  // Feature 1: Title/name match (weight 0.55)
  const nameScore = nameTokenOverlap(entity.display_name, page.title);
  features.push({ feature: 'name_match', weight: 0.55, score: nameScore });

  // Feature 2: Description relevance (weight 0.25)
  let descScore = 0;
  const descText = (page.description ?? '') + ' ' + (page.excerpt ?? '');
  if (descText.trim().length > 0) {
    const desc = descText.toLowerCase();
    const entityType = entity.entity_type?.toLowerCase() ?? '';
    if (entityType && desc.includes(entityType)) {
      descScore = 0.6;
    }
    const entityOrg = (entity.attributes?.organisation as string) ?? '';
    if (entityOrg && desc.includes(entityOrg.toLowerCase())) {
      descScore = Math.min(1, descScore + 0.4);
    }
    if (descScore === 0 && desc.length > 0) {
      descScore = 0.1;
    }
  }
  features.push({ feature: 'description_relevance', weight: 0.25, score: descScore });

  // Feature 3: Type alignment (weight 0.20)
  let typeScore = 0;
  if (descText.trim().length > 0) {
    const desc = descText.toLowerCase();
    const isPerson = entity.entity_type === 'person';
    const personTerms = ['politician', 'author', 'businessperson', 'director', 'philanthropist', 'born', 'trustee'];
    const orgTerms = ['charity', 'company', 'organisation', 'organization', 'foundation', 'trust'];
    const relevantTerms = isPerson ? personTerms : orgTerms;
    if (relevantTerms.some((term) => desc.includes(term))) {
      typeScore = 1.0;
    }
  }
  features.push({ feature: 'type_alignment', weight: 0.20, score: typeScore });

  const confidence = features.reduce((sum, f) => sum + f.weight * f.score, 0);

  return { confidence: Math.min(1, Math.max(0, confidence)), features };
}

// -------------------------------------------------------------------
// API client
// -------------------------------------------------------------------

export async function searchWikipedia(
  query: string,
  config: WikipediaConfig,
): Promise<WikipediaSearchResult> {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const url = `${baseUrl}/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=5`;

  const response = await fetch(url, {
    headers: { 'User-Agent': 'BloomsburyNetworkMapper/1.0' },
  });

  if (!response.ok) {
    throw { status: response.status, statusText: response.statusText };
  }

  return response.json() as Promise<WikipediaSearchResult>;
}

export async function getArticleSummary(
  title: string,
  config: WikipediaConfig,
): Promise<WikipediaSummary> {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const url = `${baseUrl}/api/rest_v1/page/summary/${encodeURIComponent(title)}`;

  const response = await fetch(url, {
    headers: { 'User-Agent': 'BloomsburyNetworkMapper/1.0' },
  });

  if (!response.ok) {
    throw { status: response.status, statusText: response.statusText };
  }

  return response.json() as Promise<WikipediaSummary>;
}

// -------------------------------------------------------------------
// Module
// -------------------------------------------------------------------

export function createWikipediaModule(
  config: WikipediaConfig = {},
): EnrichmentModule {
  return {
    source: 'wikipedia',
    tier: 2,

    async enrich(entity: CanonicalEntity): Promise<EnrichmentSignalPayload[]> {
      const searchResults = await searchWikipedia(entity.display_name, config);

      if (!searchResults.pages || searchResults.pages.length === 0) {
        return [];
      }

      const signals: EnrichmentSignalPayload[] = [];

      for (const page of searchResults.pages) {
        const { confidence, features } = computeWikipediaMatchConfidence(entity, page);

        if (confidence > 0.1) {
          // Fetch full summary for the top-matching article
          let summary: WikipediaSummary | null = null;
          try {
            summary = await getArticleSummary(page.key, config);
          } catch {
            // Summary fetch failed; still return the search signal
          }

          signals.push({
            source: 'wikipedia',
            signal_type: 'wikipedia_summary',
            external_record_id: `wp_${page.id}`,
            signal_payload: {
              title: page.title,
              description: page.description ?? null,
              excerpt: page.excerpt ?? null,
              summary: summary?.extract ?? null,
              url: summary?.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.key)}`,
              thumbnail_url: page.thumbnail?.url ?? summary?.thumbnail?.source ?? null,
              last_modified: summary?.timestamp ?? null,
            },
            match_confidence: confidence,
            match_features: features,
          });
        }
      }

      return signals;
    },
  };
}
