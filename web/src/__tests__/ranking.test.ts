/**
 * Tests for Epic 9 — Ranking, Presentation Dedup, and Epic 8.5 — Enrichment API.
 *
 * Covers:
 * - Capacity signal calculation (F9.1-T1, §18.3)
 * - Priority score with all 5 components (F9.1-T2, §18.1)
 * - Confidence score with all 4 components (F9.1-T3, §18.2)
 * - Score storage on candidate_recommendations (F9.1-T4)
 * - Presentation dedup: collapse, highest score, evidence aggregation (F9.2-T1, §18.4)
 * - Split/confirm of presentation rows (F9.2-T2)
 * - Enrichment API endpoint validation (F8.5)
 *
 * Pure functions — no Supabase required.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateCapacitySignal,
  type CapacityInput,
} from '@/lib/ranking/capacity';
import {
  calculatePriorityScore,
  PRIORITY_WEIGHTS,
  type PriorityInput,
} from '@/lib/ranking/priority';
import {
  calculateConfidenceScore,
  CONFIDENCE_WEIGHTS,
  type ConfidenceInput,
} from '@/lib/ranking/confidence';
import {
  presentationDedup,
  confirmPresentationGroup,
  splitPresentationGroup,
  PRESENTATION_MERGE_THRESHOLD,
  type CandidateSimilarity,
  type PresentationRow,
} from '@/lib/ranking/presentation-dedup';
import { SOURCE_TIER } from '@/lib/enrichment/types';
import type { CandidateRecommendation } from '@/types/database';

// ===================================================================
// Helpers
// ===================================================================

function makeCandidate(
  overrides: Partial<CandidateRecommendation> & { candidate_recommendation_id: string },
): CandidateRecommendation {
  return {
    run_id: 'run_001',
    seed_id: 'seed_001',
    candidate_entity_id: `ent_${overrides.candidate_recommendation_id}`,
    presentation_group_id: null,
    rank: 1,
    priority_score: 0.5,
    confidence_score: 0.5,
    status: 'discovered',
    strongest_path: {},
    reason_codes: [],
    identity_warnings: [],
    introduction_route_id: null,
    target_seed_id: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ===================================================================
// F9.1-T1: Capacity Signal (§18.3)
// ===================================================================

describe('Capacity Signal (F9.1-T1, §18.3)', () => {
  it('returns 0 for empty input', () => {
    const input: CapacityInput = {
      donationCount: 0,
      foundationTrustRoles: 0,
      seniorRoles: 0,
      directorships: 0,
      boardMemberships: 0,
      philanthropicAffiliations: 0,
      leadershipRoles: 0,
      institutionalConnections: 0,
    };
    const result = calculateCapacitySignal(input);
    expect(result.score).toBe(0);
    expect(result.indicators).toHaveLength(0);
  });

  it('includes donation history indicator', () => {
    const input: CapacityInput = {
      donationCount: 3,
      foundationTrustRoles: 0,
      seniorRoles: 0,
      directorships: 0,
      boardMemberships: 0,
      philanthropicAffiliations: 0,
      leadershipRoles: 0,
      institutionalConnections: 0,
    };
    const result = calculateCapacitySignal(input);
    expect(result.score).toBeGreaterThan(0);
    const donationInd = result.indicators.find((i) => i.category === 'donation_history');
    expect(donationInd).toBeDefined();
    expect(donationInd!.score).toBeGreaterThan(0);
    expect(donationInd!.description).toContain('3 donation');
  });

  it('includes foundation/trust involvement indicator', () => {
    const input: CapacityInput = {
      donationCount: 0,
      foundationTrustRoles: 2,
      seniorRoles: 0,
      directorships: 0,
      boardMemberships: 0,
      philanthropicAffiliations: 0,
      leadershipRoles: 0,
      institutionalConnections: 0,
    };
    const result = calculateCapacitySignal(input);
    expect(result.score).toBeGreaterThan(0);
    expect(result.indicators.find((i) => i.category === 'foundation_trust_involvement')).toBeDefined();
  });

  it('aggregates all eight capacity categories', () => {
    const input: CapacityInput = {
      donationCount: 5,
      foundationTrustRoles: 2,
      seniorRoles: 1,
      directorships: 3,
      boardMemberships: 2,
      philanthropicAffiliations: 4,
      leadershipRoles: 1,
      institutionalConnections: 2,
    };
    const result = calculateCapacitySignal(input);
    expect(result.score).toBeGreaterThan(0.5);
    expect(result.indicators).toHaveLength(8);
  });

  it('score increases with more indicators', () => {
    const low: CapacityInput = {
      donationCount: 1,
      foundationTrustRoles: 0,
      seniorRoles: 0,
      directorships: 0,
      boardMemberships: 0,
      philanthropicAffiliations: 0,
      leadershipRoles: 0,
      institutionalConnections: 0,
    };
    const high: CapacityInput = {
      donationCount: 5,
      foundationTrustRoles: 3,
      seniorRoles: 2,
      directorships: 4,
      boardMemberships: 3,
      philanthropicAffiliations: 5,
      leadershipRoles: 2,
      institutionalConnections: 3,
    };
    expect(calculateCapacitySignal(high).score).toBeGreaterThan(
      calculateCapacitySignal(low).score,
    );
  });

  it('score is bounded between 0 and 1', () => {
    const extreme: CapacityInput = {
      donationCount: 100,
      foundationTrustRoles: 100,
      seniorRoles: 100,
      directorships: 100,
      boardMemberships: 100,
      philanthropicAffiliations: 100,
      leadershipRoles: 100,
      institutionalConnections: 100,
    };
    const result = calculateCapacitySignal(extreme);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('uses diminishing returns (10 donations is not 10x 1 donation)', () => {
    const one: CapacityInput = {
      donationCount: 1,
      foundationTrustRoles: 0,
      seniorRoles: 0,
      directorships: 0,
      boardMemberships: 0,
      philanthropicAffiliations: 0,
      leadershipRoles: 0,
      institutionalConnections: 0,
    };
    const ten: CapacityInput = {
      donationCount: 10,
      foundationTrustRoles: 0,
      seniorRoles: 0,
      directorships: 0,
      boardMemberships: 0,
      philanthropicAffiliations: 0,
      leadershipRoles: 0,
      institutionalConnections: 0,
    };
    const oneScore = calculateCapacitySignal(one).score;
    const tenScore = calculateCapacitySignal(ten).score;
    // 10x input should NOT produce 10x score
    expect(tenScore / oneScore).toBeLessThan(10);
    expect(tenScore).toBeGreaterThan(oneScore);
  });
});

// ===================================================================
// F9.1-T2: Priority Score (§18.1)
// ===================================================================

describe('Priority Score (F9.1-T2, §18.1)', () => {
  it('has correct weights per §18.1 / Appendix A.3', () => {
    expect(PRIORITY_WEIGHTS.introability).toBe(0.30);
    expect(PRIORITY_WEIGHTS.affinity).toBe(0.25);
    expect(PRIORITY_WEIGHTS.capacity_signal).toBe(0.20);
    expect(PRIORITY_WEIGHTS.influence).toBe(0.15);
    expect(PRIORITY_WEIGHTS.strategic_fit).toBe(0.10);
  });

  it('weights sum to 1.0', () => {
    const sum = Object.values(PRIORITY_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('returns 0 when all inputs are 0', () => {
    const result = calculatePriorityScore({
      introabilityScore: 0,
      affinityScore: 0,
      capacitySignalScore: 0,
      influenceScore: 0,
      strategicFitScore: 0,
    });
    expect(result.score).toBe(0);
  });

  it('returns 1 when all inputs are 1', () => {
    const result = calculatePriorityScore({
      introabilityScore: 1,
      affinityScore: 1,
      capacitySignalScore: 1,
      influenceScore: 1,
      strategicFitScore: 1,
    });
    expect(result.score).toBeCloseTo(1.0, 10);
  });

  it('introability has the highest weight (0.30)', () => {
    const withIntroability = calculatePriorityScore({
      introabilityScore: 1,
      affinityScore: 0,
      capacitySignalScore: 0,
      influenceScore: 0,
      strategicFitScore: 0,
    });
    const withStrategicFit = calculatePriorityScore({
      introabilityScore: 0,
      affinityScore: 0,
      capacitySignalScore: 0,
      influenceScore: 0,
      strategicFitScore: 1,
    });
    expect(withIntroability.score).toBeGreaterThan(withStrategicFit.score);
    expect(withIntroability.score).toBeCloseTo(0.30, 10);
    expect(withStrategicFit.score).toBeCloseTo(0.10, 10);
  });

  it('provides correct breakdown for each component', () => {
    const input: PriorityInput = {
      introabilityScore: 0.8,
      affinityScore: 0.6,
      capacitySignalScore: 0.7,
      influenceScore: 0.5,
      strategicFitScore: 0.9,
    };
    const result = calculatePriorityScore(input);

    expect(result.breakdown.introability.raw).toBe(0.8);
    expect(result.breakdown.introability.weighted).toBeCloseTo(0.30 * 0.8, 10);
    expect(result.breakdown.affinity.raw).toBe(0.6);
    expect(result.breakdown.affinity.weighted).toBeCloseTo(0.25 * 0.6, 10);
    expect(result.breakdown.capacity_signal.raw).toBe(0.7);
    expect(result.breakdown.capacity_signal.weighted).toBeCloseTo(0.20 * 0.7, 10);
    expect(result.breakdown.influence.raw).toBe(0.5);
    expect(result.breakdown.influence.weighted).toBeCloseTo(0.15 * 0.5, 10);
    expect(result.breakdown.strategic_fit.raw).toBe(0.9);
    expect(result.breakdown.strategic_fit.weighted).toBeCloseTo(0.10 * 0.9, 10);
  });

  it('score matches sum of weighted components', () => {
    const input: PriorityInput = {
      introabilityScore: 0.8,
      affinityScore: 0.6,
      capacitySignalScore: 0.7,
      influenceScore: 0.5,
      strategicFitScore: 0.9,
    };
    const result = calculatePriorityScore(input);
    const expected =
      0.30 * 0.8 + 0.25 * 0.6 + 0.20 * 0.7 + 0.15 * 0.5 + 0.10 * 0.9;
    expect(result.score).toBeCloseTo(expected, 10);
  });

  it('clamps inputs above 1 to 1', () => {
    const result = calculatePriorityScore({
      introabilityScore: 1.5,
      affinityScore: 0.5,
      capacitySignalScore: 0.5,
      influenceScore: 0.5,
      strategicFitScore: 0.5,
    });
    expect(result.breakdown.introability.raw).toBe(1);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('clamps inputs below 0 to 0', () => {
    const result = calculatePriorityScore({
      introabilityScore: -0.5,
      affinityScore: 0.5,
      capacitySignalScore: 0.5,
      influenceScore: 0.5,
      strategicFitScore: 0.5,
    });
    expect(result.breakdown.introability.raw).toBe(0);
    expect(result.breakdown.introability.weighted).toBe(0);
  });
});

// ===================================================================
// F9.1-T3: Confidence Score (§18.2)
// ===================================================================

describe('Confidence Score (F9.1-T3, §18.2)', () => {
  it('has correct weights per §18.2 / Appendix A.3', () => {
    expect(CONFIDENCE_WEIGHTS.identity).toBe(0.35);
    expect(CONFIDENCE_WEIGHTS.relationship).toBe(0.30);
    expect(CONFIDENCE_WEIGHTS.source_corroboration).toBe(0.20);
    expect(CONFIDENCE_WEIGHTS.freshness).toBe(0.15);
  });

  it('weights sum to 1.0', () => {
    const sum = Object.values(CONFIDENCE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('returns 0 when all inputs are 0', () => {
    const result = calculateConfidenceScore({
      identityConfidence: 0,
      relationshipConfidence: 0,
      sourceCorroborationScore: 0,
      freshnessScore: 0,
    });
    expect(result.score).toBe(0);
  });

  it('returns 1 when all inputs are 1', () => {
    const result = calculateConfidenceScore({
      identityConfidence: 1,
      relationshipConfidence: 1,
      sourceCorroborationScore: 1,
      freshnessScore: 1,
    });
    expect(result.score).toBeCloseTo(1.0, 10);
  });

  it('identity has the highest weight (0.35)', () => {
    const withIdentity = calculateConfidenceScore({
      identityConfidence: 1,
      relationshipConfidence: 0,
      sourceCorroborationScore: 0,
      freshnessScore: 0,
    });
    const withFreshness = calculateConfidenceScore({
      identityConfidence: 0,
      relationshipConfidence: 0,
      sourceCorroborationScore: 0,
      freshnessScore: 1,
    });
    expect(withIdentity.score).toBeGreaterThan(withFreshness.score);
    expect(withIdentity.score).toBeCloseTo(0.35, 10);
    expect(withFreshness.score).toBeCloseTo(0.15, 10);
  });

  it('provides correct breakdown for each component', () => {
    const input: ConfidenceInput = {
      identityConfidence: 0.9,
      relationshipConfidence: 0.8,
      sourceCorroborationScore: 0.6,
      freshnessScore: 0.7,
    };
    const result = calculateConfidenceScore(input);

    expect(result.breakdown.identity.raw).toBe(0.9);
    expect(result.breakdown.identity.weighted).toBeCloseTo(0.35 * 0.9, 10);
    expect(result.breakdown.relationship.raw).toBe(0.8);
    expect(result.breakdown.relationship.weighted).toBeCloseTo(0.30 * 0.8, 10);
    expect(result.breakdown.source_corroboration.raw).toBe(0.6);
    expect(result.breakdown.source_corroboration.weighted).toBeCloseTo(0.20 * 0.6, 10);
    expect(result.breakdown.freshness.raw).toBe(0.7);
    expect(result.breakdown.freshness.weighted).toBeCloseTo(0.15 * 0.7, 10);
  });

  it('score matches sum of weighted components', () => {
    const input: ConfidenceInput = {
      identityConfidence: 0.9,
      relationshipConfidence: 0.8,
      sourceCorroborationScore: 0.6,
      freshnessScore: 0.7,
    };
    const result = calculateConfidenceScore(input);
    const expected = 0.35 * 0.9 + 0.30 * 0.8 + 0.20 * 0.6 + 0.15 * 0.7;
    expect(result.score).toBeCloseTo(expected, 10);
  });

  it('clamps inputs to 0-1 range', () => {
    const result = calculateConfidenceScore({
      identityConfidence: 2.0,
      relationshipConfidence: -0.5,
      sourceCorroborationScore: 0.5,
      freshnessScore: 0.5,
    });
    expect(result.breakdown.identity.raw).toBe(1);
    expect(result.breakdown.relationship.raw).toBe(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

// ===================================================================
// F9.1-T4: Score Storage
// ===================================================================

describe('Score Storage (F9.1-T4)', () => {
  it('priority and confidence scores can be assigned to candidate_recommendations shape', () => {
    const priorityResult = calculatePriorityScore({
      introabilityScore: 0.8,
      affinityScore: 0.7,
      capacitySignalScore: 0.6,
      influenceScore: 0.5,
      strategicFitScore: 0.4,
    });
    const confidenceResult = calculateConfidenceScore({
      identityConfidence: 0.9,
      relationshipConfidence: 0.85,
      sourceCorroborationScore: 0.7,
      freshnessScore: 0.8,
    });

    const candidate: CandidateRecommendation = makeCandidate({
      candidate_recommendation_id: 'cr_001',
      priority_score: priorityResult.score,
      confidence_score: confidenceResult.score,
    });

    expect(candidate.priority_score).toBe(priorityResult.score);
    expect(candidate.confidence_score).toBe(confidenceResult.score);
    expect(candidate.priority_score).toBeGreaterThan(0);
    expect(candidate.priority_score).toBeLessThanOrEqual(1);
    expect(candidate.confidence_score).toBeGreaterThan(0);
    expect(candidate.confidence_score).toBeLessThanOrEqual(1);
  });

  it('scores are stored as separate dimensions on the same record', () => {
    const candidate: CandidateRecommendation = makeCandidate({
      candidate_recommendation_id: 'cr_002',
      priority_score: 0.82,
      confidence_score: 0.65,
    });

    // Both scores present and independent
    expect(candidate.priority_score).not.toBe(candidate.confidence_score);
    expect(typeof candidate.priority_score).toBe('number');
    expect(typeof candidate.confidence_score).toBe('number');
  });
});

// ===================================================================
// F9.2-T1: Presentation Deduplication (§18.4)
// ===================================================================

describe('Presentation Dedup (F9.2-T1, §18.4)', () => {
  it('merge threshold is 0.75 per Appendix A.4', () => {
    expect(PRESENTATION_MERGE_THRESHOLD).toBe(0.75);
  });

  it('returns one row per candidate when no similarities', () => {
    const candidates = [
      makeCandidate({ candidate_recommendation_id: 'cr_001' }),
      makeCandidate({ candidate_recommendation_id: 'cr_002' }),
    ];
    const rows = presentationDedup(candidates, []);
    expect(rows).toHaveLength(2);
    expect(rows[0].memberCandidateIds).toHaveLength(1);
    expect(rows[1].memberCandidateIds).toHaveLength(1);
  });

  it('returns empty array for empty input', () => {
    expect(presentationDedup([], [])).toEqual([]);
  });

  it('collapses candidates above threshold into one row', () => {
    const candidates = [
      makeCandidate({ candidate_recommendation_id: 'cr_001', priority_score: 0.8 }),
      makeCandidate({ candidate_recommendation_id: 'cr_002', priority_score: 0.6 }),
    ];
    const similarities: CandidateSimilarity[] = [
      { candidateA: 'cr_001', candidateB: 'cr_002', similarity: 0.85 },
    ];
    const rows = presentationDedup(candidates, similarities);
    expect(rows).toHaveLength(1);
    expect(rows[0].memberCandidateIds).toContain('cr_001');
    expect(rows[0].memberCandidateIds).toContain('cr_002');
  });

  it('does not collapse candidates below threshold', () => {
    const candidates = [
      makeCandidate({ candidate_recommendation_id: 'cr_001' }),
      makeCandidate({ candidate_recommendation_id: 'cr_002' }),
    ];
    const similarities: CandidateSimilarity[] = [
      { candidateA: 'cr_001', candidateB: 'cr_002', similarity: 0.50 },
    ];
    const rows = presentationDedup(candidates, similarities);
    expect(rows).toHaveLength(2);
  });

  it('does not collapse candidates at exactly the threshold', () => {
    const candidates = [
      makeCandidate({ candidate_recommendation_id: 'cr_001' }),
      makeCandidate({ candidate_recommendation_id: 'cr_002' }),
    ];
    const similarities: CandidateSimilarity[] = [
      { candidateA: 'cr_001', candidateB: 'cr_002', similarity: 0.749 },
    ];
    const rows = presentationDedup(candidates, similarities);
    expect(rows).toHaveLength(2);
  });

  it('collapses at exactly the threshold', () => {
    const candidates = [
      makeCandidate({ candidate_recommendation_id: 'cr_001' }),
      makeCandidate({ candidate_recommendation_id: 'cr_002' }),
    ];
    const similarities: CandidateSimilarity[] = [
      { candidateA: 'cr_001', candidateB: 'cr_002', similarity: 0.75 },
    ];
    const rows = presentationDedup(candidates, similarities);
    expect(rows).toHaveLength(1);
  });

  it('uses highest priority score in collapsed row', () => {
    const candidates = [
      makeCandidate({ candidate_recommendation_id: 'cr_001', priority_score: 0.6 }),
      makeCandidate({ candidate_recommendation_id: 'cr_002', priority_score: 0.9 }),
    ];
    const similarities: CandidateSimilarity[] = [
      { candidateA: 'cr_001', candidateB: 'cr_002', similarity: 0.80 },
    ];
    const rows = presentationDedup(candidates, similarities);
    expect(rows[0].priorityScore).toBe(0.9);
  });

  it('uses highest confidence score in collapsed row', () => {
    const candidates = [
      makeCandidate({ candidate_recommendation_id: 'cr_001', confidence_score: 0.5 }),
      makeCandidate({ candidate_recommendation_id: 'cr_002', confidence_score: 0.85 }),
    ];
    const similarities: CandidateSimilarity[] = [
      { candidateA: 'cr_001', candidateB: 'cr_002', similarity: 0.80 },
    ];
    const rows = presentationDedup(candidates, similarities);
    expect(rows[0].confidenceScore).toBe(0.85);
  });

  it('aggregates reason codes from all members (deduplicated)', () => {
    const candidates = [
      makeCandidate({
        candidate_recommendation_id: 'cr_001',
        reason_codes: ['trustee_co_service', 'shared_charity'],
      }),
      makeCandidate({
        candidate_recommendation_id: 'cr_002',
        reason_codes: ['shared_charity', 'donation_chain'],
      }),
    ];
    const similarities: CandidateSimilarity[] = [
      { candidateA: 'cr_001', candidateB: 'cr_002', similarity: 0.80 },
    ];
    const rows = presentationDedup(candidates, similarities);
    expect(rows[0].reasonCodes).toContain('trustee_co_service');
    expect(rows[0].reasonCodes).toContain('shared_charity');
    expect(rows[0].reasonCodes).toContain('donation_chain');
    // No duplicates
    const unique = new Set(rows[0].reasonCodes);
    expect(unique.size).toBe(rows[0].reasonCodes.length);
  });

  it('aggregates identity warnings', () => {
    const candidates = [
      makeCandidate({
        candidate_recommendation_id: 'cr_001',
        identity_warnings: ['possible_duplicate'],
      }),
      makeCandidate({
        candidate_recommendation_id: 'cr_002',
        identity_warnings: ['name_mismatch'],
      }),
    ];
    const similarities: CandidateSimilarity[] = [
      { candidateA: 'cr_001', candidateB: 'cr_002', similarity: 0.80 },
    ];
    const rows = presentationDedup(candidates, similarities);
    expect(rows[0].identityWarnings).toContain('possible_duplicate');
    expect(rows[0].identityWarnings).toContain('name_mismatch');
  });

  it('primary candidate is the one with highest priority score', () => {
    const candidates = [
      makeCandidate({ candidate_recommendation_id: 'cr_001', priority_score: 0.6 }),
      makeCandidate({ candidate_recommendation_id: 'cr_002', priority_score: 0.9 }),
    ];
    const similarities: CandidateSimilarity[] = [
      { candidateA: 'cr_001', candidateB: 'cr_002', similarity: 0.80 },
    ];
    const rows = presentationDedup(candidates, similarities);
    expect(rows[0].primaryCandidateId).toBe('cr_002');
  });

  it('handles transitive similarity (A~B, B~C -> all grouped)', () => {
    const candidates = [
      makeCandidate({ candidate_recommendation_id: 'cr_001', priority_score: 0.7 }),
      makeCandidate({ candidate_recommendation_id: 'cr_002', priority_score: 0.8 }),
      makeCandidate({ candidate_recommendation_id: 'cr_003', priority_score: 0.6 }),
    ];
    const similarities: CandidateSimilarity[] = [
      { candidateA: 'cr_001', candidateB: 'cr_002', similarity: 0.80 },
      { candidateA: 'cr_002', candidateB: 'cr_003', similarity: 0.78 },
    ];
    const rows = presentationDedup(candidates, similarities);
    expect(rows).toHaveLength(1);
    expect(rows[0].memberCandidateIds).toHaveLength(3);
  });

  it('marks multi-member groups as pending review', () => {
    const candidates = [
      makeCandidate({ candidate_recommendation_id: 'cr_001' }),
      makeCandidate({ candidate_recommendation_id: 'cr_002' }),
    ];
    const similarities: CandidateSimilarity[] = [
      { candidateA: 'cr_001', candidateB: 'cr_002', similarity: 0.80 },
    ];
    const rows = presentationDedup(candidates, similarities);
    expect(rows[0].reviewerDecision).toBe('pending');
  });

  it('single-member groups have null reviewer decision', () => {
    const candidates = [
      makeCandidate({ candidate_recommendation_id: 'cr_001' }),
    ];
    const rows = presentationDedup(candidates, []);
    expect(rows[0].reviewerDecision).toBeNull();
  });

  it('sorts output rows by priority score descending', () => {
    const candidates = [
      makeCandidate({ candidate_recommendation_id: 'cr_001', priority_score: 0.4 }),
      makeCandidate({ candidate_recommendation_id: 'cr_002', priority_score: 0.9 }),
      makeCandidate({ candidate_recommendation_id: 'cr_003', priority_score: 0.7 }),
    ];
    const rows = presentationDedup(candidates, []);
    expect(rows[0].priorityScore).toBe(0.9);
    expect(rows[1].priorityScore).toBe(0.7);
    expect(rows[2].priorityScore).toBe(0.4);
  });

  it('graph remains unchanged (pure function)', () => {
    const candidates = [
      makeCandidate({ candidate_recommendation_id: 'cr_001' }),
      makeCandidate({ candidate_recommendation_id: 'cr_002' }),
    ];
    const similarities: CandidateSimilarity[] = [
      { candidateA: 'cr_001', candidateB: 'cr_002', similarity: 0.80 },
    ];
    const original = JSON.parse(JSON.stringify(candidates));
    presentationDedup(candidates, similarities);
    // Input candidates should not be mutated
    expect(JSON.stringify(candidates)).toBe(JSON.stringify(original));
  });
});

// ===================================================================
// F9.2-T2: Split/Confirm Presentation Rows
// ===================================================================

describe('Split/Confirm Presentation Rows (F9.2-T2)', () => {
  const candidates = [
    makeCandidate({
      candidate_recommendation_id: 'cr_001',
      candidate_entity_id: 'ent_A',
      priority_score: 0.8,
    }),
    makeCandidate({
      candidate_recommendation_id: 'cr_002',
      candidate_entity_id: 'ent_B',
      priority_score: 0.6,
    }),
    makeCandidate({
      candidate_recommendation_id: 'cr_003',
      candidate_entity_id: 'ent_C',
      priority_score: 0.7,
    }),
  ];

  const groupRow: PresentationRow = {
    presentationGroupId: 'pg_001',
    primaryCandidateId: 'cr_001',
    memberCandidateIds: ['cr_001', 'cr_002', 'cr_003'],
    priorityScore: 0.8,
    confidenceScore: 0.7,
    reasonCodes: ['trustee_co_service'],
    identityWarnings: [],
    reviewerDecision: 'pending',
  };

  describe('confirmPresentationGroup', () => {
    it('generates same_person decisions for all pairs', () => {
      const result = confirmPresentationGroup(groupRow, candidates);
      expect(result.action).toBe('confirm');
      // 3 candidates = 3 pairs (A-B, A-C, B-C)
      expect(result.identityDecisions).toHaveLength(3);
      for (const d of result.identityDecisions) {
        expect(d.decision).toBe('same_person');
        expect(d.reasonCode).toBe('presentation_group_confirmed');
      }
    });

    it('includes correct entity IDs in decisions', () => {
      const result = confirmPresentationGroup(groupRow, candidates);
      const entityPairs = result.identityDecisions.map(
        (d) => `${d.entityAMentionId}:${d.entityBMentionId}`,
      );
      expect(entityPairs).toContain('ent_A:ent_B');
      expect(entityPairs).toContain('ent_A:ent_C');
      expect(entityPairs).toContain('ent_B:ent_C');
    });

    it('returns correct presentation group ID', () => {
      const result = confirmPresentationGroup(groupRow, candidates);
      expect(result.presentationGroupId).toBe('pg_001');
    });
  });

  describe('splitPresentationGroup', () => {
    it('generates not_same_person decisions for all pairs', () => {
      const result = splitPresentationGroup(groupRow, candidates);
      expect(result.action).toBe('split');
      expect(result.identityDecisions).toHaveLength(3);
      for (const d of result.identityDecisions) {
        expect(d.decision).toBe('not_same_person');
        expect(d.reasonCode).toBe('presentation_group_split');
      }
    });

    it('includes correct entity IDs in decisions', () => {
      const result = splitPresentationGroup(groupRow, candidates);
      const entityPairs = result.identityDecisions.map(
        (d) => `${d.entityAMentionId}:${d.entityBMentionId}`,
      );
      expect(entityPairs).toContain('ent_A:ent_B');
      expect(entityPairs).toContain('ent_A:ent_C');
      expect(entityPairs).toContain('ent_B:ent_C');
    });
  });

  describe('two-member group', () => {
    const twoMemberRow: PresentationRow = {
      presentationGroupId: 'pg_002',
      primaryCandidateId: 'cr_001',
      memberCandidateIds: ['cr_001', 'cr_002'],
      priorityScore: 0.8,
      confidenceScore: 0.7,
      reasonCodes: [],
      identityWarnings: [],
      reviewerDecision: 'pending',
    };

    it('confirm generates 1 pair decision', () => {
      const result = confirmPresentationGroup(twoMemberRow, candidates);
      expect(result.identityDecisions).toHaveLength(1);
      expect(result.identityDecisions[0].decision).toBe('same_person');
    });

    it('split generates 1 pair decision', () => {
      const result = splitPresentationGroup(twoMemberRow, candidates);
      expect(result.identityDecisions).toHaveLength(1);
      expect(result.identityDecisions[0].decision).toBe('not_same_person');
    });
  });

  describe('single-member group', () => {
    const singleRow: PresentationRow = {
      presentationGroupId: 'pg_003',
      primaryCandidateId: 'cr_001',
      memberCandidateIds: ['cr_001'],
      priorityScore: 0.8,
      confidenceScore: 0.7,
      reasonCodes: [],
      identityWarnings: [],
      reviewerDecision: null,
    };

    it('confirm generates 0 decisions for single member', () => {
      const result = confirmPresentationGroup(singleRow, candidates);
      expect(result.identityDecisions).toHaveLength(0);
    });

    it('split generates 0 decisions for single member', () => {
      const result = splitPresentationGroup(singleRow, candidates);
      expect(result.identityDecisions).toHaveLength(0);
    });
  });
});

// ===================================================================
// F8.5: Enrichment API Endpoint Validation
// ===================================================================

describe('Enrichment API Validation (F8.5)', () => {
  it('valid enrichment sources are companies_house, charity_commission, wikidata, news', () => {
    const validSources = ['companies_house', 'charity_commission', 'wikidata', 'news'];
    for (const source of validSources) {
      expect(SOURCE_TIER[source as keyof typeof SOURCE_TIER]).toBeDefined();
    }
  });

  it('enrichment route module exports POST handler', async () => {
    // Verify the route module is structurally correct
    const enrichRoute = await import(
      '@/app/api/candidates/[candidate_id]/enrich/route'
    );
    expect(enrichRoute.POST).toBeDefined();
    expect(typeof enrichRoute.POST).toBe('function');
  });

  it('enrichment signals route module exports GET handler', async () => {
    const enrichmentRoute = await import(
      '@/app/api/candidates/[candidate_id]/enrichment/route'
    );
    expect(enrichmentRoute.GET).toBeDefined();
    expect(typeof enrichmentRoute.GET).toBe('function');
  });

  it('enrichment refresh route module exports POST handler', async () => {
    const refreshRoute = await import('@/app/api/enrichment/refresh/route');
    expect(refreshRoute.POST).toBeDefined();
    expect(typeof refreshRoute.POST).toBe('function');
  });
});
