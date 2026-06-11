import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrLocal } from '@/lib/crm/auth';
import { logAudit } from '@/lib/crm/audit';
import { generateId } from '@/lib/ulid';

const CHUNK = 200;

/**
 * Apply or remove a single tag across many entities in one call. Inserts are
 * chunked at 200 to stay under PostgREST's large-payload cliff; the
 * (entity_id, tag) unique constraint makes re-adding a no-op.
 */
export async function POST(request: Request) {
  const denied = await requireAdminOrLocal();
  if (denied) return denied;
  const body = await request.json();
  const supabase = getAdminClient();

  const entityIds: string[] = Array.isArray(body.entity_ids)
    ? body.entity_ids.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
    : [];
  const tag = typeof body.tag === 'string' ? body.tag.trim() : '';
  const action = body.action === 'remove' ? 'remove' : 'add';
  const author = typeof body.author === 'string' && body.author.trim() ? body.author.trim() : 'analyst';

  if (!tag || entityIds.length === 0) {
    return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'entity_ids and tag are required' } }, { status: 400 });
  }

  if (action === 'add') {
    for (let i = 0; i < entityIds.length; i += CHUNK) {
      const rows = entityIds.slice(i, i + CHUNK).map(entity_id => ({
        tag_id: generateId(),
        entity_id,
        tag,
        author,
      }));
      const { error } = await supabase
        .from('entity_tags')
        .upsert(rows, { onConflict: 'entity_id,tag', ignoreDuplicates: true });
      if (error) {
        return NextResponse.json({ error: { code: 'INSERT_FAILED', message: error.message } }, { status: 500 });
      }
    }
  } else {
    for (let i = 0; i < entityIds.length; i += CHUNK) {
      const { error } = await supabase
        .from('entity_tags')
        .delete()
        .eq('tag', tag)
        .in('entity_id', entityIds.slice(i, i + CHUNK));
      if (error) {
        return NextResponse.json({ error: { code: 'DELETE_FAILED', message: error.message } }, { status: 500 });
      }
    }
  }

  await logAudit(supabase, `entity_tag.bulk_${action}`, `tag:${tag}`, {
    tag,
    action,
    count: entityIds.length,
  }, author);

  return NextResponse.json({ ok: true, tag, action, count: entityIds.length });
}
