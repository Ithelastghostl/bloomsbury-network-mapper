/**
 * Scoring config versioning and promotion gate per §23.3.
 * PRD ref: §23.3, R6.5.
 *
 * Promotion gate checks:
 * 1. Validation seed ranking quality
 * 2. False positive rate
 * 3. Top candidate explainability
 * 4. Config version and rationale recorded
 *
 * Requires human approval (product_owner or engineering_admin per §24).
 */

import { createClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/ulid';
import { writeAuditLog } from '@/lib/audit';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface ScoringConfigRecord {
  scoring_config_version: string;
  config: Record<string, unknown>;
  rationale: string;
  status: 'draft' | 'active' | 'archived';
  created_by: string;
  created_at: string;
  promoted_at: string | null;
  promoted_by: string | null;
}

export interface PromotionGateInput {
  /** Did ranking quality of validation seeds improve or stay stable? */
  ranking_quality_ok: boolean;
  /** Is the false positive rate acceptable (not materially increased)? */
  false_positive_rate_ok: boolean;
  /** Are top candidates still explainable? */
  top_candidates_explainable: boolean;
  /** Version string for the new config */
  config_version: string;
  /** Rationale for the promotion */
  rationale: string;
}

export interface PromotionGateResult {
  passed: boolean;
  failures: string[];
}

// -------------------------------------------------------------------
// Promotion gate — pure logic
// -------------------------------------------------------------------

/** Check all promotion gate conditions per §23.3. */
export function checkPromotionGate(input: PromotionGateInput): PromotionGateResult {
  const failures: string[] = [];

  if (!input.ranking_quality_ok) {
    failures.push('Validation seed ranking quality degraded');
  }
  if (!input.false_positive_rate_ok) {
    failures.push('False positive rate materially increased');
  }
  if (!input.top_candidates_explainable) {
    failures.push('Top candidates are not explainable');
  }
  if (!input.config_version) {
    failures.push('Config version is required');
  }
  if (!input.rationale) {
    failures.push('Rationale is required');
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

// -------------------------------------------------------------------
// Database operations
// -------------------------------------------------------------------

/** Create a new scoring config (draft). */
export async function createScoringConfig(
  config: Record<string, unknown>,
  rationale: string,
  createdBy: string,
): Promise<ScoringConfigRecord> {
  const supabase = await createClient();
  const version = `scoring_${generateId()}`;
  const now = new Date().toISOString();

  const record: ScoringConfigRecord = {
    scoring_config_version: version,
    config,
    rationale,
    status: 'draft',
    created_by: createdBy,
    created_at: now,
    promoted_at: null,
    promoted_by: null,
  };

  const { error } = await supabase
    .from('scoring_configs')
    .insert({
      scoring_config_version: version,
      config,
      rationale,
      status: 'draft',
      created_by: createdBy,
      created_at: now,
    });

  if (error) throw error;

  await writeAuditLog(createdBy, 'scoring_config_proposed', {
    scoring_config_version: version,
    rationale,
  });

  return record;
}

/** List scoring configs (active first, then by creation date). */
export async function listScoringConfigs(): Promise<ScoringConfigRecord[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('scoring_configs')
    .select()
    .order('promoted_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as ScoringConfigRecord[];
}

/** Promote a scoring config after gate checks pass. */
export async function promoteScoringConfig(
  configVersion: string,
  gateInput: PromotionGateInput,
  promotedBy: string,
): Promise<ScoringConfigRecord> {
  const gate = checkPromotionGate(gateInput);
  if (!gate.passed) {
    throw new PromotionGateError(gate.failures);
  }

  const supabase = await createClient();
  const now = new Date().toISOString();

  // Archive the currently active config
  await supabase
    .from('scoring_configs')
    .update({ status: 'archived' })
    .eq('status', 'active');

  // Promote the new config
  const { data, error } = await supabase
    .from('scoring_configs')
    .update({
      status: 'active',
      promoted_at: now,
      promoted_by: promotedBy,
    })
    .eq('scoring_config_version', configVersion)
    .select()
    .single();

  if (error) throw error;

  await writeAuditLog(promotedBy, 'scoring_config_promoted', {
    scoring_config_version: configVersion,
    rationale: gateInput.rationale,
    gate_checks: {
      ranking_quality_ok: gateInput.ranking_quality_ok,
      false_positive_rate_ok: gateInput.false_positive_rate_ok,
      top_candidates_explainable: gateInput.top_candidates_explainable,
    },
  });

  return data as ScoringConfigRecord;
}

// -------------------------------------------------------------------
// Error class
// -------------------------------------------------------------------

export class PromotionGateError extends Error {
  public failures: string[];
  constructor(failures: string[]) {
    super(`Promotion gate failed: ${failures.join('; ')}`);
    this.name = 'PromotionGateError';
    this.failures = failures;
  }
}
