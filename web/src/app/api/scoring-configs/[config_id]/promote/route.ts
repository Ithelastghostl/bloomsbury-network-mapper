import { createClient } from '@/lib/supabase/server';
import { apiError, forbidden, serverError } from '@/lib/api-error';
import { withIdempotency } from '@/lib/with-idempotency';
import {
  promoteScoringConfig,
  PromotionGateError,
} from '@/lib/calibration/scoring-config';

// POST /api/scoring-configs/:config_id/promote — promote config (requires approval + gate checks)
export const POST = withIdempotency(async (
  request: Request,
  { params }: { params: Promise<{ config_id: string }> },
) => {
  try {
    const { config_id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return forbidden('Authentication required');
    }

    const body = await request.json();
    const {
      ranking_quality_ok,
      false_positive_rate_ok,
      top_candidates_explainable,
      rationale,
    } = body;

    if (typeof ranking_quality_ok !== 'boolean') {
      return apiError('bad_request', 'ranking_quality_ok (boolean) is required');
    }
    if (typeof false_positive_rate_ok !== 'boolean') {
      return apiError('bad_request', 'false_positive_rate_ok (boolean) is required');
    }
    if (typeof top_candidates_explainable !== 'boolean') {
      return apiError('bad_request', 'top_candidates_explainable (boolean) is required');
    }
    if (!rationale || typeof rationale !== 'string') {
      return apiError('bad_request', 'rationale string is required');
    }

    const record = await promoteScoringConfig(
      config_id,
      {
        ranking_quality_ok,
        false_positive_rate_ok,
        top_candidates_explainable,
        config_version: config_id,
        rationale,
      },
      user.id,
    );

    return Response.json(record);
  } catch (err) {
    if (err instanceof PromotionGateError) {
      return apiError('PROMOTION_GATE_FAILED', err.message, { failures: err.failures }, 422);
    }
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
});
