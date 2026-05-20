/**
 * Manual research enrichment module (F8.4-T1).
 * Tier 3 source per PRD §17.1 — reviewer-triggered only (R4.4).
 *
 * This is not an automated source. When triggered, it sets the enrichment
 * status to `manual_required` and stores the reviewer's notes.
 * A researcher then fills in the notes field via the dossier UI.
 *
 * Per §17.1: "Tier 3 in v1 is a manual workflow surface, not an automated source."
 */

import type { CanonicalEntity } from '@/types/database';
import type {
  EnrichmentModule,
  EnrichmentSignalPayload,
} from '../types';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface ManualResearchRequest {
  /** Who triggered the research request */
  requestedBy: string;
  /** Optional notes from the reviewer about what to research */
  researchNotes?: string;
  /** Priority hint for the researcher */
  priority?: 'low' | 'medium' | 'high';
}

export interface ManualResearchResult {
  /** The researcher's findings */
  findings: string;
  /** Who completed the research */
  completedBy: string;
  /** When the research was completed */
  completedAt: string;
  /** External sources consulted */
  sourcesConsulted?: string[];
}

// -------------------------------------------------------------------
// Module
// -------------------------------------------------------------------

/**
 * Create a manual research module.
 *
 * Unlike other modules, this does not call an external API.
 * It returns a single signal with `manual_note` type and the request metadata.
 * The orchestrator will transition the status to `manual_required`.
 */
export function createManualResearchModule(
  request: ManualResearchRequest,
): EnrichmentModule {
  return {
    source: 'manual_research',
    tier: 3,

    async enrich(entity: CanonicalEntity): Promise<EnrichmentSignalPayload[]> {
      // Return a signal that marks this entity for manual research.
      // Match confidence is 0 because no automated matching was performed.
      return [
        {
          source: 'manual_research',
          signal_type: 'manual_note',
          external_record_id: `manual_${entity.canonical_entity_id}_${Date.now()}`,
          signal_payload: {
            status: 'manual_required',
            requested_by: request.requestedBy,
            research_notes: request.researchNotes ?? null,
            priority: request.priority ?? 'medium',
            entity_name: entity.display_name,
            entity_type: entity.entity_type,
          },
          match_confidence: 0,
          match_features: [],
        },
      ];
    },
  };
}

/**
 * Complete a manual research request: merge the researcher's findings
 * into the signal payload. Returns a new signal that can replace or
 * supplement the original manual_required signal.
 */
export function completeManualResearch(
  entity: CanonicalEntity,
  originalSignal: EnrichmentSignalPayload,
  result: ManualResearchResult,
): EnrichmentSignalPayload {
  return {
    ...originalSignal,
    signal_payload: {
      ...originalSignal.signal_payload,
      status: 'completed',
      findings: result.findings,
      completed_by: result.completedBy,
      completed_at: result.completedAt,
      sources_consulted: result.sourcesConsulted ?? [],
    },
    // Manual research results get a confidence of 0.90 because a human verified
    match_confidence: 0.90,
    match_features: [
      { feature: 'human_verified', weight: 1.0, score: 0.90 },
    ],
  };
}
