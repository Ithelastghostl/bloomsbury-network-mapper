/**
 * Discovery API path scoring tests (F7.4-T5).
 * 20+ path scoring tests covering §16.2 formula, templates, eligibility, reason codes.
 * Pure functions — no Supabase required.
 */

import { describe, it, expect } from 'vitest';
import {
  scorePath,
  scoreCandidatePaths,
  extractPathEdges,
  type PathScoreResult,
} from '@/lib/discovery/path-scoring';
import {
  matchTemplate,
  PATH_TEMPLATES,
  type PathTemplate,
} from '@/lib/discovery/path-templates';
import {
  checkEligibility,
  applyQueueLimit,
  type ExclusionContext,
  type CandidateInput,
} from '@/lib/discovery/eligibility';
import {
  generateReasonCodes,
  type ReasonCode,
} from '@/lib/discovery/reason-codes';
import {
  calculateSeedQuality,
  type SeedQualityInput,
} from '@/lib/discovery/seed-quality';
import { DirectedGraph } from '@/lib/graph/networkx';

// ===================================================================
// Helpers
// ===================================================================

function makeGraph(): DirectedGraph {
  const g = new DirectedGraph();
  // Seed person
  g.addNode({ id: 'seed_p', type: 'person', attributes: { display_name: 'Seed Person' } });
  // Charities
  g.addNode({ id: 'charity_a', type: 'charity', attributes: { display_name: 'Charity A' } });
  g.addNode({ id: 'charity_b', type: 'charity', attributes: { display_name: 'Charity B' } });
  // Companies
  g.addNode({ id: 'company_x', type: 'company', attributes: { display_name: 'Company X' } });
  // Candidate persons
  g.addNode({ id: 'cand_1', type: 'person', attributes: { display_name: 'Candidate 1' } });
  g.addNode({ id: 'cand_2', type: 'person', attributes: { display_name: 'Candidate 2' } });
  g.addNode({ id: 'cand_3', type: 'person', attributes: { display_name: 'Candidate 3' } });
  // Donation event
  g.addNode({ id: 'don_1', type: 'donation_event', attributes: { amount: 50000 } });
  // Address
  g.addNode({ id: 'addr_1', type: 'address', attributes: { display_name: '123 Street' } });

  // Seed -> Charity A (trustee)
  g.addEdge({ id: 'e1', source: 'seed_p', target: 'charity_a', type: 'TRUSTEE_OF', weight: 0.85, attributes: { confidence: 0.9 } });
  // Candidate 1 -> Charity A (trustee) — co-trustee pattern
  g.addEdge({ id: 'e2', source: 'cand_1', target: 'charity_a', type: 'TRUSTEE_OF', weight: 0.80, attributes: { confidence: 0.85 } });
  // Seed -> Company X (director)
  g.addEdge({ id: 'e3', source: 'seed_p', target: 'company_x', type: 'DIRECTOR_OF', weight: 0.70, attributes: { confidence: 0.80 } });
  // Candidate 2 -> Company X (director) — co-director pattern
  g.addEdge({ id: 'e4', source: 'cand_2', target: 'company_x', type: 'DIRECTOR_OF', weight: 0.65, attributes: { confidence: 0.75 } });
  // Seed -> DonationEvent -> Charity B -> Candidate 3 (donation chain)
  g.addEdge({ id: 'e5', source: 'seed_p', target: 'don_1', type: 'MADE_DONATION', weight: 0.75, attributes: { confidence: 0.85 } });
  g.addEdge({ id: 'e6', source: 'don_1', target: 'charity_b', type: 'RECEIVED_BY', weight: 0.75, attributes: { confidence: 0.85 } });
  g.addEdge({ id: 'e7', source: 'cand_3', target: 'charity_b', type: 'TRUSTEE_OF', weight: 0.70, attributes: { confidence: 0.80 } });
  // Candidate 1 -> Charity B too (secondary affiliation)
  g.addEdge({ id: 'e8', source: 'cand_1', target: 'charity_b', type: 'TRUSTEE_OF', weight: 0.60, attributes: { confidence: 0.70 } });
  // Shared address
  g.addEdge({ id: 'e9', source: 'seed_p', target: 'addr_1', type: 'REGISTERED_AT', weight: 0.25, attributes: { confidence: 0.60 } });
  g.addEdge({ id: 'e10', source: 'cand_2', target: 'addr_1', type: 'REGISTERED_AT', weight: 0.25, attributes: { confidence: 0.60 } });

  return g;
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

function makeCandidate(overrides: Partial<CandidateInput> = {}): CandidateInput {
  return {
    entityId: 'cand_1',
    entityType: 'person',
    hasPathToSeed: true,
    hasQualifyingSignal: true,
    confidence: 0.85,
    ...overrides,
  };
}

// ===================================================================
// Path Scoring (§16.2)
// ===================================================================

describe('scorePath', () => {
  it('scores a 2-edge path with template match (co-trustee)', () => {
    // path_score = template_weight * avg(edge_weight) * length_penalty * avg(confidence)
    const result = scorePath({
      path: ['seed_p', 'charity_a', 'cand_1'],
      template: PATH_TEMPLATES[0], // trustee_co_service, weight 1.0
      edgeWeights: [0.85, 0.80],
      evidenceConfidences: [0.9, 0.85],
    });

    const expected = 1.0 * ((0.85 + 0.80) / 2) * 0.85 * ((0.9 + 0.85) / 2);
    expect(result.pathScore).toBeCloseTo(expected, 4);
    expect(result.templateWeight).toBe(1.0);
    expect(result.lengthPenalty).toBe(0.85);
    expect(result.edgeCount).toBe(2);
  });

  it('scores a 1-edge direct path with full length penalty', () => {
    const result = scorePath({
      path: ['seed_p', 'cand_1'],
      template: null,
      edgeWeights: [0.9],
      evidenceConfidences: [0.95],
    });

    // template_weight defaults to 0.5 for null template
    const expected = 0.5 * 0.9 * 1.0 * 0.95;
    expect(result.pathScore).toBeCloseTo(expected, 4);
    expect(result.lengthPenalty).toBe(1.0);
    expect(result.edgeCount).toBe(1);
  });

  it('scores a 3-edge path with 0.65 length penalty', () => {
    const result = scorePath({
      path: ['seed_p', 'don_1', 'charity_b', 'cand_3'],
      template: PATH_TEMPLATES[1], // donation_chain, weight 0.85
      edgeWeights: [0.75, 0.75, 0.70],
      evidenceConfidences: [0.85, 0.85, 0.80],
    });

    const avgWeight = (0.75 + 0.75 + 0.70) / 3;
    const avgConf = (0.85 + 0.85 + 0.80) / 3;
    const expected = 0.85 * avgWeight * 0.65 * avgConf;
    expect(result.pathScore).toBeCloseTo(expected, 4);
    expect(result.lengthPenalty).toBe(0.65);
    expect(result.edgeCount).toBe(3);
  });

  it('returns zero for paths exceeding max edge count', () => {
    const result = scorePath({
      path: ['a', 'b', 'c', 'd', 'e'],
      template: null,
      edgeWeights: [0.5, 0.5, 0.5, 0.5],
      evidenceConfidences: [0.8, 0.8, 0.8, 0.8],
    });

    expect(result.pathScore).toBe(0);
    expect(result.edgeCount).toBe(4);
  });

  it('returns zero for empty path', () => {
    const result = scorePath({
      path: ['a'],
      template: null,
      edgeWeights: [],
      evidenceConfidences: [],
    });

    expect(result.pathScore).toBe(0);
    expect(result.edgeCount).toBe(0);
  });

  it('uses 0.5 default weight when template is null', () => {
    const result = scorePath({
      path: ['a', 'b', 'c'],
      template: null,
      edgeWeights: [1.0, 1.0],
      evidenceConfidences: [1.0, 1.0],
    });

    expect(result.templateWeight).toBe(0.5);
  });

  it('uses template weight when template is provided', () => {
    const template: PathTemplate = {
      id: 'custom',
      name: 'Custom',
      hops: [
        { edgeType: 'X', direction: 'forward', nodeType: 'p' },
        { edgeType: 'Y', direction: 'reverse', nodeType: 'p' },
      ],
      weight: 0.73,
    };

    const result = scorePath({
      path: ['a', 'b', 'c'],
      template,
      edgeWeights: [1.0, 1.0],
      evidenceConfidences: [1.0, 1.0],
    });

    expect(result.templateWeight).toBe(0.73);
  });
});

// ===================================================================
// Candidate Path Score (§16.2)
// ===================================================================

describe('scoreCandidatePaths', () => {
  it('returns zero for empty paths array', () => {
    const result = scoreCandidatePaths([]);
    expect(result.candidatePathScore).toBe(0);
    expect(result.strongestPath).toEqual([]);
  });

  it('uses strongest path score for single path', () => {
    const score: PathScoreResult = {
      pathScore: 0.65,
      templateWeight: 1.0,
      avgEdgeWeight: 0.8,
      lengthPenalty: 0.85,
      pathEvidenceConfidence: 0.9,
      edgeCount: 2,
    };

    const result = scoreCandidatePaths([{ path: ['a', 'b', 'c'], score }]);
    // candidate_path_score = 0.65 + 0.25 * log(1 + 0) = 0.65
    expect(result.candidatePathScore).toBeCloseTo(0.65, 4);
    expect(result.strongestPathScore).toBeCloseTo(0.65, 4);
    expect(result.additionalPaths).toBe(0);
  });

  it('adds bonus for multiple qualifying paths', () => {
    const path1: PathScoreResult = {
      pathScore: 0.70,
      templateWeight: 1.0,
      avgEdgeWeight: 0.8,
      lengthPenalty: 0.85,
      pathEvidenceConfidence: 0.9,
      edgeCount: 2,
    };
    const path2: PathScoreResult = {
      pathScore: 0.50,
      templateWeight: 0.85,
      avgEdgeWeight: 0.7,
      lengthPenalty: 0.65,
      pathEvidenceConfidence: 0.8,
      edgeCount: 3,
    };

    const result = scoreCandidatePaths([
      { path: ['a', 'b', 'c'], score: path1 },
      { path: ['a', 'd', 'e', 'c'], score: path2 },
    ]);

    // candidate_path_score = 0.70 + 0.25 * log(1 + 1) = 0.70 + 0.25 * 0.6931
    const expected = 0.70 + 0.25 * Math.log(2);
    expect(result.candidatePathScore).toBeCloseTo(expected, 4);
    expect(result.strongestPathScore).toBeCloseTo(0.70, 4);
    expect(result.additionalPaths).toBe(1);
  });

  it('selects strongest path correctly from multiple paths', () => {
    const weakScore: PathScoreResult = {
      pathScore: 0.30,
      templateWeight: 0.5,
      avgEdgeWeight: 0.5,
      lengthPenalty: 0.65,
      pathEvidenceConfidence: 0.7,
      edgeCount: 3,
    };
    const strongScore: PathScoreResult = {
      pathScore: 0.80,
      templateWeight: 1.0,
      avgEdgeWeight: 0.9,
      lengthPenalty: 0.85,
      pathEvidenceConfidence: 0.95,
      edgeCount: 2,
    };

    const result = scoreCandidatePaths([
      { path: ['a', 'x', 'y', 'c'], score: weakScore },
      { path: ['a', 'b', 'c'], score: strongScore },
    ]);

    expect(result.strongestPath).toEqual(['a', 'b', 'c']);
  });

  it('selects shortest path by hop count', () => {
    const longScore: PathScoreResult = {
      pathScore: 0.80,
      templateWeight: 1.0,
      avgEdgeWeight: 0.9,
      lengthPenalty: 0.65,
      pathEvidenceConfidence: 0.95,
      edgeCount: 3,
    };
    const shortScore: PathScoreResult = {
      pathScore: 0.50,
      templateWeight: 0.5,
      avgEdgeWeight: 0.8,
      lengthPenalty: 1.0,
      pathEvidenceConfidence: 0.9,
      edgeCount: 1,
    };

    const result = scoreCandidatePaths([
      { path: ['a', 'b', 'c', 'd'], score: longScore },
      { path: ['a', 'd'], score: shortScore },
    ]);

    expect(result.shortestPath).toEqual(['a', 'd']);
    expect(result.strongestPath).toEqual(['a', 'b', 'c', 'd']);
  });

  it('bonus grows logarithmically with more paths', () => {
    const baseScore: PathScoreResult = {
      pathScore: 0.50,
      templateWeight: 0.5,
      avgEdgeWeight: 0.8,
      lengthPenalty: 0.85,
      pathEvidenceConfidence: 0.9,
      edgeCount: 2,
    };

    const twoPaths = scoreCandidatePaths([
      { path: ['a', 'b', 'c'], score: baseScore },
      { path: ['a', 'd', 'c'], score: { ...baseScore, pathScore: 0.30 } },
    ]);

    const fivePaths = scoreCandidatePaths([
      { path: ['a', 'b', 'c'], score: baseScore },
      { path: ['a', 'd', 'c'], score: { ...baseScore, pathScore: 0.30 } },
      { path: ['a', 'e', 'c'], score: { ...baseScore, pathScore: 0.25 } },
      { path: ['a', 'f', 'c'], score: { ...baseScore, pathScore: 0.20 } },
      { path: ['a', 'g', 'c'], score: { ...baseScore, pathScore: 0.15 } },
    ]);

    // Both should have the same strongest score but different bonuses
    expect(twoPaths.strongestPathScore).toBe(fivePaths.strongestPathScore);
    expect(fivePaths.candidatePathScore).toBeGreaterThan(twoPaths.candidatePathScore);

    // Bonus should be logarithmic, not linear
    const bonus2 = twoPaths.candidatePathScore - twoPaths.strongestPathScore;
    const bonus5 = fivePaths.candidatePathScore - fivePaths.strongestPathScore;
    expect(bonus5 / bonus2).toBeLessThan(4); // not linear (would be 4x)
  });
});

// ===================================================================
// extractPathEdges
// ===================================================================

describe('extractPathEdges', () => {
  it('extracts edge weights and confidences from a graph path', () => {
    const graph = makeGraph();
    const { edgeWeights, evidenceConfidences } = extractPathEdges(graph, [
      'seed_p',
      'charity_a',
    ]);

    expect(edgeWeights).toHaveLength(1);
    expect(edgeWeights[0]).toBeCloseTo(0.85, 2);
    expect(evidenceConfidences[0]).toBeCloseTo(0.9, 2);
  });

  it('handles reverse edges (incoming)', () => {
    const graph = makeGraph();
    // charity_a <- cand_1 (cand_1 -> charity_a is outgoing from cand_1)
    // From charity_a perspective, this is an incoming edge
    const { edgeWeights } = extractPathEdges(graph, ['charity_a', 'cand_1']);
    expect(edgeWeights).toHaveLength(1);
    expect(edgeWeights[0]).toBeCloseTo(0.80, 2);
  });

  it('returns zeros when no edge connects nodes', () => {
    const graph = makeGraph();
    // cand_1 and cand_2 have no direct edge
    const { edgeWeights, evidenceConfidences } = extractPathEdges(graph, [
      'cand_1',
      'cand_2',
    ]);

    expect(edgeWeights).toEqual([0]);
    expect(evidenceConfidences).toEqual([0]);
  });
});

// ===================================================================
// Template Matching (§16.1)
// ===================================================================

describe('matchTemplate', () => {
  it('matches trustee co-service template', () => {
    const graph = makeGraph();
    const result = matchTemplate(
      ['seed_p', 'charity_a', 'cand_1'],
      (id) => graph.getNode(id),
      (id, type) => graph.getOutEdges(id, type),
      (id, type) => graph.getInEdges(id, type),
    );

    expect(result).not.toBeNull();
    expect(result!.id).toBe('trustee_co_service');
    expect(result!.weight).toBe(1.0);
  });

  it('matches donation chain template', () => {
    const graph = makeGraph();
    const result = matchTemplate(
      ['seed_p', 'don_1', 'charity_b', 'cand_3'],
      (id) => graph.getNode(id),
      (id, type) => graph.getOutEdges(id, type),
      (id, type) => graph.getInEdges(id, type),
    );

    expect(result).not.toBeNull();
    expect(result!.id).toBe('donation_chain');
    expect(result!.weight).toBe(0.85);
  });

  it('returns null for paths that match no template', () => {
    const graph = makeGraph();
    const result = matchTemplate(
      ['seed_p', 'addr_1', 'cand_2'],
      (id) => graph.getNode(id),
      (id, type) => graph.getOutEdges(id, type),
      (id, type) => graph.getInEdges(id, type),
    );

    // addr_1 is type 'address', not matching any hop's nodeType
    expect(result).toBeNull();
  });

  it('rejects paths with wrong node types', () => {
    const graph = makeGraph();
    // company_x is type 'company' not 'charity', so trustee_co_service won't match
    const result = matchTemplate(
      ['seed_p', 'company_x', 'cand_2'],
      (id) => graph.getNode(id),
      (id, type) => graph.getOutEdges(id, type),
      (id, type) => graph.getInEdges(id, type),
    );

    // The only 2-hop templates expect charity or person, not company for first hop
    expect(result === null || result.id !== 'trustee_co_service').toBe(true);
  });
});

// ===================================================================
// Eligibility (§16.3)
// ===================================================================

describe('checkEligibility', () => {
  it('accepts eligible person-like candidate', () => {
    const result = checkEligibility(makeCandidate(), emptyExclusions());
    expect(result.eligible).toBe(true);
    expect(result.reason).toBeNull();
  });

  it('rejects non-person entities', () => {
    const result = checkEligibility(
      makeCandidate({ entityType: 'charity' }),
      emptyExclusions(),
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('not_person_like');
  });

  it('rejects candidates with no path to seed', () => {
    const result = checkEligibility(
      makeCandidate({ hasPathToSeed: false }),
      emptyExclusions(),
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('no_path_to_seed');
  });

  it('rejects candidates below confidence threshold', () => {
    const result = checkEligibility(
      makeCandidate({ confidence: 0.35 }),
      emptyExclusions(),
      0.40,
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('low_confidence');
  });

  it('rejects known contacts', () => {
    const exclusions = emptyExclusions();
    exclusions.knownContactIds.add('cand_1');
    const result = checkEligibility(makeCandidate(), exclusions);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('known_contact');
  });

  it('rejects previously rejected candidates for same seed', () => {
    const exclusions = emptyExclusions();
    exclusions.rejectedForSeedIds.add('cand_1');
    const result = checkEligibility(makeCandidate(), exclusions);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('rejected_for_seed');
  });

  it('rejects prior leads', () => {
    const exclusions = emptyExclusions();
    exclusions.priorLeadIds.add('cand_1');
    const result = checkEligibility(makeCandidate(), exclusions);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('prior_lead');
  });

  it('uses custom confidence threshold for low-quality seeds', () => {
    const result = checkEligibility(
      makeCandidate({ confidence: 0.55 }),
      emptyExclusions(),
      0.60, // higher threshold for low-quality seeds
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('low_confidence');
  });
});

// ===================================================================
// Queue Limits (§16.5 R3.10)
// ===================================================================

describe('applyQueueLimit', () => {
  it('applies default review limit of 50', () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const result = applyQueueLimit(items, 'review');
    expect(result).toHaveLength(50);
  });

  it('applies analytics limit of 200', () => {
    const items = Array.from({ length: 300 }, (_, i) => i);
    const result = applyQueueLimit(items, 'analytics');
    expect(result).toHaveLength(200);
  });

  it('applies seed quality cap when smaller than mode limit', () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const result = applyQueueLimit(items, 'review', 25);
    expect(result).toHaveLength(25);
  });

  it('returns all items if below limit', () => {
    const items = [1, 2, 3];
    const result = applyQueueLimit(items, 'review');
    expect(result).toHaveLength(3);
  });
});

// ===================================================================
// Reason Codes (R3.8)
// ===================================================================

describe('generateReasonCodes', () => {
  it('generates shared_trustee_role for TRUSTEE_OF path', () => {
    const codes = generateReasonCodes({
      pathRelationshipTypes: ['TRUSTEE_OF'],
      pathCount: 1,
      sharedAffiliationTypes: [],
      pprScore: 0.005,
      directRelationship: false,
    });

    expect(codes).toContain('shared_trustee_role');
  });

  it('generates shared_director_role for DIRECTOR_OF path', () => {
    const codes = generateReasonCodes({
      pathRelationshipTypes: ['DIRECTOR_OF'],
      pathCount: 1,
      sharedAffiliationTypes: [],
      pprScore: 0.005,
      directRelationship: false,
    });

    expect(codes).toContain('shared_director_role');
  });

  it('generates donation_link for donation paths', () => {
    const codes = generateReasonCodes({
      pathRelationshipTypes: ['MADE_DONATION', 'RECEIVED_BY'],
      pathCount: 1,
      sharedAffiliationTypes: [],
      pprScore: 0.005,
      directRelationship: false,
    });

    expect(codes).toContain('donation_link');
  });

  it('generates multi_path_convergence for 2+ paths', () => {
    const codes = generateReasonCodes({
      pathRelationshipTypes: ['TRUSTEE_OF'],
      pathCount: 2,
      sharedAffiliationTypes: [],
      pprScore: 0.005,
      directRelationship: false,
    });

    expect(codes).toContain('multi_path_convergence');
  });

  it('generates high_pagerank_proximity when PPR score exceeds threshold', () => {
    const codes = generateReasonCodes({
      pathRelationshipTypes: [],
      pathCount: 1,
      sharedAffiliationTypes: [],
      pprScore: 0.05,
      pprThreshold: 0.01,
      directRelationship: false,
    });

    expect(codes).toContain('high_pagerank_proximity');
  });

  it('does not generate high_pagerank_proximity below threshold', () => {
    const codes = generateReasonCodes({
      pathRelationshipTypes: [],
      pathCount: 1,
      sharedAffiliationTypes: [],
      pprScore: 0.005,
      pprThreshold: 0.01,
      directRelationship: false,
    });

    expect(codes).not.toContain('high_pagerank_proximity');
  });

  it('generates direct_relationship for 1-hop paths', () => {
    const codes = generateReasonCodes({
      pathRelationshipTypes: ['TRUSTEE_OF'],
      pathCount: 1,
      sharedAffiliationTypes: [],
      pprScore: 0.005,
      directRelationship: true,
    });

    expect(codes).toContain('direct_relationship');
  });

  it('generates shared affiliation codes', () => {
    const codes = generateReasonCodes({
      pathRelationshipTypes: [],
      pathCount: 1,
      sharedAffiliationTypes: ['charity', 'company'],
      pprScore: 0.005,
      directRelationship: false,
    });

    expect(codes).toContain('shared_charity_affiliation');
    expect(codes).toContain('shared_company_affiliation');
  });
});

// ===================================================================
// Seed Quality (§16.4)
// ===================================================================

describe('calculateSeedQuality', () => {
  it('returns normal band for high-quality seed', () => {
    const result = calculateSeedQuality({
      strongEdgeCountScore: 0.8,
      recentEdgeScore: 0.9,
      affiliationCountScore: 0.7,
      historicalIntroSuccessScore: 0.6,
      identityConfidenceScore: 0.9,
    });

    expect(result.score).toBeGreaterThanOrEqual(0.70);
    expect(result.band).toBe('normal');
    expect(result.candidateCap).toBeNull();
    expect(result.enrichmentBlocked).toBe(false);
  });

  it('returns warning band for medium-quality seed', () => {
    const result = calculateSeedQuality({
      strongEdgeCountScore: 0.5,
      recentEdgeScore: 0.5,
      affiliationCountScore: 0.5,
      historicalIntroSuccessScore: 0.3,
      identityConfidenceScore: 0.5,
    });

    expect(result.score).toBeGreaterThanOrEqual(0.40);
    expect(result.score).toBeLessThan(0.70);
    expect(result.band).toBe('warning');
  });

  it('returns low_quality band with caps for weak seed', () => {
    const result = calculateSeedQuality({
      strongEdgeCountScore: 0.1,
      recentEdgeScore: 0.1,
      affiliationCountScore: 0.1,
      historicalIntroSuccessScore: 0,
      identityConfidenceScore: 0.2,
    });

    expect(result.score).toBeLessThan(0.40);
    expect(result.band).toBe('low_quality');
    expect(result.candidateCap).toBe(25);
    expect(result.minConfidence).toBe(0.60);
    expect(result.enrichmentBlocked).toBe(true);
  });

  it('clamps input values to 0-1 range', () => {
    const result = calculateSeedQuality({
      strongEdgeCountScore: 1.5,
      recentEdgeScore: -0.1,
      affiliationCountScore: 1.0,
      historicalIntroSuccessScore: 1.0,
      identityConfidenceScore: 1.0,
    });

    // Should clamp to 1.0 and 0.0 respectively
    expect(result.score).toBeLessThanOrEqual(1.0);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});
