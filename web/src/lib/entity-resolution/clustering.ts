/**
 * Identity clustering (F6.1-T2, F6.1-T3, F6.1-T5).
 *
 * Clusters entity mentions into identity_clusters using the decision bands
 * from PRD §15.2 and auto-merge blockers from §15.4.
 *
 * Decision bands (§15.2):
 *   >= 0.90  -> auto-cluster (high confidence)
 *   0.75-0.89 -> provisional (visible warning)
 *   0.55-0.74 -> possible-dup (do not merge)
 *   < 0.55   -> separate
 *
 * Auto-merge blockers (§15.4):
 *   - Incompatible DOB
 *   - Conflicting registration IDs
 *   - Prior human split decision
 *   - Incompatible roles in same period
 *   - Common-name-only (no corroborating feature)
 *
 * Human decisions always win (§15.5).
 */

import type { EntityMention, HumanIdentityDecision } from '@/types/database';
import {
  computeMatchConfidence,
  type MatchWeights,
  type MatchConfidenceResult,
  DEFAULT_MATCH_WEIGHTS,
} from './match-confidence';
import { generateId } from '@/lib/ulid';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export type DecisionBand =
  | 'auto-cluster'
  | 'provisional'
  | 'possible-dup'
  | 'separate';

export type BlockerReason =
  | 'incompatible_dob'
  | 'conflicting_registration_ids'
  | 'prior_human_split'
  | 'incompatible_roles'
  | 'common_name_only';

export interface PairwiseResult {
  mentionIdA: string;
  mentionIdB: string;
  confidence: number;
  band: DecisionBand;
  blocked: boolean;
  blockerReasons: BlockerReason[];
  matchResult: MatchConfidenceResult;
}

export interface ClusterRecord {
  cluster_id: string;
  entity_type: string;
  member_mention_ids: string[];
  cluster_confidence: number;
  decision_status: DecisionBand;
  created_by: string;
  rationale: ClusterRationale;
}

export interface ClusterRationale {
  pairs: Array<{
    mentionIdA: string;
    mentionIdB: string;
    confidence: number;
    band: DecisionBand;
    signals: Record<string, number>;
  }>;
  blockers_applied: Array<{
    mentionIdA: string;
    mentionIdB: string;
    reasons: BlockerReason[];
  }>;
  human_decisions_replayed: string[];
}

// -------------------------------------------------------------------
// Decision band classification (§15.2)
// -------------------------------------------------------------------

export const BAND_THRESHOLDS = {
  autoCluster: 0.90,
  provisional: 0.75,
  possibleDup: 0.55,
} as const;

export function classifyBand(confidence: number): DecisionBand {
  if (confidence >= BAND_THRESHOLDS.autoCluster) return 'auto-cluster';
  if (confidence >= BAND_THRESHOLDS.provisional) return 'provisional';
  if (confidence >= BAND_THRESHOLDS.possibleDup) return 'possible-dup';
  return 'separate';
}

// -------------------------------------------------------------------
// Auto-merge blockers (§15.4)
// -------------------------------------------------------------------

/**
 * Check all auto-merge blockers between two mentions.
 * Returns list of active blocker reasons (empty if none).
 */
export function checkBlockers(
  mentionA: EntityMention,
  mentionB: EntityMention,
  humanDecisions: HumanIdentityDecision[],
): BlockerReason[] {
  const reasons: BlockerReason[] = [];

  if (hasIncompatibleDob(mentionA, mentionB)) {
    reasons.push('incompatible_dob');
  }
  if (hasConflictingRegistrationIds(mentionA, mentionB)) {
    reasons.push('conflicting_registration_ids');
  }
  if (hasPriorHumanSplit(mentionA, mentionB, humanDecisions)) {
    reasons.push('prior_human_split');
  }
  if (hasIncompatibleRoles(mentionA, mentionB)) {
    reasons.push('incompatible_roles');
  }
  if (isCommonNameOnly(mentionA, mentionB)) {
    reasons.push('common_name_only');
  }

  return reasons;
}

/** Incompatible date of birth: both have DOB and they differ. */
function hasIncompatibleDob(a: EntityMention, b: EntityMention): boolean {
  const dobA = extractAttr(a, 'date_of_birth') ?? extractAttr(a, 'dob');
  const dobB = extractAttr(b, 'date_of_birth') ?? extractAttr(b, 'dob');
  if (!dobA || !dobB) return false;
  return dobA !== dobB;
}

/** Conflicting registration IDs: both have reg IDs of the same type that differ. */
function hasConflictingRegistrationIds(
  a: EntityMention,
  b: EntityMention,
): boolean {
  const regA = extractAttr(a, 'registration_id') ?? extractAttr(a, 'registration_number');
  const regB = extractAttr(b, 'registration_id') ?? extractAttr(b, 'registration_number');
  if (!regA || !regB) return false;
  return regA !== regB;
}

