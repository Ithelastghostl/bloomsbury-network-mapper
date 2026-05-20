/**
 * Path-template definitions for candidate discovery (F7.1-T1, §16.1).
 *
 * Each template encodes a business-relevant path pattern with a weight.
 * Templates match sequences of (edge_type, node_type) hops in the graph.
 */

/** A single hop in a path template: edge type and the expected node type at the far end. */
export interface TemplateHop {
  edgeType: string;
  /** 'forward' = follow outgoing edge, 'reverse' = follow incoming edge. */
  direction: 'forward' | 'reverse';
  /** Expected node type at the far end of this hop. */
  nodeType: string;
}

export interface PathTemplate {
  id: string;
  name: string;
  /** Ordered hops that define this pattern. */
  hops: TemplateHop[];
  /** Template weight applied in path score formula (§16.2). */
  weight: number;
}

/**
 * PRD §16.1 path templates:
 *
 * 1. Trustee co-service:
 *    Seed Person → TRUSTEE_OF → Charity ← TRUSTEE_OF ← Candidate Person
 *
 * 2. Donation chain:
 *    Seed Trust → MADE_DONATION → DonationEvent → RECEIVED_BY → Charity ← TRUSTEE_OF ← Candidate Person
 *
 * 3. Director-trustee bridge:
 *    Seed Company ← DIRECTOR_OF ← Person → TRUSTEE_OF → Charity
 */
export const PATH_TEMPLATES: PathTemplate[] = [
  {
    id: 'trustee_co_service',
    name: 'Trustee co-service',
    hops: [
      { edgeType: 'TRUSTEE_OF', direction: 'forward', nodeType: 'charity' },
      { edgeType: 'TRUSTEE_OF', direction: 'reverse', nodeType: 'person' },
    ],
    weight: 1.0,
  },
  {
    id: 'donation_chain',
    name: 'Donation chain',
    hops: [
      { edgeType: 'MADE_DONATION', direction: 'forward', nodeType: 'donation_event' },
      { edgeType: 'RECEIVED_BY', direction: 'forward', nodeType: 'charity' },
      { edgeType: 'TRUSTEE_OF', direction: 'reverse', nodeType: 'person' },
    ],
    weight: 0.85,
  },
  {
    id: 'director_trustee_bridge',
    name: 'Director-trustee bridge',
    hops: [
      { edgeType: 'DIRECTOR_OF', direction: 'reverse', nodeType: 'person' },
      { edgeType: 'TRUSTEE_OF', direction: 'forward', nodeType: 'charity' },
    ],
    weight: 0.9,
  },
];

/**
 * Check whether a concrete path (sequence of node IDs) matches a template
 * against the graph structure.
 *
 * The path must start at `path[0]` and follow the template's hops exactly,
 * arriving at `path[path.length-1]` as the candidate node.
 *
 * Returns the matching template or null.
 */
export function matchTemplate(
  path: string[],
  getNode: (id: string) => { type: string } | undefined,
  getOutEdges: (id: string, edgeType?: string) => { target: string; type: string }[],
  getInEdges: (id: string, edgeType?: string) => { source: string; type: string }[],
  templates?: PathTemplate[],
): PathTemplate | null {
  const templateList = templates ?? PATH_TEMPLATES;

  for (const template of templateList) {
    // A template with N hops connects N+1 nodes
    if (path.length !== template.hops.length + 1) continue;

    let matched = true;
    for (let i = 0; i < template.hops.length; i++) {
      const hop = template.hops[i];
      const currentNode = path[i];
      const nextNode = path[i + 1];

      // Verify the target node type
      const targetNodeData = getNode(nextNode);
      if (!targetNodeData || targetNodeData.type !== hop.nodeType) {
        matched = false;
        break;
      }

      // Verify the edge exists with correct type and direction
      if (hop.direction === 'forward') {
        const edges = getOutEdges(currentNode, hop.edgeType);
        if (!edges.some((e) => e.target === nextNode)) {
          matched = false;
          break;
        }
      } else {
        // reverse: Candidate → edgeType → currentNode, so currentNode has an incoming edge from nextNode
        const edges = getInEdges(currentNode, hop.edgeType);
        if (!edges.some((e) => e.source === nextNode)) {
          matched = false;
          break;
        }
      }
    }

    if (matched) return template;
  }

  return null;
}
