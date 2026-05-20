/**
 * News enrichment module (F8.3-T3).
 * Tier 2 source per PRD §17.1 — runs only on Priority > 0.50.
 *
 * News search via SerpAPI (or equivalent).
 * Recent mentions with freshness metadata.
 * Returns structured signals with match confidence (R4.5).
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

export interface NewsArticle {
  title: string;
  link: string;
  snippet?: string;
  source?: string;
  date?: string; // ISO date string or natural language date
  thumbnail?: string;
}

export interface NewsSearchResponse {
  news_results?: NewsArticle[];
  error?: string;
}

// -------------------------------------------------------------------
// Config
// -------------------------------------------------------------------

export interface NewsConfig {
  /** SerpAPI key or equivalent news API key */
  apiKey: string;
  /** Base URL (default: https://serpapi.com) */
  baseUrl?: string;
  /** Maximum article age in days for freshness calculation (default: 365) */
  freshnessWindowDays?: number;
}

const DEFAULT_BASE_URL = 'https://serpapi.com';
const DEFAULT_FRESHNESS_WINDOW_DAYS = 365;

// -------------------------------------------------------------------
// Freshness helpers
// -------------------------------------------------------------------

/**
 * Parse a date string into a Date. Handles ISO dates and common formats.
 * Returns null if unparseable.
 */
export function parseArticleDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Compute a freshness score (0-1) based on article age.
 * 0 = older than the window, 1 = published today.
 * Per PRD §18.2: freshness contributes to confidence.
 */
export function computeFreshness(
  articleDate: Date | null,
  now: Date = new Date(),
  windowDays: number = DEFAULT_FRESHNESS_WINDOW_DAYS,
): number {
  if (!articleDate) return 0;
  const ageMs = now.getTime() - articleDate.getTime();
  if (ageMs < 0) return 1; // future date = fresh
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  if (ageDays >= windowDays) return 0;
  return 1 - ageDays / windowDays;
}

// -------------------------------------------------------------------
// Match confidence helpers
// -------------------------------------------------------------------

/**
 * Compute match confidence for a news article against a candidate (R4.5).
 */
export function computeNewsMatchConfidence(
  entity: CanonicalEntity,
  article: NewsArticle,
  now: Date = new Date(),
  freshnessWindowDays: number = DEFAULT_FRESHNESS_WINDOW_DAYS,
): { confidence: number; features: MatchFeature[] } {
  const features: MatchFeature[] = [];

  // Feature 1: Title name match (weight 0.40)
  const titleScore = nameTokenOverlap(entity.display_name, article.title);
  features.push({ feature: 'name_in_title', weight: 0.40, score: titleScore });

  // Feature 2: Snippet name match (weight 0.25)
  const snippetScore = article.snippet
    ? nameTokenOverlap(entity.display_name, article.snippet)
    : 0;
  features.push({ feature: 'name_in_snippet', weight: 0.25, score: snippetScore });

  // Feature 3: Freshness (weight 0.20)
  const articleDate = parseArticleDate(article.date);
  const freshness = computeFreshness(articleDate, now, freshnessWindowDays);
  features.push({ feature: 'freshness', weight: 0.20, score: freshness });

  // Feature 4: Source credibility proxy (weight 0.15)
  // Simple heuristic: having a known source name is positive
  let sourceScore = 0;
  if (article.source) {
    sourceScore = 0.5; // baseline for having an identified source
    // Boost for well-known sources
    const knownSources = ['bbc', 'guardian', 'telegraph', 'times', 'reuters', 'financial times', 'ft.com'];
    if (knownSources.some((s) => article.source!.toLowerCase().includes(s))) {
      sourceScore = 1.0;
    }
  }
  features.push({ feature: 'source_credibility', weight: 0.15, score: sourceScore });

  const confidence = features.reduce((sum, f) => sum + f.weight * f.score, 0);

  return { confidence: Math.min(1, Math.max(0, confidence)), features };
}

// -------------------------------------------------------------------
// API client
// -------------------------------------------------------------------

export async function searchNews(
  query: string,
  config: NewsConfig,
): Promise<NewsSearchResponse> {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const url = `${baseUrl}/search.json?engine=google_news&q=${encodeURIComponent(query)}&api_key=${encodeURIComponent(config.apiKey)}`;

  const response = await fetch(url);

  if (!response.ok) {
    const error: Record<string, unknown> = { status: response.status, statusText: response.statusText };
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      if (retryAfter) {
        (error as Record<string, unknown>).headers = { 'retry-after': retryAfter };
      }
    }
    throw error;
  }

  return response.json() as Promise<NewsSearchResponse>;
}

// -------------------------------------------------------------------
// Module
// -------------------------------------------------------------------

export function createNewsModule(config: NewsConfig): EnrichmentModule {
  const freshnessWindowDays = config.freshnessWindowDays ?? DEFAULT_FRESHNESS_WINDOW_DAYS;

  return {
    source: 'news',
    tier: 2,

    async enrich(entity: CanonicalEntity): Promise<EnrichmentSignalPayload[]> {
      const now = new Date();
      const searchResults = await searchNews(entity.display_name, config);

      if (!searchResults.news_results || searchResults.news_results.length === 0) {
        return [];
      }

      return searchResults.news_results.map((article) => {
        const { confidence, features } = computeNewsMatchConfidence(
          entity,
          article,
          now,
          freshnessWindowDays,
        );

        const articleDate = parseArticleDate(article.date);

        return {
          source: 'news' as const,
          signal_type: 'news_mention' as const,
          external_record_id: article.link,
          signal_payload: {
            title: article.title,
            url: article.link,
            snippet: article.snippet ?? null,
            source_name: article.source ?? null,
            published_date: articleDate?.toISOString() ?? null,
            freshness_score: computeFreshness(articleDate, now, freshnessWindowDays),
          },
          match_confidence: confidence,
          match_features: features,
        };
      });
    },
  };
}
