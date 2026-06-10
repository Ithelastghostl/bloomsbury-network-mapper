import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrLocal } from '@/lib/crm/auth';
import { logAudit } from '@/lib/crm/audit';

/**
 * POST — exclude an entity from lead generation (writes known_contacts with
 * exclude_as_candidate so the decision survives recomputes and re-ingests).
 * DELETE — restore the entity as a candidate.
 */
export async function POST(request: Request, { params }: { params: Promise<{ canonical_entity_id: string }> }) {
  const denied = await requireAdminOrLocal();
  if (denied) return denied;
  const { canonical_entity_id } = await params;
  const body = await request.json().catch(() => ({}));
  const supabase = getAdminClient();

  const { error } = await supabase.from('known_contacts').upsert({
    canonical_entity_id,
    added_by: typeof body.author === 'string' && body.author.trim() ? body.author.trim() : 'analyst',
    source: typeof body.source === 'string' && body.source.trim() ? body.source.trim() : 'lead_dedup',
    exclude_as_candidate: true,
    available_as_introducer: body.available_as_introducer ?? true,
  }, { onConflict: 'canonical_entity_id' });

  if (error) {
    return NextResponse.json({ error: { code: 'UPSERT_FAILED', message: error.message } }, { status: 500 });
  }

  await logAudit(supabase, 'lead.exclude', `entity:${canonical_entity_id}`, {
    entity_id: canonical_entity_id,
    reason: body.reason ?? null,
    source: body.source ?? 'lead_dedup',
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ canonical_entity_id: string }> }) {
  const denied = await requireAdminOrLocal();
  if (denied) return denied;
  const { canonical_entity_id } = await params;
  const supabase = getAdminClient();

  const { error } = await supabase.from('known_contacts').delete().eq('canonical_entity_id', canonical_entity_id);
  if (error) {
    return NextResponse.json({ error: { code: 'DELETE_FAILED', message: error.message } }, { status: 500 });
  }

  await logAudit(supabase, 'lead.restore', `entity:${canonical_entity_id}`, { entity_id: canonical_entity_id });
  return NextResponse.json({ ok: true });
}
