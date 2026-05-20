import { trigramSimilarity } from '../src/lib/entity-resolution/match-confidence';
import { calculatePriorityScore, type PriorityInput } from '../src/lib/ranking/priority';
import { calculateConfidenceScore, type ConfidenceInput } from '../src/lib/ranking/confidence';

interface SeedInput {
  row: number;
  first_name: string;
  last_name: string;
  type: 'hnw' | 'supporter';
  affiliation: string;
  introduced_by: string;
  tier: string;
}

const SEEDS: SeedInput[] = [
  { row: 149, first_name: 'Stuart', last_name: 'Roden', type: 'supporter',
    affiliation: 'Lansdowne Partners', introduced_by: 'Gary Lubner (household)', tier: 'Priority / very important' },
  { row: 181, first_name: 'Arabella', last_name: 'Duffield', type: 'supporter',
    affiliation: '', introduced_by: 'James Lambert (household)', tier: 'Priority / very important' },
  { row: 89, first_name: 'Barbara', last_name: 'Storch', type: 'supporter',
    affiliation: 'Bridges Impact Foundation', introduced_by: 'Kyle Brentwood (household)', tier: 'Important' },
  { row: 74, first_name: 'Philip', last_name: 'Lawford', type: 'supporter',
    affiliation: 'AKO Foundation', introduced_by: '', tier: 'Important' },
  { row: 61, first_name: 'Natasha', last_name: 'Turner', type: 'supporter',
    affiliation: 'Oak Foundation', introduced_by: '', tier: 'Priority / very important' },
  { row: 41, first_name: 'Eva', last_name: 'Klute', type: 'supporter',
    affiliation: 'Inthallo', introduced_by: '', tier: 'Important' },
  { row: 88, first_name: 'Nadine', last_name: 'Majaro', type: 'supporter',
    affiliation: 'The Progress Foundation', introduced_by: '', tier: 'Important' },
];

const CORPUS_ENTITIES = [
  { name: 'Stuart Roden', orgs: ['lansdowne partners'] },
  { name: 'Gary Lubner', orgs: ['belron', 'this day foundation'] },
  { name: 'James Lambert', orgs: [] },
  { name: 'Kyle Brentwood', orgs: [] },
  { name: 'Barbara Storch', orgs: ['bridges impact foundation'] },
  { name: 'Philip Lawford', orgs: ['ako foundation'] },
  { name: 'Natasha Turner', orgs: ['oak foundation'] },
  { name: 'Eva Klute', orgs: ['inthallo'] },
  { name: 'Nadine Majaro', orgs: ['the progress foundation'] },
  { name: 'Peter Lampl', orgs: ['sutton trust'] },
  { name: 'Sir Ronald Cohen', orgs: ['bridges fund management', 'portland trust'] },
  { name: 'Michele Sheridan', orgs: ['bridges fund management'] },
  { name: 'Nicolai Tangen', orgs: ['ako capital'] },
  { name: 'David Harding', orgs: ['winton group'] },
  { name: 'Michael Spencer', orgs: ['nex group', 'icap'] },
  { name: 'Lloyd Dorfman', orgs: ['travelex', 'esselco'] },
];

interface SimProfile {
  appointments: number;
  trusteeships: number;
  signals: string[];
  contacts: { name: string; connection: string; via: string; priority: 1 | 2 }[];
  corpus_matches: { name: string; filings: number; confidence: number }[];
}

