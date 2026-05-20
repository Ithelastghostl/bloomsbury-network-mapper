/**
 * Wikidata enrichment module (F8.3-T1).
 * Tier 2 source per PRD §17.1 — runs only on Priority > 0.50.
 *
 * Entity search via Wikidata SPARQL/search API, property extraction.
 * Returns structured signals with match confidence and feature breakdown (R4.5).
 *
 * API: https://www.wikidata.org/w/api.php (wbsearchentities action)
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

export interface WikidataSearchHit {
  id: string; // e.g. "Q42"
  label: string;
  description?: string;
  url?: string;
}

export interface WikidataSearchResponse {
  search: WikidataSearchHit[];
  'search-continue'?: number;
}

export interface WikidataEntity {
  id: string;
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  claims?: Record<string, WikidataClaim[]>;
  sitelinks?: Record<string, { title: string; url?: string }>;
}

export interface WikidataClaim {
  mainsnak: {
    property: string;
    datavalue?: {
      type: string;
      value: unknown;
    };
  };
}

/** Well-known Wikidata property IDs we extract */
export const WIKIDATA_PROPERTIES = {
  INSTANCE_OF: 'P31',
  OCCUPATION: 'P106',
  EMPLOYER: 'P108',
  POSITION_HELD: 'P39',
  COUNTRY_OF_CITIZENSHIP: 'P27',
  DATE_OF_BIRTH: 'P569',
  EDUCATED_AT: 'P69',
  MEMBER_OF: 'P463',
} as const;

// -------------------------------------------------------------------
// Config
// -------------------------------------------------------------------

export interface WikidataConfig {
  /** Base URL (default: https://www.wikidata.org) */
  baseUrl?: string;
  /** Language for labels (default: 'en') */
  language?: string;
}

const DEFAULT_BASE_URL = 'https://www.wikidata.org';

// -------------------------------------------------------------------
// Match confidence helpers
// -------------------------------------------------------------------

/**
 * Compute match confidence for a Wikidata entity against a candidate (R4.5).
 */
export function computeWikidataMatchConfidence(
  entity: CanonicalEntity,
  hit: WikidataSearchHit,
): { confidence: number; features: MatchFeature[] } {
  const features: MatchFeature[] = [];

  // Feature 1: Name/label match (weight 0.60)
  const nameScore = nameTokenOverlap(entity.display_name, hit.label);
  features.push({ feature: 'name_match', weight: 0.60, score: nameScore });

  // Feature 2: Description relevance (weight 0.25)
  // Check if entity type or known attributes appear in the description
  let descScore = 0;
  if (hit.description) {
    const desc = hit.description.toLowerCase();
    const entityType = entity.entity_type?.toLowerCase() ?? '';
    if (entityType && desc.includes(entityType)) {
      descScore = 0.6;
    }
    // Bonus if org name appears in description
    const entityOrg = (entity.attributes?.organisation as string) ?? '';
    if (entityOrg && desc.includes(entityOrg.toLowerCase())) {
      descScore = Math.min(1, descScore + 0.4);
    }
    // Baseline: having any description is slightly positive
    if (descScore === 0 && desc.length > 0) {
      descScore = 0.1;
    }
  }
  features.push({ feature: 'description_relevance', weight: 0.25, score: descScore });

  // Feature 3: Entity type alignment (weight 0.15)
  // Wikidata entities have descriptions that hint at person vs. org
  let typeScore = 0;
  if (hit.description) {
    const desc = hit.description.toLowerCase();
    const isPerson = entity.entity_type === 'person';
    const personTerms = ['politician', 'author', 'businessperson', 'director', 'trustee', 'philanthropist', 'born'];
    const orgTerms = ['charity', 'company', 'organisation', 'organization', 'foundation', 'trust'];
    const relevantTerms = isPerson ? personTerms : orgTerms;
    if (relevantTerms.some((term) => desc.includes(term))) {
      typeScore = 1.0;
    }
  }
  features.push({ feature: 'type_alignment', weight: 0.15, score: typeScore });

  const confidence = features.reduce((sum, f) => sum + f.weight * f.score, 0);

  return { confidence: Math.min(1, Math.max(0, confidence)), features };
}

