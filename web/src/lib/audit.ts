/**
 * Audit logging for admin actions.
 * PRD ref: §24 — all admin actions logged in audit_log table.
 *
 * Covers: pipeline runs, retries, rollbacks, user management,
 * config promotions, and role-specific actions for
 * product_owner and engineering_admin.
 */

import { createClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/ulid';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

/** Actions that are audit-logged per §24 role requirements. */
export type AuditAction =
  // admin actions
  | 'pipeline_run_started'
  | 'pipeline_run_cancelled'
  | 'pipeline_phase_retried'
  | 'pipeline_run_rolled_back'
  | 'user_created'
  | 'user_updated'
  | 'user_deactivated'
  | 'data_exported'
  // product_owner actions
  | 'icp_config_updated'
  | 'scoring_config_proposed'
  // engineering_admin actions
  | 'scoring_config_promoted'
  | 'prompt_version_promoted'
  | 'schema_version_promoted'
  | 'pipeline_run_rollback_approved'
  // reviewer actions (identity)
  | 'identity_merge_suggested'
  | 'identity_split_suggested'
  | 'identity_merge_approved'
  | 'identity_split_approved'
  // budget
  | 'budget_approved';

export interface AuditEntry {
  log_id: string;
  actor: string;
  action: AuditAction;
  payload: Record<string, unknown>;
  created_at: string;
}

// -------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------

/**
 * Write an audit log entry to app.audit_log.
 *
 * @param actor - User ID or system identifier performing the action
 * @param action - The action being logged
 * @param payload - Additional context (run_id, phase, details, etc.)
 */
export async function writeAuditLog(
  actor: string,
  action: AuditAction,
  payload: Record<string, unknown>,
): Promise<AuditEntry> {
  const supabase = await createClient();
  const logId = generateId();
  const now = new Date().toISOString();

  const entry: AuditEntry = {
    log_id: logId,
    actor,
    action,
    payload,
    created_at: now,
  };

  const { error } = await supabase
    .from('audit_log')
    .insert({
      log_id: logId,
      actor,
      action,
      payload,
      created_at: now,
    });

  if (error) throw error;

  return entry;
}

/**
 * Query audit log entries, optionally filtered.
 */
export async function queryAuditLog(filters?: {
  actor?: string;
  action?: AuditAction;
  run_id?: string;
  limit?: number;
}): Promise<AuditEntry[]> {
  const supabase = await createClient();
  const limit = filters?.limit ?? 100;

  let query = supabase
    .from('audit_log')
    .select()
    .order('created_at', { ascending: false })
    .limit(limit);

  if (filters?.actor) {
    query = query.eq('actor', filters.actor);
  }
  if (filters?.action) {
    query = query.eq('action', filters.action);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []) as AuditEntry[];
}
