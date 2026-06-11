import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrLocal } from '@/lib/crm/auth';
import { withIdempotency } from '@/lib/with-idempotency';
import { logAudit } from '@/lib/crm/audit';
import { generateId } from '@/lib/ulid';

/**
 * POST /api/crm/suggested-ties
 *
 * Records a human decision on a link-prediction "probably knows" suggestion.
 *
 * Body: { action: 'confirm' | 'dismiss', a, b, reason? }
 *
 * - confirm:  writes a person↔person network_connection (INFERRED_CONFIRMED,
 *             priority 5, evidence.method = 'link_prediction') AND records the
 *             decision so it leaves the queue.
 * - dismiss:  records a 'dismissed' decision so the pair never resurfaces.
 *
 * Both decisions upsert into suggested_tie_decisions keyed on the unordered
 * (a, b) pair, so a re-submit is harmless. Idempotent on Idempotency-Key.
 */
export const POST = withIdempotency(async (request: Request) => {
  const denied = await requireAdminOrLocal();
  if (denied) return denied;

  const body = await request.json();
  const action = body.action;
  const a: string | null = typeof body.a === 'string' ? body.a : null;
  const b: string | null = typeof body.b === 'string' ? body.b : null;
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null;
  const author = typeof body.author === 'string' && body.author.trim() ? body.author.trim() : 'analyst';

  if (action !== 'confirm' && action !== 'dismiss') {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: "action must be 'confirm' or 'dismiss'" } },
      { status: 400 },
    );
  }
  if (!a || !b || a === b) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Provide two distinct entity ids a and b' } },
      { status: 400 },
    );
  }

  const supabase = getAdminClient();
  const decision = action === 'confirm' ? 'confirmed' : 'dismissed';
  // Store the pair in a canonical order so the unique(entity_a, entity_b)
  // constraint dedupes regardless of which way the UI sent it.
  const [lo, hi] = a < b ? [a, b] : [b, a];

  const { error: decisionErr } = await supabase
    .from('suggested_tie_decisions')
    .upsert(
      { decision_id: generateId(), entity_a: lo, entity_b: hi, decision, reason, author },
      { onConflict: 'entity_a,entity_b' },
    );
  if (decisionErr) {
    return NextResponse.json({ error: { code: 'INSERT_FAILED', message: decisionErr.message } }, { status: 500 });
  }

  let connectionId: string | null = null;
  if (action === 'confirm') {
    connectionId = generateId();
    const { error: connErr } = await supabase.from('network_connections').insert({
      connection_id: connectionId,
      source_entity_id: a,
      connected_entity_id: b,
      connection_type: 'INFERRED_CONFIRMED',
      priority: 5,
      evidence: { method: 'link_prediction', confirmed_by: author, reason },
    });
    // A duplicate connection (the tie already exists under this type/org) is not
    // a failure — the decision is still recorded. Surface any other error.
    if (connErr && !/duplicate key|unique/i.test(connErr.message)) {
      return NextResponse.json({ error: { code: 'INSERT_FAILED', message: connErr.message } }, { status: 500 });
    }
    if (connErr) connectionId = null;
  }

  await logAudit(supabase, `suggested_tie.${action}`, `pair:${lo}|${hi}`, {
    a, b, decision, reason, connection_id: connectionId,
  }, author);

  return NextResponse.json({ ok: true, decision, connection_id: connectionId });
});
