import { isHnwTarget } from './seed-reference';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Attrs = Record<string, any>;

export interface IntroPathDetail {
  rank: number;
  score: number;
  hops: number;
  path_names: string[];
  root_supporter: string;
  supporter_tier: string | null;
  supporter_sub_type: string | null;
  via_orgs: string[];
  reason: string;
  score_breakdown: { hops: number; shared_orgs: number; introducer_reach: number; supporter_tier: number };
}

export interface ScoredLead {
  id: string;
  name: string;
  category: 'hnw_target' | 'wealth_identified' | 'charity_donor' | 'discovered';
  connectivity: number;
  networkWorth: number;
  pathCount: number;
  bestPathScore: number;
  minHops: number | null;
  donorAffinity: number;
  compositeScore: number;
  breakdown: { connectivity: number; wealth: number; paths: number; affinity: number };
  explanations: { connectivity: string; wealth: string; paths: string; affinity: string };
  bestPath: string | null;
  rootSupporter: string | null;
  introPaths: IntroPathDetail[];
  wealthBand: string | null;
  estimatedNw: number | null;
  wealthSource: string | null;
  bio: string | null;
  sector: string | null;
  currentRole: string | null;
  employer: string | null;
  location: string | null;
  connectionCount: number;
  isHumanValidated: boolean;
  actionStatus: string | null;
}

export function scoreLead(
  id: string,
  name: string,
  attrs: Attrs,
  connectionCount: number,
  charityOverlap: number,
): ScoredLead {
  const intro = attrs.introduction;
  const paths = Array.isArray(attrs.intro_paths) ? attrs.intro_paths : [];
  const cat = attrs.target_category ?? (isHnwTarget(name) ? 'hnw_target' : 'discovered');
  const nw = attrs.estimated_net_worth_gbp ?? null;
  const band = attrs.wealth_band ?? null;

  // Connectivity: how many network connections this person has (normalised 0-100)
  const connScore = Math.min(100, Math.round((connectionCount / 20) * 100));

  // Network worth: the person's own estimated wealth (normalised 0-100)
  const wealthScore = nw ? Math.min(100, Math.round(Math.log10(Math.max(nw, 1)) / 9 * 100)) : 0;

  // Path count & quality: how many introduction paths exist and their best score
  const bestScore = paths.length > 0 ? paths[0].score ?? 0 : 0;
  const pathScore = Math.min(100, Math.round((paths.length / 3) * 50 + (bestScore / 100) * 50));

  // Donor affinity: charity overlap + whether they're already tagged as a donor type
  const affinityBase = Math.min(50, charityOverlap * 15);
  const catBonus = cat === 'hnw_target' ? 40 : cat === 'charity_donor' ? 30 : cat === 'wealth_identified' ? 20 : 0;
  const affinityScore = Math.min(100, affinityBase + catBonus + (attrs.sector === 'philanthropy' ? 10 : 0));

  // Composite: weighted blend
  const composite = Math.round(
    connScore * 0.2 +
    wealthScore * 0.3 +
    pathScore * 0.3 +
    affinityScore * 0.2
  );

  const minHops = paths.length > 0
    ? Math.min(...paths.map((p: { hops?: number }) => p.hops ?? 99))
    : (intro?.degree != null && intro.degree > 0 ? intro.degree : null);

  const explanations = {
    connectivity: connectionCount === 0
      ? 'No mapped connections yet.'
      : `${connectionCount} network connection${connectionCount > 1 ? 's' : ''} (score ${connScore}/100). ${connectionCount >= 20 ? 'Very well connected.' : connectionCount >= 10 ? 'Well connected.' : connectionCount >= 5 ? 'Moderately connected.' : 'Few connections.'}`,
    wealth: nw
      ? `Estimated net worth £${nw >= 1e9 ? (nw / 1e9).toFixed(1) + 'B' : nw >= 1e6 ? (nw / 1e6).toFixed(0) + 'M' : (nw / 1e3).toFixed(0) + 'K'} (band: ${band ?? 'unknown'}). Score ${wealthScore}/100.`
      : band && band !== 'unknown'
        ? `Wealth band: ${band}. No specific figure available. Score ${wealthScore}/100.`
        : 'No wealth data. Score 0/100.',
    paths: paths.length > 0
      ? `${paths.length} introduction path${paths.length > 1 ? 's' : ''} found. Best path scores ${bestScore}/100. ${minHops === 1 ? 'Direct 1-hop connection from a supporter.' : 'Reachable within 2 hops.'} Score ${pathScore}/100.`
      : intro?.degree
        ? `Reachable at ${intro.degree} hop${intro.degree > 1 ? 's' : ''} from ${intro.root_supporter ?? 'a supporter'}. No scored paths computed yet.`
        : 'No introduction paths found from our supporters.',
    affinity: `${cat === 'hnw_target' ? 'On our HNW target list (+40).' : cat === 'charity_donor' ? 'Connected to charities we track (+30).' : cat === 'wealth_identified' ? 'Has identified wealth (+20).' : 'Discovered through network mapping.'} ${charityOverlap > 0 ? `Shares ${charityOverlap} charity connection${charityOverlap > 1 ? 's' : ''} (+${Math.min(50, charityOverlap * 15)}).` : ''} ${attrs.sector === 'philanthropy' ? 'Works in philanthropy (+10).' : ''} Score ${affinityScore}/100.`,
  };

  return {
    id, name,
    category: cat,
    connectivity: connScore,
    networkWorth: wealthScore,
    pathCount: paths.length,
    bestPathScore: bestScore,
    minHops,
    donorAffinity: affinityScore,
    compositeScore: composite,
    breakdown: { connectivity: connScore, wealth: wealthScore, paths: pathScore, affinity: affinityScore },
    explanations,
    bestPath: paths.length > 0 ? paths[0].path_names?.join(' → ') : (intro?.path?.join(' → ') ?? null),
    rootSupporter: paths.length > 0 ? paths[0].root_supporter : (intro?.root_supporter ?? null),
    introPaths: paths.slice(0, 5) as IntroPathDetail[],
    wealthBand: band,
    estimatedNw: nw,
    wealthSource: attrs.wealth_source ?? null,
    bio: attrs.bio_summary ?? null,
    sector: attrs.sector ?? null,
    currentRole: attrs.current_role ?? null,
    employer: attrs.employer ?? null,
    location: attrs.location ?? null,
    connectionCount,
    isHumanValidated: !!attrs.identity_confirmed,
    actionStatus: attrs.action_item?.status ?? null,
  };
}
