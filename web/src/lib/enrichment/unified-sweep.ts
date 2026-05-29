/**
 * Unified Enrichment Sweep — fuses government registry data with real-time
 * web augmentation in a single pass per entity.
 *
 * Every discovery (directorship, trusteeship, donation, article) is stored
 * as graph nodes and edges, increasing information density for that person.
 *
 * Architecture: Layer A (gov APIs) → Layer B (LLM + web + news) → Layer C (agents)
 * Each layer receives the previous layer's output as context.
 */

import type { CanonicalEntity } from '@/types/database';
import type {
  EnrichmentSource,
  GraphEnrichmentSignal,
  DiscoveredRelationship,
  DiscoveredArticle,
  UnifiedSweepResult,
  WealthBand,
} from './types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { persistSweepToGraph, type PersistSweepResult } from '@/lib/graph/sweep-persist';
import { harvestCoDirectors, type CoDirectorRecord } from './co-director-harvester';
import { runLlmWebSearch as executeLlmWebSearch } from './llm-web-search';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface UnifiedSweepConfig {
  companiesHouse: { apiKey: string; baseUrl?: string };
  charityCommission: { bulkDataPath?: string; apiKey?: string };
  electoralCommission: { baseUrl?: string };
  threesSixtyGiving: { baseUrl?: string };
  fcaRegister: { baseUrl?: string };
  landRegistry: { dataPath?: string };
  gdelt: { baseUrl?: string };
  guardian: { apiKey?: string; baseUrl?: string };
  forbes: { baseUrl?: string };
  llm?: { apiKey?: string; model?: string };
}

const DEFAULTS = {
  companiesHouse: 'https://api.company-information.service.gov.uk',
  electoralCommission: 'https://search.electoralcommission.org.uk/api',
  threeSixtyGiving: 'https://api.threesixtygiving.org/api/v1',
  gdelt: 'https://api.gdeltproject.org/api/v2/doc/doc',
  guardian: 'https://content.guardianapis.com/search',
  forbes: 'https://raw.githubusercontent.com/komed3/rtb-api/main/data',
  fca: 'https://register.fca.org.uk/services/V0.1',
};

// ---------------------------------------------------------------------------
// Layer A: Government Registry Sweep
// ---------------------------------------------------------------------------

export interface LayerAResult {
  signals: GraphEnrichmentSignal[];
  directorships: DirectorshipRecord[];
  trusteeships: TrusteeshipRecord[];
  politicalDonations: DonationRecord[];
  grantLinks: GrantRecord[];
  fcaRoles: FcaRecord[];
  coDirectors: CoDirectorRecord[];
}

export interface DirectorshipRecord {
  officer_name: string;
  company_name: string;
  company_number: string;
  role: string;
  appointed_on?: string;
  resigned_on?: string;
  sic_codes?: string[];
  company_status?: string;
  is_psc?: boolean;
  psc_nature_of_control?: string[];
}

export interface TrusteeshipRecord {
  trustee_name: string;
  charity_name: string;
  charity_number: string;
  charity_income?: number;
  charity_classification?: string[];
  date_of_appointment?: string;
}

export interface DonationRecord {
  donor_name: string;
  recipient: string;
  value: number;
  currency: string;
  accepted_date: string;
  donation_type: string;
}

export interface GrantRecord {
  funder_name: string;
  funder_id: string;
  recipient_name: string;
  recipient_id: string;
  amount: number;
  currency: string;
  award_date: string;
  programme?: string;
}

export interface FcaRecord {
  name: string;
  firm_name: string;
  role: string;
  status: string;
}

/**
 * Layer A: Query all government registries for an entity.
 * Returns structured records + graph-ready signals.
 */
