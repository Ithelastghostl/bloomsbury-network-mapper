/**
 * In-process graph data structure replacing Python NetworkX (F6.3-T5).
 *
 * Supports:
 * - Node/edge CRUD with typed, weighted edges
 * - Multiple edge types between the same node pair (R2.1)
 * - Personalized PageRank
 * - Path traversal (BFS shortest path)
 * - Serialization to/from plain objects for Postgres views
 */

export interface GraphNode {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  weight: number;
  attributes: Record<string, unknown>;
}

/** Adjacency list keyed by source node ID -> array of edge IDs. */
type AdjacencyList = Map<string, Set<string>>;

export interface SerializedGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export class DirectedGraph {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: Map<string, GraphEdge> = new Map();
  private outAdj: AdjacencyList = new Map();
  private inAdj: AdjacencyList = new Map();

  // ── Node CRUD ──

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
    if (!this.outAdj.has(node.id)) this.outAdj.set(node.id, new Set());
    if (!this.inAdj.has(node.id)) this.inAdj.set(node.id, new Set());
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  hasNode(id: string): boolean {
    return this.nodes.has(id);
  }

  removeNode(id: string): boolean {
    if (!this.nodes.has(id)) return false;

    // Remove all edges involving this node
    const outEdges = this.outAdj.get(id) ?? new Set();
    const inEdges = this.inAdj.get(id) ?? new Set();

    for (const edgeId of outEdges) {
      const edge = this.edges.get(edgeId);
      if (edge) {
        this.inAdj.get(edge.target)?.delete(edgeId);
        this.edges.delete(edgeId);
      }
    }
    for (const edgeId of inEdges) {
      const edge = this.edges.get(edgeId);
      if (edge) {
        this.outAdj.get(edge.source)?.delete(edgeId);
        this.edges.delete(edgeId);
      }
    }

    this.outAdj.delete(id);
    this.inAdj.delete(id);
    this.nodes.delete(id);
    return true;
  }

  getAllNodes(): GraphNode[] {
    return [...this.nodes.values()];
  }

  get nodeCount(): number {
    return this.nodes.size;
  }

  // ── Edge CRUD ──

  addEdge(edge: GraphEdge): void {
    // Ensure both nodes exist
    if (!this.nodes.has(edge.source)) {
      throw new Error(`Source node ${edge.source} does not exist`);
    }
    if (!this.nodes.has(edge.target)) {
      throw new Error(`Target node ${edge.target} does not exist`);
    }

    this.edges.set(edge.id, edge);
    this.outAdj.get(edge.source)!.add(edge.id);
    this.inAdj.get(edge.target)!.add(edge.id);
  }

  getEdge(id: string): GraphEdge | undefined {
    return this.edges.get(id);
  }

  removeEdge(id: string): boolean {
    const edge = this.edges.get(id);
    if (!edge) return false;

    this.outAdj.get(edge.source)?.delete(id);
    this.inAdj.get(edge.target)?.delete(id);
    this.edges.delete(id);
    return true;
  }

  getAllEdges(): GraphEdge[] {
    return [...this.edges.values()];
  }

  get edgeCount(): number {
    return this.edges.size;
  }

  /** Get outgoing edges from a node, optionally filtered by edge type. */
  getOutEdges(nodeId: string, edgeType?: string): GraphEdge[] {
    const edgeIds = this.outAdj.get(nodeId);
    if (!edgeIds) return [];

    const edges: GraphEdge[] = [];
    for (const id of edgeIds) {
      const edge = this.edges.get(id)!;
      if (!edgeType || edge.type === edgeType) {
        edges.push(edge);
      }
    }
    return edges;
  }

  /** Get incoming edges to a node, optionally filtered by edge type. */
  getInEdges(nodeId: string, edgeType?: string): GraphEdge[] {
    const edgeIds = this.inAdj.get(nodeId);
    if (!edgeIds) return [];

    const edges: GraphEdge[] = [];
    for (const id of edgeIds) {
      const edge = this.edges.get(id)!;
      if (!edgeType || edge.type === edgeType) {
        edges.push(edge);
      }
    }
    return edges;
  }