/** Prior human split: a not_same_person decision exists for this pair. */
function hasPriorHumanSplit(
  a: EntityMention,
  b: EntityMention,
  decisions: HumanIdentityDecision[],
): boolean {
  return decisions.some((d) => {
    if (d.decision !== 'not_same_person') return false;
    if (!d.replay_on_future_runs) return false;
    if (d.superseded_by) return false;
    const pairMatch =
      (d.entity_a_mention_id === a.entity_mention_id &&
        d.entity_b_mention_id === b.entity_mention_id) ||
      (d.entity_a_mention_id === b.entity_mention_id &&
        d.entity_b_mention_id === a.entity_mention_id);
    return pairMatch;
  });
}

/**
 * Incompatible roles: mutually incompatible active roles in the same period.
 * E.g., cannot be both "chair" and "external auditor" of the same org simultaneously.
 */
function hasIncompatibleRoles(a: EntityMention, b: EntityMention): boolean {
  const rolesA = extractRoleSet(a);
  const rolesB = extractRoleSet(b);
  if (rolesA.size === 0 || rolesB.size === 0) return false;

  // Check for mutually exclusive role pairs
  for (const roleA of rolesA) {
    for (const roleB of rolesB) {
      if (areMutuallyExclusive(roleA, roleB)) return true;
    }
  }
  return false;
}

const MUTUALLY_EXCLUSIVE_ROLES: Array<[string, string]> = [
  ['external auditor', 'trustee'],
  ['external auditor', 'chair'],
  ['external auditor', 'director'],
  ['beneficiary', 'trustee'],
];

function areMutuallyExclusive(roleA: string, roleB: string): boolean {
  const a = roleA.toLowerCase();
  const b = roleB.toLowerCase();
  return MUTUALLY_EXCLUSIVE_ROLES.some(
    ([x, y]) => (a === x && b === y) || (a === y && b === x),
  );
}

/**
 * Common-name-only: match relies only on a common name with no corroborating feature.
 * A name is "common" if it is short (<=2 parts) and no other signal fires.
 */
function isCommonNameOnly(a: EntityMention, b: EntityMention): boolean {
  // Only applies to person entities
  if (a.entity_type !== 'person' || b.entity_type !== 'person') return false;

  const hasCorroboration =
    hasSharedOrg(a, b) ||
    hasSharedAddress(a, b) ||
    hasSharedRoles(a, b) ||
    hasBothEmbeddings(a, b);

  if (hasCorroboration) return false;

  // Check if the name is "common" — short names with <= 2 parts
  const partsA = a.normalised_value.trim().split(/\s+/);
  const partsB = b.normalised_value.trim().split(/\s+/);
  return partsA.length <= 2 && partsB.length <= 2;
}

function hasSharedOrg(a: EntityMention, b: EntityMention): boolean {
  const orgsA = extractArrayAttr(a, 'organisations') ?? extractArrayAttr(a, 'organizations');
  const orgsB = extractArrayAttr(b, 'organisations') ?? extractArrayAttr(b, 'organizations');
  const orgA = extractAttr(a, 'organisation') ?? extractAttr(a, 'organization');
  const orgB = extractAttr(b, 'organisation') ?? extractAttr(b, 'organization');

  const setA = new Set<string>();
  if (orgsA) orgsA.forEach((o) => setA.add(o.toLowerCase()));
  if (orgA) setA.add(orgA.toLowerCase());

  const setB = new Set<string>();
  if (orgsB) orgsB.forEach((o) => setB.add(o.toLowerCase()));
  if (orgB) setB.add(orgB.toLowerCase());

  if (setA.size === 0 || setB.size === 0) return false;
  for (const o of setA) {
    if (setB.has(o)) return true;
  }
  return false;
}

function hasSharedAddress(a: EntityMention, b: EntityMention): boolean {
  const addrA = extractAttr(a, 'address') ?? extractAttr(a, 'postcode');
  const addrB = extractAttr(b, 'address') ?? extractAttr(b, 'postcode');
  if (!addrA || !addrB) return false;
  return addrA.toLowerCase().replace(/\s+/g, '') === addrB.toLowerCase().replace(/\s+/g, '');
}

function hasSharedRoles(a: EntityMention, b: EntityMention): boolean {
  const rolesA = extractRoleSet(a);
  const rolesB = extractRoleSet(b);
  for (const r of rolesA) {
    if (rolesB.has(r)) return true;
  }
  return false;
}

function hasBothEmbeddings(a: EntityMention, b: EntityMention): boolean {
  return !!a.embedding && a.embedding.length > 0 && !!b.embedding && b.embedding.length > 0;
}

