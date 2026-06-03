import { createClient } from '@/lib/supabase/server';
import { apiError, forbidden, serverError } from '@/lib/api-error';
import { withIdempotency } from '@/lib/with-idempotency';
import { augmentSingleSeed } from '@/lib/augmentation/orchestrator';

export const POST = withIdempotency(async (
  request: Request,
  { params }: { params: Promise<{ seed_id: string }> },
) => {
  try {
    const { seed_id: id } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return forbidden('Authentication required');
    const role = user.app_metadata?.role as string | undefined;
    if (role !== 'admin' && role !== 'engineering_admin') {
      return forbidden('Admin role required');
    }

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      return serverError('ANTHROPIC_API_KEY not configured');
    }

    const result = await augmentSingleSeed(supabase, id, anthropicApiKey);

    return Response.json({
      seed_id: id,
      ...result,
    });
  } catch (err) {
    return serverError('Internal server error', err instanceof Error ? err.message : undefined);
  }
});
