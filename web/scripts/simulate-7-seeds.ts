/**
 * Simulates the seed pipeline for 7 real seeds from both spreadsheets.
 * Uses actual scoring functions — no Supabase connection needed.
 * Outputs JSON results for the HTML report.
 */

// Direct imports from source
import { trigramSimilarity } from '../src/lib/entity-resolution/match-confidence';
import { calculatePriorityScore, type PriorityInput } from '../src/lib/ranking/priority';
import { calculateConfidenceScore, type ConfidenceInput } from '../src/lib/ranking/confidence';

// --- Seed definitions (from actual spreadsheets) ---

interface SeedInput {
  row: number;
  first_name: string;
  last_name: string;
  type: 'hnw' | 'supporter';
  affiliation: string;
  introduced_by: string;
  tier: string;
  email: string;
}

const SEEDS: SeedInput[] = [
  {
    row: 54, first_name: 'Hayley', last_name: 'Ronson', type: 'hnw',
    affiliation: 'Gerald and Gail Ronson Family Foundation',
    introduced_by: 'Jeff Shear (household)', tier: '', email: 'hayley101@gmail.com',
  },
  {
    row: 20, first_name: 'Lance', last_name: 'Uggla', type: 'hnw',
    affiliation: '', introduced_by: '', tier: '', email: '',
  },
  {
    row: 14, first_name: 'Michael', last_name: 'Lynton', type: 'hnw',
    affiliation: '', introduced_by: '', tier: '', email: '',
  },
  {
    row: 61, first_name: 'Lloyd', last_name: 'Dorfman', type: 'hnw',
    affiliation: '', introduced_by: '', tier: '', email: 'chairman@esselco.org',
  },
  {
    row: 161, first_name: 'Gary', last_name: 'Lubner', type: 'supporter',
    affiliation: 'This Day Foundation', introduced_by: '',
    tier: 'Priority / very important', email: 'gary@this.day',
  },
  {
    row: 144, first_name: 'Piers', last_name: 'Clanford', type: 'supporter',
    affiliation: 'Berkeley Foundation', introduced_by: 'Rob Perrins (household)',
    tier: 'Important', email: 'piers.clanford@stgeorgeplc.com',
  },
  {
    row: 133, first_name: 'Richard', last_name: 'Couzens', type: 'supporter',
    affiliation: 'BMO Capital Markets', introduced_by: '',
    tier: 'Important', email: 'richard.couzens@bmo.com',
  },
];

// --- Simulated corpus entities for matching ---

const CORPUS_ENTITIES = [
  { name: 'Gerald Ronson', orgs: ['heron international', 'gerald ronson foundation'] },
  { name: 'Gail Ronson', orgs: ['gerald and gail ronson family foundation'] },
  { name: 'Hayley Ronson', orgs: ['gerald and gail ronson family foundation'] },
  { name: 'Lance Uggla', orgs: ['ihs markit'] },
  { name: 'Michael Lynton', orgs: ['snap inc', 'sony entertainment'] },
  { name: 'Lloyd Dorfman', orgs: ['travelex', 'esselco'] },
  { name: 'Gary Lubner', orgs: ['belron', 'this day foundation'] },
  { name: 'Richard Cousins', orgs: ['compass group'] }, // note: Cousins vs Couzens
  { name: 'Piers Clanford', orgs: ['berkeley group', 'berkeley foundation'] },
  { name: 'Rob Perrins', orgs: ['berkeley group'] },
  { name: 'Jeff Shear', orgs: [] },
  { name: 'Peter Lampl', orgs: ['sutton trust'] },
  { name: 'James Reed', orgs: ['reed group', 'the reed foundation'] },
  { name: 'Alec Reed', orgs: ['reed group', 'the reed foundation'] },
  { name: 'Michael Spencer', orgs: ['nex group', 'icap'] },
  { name: 'David Harding', orgs: ['winton group'] },
];

// --- Simulated research profiles ---

interface SimulatedProfile {
  name: string;
  appointments: number;
  trusteeships: number;
  signals: string[];
  network_contacts: { name: string; connection: string; via: string; priority: 1 | 2 }[];
  corpus_matches: { name: string; filings: number; confidence: number }[];
}

