/**
 * Barrel export for all enrichment source modules (F8.2–F8.4).
 */

// Tier 1
export {
  createCompaniesHouseModule,
  type CompaniesHouseConfig,
  type CompaniesHouseOfficer,
  type CompaniesHouseSearchResult,
  type CompaniesHouseCompany,
  computeOfficerMatchConfidence,
  searchOfficers,
  getCompany,
  normaliseName,
  nameTokenOverlap,
} from './companies-house';

export {
  createCharityCommissionModule,
  type CharityCommissionConfig,
  type CharityTrustee,
  type CharitySearchResult,
  type CharitySearchResponse,
  computeTrusteeMatchConfidence,
  searchCharities,
  getCharityTrustees,
} from './charity-commission';

// Tier 2
export {
  createWikidataModule,
  type WikidataConfig,
  type WikidataSearchHit,
  type WikidataSearchResponse,
  type WikidataEntity,
  type WikidataClaim,
  WIKIDATA_PROPERTIES,
  computeWikidataMatchConfidence,
  extractProperties,
  searchWikidata,
  getWikidataEntity,
} from './wikidata';

export {
  createWikipediaModule,
  type WikipediaConfig,
  type WikipediaSummary,
  type WikipediaSearchResult,
  type WikipediaSearchPage,
  computeWikipediaMatchConfidence,
  searchWikipedia,
  getArticleSummary,
} from './wikipedia';

export {
  createNewsModule,
  type NewsConfig,
  type NewsArticle,
  type NewsSearchResponse,
  computeNewsMatchConfidence,
  parseArticleDate,
  computeFreshness,
  searchNews,
} from './news';

// Tier 3
export {
  createManualResearchModule,
  completeManualResearch,
  type ManualResearchRequest,
  type ManualResearchResult,
} from './manual-research';
