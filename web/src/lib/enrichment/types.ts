/**
 * Enrichment module interface per PRD §17.1, R4.1.
 *
 * Pluggable enrichment modules: candidate entity in, structured signal payload out.
 * Each module implements: enrich(entity) -> EnrichmentSignal[]
 */

import type { CanonicalEntity, EnrichmentSignal } from '@/types/database';

/** Sources supported in v1 (§17.1) + seed augmentation + web augmentation */
export type EnrichmentSource =
  | 'companies_house'
  | 'companies_house_psc'
  | 'companies_house_co_director'
  | 'charity_commission'
  | 'charity_commission_bulk'
  | 'electoral_commission'
  | '360giving'
  | 'fca_register'
  | 'land_registry'
  | 'wikidata'
  | 'wikipedia'
  | 'news'
  | 'gdelt'
  | 'guardian'
  | 'forbes'
  | 'web_search'
  | 'manual_research'
  | 'hnw_research'
  | 'network_mapping';

/** Tiers per §17.1 */
export type EnrichmentTier = 1 | 2 | 3;

/** Map sources to their tier */
export const SOURCE_TIER: Record<EnrichmentSource, EnrichmentTier> = {
  companies_house: 1,
  companies_house_psc: 1,
  companies_house_co_director: 1,
  charity_commission: 1,
  charity_commission_bulk: 1,
  electoral_commission: 1,
  '360giving': 1,
  fca_register: 1,
  land_registry: 1,
  wikidata: 2,
  wikipedia: 2,
  news: 2,
  gdelt: 2,
  guardian: 2,
  forbes: 2,
  web_search: 2,
  manual_research: 3,
  hnw_research: 1,
  network_mapping: 1,
};

/** Signal types emitted by enrichment modules */
export type SignalType =
  | 'company_officer'
  | 'company_psc'
  | 'company_profile'
  | 'charity_trustee'
  | 'charity_financials'
  | 'political_donation'
  | 'grant_made'
  | 'grant_received'
  | 'fca_approved_person'
  | 'property_holding'
  | 'wikidata_entity'
  | 'wikipedia_summary'
  | 'news_mention'
  | 'news_article'
  | 'rich_list_entry'
  | 'company_filing'
  | 'charity_filing'
  | 'web_research_finding'
  | 'wealth_convergence'
  | 'manual_note'
  | 'hnw_research_profile'
  | 'network_contact'
  | 'co_director'
  | 'co_trustee';

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

/**
 * Graph-aware enrichment signal — extends base payload with relationship
 * and article data that gets stored as graph nodes/edges.
 * Every discovery from any source increases graph density for that person.
 */
export interface GraphEnrichmentSignal extends EnrichmentSignalPayload {
  discovered_relationships: DiscoveredRelationship[];
  discovered_articles: DiscoveredArticle[];
}

export interface DiscoveredRelationship {
  target_name: string;
  target_entity_type: 'person' | 'organisation' | 'charity' | 'company';
  relationship_type: string;
  via_organisation?: string;
  evidence_url?: string;
  evidence_text?: string;
  confidence: number;
  source_layer: 'A' | 'B' | 'C';
}

export interface DiscoveredArticle {
  url: string;
  title: string;
  source_name: string;
  published_date?: string;
  excerpt?: string;
  mentions_entity: boolean;
  article_type: 'news' | 'filing' | 'profile' | 'philanthropy' | 'rich_list' | 'other';
}

/**
 * Unified sweep result — combines signals, relationships, and articles
 * into a single output that the graph builder can consume.
 */
export interface UnifiedSweepResult {
  entity_id: string;
  entity_name: string;
  signals: GraphEnrichmentSignal[];
  total_relationships_discovered: number;
  total_articles_discovered: number;
  wealth_band: WealthBand | null;
  layers_completed: ('A' | 'B' | 'C')[];
}

export type WealthBand =
  | 'unknown'
  | '1m_5m'
  | '5m_25m'
  | '25m_100m'
  | '100m_plus';
