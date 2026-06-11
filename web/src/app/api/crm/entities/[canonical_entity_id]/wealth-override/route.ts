import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrLocal } from '@/lib/crm/auth';
import { logAudit } from '@/lib/crm/audit';
import { generateId } from '@/lib/ulid';
import type { WealthBand } from '@/lib/crm/types';

/** Bands an analyst may set by hand (mirrors WealthBand). */
const VALID_BANDS = new Set<WealthBand>(['unknown', '1m_5m', '5m_25m', '25m_100m', '100m_plus']);

/**
 * POST /api/crm/entities/:id/wealth-override  { band, reason? }
 *
 * Records a human wealth-band correction. Per the platform rule that human
 * decisions always win, this band supersedes the automated estimate wherever
 * wealth is read (see fetchEntityById / enrichEntities). One live override per
 * entity — re-posting upserts, so the latest correction wins.
 *
 * DELETE clears the override (revert to the automated band).
 */
export async function POST(request: Request, { params }: { params: Promise<{ canonical_entity_id: string }> }) {
  const denied = await requireAdminOrLocal();
  if (denied) return denied;
  const { canonical_entity_id } = await params;
  const body = await request.json();
  const supabase = getAdminClient();

  const band = typeof body.band === 'string' ? body.band : '';
  if (!VALID_BANDS.has(band as WealthBand)) {
    return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Invalid wealth band' } }, { status: 400 });
  }

  // Confirm the entity exists so a bad id 404s rather than failing the FK insert.
  const { data: entity, error: fetchErr } = await supabase
    .from('canonical_entities')
    .select('display_name')
    .eq('canonical_entity_id', canonical_entity_id)
    .single();
  if (fetchErr || !entity) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, { status: 404 });
  }

  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null;
  const author = typeof body.author === 'string' && body.author.trim() ? body.author.trim() : 'analyst';

  // One override per entity (unique entity_id) — upsert so a re-correction wins.
  const { data, error } = await supabase
    .from('wealth_overrides')
    .upsert(
      { override_id: generateId(), entity_id: canonical_entity_id, band, reason, author },
      { onConflict: 'entity_id' },
    )
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: { code: 'UPSERT_FAILED', message: error.message } }, { status: 500 });
  }

  await logAudit(supabase, 'wealth_override.set', `entity:${canonical_entity_id}`, {
    entity_id: canonical_entity_id,
    entity_name: entity.display_name,
    band,
    reason,
  }, author);

  return NextResponse.json({ ok: true, override: data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ canonical_entity_id: string }> }) {
  const denied = await requireAdminOrLocal();
  if (denied) return denied;
  const { canonical_entity_id } = await params;
  const supabase = getAdminClient();

  const { error } = await supabase
    .from('wealth_overrides')
    .delete()
    .eq('entity_id', canonical_entity_id);
  if (error) {
    return NextResponse.json({ error: { code: 'DELETE_FAILED', message: error.message } }, { status: 500 });
  }

  await logAudit(supabase, 'wealth_override.clear', `entity:${canonical_entity_id}`, {
    entity_id: canonical_entity_id,
  });

  return NextResponse.json({ ok: true });
}
