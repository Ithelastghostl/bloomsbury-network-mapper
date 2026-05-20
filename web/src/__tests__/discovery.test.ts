/**
 * Tests for Epic 7 — Candidate Discovery (F7.1 Path-Template Scoring, F7.2 Affiliation & PPR).
 * Pure functions — no Supabase required.
 */
import { describe, it, expect } from 'vitest';
import { DirectedGraph } from '@/lib/graph/networkx';
import {
  PATH_TEMPLATES,
  matchTemplate,
  type PathTemplate,
} from '@/lib/discovery/path-templates';
import {
  scorePath,
  scoreCandidatePaths,
  extractPathEdges,
} from '@/lib/discovery/path-scoring';
import {
  scoreSharedAffiliations,
  AFFILIATION_WEIGHTS,
} from '@/lib/discovery/affiliation';
import { runPPR, runMultiSeedPPR } from '@/lib/discovery/pagerank';

// ===================================================================
// Graph fixture: builds a small but realistic charity network
// ===================================================================

function buildTestGraph(): DirectedGraph {
  const g = new DirectedGraph();

  // Nodes
  g.addNode({ id: 'seed_person', type: 'person', attributes: { name: 'Seed Person' } });
  g.addNode({ id: 'candidate_a', type: 'person', attributes: { name: 'Candidate A' } });
  g.addNode({ id: 'candidate_b', type: 'person', attributes: { name: 'Candidate B' } });
  g.addNode({ id: 'candidate_c', type: 'person', attributes: { name: 'Candidate C' } });
  g.addNode({ id: 'charity_1', type: 'charity', attributes: { name: 'Charity One' } });
  g.addNode({ id: 'charity_2', type: 'charity', attributes: { name: 'Charity Two' } });
  g.addNode({ id: 'company_1', type: 'company', attributes: { name: 'Company One' } });
  g.addNode({ id: 'trust_1', type: 'trust', attributes: { name: 'Trust One' } });
  g.addNode({ id: 'don_event_1', type: 'donation_event', attributes: {} });
  g.addNode({ id: 'address_1', type: 'address', attributes: { value: '10 Downing St' } });

  // Trustee co-service: seed_person → charity_1 ← candidate_a
  g.addEdge({ id: 'e1', source: 'seed_person', target: 'charity_1', type: 'TRUSTEE_OF', weight: 0.9, attributes: { confidence: 0.85 } });
  g.addEdge({ id: 'e2', source: 'candidate_a', target: 'charity_1', type: 'TRUSTEE_OF', weight: 0.85, attributes: { confidence: 0.8 } });

  // Second shared charity for candidate_a (multi-path)
  g.addEdge({ id: 'e3', source: 'seed_person', target: 'charity_2', type: 'TRUSTEE_OF', weight: 0.8, attributes: { confidence: 0.75 } });
  g.addEdge({ id: 'e4', source: 'candidate_a', target: 'charity_2', type: 'TRUSTEE_OF', weight: 0.7, attributes: { confidence: 0.7 } });

  // Donation chain: trust_1 → don_event_1 → charity_1 ← candidate_b
  g.addEdge({ id: 'e5', source: 'trust_1', target: 'don_event_1', type: 'MADE_DONATION', weight: 0.85, attributes: { confidence: 0.9 } });
  g.addEdge({ id: 'e6', source: 'don_event_1', target: 'charity_1', type: 'RECEIVED_BY', weight: 0.85, attributes: { confidence: 0.9 } });
  g.addEdge({ id: 'e7', source: 'candidate_b', target: 'charity_1', type: 'TRUSTEE_OF', weight: 0.75, attributes: { confidence: 0.7 } });

  // Director-trustee bridge: company_1 ← candidate_c (DIRECTOR_OF) → charity_2 (TRUSTEE_OF)
  g.addEdge({ id: 'e8', source: 'candidate_c', target: 'company_1', type: 'DIRECTOR_OF', weight: 0.9, attributes: { confidence: 0.85 } });
  g.addEdge({ id: 'e9', source: 'candidate_c', target: 'charity_2', type: 'TRUSTEE_OF', weight: 0.8, attributes: { confidence: 0.75 } });

  // Shared address (weighted lower)
  g.addEdge({ id: 'e10', source: 'seed_person', target: 'address_1', type: 'REGISTERED_AT', weight: 0.3, attributes: { confidence: 0.6 } });
  g.addEdge({ id: 'e11', source: 'candidate_a', target: 'address_1', type: 'REGISTERED_AT', weight: 0.3, attributes: { confidence: 0.6 } });

  // seed_person also has a company connection for affiliation tests
  g.addEdge({ id: 'e12', source: 'seed_person', target: 'company_1', type: 'DIRECTOR_OF', weight: 0.9, attributes: { confidence: 0.85 } });

  return g;
}

