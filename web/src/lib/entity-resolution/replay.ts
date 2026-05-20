/**
 * Human identity decision replay during graph construction (§15.5, R2.8).
 *
 * During graph build, load all replay_on_future_runs=true decisions and enforce
 * merge/split decisions, overriding auto-clustering. Log conflicts in quarantine
 * with identity_conflict reason.
 */

import type { HumanIdentityDecision } from '@/types/database';

/** A pair of mention IDs normalised so the smaller ID is always first. */
function normalisePair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function pairKey(a: string, b: string): string {
  const [x, y] = normalisePair(a, b);
  return `${x}|${y}`;
}

export interface DecisionIndex {
  /** Map from "mentionA|mentionB" -> decision */
  merges: Map<string, HumanIdentityDecision>;
  splits: Map<string, HumanIdentityDecision>;
  /** All mention IDs involved in a split, for fast blocker lookup */
  splitBlockedMentions: Set<string>;
}

/**
 * Build a decision index from active (non-superseded) decisions.
 * Only includes decisions where replay_on_future_runs is true.
 */
export function buildDecisionIndex(decisions: HumanIdentityDecision[]): DecisionIndex {
  const merges = new Map<string, HumanIdentityDecision>();
  const splits = new Map<string, HumanIdentityDecision>();
  const splitBlockedMentions = new Set<string>();

  // Only process active, replay-enabled decisions
  const active = decisions.filter((d) => d.replay_on_future_runs && !d.superseded_by);

  for (const decision of active) {
    const key = pairKey(decision.entity_a_mention_id, decision.entity_b_mention_id);

    if (decision.decision === 'same_person') {
      merges.set(key, decision);
    } else {
      splits.set(key, decision);
      splitBlockedMentions.add(decision.entity_a_mention_id);
      splitBlockedMentions.add(decision.entity_b_mention_id);
    }
  }

  return { merges, splits, splitBlockedMentions };
}

export interface ConflictRecord {
  mentionA: string;
  mentionB: string;
  humanDecision: 'same_person' | 'not_same_person';
  autoSuggestion: 'merge' | 'split';
  decisionId: string;
}

/**
 * Check if auto-clustering wants to merge two mentions that a human split,
 * or split two mentions that a human merged. Returns a conflict record if so.
 */
export function checkConflict(
  index: DecisionIndex,
  mentionA: string,
  mentionB: string,
  autoAction: 'merge' | 'split',
): ConflictRecord | null {
  const key = pairKey(mentionA, mentionB);

  if (autoAction === 'merge' && index.splits.has(key)) {
    const decision = index.splits.get(key)!;
    return {
      mentionA,
      mentionB,
      humanDecision: 'not_same_person',
      autoSuggestion: 'merge',
      decisionId: decision.identity_decision_id,
    };
  }

  if (autoAction === 'split' && index.merges.has(key)) {
    const decision = index.merges.get(key)!;
    return {
      mentionA,
      mentionB,
      humanDecision: 'same_person',
      autoSuggestion: 'split',
      decisionId: decision.identity_decision_id,
    };
  }

  return null;
}

/**
 * Determine if an auto-merge between two mentions is blocked.
 * Blocked if a human split decision exists between them (§15.4, §15.5).
 */
export function isMergeBlocked(index: DecisionIndex, mentionA: string, mentionB: string): boolean {
  const key = pairKey(mentionA, mentionB);
  return index.splits.has(key);
}

/**
 * Get the enforced decision for a mention pair, if one exists.
 * Human decisions always win over auto-clustering.
 */
export function getEnforcedDecision(
  index: DecisionIndex,
  mentionA: string,
  mentionB: string,
): HumanIdentityDecision | null {
  const key = pairKey(mentionA, mentionB);
  return index.merges.get(key) ?? index.splits.get(key) ?? null;
}

/**
 * Apply human decisions to a set of auto-generated clusters.
 * Returns adjusted clusters and any conflicts that need quarantining.
 */