/**
 * Extract structured properties from a Wikidata entity's claims.
 */
export function extractProperties(
  wdEntity: WikidataEntity,
): Record<string, unknown> {
  const props: Record<string, unknown> = {};

  if (!wdEntity.claims) return props;

  for (const [propId, propName] of Object.entries(WIKIDATA_PROPERTIES)) {
    const claims = wdEntity.claims[propName];
    if (claims && claims.length > 0) {
      props[propId.toLowerCase()] = claims.map((c) => c.mainsnak.datavalue?.value ?? null);
    }
  }

  // Add English label and description
  if (wdEntity.labels?.en) {
    props.label = wdEntity.labels.en.value;
  }
  if (wdEntity.descriptions?.en) {
    props.description = wdEntity.descriptions.en.value;
  }

  // Add Wikipedia sitelink if present
  if (wdEntity.sitelinks?.enwiki) {
    props.wikipedia_title = wdEntity.sitelinks.enwiki.title;
    props.wikipedia_url = wdEntity.sitelinks.enwiki.url ?? null;
  }

  return props;
}

// -------------------------------------------------------------------
// API client
// -------------------------------------------------------------------

export async function searchWikidata(
  query: string,
  config: WikidataConfig,
): Promise<WikidataSearchResponse> {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const language = config.language ?? 'en';
  const url = `${baseUrl}/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=${language}&format=json&limit=5`;

  const response = await fetch(url, {
    headers: { 'User-Agent': 'BloomsburyNetworkMapper/1.0' },
  });

  if (!response.ok) {
    throw { status: response.status, statusText: response.statusText };
  }

  return response.json() as Promise<WikidataSearchResponse>;
}

export async function getWikidataEntity(
  entityId: string,
  config: WikidataConfig,
): Promise<WikidataEntity> {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const url = `${baseUrl}/w/api.php?action=wbgetentities&ids=${encodeURIComponent(entityId)}&format=json&props=labels|descriptions|claims|sitelinks`;

  const response = await fetch(url, {
    headers: { 'User-Agent': 'BloomsburyNetworkMapper/1.0' },
  });

  if (!response.ok) {
    throw { status: response.status, statusText: response.statusText };
  }

  const data = (await response.json()) as { entities: Record<string, WikidataEntity> };
  const entity = data.entities[entityId];
  if (!entity) {
    throw new Error(`Wikidata entity ${entityId} not found`);
  }
  return entity;
}

// -------------------------------------------------------------------
// Module
// -------------------------------------------------------------------

export function createWikidataModule(
  config: WikidataConfig = {},
): EnrichmentModule {
  return {
    source: 'wikidata',
    tier: 2,

    async enrich(entity: CanonicalEntity): Promise<EnrichmentSignalPayload[]> {
      const searchResults = await searchWikidata(entity.display_name, config);

      if (!searchResults.search || searchResults.search.length === 0) {
        return [];
      }

      const signals: EnrichmentSignalPayload[] = [];

      for (const hit of searchResults.search) {
        const { confidence, features } = computeWikidataMatchConfidence(entity, hit);

        // Only include if name match is meaningful
        if (confidence > 0.1) {
          // Fetch full entity data for property extraction
          let properties: Record<string, unknown> = {};
          try {
            const wdEntity = await getWikidataEntity(hit.id, config);
            properties = extractProperties(wdEntity);
          } catch {
            // If entity fetch fails, still return the search signal
            properties = { fetch_failed: true };
          }

          signals.push({
            source: 'wikidata',
            signal_type: 'wikidata_entity',
            external_record_id: hit.id,
            signal_payload: {
              wikidata_id: hit.id,
              label: hit.label,
              description: hit.description ?? null,
              url: hit.url ?? `https://www.wikidata.org/wiki/${hit.id}`,
              properties,
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