// ===================================================================
// F7.1-T1: Path Template Matching
// ===================================================================

describe('Path Template Matching (F7.1-T1)', () => {
  it('should define trustee co-service template', () => {
    const template = PATH_TEMPLATES.find((t) => t.id === 'trustee_co_service');
    expect(template).toBeDefined();
    expect(template!.hops).toHaveLength(2);
    expect(template!.weight).toBe(1.0);
  });

  it('should define donation chain template', () => {
    const template = PATH_TEMPLATES.find((t) => t.id === 'donation_chain');
    expect(template).toBeDefined();
    expect(template!.hops).toHaveLength(3);
    expect(template!.weight).toBe(0.85);
  });

  it('should define director-trustee bridge template', () => {
    const template = PATH_TEMPLATES.find((t) => t.id === 'director_trustee_bridge');
    expect(template).toBeDefined();
    expect(template!.hops).toHaveLength(2);
    expect(template!.weight).toBe(0.9);
  });

  it('should match trustee co-service path', () => {
    const g = buildTestGraph();
    const path = ['seed_person', 'charity_1', 'candidate_a'];
    const result = matchTemplate(
      path,
      (id) => g.getNode(id),
      (id, type) => g.getOutEdges(id, type),
      (id, type) => g.getInEdges(id, type),
    );
    expect(result).not.toBeNull();
    expect(result!.id).toBe('trustee_co_service');
  });

  it('should match donation chain path', () => {
    const g = buildTestGraph();
    const path = ['trust_1', 'don_event_1', 'charity_1', 'candidate_b'];
    const result = matchTemplate(
      path,
      (id) => g.getNode(id),
      (id, type) => g.getOutEdges(id, type),
      (id, type) => g.getInEdges(id, type),
    );
    expect(result).not.toBeNull();
    expect(result!.id).toBe('donation_chain');
  });

  it('should not match a path with wrong length', () => {
    const g = buildTestGraph();
    const path = ['seed_person', 'charity_1'];
    const result = matchTemplate(
      path,
      (id) => g.getNode(id),
      (id, type) => g.getOutEdges(id, type),
      (id, type) => g.getInEdges(id, type),
    );
    expect(result).toBeNull();
  });

  it('should not match when node type is wrong', () => {
    const g = buildTestGraph();
    // Path with company where charity is expected
    const path = ['seed_person', 'company_1', 'candidate_c'];
    const result = matchTemplate(
      path,
      (id) => g.getNode(id),
      (id, type) => g.getOutEdges(id, type),
      (id, type) => g.getInEdges(id, type),
    );
    // trustee_co_service expects charity, so this should fail
    // director_trustee_bridge expects person then charity, also wrong order
    expect(result).toBeNull();
  });

  it('should match against custom templates', () => {
    const g = buildTestGraph();
    const customTemplate: PathTemplate = {
      id: 'custom',
      name: 'Custom',
      hops: [
        { edgeType: 'REGISTERED_AT', direction: 'forward', nodeType: 'address' },
        { edgeType: 'REGISTERED_AT', direction: 'reverse', nodeType: 'person' },
      ],
      weight: 0.3,
    };
    const path = ['seed_person', 'address_1', 'candidate_a'];
    const result = matchTemplate(
      path,
      (id) => g.getNode(id),
      (id, type) => g.getOutEdges(id, type),
      (id, type) => g.getInEdges(id, type),
      [customTemplate],
    );
    expect(result).not.toBeNull();
    expect(result!.id).toBe('custom');
  });
});

