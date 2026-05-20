import { type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverError } from '@/lib/api-error';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const status = request.nextUrl.searchParams.get('promotion_status') ?? 'pending';

    const { data, error } = await supabase
      .from('staged_entities')
      .select('*')
      .eq('promotion_status', status)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) return serverError('Failed to list staged entities', error.message);
    return Response.json(data);
  } catch (err) {
    return serverError('Internal server error', err instanceof Error ? err.message : undefined);
  }
}