  /** Get outgoing neighbor node IDs. */
  getSuccessors(nodeId: string): string[] {
    return this.getOutEdges(nodeId).map((e) => e.target);
  }

  /** Get incoming neighbor node IDs. */
  getPredecessors(nodeId: string): string[] {
    return this.getInEdges(nodeId).map((e) => e.source);
  }

  // ── Path Traversal ──

  /** BFS shortest path (by hop count) from source to target. Returns node IDs or null. */
  shortestPath(source: string, target: string): string[] | null {
    if (!this.nodes.has(source) || !this.nodes.has(target)) return null;
    if (source === target) return [source];

    const visited = new Set<string>([source]);
    const queue: string[] = [source];
    const parent = new Map<string, string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const edge of this.getOutEdges(current)) {
        if (!visited.has(edge.target)) {
          visited.add(edge.target);
          parent.set(edge.target, current);
          if (edge.target === target) {
            // Reconstruct path
            const path: string[] = [target];
            let node = target;
            while (parent.has(node)) {
              node = parent.get(node)!;
              path.unshift(node);
            }
            return path;
          }
          queue.push(edge.target);
        }
      }
    }
    return null;
  }

  // ── Personalized PageRank ──

  /**
   * Personalized PageRank with configurable seed nodes.
   * @param personalization Map of node ID -> weight (seed nodes).
   * @param alpha Damping factor (default 0.85).
   * @param iterations Max iterations (default 100).
   * @param tolerance Convergence threshold (default 1e-6).
   */
  personalizedPageRank(
    personalization: Map<string, number>,
    alpha = 0.85,
    iterations = 100,
    tolerance = 1e-6,
  ): Map<string, number> {
    const nodeIds = [...this.nodes.keys()];
    const n = nodeIds.length;
    if (n === 0) return new Map();

    // Normalize personalization vector
    const pSum = [...personalization.values()].reduce((a, b) => a + b, 0);
    const p = new Map<string, number>();
    for (const id of nodeIds) {
      p.set(id, (personalization.get(id) ?? 0) / (pSum || 1));
    }

    // Initialize scores uniformly
    let scores = new Map<string, number>();
    for (const id of nodeIds) {
      scores.set(id, 1 / n);
    }

    for (let iter = 0; iter < iterations; iter++) {
      const newScores = new Map<string, number>();
      for (const id of nodeIds) {
        newScores.set(id, 0);
      }

      // Distribute scores along edges (weighted)
      for (const id of nodeIds) {
        const outEdges = this.getOutEdges(id);
        const totalWeight = outEdges.reduce((s, e) => s + e.weight, 0);

        if (totalWeight > 0) {
          for (const edge of outEdges) {
            const share = (scores.get(id)! * edge.weight) / totalWeight;
            newScores.set(edge.target, newScores.get(edge.target)! + share);
          }
        } else {
          // Dangling node: distribute evenly
          const share = scores.get(id)! / n;
          for (const nid of nodeIds) {
            newScores.set(nid, newScores.get(nid)! + share);
          }
        }
      }

      // Apply damping with personalization
      let diff = 0;
      for (const id of nodeIds) {
        const val = alpha * newScores.get(id)! + (1 - alpha) * (p.get(id) ?? 0);
        diff += Math.abs(val - scores.get(id)!);
        newScores.set(id, val);
      }

      scores = newScores;

      if (diff < tolerance) break;
    }

    return scores;
  }

  // ── Serialization ──

  serialize(): SerializedGraph {
    return {
      nodes: this.getAllNodes(),
      edges: this.getAllEdges(),
    };
  }

  static deserialize(data: SerializedGraph): DirectedGraph {
    const graph = new DirectedGraph();
    for (const node of data.nodes) {
      graph.addNode(node);
    }
    for (const edge of data.edges) {
      graph.addEdge(edge);
    }
    return graph;
  }
}
