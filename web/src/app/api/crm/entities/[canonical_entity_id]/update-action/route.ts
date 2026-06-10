import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrLocal } from '@/lib/crm/auth';
import { logAudit } from '@/lib/crm/audit';
import { generateId } from '@/lib/ulid';

/** Valid action-item workflow statuses. */
const VALID_STATUSES = new Set(['new', 'outreach', 'contacted', 'information_needed', 'deferred', 'won', 'lost']);
/** Statuses that represent an introduction outcome worth recording (§ intro_outcomes). */
const OUTCOME_STATUSES = new Set(['contacted', 'won', 'lost']);

export async function POST(request: Request, { params }: { params: Promise<{ canonical_entity_id: string }> }) {
  const denied = await requireAdminOrLocal();
  if (denied) return denied;
  const { canonical_entity_id } = await params;
  const body = await request.json();
  const supabase = getAdminClient();

  if (body.status !== undefined && !VALID_STATUSES.has(body.status)) {
    return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Invalid status' } }, { status: 400 });
  }

  const { data: entity, error: fetchErr } = await supabase
    .from('canonical_entities')
    .select('display_name, attributes')
    .eq('canonical_entity_id', canonical_entity_id)
    .single();

  if (fetchErr || !entity) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attrs = { ...(entity.attributes as Record<string, any> ?? {}) };
  if (!attrs.action_item) {
    return NextResponse.json({ error: { code: 'NO_ACTION', message: 'No action item on this entity' } }, { status: 400 });
  }

  const prevStatus = attrs.action_item.status as string;
  const changes: Record<string, unknown> = {};
  // Coerce to primitives so a malformed body can't store objects in the jsonb.
  if (body.status) { attrs.action_item.status = String(body.status); changes.status = { from: prevStatus, to: body.status }; }
  if (body.notes !== undefined) { attrs.action_item.notes = body.notes == null ? '' : String(body.notes); changes.notes = true; }
  if (body.assignee !== undefined) { attrs.action_item.assignee = body.assignee == null ? null : String(body.assignee); changes.assignee = attrs.action_item.assignee; }
  attrs.action_item.updated_at = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from('canonical_entities')
    .update({ attributes: attrs })
    .eq('canonical_entity_id', canonical_entity_id);

  if (updateErr) {
    return NextResponse.json({ error: { code: 'UPDATE_FAILED', message: updateErr.message } }, { status: 500 });
  }

  await logAudit(supabase, 'action_item.update', `entity:${canonical_entity_id}`, {
    entity_id: canonical_entity_id,
    entity_name: entity.display_name,
    ...changes,
  });

  // Record an introduction outcome the first time the action reaches a terminal
  // contact status, so conversion can be reported per supporter / method later.
  if (body.status && OUTCOME_STATUSES.has(body.status) && body.status !== prevStatus) {
    const { error: outcomeErr } = await supabase.from('intro_outcomes').insert({
      intro_outcome_id: generateId(),
      entity_id: canonical_entity_id,
      intro_status: body.status,
      converted: body.status === 'won' ? true : body.status === 'lost' ? false : null,
      notes: attrs.action_item.notes || null,
      recorded_by: attrs.action_item.assignee || 'analyst',
    });
    if (outcomeErr) console.error(`intro_outcomes insert failed: ${outcomeErr.message}`);
  }

  return NextResponse.json({ ok: true });
}
