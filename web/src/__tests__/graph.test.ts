/**
 * Tests for Epic 6 — Graph Construction (F6.3) and Identity Decision Replay (F6.2-T5).
 * Pure functions — no Supabase required.
 */
import { describe, it, expect } from 'vitest';
import {
  calculateEdgeWeight,
  calculateFreshnessMultiplier,
  getBaseStrength,
} from '@/lib/graph/weights';
import { DirectedGraph } from '@/lib/graph/networkx';
import { buildGraph } from '@/lib/graph/builder';
import {
  buildDecisionIndex,
  checkConflict,
  isMergeBlocked,
  replayDecisions,
} from '@/lib/entity-resolution/replay';
import type { CanonicalEntity, Relationship, DonationEvent, HumanIdentityDecision } from '@/types/database';

// ===================================================================
// Helpers
// ===================================================================

function makeEntity(id: string, type = 'person', name = 'Test Entity'): CanonicalEntity {
  return {
    canonical_entity_id: id,
    entity_type: type,
    display_name: name,
    first_seen_run_id: 'run_001',
    last_seen_run_id: 'run_001',
    attributes: {},
    source: 'corpus',
  };
}

function makeRelationship(overrides: Partial<Relationship> = {}): Relationship {
  return {
    relationship_id: 'rel_001',
    run_id: 'run_001',
    source_entity_id: 'ent_001',
    target_entity_id: 'ent_002',
    relationship_type: 'TRUSTEE_OF',
    valid_from: '2024-01-01',
    valid_to: null,
    evidence_id: 'ev_001',
    confidence: 0.85,
    freshness_multiplier: 1.0,
    source_reliability: 0.9,
    edge_weight: 0,
    status: 'active',
    ...overrides,
  };
}

function makeDonation(overrides: Partial<DonationEvent> = {}): DonationEvent {
  return {
    donation_event_id: 'don_001',
    run_id: 'run_001',
    donor_entity_id: 'ent_001',
    recipient_entity_id: 'ent_002',
    amount: 50000,
    currency: 'GBP',
    year: 2024,
    evidence_id: 'ev_002',
    confidence: 0.9,
    ...overrides,
  };
}

function makeDecision(overrides: Partial<HumanIdentityDecision> = {}): HumanIdentityDecision {
  return {
    identity_decision_id: 'dec_001',
    entity_a_mention_id: 'mention_001',
    entity_b_mention_id: 'mention_002',
    decision: 'same_person',
    reason_code: 'shared_name_address_org',
    notes: null,
    decided_by: 'user_001',
    decided_at: '2026-01-01T00:00:00Z',
    replay_on_future_runs: true,
    superseded_by: null,
    ...overrides,
  };
}

// ===================================================================
// Edge Weight Calculation (§15.7, Appendix A)
// ===================================================================

