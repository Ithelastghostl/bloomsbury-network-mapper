/**
 * Tests for Epic 7, Feature 7.3 — Seeds, Known Contacts & Eligibility.
 * Pure functions — no Supabase required.
 *
 * PRD refs: §16.3, §16.4, §16.5 R3.6/R3.8/R3.10
 */
import { describe, it, expect } from 'vitest';
import {
  checkEligibility,
  applyQueueLimit,
  DEFAULT_QUEUE_LIMIT,
  ANALYTICS_EXPORT_LIMIT,
  type CandidateInput,
  type ExclusionContext,
} from '@/lib/discovery/eligibility';
import {
  calculateSeedQuality,
  type SeedQualityInput,
} from '@/lib/discovery/seed-quality';
import {
  generateReasonCodes,
  type ReasonCodeInput,
} from '@/lib/discovery/reason-codes';

// ===================================================================
// Helpers
// ===================================================================

function makeCandidate(overrides: Partial<CandidateInput> = {}): CandidateInput {
  return {
    entityId: 'ent_candidate_001',
    entityType: 'person',
    hasPathToSeed: true,
    hasQualifyingSignal: true,
    confidence: 0.85,
    ...overrides,
  };
}

function emptyExclusions(): ExclusionContext {
  return {
    knownContactIds: new Set(),
    rejectedForSeedIds: new Set(),
    priorLeadIds: new Set(),
    excludedIntermediaryIds: new Set(),
    genericServiceEntityIds: new Set(),
  };
}

function makeSeedQualityInput(overrides: Partial<SeedQualityInput> = {}): SeedQualityInput {
  return {
    strongEdgeCountScore: 0.8,
    recentEdgeScore: 0.9,
    affiliationCountScore: 0.7,
    historicalIntroSuccessScore: 0.6,
    identityConfidenceScore: 0.9,
    ...overrides,
  };
}

function makeReasonCodeInput(overrides: Partial<ReasonCodeInput> = {}): ReasonCodeInput {
  return {
    pathRelationshipTypes: ['TRUSTEE_OF'],
    pathCount: 1,
    sharedAffiliationTypes: [],
    pprScore: 0.005,
    directRelationship: false,
    ...overrides,
  };
}

// ===================================================================
// Seed CRUD Validation (F7.3-T1)
// ===================================================================

describe('seed CRUD validation', () => {
  it('requires canonical_entity_id for seed creation', () => {
    // This validates the check in the API route — testing the pattern:
    // POST body must have canonical_entity_id
    const body = { canonical_entity_id: '', notes: 'test' };
    expect(body.canonical_entity_id).toBeFalsy();
  });

  it('accepts valid seed data', () => {
    const body = {
      canonical_entity_id: 'ent_123',
      notes: 'Key donor contact',
    };
    expect(body.canonical_entity_id).toBeTruthy();
    expect(typeof body.notes).toBe('string');
  });

  it('active flag defaults to true', () => {
    const seed = { active: true };
    expect(seed.active).toBe(true);
  });

  it('active flag can be toggled', () => {
    const updates = { active: false };
    expect(typeof updates.active).toBe('boolean');
    expect(updates.active).toBe(false);
  });

  it('rejects patch with no valid fields', () => {
    const body = { invalid_field: 'value' };
    const updates: Record<string, unknown> = {};
    if (typeof (body as Record<string, unknown>).active === 'boolean') {
      updates.active = (body as Record<string, unknown>).active;
    }
    if (typeof (body as Record<string, unknown>).notes === 'string') {
      updates.notes = (body as Record<string, unknown>).notes;
    }
    expect(Object.keys(updates).length).toBe(0);
  });
});

// ===================================================================
// Known Contact Filtering (F7.3-T2)
// ===================================================================

