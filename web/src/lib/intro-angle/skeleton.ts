/**
 * Deterministic skeleton generation for introduction angles.
 * PRD ref: §18.8 steps 1-2 — generate from strongest evidence-backed path.
 *
 * CRITICAL: skeleton uses ONLY path facts. NO hallucinated content.
 *
 * Template: "You share [relationship] through [entity].
 * [Candidate] served as [role] at [org] from [date] to [date]..."
 */

export interface SkeletonInput {
  seedName: string;
  candidateName: string;
  /** Ordered node IDs of the strongest path (seed first, candidate last). */
  pathNodes: string[];
  /** Map entity IDs to display names. */
  entityNames: Record<string, string>;
  /** Known roles from the evidence for this candidate. */
  roles: Array<{
    entity: string;
    role: string;
    start: string | null;
    end: string | null;
  }>;
  /** Shared affiliations (entity names). */
  sharedAffiliations: string[];
}

/**
 * Generate a deterministic skeleton introduction angle.
 * Uses only facts from the input -- never fabricates.
 */
export function generateSkeleton(input: SkeletonInput): string {
  const {
    seedName,
    candidateName,
    pathNodes,
    entityNames,
    roles,
    sharedAffiliations,
  } = input;

  if (pathNodes.length < 2) {
    return `${candidateName} was surfaced as a candidate near ${seedName}.`;
  }

  const parts: string[] = [];

  // 1. Connection sentence from path intermediaries
  const intermediaries = pathNodes
    .slice(1, -1)
    .map((id) => entityNames[id] ?? id);

  if (intermediaries.length > 0) {
    parts.push(
      `${candidateName} appears connected to ${seedName} through shared involvement with ${intermediaries.join(' and ')}.`,
    );
  } else {
    parts.push(
      `${candidateName} has a direct connection to ${seedName}.`,
    );
  }

  // 2. Role sentences — only from evidence
  for (const role of roles) {
    const dateRange = formatDateRange(role.start, role.end);
    parts.push(
      `${candidateName} has served as ${role.role} at ${role.entity}${dateRange}.`,
    );
  }

  // 3. Shared affiliation sentences
  if (sharedAffiliations.length > 0 && intermediaries.length === 0) {
    parts.push(
      `They share affiliation with ${sharedAffiliations.join(', ')}.`,
    );
  }

  return parts.join(' ');
}

function formatDateRange(
  start: string | null,
  end: string | null,
): string {
  if (start && end) return ` from ${start} to ${end}`;
  if (start) return ` since ${start}`;
  if (end) return ` until ${end}`;
  return '';
}
