/**
 * Entity resolution module (Epic 6, Feature 6.1).
 *
 * Identity clustering engine implementing:
 * - Match confidence formula (§15.3)
 * - Decision bands (§15.2)
 * - Auto-merge blockers (§15.4)
 * - Human decision replay (§15.5)
 * - Embedding generation (ada-002)
 * - Canonical entity mapping with stable IDs (R2.9)
 */

export {
  computeMatchConfidence,
  computeSignals,
  trigramSimilarity,
  cosineSimilarity,
  sharedOrganisationScore,
  sharedAddressScore,
  roleOverlapScore,
  DEFAULT_MATCH_WEIGHTS,
  type MatchSignals,
  type MatchWeights,
  type MatchConfidenceResult,
} from './match-confidence';

export {
  classifyBand,
  checkBlockers,
  hasHumanMergeDecision,
  computePairwiseMatches,
  buildClusters,
  clusterMentions,
  BAND_THRESHOLDS,
  type DecisionBand,
  type BlockerReason,
  type PairwiseResult,
  type ClusterRecord,
  type ClusterRationale,
} from './clustering';

export {
  generateEmbeddings,
  buildEmbeddingText,
  applyEmbeddings,
  callEmbeddingApi,
  type EmbeddingOptions,
  type EmbeddingResult,
  type BatchEmbeddingResult,
} from './embeddings';

export {
  mapClustersToCanonical,
  resolveCanonicalId,
  selectDisplayName,
  mergeAttributes,
  clusterSignature,
  buildExistingLookup,
  type CanonicalMappingResult,
  type ExistingCanonicalLookup,
} from './canonical';
