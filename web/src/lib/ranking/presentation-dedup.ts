/**
 * Presentation deduplication per PRD §18.4.
 *
 * Before producing candidate lists, run a presentation-layer dedup pass:
 * - Candidates above the presentation-merge threshold (0.75) are collapsed into one row.
 * - The collapsed row uses the highest score and aggregates evidence.
 * - The underlying graph remains unchanged.
 * - The reviewer can split or confirm groupings; both feed human_identity_decisions.
 */

import type { CandidateRecommendation } from '@/types/database';

/** Presentation merge threshold per Appendix A.4 */
export const PRESENTATION_MERGE_THRESHOLD = 0.75;

/** A similarity pair between two candidates */
export interface CandidateSimilarity {
  candidateA: string;
  candidateB: string;
  /** Similarity score (0-1) from identity resolution */
  similarity: number;
}

/** A presentation row representing one or more collapsed candidates */
export interface PresentationRow {
  /** Stable group ID for this presentation row */
  presentationGroupId: string;
  /** The primary candidate (highest scoring) */
  primaryCandidateId: string;
  /** All candidate recommendation IDs in this group */
  memberCandidateIds: string[];
  /** Highest priority score among members */
  priorityScore: number;
  /** Highest confidence score among members */
  confidenceScore: number;
  /** Aggregated reason codes from all members (deduplicated) */
  reasonCodes: string[];
  /** Aggregated identity warnings */
  identityWarnings: string[];
  /** Whether this group was confirmed or split by a reviewer */
  reviewerDecision: 'pending' | 'confirmed' | 'split' | null;
}

/**
 * Run presentation dedup on a list of candidate recommendations.
 * Candidates with similarity >= PRESENTATION_MERGE_THRESHOLD are collapsed.
 *
 * Uses a union-find approach to group transitively similar candidates.
 */
export function presentationDedup(
  candidates: CandidateRecommendation[],
  similarities: CandidateSimilarity[],
): PresentationRow[] {
  if (candidates.length === 0) return [];

  // Build union-find over candidate IDs
  const parent = new Map<string, string>();
  for (const c of candidates) {
    parent.set(c.candidate_recommendation_id, c.candidate_recommendation_id);
  }

  function find(x: string): string {
    let root = x;
    while (parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    // Path compression
    let current = x;
    while (current !== root) {
      const next = parent.get(current)!;
      parent.set(current, root);
      current = next;
    }
    return root;
  }

  function union(a: string, b: string): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent.set(rootB, rootA);
    }
  }

  // Merge candidates above threshold
  for (const sim of similarities) {
    if (sim.similarity >= PRESENTATION_MERGE_THRESHOLD) {
      if (parent.has(sim.candidateA) && parent.has(sim.candidateB)) {
        union(sim.candidateA, sim.candidateB);
      }
    }
  }

  // Group candidates by their root
  const groups = new Map<string, CandidateRecommendation[]>();
  for (const c of candidates) {
    const root = find(c.candidate_recommendation_id);
    const group = groups.get(root) ?? [];
    group.push(c);
    groups.set(root, group);
  }

  // Build presentation rows
  const rows: PresentationRow[] = [];
  for (const [groupRoot, members] of groups) {
    // Primary candidate: highest priority score
    const sorted = [...members].sort((a, b) => b.priority_score - a.priority_score);
    const primary = sorted[0];

    // Aggregate reason codes (deduplicated)
    const allReasonCodes = new Set<string>();
    for (const m of members) {
      for (const rc of m.reason_codes ?? []) {
        allReasonCodes.add(rc);
      }
    }

    // Aggregate identity warnings
    const allWarnings = new Set<string>();
    for (const m of members) {
      for (const w of m.identity_warnings ?? []) {
        allWarnings.add(w);
      }
    }

    rows.push({
      presentationGroupId: primary.presentation_group_id ?? groupRoot,
      primaryCandidateId: primary.candidate_recommendation_id,
      memberCandidateIds: members.map((m) => m.candidate_recommendation_id),
      priorityScore: Math.max(...members.map((m) => m.priority_score)),
      confidenceScore: Math.max(...members.map((m) => m.confidence_score)),
      reasonCodes: [...allReasonCodes],
      identityWarnings: [...allWarnings],
      reviewerDecision: members.length > 1 ? 'pending' : null,
    });
  }

  // Sort by priority score descending
  rows.sort((a, b) => b.priorityScore - a.priorityScore);

  return rows;
}

/** Result of a reviewer split/confirm action */
export interface PresentationDecisionResult {
  presentationGroupId: string;
  action: 'confirm' | 'split';
  /** Identity decisions to feed to human_identity_decisions */
  identityDecisions: Array<{
    entityAMentionId: string;
    entityBMentionId: string;
    decision: 'same_person' | 'not_same_person';
    reasonCode: string;
  }>;
}

/**
 * Confirm that all candidates in a presentation group are the same person.
 * Generates same_person identity decisions for all pairs.
 */
export function confirmPresentationGroup(
  row: PresentationRow,
  candidates: CandidateRecommendation[],
): PresentationDecisionResult {
  const memberCandidates = candidates.filter((c) =>
    row.memberCandidateIds.includes(c.candidate_recommendation_id),
  );

  const identityDecisions: PresentationDecisionResult['identityDecisions'] = [];

  // Generate pairwise same_person decisions
  for (let i = 0; i < memberCandidates.length; i++) {
    for (let j = i + 1; j < memberCandidates.length; j++) {
      identityDecisions.push({
        entityAMentionId: memberCandidates[i].candidate_entity_id,
        entityBMentionId: memberCandidates[j].candidate_entity_id,
        decision: 'same_person',
        reasonCode: 'presentation_group_confirmed',
      });
    }
  }

  return {
    presentationGroupId: row.presentationGroupId,
    action: 'confirm',
    identityDecisions,
  };
}

/**
 * Split a presentation group — candidates are not the same person.
 * Generates not_same_person identity decisions for all pairs.
 */
export function splitPresentationGroup(
  row: PresentationRow,
  candidates: CandidateRecommendation[],
): PresentationDecisionResult {
  const memberCandidates = candidates.filter((c) =>
    row.memberCandidateIds.includes(c.candidate_recommendation_id),
  );

  const identityDecisions: PresentationDecisionResult['identityDecisions'] = [];

  for (let i = 0; i < memberCandidates.length; i++) {
    for (let j = i + 1; j < memberCandidates.length; j++) {
      identityDecisions.push({
        entityAMentionId: memberCandidates[i].candidate_entity_id,
        entityBMentionId: memberCandidates[j].candidate_entity_id,
        decision: 'not_same_person',
        reasonCode: 'presentation_group_split',
      });
    }
  }

  return {
    presentationGroupId: row.presentationGroupId,
    action: 'split',
    identityDecisions,
  };
}