// -------------------------------------------------------------------
// Attribute helpers
// -------------------------------------------------------------------

function extractAttr(mention: EntityMention, key: string): string | undefined {
  const attrs = mention.attributes as Record<string, unknown>;
  const val = attrs?.[key];
  return typeof val === 'string' ? val : undefined;
}

function extractArrayAttr(mention: EntityMention, key: string): string[] | undefined {
  const attrs = mention.attributes as Record<string, unknown>;
  const val = attrs?.[key];
  return Array.isArray(val) ? val.filter((v): v is string => typeof v === 'string') : undefined;
}

function extractRoleSet(mention: EntityMention): Set<string> {
  const roles = new Set<string>();
  const list = extractArrayAttr(mention, 'roles');
  if (list) list.forEach((r) => roles.add(r.toLowerCase()));
  const single = extractAttr(mention, 'role');
  if (single) roles.add(single.toLowerCase());
  return roles;
}

// -------------------------------------------------------------------
// Human decision replay (§15.5)
// -------------------------------------------------------------------

/**
 * Check if a human same_person decision exists for this pair.
 * These pairs must be merged regardless of auto-cluster score.
 */
export function hasHumanMergeDecision(
  mentionIdA: string,
  mentionIdB: string,
  decisions: HumanIdentityDecision[],
): boolean {
  return decisions.some((d) => {
    if (d.decision !== 'same_person') return false;
    if (!d.replay_on_future_runs) return false;
    if (d.superseded_by) return false;
    return (
      (d.entity_a_mention_id === mentionIdA &&
        d.entity_b_mention_id === mentionIdB) ||
      (d.entity_a_mention_id === mentionIdB &&
        d.entity_b_mention_id === mentionIdA)
    );
  });
}

// -------------------------------------------------------------------
// Clustering engine
// -------------------------------------------------------------------

/**
 * Compute pairwise match results for all mention pairs of the same entity type.
 */
export function computePairwiseMatches(
  mentions: EntityMention[],
  humanDecisions: HumanIdentityDecision[],
  weights: MatchWeights = DEFAULT_MATCH_WEIGHTS,
): PairwiseResult[] {
  const results: PairwiseResult[] = [];

  for (let i = 0; i < mentions.length; i++) {
    for (let j = i + 1; j < mentions.length; j++) {
      const a = mentions[i];
      const b = mentions[j];

      // Only compare same entity types
      if (a.entity_type !== b.entity_type) continue;

      const matchResult = computeMatchConfidence(a, b, weights);
      const band = classifyBand(matchResult.confidence);
      const blockerReasons = checkBlockers(a, b, humanDecisions);

      // Human merge decision overrides automatic clustering
      const isHumanMerge = hasHumanMergeDecision(
        a.entity_mention_id,
        b.entity_mention_id,
        humanDecisions,
      );

      results.push({
        mentionIdA: a.entity_mention_id,
        mentionIdB: b.entity_mention_id,
        confidence: matchResult.confidence,
        band: isHumanMerge ? 'auto-cluster' : band,
        blocked: isHumanMerge ? false : blockerReasons.length > 0,
        blockerReasons: isHumanMerge ? [] : blockerReasons,
        matchResult,
      });
    }
  }

  return results;
}

/**
 * Build clusters from pairwise results using union-find.
 *
 * Only auto-cluster and provisional bands are merged into clusters.
 * Blocked pairs are excluded from auto-cluster even at high confidence.
 * Human merge decisions override blockers (§15.5).
 */