describe('calculateEdgeWeight', () => {
  it('computes weight as product of four factors', () => {
    const result = calculateEdgeWeight({
      relationshipType: 'TRUSTEE_OF',
      evidenceConfidence: 0.85,
      sourceReliability: 0.9,
      evidenceYear: 2025,
      referenceYear: 2026,
    });
    // TRUSTEE_OF strength = 1.0, freshness 0-2yr = 1.0
    // weight = 1.0 * 0.85 * 1.0 * 0.9 = 0.765
    expect(result.edgeWeight).toBeCloseTo(0.765, 3);
    expect(result.relationshipStrength).toBe(1.0);
    expect(result.freshnessMultiplier).toBe(1.0);
  });

  it('applies DIRECTOR_OF base strength', () => {
    const result = calculateEdgeWeight({
      relationshipType: 'DIRECTOR_OF',
      evidenceConfidence: 1.0,
      sourceReliability: 1.0,
      evidenceYear: 2026,
      referenceYear: 2026,
    });
    expect(result.edgeWeight).toBeCloseTo(0.9, 3);
  });

  it('applies freshness decay for 3-5 year old evidence', () => {
    const result = calculateEdgeWeight({
      relationshipType: 'TRUSTEE_OF',
      evidenceConfidence: 1.0,
      sourceReliability: 1.0,
      evidenceYear: 2022,
      referenceYear: 2026,
    });
    // 4 years old -> 0.75 multiplier
    expect(result.freshnessMultiplier).toBe(0.75);
    expect(result.edgeWeight).toBeCloseTo(0.75, 3);
  });

  it('applies freshness decay for 6-10 year old evidence', () => {
    const result = calculateEdgeWeight({
      relationshipType: 'TRUSTEE_OF',
      evidenceConfidence: 1.0,
      sourceReliability: 1.0,
      evidenceYear: 2018,
      referenceYear: 2026,
    });
    expect(result.freshnessMultiplier).toBe(0.5);
  });

  it('applies freshness decay for 10+ year old evidence', () => {
    const result = calculateEdgeWeight({
      relationshipType: 'TRUSTEE_OF',
      evidenceConfidence: 1.0,
      sourceReliability: 1.0,
      evidenceYear: 2010,
      referenceYear: 2026,
    });
    expect(result.freshnessMultiplier).toBe(0.25);
  });

  it('uses 0.60 multiplier for unknown date', () => {
    const result = calculateEdgeWeight({
      relationshipType: 'TRUSTEE_OF',
      evidenceConfidence: 1.0,
      sourceReliability: 1.0,
      evidenceYear: null,
      referenceYear: 2026,
    });
    expect(result.freshnessMultiplier).toBe(0.6);
    expect(result.edgeWeight).toBeCloseTo(0.6, 3);
  });

  it('uses default strength for unknown relationship types', () => {
    const result = calculateEdgeWeight({
      relationshipType: 'UNKNOWN_TYPE',
      evidenceConfidence: 1.0,
      sourceReliability: 1.0,
      evidenceYear: 2026,
      referenceYear: 2026,
    });
    expect(result.relationshipStrength).toBe(0.2);
  });
});

describe('calculateFreshnessMultiplier', () => {
  it('returns 1.0 for current year', () => {
    expect(calculateFreshnessMultiplier(2026, 2026)).toBe(1.0);
  });

  it('returns 1.0 for 2 years old', () => {
    expect(calculateFreshnessMultiplier(2024, 2026)).toBe(1.0);
  });

  it('returns 0.75 for 3 years old', () => {
    expect(calculateFreshnessMultiplier(2023, 2026)).toBe(0.75);
  });

  it('returns 0.60 for null year', () => {
    expect(calculateFreshnessMultiplier(null)).toBe(0.6);
  });
});

describe('getBaseStrength', () => {
  it('returns correct strengths per Appendix A.1', () => {
    expect(getBaseStrength('TRUSTEE_OF')).toBe(1.0);
    expect(getBaseStrength('DIRECTOR_OF')).toBe(0.9);
    expect(getBaseStrength('MADE_DONATION')).toBe(0.85);
    expect(getBaseStrength('REGISTERED_AT')).toBe(0.3);
    expect(getBaseStrength('CO_OCCURS_WITH')).toBe(0.2);
  });
});

// ===================================================================
// Graph Construction (F6.3-T1)
// ===================================================================

describe('buildGraph', () => {
  it('builds graph from entities and relationships', () => {
    const entities = [
      makeEntity('ent_001', 'person', 'John Smith'),
      makeEntity('ent_002', 'charity', 'Good Charity'),
    ];
    const relationships = [
      makeRelationship({
        relationship_id: 'rel_001',
        source_entity_id: 'ent_001',
        target_entity_id: 'ent_002',
        relationship_type: 'TRUSTEE_OF',
      }),
    ];

    const { graph, quarantined } = buildGraph({
      entities,
      relationships,
      donationEvents: [],
      referenceYear: 2026,
    });

    expect(graph.nodeCount).toBe(2);
    expect(graph.edgeCount).toBe(1);
    expect(quarantined).toHaveLength(0);

    const edge = graph.getEdge('rel_001');
    expect(edge).toBeDefined();
    expect(edge!.type).toBe('TRUSTEE_OF');
    expect(edge!.source).toBe('ent_001');
    expect(edge!.target).toBe('ent_002');
    expect(edge!.weight).toBeGreaterThan(0);
  });

  it('supports multiple edge types between same nodes (R2.1)', () => {
    const entities = [
      makeEntity('ent_001', 'person', 'Alice'),
      makeEntity('ent_002', 'charity', 'Charity A'),
    ];
    const relationships = [
      makeRelationship({
        relationship_id: 'rel_001',
        source_entity_id: 'ent_001',
        target_entity_id: 'ent_002',
        relationship_type: 'TRUSTEE_OF',
      }),
      makeRelationship({
        relationship_id: 'rel_002',
        source_entity_id: 'ent_001',
        target_entity_id: 'ent_002',
        relationship_type: 'MENTIONED_IN',
        evidence_id: 'ev_002',
      }),
    ];

    const { graph } = buildGraph({
      entities,
      relationships,
      donationEvents: [],
      referenceYear: 2026,
    });

    expect(graph.edgeCount).toBe(2);
    const outEdges = graph.getOutEdges('ent_001');
    const types = outEdges.map((e) => e.type).sort();
    expect(types).toEqual(['MENTIONED_IN', 'TRUSTEE_OF']);
  });

  it('includes freshness_multiplier on every edge (R2.6)', () => {
    const entities = [
      makeEntity('ent_001'),
      makeEntity('ent_002'),
    ];
    const relationships = [
      makeRelationship({ valid_from: '2020-06-15' }),
    ];

    const { graph } = buildGraph({
      entities,
      relationships,
      donationEvents: [],
      referenceYear: 2026,
    });

    const edge = graph.getEdge('rel_001');
    expect(edge!.attributes.freshness_multiplier).toBeDefined();
    // 2020 is 6 years ago from 2026 -> bracket 6-10 -> 0.5
    expect(edge!.attributes.freshness_multiplier).toBe(0.5);
  });
});