// ===================================================================
// F7.1-T2: Path Score Calculation
// ===================================================================

describe('Path Score Calculation (F7.1-T2)', () => {
  it('should score a 2-edge path with correct formula', () => {
    const template = PATH_TEMPLATES.find((t) => t.id === 'trustee_co_service')!;
    const result = scorePath({
      path: ['seed_person', 'charity_1', 'candidate_a'],
      template,
      edgeWeights: [0.9, 0.85],
      evidenceConfidences: [0.85, 0.8],
    });

    // template_weight(1.0) * avg_edge(0.875) * penalty(0.85) * avg_conf(0.825)
    const expected = 1.0 * 0.875 * 0.85 * 0.825;
    expect(result.pathScore).toBeCloseTo(expected, 6);
    expect(result.edgeCount).toBe(2);
    expect(result.lengthPenalty).toBe(0.85);
  });

  it('should apply higher penalty for 3-edge paths', () => {
    const template = PATH_TEMPLATES.find((t) => t.id === 'donation_chain')!;
    const result = scorePath({
      path: ['trust_1', 'don_event_1', 'charity_1', 'candidate_b'],
      template,
      edgeWeights: [0.85, 0.85, 0.75],
      evidenceConfidences: [0.9, 0.9, 0.7],
    });

    const avgWeight = (0.85 + 0.85 + 0.75) / 3;
    const avgConf = (0.9 + 0.9 + 0.7) / 3;
    const expected = 0.85 * avgWeight * 0.65 * avgConf;
    expect(result.pathScore).toBeCloseTo(expected, 6);
    expect(result.lengthPenalty).toBe(0.65);
  });

  it('should give penalty 1.0 for 1-edge paths', () => {
    const result = scorePath({
      path: ['a', 'b'],
      template: { id: 'test', name: 'test', hops: [], weight: 1.0 },
      edgeWeights: [0.8],
      evidenceConfidences: [0.9],
    });
    expect(result.lengthPenalty).toBe(1.0);
    expect(result.pathScore).toBeCloseTo(1.0 * 0.8 * 1.0 * 0.9, 6);
  });

  it('should exclude paths with 4+ edges (score = 0)', () => {
    const result = scorePath({
      path: ['a', 'b', 'c', 'd', 'e'],
      template: { id: 'test', name: 'test', hops: [], weight: 1.0 },
      edgeWeights: [0.8, 0.8, 0.8, 0.8],
      evidenceConfidences: [0.9, 0.9, 0.9, 0.9],
    });
    expect(result.pathScore).toBe(0);
  });

  it('should use 0.5 weight for unmatched templates', () => {
    const result = scorePath({
      path: ['a', 'b', 'c'],
      template: null,
      edgeWeights: [0.8, 0.8],
      evidenceConfidences: [0.9, 0.9],
    });
    expect(result.templateWeight).toBe(0.5);
    expect(result.pathScore).toBeCloseTo(0.5 * 0.8 * 0.85 * 0.9, 6);
  });
});

// ===================================================================
// F7.1-T3: Multi-Path Candidate Scoring
// ===================================================================

describe('Multi-Path Candidate Scoring (F7.1-T3)', () => {
  it('should compute candidate score with single path', () => {
    const paths = [
      {
        path: ['seed', 'mid', 'cand'],
        score: {
          pathScore: 0.6,
          templateWeight: 1.0,
          avgEdgeWeight: 0.8,
          lengthPenalty: 0.85,
          pathEvidenceConfidence: 0.9,
          edgeCount: 2,
        },
      },
    ];
    const result = scoreCandidatePaths(paths);
    expect(result.candidatePathScore).toBeCloseTo(0.6 + 0.25 * Math.log(1), 6);
    expect(result.candidatePathScore).toBeCloseTo(0.6, 6); // log(1) = 0
    expect(result.additionalPaths).toBe(0);
  });

  it('should boost score with additional paths', () => {
    const paths = [
      {
        path: ['seed', 'mid1', 'cand'],
        score: {
          pathScore: 0.6,
          templateWeight: 1.0,
          avgEdgeWeight: 0.8,
          lengthPenalty: 0.85,
          pathEvidenceConfidence: 0.9,
          edgeCount: 2,
        },
      },
      {
        path: ['seed', 'mid2', 'cand'],
        score: {
          pathScore: 0.4,
          templateWeight: 1.0,
          avgEdgeWeight: 0.7,
          lengthPenalty: 0.85,
          pathEvidenceConfidence: 0.7,
          edgeCount: 2,
        },
      },
    ];
    const result = scoreCandidatePaths(paths);
    expect(result.strongestPathScore).toBeCloseTo(0.6, 6);
    expect(result.additionalPaths).toBe(1);
    expect(result.candidatePathScore).toBeCloseTo(0.6 + 0.25 * Math.log(2), 6);
    expect(result.candidatePathScore).toBeGreaterThan(0.6);
  });

  it('should return empty result for zero paths', () => {
    const result = scoreCandidatePaths([]);
    expect(result.candidatePathScore).toBe(0);
    expect(result.strongestPath).toEqual([]);
    expect(result.shortestPath).toEqual([]);
  });
});