export function buildClusters(
  mentions: EntityMention[],
  pairResults: PairwiseResult[],
  humanDecisions: HumanIdentityDecision[],
): ClusterRecord[] {
  // Union-Find
  const parent = new Map<string, string>();
  const rank = new Map<string, number>();

  function find(x: string): string {
    let root = x;
    while (parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    // Path compression
    let curr = x;
    while (curr !== root) {
      const next = parent.get(curr)!;
      parent.set(curr, root);
      curr = next;
    }
    return root;
  }

  function union(a: string, b: string): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return;
    const rankA = rank.get(rootA) ?? 0;
    const rankB = rank.get(rootB) ?? 0;
    if (rankA < rankB) {
      parent.set(rootA, rootB);
    } else if (rankA > rankB) {
      parent.set(rootB, rootA);
    } else {
      parent.set(rootB, rootA);
      rank.set(rootA, rankA + 1);
    }
  }

  // Initialize each mention as its own cluster
  for (const m of mentions) {
    parent.set(m.entity_mention_id, m.entity_mention_id);
    rank.set(m.entity_mention_id, 0);
  }

  // Track rationale data per pair
  const pairRationale: ClusterRationale['pairs'] = [];
  const blockersApplied: ClusterRationale['blockers_applied'] = [];
  const humanDecisionsReplayed: string[] = [];

  // Merge pairs that qualify
  for (const pair of pairResults) {
    pairRationale.push({
      mentionIdA: pair.mentionIdA,
      mentionIdB: pair.mentionIdB,
      confidence: pair.confidence,
      band: pair.band,
      signals: pair.matchResult.signals as unknown as Record<string, number>,
    });

    if (pair.blockerReasons.length > 0) {
      blockersApplied.push({
        mentionIdA: pair.mentionIdA,
        mentionIdB: pair.mentionIdB,
        reasons: pair.blockerReasons,
      });
    }

    // Check for human merge
    const isHumanMerge = hasHumanMergeDecision(
      pair.mentionIdA,
      pair.mentionIdB,
      humanDecisions,
    );
    if (isHumanMerge) {
      humanDecisionsReplayed.push(
        `merge:${pair.mentionIdA}:${pair.mentionIdB}`,
      );
    }

    // Only merge auto-cluster and provisional (unblocked) pairs
    const shouldMerge =
      isHumanMerge ||
      (!pair.blocked &&
        (pair.band === 'auto-cluster' || pair.band === 'provisional'));

    if (shouldMerge) {
      union(pair.mentionIdA, pair.mentionIdB);
    }
  }

  // Collect clusters
  const clusterMap = new Map<string, string[]>();
  for (const m of mentions) {
    const root = find(m.entity_mention_id);
    if (!clusterMap.has(root)) clusterMap.set(root, []);
    clusterMap.get(root)!.push(m.entity_mention_id);
  }

  // Build mention lookup
  const mentionMap = new Map<string, EntityMention>();
  for (const m of mentions) {
    mentionMap.set(m.entity_mention_id, m);
  }

  // Create cluster records
  const clusters: ClusterRecord[] = [];
  for (const [, memberIds] of clusterMap) {
    // Determine cluster confidence: minimum pairwise confidence within the cluster
    let minConfidence = 1;
    let bestBand: DecisionBand = 'auto-cluster';

    for (const pair of pairResults) {
      const aInCluster = memberIds.includes(pair.mentionIdA);
      const bInCluster = memberIds.includes(pair.mentionIdB);
      if (aInCluster && bInCluster && !pair.blocked) {
        if (pair.confidence < minConfidence) {
          minConfidence = pair.confidence;
        }
      }
    }

    // For singletons, confidence is 1.0
    if (memberIds.length === 1) {
      minConfidence = 1;
    }

    bestBand = classifyBand(minConfidence);

    // Entity type from first member
    const firstMention = mentionMap.get(memberIds[0]);
    const entityType = firstMention?.entity_type ?? 'unknown';

    // Filter rationale to only pairs within this cluster
    const clusterPairRationale = pairRationale.filter(
      (p) => memberIds.includes(p.mentionIdA) && memberIds.includes(p.mentionIdB),
    );
    const clusterBlockers = blockersApplied.filter(
      (b) => memberIds.includes(b.mentionIdA) && memberIds.includes(b.mentionIdB),
    );

    clusters.push({
      cluster_id: generateId(),
      entity_type: entityType,
      member_mention_ids: memberIds.sort(),
      cluster_confidence: memberIds.length === 1 ? 1 : minConfidence,
      decision_status: bestBand,
      created_by: 'system:entity_resolution',
      rationale: {
        pairs: clusterPairRationale,
        blockers_applied: clusterBlockers,
        human_decisions_replayed: humanDecisionsReplayed.filter(
          (d) => {
            const parts = d.split(':');
            return memberIds.includes(parts[1]) && memberIds.includes(parts[2]);
          },
        ),
      },
    });
  }

  return clusters;
}

/**
 * Main clustering entry point.
 *
 * Groups mentions by entity_type, computes pairwise matches,
 * and builds clusters with blocker checks and human decision replay.
 */
export function clusterMentions(
  mentions: EntityMention[],
  humanDecisions: HumanIdentityDecision[],
  weights: MatchWeights = DEFAULT_MATCH_WEIGHTS,
): ClusterRecord[] {
  // Group by entity_type for efficiency
  const byType = new Map<string, EntityMention[]>();
  for (const m of mentions) {
    if (!byType.has(m.entity_type)) byType.set(m.entity_type, []);
    byType.get(m.entity_type)!.push(m);
  }

  const allClusters: ClusterRecord[] = [];

  for (const [, typeMentions] of byType) {
    const pairs = computePairwiseMatches(typeMentions, humanDecisions, weights);
    const clusters = buildClusters(typeMentions, pairs, humanDecisions);
    allClusters.push(...clusters);
  }

  return allClusters;
}