const PROFILES: Record<string, SimulatedProfile> = {
  'Hayley Ronson': {
    name: 'Hayley Ronson',
    appointments: 2,
    trusteeships: 1,
    signals: ['foundation', 'community', 'youth'],
    network_contacts: [
      { name: 'Gerald Ronson', connection: 'Father, philanthropist', via: 'Ronson family', priority: 1 },
      { name: 'Gail Ronson', connection: 'Mother, foundation co-chair', via: 'Ronson Foundation', priority: 1 },
      { name: 'Lisa Sheridan Ronson', connection: 'Family foundation trustee', via: 'Gerald and Gail Ronson Family Foundation', priority: 2 },
    ],
    corpus_matches: [
      { name: 'Gerald Ronson', filings: 4, confidence: 0.96 },
    ],
  },
  'Lance Uggla': {
    name: 'Lance Uggla',
    appointments: 8,
    trusteeships: 0,
    signals: ['net worth', 'forbes', 'founder', 'director'],
    network_contacts: [
      { name: 'Michael Spencer', connection: 'Financial sector peer', via: 'City of London finance', priority: 2 },
      { name: 'Dame Julia Hoggett', connection: 'LSE CEO, regulatory overlap', via: 'London Stock Exchange', priority: 2 },
    ],
    corpus_matches: [],
  },
  'Michael Lynton': {
    name: 'Michael Lynton',
    appointments: 5,
    trusteeships: 2,
    signals: ['director', 'education', 'foundation', 'partner'],
    network_contacts: [
      { name: 'Evan Spiegel', connection: 'Snap Inc board colleague', via: 'Snap Inc', priority: 1 },
      { name: 'David Geffen', connection: 'Entertainment / philanthropy peer', via: 'Los Angeles arts scene', priority: 2 },
      { name: 'Michael Bloomberg', connection: 'Shared philanthropy boards', via: 'Education philanthropy', priority: 2 },
    ],
    corpus_matches: [],
  },
  'Lloyd Dorfman': {
    name: 'Lloyd Dorfman',
    appointments: 11,
    trusteeships: 5,
    signals: ['rich list', 'foundation', 'founder', 'community', 'youth', 'education', 'social mobility'],
    network_contacts: [
      { name: 'Sir Harvey McGrath', connection: 'Co-trustee, philanthropy', via: 'The Prince\'s Trust / Big Society Capital', priority: 1 },
      { name: 'Dame Vivian Hunt', connection: 'Social mobility champion', via: 'Social Mobility Foundation', priority: 1 },
      { name: 'Peter Lampl', connection: 'Education philanthropy peer', via: 'Sutton Trust / education access', priority: 2 },
      { name: 'David Harding', connection: 'Donor network peer', via: 'High-value UK philanthropy', priority: 2 },
    ],
    corpus_matches: [
      { name: 'Lloyd Dorfman', filings: 3, confidence: 0.98 },
      { name: 'Sir Harvey McGrath', filings: 2, confidence: 0.91 },
    ],
  },
  'Gary Lubner': {
    name: 'Gary Lubner',
    appointments: 6,
    trusteeships: 3,
    signals: ['foundation', 'community', 'youth', 'education', 'poverty', 'social mobility'],
    network_contacts: [
      { name: 'Ronald Lubner', connection: 'Father / Belron founder', via: 'Belron / family', priority: 1 },
      { name: 'Dame Julia Cleverdon', connection: 'Youth development shared interest', via: 'Business in the Community', priority: 2 },
      { name: 'Michael de Giorgio', connection: 'This Day Foundation co-trustee', via: 'This Day Foundation', priority: 1 },
    ],
    corpus_matches: [
      { name: 'Gary Lubner', filings: 2, confidence: 0.95 },
    ],
  },
  'Piers Clanford': {
    name: 'Piers Clanford',
    appointments: 4,
    trusteeships: 2,
    signals: ['foundation', 'community', 'youth', 'sport'],
    network_contacts: [
      { name: 'Rob Perrins', connection: 'Berkeley Group CEO, introducer', via: 'Berkeley Group', priority: 1 },
      { name: 'Karl Sheridan', connection: 'Berkeley Foundation colleague', via: 'Berkeley Foundation', priority: 1 },
      { name: 'Tony Pidgley', connection: 'Berkeley Group founder (legacy)', via: 'Berkeley Group', priority: 2 },
    ],
    corpus_matches: [
      { name: 'Piers Clanford', filings: 1, confidence: 0.93 },
    ],
  },
  'Richard Couzens': {
    name: 'Richard Couzens',
    appointments: 3,
    trusteeships: 0,
    signals: ['director', 'partner'],
    network_contacts: [
      { name: 'Darryl White', connection: 'BMO CEO, employer connection', via: 'BMO Capital Markets', priority: 2 },
    ],
    corpus_matches: [],
  },
};

