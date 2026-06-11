import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrLocal } from '@/lib/crm/auth';
import { logAudit } from '@/lib/crm/audit';

const CHUNK = 200;

export async function GET(_request: Request, { params }: { params: Promise<{ cohort_id: string }> }) {
  const denied = await requireAdminOrLocal();
  if (denied) return denied;
  const { cohort_id } = await params;
  const supabase = getAdminClient();

  const { data: cohort, error } = await supabase
    .from('lead_cohorts')
    .select('*')
    .eq('cohort_id', cohort_id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: { code: 'FETCH_FAILED', message: error.message } }, { status: 500 });
  }
  if (!cohort) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Cohort not found' } }, { status: 404 });
  }

  const { data: memberRows, error: memberError } = await supabase
    .from('lead_cohort_members')
    .select('entity_id, added_by, added_at')
    .eq('cohort_id', cohort_id)
    .order('added_at', { ascending: false });
  if (memberError) {
    return NextResponse.json({ error: { code: 'FETCH_FAILED', message: memberError.message } }, { status: 500 });
  }

  // Resolve display names from canonical_entities in 200-id chunks.
  const ids = ((memberRows ?? []) as Array<{ entity_id: string }>).map(m => m.entity_id);
  const nameById: Record<string, { display_name: string; entity_type: string }> = {};
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data: ents } = await supabase
      .from('canonical_entities')
      .select('canonical_entity_id, display_name, entity_type')
      .in('canonical_entity_id', ids.slice(i, i + CHUNK));
    for (const e of (ents ?? []) as Array<{ canonical_entity_id: string; display_name: string; entity_type: string }>) {
      nameById[e.canonical_entity_id] = { display_name: e.display_name, entity_type: e.entity_type };
    }
  }

  const members = ((memberRows ?? []) as Array<{ entity_id: string; added_by: string; added_at: string }>).map(m => ({
    entity_id: m.entity_id,
    display_name: nameById[m.entity_id]?.display_name ?? m.entity_id,
    entity_type: nameById[m.entity_id]?.entity_type ?? null,
    added_by: m.added_by,
    added_at: m.added_at,
  }));

  return NextResponse.json({ cohort: { ...cohort, member_count: members.length }, members });
}

export async function POST(request: Request, { params }: { params: Promise<{ cohort_id: string }> }) {
  const denied = await requireAdminOrLocal();
  if (denied) return denied;
  const { cohort_id } = await params;
  const body = await request.json();
  const supabase = getAdminClient();

  const entityIds: string[] = Array.isArray(body.entity_ids)
    ? body.entity_ids.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
    : [];
  const action = body.action === 'remove' ? 'remove' : 'add';
  const addedBy = typeof body.added_by === 'string' && body.added_by.trim() ? body.added_by.trim() : 'analyst';

  if (entityIds.length === 0) {
    return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'entity_ids is required' } }, { status: 400 });
  }

  if (action === 'add') {
    for (let i = 0; i < entityIds.length; i += CHUNK) {
      const rows = entityIds.slice(i, i + CHUNK).map(entity_id => ({ cohort_id, entity_id, added_by: addedBy }));
      const { error } = await supabase
        .from('lead_cohort_members')
        .upsert(rows, { onConflict: 'cohort_id,entity_id', ignoreDuplicates: true });
      if (error) {
        return NextResponse.json({ error: { code: 'INSERT_FAILED', message: error.message } }, { status: 500 });
      }
    }
  } else {
    for (let i = 0; i < entityIds.length; i += CHUNK) {
      const { error } = await supabase
        .from('lead_cohort_members')
        .delete()
        .eq('cohort_id', cohort_id)
        .in('entity_id', entityIds.slice(i, i + CHUNK));
      if (error) {
        return NextResponse.json({ error: { code: 'DELETE_FAILED', message: error.message } }, { status: 500 });
      }
    }
  }

  await logAudit(supabase, `lead_cohort.${action}_members`, `cohort:${cohort_id}`, {
    cohort_id,
    action,
    count: entityIds.length,
  }, addedBy);

  return NextResponse.json({ ok: true, action, count: entityIds.length });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ cohort_id: string }> }) {
  const denied = await requireAdminOrLocal();
  if (denied) return denied;
  const { cohort_id } = await params;
  const body = await request.json();
  const supabase = getAdminClient();

  const update: Record<string, unknown> = {};
  if (typeof body.status === 'string' && body.status.trim()) update.status = body.status.trim();
  if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim();
  if (typeof body.description === 'string') update.description = body.description.trim() || null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Nothing to update' } }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('lead_cohorts')
    .update(update)
    .eq('cohort_id', cohort_id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: { code: 'UPDATE_FAILED', message: error?.message ?? 'Cohort not found' } }, { status: error ? 500 : 404 });
  }

  await logAudit(supabase, 'lead_cohort.update', `cohort:${cohort_id}`, { cohort_id, ...update });
  return NextResponse.json({ ok: true, cohort: data });
}