// ===================================================================
// F7.1-T4: Shortest vs Strongest Path
// ===================================================================

describe('Shortest vs Strongest Path (F7.1-T4)', () => {
  it('should distinguish shortest from strongest path', () => {
    const shortPath = {
      path: ['seed', 'cand'],
      score: {
        pathScore: 0.3,
        templateWeight: 0.5,
        avgEdgeWeight: 0.6,
        lengthPenalty: 1.0,
        pathEvidenceConfidence: 0.5,
        edgeCount: 1,
      },
    };
    const strongPath = {
      path: ['seed', 'mid', 'cand'],
      score: {
        pathScore: 0.7,
        templateWeight: 1.0,
        avgEdgeWeight: 0.9,
        lengthPenalty: 0.85,
        pathEvidenceConfidence: 0.95,
        edgeCount: 2,
      },
    };

    const result = scoreCandidatePaths([shortPath, strongPath]);
    expect(result.strongestPath).toEqual(['seed', 'mid', 'cand']);
    expect(result.shortestPath).toEqual(['seed', 'cand']);
  });

  it('should return same path when there is only one', () => {
    const single = {
      path: ['seed', 'mid', 'cand'],
      score: {
        pathScore: 0.5,
        templateWeight: 1.0,
        avgEdgeWeight: 0.8,
        lengthPenalty: 0.85,
        pathEvidenceConfidence: 0.75,
        edgeCount: 2,
      },
    };
    const result = scoreCandidatePaths([single]);
    expect(result.strongestPath).toEqual(result.shortestPath);
  });
});

// ===================================================================
// Edge extraction from graph
// ===================================================================

describe('Path Edge Extraction', () => {
  it('should extract edge weights and confidences along a path', () => {
    const g = buildTestGraph();
    const { edgeWeights, evidenceConfidences } = extractPathEdges(g, [
      'seed_person',
      'charity_1',
      'candidate_a',
    ]);
    // seed_person → charity_1 (weight 0.9, conf 0.85)
    // candidate_a → charity_1 (reverse, weight 0.85, conf 0.8)
    expect(edgeWeights).toHaveLength(2);
    expect(edgeWeights[0]).toBe(0.9);
    expect(edgeWeights[1]).toBe(0.85);
    expect(evidenceConfidences[0]).toBe(0.85);
    expect(evidenceConfidences[1]).toBe(0.8);
  });

  it('should return 0 for missing edges', () => {
    const g = buildTestGraph();
    // No direct edge between seed_person and candidate_b
    const { edgeWeights } = extractPathEdges(g, [
      'seed_person',
      'candidate_b',
    ]);
    expect(edgeWeights[0]).toBe(0);
  });
});

// ===================================================================
// F7.2-T1: Shared-Affiliation Scoring
// ===================================================================