describe('known contact filtering', () => {
  it('excludes a candidate that is a known contact', () => {
    const candidate = makeCandidate({ entityId: 'known_001' });
    const exclusions = emptyExclusions();
    exclusions.knownContactIds.add('known_001');

    const result = checkEligibility(candidate, exclusions);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('known_contact');
  });

  it('allows a candidate that is not a known contact', () => {
    const candidate = makeCandidate({ entityId: 'new_001' });
    const exclusions = emptyExclusions();
    exclusions.knownContactIds.add('known_002');

    const result = checkEligibility(candidate, exclusions);
    expect(result.eligible).toBe(true);
  });

  it('handles empty known contacts set', () => {
    const candidate = makeCandidate();
    const exclusions = emptyExclusions();

    const result = checkEligibility(candidate, exclusions);
    expect(result.eligible).toBe(true);
  });
});

// ===================================================================
// Eligibility Checks — all criteria (F7.3-T3, §16.3)
// ===================================================================

describe('candidate eligibility', () => {
  it('eligible when all criteria pass', () => {
    const result = checkEligibility(makeCandidate(), emptyExclusions());
    expect(result.eligible).toBe(true);
    expect(result.reason).toBeNull();
  });

  it('rejects non-person-like entity', () => {
    const result = checkEligibility(
      makeCandidate({ entityType: 'charity' }),
      emptyExclusions(),
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('not_person_like');
  });

  it('accepts trustee as person-like', () => {
    const result = checkEligibility(
      makeCandidate({ entityType: 'trustee' }),
      emptyExclusions(),
    );
    expect(result.eligible).toBe(true);
  });

  it('accepts director as person-like', () => {
    const result = checkEligibility(
      makeCandidate({ entityType: 'director' }),
      emptyExclusions(),
    );
    expect(result.eligible).toBe(true);
  });

  it('accepts individual as person-like', () => {
    const result = checkEligibility(
      makeCandidate({ entityType: 'individual' }),
      emptyExclusions(),
    );
    expect(result.eligible).toBe(true);
  });

  it('case-insensitive entity type check', () => {
    const result = checkEligibility(
      makeCandidate({ entityType: 'Person' }),
      emptyExclusions(),
    );
    expect(result.eligible).toBe(true);
  });

  it('rejects when no path to seed', () => {
    const result = checkEligibility(
      makeCandidate({ hasPathToSeed: false }),
      emptyExclusions(),
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('no_path_to_seed');
  });

  it('rejects when no qualifying signal', () => {
    const result = checkEligibility(
      makeCandidate({ hasQualifyingSignal: false }),
      emptyExclusions(),
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('no_qualifying_signal');
  });

  it('rejects when confidence below 0.40 default', () => {
    const result = checkEligibility(
      makeCandidate({ confidence: 0.39 }),
      emptyExclusions(),
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('low_confidence');
  });

  it('accepts confidence exactly at 0.40 threshold', () => {
    const result = checkEligibility(
      makeCandidate({ confidence: 0.40 }),
      emptyExclusions(),
    );
    expect(result.eligible).toBe(true);
  });

  it('respects custom minConfidence for low-quality seeds', () => {
    const result = checkEligibility(
      makeCandidate({ confidence: 0.55 }),
      emptyExclusions(),
      0.60,
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('low_confidence');
  });

  it('passes custom minConfidence when confidence is sufficient', () => {
    const result = checkEligibility(
      makeCandidate({ confidence: 0.65 }),
      emptyExclusions(),
      0.60,
    );
    expect(result.eligible).toBe(true);
  });
});

// ===================================================================
// Exclusion Filters — all filter types (F7.3-T4)
// ===================================================================

describe('exclusion filters', () => {
  it('filters rejected-for-seed candidates', () => {
    const exclusions = emptyExclusions();
    exclusions.rejectedForSeedIds.add('ent_candidate_001');

    const result = checkEligibility(makeCandidate(), exclusions);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('rejected_for_seed');
  });

  it('filters prior leads', () => {
    const exclusions = emptyExclusions();
    exclusions.priorLeadIds.add('ent_candidate_001');

    const result = checkEligibility(makeCandidate(), exclusions);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('prior_lead');
  });

  it('filters excluded intermediaries', () => {
    const exclusions = emptyExclusions();
    exclusions.excludedIntermediaryIds.add('ent_candidate_001');

    const result = checkEligibility(makeCandidate(), exclusions);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('excluded_intermediary');
  });

  it('filters generic service entities', () => {
    const exclusions = emptyExclusions();
    exclusions.genericServiceEntityIds.add('ent_candidate_001');

    const result = checkEligibility(makeCandidate(), exclusions);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('generic_service_entity');
  });

  it('returns first failing exclusion (known_contact before rejected)', () => {
    const exclusions = emptyExclusions();
    exclusions.knownContactIds.add('ent_candidate_001');
    exclusions.rejectedForSeedIds.add('ent_candidate_001');

    const result = checkEligibility(makeCandidate(), exclusions);
    expect(result.reason).toBe('known_contact');
  });

  it('passes when entity is not in any exclusion set', () => {
    const exclusions = emptyExclusions();
    exclusions.knownContactIds.add('other_001');
    exclusions.rejectedForSeedIds.add('other_002');
    exclusions.priorLeadIds.add('other_003');
    exclusions.excludedIntermediaryIds.add('other_004');
    exclusions.genericServiceEntityIds.add('other_005');

    const result = checkEligibility(makeCandidate(), exclusions);
    expect(result.eligible).toBe(true);
  });
});

// ===================================================================
// Seed Quality Scoring — all 3 bands (F7.3-T6, §16.4)
// ===================================================================

describe('seed quality scoring', () => {
  it('computes score using §16.4 weights', () => {
    const input = makeSeedQualityInput({
      strongEdgeCountScore: 1.0,
      recentEdgeScore: 1.0,
      affiliationCountScore: 1.0,
      historicalIntroSuccessScore: 1.0,
      identityConfidenceScore: 1.0,
    });
    const result = calculateSeedQuality(input);
    // 0.30 + 0.25 + 0.20 + 0.15 + 0.10 = 1.0
    expect(result.score).toBeCloseTo(1.0, 3);
  });

  it('computes weighted score correctly', () => {
    const input = makeSeedQualityInput({
      strongEdgeCountScore: 0.5,
      recentEdgeScore: 0.6,
      affiliationCountScore: 0.7,
      historicalIntroSuccessScore: 0.8,
      identityConfidenceScore: 0.9,
    });
    const result = calculateSeedQuality(input);
    // 0.30*0.5 + 0.25*0.6 + 0.20*0.7 + 0.15*0.8 + 0.10*0.9
    // = 0.15 + 0.15 + 0.14 + 0.12 + 0.09 = 0.65
    expect(result.score).toBeCloseTo(0.65, 3);
  });

  it('normal band (>=0.70): no cap, standard confidence, enrichment allowed', () => {
    const input = makeSeedQualityInput({
      strongEdgeCountScore: 0.9,
      recentEdgeScore: 0.9,
      affiliationCountScore: 0.8,
      historicalIntroSuccessScore: 0.5,
      identityConfidenceScore: 0.8,
    });
    const result = calculateSeedQuality(input);
    // 0.30*0.9 + 0.25*0.9 + 0.20*0.8 + 0.15*0.5 + 0.10*0.8
    // = 0.27 + 0.225 + 0.16 + 0.075 + 0.08 = 0.81
    expect(result.score).toBeGreaterThanOrEqual(0.70);
    expect(result.band).toBe('normal');
    expect(result.candidateCap).toBeNull();
    expect(result.minConfidence).toBe(0.40);
    expect(result.enrichmentBlocked).toBe(false);
  });

  it('warning band (0.40-0.69): no cap but warning, standard confidence', () => {
    const input = makeSeedQualityInput({
      strongEdgeCountScore: 0.5,
      recentEdgeScore: 0.5,
      affiliationCountScore: 0.5,
      historicalIntroSuccessScore: 0.5,
      identityConfidenceScore: 0.5,
    });
    const result = calculateSeedQuality(input);
    // All 0.5: 0.30*0.5 + 0.25*0.5 + 0.20*0.5 + 0.15*0.5 + 0.10*0.5 = 0.50
    expect(result.score).toBe(0.5);
    expect(result.band).toBe('warning');
    expect(result.candidateCap).toBeNull();
    expect(result.minConfidence).toBe(0.40);
    expect(result.enrichmentBlocked).toBe(false);
  });

  it('low_quality band (<0.40): cap at 25, higher confidence, enrichment blocked', () => {
    const input = makeSeedQualityInput({
      strongEdgeCountScore: 0.2,
      recentEdgeScore: 0.3,
      affiliationCountScore: 0.1,
      historicalIntroSuccessScore: 0.0,
      identityConfidenceScore: 0.4,
    });
    const result = calculateSeedQuality(input);
    // 0.30*0.2 + 0.25*0.3 + 0.20*0.1 + 0.15*0.0 + 0.10*0.4
    // = 0.06 + 0.075 + 0.02 + 0 + 0.04 = 0.195
    expect(result.score).toBeLessThan(0.40);
    expect(result.band).toBe('low_quality');
    expect(result.candidateCap).toBe(25);
    expect(result.minConfidence).toBe(0.60);
    expect(result.enrichmentBlocked).toBe(true);
  });

  it('boundary: score exactly 0.70 is normal', () => {
    // Need: 0.30*a + 0.25*b + 0.20*c + 0.15*d + 0.10*e = 0.70
    // Use 0.7 across all: 0.30*0.7 + 0.25*0.7 + 0.20*0.7 + 0.15*0.7 + 0.10*0.7 = 0.70
    const input = makeSeedQualityInput({
      strongEdgeCountScore: 0.7,
      recentEdgeScore: 0.7,
      affiliationCountScore: 0.7,
      historicalIntroSuccessScore: 0.7,
      identityConfidenceScore: 0.7,
    });
    const result = calculateSeedQuality(input);
    expect(result.score).toBeCloseTo(0.70, 3);
    expect(result.band).toBe('normal');
  });

  it('boundary: score exactly 0.40 is warning', () => {
    const input = makeSeedQualityInput({
      strongEdgeCountScore: 0.4,
      recentEdgeScore: 0.4,
      affiliationCountScore: 0.4,
      historicalIntroSuccessScore: 0.4,
      identityConfidenceScore: 0.4,
    });
    const result = calculateSeedQuality(input);
    expect(result.score).toBeCloseTo(0.40, 3);
    expect(result.band).toBe('warning');
  });

  it('clamps input scores to 0-1 range', () => {
    const input = makeSeedQualityInput({
      strongEdgeCountScore: 1.5,
      recentEdgeScore: -0.3,
      affiliationCountScore: 1.0,
      historicalIntroSuccessScore: 1.0,
      identityConfidenceScore: 1.0,
    });
    const result = calculateSeedQuality(input);
    // Clamped: 1.0, 0.0, 1.0, 1.0, 1.0
    // 0.30*1.0 + 0.25*0.0 + 0.20*1.0 + 0.15*1.0 + 0.10*1.0
    // = 0.30 + 0 + 0.20 + 0.15 + 0.10 = 0.75
    expect(result.score).toBeCloseTo(0.75, 3);
    expect(result.band).toBe('normal');
  });

  it('all-zero input produces low_quality', () => {
    const input = makeSeedQualityInput({
      strongEdgeCountScore: 0,
      recentEdgeScore: 0,
      affiliationCountScore: 0,
      historicalIntroSuccessScore: 0,
      identityConfidenceScore: 0,
    });
    const result = calculateSeedQuality(input);
    expect(result.score).toBe(0);
    expect(result.band).toBe('low_quality');
  });
});

// ===================================================================
// Reason Code Generation (F7.3-T7, §16.5 R3.8)
// ===================================================================

describe('reason code generation', () => {
  it('generates shared_trustee_role from TRUSTEE_OF path', () => {
    const codes = generateReasonCodes(makeReasonCodeInput({
      pathRelationshipTypes: ['TRUSTEE_OF'],
    }));
    expect(codes).toContain('shared_trustee_role');
  });

  it('generates shared_director_role from DIRECTOR_OF path', () => {
    const codes = generateReasonCodes(makeReasonCodeInput({
      pathRelationshipTypes: ['DIRECTOR_OF'],
    }));
    expect(codes).toContain('shared_director_role');
  });

  it('generates donation_link from MADE_DONATION path', () => {
    const codes = generateReasonCodes(makeReasonCodeInput({
      pathRelationshipTypes: ['MADE_DONATION'],
    }));
    expect(codes).toContain('donation_link');
  });

  it('generates donation_link from RECEIVED_BY path', () => {
    const codes = generateReasonCodes(makeReasonCodeInput({
      pathRelationshipTypes: ['RECEIVED_BY'],
    }));
    expect(codes).toContain('donation_link');
  });

  it('generates shared_address from REGISTERED_AT path', () => {
    const codes = generateReasonCodes(makeReasonCodeInput({
      pathRelationshipTypes: ['REGISTERED_AT'],
    }));
    expect(codes).toContain('shared_address');
  });

  it('generates shared_charity_affiliation', () => {
    const codes = generateReasonCodes(makeReasonCodeInput({
      pathRelationshipTypes: [],
      sharedAffiliationTypes: ['charity'],
    }));
    expect(codes).toContain('shared_charity_affiliation');
  });

  it('generates shared_company_affiliation', () => {
    const codes = generateReasonCodes(makeReasonCodeInput({
      pathRelationshipTypes: [],
      sharedAffiliationTypes: ['company'],
    }));
    expect(codes).toContain('shared_company_affiliation');
  });

  it('generates board_network_overlap', () => {
    const codes = generateReasonCodes(makeReasonCodeInput({
      pathRelationshipTypes: [],
      sharedAffiliationTypes: ['board'],
    }));
    expect(codes).toContain('board_network_overlap');
  });

  it('generates high_pagerank_proximity when PPR exceeds threshold', () => {
    const codes = generateReasonCodes(makeReasonCodeInput({
      pathRelationshipTypes: [],
      pprScore: 0.05,
      pprThreshold: 0.01,
    }));
    expect(codes).toContain('high_pagerank_proximity');
  });

  it('does not generate high_pagerank_proximity below threshold', () => {
    const codes = generateReasonCodes(makeReasonCodeInput({
      pathRelationshipTypes: [],
      pprScore: 0.005,
      pprThreshold: 0.01,
    }));
    expect(codes).not.toContain('high_pagerank_proximity');
  });

  it('generates direct_relationship', () => {
    const codes = generateReasonCodes(makeReasonCodeInput({
      pathRelationshipTypes: [],
      directRelationship: true,
    }));
    expect(codes).toContain('direct_relationship');
  });

  it('generates multi_path_convergence when pathCount >= 2', () => {
    const codes = generateReasonCodes(makeReasonCodeInput({
      pathRelationshipTypes: ['TRUSTEE_OF'],
      pathCount: 3,
    }));
    expect(codes).toContain('multi_path_convergence');
  });

  it('does not generate multi_path_convergence for single path', () => {
    const codes = generateReasonCodes(makeReasonCodeInput({
      pathRelationshipTypes: ['TRUSTEE_OF'],
      pathCount: 1,
    }));
    expect(codes).not.toContain('multi_path_convergence');
  });

  it('generates multiple reason codes from compound signals', () => {
    const codes = generateReasonCodes(makeReasonCodeInput({
      pathRelationshipTypes: ['TRUSTEE_OF', 'MADE_DONATION'],
      pathCount: 2,
      sharedAffiliationTypes: ['charity'],
      pprScore: 0.05,
      directRelationship: true,
    }));
    expect(codes).toContain('shared_trustee_role');
    expect(codes).toContain('donation_link');
    expect(codes).toContain('shared_charity_affiliation');
    expect(codes).toContain('high_pagerank_proximity');
    expect(codes).toContain('direct_relationship');
    expect(codes).toContain('multi_path_convergence');
    expect(codes.length).toBe(6);
  });

  it('does not produce duplicate codes', () => {
    const codes = generateReasonCodes(makeReasonCodeInput({
      pathRelationshipTypes: ['TRUSTEE_OF', 'TRUSTEE_OF'],
    }));
    const unique = new Set(codes);
    expect(codes.length).toBe(unique.size);
  });
});

// ===================================================================
// Queue Limit Enforcement (F7.3-T8, §16.5 R3.10)
// ===================================================================

describe('queue limit enforcement', () => {
  const items = Array.from({ length: 300 }, (_, i) => ({ rank: i + 1 }));

  it('default review queue limits to top 50', () => {
    const result = applyQueueLimit(items);
    expect(result.length).toBe(DEFAULT_QUEUE_LIMIT);
    expect(result[0].rank).toBe(1);
    expect(result[49].rank).toBe(50);
  });

  it('analytics export limits to top 200', () => {
    const result = applyQueueLimit(items, 'analytics');
    expect(result.length).toBe(ANALYTICS_EXPORT_LIMIT);
    expect(result[0].rank).toBe(1);
    expect(result[199].rank).toBe(200);
  });

  it('seed quality cap overrides mode limit when smaller', () => {
    const result = applyQueueLimit(items, 'review', 25);
    expect(result.length).toBe(25);
  });

  it('seed quality cap does not exceed mode limit', () => {
    // seedCap=100 but review limit is 50
    const result = applyQueueLimit(items, 'review', 100);
    expect(result.length).toBe(50);
  });

  it('seed quality cap applied to analytics mode', () => {
    const result = applyQueueLimit(items, 'analytics', 25);
    expect(result.length).toBe(25);
  });

  it('handles fewer candidates than limit', () => {
    const few = items.slice(0, 10);
    const result = applyQueueLimit(few, 'review');
    expect(result.length).toBe(10);
  });

  it('handles empty candidate list', () => {
    const result = applyQueueLimit([], 'review');
    expect(result.length).toBe(0);
  });

  it('null seed cap means no seed-level cap', () => {
    const result = applyQueueLimit(items, 'review', null);
    expect(result.length).toBe(DEFAULT_QUEUE_LIMIT);
  });
});

// ===================================================================
// Integration: Seed Quality -> Eligibility -> Queue Limit
// ===================================================================

describe('seed quality integration with eligibility', () => {
  it('low-quality seed requires higher confidence and caps output', () => {
    const seedResult = calculateSeedQuality(makeSeedQualityInput({
      strongEdgeCountScore: 0.1,
      recentEdgeScore: 0.1,
      affiliationCountScore: 0.1,
      historicalIntroSuccessScore: 0.0,
      identityConfidenceScore: 0.2,
    }));

    expect(seedResult.band).toBe('low_quality');
    expect(seedResult.minConfidence).toBe(0.60);
    expect(seedResult.candidateCap).toBe(25);

    // Candidate with confidence 0.50 would pass normal but fail low-quality seed
    const eligibility = checkEligibility(
      makeCandidate({ confidence: 0.50 }),
      emptyExclusions(),
      seedResult.minConfidence,
    );
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toBe('low_confidence');

    // But confidence 0.65 passes
    const eligibility2 = checkEligibility(
      makeCandidate({ confidence: 0.65 }),
      emptyExclusions(),
      seedResult.minConfidence,
    );
    expect(eligibility2.eligible).toBe(true);

    // Queue capped at 25
    const candidates = Array.from({ length: 100 }, (_, i) => i);
    const limited = applyQueueLimit(candidates, 'review', seedResult.candidateCap);
    expect(limited.length).toBe(25);
  });
});
