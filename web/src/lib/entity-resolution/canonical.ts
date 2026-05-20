/**
 * Canonical entity mapping (F6.1-T6).
 *
 * Maps identity clusters to canonical entities in app.canonical_entities.
 * Preserves canonical_entity_id across re-runs (R2.9) by using
 * deterministic ID generation based on cluster signature.
 *
 * PRD refs: §11.1 (canonical_entities table), §15.1 (identity layers),
 *           R2.2, R2.9
 */

import type { EntityMention, CanonicalEntity, IdentityCluster } from '@/types/database';
import type { ClusterRecord } from './clustering';
import { generateId } from '@/lib/ulid';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface CanonicalMappingResult {
  canonicalEntities: CanonicalEntity[];
  identityClusters: IdentityCluster[];
}

export interface ExistingCanonicalLookup {
  /** Map from sorted member_mention_ids key to existing canonical_entity_id. */
  byMemberKey: Map<string, string>;
  /** Map from canonical_entity_id to existing CanonicalEntity. */
  byId: Map<string, CanonicalEntity>;
}

// -------------------------------------------------------------------
// Deterministic ID generation
// -------------------------------------------------------------------

/**
 * Generate a deterministic cluster signature from sorted member mention IDs.
 * This is used to match clusters across re-runs for canonical ID stability (R2.9).
 */
export function clusterSignature(memberMentionIds: string[]): string {
  return [...memberMentionIds].sort().join('|');
}

/**
 * Build a lookup from existing identity clusters for canonical ID preservation.
 */
export function buildExistingLookup(
  existingClusters: IdentityCluster[],
  existingEntities: CanonicalEntity[],
): ExistingCanonicalLookup {
  const byMemberKey = new Map<string, string>();
  const byId = new Map<string, CanonicalEntity>();

  for (const c of existingClusters) {
    const key = clusterSignature(c.member_mention_ids);
    byMemberKey.set(key, c.canonical_entity_id);
  }

  for (const e of existingEntities) {
    byId.set(e.canonical_entity_id, e);
  }

  return { byMemberKey, byId };
}

// -------------------------------------------------------------------
// Display name selection
// -------------------------------------------------------------------

/**
 * Select the best display name from cluster members.
 * Prefers: longest normalised name, or highest extraction confidence.
 */
export function selectDisplayName(
  members: EntityMention[],
): string {
  if (members.length === 0) return 'Unknown';
  if (members.length === 1) return members[0].normalised_value;

  // Sort by extraction confidence desc, then normalised_value length desc
  const sorted = [...members].sort((a, b) => {
    const confDiff = b.extraction_confidence - a.extraction_confidence;
    if (Math.abs(confDiff) > 0.001) return confDiff;
    return b.normalised_value.length - a.normalised_value.length;
  });

  return sorted[0].normalised_value;
}

/**
 * Merge attributes from all cluster members.
 * Collects unique values for array fields, keeps the most-populated record for others.
 */
export function mergeAttributes(
  members: EntityMention[],
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  const arrayKeys = new Set<string>();

  for (const m of members) {
    const attrs = m.attributes as Record<string, unknown>;
    for (const [key, val] of Object.entries(attrs)) {
      if (Array.isArray(val)) {
        arrayKeys.add(key);
        const existing = (merged[key] as string[] | undefined) ?? [];
        const combined = new Set([
          ...existing,
          ...val.filter((v): v is string => typeof v === 'string'),
        ]);
        merged[key] = [...combined];
      } else if (val !== undefined && val !== null && val !== '') {
        // Keep first non-empty value
        if (merged[key] === undefined) {
          merged[key] = val;
        }
      }
    }
  }

  return merged;
}

// -------------------------------------------------------------------
// Canonical ID resolution
// -------------------------------------------------------------------

/**
 * Resolve the canonical_entity_id for a cluster.
 *
 * Strategy for ID stability (R2.9):
 * 1. If the exact same set of member mentions was clustered before,
 *    reuse the existing canonical_entity_id.
 * 2. If any subset of members was previously mapped, reuse the
 *    canonical_entity_id of the largest overlapping prior cluster.
 * 3. Otherwise, generate a new ULID.
 */
export function resolveCanonicalId(
  cluster: ClusterRecord,
  lookup: ExistingCanonicalLookup,
): string {
  // Strategy 1: exact match on member signature
  const sig = clusterSignature(cluster.member_mention_ids);
  const exact = lookup.byMemberKey.get(sig);
  if (exact) return exact;

  // Strategy 2: find largest overlapping prior cluster
  let bestOverlap = 0;
  let bestId: string | undefined;

  for (const [key, canonId] of lookup.byMemberKey) {
    const priorMembers = new Set(key.split('|'));
    let overlap = 0;
    for (const mid of cluster.member_mention_ids) {
      if (priorMembers.has(mid)) overlap++;
    }
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestId = canonId;
    }
  }

  if (bestId && bestOverlap > 0) return bestId;

  // Strategy 3: new ID
  return generateId();
}

// -------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------

/**
 * Map clusters to canonical entities, preserving IDs across re-runs.
 *
 * @param clusters - The cluster records from the clustering step
 * @param mentions - All entity mentions (for display name and attribute merging)
 * @param runId - Current run ID
 * @param existingClusters - Prior identity_clusters from previous runs
 * @param existingEntities - Prior canonical_entities from previous runs
 */
export function mapClustersToCanonical(
  clusters: ClusterRecord[],
  mentions: EntityMention[],
  runId: string,
  existingClusters: IdentityCluster[] = [],
  existingEntities: CanonicalEntity[] = [],
): CanonicalMappingResult {
  const lookup = buildExistingLookup(existingClusters, existingEntities);
  const mentionMap = new Map<string, EntityMention>();
  for (const m of mentions) {
    mentionMap.set(m.entity_mention_id, m);
  }

  const canonicalEntities: CanonicalEntity[] = [];
  const identityClusters: IdentityCluster[] = [];

  for (const cluster of clusters) {
    const canonicalId = resolveCanonicalId(cluster, lookup);

    // Gather member mentions
    const members = cluster.member_mention_ids
      .map((id) => mentionMap.get(id))
      .filter((m): m is EntityMention => m !== undefined);

    const displayName = selectDisplayName(members);
    const mergedAttrs = mergeAttributes(members);

    // Check if canonical entity already exists
    const existing = lookup.byId.get(canonicalId);

    const canonicalEntity: CanonicalEntity = {
      canonical_entity_id: canonicalId,
      entity_type: cluster.entity_type,
      display_name: displayName,
      first_seen_run_id: existing?.first_seen_run_id ?? runId,
      last_seen_run_id: runId,
      attributes: mergedAttrs,
      source: 'corpus',
    };

    const identityCluster: IdentityCluster = {
      cluster_id: cluster.cluster_id,
      canonical_entity_id: canonicalId,
      run_id: runId,
      entity_type: cluster.entity_type,
      member_mention_ids: cluster.member_mention_ids,
      cluster_confidence: cluster.cluster_confidence,
      decision_status: cluster.decision_status,
      created_by: cluster.created_by,
      created_at: new Date().toISOString(),
    };

    canonicalEntities.push(canonicalEntity);
    identityClusters.push(identityCluster);
  }

  return { canonicalEntities, identityClusters };
}