export async function runLayerA(
  entity: CanonicalEntity,
  config: UnifiedSweepConfig,
): Promise<LayerAResult> {
  const signals: GraphEnrichmentSignal[] = [];
  const directorships: DirectorshipRecord[] = [];
  const trusteeships: TrusteeshipRecord[] = [];
  const politicalDonations: DonationRecord[] = [];
  const grantLinks: GrantRecord[] = [];
  const fcaRoles: FcaRecord[] = [];

  const name = entity.display_name;

  // A1: Companies House officer search + A2: PSC + A3: company profiles
  const chResults = await fetchCompaniesHouse(name, config);
  for (const d of chResults) {
    directorships.push(d);
    const relationships: DiscoveredRelationship[] = [
      {
        target_name: d.company_name,
        target_entity_type: 'company',
        relationship_type: d.is_psc ? 'PSC_OF' : `DIRECTOR_OF`,
        confidence: 0.95,
        source_layer: 'A',
        evidence_url: `https://find-and-update.company-information.service.gov.uk/company/${d.company_number}`,
        evidence_text: `${d.role} of ${d.company_name} (${d.company_number})`,
      },
    ];
    signals.push({
      source: d.is_psc ? 'companies_house_psc' : 'companies_house',
      signal_type: d.is_psc ? 'company_psc' : 'company_officer',
      external_record_id: `ch_${d.company_number}_${d.role}`,
      signal_payload: { ...d },
      match_confidence: 0.95,
      match_features: [{ feature: 'gov_registry', weight: 1.0, score: 0.95 }],
      discovered_relationships: relationships,
      discovered_articles: [],
    });
  }

  // A4: Charity Commission bulk trustee match
  const ccResults = await fetchCharityCommissionBulk(name, config);
  for (const t of ccResults) {
    trusteeships.push(t);
    signals.push({
      source: 'charity_commission_bulk',
      signal_type: 'charity_trustee',
      external_record_id: `cc_${t.charity_number}_trustee`,
      signal_payload: { ...t },
      match_confidence: 0.90,
      match_features: [{ feature: 'bulk_name_match', weight: 1.0, score: 0.90 }],
      discovered_relationships: [
        {
          target_name: t.charity_name,
          target_entity_type: 'charity',
          relationship_type: 'TRUSTEE_OF',
          confidence: 0.90,
          source_layer: 'A',
          evidence_url: `https://register-of-charities.charitycommission.gov.uk/charity-search/-/charity-details/${t.charity_number}`,
          evidence_text: `Trustee of ${t.charity_name} (${t.charity_number})`,
        },
      ],
      discovered_articles: [],
    });
  }

  // A5: Electoral Commission donations
  const ecResults = await fetchElectoralCommission(name, config);
  for (const d of ecResults) {
    politicalDonations.push(d);
    signals.push({
      source: 'electoral_commission',
      signal_type: 'political_donation',
      external_record_id: `ec_${d.accepted_date}_${d.value}`,
      signal_payload: { ...d },
      match_confidence: 0.85,
      match_features: [{ feature: 'name_search', weight: 1.0, score: 0.85 }],
      discovered_relationships: [
        {
          target_name: d.recipient,
          target_entity_type: 'organisation',
          relationship_type: 'DONATED_TO',
          confidence: 0.95,
          source_layer: 'A',
          evidence_url: 'https://search.electoralcommission.org.uk/',
          evidence_text: `£${d.value.toLocaleString()} donation to ${d.recipient} on ${d.accepted_date}`,
        },
      ],
      discovered_articles: [],
    });
  }

  // A6: 360Giving grant network
  const grantResults = await fetch360Giving(trusteeships, config);
  for (const g of grantResults) {
    grantLinks.push(g);
    signals.push({
      source: '360giving',
      signal_type: g.funder_id.includes(entity.canonical_entity_id) ? 'grant_made' : 'grant_received',
      external_record_id: `360g_${g.funder_id}_${g.recipient_id}_${g.award_date}`,
      signal_payload: { ...g },
      match_confidence: 0.80,
      match_features: [{ feature: 'org_trustee_link', weight: 1.0, score: 0.80 }],
      discovered_relationships: [
        {
          target_name: g.recipient_name,
          target_entity_type: 'charity',
          relationship_type: 'GOVERNS_FUNDER_OF',
          via_organisation: g.funder_name,
          confidence: 0.80,
          source_layer: 'A',
          evidence_text: `${g.funder_name} granted £${g.amount.toLocaleString()} to ${g.recipient_name}`,
        },
      ],
      discovered_articles: [],
    });
  }

  // A7: FCA Register
  const fcaResults = await fetchFcaRegister(name, config);
  for (const f of fcaResults) {
    fcaRoles.push(f);
    signals.push({
      source: 'fca_register',
      signal_type: 'fca_approved_person',
      external_record_id: `fca_${f.firm_name}_${f.role}`,
      signal_payload: { ...f },
      match_confidence: 0.85,
      match_features: [{ feature: 'name_search', weight: 1.0, score: 0.85 }],
      discovered_relationships: [
        {
          target_name: f.firm_name,
          target_entity_type: 'company',
          relationship_type: 'APPROVED_PERSON_AT',
          confidence: 0.85,
          source_layer: 'A',
          evidence_text: `${f.role} at ${f.firm_name} (FCA Register)`,
        },
      ],
      discovered_articles: [],
    });
  }

  // A+: Harvest co-directors from every company found above
  const coDirectorResult = await harvestCoDirectors(name, directorships, config);
  signals.push(...coDirectorResult.signals);

  return {
    signals, directorships, trusteeships, politicalDonations, grantLinks, fcaRoles,
    coDirectors: coDirectorResult.coDirectors,
  };
}