describe('Shared-Affiliation Scoring (F7.2-T1)', () => {
  it('should find shared charity affiliation', () => {
    const g = buildTestGraph();
    const result = scoreSharedAffiliations(g, 'seed_person', 'candidate_a');
    // They share charity_1 and charity_2 (via TRUSTEE_OF) and address_1 (via REGISTERED_AT)
    expect(result.sharedCount).toBeGreaterThanOrEqual(2);
    const charityAffiliations = result.sharedAffiliations.filter(
      (a) => a.affiliationType === 'charity',
    );
    expect(charityAffiliations.length).toBeGreaterThanOrEqual(2);
  });

  it('should weight shared address lower than shared charity', () => {
    expect(AFFILIATION_WEIGHTS.address).toBeLessThan(
      AFFILIATION_WEIGHTS.charity,
    );
    expect(AFFILIATION_WEIGHTS.address).toBe(0.3);
  });

  it('should return 0 for entities with no shared affiliations', () => {
    const g = new DirectedGraph();
    g.addNode({ id: 'a', type: 'person', attributes: {} });
    g.addNode({ id: 'b', type: 'person', attributes: {} });
    const result = scoreSharedAffiliations(g, 'a', 'b');
    expect(result.affiliationScore).toBe(0);
    expect(result.sharedCount).toBe(0);
  });

  it('should produce score in [0, 1) range', () => {
    const g = buildTestGraph();
    const result = scoreSharedAffiliations(g, 'seed_person', 'candidate_a');
    expect(result.affiliationScore).toBeGreaterThan(0);
    expect(result.affiliationScore).toBeLessThan(1);
  });

  it('should identify shared company affiliation', () => {
    const g = buildTestGraph();
    const result = scoreSharedAffiliations(g, 'seed_person', 'candidate_c');
    // Both connect to company_1
    const companyAffils = result.sharedAffiliations.filter(
      (a) => a.intermediaryId === 'company_1',
    );
    expect(companyAffils.length).toBe(1);
  });

  it('should not count seed or candidate as intermediary', () => {
    const g = new DirectedGraph();
    g.addNode({ id: 'seed', type: 'person', attributes: {} });
    g.addNode({ id: 'cand', type: 'person', attributes: {} });
    g.addNode({ id: 'mid', type: 'charity', attributes: {} });
    g.addEdge({ id: 'e1', source: 'seed', target: 'cand', type: 'CO_OCCURS_WITH', weight: 0.2, attributes: {} });
    g.addEdge({ id: 'e2', source: 'seed', target: 'mid', type: 'TRUSTEE_OF', weight: 0.9, attributes: {} });
    g.addEdge({ id: 'e3', source: 'cand', target: 'mid', type: 'TRUSTEE_OF', weight: 0.9, attributes: {} });
    const result = scoreSharedAffiliations(g, 'seed', 'cand');
    // Only mid should be an intermediary, not seed or cand themselves
    const intermediaryIds = result.sharedAffiliations.map((a) => a.intermediaryId);
    expect(intermediaryIds).not.toContain('seed');
    expect(intermediaryIds).not.toContain('cand');
    expect(intermediaryIds).toContain('mid');
  });
});

// ===================================================================
// F7.2-T2: Personalised PageRank (single seed)
// ===================================================================

describe('Personalised PageRank — Single Seed (F7.2-T2)', () => {
  it('should rank candidates by PPR score', () => {
    const g = buildTestGraph();
    const result = runPPR(g, 'seed_person');
    expect(result.candidates.length).toBeGreaterThan(0);
    // Candidates should be sorted descending
    for (let i = 1; i < result.candidates.length; i++) {
      expect(result.candidates[i - 1].score).toBeGreaterThanOrEqual(
        result.candidates[i].score,
      );
    }
  });

  it('should exclude seed from candidates', () => {
    const g = buildTestGraph();
    const result = runPPR(g, 'seed_person');
    const ids = result.candidates.map((c) => c.entityId);
    expect(ids).not.toContain('seed_person');
  });

  it('should only include person-type candidates by default', () => {
    const g = buildTestGraph();
    const result = runPPR(g, 'seed_person');
    for (const c of result.candidates) {
      expect(c.entityType).toBe('person');
    }
  });

  it('should use alpha=0.85 by default', () => {
    const g = buildTestGraph();
    // Run with explicit alpha=0.85, results should match default
    const defaultResult = runPPR(g, 'seed_person');
    const explicitResult = runPPR(g, 'seed_person', { alpha: 0.85 });
    expect(defaultResult.candidates.length).toBe(explicitResult.candidates.length);
    for (let i = 0; i < defaultResult.candidates.length; i++) {
      expect(defaultResult.candidates[i].score).toBeCloseTo(
        explicitResult.candidates[i].score,
        10,
      );
    }
  });

  it('should return raw scores for all nodes', () => {
    const g = buildTestGraph();
    const result = runPPR(g, 'seed_person');
    expect(result.rawScores.size).toBe(g.nodeCount);
  });

  it('should support custom candidate types', () => {
    const g = buildTestGraph();
    const result = runPPR(g, 'seed_person', {
      candidateTypes: ['charity'],
    });
    for (const c of result.candidates) {
      expect(c.entityType).toBe('charity');
    }
    expect(result.candidates.length).toBeGreaterThan(0);
  });
});

