/**
 * Enrichment module interface per PRD §17.1, R4.1.
 *
 * Pluggable enrichment modules: candidate entity in, structured signal payload out.
 * Each module implements: enrich(entity) -> EnrichmentSignal[]
 */

import type { CanonicalEntity, EnrichmentSignal } from '@/types/database';

/** Sources supported in v1 (§17.1) + seed augmentation */
export type EnrichmentSource =
  | 'companies_house'
  | 'charity_commission'
  | 'wikidata'
  | 'wikipedia'
  | 'news'
  | 'manual_research'
  | 'hnw_research'
  | 'network_mapping';

/** Tiers per §17.1 */
export type EnrichmentTier = 1 | 2 | 3;

/** Map sources to their tier */
export const SOURCE_TIER: Record<EnrichmentSource, EnrichmentTier> = {
  companies_house: 1,
  charity_commission: 1,
  wikidata: 2,
  wikipedia: 2,
  news: 2,
  manual_research: 3,
  hnw_research: 1,
  network_mapping: 1,
};

/** Signal types emitted by enrichment modules */
export type SignalType =
  | 'company_officer'
  | 'charity_trustee'
  | 'wikidata_entity'
  | 'wikipedia_summary'
  | 'news_mention'
  | 'company_filing'
  | 'charity_filing'
  | 'manual_note'
  | 'hnw_research_profile'
  | 'network_contact';

/** Match feature breakdown for R4.5 */
export interface MatchFeature {
  feature: string;
  weight: number;
  score: number;
}

/** Enrichment signal payload returned by modules */
export interface EnrichmentSignalPayload {
  source: EnrichmentSource;
  signal_type: SignalType;
  external_record_id: string;
  signal_payload: Record<string, unknown>;
  match_confidence: number;
  match_features: MatchFeature[];
}

/**
 * Pluggable enrichment module interface (R4.1).
 * Each source implements this interface.
 */
export interface EnrichmentModule {
  /** Source identifier */
  readonly source: EnrichmentSource;
  /** Tier for this module */
  readonly tier: EnrichmentTier;
  /** Run enrichment for a candidate entity */
  enrich(entity: CanonicalEntity): Promise<EnrichmentSignalPayload[]>;
}