// --- Simulation engine ---

interface PhaseResult {
  phase: string;
  status: 'completed' | 'skipped' | 'failed';
  duration_ms: number;
  details: Record<string, unknown>;
}

interface SeedSimResult {
  seed: SeedInput;
  phases: PhaseResult[];
  bootstrap: {
    action: 'linked' | 'created' | 'quarantined';
    best_match: string | null;
    similarity: number;
  };
  research: {
    appointments: number;
    trusteeships: number;
    total_signals: number;
    cost_usd: number;
  };
  network: {
    contacts_discovered: number;
    routes_created: number;
    priority_1: number;
    priority_2: number;
  };
  staging: {
    auto_merged: number;
    quarantined: number;
    auto_promoted: number;
  };
  crossref: {
    corpus_matches: number;
    routes_from_corpus: number;
  };
  scoring: {
    best_route: {
      introducer: string;
      route_type: string;
      warmth_tier: number;
      priority_score: number;
      confidence_score: number;
      priority_breakdown: Record<string, { raw: number; weighted: number }>;
      confidence_breakdown: Record<string, { raw: number; weighted: number }>;
    } | null;
    total_routes: number;
  };
}

function simulateSeed(seed: SeedInput): SeedSimResult {
  const fullName = `${seed.first_name} ${seed.last_name}`;
  const profile = PROFILES[fullName];
  const phases: PhaseResult[] = [];

  // Phase 1: Import
  phases.push({
    phase: 'seed_import',
    status: 'completed',
    duration_ms: 180 + Math.floor(Math.random() * 40),
    details: { rows_parsed: 1, format: seed.type === 'hnw' ? 'HNW targets' : 'MASTER supporters' },
  });

  // Phase 2: Bootstrap — real trigram matching
  const bootstrapStart = Date.now();
  let bestMatch: { name: string; similarity: number } | null = null;
  for (const corpus of CORPUS_ENTITIES) {
    const sim = trigramSimilarity(fullName, corpus.name);
    let boosted = sim;
    // Affiliation boost
    if (seed.affiliation) {
      const seedAff = seed.affiliation.toLowerCase();
      for (const org of corpus.orgs) {
        if (trigramSimilarity(seedAff, org) > 0.6) {
          boosted += 0.05;
          break;
        }
      }
    }
    boosted = Math.min(boosted, 1.0);
    if (!bestMatch || boosted > bestMatch.similarity) {
      bestMatch = { name: corpus.name, similarity: boosted };
    }
  }

  let bootstrapAction: 'linked' | 'created' | 'quarantined';
  if (bestMatch && bestMatch.similarity >= 0.95) {
    bootstrapAction = 'linked';
  } else if (bestMatch && bestMatch.similarity >= 0.85) {
    bootstrapAction = 'quarantined';
  } else {
    bootstrapAction = 'created';
  }

  phases.push({
    phase: 'seed_bootstrap',
    status: 'completed',
    duration_ms: 320 + Math.floor(Math.random() * 80),
    details: {
      action: bootstrapAction,
      best_match: bestMatch?.name ?? null,
      similarity: bestMatch?.similarity ?? 0,
      introduced_by_resolved: seed.introduced_by ? true : false,
    },
  });

  // Phase 3: Research
  if (!profile) {
    return {
      seed, phases, bootstrap: { action: bootstrapAction, best_match: bestMatch?.name ?? null, similarity: bestMatch?.similarity ?? 0 },
      research: { appointments: 0, trusteeships: 0, total_signals: 0, cost_usd: 0 },
      network: { contacts_discovered: 0, routes_created: 0, priority_1: 0, priority_2: 0 },
      staging: { auto_merged: 0, quarantined: 0, auto_promoted: 0 },
      crossref: { corpus_matches: 0, routes_from_corpus: 0 },
      scoring: { best_route: null, total_routes: 0 },
    };
  }

  const totalSignals = profile.appointments + profile.trusteeships + profile.signals.length;
  const researchCost = 0.08 + (totalSignals * 0.004);
  phases.push({
    phase: 'seed_augmentation_research',
    status: 'completed',
    duration_ms: 42000 + Math.floor(Math.random() * 18000),
    details: {
      appointments: profile.appointments,
      trusteeships: profile.trusteeships,
      signals: totalSignals,
      cost_usd: Number(researchCost.toFixed(3)),
    },
  });

  // Phase 4: Network mapping
  const p1Count = profile.network_contacts.filter(c => c.priority === 1).length;
  const p2Count = profile.network_contacts.filter(c => c.priority === 2).length;
  const networkCost = 0.12 + (profile.network_contacts.length * 0.008);
  phases.push({
    phase: 'seed_augmentation_network',
    status: 'completed',
    duration_ms: 55000 + Math.floor(Math.random() * 15000),
    details: {
      contacts_discovered: profile.network_contacts.length,
      priority_1: p1Count,
      priority_2: p2Count,
      routes_created: p1Count,
      cost_usd: Number(networkCost.toFixed(3)),
    },
  });

  // Phase 5: Staging — real trigram matching for discovered contacts
  let autoMerged = 0, quarantined = 0, autoPromoted = 0;
  for (const contact of profile.network_contacts) {
    let contactBestSim = 0;
    for (const corpus of CORPUS_ENTITIES) {
      const sim = trigramSimilarity(contact.name, corpus.name);
      if (sim > contactBestSim) contactBestSim = sim;
    }
    if (contactBestSim >= 0.90) autoMerged++;
    else if (contactBestSim >= 0.75) quarantined++;
    else autoPromoted++;
  }

  phases.push({
    phase: 'entity_staging_review',
    status: 'completed',
    duration_ms: 600 + Math.floor(Math.random() * 400),
    details: { auto_merged: autoMerged, quarantined, auto_promoted: autoPromoted },
  });

  // Phase 6: Corpus cross-reference
  const corpusRoutes = profile.corpus_matches.reduce((sum, m) => sum + m.filings, 0);
  phases.push({
    phase: 'corpus_crossref',
    status: 'completed',
    duration_ms: 900 + Math.floor(Math.random() * 600),
    details: {
      matches: profile.corpus_matches.length,
      routes_created: corpusRoutes,
    },
  });

  // Phase 7: Introduction scoring — real formulas
  const allRoutes: Array<{
    introducer: string;
    route_type: string;
    warmth_tier: number;
    priority: ReturnType<typeof calculatePriorityScore>;
    confidence: ReturnType<typeof calculateConfidenceScore>;
  }> = [];

  // Declared route (if introduced_by exists)
  if (seed.introduced_by) {
    const cleanIntroducer = seed.introduced_by.replace(/\s*\(household\)\s*/i, '').trim();
    const introSignals = profile.signals;

    const warmthTier = 1;
    const introabilityScore = 0.95;

    const priorityInput: PriorityInput = {
      introabilityScore,
      affinityScore: computeAffinity(introSignals),
      capacitySignalScore: computeCapacity(introSignals),
      influenceScore: computeInfluence(profile.appointments, profile.trusteeships),
      strategicFitScore: computeStrategicFit(introSignals),
    };

    const confidenceInput: ConfidenceInput = {
      identityConfidence: 0.95,
      relationshipConfidence: 0.95,
      sourceCorroborationScore: introSignals.length >= 4 ? 1.0 : introSignals.length >= 2 ? 0.7 : 0.4,
      freshnessScore: 1.0,
    };

    allRoutes.push({
      introducer: cleanIntroducer,
      route_type: 'spreadsheet_declared',
      warmth_tier: warmthTier,
      priority: calculatePriorityScore(priorityInput),
      confidence: calculateConfidenceScore(confidenceInput),
    });
  }

  // Network-inferred routes (P1 contacts)
  for (const contact of profile.network_contacts.filter(c => c.priority === 1)) {
    const warmthTier = 2;
    const introabilityScore = 0.75;

    const priorityInput: PriorityInput = {
      introabilityScore,
      affinityScore: computeAffinity(profile.signals),
      capacitySignalScore: computeCapacity(profile.signals),
      influenceScore: computeInfluence(profile.appointments, profile.trusteeships),
      strategicFitScore: computeStrategicFit(profile.signals),
    };

    const confidenceInput: ConfidenceInput = {
      identityConfidence: 0.80,
      relationshipConfidence: 0.70,
      sourceCorroborationScore: 0.7,
      freshnessScore: 1.0,
    };

    allRoutes.push({
      introducer: contact.name,
      route_type: 'network_inferred',
      warmth_tier: warmthTier,
      priority: calculatePriorityScore(priorityInput),
      confidence: calculateConfidenceScore(confidenceInput),
    });
  }

  // Corpus-discovered routes
  for (const corpusMatch of profile.corpus_matches) {
    const warmthTier = 3;
    const introabilityScore = 0.55;

    const priorityInput: PriorityInput = {
      introabilityScore,
      affinityScore: computeAffinity(profile.signals),
      capacitySignalScore: computeCapacity(profile.signals),
      influenceScore: computeInfluence(profile.appointments, profile.trusteeships),
      strategicFitScore: computeStrategicFit(profile.signals),
    };

    const confidenceInput: ConfidenceInput = {
      identityConfidence: corpusMatch.confidence,
      relationshipConfidence: 0.85,
      sourceCorroborationScore: 1.0,
      freshnessScore: 0.85,
    };

    allRoutes.push({
      introducer: corpusMatch.name,
      route_type: 'corpus_discovered',
      warmth_tier: warmthTier,
      priority: calculatePriorityScore(priorityInput),
      confidence: calculateConfidenceScore(confidenceInput),
    });
  }

  // Sort by priority score descending
  allRoutes.sort((a, b) => b.priority.score - a.priority.score);

  const bestRoute = allRoutes[0] ?? null;

  phases.push({
    phase: 'introduction_scoring',
    status: 'completed',
    duration_ms: 300 + Math.floor(Math.random() * 200),
    details: {
      routes_scored: allRoutes.length,
      best_priority: bestRoute?.priority.score ?? 0,
      best_confidence: bestRoute?.confidence.score ?? 0,
    },
  });

  return {
    seed,
    phases,
    bootstrap: {
      action: bootstrapAction,
      best_match: bestMatch?.name ?? null,
      similarity: bestMatch?.similarity ?? 0,
    },
    research: {
      appointments: profile.appointments,
      trusteeships: profile.trusteeships,
      total_signals: totalSignals,
      cost_usd: Number(researchCost.toFixed(3)),
    },
    network: {
      contacts_discovered: profile.network_contacts.length,
      routes_created: p1Count,
      priority_1: p1Count,
      priority_2: p2Count,
    },
    staging: { auto_merged: autoMerged, quarantined, auto_promoted: autoPromoted },
    crossref: {
      corpus_matches: profile.corpus_matches.length,
      routes_from_corpus: corpusRoutes,
    },
    scoring: {
      best_route: bestRoute ? {
        introducer: bestRoute.introducer,
        route_type: bestRoute.route_type,
        warmth_tier: bestRoute.warmth_tier,
        priority_score: Number(bestRoute.priority.score.toFixed(3)),
        confidence_score: Number(bestRoute.confidence.score.toFixed(3)),
        priority_breakdown: Object.fromEntries(
          Object.entries(bestRoute.priority.breakdown).map(([k, v]) => [k, { raw: Number(v.raw.toFixed(3)), weighted: Number(v.weighted.toFixed(3)) }])
        ),
        confidence_breakdown: Object.fromEntries(
          Object.entries(bestRoute.confidence.breakdown).map(([k, v]) => [k, { raw: Number(v.raw.toFixed(3)), weighted: Number(v.weighted.toFixed(3)) }])
        ),
      } : null,
      total_routes: allRoutes.length,
    },
  };
}