const PROFILES: Record<string, SimProfile> = {
  'Stuart Roden': {
    appointments: 7, trusteeships: 3,
    signals: ['foundation', 'director', 'partner', 'education', 'youth', 'social mobility'],
    contacts: [
      { name: 'Sir Paul Marshall', connection: 'Hedge fund co-founder, education philanthropy', via: 'ARK Schools / hedge fund philanthropy', priority: 1 },
      { name: 'Sir Ronald Cohen', connection: 'Impact investing pioneer', via: 'Bridges Fund Management / impact investing', priority: 1 },
      { name: 'Peter Davies', connection: 'Lansdowne Partners co-founder', via: 'Lansdowne Partners', priority: 1 },
      { name: 'Nicolai Tangen', connection: 'Sovereign wealth fund / philanthropy', via: 'AKO Capital / Nordic philanthropy', priority: 2 },
    ],
    corpus_matches: [
      { name: 'Stuart Roden', filings: 2, confidence: 0.97 },
      { name: 'Sir Ronald Cohen', filings: 3, confidence: 0.94 },
    ],
  },
  'Arabella Duffield': {
    appointments: 2, trusteeships: 1,
    signals: ['community', 'youth', 'wellbeing'],
    contacts: [
      { name: 'Sophie Goldschmidt', connection: 'Sports industry executive', via: 'Sport and philanthropy networks', priority: 2 },
      { name: 'Emily Nash', connection: 'Community foundation peer', via: 'Youth philanthropy', priority: 2 },
    ],
    corpus_matches: [],
  },
  'Barbara Storch': {
    appointments: 4, trusteeships: 4,
    signals: ['foundation', 'community', 'youth', 'education', 'poverty', 'social mobility'],
    contacts: [
      { name: 'Sir Ronald Cohen', connection: 'Bridges Fund Management founder', via: 'Bridges Impact Foundation / impact investing', priority: 1 },
      { name: 'Michele Fitzpatrick', connection: 'Impact investing co-trustee', via: 'Bridges Impact Foundation', priority: 1 },
      { name: 'David Blood', connection: 'Sustainable investing peer', via: 'Generation Investment / ESG philanthropy', priority: 2 },
      { name: 'Dame Julia Cleverdon', connection: 'Social mobility champion', via: 'Business in the Community', priority: 2 },
    ],
    corpus_matches: [
      { name: 'Barbara Storch', filings: 1, confidence: 0.93 },
      { name: 'Sir Ronald Cohen', filings: 3, confidence: 0.94 },
    ],
  },
  'Philip Lawford': {
    appointments: 5, trusteeships: 3,
    signals: ['foundation', 'education', 'youth', 'community'],
    contacts: [
      { name: 'Nicolai Tangen', connection: 'AKO Capital founder, education giving', via: 'AKO Foundation', priority: 1 },
      { name: 'Cathy Pitt', connection: 'AKO Foundation co-trustee', via: 'AKO Foundation', priority: 1 },
      { name: 'David Harding', connection: 'Quantitative finance philanthropy', via: 'Science and education giving', priority: 2 },
    ],
    corpus_matches: [
      { name: 'Philip Lawford', filings: 2, confidence: 0.96 },
    ],
  },
  'Natasha Turner': {
    appointments: 3, trusteeships: 5,
    signals: ['foundation', 'community', 'youth', 'education', 'poverty', 'mental health', 'wellbeing'],
    contacts: [
      { name: 'Jess Grønlie', connection: 'Oak Foundation programme director', via: 'Oak Foundation', priority: 1 },
      { name: 'Douglas Griffiths', connection: 'Oak Foundation co-trustee, youth focus', via: 'Oak Foundation', priority: 1 },
      { name: 'Alan Parker', connection: 'Children in Need / Brunswick Group', via: 'Children\'s philanthropy network', priority: 2 },
      { name: 'Lord Alli', connection: 'Youth philanthropy peer', via: 'Stone Club / Labour philanthropy', priority: 2 },
    ],
    corpus_matches: [
      { name: 'Natasha Turner', filings: 3, confidence: 0.98 },
    ],
  },
  'Eva Klute': {
    appointments: 2, trusteeships: 1,
    signals: ['community', 'youth', 'sport', 'football'],
    contacts: [
      { name: 'Mark Gregory', connection: 'Grassroots football funder', via: 'Inthallo / community football', priority: 1 },
      { name: 'Keith Harris', connection: 'Football industry / charity crossover', via: 'Football and philanthropy network', priority: 2 },
    ],
    corpus_matches: [],
  },
  'Nadine Majaro': {
    appointments: 3, trusteeships: 2,
    signals: ['foundation', 'education', 'youth', 'community'],
    contacts: [
      { name: 'Tim Wheeler', connection: 'Progress Foundation co-trustee', via: 'The Progress Foundation', priority: 1 },
      { name: 'Dame Sharon White', connection: 'Social mobility peer, John Lewis', via: 'Social mobility and enterprise', priority: 2 },
      { name: 'Helena Morrissey', connection: 'Financial sector philanthropist', via: 'Diversity and education philanthropy', priority: 2 },
    ],
    corpus_matches: [
      { name: 'Nadine Majaro', filings: 1, confidence: 0.92 },
    ],
  },
};

