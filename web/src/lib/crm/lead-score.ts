import { isHnwTarget } from './seed-reference';
import { calculatePriorityScore, PRIORITY_WEIGHTS } from '@/lib/ranking/priority';
import { calculateConfidenceScore } from '@/lib/ranking/confidence';
import { toPriorityInput, toConfidenceInput, type CrmSignals } from './crm-priority';

/**
 * The CRM Lead Generator ranks by the canonical PRD §18.1 priority score
 * (introability/affinity/capacity/influence/strategic-fit), with the §18.2
 * confidence score shown alongside. This replaced an off-PRD composite so the
 * CRM and the candidate pipeline use one model (build rule 6). The actual
 * weights/formulae live in @/lib/ranking; this file maps live CRM data through
 * @/lib/crm/crm-priority and shapes the result for the UI.
 */
export const SCORING_CONFIG_VERSION = 'prd-18.1-v1';
/** Canonical §18.1 weights, re-exported for the UI/tests (source of truth in ranking/priority.ts). */
export const SCORING_WEIGHTS = PRIORITY_WEIGHTS;

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

/** The five §18.1 priority dimensions, each scored 0–100 for display. */
export interface PriorityDimensions {
  introability: number;
  affinity: number;
  capacity: number;
  influence: number;
  strategicFit: number;
}

/** The four §18.2 confidence dimensions, each 0–100 for display. */
export interface ConfidenceDimensions {
  identity: number;
  relationship: number;
  corroboration: number;
  freshness: number;
}

export interface ScoredLead {
  id: string;
  name: string;
  category: 'hnw_target' | 'wealth_identified' | 'charity_donor' | 'discovered';
  /** §18.1 priority score 0–100 — the ranking score. */
  priority: number;
  /** §18.2 evidence confidence score 0–100 — how trustworthy the priority is. */
  confidence: number;
  /** §18.1 per-dimension scores (0–100). */
  dimensions: PriorityDimensions;
  /** §18.2 per-dimension scores (0–100). */
  confidenceDimensions: ConfidenceDimensions;
  explanations: { introability: string; affinity: string; capacity: string; influence: string; strategicFit: string };
  pathCount: number;
  bestPathScore: number;
  minHops: number | null;
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
  charityOverlap: number;
  isHumanValidated: boolean;
  actionStatus: string | null;
  /** Set when this "lead" is really a current donor from the original list
   * (exact/variant name match) or was excluded by an analyst. */
  existingDonor: { matchName: string; kind: 'exact' | 'variant' | 'excluded' } | null;
}

/** Human label for the strategic-fit explanation. */
function STRATEGIC_FIT_LABEL(attrs: Attrs, cat: string): string {
  const sector = String(attrs.sector ?? '');
  if (/sport|football|youth|children|young people|education|social mobility|community/i.test(sector)) {
    return `Sector (${sector}) aligns with the cause.`;
  }
  if (cat === 'hnw_target') return 'On the HNW target list (priority fit).';
  return 'No specific cause alignment recorded.';
}

