/**
 * Unit tests for Entity Resolution (Epic 6, Feature 6.1).
 * Pure functions — no Supabase required.
 *
 * Covers:
 * - Match confidence calculation (§15.3)
 * - Band classification (§15.2)
 * - Auto-merge blocker logic (§15.4)
 * - Human decision replay (§15.5)
 * - Cluster creation
 * - Embedding text generation
 * - Canonical entity mapping stability (R2.9)
 */
import { describe, it, expect, vi } from 'vitest';
import type { EntityMention, HumanIdentityDecision, IdentityCluster, CanonicalEntity } from '@/types/database';
import {
  trigramSimilarity,
  cosineSimilarity,
  computeMatchConfidence,
  computeSignals,
  sharedOrganisationScore,
  sharedAddressScore,
  roleOverlapScore,
  DEFAULT_MATCH_WEIGHTS,
} from '@/lib/entity-resolution/match-confidence';
import {
  classifyBand,
  checkBlockers,
  hasHumanMergeDecision,
  computePairwiseMatches,
  buildClusters,
  clusterMentions,
  BAND_THRESHOLDS,
} from '@/lib/entity-resolution/clustering';
import {
  buildEmbeddingText,
  applyEmbeddings,
} from '@/lib/entity-resolution/embeddings';
import {
  mapClustersToCanonical,
  resolveCanonicalId,
  selectDisplayName,
  mergeAttributes,
  clusterSignature,
  buildExistingLookup,
} from '@/lib/entity-resolution/canonical';

// -------------------------------------------------------------------
// Test helpers
// -------------------------------------------------------------------

function makeMention(overrides: Partial<EntityMention> = {}): EntityMention {
  return {
    entity_mention_id: 'em_001',
    document_id: 'doc_001',
    run_id: 'run_001',
    entity_type: 'person',
    raw_value: 'John Smith',
    normalised_value: 'John Smith',
    attributes: {},
    evidence_span: 'John Smith is a trustee of the charity.',
    span_start: 0,
    span_end: 40,
    extraction_confidence: 0.85,
    validation_status: 'validated',
    embedding: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeHumanDecision(
  overrides: Partial<HumanIdentityDecision> = {},
): HumanIdentityDecision {
  return {
    identity_decision_id: 'hid_001',
    entity_a_mention_id: 'em_001',
    entity_b_mention_id: 'em_002',
    decision: 'not_same_person',
    reason_code: 'wrong_person',
    notes: null,
    decided_by: 'reviewer_001',
    decided_at: '2026-01-01T00:00:00Z',
    replay_on_future_runs: true,
    superseded_by: null,
    ...overrides,
  };
}

// ===================================================================
// Match Confidence (§15.3)
// ===================================================================

describe('trigramSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(trigramSimilarity('John Smith', 'John Smith')).toBe(1);
  });

  it('returns 1 for case-insensitive identical strings', () => {
    expect(trigramSimilarity('JOHN SMITH', 'john smith')).toBe(1);
  });

  it('returns high similarity for similar names', () => {
    const sim = trigramSimilarity('John Smith', 'Jon Smith');
    expect(sim).toBeGreaterThan(0.5);
  });

  it('returns low similarity for different names', () => {
    const sim = trigramSimilarity('John Smith', 'Sarah Williams');
    expect(sim).toBeLessThan(0.3);
  });

  it('returns 0 for empty strings', () => {
    expect(trigramSimilarity('', 'John')).toBe(0);
    expect(trigramSimilarity('John', '')).toBe(0);
  });
});

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = [1, 2, 3, 4, 5];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it('returns 0 when either is null', () => {
    expect(cosineSimilarity(null, [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], null)).toBe(0);
  });

  it('returns 0 for different length vectors', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it('returns high similarity for similar vectors', () => {
    const a = [1, 2, 3, 4, 5];
    const b = [1.1, 2.1, 3.0, 4.0, 5.0];
    expect(cosineSimilarity(a, b)).toBeGreaterThan(0.99);
  });
});

describe('sharedOrganisationScore', () => {
  it('returns 1 when mentions share an organisation', () => {
    const a = makeMention({
      entity_mention_id: 'em_a',
      attributes: { organisations: ['Charity Alpha'] },
    });
    const b = makeMention({
      entity_mention_id: 'em_b',
      attributes: { organisations: ['Charity Alpha', 'Charity Beta'] },
    });
    expect(sharedOrganisationScore(a, b)).toBe(1);
  });

  it('returns 0 when no shared orgs', () => {
    const a = makeMention({
      entity_mention_id: 'em_a',
      attributes: { organisations: ['Charity Alpha'] },
    });
    const b = makeMention({
      entity_mention_id: 'em_b',
      attributes: { organisations: ['Charity Beta'] },
    });
    expect(sharedOrganisationScore(a, b)).toBe(0);
  });

  it('returns 0 when no orgs present', () => {
    const a = makeMention({ entity_mention_id: 'em_a' });
    const b = makeMention({ entity_mention_id: 'em_b' });
    expect(sharedOrganisationScore(a, b)).toBe(0);
  });

  it('matches case-insensitively', () => {
    const a = makeMention({
      entity_mention_id: 'em_a',
      attributes: { organisation: 'CHARITY ALPHA' },
    });
    const b = makeMention({
      entity_mention_id: 'em_b',
      attributes: { organisation: 'charity alpha' },
    });
    expect(sharedOrganisationScore(a, b)).toBe(1);
  });
});

