/**
 * Candidate Eligibility & Exclusion Filters — F7.3-T3, F7.3-T4, F7.3-T8
 * PRD ref: §16.3, §16.5 R3.6, R3.10
 *
 * Eligibility criteria (all must pass):
 *   1. Person-like entity
 *   2. Has at least one path to a seed
 *   3. Has at least one qualifying role/donation/affiliation/signal
 *   4. Evidence confidence >= 0.40
 *   5. Not a known contact
 *   6. Not in rejection_log for the same seed
 *   7. Not an excluded intermediary or generic service entity
 *   8. Not a prior lead (already in candidate_recommendations with qualifying status)
 *
 * Queue limits per §16.5 R3.10:
 *   - Default review queue: top 50
 *   - Analytics export: top 200
 */

const PERSON_LIKE_TYPES = new Set(['person', 'individual', 'trustee', 'director']);
const DEFAULT_QUEUE_LIMIT = 50;
const ANALYTICS_EXPORT_LIMIT = 200;

export interface CandidateInput {
  entityId: string;
  entityType: string;
  /** Whether there is at least one path from this entity to the seed. */
  hasPathToSeed: boolean;
  /** Whether the entity has a qualifying role/donation/affiliation/signal. */
  hasQualifyingSignal: boolean;
  /** Confidence score from evidence (0-1). */
  confidence: number;
}

export interface ExclusionContext {
  /** IDs of known contacts where exclude_as_candidate = true. */
  knownContactIds: Set<string>;
  /** IDs of entities rejected for this specific seed. */
  rejectedForSeedIds: Set<string>;
  /** IDs of entities that are prior leads. */
  priorLeadIds: Set<string>;
  /** IDs of excluded intermediary entities. */
  excludedIntermediaryIds: Set<string>;
  /** IDs of generic service entities. */
  genericServiceEntityIds: Set<string>;
}

export type IneligibilityReason =
  | 'not_person_like'
  | 'no_path_to_seed'
  | 'no_qualifying_signal'
  | 'low_confidence'
  | 'known_contact'
  | 'rejected_for_seed'
  | 'prior_lead'
  | 'excluded_intermediary'
  | 'generic_service_entity';

export interface EligibilityResult {
  eligible: boolean;
  reason: IneligibilityReason | null;
}

/**
 * Check whether a candidate meets all eligibility criteria per §16.3.
 * Returns the first failing reason, or eligible=true.
 */
export function checkEligibility(
  candidate: CandidateInput,
  exclusions: ExclusionContext,
  minConfidence = 0.40,
): EligibilityResult {
  if (!PERSON_LIKE_TYPES.has(candidate.entityType.toLowerCase())) {
    return { eligible: false, reason: 'not_person_like' };
  }

  if (!candidate.hasPathToSeed) {
    return { eligible: false, reason: 'no_path_to_seed' };
  }

  if (!candidate.hasQualifyingSignal) {
    return { eligible: false, reason: 'no_qualifying_signal' };
  }

  if (candidate.confidence < minConfidence) {
    return { eligible: false, reason: 'low_confidence' };
  }

  // Exclusion filters (F7.3-T4)
  if (exclusions.knownContactIds.has(candidate.entityId)) {
    return { eligible: false, reason: 'known_contact' };
  }

  if (exclusions.rejectedForSeedIds.has(candidate.entityId)) {
    return { eligible: false, reason: 'rejected_for_seed' };
  }

  if (exclusions.priorLeadIds.has(candidate.entityId)) {
    return { eligible: false, reason: 'prior_lead' };
  }

  if (exclusions.excludedIntermediaryIds.has(candidate.entityId)) {
    return { eligible: false, reason: 'excluded_intermediary' };
  }

  if (exclusions.genericServiceEntityIds.has(candidate.entityId)) {
    return { eligible: false, reason: 'generic_service_entity' };
  }

  return { eligible: true, reason: null };
}

/**
 * Apply queue limit per §16.5 R3.10.
 * Candidates must already be sorted by priority (descending).
 */
export function applyQueueLimit<T>(
  candidates: T[],
  mode: 'review' | 'analytics' = 'review',
  seedCap: number | null = null,
): T[] {
  const modeLimit = mode === 'analytics' ? ANALYTICS_EXPORT_LIMIT : DEFAULT_QUEUE_LIMIT;
  // seed quality cap overrides mode limit if it's smaller
  const limit = seedCap !== null ? Math.min(seedCap, modeLimit) : modeLimit;
  return candidates.slice(0, limit);
}

export { DEFAULT_QUEUE_LIMIT, ANALYTICS_EXPORT_LIMIT };
