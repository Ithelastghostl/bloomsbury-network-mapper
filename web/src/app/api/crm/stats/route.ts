import { getAdminClient } from '@/lib/supabase/admin';
import { fetchStats } from '@/lib/crm/queries';
import { requireAdminOrLocal } from '@/lib/crm/auth';
import { NextResponse } from 'next/server';

export async function GET() {
  const denied = await requireAdminOrLocal();
  if (denied) return denied;

  const supabase = getAdminClient();
  const stats = await fetchStats(supabase);
  return NextResponse.json(stats);
}