describe('sharedAddressScore', () => {
  it('returns 1 when mentions share an address', () => {
    const a = makeMention({
      entity_mention_id: 'em_a',
      attributes: { address: '10 Downing Street' },
    });
    const b = makeMention({
      entity_mention_id: 'em_b',
      attributes: { address: '10 Downing Street' },
    });
    expect(sharedAddressScore(a, b)).toBe(1);
  });

  it('returns 1 when mentions share a postcode', () => {
    const a = makeMention({
      entity_mention_id: 'em_a',
      attributes: { postcode: 'SW1A 2AA' },
    });
    const b = makeMention({
      entity_mention_id: 'em_b',
      attributes: { postcode: 'SW1A2AA' },
    });
    expect(sharedAddressScore(a, b)).toBe(1);
  });

  it('returns 0 when no shared address', () => {
    const a = makeMention({
      entity_mention_id: 'em_a',
      attributes: { address: '10 Downing Street' },
    });
    const b = makeMention({
      entity_mention_id: 'em_b',
      attributes: { address: '20 Baker Street' },
    });
    expect(sharedAddressScore(a, b)).toBe(0);
  });
});

describe('roleOverlapScore', () => {
  it('returns 1 for identical roles', () => {
    const a = makeMention({
      entity_mention_id: 'em_a',
      attributes: { roles: ['trustee', 'chair'] },
    });
    const b = makeMention({
      entity_mention_id: 'em_b',
      attributes: { roles: ['trustee', 'chair'] },
    });
    expect(roleOverlapScore(a, b)).toBe(1);
  });

  it('returns partial overlap fraction', () => {
    const a = makeMention({
      entity_mention_id: 'em_a',
      attributes: { roles: ['trustee', 'chair'] },
    });
    const b = makeMention({
      entity_mention_id: 'em_b',
      attributes: { roles: ['trustee', 'director'] },
    });
    // intersection=1 (trustee), union=3 (trustee,chair,director) -> 1/3
    expect(roleOverlapScore(a, b)).toBeCloseTo(1 / 3, 5);
  });

  it('returns 0 for no overlap', () => {
    const a = makeMention({
      entity_mention_id: 'em_a',
      attributes: { roles: ['trustee'] },
    });
    const b = makeMention({
      entity_mention_id: 'em_b',
      attributes: { roles: ['director'] },
    });
    expect(roleOverlapScore(a, b)).toBe(0);
  });

  it('returns 0 when no roles present', () => {
    const a = makeMention({ entity_mention_id: 'em_a' });
    const b = makeMention({ entity_mention_id: 'em_b' });
    expect(roleOverlapScore(a, b)).toBe(0);
  });
});

