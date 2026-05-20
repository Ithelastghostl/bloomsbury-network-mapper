/**
 * Match confidence formula (F6.1-T1).
 *
 * Computes pairwise match confidence between two entity mentions.
 * Formula from PRD §15.3:
 *
 *   match_confidence =
 *     0.30 x name_similarity (pg_trgm trigram)
 *   + 0.25 x embedding_similarity (pgvector cosine)
 *   + 0.20 x shared_organisation_score
 *   + 0.15 x shared_address_score
 *   + 0.10 x role_overlap_score
 *
 * Weights are configurable via scoring_configs table (§11.1).
 */

import type { EntityMention } from '@/types/database';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

/** Individual signal scores feeding into match confidence. */
export interface MatchSignals {
  name_similarity: number;
  embedding_similarity: number;
  shared_organisation: number;
  shared_address: number;
  role_overlap: number;
}

/** Weights for each signal. Defaults from PRD §15.3. */
export interface MatchWeights {
  name_similarity: number;
  embedding_similarity: number;
  shared_organisation: number;
  shared_address: number;
  role_overlap: number;
}

export interface MatchConfidenceResult {
  confidence: number;
  signals: MatchSignals;
  weights: MatchWeights;
}

// -------------------------------------------------------------------
// Default weights from PRD §15.3
// -------------------------------------------------------------------

export const DEFAULT_MATCH_WEIGHTS: MatchWeights = {
  name_similarity: 0.30,
  embedding_similarity: 0.25,
  shared_organisation: 0.20,
  shared_address: 0.15,
  role_overlap: 0.10,
};

// -------------------------------------------------------------------
// Signal computation helpers
// -------------------------------------------------------------------

/**
 * Trigram similarity approximation.
 * In production this calls pg_trgm's similarity() via SQL.
 * This pure-JS version is used for in-process scoring and tests.
 */
export function trigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const aNorm = a.toLowerCase().trim();
  const bNorm = b.toLowerCase().trim();
  if (aNorm === bNorm) return 1;
  if (aNorm.length === 0 || bNorm.length === 0) return 0;

  const trigramsA = extractTrigrams(aNorm);
  const trigramsB = extractTrigrams(bNorm);

  if (trigramsA.size === 0 && trigramsB.size === 0) {
    // Both strings shorter than 3 chars — fall back to exact match
    return aNorm === bNorm ? 1 : 0;
  }

  let intersection = 0;
  for (const t of trigramsA) {
    if (trigramsB.has(t)) intersection++;
  }

  const union = trigramsA.size + trigramsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Extract trigrams from a string, matching pg_trgm behaviour (pad with spaces). */
function extractTrigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const trigrams = new Set<string>();
  for (let i = 0; i <= padded.length - 3; i++) {
    trigrams.add(padded.slice(i, i + 3));
  }
  return trigrams;
}

/**
 * Cosine similarity between two embedding vectors.
 * Returns 0 if either is null/empty.
 */
export function cosineSimilarity(
  a: number[] | null,
  b: number[] | null,
): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dotProduct / denom;
}

/**
 * Compute shared organisation score.
 * Returns 1.0 if mentions share at least one organisation, 0.0 otherwise.
 */
export function sharedOrganisationScore(
  mentionA: EntityMention,
  mentionB: EntityMention,
): number {
  const orgsA = extractOrganisations(mentionA);
  const orgsB = extractOrganisations(mentionB);
  if (orgsA.size === 0 || orgsB.size === 0) return 0;

  for (const org of orgsA) {
    if (orgsB.has(org)) return 1;
  }
  return 0;
}

/**
 * Compute shared address score.
 * Returns 1.0 if mentions share a normalised address or postcode, 0.0 otherwise.
 */
export function sharedAddressScore(
  mentionA: EntityMention,
  mentionB: EntityMention,
): number {
  const addrsA = extractAddresses(mentionA);
  const addrsB = extractAddresses(mentionB);
  if (addrsA.size === 0 || addrsB.size === 0) return 0;

  for (const addr of addrsA) {
    if (addrsB.has(addr)) return 1;
  }
  return 0;
}