function computeAffinity(signals: string[]): number {
  let s = 0.3;
  const t = signals.join(' ').toLowerCase();
  if (t.includes('sport') || t.includes('football') || t.includes('youth')) s += 0.2;
  if (t.includes('education') || t.includes('social mobility')) s += 0.15;
  if (t.includes('mental health') || t.includes('wellbeing')) s += 0.1;
  if (t.includes('community') || t.includes('poverty')) s += 0.1;
  return Math.min(s, 1.0);
}
function computeCapacity(signals: string[]): number {
  let s = 0.2;
  const t = signals.join(' ').toLowerCase();
  if (t.includes('rich list') || t.includes('net worth') || t.includes('forbes')) s += 0.3;
  if (t.includes('foundation') || t.includes('charitable trust')) s += 0.2;
  if (t.includes('director') || t.includes('partner') || t.includes('founder')) s += 0.1;
  return Math.min(s, 1.0);
}
function computeInfluence(appts: number, trusts: number): number {
  return Math.min(0.2 + Math.min((appts + trusts) * 0.1, 0.5), 1.0);
}
function computeStrategicFit(signals: string[]): number {
  let s = 0.3;
  const t = signals.join(' ').toLowerCase();
  if (t.includes('sport') || t.includes('football')) s += 0.3;
  if (t.includes('youth') || t.includes('children') || t.includes('young people')) s += 0.2;
  return Math.min(s, 1.0);
}

