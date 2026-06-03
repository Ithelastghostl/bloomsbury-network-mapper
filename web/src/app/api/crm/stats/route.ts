import { getAdminClient } from '@/lib/supabase/admin';
import { fetchStats } from '@/lib/crm/queries';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = getAdminClient();
  const stats = await fetchStats(supabase);
  return NextResponse.json(stats);
}