export function scoreLead(
  id: string,
  name: string,
  attrs: Attrs,
  connectionCount: number,
  charityOverlap: number,
  extra: { evidenceCount?: number; newestEvidenceAt?: string | null; directorshipCount?: number } = {},
): ScoredLead {
  const intro = attrs.introduction;
  const paths = Array.isArray(attrs.intro_paths) ? attrs.intro_paths : [];
  const cat = attrs.target_category ?? (isHnwTarget(name) ? 'hnw_target' : 'discovered');
  const nw = attrs.estimated_net_worth_gbp ?? null;
  const band = attrs.wealth_band ?? null;
  const bestScore = paths.length > 0 ? paths[0].score ?? 0 : 0;

  const signals: CrmSignals = {
    connectionCount,
    charityOverlap,
    evidenceCount: extra.evidenceCount ?? 0,
    newestEvidenceAt: extra.newestEvidenceAt ?? null,
    directorshipCount: extra.directorshipCount ?? 0,
  };

  // §18.1 priority + §18.2 confidence (canonical formulae, reused verbatim).
  const pr = calculatePriorityScore(toPriorityInput(attrs, signals));
  const cf = calculateConfidenceScore(toConfidenceInput(attrs, signals));
  const pct = (v: number) => Math.round(v * 100);

  const dimensions: PriorityDimensions = {
    introability: pct(pr.breakdown.introability.raw),
    affinity: pct(pr.breakdown.affinity.raw),
    capacity: pct(pr.breakdown.capacity_signal.raw),
    influence: pct(pr.breakdown.influence.raw),
    strategicFit: pct(pr.breakdown.strategic_fit.raw),
  };
  const confidenceDimensions: ConfidenceDimensions = {
    identity: pct(cf.breakdown.identity.raw),
    relationship: pct(cf.breakdown.relationship.raw),
    corroboration: pct(cf.breakdown.source_corroboration.raw),
    freshness: pct(cf.breakdown.freshness.raw),
  };

  const minHops = paths.length > 0
    ? Math.min(...paths.map((p: { hops?: number }) => p.hops ?? 99))
    : (intro?.degree != null && intro.degree > 0 ? intro.degree : null);

  const explanations = {
    introability: paths.length > 0
      ? `Best introduction path scores ${bestScore}/100${minHops === 1 ? ' (direct 1-hop from a supporter)' : minHops === 2 ? ' (reachable within 2 hops)' : ''}. §18.1 introability ${dimensions.introability}/100 (weight 30%).`
      : intro?.degree
        ? `Reachable at ${intro.degree} hop${intro.degree > 1 ? 's' : ''} from ${intro.root_supporter ?? 'a supporter'}, no scored path yet. Introability ${dimensions.introability}/100.`
        : `No introduction path from our supporters. Introability ${dimensions.introability}/100.`,
    affinity: `${cat === 'charity_donor' ? 'Connected to charities we track. ' : cat === 'hnw_target' ? 'On our HNW target list. ' : cat === 'wealth_identified' ? 'Has identified wealth. ' : ''}${charityOverlap > 0 ? `Shares ${charityOverlap} charity connection${charityOverlap > 1 ? 's' : ''}. ` : ''}§18.1 affinity ${dimensions.affinity}/100 (weight 25%).`,
    capacity: nw
      ? `Observable capacity from £${nw >= 1e9 ? (nw / 1e9).toFixed(1) + 'B' : nw >= 1e6 ? (nw / 1e6).toFixed(0) + 'M' : (nw / 1e3).toFixed(0) + 'K'} (band ${band ?? 'unknown'})${signals.directorshipCount ? ` + ${signals.directorshipCount} directorship${signals.directorshipCount > 1 ? 's' : ''}` : ''}. §18.3 capacity ${dimensions.capacity}/100 (weight 20%).`
      : band && band !== 'unknown'
        ? `Wealth band ${band}${signals.directorshipCount ? ` + ${signals.directorshipCount} directorships` : ''}. §18.3 capacity ${dimensions.capacity}/100.`
        : `No observable wealth signal. Capacity ${dimensions.capacity}/100.`,
    influence: connectionCount === 0
      ? `No mapped connections. §18.1 influence ${dimensions.influence}/100 (weight 15%).`
      : `${connectionCount} network connection${connectionCount > 1 ? 's' : ''}. §18.1 influence ${dimensions.influence}/100 (weight 15%).`,
    strategicFit: `${STRATEGIC_FIT_LABEL(attrs, cat)} §18.1 strategic fit ${dimensions.strategicFit}/100 (weight 10%).`,
  };

  return {
    id, name,
    category: cat,
    priority: pct(pr.score),
    confidence: pct(cf.score),
    dimensions,
    confidenceDimensions,
    pathCount: paths.length,
    bestPathScore: bestScore,
    minHops,
    explanations,
    bestPath: paths.length > 0 ? paths[0].path_names?.join(' → ') : (intro?.path?.join(' → ') ?? null),
    rootSupporter: paths.length > 0 ? paths[0].root_supporter : (intro?.root_supporter ?? null),
    introPaths: paths.slice(0, 10) as IntroPathDetail[],
    wealthBand: band,
    estimatedNw: nw,
    wealthSource: attrs.wealth_source ?? null,
    bio: attrs.bio_summary ?? null,
    sector: attrs.sector ?? null,
    currentRole: attrs.current_role ?? null,
    employer: attrs.employer ?? null,
    location: attrs.location ?? null,
    connectionCount,
    charityOverlap,
    isHumanValidated: !!attrs.identity_confirmed,
    actionStatus: attrs.action_item?.status ?? null,
    existingDonor: null,
  };
}

/**
 * Ranking methods exposed in the Decide "By X" views and the CSV export, each
 * keyed to a §18.1 dimension (plus the default overall priority). Single source
 * of truth so the table, the by-X pages, and the export agree.
 */
export type RankingMethod = 'priority' | 'introability' | 'affinity' | 'capacity' | 'influence' | 'confidence';

export function rankingValue(l: ScoredLead, method: RankingMethod): number {
  switch (method) {
    case 'introability': return l.dimensions.introability;
    case 'affinity': return l.dimensions.affinity;
    case 'capacity': return l.dimensions.capacity;
    case 'influence': return l.dimensions.influence;
    case 'confidence': return l.confidence;
    default: return l.priority;
  }
}