// ---------------------------------------------------------------------------
// Layer B: Web Augmentation (runs for EVERY entity, receives Layer A output)
// ---------------------------------------------------------------------------

export interface LayerBResult {
  signals: GraphEnrichmentSignal[];
  articles: DiscoveredArticle[];
  richListEntry: RichListEntry | null;
}

export interface RichListEntry {
  name: string;
  net_worth_usd: number;
  rank: number;
  source: string;
  year: number;
}

/**
 * Layer B: Web augmentation — searches news, articles, Rich List for the entity.
 * Receives Layer A output so it can search for context around known directorships
 * and trusteeships (e.g., "Stuart Roden Lansdowne Partners philanthropy").
 */
export async function runLayerB(
  entity: CanonicalEntity,
  layerA: LayerAResult,
  config: UnifiedSweepConfig,
): Promise<LayerBResult> {
  const signals: GraphEnrichmentSignal[] = [];
  const allArticles: DiscoveredArticle[] = [];
  const name = entity.display_name;

  // B1: GDELT news search — search name and top affiliations
  const searchTerms = buildSearchTerms(name, layerA);
  for (const term of searchTerms) {
    const articles = await fetchGdelt(term, config);
    for (const article of articles) {
      allArticles.push(article);
    }
  }

  if (allArticles.length > 0) {
    signals.push({
      source: 'gdelt',
      signal_type: 'news_article',
      external_record_id: `gdelt_${name}_${allArticles.length}`,
      signal_payload: { article_count: allArticles.length, terms_searched: searchTerms },
      match_confidence: 0.70,
      match_features: [{ feature: 'name_in_article', weight: 1.0, score: 0.70 }],
      discovered_relationships: [],
      discovered_articles: allArticles,
    });
  }

  // B2: Guardian archive search
  const guardianArticles = await fetchGuardian(name, config);
  for (const article of guardianArticles) {
    allArticles.push(article);
  }

  if (guardianArticles.length > 0) {
    signals.push({
      source: 'guardian',
      signal_type: 'news_article',
      external_record_id: `guardian_${name}_${guardianArticles.length}`,
      signal_payload: { article_count: guardianArticles.length },
      match_confidence: 0.75,
      match_features: [{ feature: 'name_in_article', weight: 1.0, score: 0.75 }],
      discovered_relationships: [],
      discovered_articles: guardianArticles,
    });
  }

  // B3: Forbes / Rich List check
  const richListEntry = await fetchForbes(name, config);
  if (richListEntry) {
    signals.push({
      source: 'forbes',
      signal_type: 'rich_list_entry',
      external_record_id: `forbes_${richListEntry.name}_${richListEntry.year}`,
      signal_payload: { ...richListEntry },
      match_confidence: 0.90,
      match_features: [{ feature: 'name_match', weight: 1.0, score: 0.90 }],
      discovered_relationships: [],
      discovered_articles: [],
    });
  }

  // B4: Wikidata SPARQL for notable properties
  const wikiSignals = await fetchWikidata(name, config);
  if (wikiSignals.length > 0) {
    signals.push(...wikiSignals);
  }

  // B5: LLM web search — MANDATORY for every entity
  if (config.llm?.apiKey) {
    const llmSignals = await executeLlmWebSearch(entity, layerA, allArticles, {
      apiKey: config.llm.apiKey,
      model: config.llm.model,
    });
    signals.push(...llmSignals);
  }

  return { signals, articles: allArticles, richListEntry };
}

// ---------------------------------------------------------------------------
// Wealth Band Calculation
// ---------------------------------------------------------------------------

