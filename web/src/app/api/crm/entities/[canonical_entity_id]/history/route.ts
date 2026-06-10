import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrLocal } from '@/lib/crm/auth';

/** GET — audit trail for one entity (status changes, notes, suppressions). */
export async function GET(_request: Request, { params }: { params: Promise<{ canonical_entity_id: string }> }) {
  const denied = await requireAdminOrLocal();
  if (denied) return denied;
  const { canonical_entity_id } = await params;
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('audit_log')
    .select('log_id, user_id, action, payload, created_at')
    .eq('resource', `entity:${canonical_entity_id}`)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: { code: 'FETCH_FAILED', message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ history: data ?? [] });
}
