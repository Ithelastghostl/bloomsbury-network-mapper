/**
 * Dossier types per PRD §18.7 — Candidate Dossier structure.
 * One dossier per candidate recommendation.
 */

/** A single path from seed to candidate with scoring detail. */
export interface DossierPath {
  /** Ordered node IDs (seed first, candidate last). */
  nodes: string[];
  /** Human-readable description with weight. */
  description: string;
  /** Path score from §16.2. */
  score: number;
  /** Template that matched (null if no match). */
  templateId: string | null;
  templateName: string | null;
}

/** Evidence table row per §18.7. */
export interface DossierEvidence {
  claim: string;
  evidenceSpan: string;
  sourceDocument: string;
  documentId: string;
  confidence: number;
}

/** Known role/affiliation row per §18.7. */
export interface DossierRole {
  entity: string;
  entityId: string;
  role: string;
  start: string | null;
  end: string | null;
  confidence: number;
}

/** Enrichment signal row per §18.7. */
export interface DossierEnrichmentSignal {
  source: string;
  signal: string;
  matchConfidence: number;
  freshness: string;
}

/** Identity resolution note per §18.7. */
export interface DossierIdentityNotes {
  possibleDuplicates: string[];
  conflictingData: string[];
  missingData: string[];
  underlyingMentions: string[];
  clusterConfidence: number | null;
  decisionStatus: string | null;
}

/** Priority score breakdown per §18.1, R5.1, R5.2. */
export interface PriorityScoreBreakdown {
  total: number;
  introability: number;
  affinity: number;
  capacitySignal: number;
  influence: number;
  strategicFit: number;
}

/** Evidence confidence score breakdown per §18.2, R5.1, R5.2. */
export interface ConfidenceScoreBreakdown {
  total: number;
  identityConfidence: number;
  relationshipConfidence: number;
  sourceCorroboration: number;
  freshness: number;
}

/** Reviewer decision state per §18.7. */
export interface DossierDecision {
  status: string;
  notes: string | null;
  outcome: string | null;
  identityDecision: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
}

/** Introduction angle per §18.8, R5.3, R5.4. */
export interface DossierIntroAngle {
  skeleton: string;
  natural: string | null;
  recommendedIntroducer: string | null;
  recommendedIntroducerId: string | null;
}

/** Full candidate dossier per §18.7. */
export interface Dossier {
  candidateRecommendationId: string;
  runId: string;

  /** Summary section. */
  candidateName: string;
  candidateEntityId: string;
  candidateType: string;
  priorityScore: PriorityScoreBreakdown;
  confidenceScore: ConfidenceScoreBreakdown;
  aggregatedMentions: number;
  reasonCodes: string[];

  /** Recommended introducer and angle per R5.3, R5.4. */
  introAngle: DossierIntroAngle;

  /** Discovery paths (why surfaced). */
  paths: DossierPath[];
  sharedAffiliations: string[];
  discoveryMethods: string[];

  /** Strongest and shortest path per R5.4. */
  strongestPath: DossierPath | null;
  shortestPath: DossierPath | null;

  /** Evidence table. */
  evidence: DossierEvidence[];

  /** Known roles and affiliations. */
  roles: DossierRole[];

  /** Enrichment signals. */
  enrichmentSignals: DossierEnrichmentSignal[];

  /** Identity resolution notes. */
  identityNotes: DossierIdentityNotes;

  /** Reviewer decision panel. */
  decision: DossierDecision | null;
  identityWarnings: string[];
}
