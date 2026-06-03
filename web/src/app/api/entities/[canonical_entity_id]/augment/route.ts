import { getAdminClient } from '@/lib/supabase/admin';
import { apiError, serverError } from '@/lib/api-error';
import { withIdempotency } from '@/lib/with-idempotency';
import { requireAdminOrLocal } from '@/lib/crm/auth';
import { storeWealthResult, type WealthResearchResult } from '@/lib/crm/wealth-persist';

// POST /api/entities/:canonical_entity_id/augment
// Persists a wealth research result (produced by the local tethered Claude Code
// agent) and promotes the lead to a seed by setting wealth_augmented_at.
// No Anthropic API key is used — research happens out-of-band; this only persists.
export const POST = withIdempotency(async (
  request: Request,
  { params }: { params: Promise<{ canonical_entity_id: string }> },
) => {
  try {
    const { canonical_entity_id } = await params;

    const denied = await requireAdminOrLocal();
    if (denied) return denied;

    let body: Partial<WealthResearchResult>;
    try {
      body = await request.json();
    } catch {
      return apiError('invalid_json', 'Request body must be valid JSON');
    }

    if (typeof body.wealth_band !== 'string' || typeof body.evidence_summary !== 'string') {
      return apiError('invalid_body', 'wealth_band and evidence_summary are required');
    }

    const result: WealthResearchResult = {
      entity_id: canonical_entity_id,
      display_name: body.display_name ?? '',
      estimated_net_worth_gbp: body.estimated_net_worth_gbp ?? null,
      wealth_band: body.wealth_band,
      wealth_score: body.wealth_score ?? 0,
      confidence: body.confidence ?? 0,
      wealth_source: body.wealth_source ?? '',
      wealth_origin: body.wealth_origin ?? '',
      evidence_summary: body.evidence_summary,
      sources: Array.isArray(body.sources) ? body.sources : [],
    };

    // Writes run with the service-role client (parity with the CLI, bypasses RLS).
    await storeWealthResult(getAdminClient(), result);

    return Response.json({ entity_id: canonical_entity_id, ok: true, promoted_to_seed: true });
  } catch (err) {
    return serverError('Failed to persist augmentation', err instanceof Error ? err.message : undefined);
  }
});