// ===================================================================
// Donation Event Modelling (F6.3-T3, R2.7)
// ===================================================================

describe('donation event modelling', () => {
  it('models donations as nodes with MADE_DONATION and RECEIVED_BY edges', () => {
    const entities = [
      makeEntity('ent_001', 'person', 'Generous Donor'),
      makeEntity('ent_002', 'charity', 'Good Charity'),
    ];
    const donations = [makeDonation()];

    const { graph, quarantined } = buildGraph({
      entities,
      relationships: [],
      donationEvents: donations,
      referenceYear: 2026,
    });

    expect(quarantined).toHaveLength(0);
    // 2 entity nodes + 1 donation event node
    expect(graph.nodeCount).toBe(3);
    // 2 edges: MADE_DONATION + RECEIVED_BY
    expect(graph.edgeCount).toBe(2);

    // Donation event is a node, not an edge
    const donNode = graph.getNode('don_001');
    expect(donNode).toBeDefined();
    expect(donNode!.type).toBe('donation_event');
    expect(donNode!.attributes.amount).toBe(50000);

    // Donor -> DonationEvent
    const donorEdges = graph.getOutEdges('ent_001', 'MADE_DONATION');
    expect(donorEdges).toHaveLength(1);
    expect(donorEdges[0].target).toBe('don_001');

    // DonationEvent -> Recipient
    const recipientEdges = graph.getOutEdges('don_001', 'RECEIVED_BY');
    expect(recipientEdges).toHaveLength(1);
    expect(recipientEdges[0].target).toBe('ent_002');
  });

  it('quarantines donation events without evidence', () => {
    const entities = [
      makeEntity('ent_001'),
      makeEntity('ent_002'),
    ];
    const donations = [
      makeDonation({ evidence_id: '' }),
    ];

    const { quarantined } = buildGraph({
      entities,
      relationships: [],
      donationEvents: donations,
      referenceYear: 2026,
    });

    expect(quarantined).toHaveLength(1);
    expect(quarantined[0].reasonCode).toBe('missing_evidence');
  });
});

// ===================================================================
// Evidence Validation / Quarantine (F6.3-T4, R2.5)
// ===================================================================