function simulateSeed(seed: SeedInput) {
  const name = `${seed.first_name} ${seed.last_name}`;
  const profile = PROFILES[name]!;

  // Bootstrap
  let bestMatch: { name: string; sim: number } | null = null;
  for (const c of CORPUS_ENTITIES) {
    let sim = trigramSimilarity(name, c.name);
    if (seed.affiliation) {
      for (const o of c.orgs) {
        if (trigramSimilarity(seed.affiliation.toLowerCase(), o) > 0.6) { sim = Math.min(sim + 0.05, 1.0); break; }
      }
    }
    if (!bestMatch || sim > bestMatch.sim) bestMatch = { name: c.name, sim };
  }
  const bsAction = bestMatch && bestMatch.sim >= 0.95 ? 'linked' : bestMatch && bestMatch.sim >= 0.85 ? 'quarantined' : 'created';

  // Staging
  let merged = 0, quarantined = 0, promoted = 0;
  for (const c of profile.contacts) {
    let best = 0;
    for (const e of CORPUS_ENTITIES) { const s = trigramSimilarity(c.name, e.name); if (s > best) best = s; }
    if (best >= 0.90) merged++; else if (best >= 0.75) quarantined++; else promoted++;
  }

  // Score routes
  const routes: Array<{ introducer: string; type: string; tier: number; via: string;
    priority: ReturnType<typeof calculatePriorityScore>; confidence: ReturnType<typeof calculateConfidenceScore> }> = [];

  if (seed.introduced_by) {
    const cleanIntro = seed.introduced_by.replace(/\s*\(household\)\s*/i, '').trim();
    routes.push({
      introducer: cleanIntro, type: 'spreadsheet_declared', tier: 1, via: 'spreadsheet',
      priority: calculatePriorityScore({
        introabilityScore: 0.95, affinityScore: computeAffinity(profile.signals),
        capacitySignalScore: computeCapacity(profile.signals),
        influenceScore: computeInfluence(profile.appointments, profile.trusteeships),
        strategicFitScore: computeStrategicFit(profile.signals),
      }),
      confidence: calculateConfidenceScore({
        identityConfidence: 0.95, relationshipConfidence: 0.95,
        sourceCorroborationScore: profile.signals.length >= 4 ? 1.0 : 0.7, freshnessScore: 1.0,
      }),
    });
  }

  for (const c of profile.contacts.filter(x => x.priority === 1)) {
    routes.push({
      introducer: name, type: 'network_inferred', tier: 2, via: c.via,
      priority: calculatePriorityScore({
        introabilityScore: 0.75, affinityScore: computeAffinity(profile.signals),
        capacitySignalScore: computeCapacity(profile.signals),
        influenceScore: computeInfluence(profile.appointments, profile.trusteeships),
        strategicFitScore: computeStrategicFit(profile.signals),
      }),
      confidence: calculateConfidenceScore({
        identityConfidence: 0.80, relationshipConfidence: 0.70,
        sourceCorroborationScore: 0.7, freshnessScore: 1.0,
      }),
    });
  }

  for (const cm of profile.corpus_matches) {
    routes.push({
      introducer: name, type: 'corpus_discovered', tier: 3, via: `Charity Commission (${cm.filings} filings)`,
      priority: calculatePriorityScore({
        introabilityScore: 0.55, affinityScore: computeAffinity(profile.signals),
        capacitySignalScore: computeCapacity(profile.signals),
        influenceScore: computeInfluence(profile.appointments, profile.trusteeships),
        strategicFitScore: computeStrategicFit(profile.signals),
      }),
      confidence: calculateConfidenceScore({
        identityConfidence: cm.confidence, relationshipConfidence: 0.85,
        sourceCorroborationScore: 1.0, freshnessScore: 0.85,
      }),
    });
  }

  routes.sort((a, b) => b.priority.score - a.priority.score);

  return {
    seed, name,
    bootstrap: { action: bsAction, match: bestMatch?.name, similarity: bestMatch?.sim ?? 0 },
    research: { appointments: profile.appointments, trusteeships: profile.trusteeships, signals: profile.signals.length,
      total: profile.appointments + profile.trusteeships + profile.signals.length,
      cost: Number((0.08 + (profile.appointments + profile.trusteeships + profile.signals.length) * 0.004).toFixed(3)) },
    network: { discovered: profile.contacts.length, p1: profile.contacts.filter(c => c.priority === 1).length,
      p2: profile.contacts.filter(c => c.priority === 2).length, contacts: profile.contacts },
    staging: { merged, quarantined, promoted },
    crossref: { matches: profile.corpus_matches.length,
      corpus_routes: profile.corpus_matches.reduce((s, m) => s + m.filings, 0) },
    scoring: {
      total_routes: routes.length,
      routes: routes.map(r => ({
        introducer: r.introducer, target: r.type === 'spreadsheet_declared' ? name : r.via.split('/')[0].trim(),
        type: r.type, tier: r.tier, via: r.via,
        priority: Number(r.priority.score.toFixed(3)), confidence: Number(r.confidence.score.toFixed(3)),
        p_breakdown: Object.fromEntries(Object.entries(r.priority.breakdown).map(([k,v]) => [k, {raw: +v.raw.toFixed(3), w: +v.weighted.toFixed(3)}])),
        c_breakdown: Object.fromEntries(Object.entries(r.confidence.breakdown).map(([k,v]) => [k, {raw: +v.raw.toFixed(3), w: +v.weighted.toFixed(3)}])),
      })),
    },
  };
}

const results = SEEDS.map(simulateSeed);
console.log(JSON.stringify(results, null, 2));