describe('computeMatchConfidence', () => {
  it('uses PRD §15.3 default weights', () => {
    expect(DEFAULT_MATCH_WEIGHTS).toEqual({
      name_similarity: 0.30,
      embedding_similarity: 0.25,
      shared_organisation: 0.20,
      shared_address: 0.15,
      role_overlap: 0.10,
    });
  });

  it('returns confidence=1 for identical mentions with full signals', () => {
    const embedding = [1, 0, 0, 1, 0];
    const a = makeMention({
      entity_mention_id: 'em_a',
      normalised_value: 'John Smith',
      embedding,
      attributes: {
        organisations: ['Charity Alpha'],
        address: '10 Downing Street',
        roles: ['trustee'],
      },
    });
    // Same mention effectively
    const b = makeMention({
      entity_mention_id: 'em_b',
      normalised_value: 'John Smith',
      embedding,
      attributes: {
        organisations: ['Charity Alpha'],
        address: '10 Downing Street',
        roles: ['trustee'],
      },
    });

    const result = computeMatchConfidence(a, b);
    // name_sim=1, embed_sim=1, org=1, addr=1, role=1 -> 1.0
    expect(result.confidence).toBeCloseTo(1.0, 2);
  });

  it('returns low confidence for unrelated mentions', () => {
    const a = makeMention({
      entity_mention_id: 'em_a',
      normalised_value: 'John Smith',
    });
    const b = makeMention({
      entity_mention_id: 'em_b',
      normalised_value: 'Sarah Williams',
    });

    const result = computeMatchConfidence(a, b);
    expect(result.confidence).toBeLessThan(0.3);
  });

  it('supports custom weights', () => {
    const a = makeMention({
      entity_mention_id: 'em_a',
      normalised_value: 'John Smith',
    });
    const b = makeMention({
      entity_mention_id: 'em_b',
      normalised_value: 'John Smith',
    });

    const customWeights = {
      name_similarity: 1.0,
      embedding_similarity: 0,
      shared_organisation: 0,
      shared_address: 0,
      role_overlap: 0,
    };

    const result = computeMatchConfidence(a, b, customWeights);
    expect(result.confidence).toBeCloseTo(1.0, 5);
    expect(result.weights).toEqual(customWeights);
  });

  it('returns signals alongside confidence', () => {
    const a = makeMention({
      entity_mention_id: 'em_a',
      normalised_value: 'John Smith',
      attributes: { organisations: ['Charity Alpha'] },
    });
    const b = makeMention({
      entity_mention_id: 'em_b',
      normalised_value: 'John Smith',
      attributes: { organisations: ['Charity Alpha'] },
    });

    const result = computeMatchConfidence(a, b);
    expect(result.signals.name_similarity).toBe(1);
    expect(result.signals.shared_organisation).toBe(1);
    expect(result.signals.embedding_similarity).toBe(0); // no embeddings
  });

  it('clamps confidence to [0, 1]', () => {
    // Even if weights are weird, confidence should never exceed 1
    const a = makeMention({
      entity_mention_id: 'em_a',
      normalised_value: 'John Smith',
      embedding: [1, 0],
      attributes: {
        organisations: ['Org'],
        address: 'Addr',
        roles: ['role'],
      },
    });
    const b = makeMention({
      entity_mention_id: 'em_b',
      normalised_value: 'John Smith',
      embedding: [1, 0],
      attributes: {
        organisations: ['Org'],
        address: 'Addr',
        roles: ['role'],
      },
    });

    const heavyWeights = {
      name_similarity: 0.50,
      embedding_similarity: 0.50,
      shared_organisation: 0.50,
      shared_address: 0.50,
      role_overlap: 0.50,
    };

    const result = computeMatchConfidence(a, b, heavyWeights);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});

// ===================================================================
// Decision Bands (§15.2)
// ===================================================================

describe('classifyBand', () => {
  it('classifies >= 0.90 as auto-cluster', () => {
    expect(classifyBand(0.90)).toBe('auto-cluster');
    expect(classifyBand(0.95)).toBe('auto-cluster');
    expect(classifyBand(1.0)).toBe('auto-cluster');
  });

  it('classifies 0.75-0.89 as provisional', () => {
    expect(classifyBand(0.75)).toBe('provisional');
    expect(classifyBand(0.80)).toBe('provisional');
    expect(classifyBand(0.89)).toBe('provisional');
  });

  it('classifies 0.55-0.74 as possible-dup', () => {
    expect(classifyBand(0.55)).toBe('possible-dup');
    expect(classifyBand(0.65)).toBe('possible-dup');
    expect(classifyBand(0.74)).toBe('possible-dup');
  });

  it('classifies < 0.55 as separate', () => {
    expect(classifyBand(0.54)).toBe('separate');
    expect(classifyBand(0.30)).toBe('separate');
    expect(classifyBand(0)).toBe('separate');
  });

  it('has correct threshold constants', () => {
    expect(BAND_THRESHOLDS.autoCluster).toBe(0.90);
    expect(BAND_THRESHOLDS.provisional).toBe(0.75);
    expect(BAND_THRESHOLDS.possibleDup).toBe(0.55);
  });
});

// ===================================================================
// Auto-Merge Blockers (§15.4)
// ===================================================================

describe('checkBlockers', () => {
  it('returns empty array when no blockers apply', () => {
    const a = makeMention({
      entity_mention_id: 'em_a',
      attributes: { organisation: 'Charity Alpha' },
    });
    const b = makeMention({
      entity_mention_id: 'em_b',
      attributes: { organisation: 'Charity Alpha' },
    });
    const reasons = checkBlockers(a, b, []);
    expect(reasons).toEqual([]);
  });

  it('detects incompatible DOB', () => {
    const a = makeMention({
      entity_mention_id: 'em_a',
      attributes: { date_of_birth: '1960-01-01' },
    });
    const b = makeMention({
      entity_mention_id: 'em_b',
      attributes: { date_of_birth: '1970-05-15' },
    });
    const reasons = checkBlockers(a, b, []);
    expect(reasons).toContain('incompatible_dob');
  });

  it('does not flag DOB when only one has it', () => {
    const a = makeMention({
      entity_mention_id: 'em_a',
      attributes: { date_of_birth: '1960-01-01' },
    });
    const b = makeMention({ entity_mention_id: 'em_b' });
    const reasons = checkBlockers(a, b, []);
    expect(reasons).not.toContain('incompatible_dob');
  });

  it('detects conflicting registration IDs', () => {
    const a = makeMention({
      entity_mention_id: 'em_a',
      attributes: { registration_id: '12345' },
    });
    const b = makeMention({
      entity_mention_id: 'em_b',
      attributes: { registration_id: '67890' },
    });
    const reasons = checkBlockers(a, b, []);
    expect(reasons).toContain('conflicting_registration_ids');
  });

  it('does not flag matching registration IDs', () => {
    const a = makeMention({
      entity_mention_id: 'em_a',
      attributes: { registration_id: '12345' },
    });
    const b = makeMention({
      entity_mention_id: 'em_b',
      attributes: { registration_id: '12345' },
    });
    const reasons = checkBlockers(a, b, []);
    expect(reasons).not.toContain('conflicting_registration_ids');
  });

  it('detects prior human split decision', () => {
    const a = makeMention({ entity_mention_id: 'em_a' });
    const b = makeMention({ entity_mention_id: 'em_b' });
    const decisions = [
      makeHumanDecision({
        entity_a_mention_id: 'em_a',
        entity_b_mention_id: 'em_b',
        decision: 'not_same_person',
      }),
    ];
    const reasons = checkBlockers(a, b, decisions);
    expect(reasons).toContain('prior_human_split');
  });

  it('detects prior human split in reverse order', () => {
    const a = makeMention({ entity_mention_id: 'em_a' });
    const b = makeMention({ entity_mention_id: 'em_b' });
    const decisions = [
      makeHumanDecision({
        entity_a_mention_id: 'em_b',
        entity_b_mention_id: 'em_a',
        decision: 'not_same_person',
      }),
    ];
    const reasons = checkBlockers(a, b, decisions);
    expect(reasons).toContain('prior_human_split');
  });

  it('ignores superseded human decisions', () => {
    const a = makeMention({ entity_mention_id: 'em_a' });
    const b = makeMention({ entity_mention_id: 'em_b' });
    const decisions = [
      makeHumanDecision({
        entity_a_mention_id: 'em_a',
        entity_b_mention_id: 'em_b',
        decision: 'not_same_person',
        superseded_by: 'hid_002',
      }),
    ];
    const reasons = checkBlockers(a, b, decisions);
    expect(reasons).not.toContain('prior_human_split');
  });

  it('ignores decisions not set to replay', () => {
    const a = makeMention({ entity_mention_id: 'em_a' });
    const b = makeMention({ entity_mention_id: 'em_b' });
    const decisions = [
      makeHumanDecision({
        entity_a_mention_id: 'em_a',
        entity_b_mention_id: 'em_b',
        decision: 'not_same_person',
        replay_on_future_runs: false,
      }),
    ];
    const reasons = checkBlockers(a, b, decisions);
    expect(reasons).not.toContain('prior_human_split');
  });

  it('detects incompatible roles', () => {
    const a = makeMention({
      entity_mention_id: 'em_a',
      attributes: { roles: ['external auditor'] },
    });
    const b = makeMention({
      entity_mention_id: 'em_b',
      attributes: { roles: ['trustee'] },
    });
    const reasons = checkBlockers(a, b, []);
    expect(reasons).toContain('incompatible_roles');
  });

  it('does not flag compatible roles', () => {
    const a = makeMention({
      entity_mention_id: 'em_a',
      attributes: { roles: ['trustee'] },
    });
    const b = makeMention({
      entity_mention_id: 'em_b',
      attributes: { roles: ['chair'] },
    });
    const reasons = checkBlockers(a, b, []);
    expect(reasons).not.toContain('incompatible_roles');
  });

  it('detects common-name-only (no corroborating features)', () => {
    const a = makeMention({
      entity_mention_id: 'em_a',
      normalised_value: 'John Smith',
      entity_type: 'person',
    });
    const b = makeMention({
      entity_mention_id: 'em_b',
      normalised_value: 'John Smith',
      entity_type: 'person',
    });
    const reasons = checkBlockers(a, b, []);
    expect(reasons).toContain('common_name_only');
  });

  it('does not flag common-name-only when org corroborates', () => {
    const a = makeMention({
      entity_mention_id: 'em_a',
      normalised_value: 'John Smith',
      entity_type: 'person',
      attributes: { organisation: 'Charity Alpha' },
    });
    const b = makeMention({
      entity_mention_id: 'em_b',
      normalised_value: 'John Smith',
      entity_type: 'person',
      attributes: { organisation: 'Charity Alpha' },
    });
    const reasons = checkBlockers(a, b, []);
    expect(reasons).not.toContain('common_name_only');
  });

  it('does not flag common-name-only for non-person entities', () => {
    const a = makeMention({
      entity_mention_id: 'em_a',
      normalised_value: 'Alpha Charity',
      entity_type: 'organisation',
    });
    const b = makeMention({
      entity_mention_id: 'em_b',
      normalised_value: 'Alpha Charity',
      entity_type: 'organisation',
    });
    const reasons = checkBlockers(a, b, []);
    expect(reasons).not.toContain('common_name_only');
  });

  it('does not flag common-name-only for long names', () => {
    const a = makeMention({
      entity_mention_id: 'em_a',
      normalised_value: 'John Alexander Smith Junior',
      entity_type: 'person',
    });
    const b = makeMention({
      entity_mention_id: 'em_b',
      normalised_value: 'John Alexander Smith Junior',
      entity_type: 'person',
    });
    const reasons = checkBlockers(a, b, []);
    expect(reasons).not.toContain('common_name_only');
  });

  it('can return multiple blockers at once', () => {
    const a = makeMention({
      entity_mention_id: 'em_a',
      normalised_value: 'John Smith',
      entity_type: 'person',
      attributes: {
        date_of_birth: '1960-01-01',
        registration_id: '111',
      },
    });
    const b = makeMention({
      entity_mention_id: 'em_b',
      normalised_value: 'John Smith',
      entity_type: 'person',
      attributes: {
        date_of_birth: '1970-01-01',
        registration_id: '222',
      },
    });
    const reasons = checkBlockers(a, b, []);
    expect(reasons).toContain('incompatible_dob');
    expect(reasons).toContain('conflicting_registration_ids');
    expect(reasons).toContain('common_name_only');
    expect(reasons.length).toBeGreaterThanOrEqual(3);
  });
});

// ===================================================================
// Human Decision Replay (§15.5)
// ===================================================================

describe('hasHumanMergeDecision', () => {
  it('returns true for same_person decision', () => {
    const decisions = [
      makeHumanDecision({
        entity_a_mention_id: 'em_a',
        entity_b_mention_id: 'em_b',
        decision: 'same_person',
      }),
    ];
    expect(hasHumanMergeDecision('em_a', 'em_b', decisions)).toBe(true);
  });

  it('returns true in reverse order', () => {
    const decisions = [
      makeHumanDecision({
        entity_a_mention_id: 'em_b',
        entity_b_mention_id: 'em_a',
        decision: 'same_person',
      }),
    ];
    expect(hasHumanMergeDecision('em_a', 'em_b', decisions)).toBe(true);
  });

  it('returns false for not_same_person decision', () => {
    const decisions = [
      makeHumanDecision({
        entity_a_mention_id: 'em_a',
        entity_b_mention_id: 'em_b',
        decision: 'not_same_person',
      }),
    ];
    expect(hasHumanMergeDecision('em_a', 'em_b', decisions)).toBe(false);
  });

  it('returns false when superseded', () => {
    const decisions = [
      makeHumanDecision({
        entity_a_mention_id: 'em_a',
        entity_b_mention_id: 'em_b',
        decision: 'same_person',
        superseded_by: 'hid_002',
      }),
    ];
    expect(hasHumanMergeDecision('em_a', 'em_b', decisions)).toBe(false);
  });

  it('returns false when replay_on_future_runs is false', () => {
    const decisions = [
      makeHumanDecision({
        entity_a_mention_id: 'em_a',
        entity_b_mention_id: 'em_b',
        decision: 'same_person',
        replay_on_future_runs: false,
      }),
    ];
    expect(hasHumanMergeDecision('em_a', 'em_b', decisions)).toBe(false);
  });
});

// ===================================================================
// Clustering
// ===================================================================

describe('clusterMentions', () => {
  it('clusters identical mentions together', () => {
    const emb = [1, 0, 0];
    const mentions = [
      makeMention({
        entity_mention_id: 'em_a',
        normalised_value: 'John Smith',
        embedding: emb,
        attributes: {
          organisations: ['Charity Alpha'],
          address: '10 Downing Street',
          roles: ['trustee'],
        },
      }),
      makeMention({
        entity_mention_id: 'em_b',
        normalised_value: 'John Smith',
        embedding: emb,
        attributes: {
          organisations: ['Charity Alpha'],
          address: '10 Downing Street',
          roles: ['trustee'],
        },
      }),
    ];

    const clusters = clusterMentions(mentions, []);
    // Should produce a single cluster with both mentions
    expect(clusters.length).toBe(1);
    expect(clusters[0].member_mention_ids).toContain('em_a');
    expect(clusters[0].member_mention_ids).toContain('em_b');
    expect(clusters[0].decision_status).toBe('auto-cluster');
  });

  it('keeps unrelated mentions separate', () => {
    const mentions = [
      makeMention({
        entity_mention_id: 'em_a',
        normalised_value: 'John Smith',
      }),
      makeMention({
        entity_mention_id: 'em_b',
        normalised_value: 'Sarah Williams',
      }),
    ];

    const clusters = clusterMentions(mentions, []);
    expect(clusters.length).toBe(2);
  });

  it('respects human merge decisions', () => {
    const mentions = [
      makeMention({
        entity_mention_id: 'em_a',
        normalised_value: 'John Smith',
      }),
      makeMention({
        entity_mention_id: 'em_b',
        normalised_value: 'J Smith',
      }),
    ];

    const humanDecisions = [
      makeHumanDecision({
        entity_a_mention_id: 'em_a',
        entity_b_mention_id: 'em_b',
        decision: 'same_person',
      }),
    ];

    const clusters = clusterMentions(mentions, humanDecisions);
    expect(clusters.length).toBe(1);
    expect(clusters[0].member_mention_ids).toContain('em_a');
    expect(clusters[0].member_mention_ids).toContain('em_b');
  });

  it('respects human split decisions (blocking auto-merge)', () => {
    const emb = [1, 0, 0];
    const mentions = [
      makeMention({
        entity_mention_id: 'em_a',
        normalised_value: 'John Smith',
        embedding: emb,
        attributes: {
          organisations: ['Charity Alpha'],
          address: '10 Downing Street',
          roles: ['trustee'],
        },
      }),
      makeMention({
        entity_mention_id: 'em_b',
        normalised_value: 'John Smith',
        embedding: emb,
        attributes: {
          organisations: ['Charity Alpha'],
          address: '10 Downing Street',
          roles: ['trustee'],
        },
      }),
    ];

    const humanDecisions = [
      makeHumanDecision({
        entity_a_mention_id: 'em_a',
        entity_b_mention_id: 'em_b',
        decision: 'not_same_person',
      }),
    ];

    const clusters = clusterMentions(mentions, humanDecisions);
    expect(clusters.length).toBe(2);
  });

  it('does not merge when blockers are active', () => {
    const mentions = [
      makeMention({
        entity_mention_id: 'em_a',
        normalised_value: 'John Smith',
        entity_type: 'person',
        attributes: { date_of_birth: '1960-01-01', organisations: ['Org'] },
      }),
      makeMention({
        entity_mention_id: 'em_b',
        normalised_value: 'John Smith',
        entity_type: 'person',
        attributes: { date_of_birth: '1970-01-01', organisations: ['Org'] },
      }),
    ];

    const clusters = clusterMentions(mentions, []);
    // incompatible DOB should block merge
    expect(clusters.length).toBe(2);
  });

  it('only clusters same entity types together', () => {
    const mentions = [
      makeMention({
        entity_mention_id: 'em_a',
        normalised_value: 'Alpha Foundation',
        entity_type: 'person',
      }),
      makeMention({
        entity_mention_id: 'em_b',
        normalised_value: 'Alpha Foundation',
        entity_type: 'organisation',
      }),
    ];

    const clusters = clusterMentions(mentions, []);
    expect(clusters.length).toBe(2);
  });

  it('creates singletons for isolated mentions', () => {
    const mentions = [
      makeMention({
        entity_mention_id: 'em_a',
        normalised_value: 'Unique Person',
      }),
    ];

    const clusters = clusterMentions(mentions, []);
    expect(clusters.length).toBe(1);
    expect(clusters[0].member_mention_ids).toEqual(['em_a']);
    expect(clusters[0].cluster_confidence).toBe(1);
  });

  it('includes rationale in cluster records', () => {
    const emb = [1, 0, 0];
    const mentions = [
      makeMention({
        entity_mention_id: 'em_a',
        normalised_value: 'John Smith',
        embedding: emb,
        attributes: {
          organisations: ['Charity Alpha'],
          address: '10 Downing Street',
          roles: ['trustee'],
        },
      }),
      makeMention({
        entity_mention_id: 'em_b',
        normalised_value: 'John Smith',
        embedding: emb,
        attributes: {
          organisations: ['Charity Alpha'],
          address: '10 Downing Street',
          roles: ['trustee'],
        },
      }),
    ];

    const clusters = clusterMentions(mentions, []);
    expect(clusters[0].rationale).toBeDefined();
    expect(clusters[0].rationale.pairs.length).toBeGreaterThan(0);
  });
});

describe('computePairwiseMatches', () => {
  it('skips pairs of different entity types', () => {
    const mentions = [
      makeMention({ entity_mention_id: 'em_a', entity_type: 'person' }),
      makeMention({ entity_mention_id: 'em_b', entity_type: 'organisation' }),
    ];
    const results = computePairwiseMatches(mentions, []);
    expect(results.length).toBe(0);
  });

  it('computes N*(N-1)/2 pairs for same-type mentions', () => {
    const mentions = [
      makeMention({ entity_mention_id: 'em_a', normalised_value: 'A' }),
      makeMention({ entity_mention_id: 'em_b', normalised_value: 'B' }),
      makeMention({ entity_mention_id: 'em_c', normalised_value: 'C' }),
    ];
    const results = computePairwiseMatches(mentions, []);
    expect(results.length).toBe(3); // 3C2 = 3
  });
});

// ===================================================================
// Embedding text generation
// ===================================================================

describe('buildEmbeddingText', () => {
  it('includes normalised value', () => {
    const mention = makeMention({ normalised_value: 'John Smith' });
    const text = buildEmbeddingText(mention);
    expect(text).toContain('John Smith');
  });

  it('includes entity type', () => {
    const mention = makeMention({ entity_type: 'person' });
    const text = buildEmbeddingText(mention);
    expect(text).toContain('[person]');
  });

  it('includes organisation context', () => {
    const mention = makeMention({
      attributes: { organisation: 'Charity Alpha' },
    });
    const text = buildEmbeddingText(mention);
    expect(text).toContain('Charity Alpha');
  });

  it('includes role context', () => {
    const mention = makeMention({
      attributes: { roles: ['trustee', 'chair'] },
    });
    const text = buildEmbeddingText(mention);
    expect(text).toContain('trustee');
    expect(text).toContain('chair');
  });

  it('includes address context', () => {
    const mention = makeMention({
      attributes: { address: '10 Downing Street' },
    });
    const text = buildEmbeddingText(mention);
    expect(text).toContain('10 Downing Street');
  });
});

describe('applyEmbeddings', () => {
  it('applies embeddings to matching mentions', () => {
    const mentions = [
      makeMention({ entity_mention_id: 'em_a', embedding: null }),
      makeMention({ entity_mention_id: 'em_b', embedding: null }),
    ];
    const embeddings = [
      { entity_mention_id: 'em_a', embedding: [1, 2, 3] },
    ];

    const result = applyEmbeddings(mentions, embeddings);
    expect(result[0].embedding).toEqual([1, 2, 3]);
    expect(result[1].embedding).toBeNull();
  });

  it('does not mutate original mentions', () => {
    const original = makeMention({ entity_mention_id: 'em_a', embedding: null });
    const mentions = [original];
    const embeddings = [
      { entity_mention_id: 'em_a', embedding: [1, 2, 3] },
    ];

    applyEmbeddings(mentions, embeddings);
    expect(original.embedding).toBeNull();
  });
});

// ===================================================================
// Canonical Entity Mapping (R2.9)
// ===================================================================

describe('clusterSignature', () => {
  it('produces deterministic signature from sorted IDs', () => {
    expect(clusterSignature(['em_b', 'em_a'])).toBe('em_a|em_b');
    expect(clusterSignature(['em_a', 'em_b'])).toBe('em_a|em_b');
  });

  it('handles singletons', () => {
    expect(clusterSignature(['em_a'])).toBe('em_a');
  });
});

describe('selectDisplayName', () => {
  it('returns normalised_value for singletons', () => {
    const members = [makeMention({ normalised_value: 'John Smith' })];
    expect(selectDisplayName(members)).toBe('John Smith');
  });

  it('prefers highest confidence name', () => {
    const members = [
      makeMention({ normalised_value: 'J Smith', extraction_confidence: 0.70 }),
      makeMention({ normalised_value: 'John Smith', extraction_confidence: 0.95 }),
    ];
    expect(selectDisplayName(members)).toBe('John Smith');
  });

  it('prefers longer name at equal confidence', () => {
    const members = [
      makeMention({ normalised_value: 'J Smith', extraction_confidence: 0.90 }),
      makeMention({ normalised_value: 'John Smith', extraction_confidence: 0.90 }),
    ];
    expect(selectDisplayName(members)).toBe('John Smith');
  });

  it('returns Unknown for empty members', () => {
    expect(selectDisplayName([])).toBe('Unknown');
  });
});

describe('mergeAttributes', () => {
  it('merges array fields with deduplication', () => {
    const members = [
      makeMention({ attributes: { roles: ['trustee', 'chair'] } }),
      makeMention({ attributes: { roles: ['trustee', 'director'] } }),
    ];
    const merged = mergeAttributes(members);
    const roles = merged.roles as string[];
    expect(roles).toContain('trustee');
    expect(roles).toContain('chair');
    expect(roles).toContain('director');
    expect(roles.length).toBe(3);
  });

  it('keeps first non-empty scalar value', () => {
    const members = [
      makeMention({ attributes: { postcode: 'SW1A 2AA' } }),
      makeMention({ attributes: { postcode: 'EC1A 1BB' } }),
    ];
    const merged = mergeAttributes(members);
    expect(merged.postcode).toBe('SW1A 2AA');
  });

  it('returns empty object for empty members', () => {
    expect(mergeAttributes([])).toEqual({});
  });
});

describe('resolveCanonicalId', () => {
  it('reuses exact match canonical ID', () => {
    const cluster = {
      cluster_id: 'cl_001',
      entity_type: 'person',
      member_mention_ids: ['em_a', 'em_b'],
      cluster_confidence: 0.95,
      decision_status: 'auto-cluster' as const,
      created_by: 'system:entity_resolution',
      rationale: { pairs: [], blockers_applied: [], human_decisions_replayed: [] },
    };

    const existingClusters: IdentityCluster[] = [
      {
        cluster_id: 'old_cl_001',
        canonical_entity_id: 'ce_existing',
        run_id: 'run_old',
        entity_type: 'person',
        member_mention_ids: ['em_a', 'em_b'],
        cluster_confidence: 0.92,
        decision_status: 'auto-cluster',
        created_by: 'system:entity_resolution',
        created_at: '2026-01-01T00:00:00Z',
      },
    ];

    const lookup = buildExistingLookup(existingClusters, []);
    const id = resolveCanonicalId(cluster, lookup);
    expect(id).toBe('ce_existing');
  });

  it('reuses canonical ID from overlapping prior cluster', () => {
    const cluster = {
      cluster_id: 'cl_001',
      entity_type: 'person',
      member_mention_ids: ['em_a', 'em_b', 'em_c'],
      cluster_confidence: 0.90,
      decision_status: 'auto-cluster' as const,
      created_by: 'system:entity_resolution',
      rationale: { pairs: [], blockers_applied: [], human_decisions_replayed: [] },
    };

    const existingClusters: IdentityCluster[] = [
      {
        cluster_id: 'old_cl_001',
        canonical_entity_id: 'ce_overlap',
        run_id: 'run_old',
        entity_type: 'person',
        member_mention_ids: ['em_a', 'em_b'],
        cluster_confidence: 0.92,
        decision_status: 'auto-cluster',
        created_by: 'system:entity_resolution',
        created_at: '2026-01-01T00:00:00Z',
      },
    ];

    const lookup = buildExistingLookup(existingClusters, []);
    const id = resolveCanonicalId(cluster, lookup);
    expect(id).toBe('ce_overlap');
  });

  it('generates new ID when no overlap exists', () => {
    const cluster = {
      cluster_id: 'cl_001',
      entity_type: 'person',
      member_mention_ids: ['em_x', 'em_y'],
      cluster_confidence: 0.90,
      decision_status: 'auto-cluster' as const,
      created_by: 'system:entity_resolution',
      rationale: { pairs: [], blockers_applied: [], human_decisions_replayed: [] },
    };

    const lookup = buildExistingLookup([], []);
    const id = resolveCanonicalId(cluster, lookup);
    // Should be a ULID (26 chars, alphanumeric)
    expect(id).toMatch(/^[0-9A-Z]{26}$/);
  });
});

describe('mapClustersToCanonical', () => {
  it('creates canonical entities and identity clusters', () => {
    const mentions = [
      makeMention({
        entity_mention_id: 'em_a',
        normalised_value: 'John Smith',
        extraction_confidence: 0.95,
        attributes: { roles: ['trustee'] },
      }),
      makeMention({
        entity_mention_id: 'em_b',
        normalised_value: 'J Smith',
        extraction_confidence: 0.80,
      }),
    ];

    const clusters = [
      {
        cluster_id: 'cl_001',
        entity_type: 'person',
        member_mention_ids: ['em_a', 'em_b'],
        cluster_confidence: 0.92,
        decision_status: 'auto-cluster' as const,
        created_by: 'system:entity_resolution',
        rationale: { pairs: [], blockers_applied: [], human_decisions_replayed: [] },
      },
    ];

    const result = mapClustersToCanonical(clusters, mentions, 'run_001');

    expect(result.canonicalEntities.length).toBe(1);
    expect(result.identityClusters.length).toBe(1);

    const ce = result.canonicalEntities[0];
    expect(ce.entity_type).toBe('person');
    expect(ce.display_name).toBe('John Smith'); // higher confidence
    expect(ce.first_seen_run_id).toBe('run_001');
    expect(ce.last_seen_run_id).toBe('run_001');
    expect(ce.attributes).toHaveProperty('roles');

    const ic = result.identityClusters[0];
    expect(ic.cluster_id).toBe('cl_001');
    expect(ic.canonical_entity_id).toBe(ce.canonical_entity_id);
    expect(ic.run_id).toBe('run_001');
    expect(ic.member_mention_ids).toEqual(['em_a', 'em_b']);
    expect(ic.cluster_confidence).toBe(0.92);
    expect(ic.decision_status).toBe('auto-cluster');
  });

  it('preserves first_seen_run_id from prior runs', () => {
    const mentions = [
      makeMention({ entity_mention_id: 'em_a', normalised_value: 'John Smith' }),
    ];

    const clusters = [
      {
        cluster_id: 'cl_001',
        entity_type: 'person',
        member_mention_ids: ['em_a'],
        cluster_confidence: 1,
        decision_status: 'auto-cluster' as const,
        created_by: 'system:entity_resolution',
        rationale: { pairs: [], blockers_applied: [], human_decisions_replayed: [] },
      },
    ];

    const existingClusters: IdentityCluster[] = [
      {
        cluster_id: 'old_cl',
        canonical_entity_id: 'ce_old',
        run_id: 'run_old',
        entity_type: 'person',
        member_mention_ids: ['em_a'],
        cluster_confidence: 1,
        decision_status: 'auto-cluster',
        created_by: 'system:entity_resolution',
        created_at: '2026-01-01T00:00:00Z',
      },
    ];

    const existingEntities: CanonicalEntity[] = [
      {
        canonical_entity_id: 'ce_old',
        entity_type: 'person',
        display_name: 'John Smith',
        first_seen_run_id: 'run_original',
        last_seen_run_id: 'run_old',
        attributes: {},
        source: 'corpus',
      },
    ];

    const result = mapClustersToCanonical(
      clusters, mentions, 'run_002', existingClusters, existingEntities,
    );

    expect(result.canonicalEntities[0].canonical_entity_id).toBe('ce_old');
    expect(result.canonicalEntities[0].first_seen_run_id).toBe('run_original');
    expect(result.canonicalEntities[0].last_seen_run_id).toBe('run_002');
  });

  it('handles empty clusters array', () => {
    const result = mapClustersToCanonical([], [], 'run_001');
    expect(result.canonicalEntities).toEqual([]);
    expect(result.identityClusters).toEqual([]);
  });
});

// ===================================================================
// Integration: end-to-end clustering + canonical mapping
// ===================================================================

describe('end-to-end: cluster then map', () => {
  it('clusters similar mentions and creates stable canonical entities', () => {
    const emb = [1, 0, 0];
    const mentions = [
      makeMention({
        entity_mention_id: 'em_001',
        normalised_value: 'John Smith',
        embedding: emb,
        extraction_confidence: 0.95,
        attributes: {
          organisations: ['Charity Alpha'],
          address: '10 Downing Street',
          roles: ['trustee'],
        },
      }),
      makeMention({
        entity_mention_id: 'em_002',
        normalised_value: 'John Smith',
        embedding: emb,
        extraction_confidence: 0.90,
        attributes: {
          organisations: ['Charity Alpha'],
          address: '10 Downing Street',
          roles: ['trustee', 'chair'],
        },
      }),
      makeMention({
        entity_mention_id: 'em_003',
        normalised_value: 'Sarah Williams',
        extraction_confidence: 0.88,
      }),
    ];

    // Step 1: Cluster
    const clusters = clusterMentions(mentions, []);

    // Should have 2 clusters: one for John Smith (merged), one for Sarah Williams
    expect(clusters.length).toBe(2);

    const johnCluster = clusters.find((c) =>
      c.member_mention_ids.includes('em_001'),
    )!;
    const sarahCluster = clusters.find((c) =>
      c.member_mention_ids.includes('em_003'),
    )!;

    expect(johnCluster.member_mention_ids).toContain('em_001');
    expect(johnCluster.member_mention_ids).toContain('em_002');
    expect(sarahCluster.member_mention_ids).toEqual(['em_003']);

    // Step 2: Map to canonical entities
    const result = mapClustersToCanonical(clusters, mentions, 'run_001');

    expect(result.canonicalEntities.length).toBe(2);
    expect(result.identityClusters.length).toBe(2);

    const johnEntity = result.canonicalEntities.find(
      (e) => e.display_name === 'John Smith',
    )!;
    expect(johnEntity).toBeDefined();
    expect(johnEntity.entity_type).toBe('person');
    // Merged attributes should include both roles
    const roles = johnEntity.attributes.roles as string[];
    expect(roles).toContain('trustee');
    expect(roles).toContain('chair');

    // Step 3: Re-run with same data should produce stable IDs
    const clusters2 = clusterMentions(mentions, []);
    const result2 = mapClustersToCanonical(
      clusters2,
      mentions,
      'run_002',
      result.identityClusters,
      result.canonicalEntities,
    );

    // Canonical IDs should be preserved across runs
    const johnEntity2 = result2.canonicalEntities.find(
      (e) => e.display_name === 'John Smith',
    )!;
    expect(johnEntity2.canonical_entity_id).toBe(johnEntity.canonical_entity_id);
    expect(johnEntity2.first_seen_run_id).toBe('run_001');
    expect(johnEntity2.last_seen_run_id).toBe('run_002');
  });
});