export interface WealthAssessment {
  band: WealthBand;
  score: number;
  evidence: WealthEvidence[];
  confidence: number;
}

export interface WealthEvidence {
  signal: string;
  source_layer: 'A' | 'B' | 'C';
  contribution: number;
  detail: string;
}

export function calculateWealthBand(
  layerA: LayerAResult,
  layerB: LayerBResult,
): WealthAssessment {
  const evidence: WealthEvidence[] = [];
  let score = 0;

  // Directorship count (max 0.15)
  const activeDirectorships = layerA.directorships.filter(d => !d.resigned_on).length;
  const dirScore = Math.min(activeDirectorships * 0.015, 0.15);
  if (activeDirectorships > 0) {
    evidence.push({
      signal: 'active_directorships',
      source_layer: 'A',
      contribution: dirScore,
      detail: `${activeDirectorships} active directorships`,
    });
  }
  score += dirScore;

  // PSC significant control (max 0.20)
  const pscCount = layerA.directorships.filter(d => d.is_psc).length;
  const pscScore = Math.min(pscCount * 0.05, 0.20);
  if (pscCount > 0) {
    evidence.push({
      signal: 'psc_control',
      source_layer: 'A',
      contribution: pscScore,
      detail: `PSC of ${pscCount} companies`,
    });
  }
  score += pscScore;

  // Company types — fund management, property, investment (max 0.15)
  const highValueSics = layerA.directorships.filter(d =>
    d.sic_codes?.some(s => ['66300', '64205', '68100', '68209', '64910'].includes(s))
  ).length;
  const sicScore = Math.min(highValueSics * 0.05, 0.15);
  if (highValueSics > 0) {
    evidence.push({
      signal: 'high_value_company_types',
      source_layer: 'A',
      contribution: sicScore,
      detail: `${highValueSics} fund mgmt / property / investment companies`,
    });
  }
  score += sicScore;

  // Political donations total (max 0.15)
  const totalDonations = layerA.politicalDonations.reduce((sum, d) => sum + d.value, 0);
  let donScore = 0;
  if (totalDonations >= 100000) donScore = 0.15;
  else if (totalDonations >= 25000) donScore = 0.10;
  else if (totalDonations >= 5000) donScore = 0.05;
  if (totalDonations > 0) {
    evidence.push({
      signal: 'political_donations',
      source_layer: 'A',
      contribution: donScore,
      detail: `£${totalDonations.toLocaleString()} total political donations`,
    });
  }
  score += donScore;

  // Charity income governed (max 0.15)
  const totalCharityIncome = layerA.trusteeships.reduce((sum, t) => sum + (t.charity_income ?? 0), 0);
  let charityScore = 0;
  if (totalCharityIncome >= 10_000_000) charityScore = 0.15;
  else if (totalCharityIncome >= 1_000_000) charityScore = 0.10;
  else if (totalCharityIncome >= 100_000) charityScore = 0.05;
  if (totalCharityIncome > 0) {
    evidence.push({
      signal: 'charity_income_governed',
      source_layer: 'A',
      contribution: charityScore,
      detail: `£${totalCharityIncome.toLocaleString()} total charity income governed`,
    });
  }
  score += charityScore;

  // Foundation/trust involvement (max 0.10)
  const foundationCount = layerA.trusteeships.length;
  const foundScore = Math.min(foundationCount * 0.025, 0.10);
  if (foundationCount > 0) {
    evidence.push({
      signal: 'foundation_involvement',
      source_layer: 'A',
      contribution: foundScore,
      detail: `Trustee of ${foundationCount} charities`,
    });
  }
  score += foundScore;

  // FCA roles — financial services (max 0.05)
  if (layerA.fcaRoles.length > 0) {
    const fcaScore = 0.05;
    evidence.push({
      signal: 'fca_roles',
      source_layer: 'A',
      contribution: fcaScore,
      detail: `${layerA.fcaRoles.length} FCA approved person roles`,
    });
    score += fcaScore;
  }

  // Layer B: Rich List entry (max 0.20)
  if (layerB.richListEntry) {
    const rlScore = 0.20;
    evidence.push({
      signal: 'rich_list',
      source_layer: 'B',
      contribution: rlScore,
      detail: `${layerB.richListEntry.source}: rank #${layerB.richListEntry.rank}, $${(layerB.richListEntry.net_worth_usd / 1e6).toFixed(0)}M`,
    });
    score += rlScore;
  }

  // Layer B: News coverage density (max 0.05)
  const articleCount = layerB.articles.length;
  if (articleCount >= 5) {
    const newsScore = 0.05;
    evidence.push({
      signal: 'media_coverage',
      source_layer: 'B',
      contribution: newsScore,
      detail: `${articleCount} news articles found`,
    });
    score += newsScore;
  }

  // Layer B: Web search wealth signals (max 0.15)
  const webWealthSignals = layerB.signals.filter(
    s => s.source === 'web_search' &&
         s.signal_payload &&
         (s.signal_payload as Record<string, unknown>).finding_type === 'wealth_signal',
  );
  if (webWealthSignals.length > 0) {
    const wsScore = Math.min(webWealthSignals.length * 0.05, 0.15);
    evidence.push({
      signal: 'web_search_wealth',
      source_layer: 'B',
      contribution: wsScore,
      detail: `${webWealthSignals.length} wealth signals from web search`,
    });
    score += wsScore;
  }

  // Layer A: Co-director network density (max 0.10)
  const coDirectorCount = layerA.coDirectors?.length ?? 0;
  if (coDirectorCount >= 5) {
    const cdScore = Math.min(coDirectorCount * 0.005, 0.10);
    evidence.push({
      signal: 'co_director_network',
      source_layer: 'A',
      contribution: cdScore,
      detail: `${coDirectorCount} co-directors across companies`,
    });
    score += cdScore;
  }

  score = Math.min(score, 1.0);

  let band: WealthBand;
  if (score >= 0.80) band = '100m_plus';
  else if (score >= 0.65) band = '25m_100m';
  else if (score >= 0.45) band = '5m_25m';
  else if (score >= 0.25) band = '1m_5m';
  else band = 'unknown';

  const confidence = Math.min(0.5 + evidence.length * 0.05, 0.95);

  return { band, score, evidence, confidence };
}

