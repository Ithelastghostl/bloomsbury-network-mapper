import { type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverError } from '@/lib/api-error';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const targetId = request.nextUrl.searchParams.get('target_entity_id');
    const introducerId = request.nextUrl.searchParams.get('introducer_entity_id');

    let query = supabase
      .from('introduction_routes')
      .select('*')
      .order('warmth_tier', { ascending: true })
      .limit(100);

    if (targetId) query = query.eq('target_entity_id', targetId);
    if (introducerId) query = query.eq('introducer_entity_id', introducerId);

    const { data, error } = await query;
    if (error) return serverError('Failed to list routes', error.message);
    return Response.json(data);
  } catch (err) {
    return serverError('Internal server error', err instanceof Error ? err.message : undefined);
  }
}