export function replayDecisions(
  index: DecisionIndex,
  clusters: { mentionIds: string[]; confidence: number }[],
): {
  adjustedClusters: { mentionIds: string[]; confidence: number }[];
  conflicts: ConflictRecord[];
} {
  const conflicts: ConflictRecord[] = [];
  const adjustedClusters: { mentionIds: string[]; confidence: number }[] = [];

  for (const cluster of clusters) {
    const { mentionIds } = cluster;
    // Check all pairs within this cluster for split decisions
    const splitPairs: Set<string> = new Set();

    for (let i = 0; i < mentionIds.length; i++) {
      for (let j = i + 1; j < mentionIds.length; j++) {
        const a = mentionIds[i];
        const b = mentionIds[j];

        if (isMergeBlocked(index, a, b)) {
          // Human says these are NOT the same person but auto wants to merge
          const conflict = checkConflict(index, a, b, 'merge');
          if (conflict) conflicts.push(conflict);
          splitPairs.add(pairKey(a, b));
        }
      }
    }

    if (splitPairs.size === 0) {
      // No splits needed, keep cluster intact
      adjustedClusters.push(cluster);
    } else {
      // Split cluster: use union-find to group mentions not blocked from each other
      const groups = splitCluster(mentionIds, splitPairs);
      for (const group of groups) {
        adjustedClusters.push({ mentionIds: group, confidence: cluster.confidence });
      }
    }
  }

  // Now enforce merges: find mention pairs that should be in the same cluster
  for (const [, decision] of index.merges) {
    const a = decision.entity_a_mention_id;
    const b = decision.entity_b_mention_id;

    // Find which clusters contain a and b
    let clusterA = -1;
    let clusterB = -1;
    for (let i = 0; i < adjustedClusters.length; i++) {
      if (adjustedClusters[i].mentionIds.includes(a)) clusterA = i;
      if (adjustedClusters[i].mentionIds.includes(b)) clusterB = i;
    }

    // Both must exist in the current set and be in different clusters
    if (clusterA >= 0 && clusterB >= 0 && clusterA !== clusterB) {
      // Check no split blocks the merge of any pair across the two clusters
      const aMentions = adjustedClusters[clusterA].mentionIds;
      const bMentions = adjustedClusters[clusterB].mentionIds;
      let blocked = false;

      for (const am of aMentions) {
        for (const bm of bMentions) {
          if (isMergeBlocked(index, am, bm)) {
            blocked = true;
            break;
          }
        }
        if (blocked) break;
      }

      if (!blocked) {
        // Merge the two clusters
        const merged = {
          mentionIds: [...aMentions, ...bMentions],
          confidence: Math.max(adjustedClusters[clusterA].confidence, adjustedClusters[clusterB].confidence),
        };
        // Remove old clusters (higher index first to avoid shifting)
        const [lo, hi] = clusterA < clusterB ? [clusterA, clusterB] : [clusterB, clusterA];
        adjustedClusters.splice(hi, 1);
        adjustedClusters.splice(lo, 1);
        adjustedClusters.push(merged);
      }
    }
  }

  return { adjustedClusters, conflicts };
}

/**
 * Split a cluster of mentions into groups where no two members have a split decision.
 * Uses greedy assignment: mentions with split constraints are placed in the first
 * group that does not conflict, or a new group is created.
 */
function splitCluster(mentionIds: string[], splitPairs: Set<string>): string[][] {
  // Collect which mentions are involved in any split
  const splitInvolved = new Set<string>();
  for (const key of splitPairs) {
    const [a, b] = key.split('|');
    splitInvolved.add(a);
    splitInvolved.add(b);
  }

  const groups: string[][] = [];

  for (const id of mentionIds) {
    let placed = false;
    for (const group of groups) {
      // Check if adding id to this group would violate any split constraint
      const conflicts = group.some((member) => splitPairs.has(pairKey(id, member)));
      if (!conflicts) {
        group.push(id);
        placed = true;
        break;
      }
    }
    if (!placed) {
      groups.push([id]);
    }
  }

  return groups;
}