// --- Helper functions (mirror introduction-scoring.ts logic) ---

function computeAffinity(signals: string[]): number {
  let score = 0.3;
  const text = signals.join(' ').toLowerCase();
  if (text.includes('sport') || text.includes('football') || text.includes('youth')) score += 0.2;
  if (text.includes('education') || text.includes('social mobility')) score += 0.15;
  if (text.includes('mental health') || text.includes('wellbeing')) score += 0.1;
  if (text.includes('community') || text.includes('poverty')) score += 0.1;
  return Math.min(score, 1.0);
}

function computeCapacity(signals: string[]): number {
  let score = 0.2;
  const text = signals.join(' ').toLowerCase();
  if (text.includes('rich list') || text.includes('net worth') || text.includes('forbes')) score += 0.3;
  if (text.includes('foundation') || text.includes('charitable trust')) score += 0.2;
  if (text.includes('director') || text.includes('partner') || text.includes('founder')) score += 0.1;
  return Math.min(score, 1.0);
}

function computeInfluence(appointments: number, trusteeships: number): number {
  let score = 0.2;
  score += Math.min((appointments + trusteeships) * 0.1, 0.5);
  return Math.min(score, 1.0);
}

function computeStrategicFit(signals: string[]): number {
  let score = 0.3;
  const text = signals.join(' ').toLowerCase();
  if (text.includes('sport') || text.includes('football')) score += 0.3;
  if (text.includes('youth') || text.includes('children') || text.includes('young people')) score += 0.2;
  return Math.min(score, 1.0);
}

// --- Run all simulations ---

const results = SEEDS.map(simulateSeed);

// Print results as JSON
console.log(JSON.stringify(results, null, 2));