/**
 * Compute role overlap score.
 * Returns fraction of shared roles (intersection / union), i.e. Jaccard index.
 */
export function roleOverlapScore(
  mentionA: EntityMention,
  mentionB: EntityMention,
): number {
  const rolesA = extractRoles(mentionA);
  const rolesB = extractRoles(mentionB);
  if (rolesA.size === 0 && rolesB.size === 0) return 0;

  let intersection = 0;
  for (const r of rolesA) {
    if (rolesB.has(r)) intersection++;
  }

  const union = rolesA.size + rolesB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// -------------------------------------------------------------------
// Attribute extraction helpers
// -------------------------------------------------------------------

function extractOrganisations(mention: EntityMention): Set<string> {
  const orgs = new Set<string>();
  const attrs = mention.attributes as Record<string, unknown>;
  const orgList = attrs?.organisations ?? attrs?.organizations;
  if (Array.isArray(orgList)) {
    for (const o of orgList) {
      if (typeof o === 'string') orgs.add(o.toLowerCase().trim());
    }
  }
  if (typeof attrs?.organisation === 'string') {
    orgs.add(attrs.organisation.toLowerCase().trim());
  }
  if (typeof attrs?.organization === 'string') {
    orgs.add(attrs.organization.toLowerCase().trim());
  }
  return orgs;
}

function extractAddresses(mention: EntityMention): Set<string> {
  const addrs = new Set<string>();
  const attrs = mention.attributes as Record<string, unknown>;
  if (typeof attrs?.address === 'string') {
    addrs.add(attrs.address.toLowerCase().trim());
  }
  if (typeof attrs?.postcode === 'string') {
    addrs.add(attrs.postcode.toLowerCase().replace(/\s+/g, ''));
  }
  const addrList = attrs?.addresses;
  if (Array.isArray(addrList)) {
    for (const a of addrList) {
      if (typeof a === 'string') addrs.add(a.toLowerCase().trim());
    }
  }
  return addrs;
}

function extractRoles(mention: EntityMention): Set<string> {
  const roles = new Set<string>();
  const attrs = mention.attributes as Record<string, unknown>;
  const roleList = attrs?.roles;
  if (Array.isArray(roleList)) {
    for (const r of roleList) {
      if (typeof r === 'string') roles.add(r.toLowerCase().trim());
    }
  }
  if (typeof attrs?.role === 'string') {
    roles.add(attrs.role.toLowerCase().trim());
  }
  return roles;
}

// -------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------

/**
 * Compute all match signals between two entity mentions.
 */
export function computeSignals(
  mentionA: EntityMention,
  mentionB: EntityMention,
): MatchSignals {
  return {
    name_similarity: trigramSimilarity(
      mentionA.normalised_value,
      mentionB.normalised_value,
    ),
    embedding_similarity: cosineSimilarity(
      mentionA.embedding,
      mentionB.embedding,
    ),
    shared_organisation: sharedOrganisationScore(mentionA, mentionB),
    shared_address: sharedAddressScore(mentionA, mentionB),
    role_overlap: roleOverlapScore(mentionA, mentionB),
  };
}

/**
 * Compute match confidence between two entity mentions.
 *
 * PRD §15.3:
 *   match_confidence =
 *     0.30 x name_similarity
 *   + 0.25 x embedding_similarity
 *   + 0.20 x shared_organisation_score
 *   + 0.15 x shared_address_score
 *   + 0.10 x role_overlap_score
 */
export function computeMatchConfidence(
  mentionA: EntityMention,
  mentionB: EntityMention,
  weights: MatchWeights = DEFAULT_MATCH_WEIGHTS,
): MatchConfidenceResult {
  const signals = computeSignals(mentionA, mentionB);

  const confidence = clamp01(
    weights.name_similarity * signals.name_similarity +
    weights.embedding_similarity * signals.embedding_similarity +
    weights.shared_organisation * signals.shared_organisation +
    weights.shared_address * signals.shared_address +
    weights.role_overlap * signals.role_overlap,
  );

  return { confidence, signals, weights };
}

/** Clamp to [0, 1]. */
function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