// ---------------------------------------------------------------------------
// Unified Sweep Orchestrator
// ---------------------------------------------------------------------------

export async function runUnifiedSweep(
  entity: CanonicalEntity,
  config: UnifiedSweepConfig,
): Promise<UnifiedSweepResult> {
  // Layer A: Government registries
  const layerA = await runLayerA(entity, config);

  // Layer B: Web augmentation (receives A's output for targeted search)
  const layerB = await runLayerB(entity, layerA, config);

  // Compute wealth band from A + B
  const wealth = calculateWealthBand(layerA, layerB);

  // Merge all signals
  const allSignals = [...layerA.signals, ...layerB.signals];

  // Count totals
  const totalRelationships = allSignals.reduce(
    (sum, s) => sum + s.discovered_relationships.length, 0
  );
  const totalArticles = allSignals.reduce(
    (sum, s) => sum + s.discovered_articles.length, 0
  );

  return {
    entity_id: entity.canonical_entity_id,
    entity_name: entity.display_name,
    signals: allSignals,
    total_relationships_discovered: totalRelationships,
    total_articles_discovered: totalArticles,
    wealth_band: wealth.band,
    layers_completed: ['A', 'B'],
  };
}

/**
 * Run the full sweep AND persist all discoveries to the graph database.
 * This is the main entry point for the seed pipeline — one call does everything.
 */
export async function runAndPersistSweep(
  entity: CanonicalEntity,
  config: UnifiedSweepConfig,
  supabase: SupabaseClient<any, any, any>,
  runId?: string,
): Promise<{ sweep: UnifiedSweepResult; persist: PersistSweepResult }> {
  const layerA = await runLayerA(entity, config);
  const layerB = await runLayerB(entity, layerA, config);
  const wealth = calculateWealthBand(layerA, layerB);

  const allSignals = [...layerA.signals, ...layerB.signals];
  const totalRelationships = allSignals.reduce(
    (sum, s) => sum + s.discovered_relationships.length, 0,
  );
  const totalArticles = allSignals.reduce(
    (sum, s) => sum + s.discovered_articles.length, 0,
  );

  const sweep: UnifiedSweepResult = {
    entity_id: entity.canonical_entity_id,
    entity_name: entity.display_name,
    signals: allSignals,
    total_relationships_discovered: totalRelationships,
    total_articles_discovered: totalArticles,
    wealth_band: wealth.band,
    layers_completed: ['A', 'B'],
  };

  const persist = await persistSweepToGraph(supabase, sweep, wealth, { runId });

  return { sweep, persist };
}

