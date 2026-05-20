/**
 * Ranking module barrel export (F9.1, F9.2).
 */

export {
  calculateCapacitySignal,
  type CapacityInput,
  type CapacitySignalResult,
  type CapacityIndicator,
  type CapacityCategory,
} from './capacity';

export {
  calculatePriorityScore,
  PRIORITY_WEIGHTS,
  type PriorityInput,
  type PriorityResult,
  type PriorityScoreBreakdown,
} from './priority';

export {
  calculateConfidenceScore,
  CONFIDENCE_WEIGHTS,
  type ConfidenceInput,
  type ConfidenceResult,
  type ConfidenceScoreBreakdown,
} from './confidence';

export {
  presentationDedup,
  confirmPresentationGroup,
  splitPresentationGroup,
  PRESENTATION_MERGE_THRESHOLD,
  type PresentationRow,
  type CandidateSimilarity,
  type PresentationDecisionResult,
} from './presentation-dedup';