describe('evidence validation', () => {
  it('quarantines relationships without evidence_id', () => {
    const entities = [makeEntity('ent_001'), makeEntity('ent_002')];
    const relationships = [
      makeRelationship({ evidence_id: '' }),
    ];

    const { graph, quarantined } = buildGraph({
      entities,
      relationships,
      donationEvents: [],
      referenceYear: 2026,
    });

    expect(quarantined).toHaveLength(1);
    expect(quarantined[0].reasonCode).toBe('missing_evidence');
    expect(graph.edgeCount).toBe(0);
  });

  it('quarantines relationships with confidence below 0.40', () => {
    const entities = [makeEntity('ent_001'), makeEntity('ent_002')];
    const relationships = [
      makeRelationship({ confidence: 0.35 }),
    ];

    const { quarantined } = buildGraph({
      entities,
      relationships,
      donationEvents: [],
      referenceYear: 2026,
    });

    expect(quarantined).toHaveLength(1);
    expect(quarantined[0].reasonCode).toBe('low_confidence');
  });

  it('quarantines relationships with missing source node', () => {
    const entities = [makeEntity('ent_002')]; // ent_001 missing
    const relationships = [makeRelationship()];

    const { quarantined } = buildGraph({
      entities,
      relationships,
      donationEvents: [],
      referenceYear: 2026,
    });

    expect(quarantined).toHaveLength(1);
    expect(quarantined[0].reasonCode).toBe('missing_node');
  });

  it('quarantines relationships with missing target node', () => {
    const entities = [makeEntity('ent_001')]; // ent_002 missing
    const relationships = [makeRelationship()];

    const { quarantined } = buildGraph({
      entities,
      relationships,
      donationEvents: [],
      referenceYear: 2026,
    });

    expect(quarantined).toHaveLength(1);
    expect(quarantined[0].reasonCode).toBe('missing_node');
  });

  it('does not quarantine valid edges', () => {
    const entities = [makeEntity('ent_001'), makeEntity('ent_002')];
    const relationships = [makeRelationship()];

    const { quarantined } = buildGraph({
      entities,
      relationships,
      donationEvents: [],
      referenceYear: 2026,
    });

    expect(quarantined).toHaveLength(0);
  });
});

// ===================================================================
// DirectedGraph / NetworkX (F6.3-T5)
// ===================================================================

