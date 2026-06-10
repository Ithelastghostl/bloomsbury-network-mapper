import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('canonical_entities')
    .select('canonical_entity_id, display_name, entity_type, attributes')
    .ilike('display_name', `%${q}%`)
    .order('display_name')
    .limit(20);

  if (error) {
    return NextResponse.json({ error: { code: 'SEARCH_FAILED', message: error.message } }, { status: 500 });
  }

  return NextResponse.json({ results: data ?? [] });
}
