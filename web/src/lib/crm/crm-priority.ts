/**
 * Maps live CRM data onto the canonical PRD §18 scoring model.
 *
 * The Lead Generator previously used an off-PRD composite (connectivity/wealth/
 * paths/affinity). Build rule 6 ("scoring formulas are §15–§18; use the exact
 * weights") makes §18 the single source of truth, so the CRM now computes the
 * SAME §18.1 priority + §18.2 confidence as the candidate pipeline — just from
 * the data the CRM holds. This module is only the mapping; the formulae live in
 * `@/lib/ranking/priority` and `@/lib/ranking/confidence` and are reused as-is.
 *
 * §18.1 priority dimension  ← CRM signal
 *   introability   (0.30)   ← best intro-path score + hop distance
 *   affinity       (0.25)   ← charity overlap + donor category + philanthropy sector
 *   capacity_signal(0.20)   ← observable wealth band/estimate + directorships (§18.3:
 *                             capacity is observable signals, NOT estimated wealth alone)
 *   influence      (0.15)   ← network centrality (connection count)
 *   strategic_fit  (0.10)   ← cause alignment (sport/youth/education sectors & category)
 *
 * §18.2 confidence dimension ← CRM signal
 *   identity        (0.35)  ← human identity confirmation, else a neutral prior
 *   relationship    (0.30)  ← strongest path's route type (declared > corpus > inferred)
 *   corroboration   (0.20)  ← number of distinct evidence items
 *   freshness       (0.15)  ← recency of the newest evidence / augmentation
 */

import type { PriorityInput } from '@/lib/ranking/priority';
import type { ConfidenceInput } from '@/lib/ranking/confidence';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Attrs = Record<string, any>;

/** Sector keywords aligned to the cause (BFF: sport / youth / education / wellbeing). */
const STRATEGIC_SECTORS = /sport|football|youth|children|young people|education|social mobility|community/i;
const AFFINITY_PHILANTHROPY = /philanthrop|charit|foundation|trust/i;

/** Wealth band → an observable-capacity prior in [0,1] (§18.3). */
const BAND_CAPACITY: Record<string, number> = {
  '100m_plus': 1.0,
  '25m_100m': 0.8,
  '5m_25m': 0.6,
  '1m_5m': 0.4,
  unknown: 0.0,
};

export interface CrmSignals {
  connectionCount: number;
  charityOverlap: number;
  /** Distinct evidence items recorded for this entity (corroboration input). */
  evidenceCount: number;
  /** ISO timestamp of the newest evidence/augmentation, if any (freshness input). */
  newestEvidenceAt: string | null;
  /** Count of DIRECTOR_OF / trustee connections (capacity input, §18.3). */
  directorshipCount: number;
}

/** Build the §18.1 priority inputs from CRM attributes + aggregate signals. */
export function toPriorityInput(attrs: Attrs, s: CrmSignals): PriorityInput {
  const paths = Array.isArray(attrs.intro_paths) ? attrs.intro_paths : [];
  const cat = attrs.target_category ?? 'discovered';
  const band = (attrs.wealth_band as string) ?? 'unknown';
  const nw = attrs.estimated_net_worth_gbp as number | null | undefined;

  // introability: best warm path. A scored path (0–100) maps directly; with no
  // scored path, fall back to hop distance from the `introduction` summary.
  const bestPath = paths.length > 0 ? (paths[0].score ?? 0) / 100 : 0;
  const introDegree = attrs.introduction?.degree as number | undefined;
  const hopFallback = introDegree === 1 ? 0.6 : introDegree === 2 ? 0.35 : 0;
  const introabilityScore = Math.max(bestPath, hopFallback);

  // affinity: shared charities + donor category + philanthropy sector.
  const overlap = Math.min(0.5, s.charityOverlap * 0.15);
  const catBonus = cat === 'charity_donor' ? 0.4 : cat === 'hnw_target' ? 0.3 : cat === 'wealth_identified' ? 0.15 : 0;
  const sectorBonus = AFFINITY_PHILANTHROPY.test(String(attrs.sector ?? '')) ? 0.1 : 0;
  const affinityScore = Math.min(1, overlap + catBonus + sectorBonus);

  // capacity_signal (§18.3): observable wealth band + a directorship signal. An
  // explicit £ figure firms up the band toward its ceiling.
  const bandBase = BAND_CAPACITY[band] ?? 0;
  const figureBoost = nw && bandBase > 0 ? 0.1 : 0;
  const dirBoost = Math.min(0.2, s.directorshipCount * 0.05);
  const capacitySignalScore = Math.min(1, bandBase + figureBoost + dirBoost);

  // influence: network centrality. 20+ connections saturates.
  const influenceScore = Math.min(1, s.connectionCount / 20);

  // strategic_fit: alignment to the cause via sector or HNW-target designation.
  let strategicFitScore = STRATEGIC_SECTORS.test(String(attrs.sector ?? '')) ? 0.7 : 0.3;
  if (cat === 'hnw_target') strategicFitScore = Math.max(strategicFitScore, 0.6);
  strategicFitScore = Math.min(1, strategicFitScore);

  return { introabilityScore, affinityScore, capacitySignalScore, influenceScore, strategicFitScore };
}

/** Build the §18.2 confidence inputs from CRM attributes + aggregate signals. */
export function toConfidenceInput(attrs: Attrs, s: CrmSignals): ConfidenceInput {
  const paths = Array.isArray(attrs.intro_paths) ? attrs.intro_paths : [];

  // identity: a human "same person" confirmation is the strongest signal; absent
  // that, a neutral prior (the data exists but isn't human-verified).
  const identityConfidence = attrs.identity_confirmed ? 1.0 : 0.6;

  // relationship: trust in the strongest path by how it was established.
  // intro_paths carry via_orgs/supporter info; a shared-org path is corpus/network
  // evidence, a bare hop is weaker. We read the best path's shape.
  const best = paths[0];
  let relationshipConfidence = 0.5;
  if (best) {
    const viaOrgs = Array.isArray(best.via_orgs) ? best.via_orgs.length : 0;
    relationshipConfidence = best.hops === 1
      ? (viaOrgs > 0 ? 0.85 : 0.7)   // direct, org-backed vs. bare
      : (viaOrgs > 0 ? 0.7 : 0.55);  // 2-hop, org-backed vs. bare
  }

  // corroboration: distinct evidence items (§18.2 wants multiple independent sources).
  const sourceCorroborationScore = s.evidenceCount >= 3 ? 1.0 : s.evidenceCount === 2 ? 0.7 : s.evidenceCount === 1 ? 0.4 : 0.1;

  // freshness: recency of the newest evidence/augmentation (Appendix A.2 bands).
  let freshnessScore = 0.3;
  if (s.newestEvidenceAt) {
    const ageDays = (Date.now() - new Date(s.newestEvidenceAt).getTime()) / 86_400_000;
    freshnessScore = ageDays <= 30 ? 1.0 : ageDays <= 90 ? 0.85 : ageDays <= 180 ? 0.7 : ageDays <= 365 ? 0.5 : 0.3;
  }

  return { identityConfidence, relationshipConfidence, sourceCorroborationScore, freshnessScore };
}