describe('DirectedGraph', () => {
  it('adds and retrieves nodes', () => {
    const g = new DirectedGraph();
    g.addNode({ id: 'a', type: 'person', attributes: {} });
    g.addNode({ id: 'b', type: 'charity', attributes: {} });

    expect(g.nodeCount).toBe(2);
    expect(g.hasNode('a')).toBe(true);
    expect(g.getNode('a')!.type).toBe('person');
  });

  it('adds and retrieves edges', () => {
    const g = new DirectedGraph();
    g.addNode({ id: 'a', type: 'person', attributes: {} });
    g.addNode({ id: 'b', type: 'charity', attributes: {} });
    g.addEdge({ id: 'e1', source: 'a', target: 'b', type: 'TRUSTEE_OF', weight: 0.8, attributes: {} });

    expect(g.edgeCount).toBe(1);
    expect(g.getEdge('e1')!.weight).toBe(0.8);
  });

  it('throws when adding edge with missing node', () => {
    const g = new DirectedGraph();
    g.addNode({ id: 'a', type: 'person', attributes: {} });

    expect(() =>
      g.addEdge({ id: 'e1', source: 'a', target: 'b', type: 'X', weight: 1, attributes: {} }),
    ).toThrow('Target node b does not exist');
  });

  it('supports multiple edge types between same nodes', () => {
    const g = new DirectedGraph();
    g.addNode({ id: 'a', type: 'person', attributes: {} });
    g.addNode({ id: 'b', type: 'charity', attributes: {} });
    g.addEdge({ id: 'e1', source: 'a', target: 'b', type: 'TRUSTEE_OF', weight: 0.8, attributes: {} });
    g.addEdge({ id: 'e2', source: 'a', target: 'b', type: 'DIRECTOR_OF', weight: 0.6, attributes: {} });

    expect(g.edgeCount).toBe(2);
    expect(g.getOutEdges('a')).toHaveLength(2);
    expect(g.getOutEdges('a', 'TRUSTEE_OF')).toHaveLength(1);
    expect(g.getOutEdges('a', 'DIRECTOR_OF')).toHaveLength(1);
  });

  it('removes nodes and their edges', () => {
    const g = new DirectedGraph();
    g.addNode({ id: 'a', type: 'person', attributes: {} });
    g.addNode({ id: 'b', type: 'charity', attributes: {} });
    g.addEdge({ id: 'e1', source: 'a', target: 'b', type: 'X', weight: 1, attributes: {} });

    g.removeNode('a');
    expect(g.nodeCount).toBe(1);
    expect(g.edgeCount).toBe(0);
  });

  it('removes edges', () => {
    const g = new DirectedGraph();
    g.addNode({ id: 'a', type: 'person', attributes: {} });
    g.addNode({ id: 'b', type: 'charity', attributes: {} });
    g.addEdge({ id: 'e1', source: 'a', target: 'b', type: 'X', weight: 1, attributes: {} });

    g.removeEdge('e1');
    expect(g.edgeCount).toBe(0);
    expect(g.nodeCount).toBe(2);
  });

  it('returns successors and predecessors', () => {
    const g = new DirectedGraph();
    g.addNode({ id: 'a', type: 'p', attributes: {} });
    g.addNode({ id: 'b', type: 'p', attributes: {} });
    g.addNode({ id: 'c', type: 'p', attributes: {} });
    g.addEdge({ id: 'e1', source: 'a', target: 'b', type: 'X', weight: 1, attributes: {} });
    g.addEdge({ id: 'e2', source: 'a', target: 'c', type: 'X', weight: 1, attributes: {} });

    expect(g.getSuccessors('a').sort()).toEqual(['b', 'c']);
    expect(g.getPredecessors('b')).toEqual(['a']);
  });

  describe('shortestPath', () => {
    it('finds shortest path', () => {
      const g = new DirectedGraph();
      g.addNode({ id: 'a', type: 'p', attributes: {} });
      g.addNode({ id: 'b', type: 'p', attributes: {} });
      g.addNode({ id: 'c', type: 'p', attributes: {} });
      g.addEdge({ id: 'e1', source: 'a', target: 'b', type: 'X', weight: 1, attributes: {} });
      g.addEdge({ id: 'e2', source: 'b', target: 'c', type: 'X', weight: 1, attributes: {} });

      expect(g.shortestPath('a', 'c')).toEqual(['a', 'b', 'c']);
    });

    it('returns null when no path exists', () => {
      const g = new DirectedGraph();
      g.addNode({ id: 'a', type: 'p', attributes: {} });
      g.addNode({ id: 'b', type: 'p', attributes: {} });

      expect(g.shortestPath('a', 'b')).toBeNull();
    });

    it('returns single-node path for same source and target', () => {
      const g = new DirectedGraph();
      g.addNode({ id: 'a', type: 'p', attributes: {} });

      expect(g.shortestPath('a', 'a')).toEqual(['a']);
    });
  });

  describe('personalizedPageRank', () => {
    it('computes PageRank with personalization', () => {
      const g = new DirectedGraph();
      g.addNode({ id: 'a', type: 'p', attributes: {} });
      g.addNode({ id: 'b', type: 'p', attributes: {} });
      g.addNode({ id: 'c', type: 'p', attributes: {} });
      g.addEdge({ id: 'e1', source: 'a', target: 'b', type: 'X', weight: 1, attributes: {} });
      g.addEdge({ id: 'e2', source: 'b', target: 'c', type: 'X', weight: 1, attributes: {} });
      g.addEdge({ id: 'e3', source: 'c', target: 'a', type: 'X', weight: 1, attributes: {} });

      const personalization = new Map([['a', 1.0]]);
      const scores = g.personalizedPageRank(personalization);

      // All nodes should have a score > 0
      expect(scores.get('a')).toBeGreaterThan(0);
      expect(scores.get('b')).toBeGreaterThan(0);
      expect(scores.get('c')).toBeGreaterThan(0);

      // Seed node 'a' should have the highest score due to personalization
      expect(scores.get('a')!).toBeGreaterThan(scores.get('c')!);
    });

    it('returns empty map for empty graph', () => {
      const g = new DirectedGraph();
      const scores = g.personalizedPageRank(new Map());
      expect(scores.size).toBe(0);
    });

    it('handles dangling nodes', () => {
      const g = new DirectedGraph();
      g.addNode({ id: 'a', type: 'p', attributes: {} });
      g.addNode({ id: 'b', type: 'p', attributes: {} });
      g.addEdge({ id: 'e1', source: 'a', target: 'b', type: 'X', weight: 1, attributes: {} });
      // 'b' is a dangling node (no outgoing edges)

      const scores = g.personalizedPageRank(new Map([['a', 1.0]]));
      expect(scores.get('a')).toBeGreaterThan(0);
      expect(scores.get('b')).toBeGreaterThan(0);
    });

    it('respects edge weights in PageRank', () => {
      const g = new DirectedGraph();
      g.addNode({ id: 'a', type: 'p', attributes: {} });
      g.addNode({ id: 'b', type: 'p', attributes: {} });
      g.addNode({ id: 'c', type: 'p', attributes: {} });
      // a -> b with high weight
      g.addEdge({ id: 'e1', source: 'a', target: 'b', type: 'X', weight: 10, attributes: {} });
      // a -> c with low weight
      g.addEdge({ id: 'e2', source: 'a', target: 'c', type: 'X', weight: 1, attributes: {} });

      const scores = g.personalizedPageRank(new Map([['a', 1.0]]));
      // b should get more score than c due to higher edge weight
      expect(scores.get('b')!).toBeGreaterThan(scores.get('c')!);
    });
  });

  describe('serialization', () => {
    it('serializes and deserializes a graph', () => {
      const g = new DirectedGraph();
      g.addNode({ id: 'a', type: 'person', attributes: { name: 'Alice' } });
      g.addNode({ id: 'b', type: 'charity', attributes: { name: 'Charity B' } });
      g.addEdge({ id: 'e1', source: 'a', target: 'b', type: 'TRUSTEE_OF', weight: 0.8, attributes: { year: 2024 } });

      const serialized = g.serialize();
      expect(serialized.nodes).toHaveLength(2);
      expect(serialized.edges).toHaveLength(1);

      const restored = DirectedGraph.deserialize(serialized);
      expect(restored.nodeCount).toBe(2);
      expect(restored.edgeCount).toBe(1);
      expect(restored.getNode('a')!.attributes.name).toBe('Alice');
      expect(restored.getEdge('e1')!.weight).toBe(0.8);
    });

    it('roundtrips through JSON', () => {
      const g = new DirectedGraph();
      g.addNode({ id: 'x', type: 'p', attributes: {} });
      g.addNode({ id: 'y', type: 'p', attributes: {} });
      g.addEdge({ id: 'e', source: 'x', target: 'y', type: 'T', weight: 0.5, attributes: {} });

      const json = JSON.stringify(g.serialize());
      const restored = DirectedGraph.deserialize(JSON.parse(json));

      expect(restored.nodeCount).toBe(2);
      expect(restored.edgeCount).toBe(1);
      expect(restored.getEdge('e')!.weight).toBe(0.5);
    });
  });
});

