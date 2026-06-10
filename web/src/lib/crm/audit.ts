import { generateId } from '@/lib/ulid';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

/**
 * Write one app.audit_log row. Best-effort: an audit failure must never block
 * the action it describes, so errors are logged and swallowed.
 *
 * Convention: `resource` is `<kind>:<id>` (e.g. `entity:01H...`) so per-entity
 * history is a single .eq('resource', ...) lookup.
 */
export async function logAudit(
  supabase: SupabaseClient,
  action: string,
  resource: string,
  payload: Record<string, unknown> = {},
  userId = 'analyst',
): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    log_id: generateId(),
    user_id: userId,
    action,
    resource,
    payload,
  });
  if (error) console.error(`audit_log write failed (${action} ${resource}): ${error.message}`);
}
