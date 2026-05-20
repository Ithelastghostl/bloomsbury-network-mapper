/**
 * Tests for Epic 9 — Candidate Dossier (F9.3) and Introduction Angle (F9.4).
 * Pure functions — no Supabase required.
 */
import { describe, it, expect, vi } from 'vitest';
import { assembleDossier, type DossierInput } from '@/lib/dossier/assemble';
import { generateSkeleton, type SkeletonInput } from '@/lib/intro-angle/skeleton';
import {
  extractFacts,
  validateRephrase,
  rephraseWithValidation,
} from '@/lib/intro-angle/rephrase';
import type {
  CandidateRecommendation,
  CanonicalEntity,
  EnrichmentSignal,
  HumanDecision,
  IdentityCluster,
  Relationship,
  EntityMention,
  EvidenceSpan,
} from '@/types/database';

// ===================================================================
// Fixtures
// ===================================================================

function makeCandidateRecommendation(
  overrides?: Partial<CandidateRecommendation>,
): CandidateRecommendation {
  return {
    candidate_recommendation_id: 'rec-001',
    run_id: 'run-001',
    seed_id: 'seed-001',
    candidate_entity_id: 'ent-candidate',
    presentation_group_id: null,
    rank: 1,
    priority_score: 0.72,
    confidence_score: 0.65,
    status: 'Ready for Review',
    strongest_path: {
      allPaths: [
        {
          path: ['ent-seed', 'ent-charity', 'ent-candidate'],
          score: { pathScore: 0.68 },
          templateId: 'trustee_co_service',
          templateName: 'Trustee co-service',
        },
        {
          path: ['ent-seed', 'ent-charity2', 'ent-candidate'],
          score: { pathScore: 0.45 },
          templateId: 'trustee_co_service',
          templateName: 'Trustee co-service',
        },
      ],
      sharedAffiliations: ['Charity One', 'Charity Two'],
      priorityBreakdown: {
        introability: 0.8,
        affinity: 0.7,
        capacitySignal: 0.6,
        influence: 0.5,
        strategicFit: 0.4,
      },
      confidenceBreakdown: {
        identityConfidence: 0.8,
        relationshipConfidence: 0.7,
        sourceCorroboration: 0.6,
        freshness: 0.5,
      },
    },
    reason_codes: ['shared_trustee_role', 'multi_path_convergence'],
    identity_warnings: ['Low cluster confidence for some mentions'],
    introduction_route_id: null,
    target_seed_id: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeSeedEntity(): CanonicalEntity {
  return {
    canonical_entity_id: 'ent-seed',
    entity_type: 'person',
    display_name: 'Alice Seed',
    first_seen_run_id: 'run-001',
    last_seen_run_id: 'run-001',
    attributes: {},
    source: 'corpus',
  };
}

function makeCandidateEntity(): CanonicalEntity {
  return {
    canonical_entity_id: 'ent-candidate',
    entity_type: 'person',
    display_name: 'Bob Candidate',
    first_seen_run_id: 'run-001',
    last_seen_run_id: 'run-001',
    attributes: {},
    source: 'corpus',
  };
}

function makeRelationships(): Relationship[] {
  return [
    {
      relationship_id: 'rel-001',
      run_id: 'run-001',
      source_entity_id: 'ent-candidate',
      target_entity_id: 'ent-charity',
      relationship_type: 'TRUSTEE_OF',
      valid_from: '2021-01-01',
      valid_to: null,
      evidence_id: 'ev-001',
      confidence: 0.85,
      freshness_multiplier: 1.0,
      source_reliability: 0.9,
      edge_weight: 0.8,
      status: 'active',
    },
    {
      relationship_id: 'rel-002',
      run_id: 'run-001',
      source_entity_id: 'ent-candidate',
      target_entity_id: 'ent-company',
      relationship_type: 'DIRECTOR_OF',
      valid_from: '2019-06-01',
      valid_to: '2023-12-31',
      evidence_id: 'ev-002',
      confidence: 0.9,
      freshness_multiplier: 0.85,
      source_reliability: 0.95,
      edge_weight: 0.85,
      status: 'active',
    },
  ];
}

function makeEvidenceSpans(): EvidenceSpan[] {
  return [
    {
      evidence_id: 'ev-001',
      document_id: 'doc-001',
      run_id: 'run-001',
      text: 'Bob Candidate was appointed trustee of Charity One in January 2021.',
      span_start: 0,
      span_end: 67,
      source_section: 'trustees_report',
      evidence_type: 'appointment',
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      evidence_id: 'ev-002',
      document_id: 'doc-002',
      run_id: 'run-001',
      text: 'Bob Candidate served as director of Company X from June 2019 to December 2023.',
      span_start: 0,
      span_end: 78,
      source_section: 'directors_report',
      evidence_type: 'role',
      created_at: '2026-01-01T00:00:00Z',
    },
  ];
}

function makeMentions(): EntityMention[] {
  return [
    {
      entity_mention_id: 'men-001',
      document_id: 'doc-001',
      run_id: 'run-001',
      entity_type: 'person',
      raw_value: 'Bob Candidate',
      normalised_value: 'bob candidate',
      attributes: {},
      evidence_span: 'Bob Candidate was appointed trustee',
      span_start: 0,
      span_end: 35,
      extraction_confidence: 0.9,
      validation_status: 'valid',
      embedding: null,
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      entity_mention_id: 'men-002',
      document_id: 'doc-002',
      run_id: 'run-001',
      entity_type: 'person',
      raw_value: 'R. Candidate',
      normalised_value: 'bob candidate',
      attributes: {},
      evidence_span: 'R. Candidate served as director',
      span_start: 0,
      span_end: 31,
      extraction_confidence: 0.75,
      validation_status: 'valid',
      embedding: null,
      created_at: '2026-01-01T00:00:00Z',
    },
  ];
}

function makeClusters(): IdentityCluster[] {
  return [
    {
      cluster_id: 'cluster-001',
      canonical_entity_id: 'ent-candidate',
      run_id: 'run-001',
      entity_type: 'person',
      member_mention_ids: ['men-001', 'men-002'],
      cluster_confidence: 0.82,
      decision_status: 'auto',
      created_by: 'system',
      created_at: '2026-01-01T00:00:00Z',
    },
  ];
}

function makeEnrichmentSignals(): EnrichmentSignal[] {
  return [
    {
      enrichment_signal_id: 'sig-001',
      candidate_entity_id: 'ent-candidate',
      source: 'companies_house',
      external_record_id: 'CH-123456',
      signal_type: 'company_officer',
      signal_payload: { company_name: 'Company X', role: 'director' },
      match_confidence: 0.88,
      retrieved_at: '2026-01-10T00:00:00Z',
      cache_expires_at: '2026-04-10T00:00:00Z',
      accepted_for_scoring: true,
      status: 'active',
    },
  ];
}

function makeDecisions(): HumanDecision[] {
  return [];
}

function makeEntityNames(): Record<string, string> {
  return {
    'ent-seed': 'Alice Seed',
    'ent-candidate': 'Bob Candidate',
    'ent-charity': 'Charity One',
    'ent-charity2': 'Charity Two',
    'ent-company': 'Company X',
  };
}

function buildDossierInput(overrides?: Partial<DossierInput>): DossierInput {
  return {
    candidate: makeCandidateRecommendation(),
    entity: makeCandidateEntity(),
    seedEntity: makeSeedEntity(),
    enrichmentSignals: makeEnrichmentSignals(),
    decisions: makeDecisions(),
    clusters: makeClusters(),
    relationships: makeRelationships(),
    mentions: makeMentions(),
    evidenceSpans: makeEvidenceSpans(),
    entityNames: makeEntityNames(),
    ...overrides,
  };
}

// ===================================================================
// F9.3-T1: Dossier data assembly — all sections present
// ===================================================================

describe('Dossier Assembly (F9.3-T1)', () => {
  it('should assemble a complete dossier with all sections', () => {
    const input = buildDossierInput();
    const dossier = assembleDossier(input);

    // Summary
    expect(dossier.candidateName).toBe('Bob Candidate');
    expect(dossier.candidateEntityId).toBe('ent-candidate');
    expect(dossier.candidateType).toBe('person');
    expect(dossier.candidateRecommendationId).toBe('rec-001');
    expect(dossier.runId).toBe('run-001');

    // Reason codes
    expect(dossier.reasonCodes).toContain('shared_trustee_role');
    expect(dossier.reasonCodes).toContain('multi_path_convergence');

    // All top-level sections must be present (non-undefined)
    expect(dossier.priorityScore).toBeDefined();
    expect(dossier.confidenceScore).toBeDefined();
    expect(dossier.introAngle).toBeDefined();
    expect(dossier.paths).toBeDefined();
    expect(dossier.evidence).toBeDefined();
    expect(dossier.roles).toBeDefined();
    expect(dossier.enrichmentSignals).toBeDefined();
    expect(dossier.identityNotes).toBeDefined();
    expect(dossier.identityWarnings).toBeDefined();
  });

  it('should populate paths from strongest_path data', () => {
    const dossier = assembleDossier(buildDossierInput());
    expect(dossier.paths.length).toBe(2);
    expect(dossier.paths[0].nodes).toEqual(['ent-seed', 'ent-charity', 'ent-candidate']);
    expect(dossier.paths[0].score).toBe(0.68);
    expect(dossier.paths[0].templateId).toBe('trustee_co_service');
  });

  it('should identify strongest and shortest paths', () => {
    const dossier = assembleDossier(buildDossierInput());
    expect(dossier.strongestPath).not.toBeNull();
    expect(dossier.strongestPath!.score).toBe(0.68);
    expect(dossier.shortestPath).not.toBeNull();
  });

  it('should build evidence from relationships and mentions', () => {
    const dossier = assembleDossier(buildDossierInput());
    // 2 evidence from relationships (matching evidence spans) + 2 from mentions
    expect(dossier.evidence.length).toBeGreaterThanOrEqual(2);
    // Verify evidence has expected fields
    for (const e of dossier.evidence) {
      expect(e.claim).toBeTruthy();
      expect(e.confidence).toBeGreaterThan(0);
    }
  });

  it('should build roles from TRUSTEE_OF and DIRECTOR_OF relationships', () => {
    const dossier = assembleDossier(buildDossierInput());
    expect(dossier.roles.length).toBe(2);
    const trusteeRole = dossier.roles.find((r) => r.role === 'trustee');
    expect(trusteeRole).toBeDefined();
    expect(trusteeRole!.entity).toBe('Charity One');
    expect(trusteeRole!.start).toBe('2021-01-01');
    expect(trusteeRole!.end).toBeNull();

    const directorRole = dossier.roles.find((r) => r.role === 'director');
    expect(directorRole).toBeDefined();
    expect(directorRole!.entity).toBe('Company X');
    expect(directorRole!.start).toBe('2019-06-01');
    expect(directorRole!.end).toBe('2023-12-31');
  });

  it('should build enrichment signals', () => {
    const dossier = assembleDossier(buildDossierInput());
    expect(dossier.enrichmentSignals.length).toBe(1);
    expect(dossier.enrichmentSignals[0].source).toBe('companies_house');
    expect(dossier.enrichmentSignals[0].matchConfidence).toBe(0.88);
  });

  it('should build identity notes from clusters and mentions', () => {
    const dossier = assembleDossier(buildDossierInput());
    expect(dossier.identityNotes.underlyingMentions.length).toBe(2);
    expect(dossier.identityNotes.clusterConfidence).toBe(0.82);
    expect(dossier.identityNotes.decisionStatus).toBe('auto');
  });

  it('should include identity warnings from candidate', () => {
    const dossier = assembleDossier(buildDossierInput());
    expect(dossier.identityWarnings).toContain(
      'Low cluster confidence for some mentions',
    );
  });

  it('should return null decision when no decisions exist', () => {
    const dossier = assembleDossier(buildDossierInput());
    expect(dossier.decision).toBeNull();
  });

  it('should populate decision when decisions exist', () => {
    const input = buildDossierInput({
      decisions: [
        {
          human_decision_id: 'dec-001',
          candidate_recommendation_id: 'rec-001',
          decision: 'qualified',
          reason_code: null,
          notes: 'Strong fit based on charity overlap',
          decided_by: 'reviewer-1',
          decided_at: '2026-01-15T10:00:00Z',
          cold_start_decision: false,
        },
      ],
    });
    const dossier = assembleDossier(input);
    expect(dossier.decision).not.toBeNull();
    expect(dossier.decision!.status).toBe('qualified');
    expect(dossier.decision!.notes).toBe('Strong fit based on charity overlap');
    expect(dossier.decision!.decidedBy).toBe('reviewer-1');
  });

  it('should handle empty strongest_path gracefully', () => {
    const input = buildDossierInput({
      candidate: makeCandidateRecommendation({
        strongest_path: {},
      }),
    });
    const dossier = assembleDossier(input);
    expect(dossier.paths).toEqual([]);
    expect(dossier.strongestPath).toBeNull();
    expect(dossier.shortestPath).toBeNull();
  });

  it('should derive discovery methods from reason codes', () => {
    const dossier = assembleDossier(buildDossierInput());
    expect(dossier.discoveryMethods).toContain('path-template');
    expect(dossier.discoveryMethods).toContain('multi-path');
  });

  it('should include shared affiliations from candidate data', () => {
    const dossier = assembleDossier(buildDossierInput());
    expect(dossier.sharedAffiliations).toContain('Charity One');
    expect(dossier.sharedAffiliations).toContain('Charity Two');
  });

  it('should flag low-confidence clusters as possible duplicates', () => {
    const input = buildDossierInput({
      clusters: [
        {
          cluster_id: 'cluster-low',
          canonical_entity_id: 'ent-candidate',
          run_id: 'run-001',
          entity_type: 'person',
          member_mention_ids: ['men-001'],
          cluster_confidence: 0.45,
          decision_status: 'auto',
          created_by: 'system',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    });
    const dossier = assembleDossier(input);
    expect(dossier.identityNotes.possibleDuplicates.length).toBeGreaterThan(0);
    expect(dossier.identityNotes.possibleDuplicates[0]).toContain('low confidence');
  });
});

// ===================================================================
// F9.3-T3: Score breakdowns — R5.1, R5.2
// ===================================================================

describe('Score Breakdowns (F9.3-T3)', () => {
  it('should populate priority score breakdown per §18.1', () => {
    const dossier = assembleDossier(buildDossierInput());
    expect(dossier.priorityScore.total).toBe(0.72);
    expect(dossier.priorityScore.introability).toBe(0.8);
    expect(dossier.priorityScore.affinity).toBe(0.7);
    expect(dossier.priorityScore.capacitySignal).toBe(0.6);
    expect(dossier.priorityScore.influence).toBe(0.5);
    expect(dossier.priorityScore.strategicFit).toBe(0.4);
  });

  it('should populate confidence score breakdown per §18.2', () => {
    const dossier = assembleDossier(buildDossierInput());
    expect(dossier.confidenceScore.total).toBe(0.65);
    expect(dossier.confidenceScore.identityConfidence).toBe(0.8);
    expect(dossier.confidenceScore.relationshipConfidence).toBe(0.7);
    expect(dossier.confidenceScore.sourceCorroboration).toBe(0.6);
    expect(dossier.confidenceScore.freshness).toBe(0.5);
  });

  it('should default breakdown components to 0 when not stored', () => {
    const input = buildDossierInput({
      candidate: makeCandidateRecommendation({
        strongest_path: { allPaths: [] },
      }),
    });
    const dossier = assembleDossier(input);
    expect(dossier.priorityScore.introability).toBe(0);
    expect(dossier.confidenceScore.identityConfidence).toBe(0);
  });
});

// ===================================================================
// F9.3-T4: Recommended introducer and strongest path — R5.3, R5.4
// ===================================================================

describe('Recommended Introducer (F9.3-T4)', () => {
  it('should include recommended introducer as seed entity', () => {
    const dossier = assembleDossier(buildDossierInput());
    expect(dossier.introAngle.recommendedIntroducer).toBe('Alice Seed');
    expect(dossier.introAngle.recommendedIntroducerId).toBe('ent-seed');
  });

  it('should include skeleton intro angle', () => {
    const dossier = assembleDossier(buildDossierInput());
    expect(dossier.introAngle.skeleton).toBeTruthy();
    expect(dossier.introAngle.skeleton).toContain('Bob Candidate');
    expect(dossier.introAngle.skeleton).toContain('Alice Seed');
  });
});

// ===================================================================
// F9.4-T1: Skeleton generation — §18.8 steps 1-2
// ===================================================================

describe('Skeleton Generation (F9.4-T1)', () => {
  const baseInput: SkeletonInput = {
    seedName: 'Alice Seed',
    candidateName: 'Bob Candidate',
    pathNodes: ['ent-seed', 'ent-charity', 'ent-candidate'],
    entityNames: {
      'ent-seed': 'Alice Seed',
      'ent-charity': 'Charity One',
      'ent-candidate': 'Bob Candidate',
    },
    roles: [
      { entity: 'Charity One', role: 'trustee', start: '2021', end: null },
    ],
    sharedAffiliations: ['Charity One'],
  };

  it('should generate skeleton mentioning seed and candidate names', () => {
    const result = generateSkeleton(baseInput);
    expect(result).toContain('Bob Candidate');
    expect(result).toContain('Alice Seed');
  });

  it('should mention intermediary entity from path', () => {
    const result = generateSkeleton(baseInput);
    expect(result).toContain('Charity One');
  });

  it('should include role information from evidence', () => {
    const result = generateSkeleton(baseInput);
    expect(result).toContain('trustee');
    expect(result).toContain('Charity One');
    expect(result).toContain('since 2021');
  });

  it('should handle direct path (no intermediaries)', () => {
    const input: SkeletonInput = {
      seedName: 'Alice',
      candidateName: 'Bob',
      pathNodes: ['ent-seed', 'ent-candidate'],
      entityNames: { 'ent-seed': 'Alice', 'ent-candidate': 'Bob' },
      roles: [],
      sharedAffiliations: [],
    };
    const result = generateSkeleton(input);
    expect(result).toContain('direct connection');
  });

  it('should handle path with multiple intermediaries', () => {
    const input: SkeletonInput = {
      seedName: 'Alice',
      candidateName: 'Bob',
      pathNodes: ['ent-seed', 'ent-trust', 'ent-charity', 'ent-candidate'],
      entityNames: {
        'ent-seed': 'Alice',
        'ent-trust': 'Trust A',
        'ent-charity': 'Charity B',
        'ent-candidate': 'Bob',
      },
      roles: [],
      sharedAffiliations: [],
    };
    const result = generateSkeleton(input);
    expect(result).toContain('Trust A');
    expect(result).toContain('Charity B');
  });

  it('should handle date ranges with both start and end', () => {
    const input: SkeletonInput = {
      ...baseInput,
      roles: [
        {
          entity: 'Company X',
          role: 'director',
          start: '2019',
          end: '2023',
        },
      ],
    };
    const result = generateSkeleton(input);
    expect(result).toContain('from 2019 to 2023');
  });

  it('should handle missing path (fallback message)', () => {
    const input: SkeletonInput = {
      seedName: 'Alice',
      candidateName: 'Bob',
      pathNodes: [],
      entityNames: {},
      roles: [],
      sharedAffiliations: [],
    };
    const result = generateSkeleton(input);
    expect(result).toContain('Bob');
    expect(result).toContain('Alice');
  });

  it('should NOT include information not in the input', () => {
    const result = generateSkeleton(baseInput);
    // Should not invent random organisations or people
    expect(result).not.toContain('Company X');
    expect(result).not.toContain('Charlie');
  });
});

// ===================================================================
// F9.4-T2: Fact validation — §18.8 steps 3-4
// ===================================================================

describe('Fact Extraction and Validation (F9.4-T2)', () => {
  const input: SkeletonInput = {
    seedName: 'Alice Seed',
    candidateName: 'Bob Candidate',
    pathNodes: ['ent-seed', 'ent-charity', 'ent-candidate'],
    entityNames: {
      'ent-seed': 'Alice Seed',
      'ent-charity': 'Charity One',
      'ent-candidate': 'Bob Candidate',
    },
    roles: [
      {
        entity: 'Charity One',
        role: 'trustee',
        start: '2021',
        end: null,
      },
    ],
    sharedAffiliations: ['Charity One'],
  };

  it('should extract all entity names as facts', () => {
    const facts = extractFacts(input);
    expect(facts.names.has('alice seed')).toBe(true);
    expect(facts.names.has('bob candidate')).toBe(true);
    expect(facts.names.has('charity one')).toBe(true);
  });

  it('should extract roles as facts', () => {
    const facts = extractFacts(input);
    expect(facts.roles.has('trustee')).toBe(true);
  });

  it('should extract dates as facts', () => {
    const facts = extractFacts(input);
    expect(facts.dates.has('2021')).toBe(true);
  });

  it('should validate output containing only known facts', () => {
    const facts = extractFacts(input);
    const output =
      'Bob Candidate is connected to Alice Seed through Charity One, where Bob Candidate has served as trustee since 2021.';
    const result = validateRephrase(output, facts);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('should reject output containing unknown entities', () => {
    const facts = extractFacts(input);
    const output =
      'Bob Candidate is connected to Alice Seed through Goldman Sachs.';
    const result = validateRephrase(output, facts);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes('Goldman'))).toBe(true);
  });

  it('should reject output containing unknown dates', () => {
    const facts = extractFacts(input);
    const output =
      'Bob Candidate has been a trustee since 2015.';
    const result = validateRephrase(output, facts);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes('2015'))).toBe(true);
  });
});

// ===================================================================
// F9.4-T2 + T3: Rephrase with validation and fallback — §18.8 steps 3-6
// ===================================================================

describe('Rephrase with Validation (F9.4-T2, T3)', () => {
  const input: SkeletonInput = {
    seedName: 'Alice Seed',
    candidateName: 'Bob Candidate',
    pathNodes: ['ent-seed', 'ent-charity', 'ent-candidate'],
    entityNames: {
      'ent-seed': 'Alice Seed',
      'ent-charity': 'Charity One',
      'ent-candidate': 'Bob Candidate',
    },
    roles: [
      {
        entity: 'Charity One',
        role: 'trustee',
        start: '2021',
        end: null,
      },
    ],
    sharedAffiliations: ['Charity One'],
  };

  const skeleton = generateSkeleton(input);

  it('should return natural version when LLM output passes validation', async () => {
    const validOutput =
      'Bob Candidate and Alice Seed are connected through their shared involvement with Charity One. Bob Candidate has served as trustee at Charity One since 2021.';

    const result = await rephraseWithValidation(skeleton, input, {
      callLLM: vi.fn().mockResolvedValue(validOutput),
    });

    expect(result.skeleton).toBe(skeleton);
    expect(result.natural).toBe(validOutput);
  });

  it('should fall back to skeleton when LLM output contains unknown entities', async () => {
    const invalidOutput =
      'Bob Candidate works at Microsoft and knows Alice Seed through Charity One since 2021.';

    const result = await rephraseWithValidation(skeleton, input, {
      callLLM: vi.fn().mockResolvedValue(invalidOutput),
    });

    expect(result.skeleton).toBe(skeleton);
    expect(result.natural).toBe(skeleton); // Falls back
  });

  it('should fall back to skeleton when LLM call fails', async () => {
    const result = await rephraseWithValidation(skeleton, input, {
      callLLM: vi.fn().mockRejectedValue(new Error('LLM unavailable')),
    });

    expect(result.skeleton).toBe(skeleton);
    expect(result.natural).toBe(skeleton); // Falls back
  });

  it('should provide both skeleton and natural versions per R5.5', async () => {
    const naturalOutput =
      'Through Charity One, Bob Candidate is connected to Alice Seed. Bob Candidate has served as trustee since 2021.';

    const result = await rephraseWithValidation(skeleton, input, {
      callLLM: vi.fn().mockResolvedValue(naturalOutput),
    });

    // Both versions available per §18.8 step 6, R5.5
    expect(result.skeleton).toBeTruthy();
    expect(result.natural).toBeTruthy();
    expect(result.skeleton).not.toBe('');
    expect(result.natural).not.toBe('');
  });
});

// ===================================================================
// Dossier API response shape
// ===================================================================

describe('Dossier API Response Shape', () => {
  it('should produce a JSON-serialisable dossier', () => {
    const dossier = assembleDossier(buildDossierInput());
    const json = JSON.stringify(dossier);
    const parsed = JSON.parse(json);

    // Verify key fields survive round-trip
    expect(parsed.candidateRecommendationId).toBe('rec-001');
    expect(parsed.priorityScore.total).toBe(0.72);
    expect(parsed.confidenceScore.total).toBe(0.65);
    expect(parsed.paths).toHaveLength(2);
    expect(parsed.introAngle.skeleton).toBeTruthy();
    expect(parsed.identityWarnings).toHaveLength(1);
  });

  it('should include all §18.7 top-level sections', () => {
    const dossier = assembleDossier(buildDossierInput());
    const keys = Object.keys(dossier);

    // All required sections per §18.7
    expect(keys).toContain('candidateName');
    expect(keys).toContain('candidateType');
    expect(keys).toContain('priorityScore');
    expect(keys).toContain('confidenceScore');
    expect(keys).toContain('introAngle');
    expect(keys).toContain('paths');
    expect(keys).toContain('evidence');
    expect(keys).toContain('roles');
    expect(keys).toContain('enrichmentSignals');
    expect(keys).toContain('identityNotes');
    expect(keys).toContain('decision');
    expect(keys).toContain('identityWarnings');
    expect(keys).toContain('aggregatedMentions');
    expect(keys).toContain('reasonCodes');
    expect(keys).toContain('strongestPath');
    expect(keys).toContain('shortestPath');
    expect(keys).toContain('sharedAffiliations');
    expect(keys).toContain('discoveryMethods');
  });
});
