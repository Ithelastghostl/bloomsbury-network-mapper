import { createClient } from '@/lib/supabase/server';
import { apiError, forbidden, serverError } from '@/lib/api-error';
import { withIdempotency } from '@/lib/with-idempotency';
import {
  createScoringConfig,
  listScoringConfigs,
} from '@/lib/calibration/scoring-config';

// POST /api/scoring-configs — create new scoring config with rationale
export const POST = withIdempotency(async (request: Request) => {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return forbidden('Authentication required');
    }

    const body = await request.json();
    const { config, rationale } = body;

    if (!config || typeof config !== 'object') {
      return apiError('bad_request', 'config object is required');
    }
    if (!rationale || typeof rationale !== 'string') {
      return apiError('bad_request', 'rationale string is required');
    }

    const record = await createScoringConfig(config, rationale, user.id);
    return Response.json(record, { status: 201 });
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
});

// GET /api/scoring-configs — list configs (active + history)
export async function GET() {
  try {
    const configs = await listScoringConfigs();
    return Response.json(configs);
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
}
