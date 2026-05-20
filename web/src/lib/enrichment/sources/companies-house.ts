/**
 * Companies House enrichment module (F8.2-T1).
 * Tier 1 source per PRD §17.1.
 *
 * Officer search and company lookup via Companies House REST API.
 * Returns structured signals with match confidence and feature breakdown (R4.5).
 *
 * API docs: https://developer.company-information.service.gov.uk/
 * Auth: API key via Basic Auth (key as username, no password).
 * Rate limit: 600 requests per 5 minutes (≈ 2 req/sec).
 */

import type { CanonicalEntity } from '@/types/database';
import type {
  EnrichmentModule,
  EnrichmentSignalPayload,
  MatchFeature,
} from '../types';

// -------------------------------------------------------------------
// API types (subset of Companies House response shapes)
// -------------------------------------------------------------------

export interface CompaniesHouseOfficer {
  name: string;
  officer_role: string;
  appointed_on?: string;
  resigned_on?: string;
  date_of_birth?: { month: number; year: number };
  address?: {
    premises?: string;
    address_line_1?: string;
    locality?: string;
    postal_code?: string;
  };
  links?: { officer?: { appointments?: string } };
}

export interface CompaniesHouseSearchResult {
  items: CompaniesHouseOfficer[];
  total_results: number;
}

export interface CompaniesHouseCompany {
  company_number: string;
  company_name: string;
  company_status: string;
  type: string;
  date_of_creation?: string;
  registered_office_address?: Record<string, string>;
}

// -------------------------------------------------------------------
// Config
// -------------------------------------------------------------------

export interface CompaniesHouseConfig {
  /** API key for Companies House REST API */
  apiKey: string;
  /** Base URL (default: https://api.company-information.service.gov.uk) */
  baseUrl?: string;
}

const DEFAULT_BASE_URL = 'https://api.company-information.service.gov.uk';

// -------------------------------------------------------------------
// Match confidence helpers
// -------------------------------------------------------------------

/** Normalise a name for comparison: lowercase, trim, collapse whitespace */
export function normaliseName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Token overlap score between two normalised names (Jaccard on tokens) */
export function nameTokenOverlap(a: string, b: string): number {
  const tokensA = new Set(normaliseName(a).split(' ').filter(Boolean));
  const tokensB = new Set(normaliseName(b).split(' ').filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Compute match confidence and feature breakdown for a Companies House officer
 * match against a candidate entity (R4.5).
 */
export function computeOfficerMatchConfidence(
  entity: CanonicalEntity,
  officer: CompaniesHouseOfficer,
): { confidence: number; features: MatchFeature[] } {
  const features: MatchFeature[] = [];

  // Feature 1: Name match (weight 0.50)
  const nameScore = nameTokenOverlap(entity.display_name, officer.name);
  features.push({ feature: 'name_match', weight: 0.50, score: nameScore });

  // Feature 2: Registration ID match (weight 0.30)
  // If entity has a company number in attributes, compare
  const entityCompanyNumber = entity.attributes?.company_number as string | undefined;
  const officerCompanyLink = officer.links?.officer?.appointments;
  let idScore = 0;
  if (entityCompanyNumber && officerCompanyLink?.includes(entityCompanyNumber)) {
    idScore = 1.0;
  }
  features.push({ feature: 'id_match', weight: 0.30, score: idScore });

  // Feature 3: Role match (weight 0.20)
  // If entity has a known role type, check if the officer role matches
  const entityRole = entity.attributes?.role as string | undefined;
  let roleScore = 0;
  if (entityRole && officer.officer_role) {
    roleScore = normaliseName(entityRole) === normaliseName(officer.officer_role) ? 1.0 : 0.0;
  } else if (officer.officer_role) {
    // Partial credit: officer has a role, entity doesn't specify
    roleScore = 0.3;
  }
  features.push({ feature: 'role_match', weight: 0.20, score: roleScore });

  // Weighted sum
  const confidence = features.reduce((sum, f) => sum + f.weight * f.score, 0);

  return { confidence: Math.min(1, Math.max(0, confidence)), features };
}

// -------------------------------------------------------------------
// API client
// -------------------------------------------------------------------

export async function searchOfficers(
  query: string,
  config: CompaniesHouseConfig,
): Promise<CompaniesHouseSearchResult> {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const url = `${baseUrl}/search/officers?q=${encodeURIComponent(query)}&items_per_page=10`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${btoa(config.apiKey + ':')}`,
    },
  });

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

  return response.json() as Promise<CompaniesHouseSearchResult>;
}

export async function getCompany(
  companyNumber: string,
  config: CompaniesHouseConfig,
): Promise<CompaniesHouseCompany> {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const url = `${baseUrl}/company/${encodeURIComponent(companyNumber)}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${btoa(config.apiKey + ':')}`,
    },
  });

  if (!response.ok) {
    throw { status: response.status, statusText: response.statusText };
  }

  return response.json() as Promise<CompaniesHouseCompany>;
}

// -------------------------------------------------------------------
// Module
// -------------------------------------------------------------------

export function createCompaniesHouseModule(
  config: CompaniesHouseConfig,
): EnrichmentModule {
  return {
    source: 'companies_house',
    tier: 1,

    async enrich(entity: CanonicalEntity): Promise<EnrichmentSignalPayload[]> {
      const results = await searchOfficers(entity.display_name, config);

      if (!results.items || results.items.length === 0) {
        return [];
      }

      return results.items.map((officer) => {
        const { confidence, features } = computeOfficerMatchConfidence(entity, officer);

        return {
          source: 'companies_house' as const,
          signal_type: 'company_officer' as const,
          external_record_id: officer.links?.officer?.appointments ?? `ch_officer_${normaliseName(officer.name)}`,
          signal_payload: {
            officer_name: officer.name,
            officer_role: officer.officer_role,
            appointed_on: officer.appointed_on ?? null,
            resigned_on: officer.resigned_on ?? null,
            date_of_birth: officer.date_of_birth ?? null,
            address: officer.address ?? null,
          },
          match_confidence: confidence,
          match_features: features,
        };
      });
    },
  };
}