// ---------------------------------------------------------------------------
// Helper: build search terms from Layer A findings for Layer B
// ---------------------------------------------------------------------------

function buildSearchTerms(name: string, layerA: LayerAResult): string[] {
  const terms = [`"${name}"`];

  // Add top affiliation for targeted search
  const topCompany = layerA.directorships
    .filter(d => !d.resigned_on)
    .sort((a, b) => (b.sic_codes?.length ?? 0) - (a.sic_codes?.length ?? 0))[0];
  if (topCompany) {
    terms.push(`"${name}" "${topCompany.company_name}"`);
  }

  const topCharity = layerA.trusteeships
    .sort((a, b) => (b.charity_income ?? 0) - (a.charity_income ?? 0))[0];
  if (topCharity) {
    terms.push(`"${name}" philanthropy`);
  }

  return terms.slice(0, 3);
}

// ---------------------------------------------------------------------------
// API Fetch Stubs — these call real endpoints when API keys are configured
// ---------------------------------------------------------------------------

async function fetchCompaniesHouse(
  name: string,
  config: UnifiedSweepConfig,
): Promise<DirectorshipRecord[]> {
  const baseUrl = config.companiesHouse.baseUrl ?? DEFAULTS.companiesHouse;
  const url = `${baseUrl}/search/officers?q=${encodeURIComponent(name)}&items_per_page=20`;

  const response = await fetch(url, {
    headers: { Authorization: `Basic ${btoa(config.companiesHouse.apiKey + ':')}` },
  });

  if (!response.ok) return [];

  const data = await response.json() as { items?: Array<Record<string, unknown>> };
  if (!data.items) return [];

  const records: DirectorshipRecord[] = [];
  for (const item of data.items) {
    const officerName = item.name as string ?? '';
    const appointmentsLink = (item.links as Record<string, Record<string, string>>)?.officer?.appointments;
    if (!appointmentsLink) continue;

    // Fetch appointments for this officer
    const apptUrl = `${baseUrl}${appointmentsLink}?items_per_page=50`;
    const apptResponse = await fetch(apptUrl, {
      headers: { Authorization: `Basic ${btoa(config.companiesHouse.apiKey + ':')}` },
    });
    if (!apptResponse.ok) continue;

    const apptData = await apptResponse.json() as { items?: Array<Record<string, unknown>> };
    for (const appt of apptData.items ?? []) {
      records.push({
        officer_name: officerName,
        company_name: (appt.appointed_to as Record<string, string>)?.company_name ?? '',
        company_number: (appt.appointed_to as Record<string, string>)?.company_number ?? '',
        role: appt.officer_role as string ?? '',
        appointed_on: appt.appointed_on as string,
        resigned_on: appt.resigned_on as string,
        company_status: (appt.appointed_to as Record<string, string>)?.company_status,
      });
    }
    break; // Only process the best match
  }

  return records;
}

async function fetchCharityCommissionBulk(
  _name: string,
  _config: UnifiedSweepConfig,
): Promise<TrusteeshipRecord[]> {
  // In production, this queries the CC bulk data loaded into Supabase.
  // SELECT ct.*, c.income, c.classification
  // FROM app.cc_trustees ct
  // JOIN app.cc_charities c ON ct.charity_number = c.charity_number
  // WHERE similarity(ct.trustee_name, $1) > 0.6
  return [];
}