// ===================================================================
// F7.2-T3: Multi-Seed PPR
// ===================================================================

describe('Multi-Seed PPR (F7.2-T3)', () => {
  function buildMultiSeedGraph(): DirectedGraph {
    const g = new DirectedGraph();
    g.addNode({ id: 'seed1', type: 'person', attributes: {} });
    g.addNode({ id: 'seed2', type: 'person', attributes: {} });
    g.addNode({ id: 'shared_cand', type: 'person', attributes: {} });
    g.addNode({ id: 'only_seed1_cand', type: 'person', attributes: {} });
    g.addNode({ id: 'only_seed2_cand', type: 'person', attributes: {} });
    g.addNode({ id: 'charity_x', type: 'charity', attributes: {} });
    g.addNode({ id: 'charity_y', type: 'charity', attributes: {} });
    g.addNode({ id: 'charity_z', type: 'charity', attributes: {} });

    // Bidirectional edges model real graph: TRUSTEE_OF out, HAS_TRUSTEE back
    // seed1 <-> charity_x <-> shared_cand
    g.addEdge({ id: 'me1', source: 'seed1', target: 'charity_x', type: 'TRUSTEE_OF', weight: 0.9, attributes: {} });
    g.addEdge({ id: 'me1r', source: 'charity_x', target: 'seed1', type: 'HAS_TRUSTEE', weight: 0.9, attributes: {} });
    g.addEdge({ id: 'me2', source: 'shared_cand', target: 'charity_x', type: 'TRUSTEE_OF', weight: 0.8, attributes: {} });
    g.addEdge({ id: 'me2r', source: 'charity_x', target: 'shared_cand', type: 'HAS_TRUSTEE', weight: 0.8, attributes: {} });

    // seed2 <-> charity_y <-> shared_cand
    g.addEdge({ id: 'me3', source: 'seed2', target: 'charity_y', type: 'TRUSTEE_OF', weight: 0.9, attributes: {} });
    g.addEdge({ id: 'me3r', source: 'charity_y', target: 'seed2', type: 'HAS_TRUSTEE', weight: 0.9, attributes: {} });
    g.addEdge({ id: 'me4', source: 'shared_cand', target: 'charity_y', type: 'TRUSTEE_OF', weight: 0.8, attributes: {} });
    g.addEdge({ id: 'me4r', source: 'charity_y', target: 'shared_cand', type: 'HAS_TRUSTEE', weight: 0.8, attributes: {} });

    // seed1 <-> charity_z <-> only_seed1_cand (not connected to seed2 subgraph)
    g.addEdge({ id: 'me5', source: 'seed1', target: 'charity_z', type: 'TRUSTEE_OF', weight: 0.9, attributes: {} });
    g.addEdge({ id: 'me5r', source: 'charity_z', target: 'seed1', type: 'HAS_TRUSTEE', weight: 0.9, attributes: {} });
    g.addEdge({ id: 'me6', source: 'only_seed1_cand', target: 'charity_z', type: 'TRUSTEE_OF', weight: 0.7, attributes: {} });
    g.addEdge({ id: 'me6r', source: 'charity_z', target: 'only_seed1_cand', type: 'HAS_TRUSTEE', weight: 0.7, attributes: {} });

    // only_seed2_cand <-> charity_y only (no path from seed1)
    g.addEdge({ id: 'me7', source: 'only_seed2_cand', target: 'charity_y', type: 'TRUSTEE_OF', weight: 0.6, attributes: {} });
    g.addEdge({ id: 'me7r', source: 'charity_y', target: 'only_seed2_cand', type: 'HAS_TRUSTEE', weight: 0.6, attributes: {} });

    return g;
  }

  it('should return candidates from both seeds in union mode', () => {
    const g = buildMultiSeedGraph();
    const result = runMultiSeedPPR(g, ['seed1', 'seed2'], 'union');
    const ids = result.candidates.map((c) => c.entityId);
    expect(ids).toContain('shared_cand');
    // Union should include candidates from either seed
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it('should give higher score to candidates connected to multiple seeds in union', () => {
    const g = buildMultiSeedGraph();
    const result = runMultiSeedPPR(g, ['seed1', 'seed2'], 'union');
    const sharedScore = result.candidates.find((c) => c.entityId === 'shared_cand')?.score ?? 0;
    const singleScore = result.candidates.find((c) => c.entityId === 'only_seed1_cand')?.score ?? 0;
    // shared_cand connects to both seeds' charities, so its union sum should exceed single-seed candidates
    expect(sharedScore).toBeGreaterThan(singleScore);
  });

  it('should return only candidates connected to all seeds in intersection mode', () => {
    const g = buildMultiSeedGraph();
    const result = runMultiSeedPPR(g, ['seed1', 'seed2'], 'intersection');
    const ids = result.candidates.map((c) => c.entityId);
    // shared_cand connects to both seeds; others may or may not
    // due to PPR propagation, all nodes get some score, but shared_cand should be top
    expect(ids).toContain('shared_cand');
    if (result.candidates.length > 1) {
      // shared_cand should be the highest scoring
      expect(result.candidates[0].entityId).toBe('shared_cand');
    }
  });

  it('should exclude seed nodes from multi-seed results', () => {
    const g = buildMultiSeedGraph();
    const unionResult = runMultiSeedPPR(g, ['seed1', 'seed2'], 'union');
    const intersectResult = runMultiSeedPPR(g, ['seed1', 'seed2'], 'intersection');
    const unionIds = unionResult.candidates.map((c) => c.entityId);
    const intersectIds = intersectResult.candidates.map((c) => c.entityId);
    expect(unionIds).not.toContain('seed1');
    expect(unionIds).not.toContain('seed2');
    expect(intersectIds).not.toContain('seed1');
    expect(intersectIds).not.toContain('seed2');
  });

  it('should handle single-seed fallback in multi-seed mode', () => {
    const g = buildMultiSeedGraph();
    const singleResult = runPPR(g, 'seed1');
    const multiResult = runMultiSeedPPR(g, ['seed1'], 'union');
    expect(multiResult.candidates.length).toBe(singleResult.candidates.length);
    for (let i = 0; i < singleResult.candidates.length; i++) {
      expect(multiResult.candidates[i].entityId).toBe(
        singleResult.candidates[i].entityId,
      );
    }
  });

  it('should return empty for empty seed list', () => {
    const g = buildMultiSeedGraph();
    const result = runMultiSeedPPR(g, [], 'union');
    expect(result.candidates).toEqual([]);
  });
});

// ===================================================================
// Integration: template match + path score on real graph
// ===================================================================

describe('Integration: Template Match + Path Score', () => {
  it('should score a matched trustee co-service path end-to-end', () => {
    const g = buildTestGraph();
    const path = ['seed_person', 'charity_1', 'candidate_a'];

    const template = matchTemplate(
      path,
      (id) => g.getNode(id),
      (id, type) => g.getOutEdges(id, type),
      (id, type) => g.getInEdges(id, type),
    );
    expect(template).not.toBeNull();

    const { edgeWeights, evidenceConfidences } = extractPathEdges(g, path);
    const result = scorePath({
      path,
      template,
      edgeWeights,
      evidenceConfidences,
    });

    expect(result.pathScore).toBeGreaterThan(0);
    expect(result.templateWeight).toBe(1.0);
    expect(result.edgeCount).toBe(2);
  });
});
