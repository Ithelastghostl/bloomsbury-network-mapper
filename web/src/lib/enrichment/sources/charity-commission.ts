/**
 * Charity Commission enrichment module (F8.2-T2).
 * Tier 1 source per PRD §17.1.
 *
 * Charity search and trustee lookup via the Charity Commission API.
 * Returns structured signals with match confidence and feature breakdown (R4.5).
 *
 * API: https://register-of-charities.charitycommission.gov.uk/api/
 */

import type { CanonicalEntity } from '@/types/database';
import type {
  EnrichmentModule,
  EnrichmentSignalPayload,
  MatchFeature,
} from '../types';
import { normaliseName, nameTokenOverlap } from './companies-house';

// -------------------------------------------------------------------
// API types (subset of Charity Commission response shapes)
// -------------------------------------------------------------------

export interface CharityTrustee {
  trustee_name: string;
  trustee_id?: string;
  role?: string;
  date_of_appointment?: string;
}

export interface CharitySearchResult {
  charity_number: string;
  charity_name: string;
  trustees?: CharityTrustee[];
  status?: string;
  date_registered?: string;
  date_removed?: string;
}

export interface CharitySearchResponse {
  charities: CharitySearchResult[];
  total_results: number;
}

// -------------------------------------------------------------------
// Config
// -------------------------------------------------------------------

export interface CharityCommissionConfig {
  /** API key for the Charity Commission API (if required) */
  apiKey?: string;
  /** Base URL (default: https://api.charitycommission.gov.uk/register/api) */
  baseUrl?: string;
}

const DEFAULT_BASE_URL = 'https://api.charitycommission.gov.uk/register/api';

// -------------------------------------------------------------------
// Match confidence helpers
// -------------------------------------------------------------------

/**
 * Compute match confidence and feature breakdown for a Charity Commission
 * trustee match against a candidate entity (R4.5).
 */
export function computeTrusteeMatchConfidence(
  entity: CanonicalEntity,
  trustee: CharityTrustee,
  charity: CharitySearchResult,
): { confidence: number; features: MatchFeature[] } {
  const features: MatchFeature[] = [];

  // Feature 1: Name match (weight 0.50)
  const nameScore = nameTokenOverlap(entity.display_name, trustee.trustee_name);
  features.push({ feature: 'name_match', weight: 0.50, score: nameScore });

  // Feature 2: Charity registration match (weight 0.25)
  const entityCharityNumber = entity.attributes?.charity_number as string | undefined;
  let regScore = 0;
  if (entityCharityNumber && entityCharityNumber === charity.charity_number) {
    regScore = 1.0;
  }
  features.push({ feature: 'registration_match', weight: 0.25, score: regScore });

  // Feature 3: Role match (weight 0.15)
  const entityRole = entity.attributes?.role as string | undefined;
  let roleScore = 0;
  if (entityRole && trustee.role) {
    roleScore = normaliseName(entityRole) === normaliseName(trustee.role) ? 1.0 : 0.0;
  } else if (trustee.role) {
    roleScore = 0.3;
  }
  features.push({ feature: 'role_match', weight: 0.15, score: roleScore });

  // Feature 4: Charity name overlap with entity's org attribute (weight 0.10)
  const entityOrg = entity.attributes?.organisation as string | undefined;
  let orgScore = 0;
  if (entityOrg) {
    orgScore = nameTokenOverlap(entityOrg, charity.charity_name);
  }
  features.push({ feature: 'org_match', weight: 0.10, score: orgScore });

  const confidence = features.reduce((sum, f) => sum + f.weight * f.score, 0);

  return { confidence: Math.min(1, Math.max(0, confidence)), features };
}

// -------------------------------------------------------------------
// API client
// -------------------------------------------------------------------

export async function searchCharities(
  query: string,
  config: CharityCommissionConfig,
): Promise<CharitySearchResponse> {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const url = `${baseUrl}/charities?search=${encodeURIComponent(query)}&page_size=10`;

  const headers: Record<string, string> = {};
  if (config.apiKey) {
    headers['Ocp-Apim-Subscription-Key'] = config.apiKey;
  }

  const response = await fetch(url, { headers });

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

  return response.json() as Promise<CharitySearchResponse>;
}

export async function getCharityTrustees(
  charityNumber: string,
  config: CharityCommissionConfig,
): Promise<CharityTrustee[]> {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const url = `${baseUrl}/charities/${encodeURIComponent(charityNumber)}/trustees`;

  const headers: Record<string, string> = {};
  if (config.apiKey) {
    headers['Ocp-Apim-Subscription-Key'] = config.apiKey;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw { status: response.status, statusText: response.statusText };
  }

  return response.json() as Promise<CharityTrustee[]>;
}

// -------------------------------------------------------------------
// Module
// -------------------------------------------------------------------

export function createCharityCommissionModule(
  config: CharityCommissionConfig,
): EnrichmentModule {
  return {
    source: 'charity_commission',
    tier: 1,

    async enrich(entity: CanonicalEntity): Promise<EnrichmentSignalPayload[]> {
      // Search for charities related to this entity
      const searchResults = await searchCharities(entity.display_name, config);

      if (!searchResults.charities || searchResults.charities.length === 0) {
        return [];
      }

      const signals: EnrichmentSignalPayload[] = [];

      for (const charity of searchResults.charities) {
        const trustees = charity.trustees ?? [];

        for (const trustee of trustees) {
          const { confidence, features } = computeTrusteeMatchConfidence(
            entity,
            trustee,
            charity,
          );

          // Only include if there is some name overlap
          if (confidence > 0.1) {
            signals.push({
              source: 'charity_commission',
              signal_type: 'charity_trustee',
              external_record_id: trustee.trustee_id ?? `cc_${charity.charity_number}_${normaliseName(trustee.trustee_name)}`,
              signal_payload: {
                trustee_name: trustee.trustee_name,
                trustee_role: trustee.role ?? null,
                charity_number: charity.charity_number,
                charity_name: charity.charity_name,
                charity_status: charity.status ?? null,
                date_of_appointment: trustee.date_of_appointment ?? null,
              },
              match_confidence: confidence,
              match_features: features,
            });
          }
        }
      }

      return signals;
    },
  };
}