// ===================================================================
// Human Decision Replay (F6.2-T5, §15.5)
// ===================================================================

describe('buildDecisionIndex', () => {
  it('indexes merge decisions', () => {
    const decisions = [makeDecision({ decision: 'same_person' })];
    const index = buildDecisionIndex(decisions);

    expect(index.merges.size).toBe(1);
    expect(index.splits.size).toBe(0);
  });

  it('indexes split decisions', () => {
    const decisions = [makeDecision({ decision: 'not_same_person' })];
    const index = buildDecisionIndex(decisions);

    expect(index.splits.size).toBe(1);
    expect(index.merges.size).toBe(0);
    expect(index.splitBlockedMentions.has('mention_001')).toBe(true);
    expect(index.splitBlockedMentions.has('mention_002')).toBe(true);
  });

  it('ignores superseded decisions', () => {
    const decisions = [
      makeDecision({ superseded_by: 'dec_002' }),
    ];
    const index = buildDecisionIndex(decisions);

    expect(index.merges.size).toBe(0);
    expect(index.splits.size).toBe(0);
  });

  it('ignores decisions with replay_on_future_runs=false', () => {
    const decisions = [
      makeDecision({ replay_on_future_runs: false }),
    ];
    const index = buildDecisionIndex(decisions);

    expect(index.merges.size).toBe(0);
  });
});

describe('checkConflict', () => {
  it('detects merge conflict with existing split', () => {
    const index = buildDecisionIndex([
      makeDecision({ decision: 'not_same_person' }),
    ]);

    const conflict = checkConflict(index, 'mention_001', 'mention_002', 'merge');
    expect(conflict).not.toBeNull();
    expect(conflict!.humanDecision).toBe('not_same_person');
    expect(conflict!.autoSuggestion).toBe('merge');
  });

  it('detects split conflict with existing merge', () => {
    const index = buildDecisionIndex([
      makeDecision({ decision: 'same_person' }),
    ]);

    const conflict = checkConflict(index, 'mention_001', 'mention_002', 'split');
    expect(conflict).not.toBeNull();
    expect(conflict!.humanDecision).toBe('same_person');
    expect(conflict!.autoSuggestion).toBe('split');
  });

  it('returns null when no conflict', () => {
    const index = buildDecisionIndex([]);
    const conflict = checkConflict(index, 'mention_001', 'mention_002', 'merge');
    expect(conflict).toBeNull();
  });

  it('handles reversed mention order (normalised pair)', () => {
    const index = buildDecisionIndex([
      makeDecision({ decision: 'not_same_person' }),
    ]);

    // Reverse order should still detect the conflict
    const conflict = checkConflict(index, 'mention_002', 'mention_001', 'merge');
    expect(conflict).not.toBeNull();
  });
});

