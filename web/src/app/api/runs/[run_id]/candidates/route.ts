/**
 * GET /api/runs/:run_id/candidates — filtered candidate list (F7.4-T2, §20.5)
 *
 * Query params: seed_id, status, limit
 */

import { type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, serverError } from '@/lib/api-error';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ run_id: string }> },
) {
  try {
    const { run_id } = await params;
    const supabase = await createClient();

    // Verify run exists
    const { data: run, error: runError } = await supabase
      .from('runs')
      .select('run_id')
      .eq('run_id', run_id)
      .single();

    if (runError || !run) {
      return apiError('not_found', 'Run not found', undefined, 404);
    }

    // Parse query params
    const seedId = request.nextUrl.searchParams.get('seed_id');
    const status = request.nextUrl.searchParams.get('status');
    const limitParam = request.nextUrl.searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 200) : 50;

    if (limitParam && isNaN(limit)) {
      return apiError('bad_request', 'limit must be a number', undefined, 400);
    }

    // Build query
    let query = supabase
      .from('candidate_recommendations')
      .select()
      .eq('run_id', run_id)
      .order('rank', { ascending: true })
      .limit(limit);

    if (seedId) {
      query = query.eq('seed_id', seedId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      return serverError('Failed to fetch candidates', error.message);
    }

    return Response.json(data ?? []);
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
}
