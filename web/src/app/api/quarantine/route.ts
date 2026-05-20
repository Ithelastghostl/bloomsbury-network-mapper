/**
 * GET /api/quarantine — list quarantined records.
 * PRD ref: §20.3
 * Query params: ?run_id=...&reason=...
 */

import { type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, serverError } from '@/lib/api-error';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const runId = request.nextUrl.searchParams.get('run_id');
    const reason = request.nextUrl.searchParams.get('reason');

    let query = supabase
      .from('quarantine')
      .select()
      .order('created_at', { ascending: false })
      .limit(200);

    if (runId) {
      query = query.eq('run_id', runId);
    }
    if (reason) {
      query = query.eq('reason_code', reason);
    }

    const { data, error } = await query;

    if (error) {
      return serverError('Failed to list quarantine records', error.message);
    }

    return Response.json(data);
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
}
