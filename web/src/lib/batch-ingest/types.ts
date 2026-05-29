import type { WealthBand } from '@/lib/enrichment/types';

/** Core fields present in every agent output JSON block */
export interface ParsedAgentOutput {
  seed_name: string;
  directorships: ParsedDirectorship[];
  co_directors: ParsedCoDirector[];
  wealth_signals: string[];
  philanthropy: string[];
  relationships_found: string[];
  family_connections?: string[];
}

export interface ParsedDirectorship {
  company_name: string;
  company_number?: string;
  role: string;
  status?: string;
  appointed?: string;
  resigned?: string;
  appointed_on?: string;
  resigned_on?: string;
}

export interface ParsedCoDirector {
  name: string;
  company_name?: string;
  companies?: string[];
  role?: string;
  note?: string;
}

export interface IngestResult {
  runId: string;
  seedsProcessed: number;
  seedsSucceeded: number;
  seedsFailed: number;
  entitiesCreated: number;
  entitiesReused: number;
  connectionsCreated: number;
  coDirectorEdgesCreated: number;
  wealthEstimatesCreated: number;
  evidenceRecordsCreated: number;
  errors: Array<{ seedName: string; error: string }>;
}

export interface SeedIngestResult {
  seedName: string;
  seedEntityId: string;
  entitiesCreated: number;
  entitiesReused: number;
  connectionsCreated: number;
  coDirectorEdgesCreated: number;
  wealthEstimateCreated: boolean;
  evidenceRecordsCreated: number;
}

export interface ResolvedEntity {
  canonicalEntityId: string;
  displayName: string;
  entityType: string;
  isNew: boolean;
}

export interface WealthAssessmentFromSignals {
  band: WealthBand;
  score: number;
  confidence: number;
  evidence: Array<{
    signal: string;
    source_layer: 'A' | 'B' | 'C';
    contribution: number;
    detail: string;
  }>;
}