describe('isMergeBlocked', () => {
  it('returns true when split exists between mentions', () => {
    const index = buildDecisionIndex([
      makeDecision({ decision: 'not_same_person' }),
    ]);
    expect(isMergeBlocked(index, 'mention_001', 'mention_002')).toBe(true);
  });

  it('returns false when no split exists', () => {
    const index = buildDecisionIndex([
      makeDecision({ decision: 'same_person' }),
    ]);
    expect(isMergeBlocked(index, 'mention_001', 'mention_002')).toBe(false);
  });
});

describe('replayDecisions', () => {
  it('splits a cluster when human says not-same-person', () => {
    const index = buildDecisionIndex([
      makeDecision({
        entity_a_mention_id: 'a',
        entity_b_mention_id: 'b',
        decision: 'not_same_person',
      }),
    ]);

    const clusters = [
      { mentionIds: ['a', 'b', 'c'], confidence: 0.9 },
    ];

    const { adjustedClusters, conflicts } = replayDecisions(index, clusters);

    // 'a' and 'b' must be in different clusters
    const clusterWithA = adjustedClusters.find((c) => c.mentionIds.includes('a'));
    const clusterWithB = adjustedClusters.find((c) => c.mentionIds.includes('b'));
    expect(clusterWithA).toBeDefined();
    expect(clusterWithB).toBeDefined();
    expect(clusterWithA).not.toBe(clusterWithB);

    // Conflict should be logged
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].humanDecision).toBe('not_same_person');
  });

  it('merges separate clusters when human says same-person', () => {
    const index = buildDecisionIndex([
      makeDecision({
        entity_a_mention_id: 'a',
        entity_b_mention_id: 'b',
        decision: 'same_person',
      }),
    ]);

    const clusters = [
      { mentionIds: ['a'], confidence: 0.5 },
      { mentionIds: ['b'], confidence: 0.6 },
    ];

    const { adjustedClusters } = replayDecisions(index, clusters);

    // Should be merged into one cluster
    expect(adjustedClusters).toHaveLength(1);
    expect(adjustedClusters[0].mentionIds.sort()).toEqual(['a', 'b']);
  });

  it('does not merge when a split blocks the merge', () => {
    const index = buildDecisionIndex([
      makeDecision({
        identity_decision_id: 'dec_merge',
        entity_a_mention_id: 'a',
        entity_b_mention_id: 'b',
        decision: 'same_person',
      }),
      makeDecision({
        identity_decision_id: 'dec_split',
        entity_a_mention_id: 'a',
        entity_b_mention_id: 'c',
        decision: 'not_same_person',
      }),
    ]);

    const clusters = [
      { mentionIds: ['a'], confidence: 0.5 },
      { mentionIds: ['b', 'c'], confidence: 0.6 },
    ];

    const { adjustedClusters } = replayDecisions(index, clusters);

    // a and b should merge, but only if no split blocks it.
    // Since a-c has a split and c is in the same cluster as b, the merge is blocked.
    const clusterWithA = adjustedClusters.find((c) => c.mentionIds.includes('a'));
    const clusterWithC = adjustedClusters.find((c) => c.mentionIds.includes('c'));
    expect(clusterWithA).not.toBe(clusterWithC);
  });

  it('preserves clusters with no relevant decisions', () => {
    const index = buildDecisionIndex([]);
    const clusters = [
      { mentionIds: ['x', 'y'], confidence: 0.9 },
    ];

    const { adjustedClusters, conflicts } = replayDecisions(index, clusters);

    expect(adjustedClusters).toHaveLength(1);
    expect(adjustedClusters[0].mentionIds).toEqual(['x', 'y']);
    expect(conflicts).toHaveLength(0);
  });
});
