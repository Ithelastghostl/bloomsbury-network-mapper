import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrLocal } from '@/lib/crm/auth';
import { logAudit } from '@/lib/crm/audit';

export async function PATCH(request: Request, { params }: { params: Promise<{ note_id: string }> }) {
  const denied = await requireAdminOrLocal();
  if (denied) return denied;
  const { note_id } = await params;
  const body = await request.json();
  const supabase = getAdminClient();

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.body === 'string') update.body = body.body.trim();
  if (typeof body.pinned === 'boolean') update.pinned = body.pinned;

  const { data, error } = await supabase
    .from('entity_notes')
    .update(update)
    .eq('note_id', note_id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: { code: 'UPDATE_FAILED', message: error?.message ?? 'Note not found' } }, { status: error ? 500 : 404 });
  }

  await logAudit(supabase, 'entity_note.update', `entity:${data.entity_id}`, { note_id, pinned: data.pinned });
  return NextResponse.json({ ok: true, note: data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ note_id: string }> }) {
  const denied = await requireAdminOrLocal();
  if (denied) return denied;
  const { note_id } = await params;
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('entity_notes')
    .delete()
    .eq('note_id', note_id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: { code: 'DELETE_FAILED', message: error?.message ?? 'Note not found' } }, { status: error ? 500 : 404 });
  }

  await logAudit(supabase, 'entity_note.delete', `entity:${data.entity_id}`, { note_id });
  return NextResponse.json({ ok: true });
}
