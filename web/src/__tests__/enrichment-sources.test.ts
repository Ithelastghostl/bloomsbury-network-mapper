/**
 * Enrichment source module tests (F8.2–F8.4).
 *
 * Covers:
 * - Companies House signal extraction (F8.2-T1)
 * - Charity Commission signal extraction (F8.2-T2)
 * - Match confidence feature breakdown (F8.2-T3, R4.5)
 * - Wikidata property mapping (F8.3-T1)
 * - Wikipedia summary extraction (F8.3-T2)
 * - News freshness handling (F8.3-T3)
 * - Manual research trigger (F8.4-T1)
 * - Ambiguous match handling 0.55-0.74 (F8.4-T2, R4.6)
 * - Conflicting signal detection (F8.4-T3, R4.7)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CanonicalEntity } from '@/types/database';
import type { EnrichmentSignalPayload } from '@/lib/enrichment/types';

// Companies House
import {
  computeOfficerMatchConfidence,
  normaliseName,
  nameTokenOverlap,
  createCompaniesHouseModule,
  type CompaniesHouseOfficer,
} from '@/lib/enrichment/sources/companies-house';

// Charity Commission
import {
  computeTrusteeMatchConfidence,
  createCharityCommissionModule,
  type CharityTrustee,
  type CharitySearchResult,
} from '@/lib/enrichment/sources/charity-commission';

// Wikidata
import {
  computeWikidataMatchConfidence,
  extractProperties,
  createWikidataModule,
  WIKIDATA_PROPERTIES,
  type WikidataEntity,
  type WikidataSearchHit,
} from '@/lib/enrichment/sources/wikidata';

// Wikipedia
import {
  computeWikipediaMatchConfidence,
  createWikipediaModule,
  type WikipediaSearchPage,
} from '@/lib/enrichment/sources/wikipedia';

// News
import {
  computeNewsMatchConfidence,
  parseArticleDate,
  computeFreshness,
  createNewsModule,
  type NewsArticle,
} from '@/lib/enrichment/sources/news';

// Manual research
import {
  createManualResearchModule,
  completeManualResearch,
} from '@/lib/enrichment/sources/manual-research';

// Conflicts
import {
  detectConflicts,
  type SignalConflict,
} from '@/lib/enrichment/conflicts';

// Orchestrator (for ambiguous match integration)
import {
  enrichCandidate,
  EnrichmentRegistry,
  filterSourcesByPriority,
} from '@/lib/enrichment/index';
import { EnrichmentCache } from '@/lib/enrichment/cache';

// ===================================================================
// Helpers
// ===================================================================

function makeEntity(overrides: Partial<CanonicalEntity> = {}): CanonicalEntity {
  return {
    canonical_entity_id: 'ent_001',
    entity_type: 'person',
    display_name: 'John Smith',
    first_seen_run_id: 'run_001',
    last_seen_run_id: 'run_001',
    attributes: {},
    source: 'corpus',
    ...overrides,
  };
}

function makeSignal(overrides: Partial<EnrichmentSignalPayload> = {}): EnrichmentSignalPayload {
  return {
    source: 'companies_house',
    signal_type: 'company_officer',
    external_record_id: 'ext_001',
    signal_payload: {},
    match_confidence: 0.85,
    match_features: [],
    ...overrides,
  };
}

// ===================================================================
// Companies House (F8.2-T1)
// ===================================================================

describe('Companies House module', () => {
  describe('normaliseName', () => {
    it('lowercases and trims', () => {
      expect(normaliseName('  John SMITH  ')).toBe('john smith');
    });

    it('collapses multiple spaces', () => {
      expect(normaliseName('John   Smith')).toBe('john smith');
    });
  });

  describe('nameTokenOverlap', () => {
    it('returns 1.0 for identical names', () => {
      expect(nameTokenOverlap('John Smith', 'John Smith')).toBe(1.0);
    });

    it('returns 1.0 for case-insensitive match', () => {
      expect(nameTokenOverlap('john smith', 'JOHN SMITH')).toBe(1.0);
    });

    it('returns partial score for partial overlap', () => {
      // "john" overlaps, "smith" vs "doe" do not -> 1/3
      const score = nameTokenOverlap('John Smith', 'John Doe');
      expect(score).toBeCloseTo(1 / 3, 5);
    });

    it('returns 0 for no overlap', () => {
      expect(nameTokenOverlap('Alice Brown', 'Charlie Delta')).toBe(0);
    });

    it('returns 0 for empty strings', () => {
      expect(nameTokenOverlap('', '')).toBe(0);
    });
  });

  describe('computeOfficerMatchConfidence', () => {
    it('returns high confidence for exact name match', () => {
      const entity = makeEntity({ display_name: 'John Smith' });
      const officer: CompaniesHouseOfficer = {
        name: 'John Smith',
        officer_role: 'director',
      };

      const { confidence, features } = computeOfficerMatchConfidence(entity, officer);

      // Name: 1.0 * 0.50 = 0.50, ID: 0 * 0.30 = 0, Role: 0.3 * 0.20 = 0.06
      expect(confidence).toBeCloseTo(0.56, 1);
      expect(features).toHaveLength(3);
      expect(features.find((f) => f.feature === 'name_match')?.score).toBe(1.0);
    });

    it('returns higher confidence with ID match', () => {
      const entity = makeEntity({
        display_name: 'John Smith',
        attributes: { company_number: '12345678' },
      });
      const officer: CompaniesHouseOfficer = {
        name: 'John Smith',
        officer_role: 'director',
        links: { officer: { appointments: '/officers/12345678/appointments' } },
      };

      const { confidence, features } = computeOfficerMatchConfidence(entity, officer);

      expect(features.find((f) => f.feature === 'id_match')?.score).toBe(1.0);
      expect(confidence).toBeGreaterThan(0.7);
    });

    it('returns higher confidence with role match', () => {
      const entity = makeEntity({
        display_name: 'John Smith',
        attributes: { role: 'director' },
      });
      const officer: CompaniesHouseOfficer = {
        name: 'John Smith',
        officer_role: 'director',
      };

      const { confidence, features } = computeOfficerMatchConfidence(entity, officer);

      expect(features.find((f) => f.feature === 'role_match')?.score).toBe(1.0);
      expect(confidence).toBeGreaterThan(0.6);
    });

    it('returns low confidence for poor name match', () => {
      const entity = makeEntity({ display_name: 'Alice Brown' });
      const officer: CompaniesHouseOfficer = {
        name: 'Charlie Delta',
        officer_role: 'secretary',
      };

      const { confidence } = computeOfficerMatchConfidence(entity, officer);
      expect(confidence).toBeLessThan(0.2);
    });

    it('includes feature breakdown per R4.5', () => {
      const entity = makeEntity();
      const officer: CompaniesHouseOfficer = {
        name: 'John Smith',
        officer_role: 'director',
      };

      const { features } = computeOfficerMatchConfidence(entity, officer);

      expect(features).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ feature: 'name_match', weight: 0.50 }),
          expect.objectContaining({ feature: 'id_match', weight: 0.30 }),
          expect.objectContaining({ feature: 'role_match', weight: 0.20 }),
        ]),
      );
    });
  });

  describe('createCompaniesHouseModule', () => {
    it('has correct source and tier', () => {
      const module = createCompaniesHouseModule({ apiKey: 'test' });
      expect(module.source).toBe('companies_house');
      expect(module.tier).toBe(1);
    });

    it('returns empty array when API returns no results', async () => {
      // Mock fetch to return empty results
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [], total_results: 0 }),
      });

      try {
        const module = createCompaniesHouseModule({ apiKey: 'test' });
        const signals = await module.enrich(makeEntity());
        expect(signals).toEqual([]);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('returns structured signals from API results', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [
              {
                name: 'SMITH, John',
                officer_role: 'director',
                appointed_on: '2020-01-15',
                links: { officer: { appointments: '/officers/abc123/appointments' } },
              },
            ],
            total_results: 1,
          }),
      });

      try {
        const module = createCompaniesHouseModule({ apiKey: 'test' });
        const signals = await module.enrich(makeEntity());

        expect(signals).toHaveLength(1);
        expect(signals[0].source).toBe('companies_house');
        expect(signals[0].signal_type).toBe('company_officer');
        expect(signals[0].signal_payload.officer_name).toBe('SMITH, John');
        expect(signals[0].signal_payload.officer_role).toBe('director');
        expect(signals[0].match_features.length).toBeGreaterThan(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('throws on API error for retry handling', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: { get: () => null },
      });

      try {
        const module = createCompaniesHouseModule({ apiKey: 'test' });
        await expect(module.enrich(makeEntity())).rejects.toMatchObject({ status: 500 });
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});

// ===================================================================
// Charity Commission (F8.2-T2)
// ===================================================================

describe('Charity Commission module', () => {
  describe('computeTrusteeMatchConfidence', () => {
    it('returns high confidence for exact name and charity match', () => {
      const entity = makeEntity({
        display_name: 'John Smith',
        attributes: { charity_number: '1234567' },
      });
      const trustee: CharityTrustee = {
        trustee_name: 'John Smith',
        role: 'trustee',
      };
      const charity: CharitySearchResult = {
        charity_number: '1234567',
        charity_name: 'Test Charity',
      };

      const { confidence, features } = computeTrusteeMatchConfidence(entity, trustee, charity);

      expect(confidence).toBeGreaterThan(0.7);
      expect(features.find((f) => f.feature === 'name_match')?.score).toBe(1.0);
      expect(features.find((f) => f.feature === 'registration_match')?.score).toBe(1.0);
    });

    it('returns lower confidence without registration match', () => {
      const entity = makeEntity({ display_name: 'John Smith' });
      const trustee: CharityTrustee = {
        trustee_name: 'John Smith',
        role: 'trustee',
      };
      const charity: CharitySearchResult = {
        charity_number: '9999999',
        charity_name: 'Some Charity',
      };

      const { confidence } = computeTrusteeMatchConfidence(entity, trustee, charity);

      // No registration match, no org match
      expect(confidence).toBeLessThan(0.7);
    });

    it('includes org name overlap in features', () => {
      const entity = makeEntity({
        display_name: 'John Smith',
        attributes: { organisation: 'Big Charity Foundation' },
      });
      const trustee: CharityTrustee = { trustee_name: 'John Smith' };
      const charity: CharitySearchResult = {
        charity_number: '1111111',
        charity_name: 'Big Charity Foundation',
      };

      const { features } = computeTrusteeMatchConfidence(entity, trustee, charity);
      expect(features.find((f) => f.feature === 'org_match')?.score).toBeGreaterThan(0);
    });

    it('includes feature breakdown per R4.5', () => {
      const entity = makeEntity();
      const trustee: CharityTrustee = { trustee_name: 'John Smith' };
      const charity: CharitySearchResult = { charity_number: '1', charity_name: 'X' };

      const { features } = computeTrusteeMatchConfidence(entity, trustee, charity);
      expect(features).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ feature: 'name_match' }),
          expect.objectContaining({ feature: 'registration_match' }),
          expect.objectContaining({ feature: 'role_match' }),
          expect.objectContaining({ feature: 'org_match' }),
        ]),
      );
    });
  });

  describe('createCharityCommissionModule', () => {
    it('has correct source and tier', () => {
      const module = createCharityCommissionModule({});
      expect(module.source).toBe('charity_commission');
      expect(module.tier).toBe(1);
    });

    it('returns empty array when no charities found', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ charities: [], total_results: 0 }),
      });

      try {
        const module = createCharityCommissionModule({});
        const signals = await module.enrich(makeEntity());
        expect(signals).toEqual([]);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('returns trustee signals from API results', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            charities: [
              {
                charity_number: '1234567',
                charity_name: 'Test Charity',
                status: 'registered',
                trustees: [
                  {
                    trustee_name: 'John Smith',
                    trustee_id: 'tr_001',
                    role: 'trustee',
                    date_of_appointment: '2021-06-01',
                  },
                ],
              },
            ],
            total_results: 1,
          }),
      });

      try {
        const module = createCharityCommissionModule({});
        const signals = await module.enrich(makeEntity());

        expect(signals).toHaveLength(1);
        expect(signals[0].source).toBe('charity_commission');
        expect(signals[0].signal_type).toBe('charity_trustee');
        expect(signals[0].signal_payload.trustee_name).toBe('John Smith');
        expect(signals[0].signal_payload.charity_number).toBe('1234567');
        expect(signals[0].match_confidence).toBeGreaterThan(0);
        expect(signals[0].match_features.length).toBeGreaterThan(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});

// ===================================================================
// Wikidata (F8.3-T1)
// ===================================================================

describe('Wikidata module', () => {
  describe('computeWikidataMatchConfidence', () => {
    it('returns high confidence for exact name match with relevant description', () => {
      const entity = makeEntity({ display_name: 'John Smith', entity_type: 'person' });
      const hit: WikidataSearchHit = {
        id: 'Q12345',
        label: 'John Smith',
        description: 'British businessperson and philanthropist',
      };

      const { confidence, features } = computeWikidataMatchConfidence(entity, hit);

      expect(confidence).toBeGreaterThan(0.7);
      expect(features.find((f) => f.feature === 'name_match')?.score).toBe(1.0);
      expect(features.find((f) => f.feature === 'type_alignment')?.score).toBe(1.0);
    });

    it('returns lower confidence for name match without relevant description', () => {
      const entity = makeEntity({ display_name: 'John Smith' });
      const hit: WikidataSearchHit = {
        id: 'Q99999',
        label: 'John Smith',
        description: 'racing car driver from Australia',
      };

      const { confidence } = computeWikidataMatchConfidence(entity, hit);

      // Good name match but description not relevant to entity type
      expect(confidence).toBeGreaterThan(0.3);
      expect(confidence).toBeLessThan(0.8);
    });

    it('returns low confidence for poor name match', () => {
      const entity = makeEntity({ display_name: 'Alice Brown' });
      const hit: WikidataSearchHit = {
        id: 'Q11111',
        label: 'Charlie Delta',
      };

      const { confidence } = computeWikidataMatchConfidence(entity, hit);
      expect(confidence).toBeLessThan(0.2);
    });
  });

  describe('extractProperties', () => {
    it('extracts known properties from claims', () => {
      const wdEntity: WikidataEntity = {
        id: 'Q42',
        labels: { en: { value: 'Douglas Adams' } },
        descriptions: { en: { value: 'English author and humourist' } },
        claims: {
          [WIKIDATA_PROPERTIES.OCCUPATION]: [
            { mainsnak: { property: WIKIDATA_PROPERTIES.OCCUPATION, datavalue: { type: 'wikibase-entityid', value: { id: 'Q36180' } } } },
          ],
          [WIKIDATA_PROPERTIES.COUNTRY_OF_CITIZENSHIP]: [
            { mainsnak: { property: WIKIDATA_PROPERTIES.COUNTRY_OF_CITIZENSHIP, datavalue: { type: 'wikibase-entityid', value: { id: 'Q145' } } } },
          ],
        },
        sitelinks: {
          enwiki: { title: 'Douglas Adams', url: 'https://en.wikipedia.org/wiki/Douglas_Adams' },
        },
      };

      const props = extractProperties(wdEntity);

      expect(props.label).toBe('Douglas Adams');
      expect(props.description).toBe('English author and humourist');
      expect(props.occupation).toBeDefined();
      expect(props.country_of_citizenship).toBeDefined();
      expect(props.wikipedia_title).toBe('Douglas Adams');
      expect(props.wikipedia_url).toBe('https://en.wikipedia.org/wiki/Douglas_Adams');
    });

    it('returns empty object when no claims', () => {
      const wdEntity: WikidataEntity = { id: 'Q1' };
      expect(extractProperties(wdEntity)).toEqual({});
    });

    it('includes Wikipedia sitelink when present', () => {
      const wdEntity: WikidataEntity = {
        id: 'Q1',
        claims: {},
        sitelinks: { enwiki: { title: 'Test Article' } },
      };

      const props = extractProperties(wdEntity);
      expect(props.wikipedia_title).toBe('Test Article');
    });
  });

  describe('createWikidataModule', () => {
    it('has correct source and tier', () => {
      const module = createWikidataModule();
      expect(module.source).toBe('wikidata');
      expect(module.tier).toBe(2);
    });
  });
});

// ===================================================================
// Wikipedia (F8.3-T2)
// ===================================================================

describe('Wikipedia module', () => {
  describe('computeWikipediaMatchConfidence', () => {
    it('returns high confidence for matching title with relevant description', () => {
      const entity = makeEntity({ display_name: 'John Smith', entity_type: 'person' });
      const page: WikipediaSearchPage = {
        id: 100,
        key: 'John_Smith',
        title: 'John Smith',
        description: 'British businessperson born in London',
        excerpt: 'John Smith is a businessperson and philanthropist.',
      };

      const { confidence, features } = computeWikipediaMatchConfidence(entity, page);

      expect(confidence).toBeGreaterThan(0.7);
      expect(features.find((f) => f.feature === 'name_match')?.score).toBe(1.0);
    });

    it('returns lower confidence without description relevance', () => {
      const entity = makeEntity({ display_name: 'John Smith' });
      const page: WikipediaSearchPage = {
        id: 200,
        key: 'John_Smith_(footballer)',
        title: 'John Smith',
        description: 'footballer',
      };

      const { confidence } = computeWikipediaMatchConfidence(entity, page);
      // Good name match but limited type/desc relevance
      expect(confidence).toBeGreaterThan(0.3);
    });

    it('returns low confidence for poor name match', () => {
      const entity = makeEntity({ display_name: 'Alice Brown' });
      const page: WikipediaSearchPage = {
        id: 300,
        key: 'Charlie_Delta',
        title: 'Charlie Delta',
      };

      const { confidence } = computeWikipediaMatchConfidence(entity, page);
      expect(confidence).toBeLessThan(0.2);
    });
  });

  describe('createWikipediaModule', () => {
    it('has correct source and tier', () => {
      const module = createWikipediaModule();
      expect(module.source).toBe('wikipedia');
      expect(module.tier).toBe(2);
    });

    it('returns signals with summary extraction when API succeeds', async () => {
      const originalFetch = globalThis.fetch;
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Search call
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                pages: [
                  {
                    id: 100,
                    key: 'John_Smith',
                    title: 'John Smith',
                    description: 'British businessperson',
                  },
                ],
              }),
          });
        }
        // Summary call
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              title: 'John Smith',
              extract: 'John Smith is a notable British businessperson known for charitable work.',
              content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/John_Smith' } },
              timestamp: '2026-01-15T10:30:00Z',
            }),
        });
      });

      try {
        const module = createWikipediaModule();
        const signals = await module.enrich(makeEntity());

        expect(signals).toHaveLength(1);
        expect(signals[0].source).toBe('wikipedia');
        expect(signals[0].signal_type).toBe('wikipedia_summary');
        expect(signals[0].signal_payload.summary).toContain('notable British businessperson');
        expect(signals[0].signal_payload.url).toBe('https://en.wikipedia.org/wiki/John_Smith');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});

// ===================================================================
// News (F8.3-T3)
// ===================================================================

describe('News module', () => {
  describe('parseArticleDate', () => {
    it('parses ISO date string', () => {
      const date = parseArticleDate('2026-05-01T12:00:00Z');
      expect(date).toBeInstanceOf(Date);
      expect(date!.getFullYear()).toBe(2026);
    });

    it('returns null for undefined', () => {
      expect(parseArticleDate(undefined)).toBeNull();
    });

    it('returns null for unparseable string', () => {
      expect(parseArticleDate('not a date')).toBeNull();
    });
  });

  describe('computeFreshness', () => {
    const now = new Date('2026-05-18T00:00:00Z');

    it('returns 1.0 for article published today', () => {
      const score = computeFreshness(new Date('2026-05-18T00:00:00Z'), now);
      expect(score).toBe(1.0);
    });

    it('returns 0.5 for article halfway through window', () => {
      const halfwayDate = new Date(now.getTime() - (365 / 2) * 24 * 60 * 60 * 1000);
      const score = computeFreshness(halfwayDate, now);
      expect(score).toBeCloseTo(0.5, 1);
    });

    it('returns 0 for article older than window', () => {
      const oldDate = new Date('2024-01-01');
      const score = computeFreshness(oldDate, now);
      expect(score).toBe(0);
    });

    it('returns 0 for null date', () => {
      expect(computeFreshness(null, now)).toBe(0);
    });

    it('respects custom window', () => {
      const weekAgo = new Date(now.getTime() - 3.5 * 24 * 60 * 60 * 1000);
      const score = computeFreshness(weekAgo, now, 7);
      expect(score).toBeCloseTo(0.5, 1);
    });

    it('handles 7-day news TTL window correctly', () => {
      const sixDays = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      const eightDays = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);

      // 6 days old in 7-day window -> small but positive
      expect(computeFreshness(sixDays, now, 7)).toBeGreaterThan(0);
      // 8 days old in 7-day window -> 0
      expect(computeFreshness(eightDays, now, 7)).toBe(0);
    });
  });

  describe('computeNewsMatchConfidence', () => {
    const now = new Date('2026-05-18T00:00:00Z');

    it('returns high confidence for recent article with name in title', () => {
      const entity = makeEntity({ display_name: 'John Smith' });
      const article: NewsArticle = {
        title: 'John Smith appointed to board of major charity',
        link: 'https://news.example.com/article1',
        snippet: 'John Smith has been appointed as trustee',
        source: 'BBC News',
        date: '2026-05-17',
      };

      const { confidence, features } = computeNewsMatchConfidence(entity, article, now);

      expect(confidence).toBeGreaterThan(0.5);
      expect(features.find((f) => f.feature === 'name_in_title')?.score).toBeGreaterThan(0);
      expect(features.find((f) => f.feature === 'freshness')?.score).toBeGreaterThan(0.9);
      expect(features.find((f) => f.feature === 'source_credibility')?.score).toBe(1.0);
    });

    it('returns lower confidence for old article', () => {
      const entity = makeEntity({ display_name: 'John Smith' });
      const article: NewsArticle = {
        title: 'John Smith in the news',
        link: 'https://news.example.com/old',
        date: '2024-01-01', // very old
      };

      const { confidence } = computeNewsMatchConfidence(entity, article, now);
      // Freshness will be 0, dragging down overall confidence
      expect(confidence).toBeLessThan(0.5);
    });

    it('includes freshness in signal payload', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            news_results: [
              {
                title: 'John Smith charity donation',
                link: 'https://news.example.com/1',
                snippet: 'Smith donates to charity',
                source: 'The Guardian',
                date: '2026-05-17',
              },
            ],
          }),
      });

      try {
        const module = createNewsModule({ apiKey: 'test' });
        const signals = await module.enrich(makeEntity());

        expect(signals).toHaveLength(1);
        expect(signals[0].signal_payload.freshness_score).toBeGreaterThan(0);
        expect(signals[0].signal_payload.published_date).toBeTruthy();
        expect(signals[0].signal_payload.source_name).toBe('The Guardian');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('createNewsModule', () => {
    it('has correct source and tier', () => {
      const module = createNewsModule({ apiKey: 'test' });
      expect(module.source).toBe('news');
      expect(module.tier).toBe(2);
    });

    it('returns empty when no news results', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ news_results: [] }),
      });

      try {
        const module = createNewsModule({ apiKey: 'test' });
        const signals = await module.enrich(makeEntity());
        expect(signals).toEqual([]);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});

// ===================================================================
// Manual Research (F8.4-T1)
// ===================================================================

describe('Manual research module', () => {
  it('has correct source and tier', () => {
    const module = createManualResearchModule({
      requestedBy: 'reviewer@example.com',
    });
    expect(module.source).toBe('manual_research');
    expect(module.tier).toBe(3);
  });

  it('returns a manual_note signal with status manual_required', async () => {
    const module = createManualResearchModule({
      requestedBy: 'reviewer@example.com',
      researchNotes: 'Please verify board memberships',
      priority: 'high',
    });

    const signals = await module.enrich(makeEntity());

    expect(signals).toHaveLength(1);
    expect(signals[0].source).toBe('manual_research');
    expect(signals[0].signal_type).toBe('manual_note');
    expect(signals[0].signal_payload.status).toBe('manual_required');
    expect(signals[0].signal_payload.requested_by).toBe('reviewer@example.com');
    expect(signals[0].signal_payload.research_notes).toBe('Please verify board memberships');
    expect(signals[0].signal_payload.priority).toBe('high');
    expect(signals[0].match_confidence).toBe(0);
    expect(signals[0].match_features).toEqual([]);
  });

  it('defaults priority to medium', async () => {
    const module = createManualResearchModule({
      requestedBy: 'reviewer@example.com',
    });

    const signals = await module.enrich(makeEntity());
    expect(signals[0].signal_payload.priority).toBe('medium');
  });

  describe('completeManualResearch', () => {
    it('merges researcher findings into the signal', () => {
      const original = makeSignal({
        source: 'manual_research',
        signal_type: 'manual_note',
        signal_payload: { status: 'manual_required', requested_by: 'reviewer@example.com' },
        match_confidence: 0,
        match_features: [],
      });

      const completed = completeManualResearch(makeEntity(), original, {
        findings: 'Confirmed: serves on three charity boards',
        completedBy: 'researcher@example.com',
        completedAt: '2026-05-18T10:00:00Z',
        sourcesConsulted: ['Companies House', 'LinkedIn'],
      });

      expect(completed.signal_payload.status).toBe('completed');
      expect(completed.signal_payload.findings).toBe('Confirmed: serves on three charity boards');
      expect(completed.signal_payload.completed_by).toBe('researcher@example.com');
      expect(completed.signal_payload.sources_consulted).toEqual(['Companies House', 'LinkedIn']);
      expect(completed.match_confidence).toBe(0.90);
      expect(completed.match_features).toEqual([
        { feature: 'human_verified', weight: 1.0, score: 0.90 },
      ]);
    });
  });
});

// ===================================================================
// Ambiguous Match Handling (F8.4-T2, R4.6)
// ===================================================================

describe('Ambiguous match handling (R4.6)', () => {
  it('signals with confidence 0.55-0.74 are stored but not accepted for scoring', async () => {
    const registry = new EnrichmentRegistry();
    const cache = new EnrichmentCache();

    // Module that returns an ambiguous match
    const ambiguousModule = {
      source: 'companies_house' as const,
      tier: 1 as const,
      enrich: vi.fn().mockResolvedValue([
        makeSignal({
          match_confidence: 0.65,
          match_features: [{ feature: 'name_match', weight: 0.50, score: 0.60 }],
        }),
      ]),
    };
    registry.register(ambiguousModule);

    const result = await enrichCandidate(
      makeEntity(),
      ['companies_house'],
      registry,
      cache,
      { backoffDelays: [0] },
    );

    // Signal is stored
    expect(result.results[0].signals).toHaveLength(1);
    expect(result.results[0].state).toBe('ambiguous_match');
    // But NOT in accepted signals
    expect(result.acceptedSignals).toHaveLength(0);
  });

  it('signals at exactly 0.55 are treated as ambiguous', async () => {
    const registry = new EnrichmentRegistry();
    const cache = new EnrichmentCache();

    const module = {
      source: 'companies_house' as const,
      tier: 1 as const,
      enrich: vi.fn().mockResolvedValue([
        makeSignal({ match_confidence: 0.55 }),
      ]),
    };
    registry.register(module);

    const result = await enrichCandidate(
      makeEntity(),
      ['companies_house'],
      registry,
      cache,
      { backoffDelays: [0] },
    );

    expect(result.results[0].state).toBe('ambiguous_match');
    expect(result.acceptedSignals).toHaveLength(0);
  });

  it('signals at exactly 0.75 are accepted (not ambiguous)', async () => {
    const registry = new EnrichmentRegistry();
    const cache = new EnrichmentCache();

    const module = {
      source: 'companies_house' as const,
      tier: 1 as const,
      enrich: vi.fn().mockResolvedValue([
        makeSignal({ match_confidence: 0.75 }),
      ]),
    };
    registry.register(module);

    const result = await enrichCandidate(
      makeEntity(),
      ['companies_house'],
      registry,
      cache,
      { backoffDelays: [0] },
    );

    expect(result.results[0].state).toBe('matched');
    expect(result.acceptedSignals).toHaveLength(1);
  });

  it('signals below 0.55 are treated as no_result, not ambiguous', async () => {
    const registry = new EnrichmentRegistry();
    const cache = new EnrichmentCache();

    const module = {
      source: 'companies_house' as const,
      tier: 1 as const,
      enrich: vi.fn().mockResolvedValue([
        makeSignal({ match_confidence: 0.40 }),
      ]),
    };
    registry.register(module);

    const result = await enrichCandidate(
      makeEntity(),
      ['companies_house'],
      registry,
      cache,
      { backoffDelays: [0] },
    );

    expect(result.results[0].state).toBe('no_result');
    expect(result.acceptedSignals).toHaveLength(0);
  });

  it('mixed signals: only high-confidence ones are accepted', async () => {
    const registry = new EnrichmentRegistry();
    const cache = new EnrichmentCache();

    const module = {
      source: 'companies_house' as const,
      tier: 1 as const,
      enrich: vi.fn().mockResolvedValue([
        makeSignal({ match_confidence: 0.85, external_record_id: 'high' }),
        makeSignal({ match_confidence: 0.65, external_record_id: 'ambiguous' }),
      ]),
    };
    registry.register(module);

    const result = await enrichCandidate(
      makeEntity(),
      ['companies_house'],
      registry,
      cache,
      { backoffDelays: [0] },
    );

    // Has a high match so state is 'matched'
    expect(result.results[0].state).toBe('matched');
    // Both signals stored
    expect(result.results[0].signals).toHaveLength(2);
    // Only the high-confidence one is accepted
    expect(result.acceptedSignals).toHaveLength(1);
    expect(result.acceptedSignals[0].external_record_id).toBe('high');
  });
});

// ===================================================================
// Conflicting Signal Detection (F8.4-T3, R4.7)
// ===================================================================

describe('Conflicting signal detection (R4.7)', () => {
  it('detects source disagreement on same external record', () => {
    const signals = [
      makeSignal({
        source: 'companies_house',
        external_record_id: 'shared_001',
        match_confidence: 0.95,
      }),
      makeSignal({
        source: 'charity_commission',
        external_record_id: 'shared_001',
        match_confidence: 0.40,
      }),
    ];

    const conflicts = detectConflicts(signals);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('source_disagreement');
    expect(conflicts[0].severity).toBe('high');
    expect(conflicts[0].description).toContain('very different confidence');
  });

  it('does not flag small confidence gaps as conflicts', () => {
    const signals = [
      makeSignal({
        source: 'companies_house',
        external_record_id: 'shared_001',
        match_confidence: 0.80,
      }),
      makeSignal({
        source: 'charity_commission',
        external_record_id: 'shared_001',
        match_confidence: 0.75,
      }),
    ];

    const conflicts = detectConflicts(signals);
    expect(conflicts).toHaveLength(0);
  });

  it('detects name mismatch within same source at high confidence', () => {
    const signals = [
      makeSignal({
        source: 'companies_house',
        external_record_id: 'ext_A',
        match_confidence: 0.85,
        signal_payload: { officer_name: 'John Smith' },
      }),
      makeSignal({
        source: 'companies_house',
        external_record_id: 'ext_B',
        match_confidence: 0.80,
        signal_payload: { officer_name: 'Jane Doe' },
      }),
    ];

    const conflicts = detectConflicts(signals);

    expect(conflicts.some((c) => c.type === 'name_mismatch')).toBe(true);
    expect(conflicts.find((c) => c.type === 'name_mismatch')?.severity).toBe('high');
  });

  it('does not flag name mismatch at low confidence', () => {
    const signals = [
      makeSignal({
        source: 'companies_house',
        external_record_id: 'ext_A',
        match_confidence: 0.50, // below 0.75
        signal_payload: { officer_name: 'John Smith' },
      }),
      makeSignal({
        source: 'companies_house',
        external_record_id: 'ext_B',
        match_confidence: 0.50,
        signal_payload: { officer_name: 'Jane Doe' },
      }),
    ];

    const conflicts = detectConflicts(signals);
    expect(conflicts.some((c) => c.type === 'name_mismatch')).toBe(false);
  });

  it('detects conflicting dates of birth', () => {
    const signals = [
      makeSignal({
        source: 'companies_house',
        external_record_id: 'ext_A',
        signal_payload: { date_of_birth: { month: 3, year: 1970 } },
      }),
      makeSignal({
        source: 'companies_house',
        external_record_id: 'ext_B',
        signal_payload: { date_of_birth: { month: 8, year: 1975 } },
      }),
    ];

    const conflicts = detectConflicts(signals);

    expect(conflicts.some((c) => c.type === 'date_conflict')).toBe(true);
    expect(conflicts.find((c) => c.type === 'date_conflict')?.severity).toBe('high');
  });

  it('does not flag matching dates of birth', () => {
    const signals = [
      makeSignal({
        signal_payload: { date_of_birth: { month: 3, year: 1970 } },
      }),
      makeSignal({
        signal_payload: { date_of_birth: { month: 3, year: 1970 } },
      }),
    ];

    const conflicts = detectConflicts(signals);
    expect(conflicts.some((c) => c.type === 'date_conflict')).toBe(false);
  });

  it('detects conflicting registration numbers from same source', () => {
    const signals = [
      makeSignal({
        source: 'charity_commission',
        external_record_id: 'ext_A',
        match_confidence: 0.80,
        signal_payload: { charity_number: '1111111' },
      }),
      makeSignal({
        source: 'charity_commission',
        external_record_id: 'ext_B',
        match_confidence: 0.75,
        signal_payload: { charity_number: '2222222' },
      }),
    ];

    const conflicts = detectConflicts(signals);

    expect(conflicts.some((c) => c.type === 'registration_conflict')).toBe(true);
  });

  it('returns empty array when no conflicts exist', () => {
    const signals = [
      makeSignal({
        source: 'companies_house',
        external_record_id: 'ext_A',
        match_confidence: 0.85,
        signal_payload: { officer_name: 'John Smith' },
      }),
    ];

    const conflicts = detectConflicts(signals);
    expect(conflicts).toEqual([]);
  });

  it('handles empty signal array', () => {
    expect(detectConflicts([])).toEqual([]);
  });
});

// ===================================================================
// Match Confidence Feature Breakdown (R4.5)
// ===================================================================

describe('Match confidence feature breakdown (R4.5)', () => {
  it('every source module produces feature breakdown in signals', async () => {
    // Test that each module's confidence computation includes features
    const entity = makeEntity({ display_name: 'John Smith' });

    // Companies House
    const chOfficer: CompaniesHouseOfficer = { name: 'John Smith', officer_role: 'director' };
    const chResult = computeOfficerMatchConfidence(entity, chOfficer);
    expect(chResult.features.length).toBeGreaterThan(0);
    expect(chResult.features.every((f) => typeof f.feature === 'string')).toBe(true);
    expect(chResult.features.every((f) => typeof f.weight === 'number')).toBe(true);
    expect(chResult.features.every((f) => typeof f.score === 'number')).toBe(true);

    // Weights sum to ~1.0
    const chWeightSum = chResult.features.reduce((s, f) => s + f.weight, 0);
    expect(chWeightSum).toBeCloseTo(1.0, 5);

    // Charity Commission
    const ccResult = computeTrusteeMatchConfidence(
      entity,
      { trustee_name: 'John Smith' },
      { charity_number: '1', charity_name: 'Test' },
    );
    expect(ccResult.features.length).toBeGreaterThan(0);
    const ccWeightSum = ccResult.features.reduce((s, f) => s + f.weight, 0);
    expect(ccWeightSum).toBeCloseTo(1.0, 5);

    // Wikidata
    const wdResult = computeWikidataMatchConfidence(entity, {
      id: 'Q1',
      label: 'John Smith',
      description: 'person',
    });
    expect(wdResult.features.length).toBeGreaterThan(0);
    const wdWeightSum = wdResult.features.reduce((s, f) => s + f.weight, 0);
    expect(wdWeightSum).toBeCloseTo(1.0, 5);

    // Wikipedia
    const wpResult = computeWikipediaMatchConfidence(entity, {
      id: 1,
      key: 'test',
      title: 'John Smith',
    });
    expect(wpResult.features.length).toBeGreaterThan(0);
    const wpWeightSum = wpResult.features.reduce((s, f) => s + f.weight, 0);
    expect(wpWeightSum).toBeCloseTo(1.0, 5);

    // News
    const newsResult = computeNewsMatchConfidence(entity, {
      title: 'John Smith in news',
      link: 'https://example.com',
      date: '2026-05-18',
      source: 'BBC',
    });
    expect(newsResult.features.length).toBeGreaterThan(0);
    const newsWeightSum = newsResult.features.reduce((s, f) => s + f.weight, 0);
    expect(newsWeightSum).toBeCloseTo(1.0, 5);
  });

  it('confidence is between 0 and 1 for all modules', () => {
    const entity = makeEntity();

    const ch = computeOfficerMatchConfidence(entity, { name: 'John Smith', officer_role: 'director' });
    expect(ch.confidence).toBeGreaterThanOrEqual(0);
    expect(ch.confidence).toBeLessThanOrEqual(1);

    const cc = computeTrusteeMatchConfidence(entity, { trustee_name: 'Test' }, { charity_number: '1', charity_name: 'X' });
    expect(cc.confidence).toBeGreaterThanOrEqual(0);
    expect(cc.confidence).toBeLessThanOrEqual(1);

    const wd = computeWikidataMatchConfidence(entity, { id: 'Q1', label: 'Test' });
    expect(wd.confidence).toBeGreaterThanOrEqual(0);
    expect(wd.confidence).toBeLessThanOrEqual(1);

    const wp = computeWikipediaMatchConfidence(entity, { id: 1, key: 't', title: 'Test' });
    expect(wp.confidence).toBeGreaterThanOrEqual(0);
    expect(wp.confidence).toBeLessThanOrEqual(1);

    const news = computeNewsMatchConfidence(entity, { title: 'Test', link: 'x' });
    expect(news.confidence).toBeGreaterThanOrEqual(0);
    expect(news.confidence).toBeLessThanOrEqual(1);
  });
});

// ===================================================================
// Integration: Tier gating (F8.3-T4)
// ===================================================================

describe('Tier gating via filterSourcesByPriority (F8.3-T4)', () => {
  it('includes wikipedia in Tier 2 sources above threshold', () => {
    const all: Parameters<typeof filterSourcesByPriority>[0] = [
      'companies_house',
      'charity_commission',
      'wikidata',
      'wikipedia',
      'news',
    ];

    const filtered = filterSourcesByPriority(all, 0.60);
    expect(filtered).toContain('wikipedia');
    expect(filtered).toContain('wikidata');
    expect(filtered).toContain('news');
  });

  it('excludes wikipedia from Tier 2 below threshold', () => {
    const all: Parameters<typeof filterSourcesByPriority>[0] = [
      'companies_house',
      'charity_commission',
      'wikidata',
      'wikipedia',
      'news',
    ];

    const filtered = filterSourcesByPriority(all, 0.40);
    expect(filtered).not.toContain('wikipedia');
    expect(filtered).not.toContain('wikidata');
    expect(filtered).not.toContain('news');
    // Tier 1 still included
    expect(filtered).toContain('companies_house');
    expect(filtered).toContain('charity_commission');
  });

  it('excludes manual_research from automatic enrichment', () => {
    const all: Parameters<typeof filterSourcesByPriority>[0] = [
      'companies_house',
      'manual_research',
    ];

    const filtered = filterSourcesByPriority(all, 1.0);
    expect(filtered).not.toContain('manual_research');
  });
});
