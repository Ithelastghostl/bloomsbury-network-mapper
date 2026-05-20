/**
 * Graph construction from canonical entities and relationships (F6.3-T1, T3, T4).
 *
 * - Directed, typed, weighted edges per §15.6
 * - Raw mentions stay separate from canonical entities (R2.2)
 * - Multiple edge types between same nodes allowed (R2.1)
 * - Donation events modelled as nodes, not edges (R2.7)
 * - Evidence validation: quarantine edges missing evidence before insert (R2.5)
 */

import { DirectedGraph } from './networkx';
import { calculateEdgeWeight } from './weights';
import type {
  CanonicalEntity,
  Relationship,
  DonationEvent,
} from '@/types/database';

export interface QuarantineItem {
  sourcePhase: string;
  sourceRecord: Record<string, unknown>;
  reasonCode: string;
  details: string;
}

export interface BuildResult {
  graph: DirectedGraph;
  quarantined: QuarantineItem[];
}

export interface BuildInput {
  entities: CanonicalEntity[];
  relationships: Relationship[];
  donationEvents: DonationEvent[];
  /** Reference year for freshness calculation (defaults to current year). */
  referenceYear?: number;
}

/**
 * Build the entity graph from canonical entities and relationships.
 */
export function buildGraph(input: BuildInput): BuildResult {
  const { entities, relationships, donationEvents, referenceYear } = input;
  const graph = new DirectedGraph();
  const quarantined: QuarantineItem[] = [];

  // Add all canonical entity nodes
  for (const entity of entities) {
    graph.addNode({
      id: entity.canonical_entity_id,
      type: entity.entity_type,
      attributes: {
        display_name: entity.display_name,
        ...entity.attributes,
      },
    });
  }

  // Add relationship edges with evidence validation (R2.5, F6.3-T4)
  for (const rel of relationships) {
    // Evidence validation: quarantine edges missing evidence BEFORE insert
    if (!rel.evidence_id) {
      quarantined.push({
        sourcePhase: 'graph',
        sourceRecord: { ...rel },
        reasonCode: 'missing_evidence',
        details: `Relationship ${rel.relationship_id} (${rel.relationship_type}) has no evidence_id`,
      });
      continue;
    }

    // Ensure both source and target nodes exist
    if (!graph.hasNode(rel.source_entity_id)) {
      quarantined.push({
        sourcePhase: 'graph',
        sourceRecord: { relationship_id: rel.relationship_id },
        reasonCode: 'missing_node',
        details: `Source entity ${rel.source_entity_id} not found for relationship ${rel.relationship_id}`,
      });
      continue;
    }
    if (!graph.hasNode(rel.target_entity_id)) {
      quarantined.push({
        sourcePhase: 'graph',
        sourceRecord: { relationship_id: rel.relationship_id },
        reasonCode: 'missing_node',
        details: `Target entity ${rel.target_entity_id} not found for relationship ${rel.relationship_id}`,
      });
      continue;
    }

    // Quarantine low-confidence edges (Appendix A.4: confidence < 0.40)
    if (rel.confidence < 0.40) {
      quarantined.push({
        sourcePhase: 'graph',
        sourceRecord: { relationship_id: rel.relationship_id },
        reasonCode: 'low_confidence',
        details: `Relationship ${rel.relationship_id} confidence ${rel.confidence} below threshold 0.40`,
      });
      continue;
    }

    // Calculate edge weight per §15.7
    const evidenceYear = rel.valid_from ? new Date(rel.valid_from).getFullYear() : null;
    const { edgeWeight, freshnessMultiplier } = calculateEdgeWeight({
      relationshipType: rel.relationship_type,
      evidenceConfidence: rel.confidence,
      sourceReliability: rel.source_reliability,
      evidenceYear,
      referenceYear,
    });

    graph.addEdge({
      id: rel.relationship_id,
      source: rel.source_entity_id,
      target: rel.target_entity_id,
      type: rel.relationship_type,
      weight: edgeWeight,
      attributes: {
        evidence_id: rel.evidence_id,
        confidence: rel.confidence,
        freshness_multiplier: freshnessMultiplier,
        source_reliability: rel.source_reliability,
        valid_from: rel.valid_from,
        valid_to: rel.valid_to,
        status: rel.status,
      },
    });
  }

  // Model donation events as nodes with MADE_DONATION and RECEIVED_BY edges (R2.7)
  for (const donation of donationEvents) {
    // Evidence validation for donations
    if (!donation.evidence_id) {
      quarantined.push({
        sourcePhase: 'graph',
        sourceRecord: { ...donation },
        reasonCode: 'missing_evidence',
        details: `Donation event ${donation.donation_event_id} has no evidence_id`,
      });
      continue;
    }

    if (!graph.hasNode(donation.donor_entity_id) || !graph.hasNode(donation.recipient_entity_id)) {
      quarantined.push({
        sourcePhase: 'graph',
        sourceRecord: { donation_event_id: donation.donation_event_id },
        reasonCode: 'missing_node',
        details: `Donor or recipient entity not found for donation ${donation.donation_event_id}`,
      });
      continue;
    }

    // Add donation event node
    graph.addNode({
      id: donation.donation_event_id,
      type: 'donation_event',
      attributes: {
        amount: donation.amount,
        currency: donation.currency,
        year: donation.year,
        evidence_id: donation.evidence_id,
        confidence: donation.confidence,
      },
    });

    // MADE_DONATION edge: donor -> donation event
    const donorWeight = calculateEdgeWeight({
      relationshipType: 'MADE_DONATION',
      evidenceConfidence: donation.confidence,
      sourceReliability: 1.0,
      evidenceYear: donation.year,
      referenceYear,
    });

    graph.addEdge({
      id: `${donation.donation_event_id}_donor`,
      source: donation.donor_entity_id,
      target: donation.donation_event_id,
      type: 'MADE_DONATION',
      weight: donorWeight.edgeWeight,
      attributes: {
        evidence_id: donation.evidence_id,
        confidence: donation.confidence,
        freshness_multiplier: donorWeight.freshnessMultiplier,
      },
    });

    // RECEIVED_BY edge: donation event -> recipient
    const recipientWeight = calculateEdgeWeight({
      relationshipType: 'RECEIVED_BY',
      evidenceConfidence: donation.confidence,
      sourceReliability: 1.0,
      evidenceYear: donation.year,
      referenceYear,
    });

    graph.addEdge({
      id: `${donation.donation_event_id}_recipient`,
      source: donation.donation_event_id,
      target: donation.recipient_entity_id,
      type: 'RECEIVED_BY',
      weight: recipientWeight.edgeWeight,
      attributes: {
        evidence_id: donation.evidence_id,
        confidence: donation.confidence,
        freshness_multiplier: recipientWeight.freshnessMultiplier,
      },
    });
  }

  return { graph, quarantined };
}
