/**
 * Capacity signal calculator per PRD §18.3.
 *
 * Observable-only aggregate: donation history, foundation/trust involvement,
 * senior company roles, directorships, board memberships, philanthropic
 * affiliations, public leadership roles, relevant institutional connections.
 *
 * IMPORTANT: Never presented as estimated personal wealth, liquidity,
 * willingness to donate, or actual giving capacity unless directly evidenced.
 */

import type { EnrichmentSignal } from '@/types/database';

/** Individual capacity indicator with its normalized score */
export interface CapacityIndicator {
  category: CapacityCategory;
  description: string;
  /** Normalized 0-1 score for this indicator */
  score: number;
  /** Source evidence IDs backing this indicator */
  evidenceIds: string[];
}

export type CapacityCategory =
  | 'donation_history'
  | 'foundation_trust_involvement'
  | 'senior_roles'
  | 'directorships'
  | 'board_memberships'
  | 'philanthropic_affiliations'
  | 'leadership_roles'
  | 'institutional_connections';

export interface CapacitySignalResult {
  /** Aggregate capacity signal score (0-1) */
  score: number;
  /** Individual indicators contributing to the score */
  indicators: CapacityIndicator[];
}

/** Weights for each capacity category (sum to 1.0) */
const CATEGORY_WEIGHTS: Record<CapacityCategory, number> = {
  donation_history: 0.20,
  foundation_trust_involvement: 0.15,
  senior_roles: 0.15,
  directorships: 0.15,
  board_memberships: 0.10,
  philanthropic_affiliations: 0.10,
  leadership_roles: 0.08,
  institutional_connections: 0.07,
};

/** Input signals that feed capacity calculation */
export interface CapacityInput {
  /** Donation events associated with this entity */
  donationCount: number;
  /** Foundation/trust roles (trustee of a grantmaking body) */
  foundationTrustRoles: number;
  /** Senior company roles (C-suite, partner, etc.) */
  seniorRoles: number;
  /** Company directorships */
  directorships: number;
  /** Board memberships across organisations */
  boardMemberships: number;
  /** Philanthropic affiliations (charity involvement) */
  philanthropicAffiliations: number;
  /** Public leadership roles (chair, president, etc.) */
  leadershipRoles: number;
  /** Institutional connections (university, hospital, etc.) */
  institutionalConnections: number;
  /** Enrichment signals providing additional evidence */
  enrichmentSignals?: EnrichmentSignal[];
}

/**
 * Normalize a count into a 0-1 score using diminishing returns.
 * f(n) = 1 - (1 / (1 + n * scale))
 * At scale=1: 1 item -> 0.50, 2 -> 0.67, 5 -> 0.83, 10 -> 0.91
 */
function normalizeCount(count: number, scale = 1): number {
  if (count <= 0) return 0;
  return 1 - 1 / (1 + count * scale);
}

/**
 * Calculate capacity signal score from observable indicators per §18.3.
 *
 * Returns a score between 0 and 1 with breakdown.
 */
export function calculateCapacitySignal(input: CapacityInput): CapacitySignalResult {
  const indicators: CapacityIndicator[] = [];

  // Donation history — scale higher: more donations = stronger signal
  const donationScore = normalizeCount(input.donationCount, 0.5);
  if (input.donationCount > 0) {
    indicators.push({
      category: 'donation_history',
      description: `${input.donationCount} donation event(s)`,
      score: donationScore,
      evidenceIds: [],
    });
  }

  // Foundation/trust involvement
  const foundationScore = normalizeCount(input.foundationTrustRoles, 1);
  if (input.foundationTrustRoles > 0) {
    indicators.push({
      category: 'foundation_trust_involvement',
      description: `${input.foundationTrustRoles} foundation/trust role(s)`,
      score: foundationScore,
      evidenceIds: [],
    });
  }

  // Senior roles
  const seniorScore = normalizeCount(input.seniorRoles, 1);
  if (input.seniorRoles > 0) {
    indicators.push({
      category: 'senior_roles',
      description: `${input.seniorRoles} senior role(s)`,
      score: seniorScore,
      evidenceIds: [],
    });
  }

  // Directorships
  const directorScore = normalizeCount(input.directorships, 0.8);
  if (input.directorships > 0) {
    indicators.push({
      category: 'directorships',
      description: `${input.directorships} directorship(s)`,
      score: directorScore,
      evidenceIds: [],
    });
  }

  // Board memberships
  const boardScore = normalizeCount(input.boardMemberships, 0.8);
  if (input.boardMemberships > 0) {
    indicators.push({
      category: 'board_memberships',
      description: `${input.boardMemberships} board membership(s)`,
      score: boardScore,
      evidenceIds: [],
    });
  }

  // Philanthropic affiliations
  const philScore = normalizeCount(input.philanthropicAffiliations, 0.7);
  if (input.philanthropicAffiliations > 0) {
    indicators.push({
      category: 'philanthropic_affiliations',
      description: `${input.philanthropicAffiliations} philanthropic affiliation(s)`,
      score: philScore,
      evidenceIds: [],
    });
  }

  // Leadership roles
  const leaderScore = normalizeCount(input.leadershipRoles, 1);
  if (input.leadershipRoles > 0) {
    indicators.push({
      category: 'leadership_roles',
      description: `${input.leadershipRoles} leadership role(s)`,
      score: leaderScore,
      evidenceIds: [],
    });
  }

  // Institutional connections
  const instScore = normalizeCount(input.institutionalConnections, 0.8);
  if (input.institutionalConnections > 0) {
    indicators.push({
      category: 'institutional_connections',
      description: `${input.institutionalConnections} institutional connection(s)`,
      score: instScore,
      evidenceIds: [],
    });
  }

  // Weighted aggregate
  const scores: Record<CapacityCategory, number> = {
    donation_history: donationScore,
    foundation_trust_involvement: foundationScore,
    senior_roles: seniorScore,
    directorships: directorScore,
    board_memberships: boardScore,
    philanthropic_affiliations: philScore,
    leadership_roles: leaderScore,
    institutional_connections: instScore,
  };

  let aggregate = 0;
  for (const [cat, weight] of Object.entries(CATEGORY_WEIGHTS)) {
    aggregate += weight * (scores[cat as CapacityCategory] ?? 0);
  }

  return {
    score: Math.min(1, Math.max(0, aggregate)),
    indicators,
  };
}
