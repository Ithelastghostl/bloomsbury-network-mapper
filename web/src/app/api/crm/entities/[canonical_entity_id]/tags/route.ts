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
    .from('entity_tags')
    .select('*')
    .eq('entity_id', canonical_entity_id)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: { code: 'FETCH_FAILED', message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ tags: data ?? [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ canonical_entity_id: string }> }) {
  const denied = await requireAdminOrLocal();
  if (denied) return denied;
  const { canonical_entity_id } = await params;
  const body = await request.json();
  const supabase = getAdminClient();

  const tag = typeof body.tag === 'string' ? body.tag.trim() : '';
  if (!tag) {
    return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Tag is required' } }, { status: 400 });
  }

  const row = {
    tag_id: generateId(),
    entity_id: canonical_entity_id,
    tag,
    author: typeof body.author === 'string' && body.author.trim() ? body.author.trim() : 'analyst',
  };

  // Ignore duplicates: the (entity_id, tag) unique constraint makes re-adding a
  // no-op, so the caller can be optimistic without first checking existence.
  const { data, error } = await supabase
    .from('entity_tags')
    .upsert(row, { onConflict: 'entity_id,tag', ignoreDuplicates: true })
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: { code: 'INSERT_FAILED', message: error.message } }, { status: 500 });
  }

  // On an ignored duplicate, upsert returns no row; fetch the existing one so the
  // client always gets the canonical tag back.
  let tagRow = data;
  if (!tagRow) {
    const { data: existing } = await supabase
      .from('entity_tags')
      .select('*')
      .eq('entity_id', canonical_entity_id)
      .eq('tag', tag)
      .maybeSingle();
    tagRow = existing;
  }

  await logAudit(supabase, 'entity_tag.create', `entity:${canonical_entity_id}`, {
    entity_id: canonical_entity_id,
    tag,
  }, row.author);

  return NextResponse.json({ ok: true, tag: tagRow });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ canonical_entity_id: string }> }) {
  const denied = await requireAdminOrLocal();
  if (denied) return denied;
  const { canonical_entity_id } = await params;
  const supabase = getAdminClient();

  const tag = new URL(request.url).searchParams.get('tag')?.trim() ?? '';
  if (!tag) {
    return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'tag query parameter is required' } }, { status: 400 });
  }

  const { error } = await supabase
    .from('entity_tags')
    .delete()
    .eq('entity_id', canonical_entity_id)
    .eq('tag', tag);

  if (error) {
    return NextResponse.json({ error: { code: 'DELETE_FAILED', message: error.message } }, { status: 500 });
  }

  await logAudit(supabase, 'entity_tag.delete', `entity:${canonical_entity_id}`, {
    entity_id: canonical_entity_id,
    tag,
  });

  return NextResponse.json({ ok: true });
}
