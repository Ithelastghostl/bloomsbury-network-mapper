import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request, { params }: { params: Promise<{ canonical_entity_id: string }> }) {
  const { canonical_entity_id } = await params;
  const body = await request.json();
  const supabase = getAdminClient();

  const { data: entity, error: fetchErr } = await supabase
    .from('canonical_entities')
    .select('attributes')
    .eq('canonical_entity_id', canonical_entity_id)
    .single();

  if (fetchErr || !entity) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attrs = { ...(entity.attributes as Record<string, any> ?? {}) };
  attrs.action_item = {
    status: 'new',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    notes: '',
    assignee: null,
    lead_score: body.compositeScore,
    lead_category: body.category,
    best_path: body.bestPath,
    root_supporter: body.rootSupporter,
    wealth_band: body.wealthBand,
    estimated_nw: body.estimatedNw,
    sector: body.sector,
    bio: body.bio,
    breakdown: body.breakdown,
  };

  const { error: updateErr } = await supabase
    .from('canonical_entities')
    .update({ attributes: attrs })
    .eq('canonical_entity_id', canonical_entity_id);

  if (updateErr) {
    return NextResponse.json({ error: { code: 'UPDATE_FAILED', message: updateErr.message } }, { status: 500 });
  }

  return NextResponse.json({ ok: true, entity_id: canonical_entity_id });
}
