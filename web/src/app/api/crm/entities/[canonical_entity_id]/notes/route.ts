import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrLocal } from '@/lib/crm/auth';
import { logAudit } from '@/lib/crm/audit';
import { generateId } from '@/lib/ulid';

export async function GET(_request: Request, { params }: { params: Promise<{ canonical_entity_id: string }> }) {
  const denied = await requireAdminOrLocal();
  if (denied) return denied;
  const { canonical_entity_id } = await params;
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('entity_notes')
    .select('*')
    .eq('entity_id', canonical_entity_id)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: { code: 'FETCH_FAILED', message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ notes: data ?? [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ canonical_entity_id: string }> }) {
  const denied = await requireAdminOrLocal();
  if (denied) return denied;
  const { canonical_entity_id } = await params;
  const body = await request.json();
  const supabase = getAdminClient();

  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (!text) {
    return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Note body is required' } }, { status: 400 });
  }

  const note = {
    note_id: generateId(),
    entity_id: canonical_entity_id,
    author: typeof body.author === 'string' && body.author.trim() ? body.author.trim() : 'analyst',
    body: text,
    pinned: !!body.pinned,
  };

  const { data, error } = await supabase.from('entity_notes').insert(note).select().single();
  if (error) {
    return NextResponse.json({ error: { code: 'INSERT_FAILED', message: error.message } }, { status: 500 });
  }

  await logAudit(supabase, 'entity_note.create', `entity:${canonical_entity_id}`, {
    entity_id: canonical_entity_id,
    note_id: note.note_id,
  }, note.author);

  return NextResponse.json({ ok: true, note: data });
}