async function fetchElectoralCommission(
  name: string,
  _config: UnifiedSweepConfig,
): Promise<DonationRecord[]> {
  const lastName = name.split(' ').pop() ?? name;
  const url = `https://search.electoralcommission.org.uk/api/csv/Donations?query=${encodeURIComponent(lastName)}&rows=50&sort=Value&order=desc`;

  try {
    const response = await fetch(url);
    if (!response.ok) return [];

    const csv = await response.text();
    const lines = csv.split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    const donorIdx = headers.indexOf('DonorName');
    const valueIdx = headers.indexOf('Value');
    const dateIdx = headers.indexOf('AcceptedDate');
    const partyIdx = headers.indexOf('RegulatedEntityName');
    const typeIdx = headers.indexOf('DonationType');

    if (donorIdx < 0 || valueIdx < 0) return [];

    const records: DonationRecord[] = [];
    const nameLower = name.toLowerCase();

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.replace(/"/g, '').trim());
      const donorName = cols[donorIdx] ?? '';
      if (!donorName.toLowerCase().includes(nameLower.split(' ')[0].toLowerCase())) continue;

      const value = parseFloat((cols[valueIdx] ?? '0').replace(/,/g, ''));
      if (isNaN(value)) continue;

      records.push({
        donor_name: donorName,
        recipient: cols[partyIdx] ?? '',
        value,
        currency: 'GBP',
        accepted_date: cols[dateIdx] ?? '',
        donation_type: cols[typeIdx] ?? 'Unknown',
      });
    }

    return records;
  } catch {
    return [];
  }
}

async function fetch360Giving(
  trusteeships: TrusteeshipRecord[],
  _config: UnifiedSweepConfig,
): Promise<GrantRecord[]> {
  const records: GrantRecord[] = [];

  for (const t of trusteeships.slice(0, 5)) {
    const orgId = `GB-CHC-${t.charity_number}`;
    const url = `https://api.threesixtygiving.org/api/v1/org/${orgId}/grants_made/`;

    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) continue;

      const data = await response.json() as { grants?: Array<Record<string, unknown>> };
      for (const grant of (data.grants ?? []).slice(0, 10)) {
        const recipient = grant.recipientOrganization as Record<string, string> | undefined;
        records.push({
          funder_name: t.charity_name,
          funder_id: orgId,
          recipient_name: recipient?.name ?? 'Unknown',
          recipient_id: recipient?.id ?? '',
          amount: (grant.amountAwarded as number) ?? 0,
          currency: (grant.currency as string) ?? 'GBP',
          award_date: (grant.awardDate as string) ?? '',
          programme: (grant.grantProgramme as Array<Record<string, string>>)?.[0]?.title,
        });
      }
    } catch {
      continue;
    }
  }

  return records;
}

async function fetchFcaRegister(
  _name: string,
  _config: UnifiedSweepConfig,
): Promise<FcaRecord[]> {
  // FCA register search — requires navigating their search UI or using the
  // data extract service. Stub for now.
  return [];
}

async function fetchGdelt(
  searchTerm: string,
  _config: UnifiedSweepConfig,
): Promise<DiscoveredArticle[]> {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(searchTerm)}&mode=artlist&maxrecords=10&format=json`;

  try {
    const response = await fetch(url);
    if (!response.ok) return [];

    const data = await response.json() as { articles?: Array<Record<string, string>> };
    return (data.articles ?? []).map(a => ({
      url: a.url ?? '',
      title: a.title ?? '',
      source_name: a.domain ?? 'unknown',
      published_date: a.seendate ?? undefined,
      excerpt: undefined,
      mentions_entity: true,
      article_type: 'news' as const,
    }));
  } catch {
    return [];
  }
}

async function fetchGuardian(
  name: string,
  config: UnifiedSweepConfig,
): Promise<DiscoveredArticle[]> {
  const apiKey = config.guardian?.apiKey ?? 'test';
  const url = `https://content.guardianapis.com/search?q=${encodeURIComponent(`"${name}"`)}&page-size=10&api-key=${apiKey}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return [];

    const data = await response.json() as { response?: { results?: Array<Record<string, string>> } };
    return (data.response?.results ?? []).map(a => ({
      url: a.webUrl ?? '',
      title: a.webTitle ?? '',
      source_name: 'The Guardian',
      published_date: a.webPublicationDate ?? undefined,
      excerpt: undefined,
      mentions_entity: true,
      article_type: 'news' as const,
    }));
  } catch {
    return [];
  }
}

async function fetchForbes(
  _name: string,
  _config: UnifiedSweepConfig,
): Promise<RichListEntry | null> {
  // Forbes rtb-api — search by name against the billionaires dataset.
  // In production, download the dataset and search locally.
  return null;
}

async function fetchWikidata(
  _name: string,
  _config: UnifiedSweepConfig,
): Promise<GraphEnrichmentSignal[]> {
  // SPARQL query for notable properties: education, positions, awards, net worth.
  // Stub — returns empty when no match.
  return [];
}

// LLM web search is now in llm-web-search.ts — imported and called in runLayerB()
