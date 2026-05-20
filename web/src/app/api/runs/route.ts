import { type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/ulid';
import { apiError, serverError } from '@/lib/api-error';
import { withIdempotency } from '@/lib/with-idempotency';

// POST /api/runs -- create a new run
export const POST = withIdempotency(async (request: Request) => {
  try {
    const body = await request.json();
    const { corpus_version, scoring_config_version, icp_id, seed_ids } = body;

    if (!corpus_version || !icp_id) {
      return apiError(
        'bad_request',
        'corpus_version and icp_id are required',
        undefined,
        400,
      );
    }

    const supabase = await createClient();
    const runId = generateId();

    const { data, error } = await supabase
      .from('runs')
      .insert({
        run_id: runId,
        corpus_version,
        schema_version: 'v1',
        extraction_prompt_versions: {},
        graph_build_version: 'v1',
        identity_resolution_version: 'v1',
        scoring_config_version: scoring_config_version ?? 'scoring_v1',
        status: 'created',
      })
      .select()
      .single();

    if (error) {
      return serverError('Failed to create run', error.message);
    }

    return Response.json({ ...data, icp_id, seed_ids: seed_ids ?? [] }, { status: 201 });
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
});

// GET /api/runs -- list runs, optional ?status= filter
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const status = request.nextUrl.searchParams.get('status');

    let query = supabase
      .from('runs')
      .select()
      .order('started_at', { ascending: false })
      .limit(50);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      return serverError('Failed to list runs', error.message);
    }

    return Response.json(data);
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
}
