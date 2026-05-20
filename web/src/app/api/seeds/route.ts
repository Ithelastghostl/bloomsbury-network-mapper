import { type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/ulid';
import { apiError, forbidden, serverError } from '@/lib/api-error';
import { withIdempotency } from '@/lib/with-idempotency';

// POST /api/seeds — create a new seed (admin only, §24)
export const POST = withIdempotency(async (request: Request) => {
  try {
    const supabase = await createClient();

    // Auth check: admin role required per §24
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return forbidden('Authentication required');
    }
    const role = user.app_metadata?.role as string | undefined;
    if (role !== 'admin' && role !== 'engineering_admin') {
      return forbidden('Admin role required to manage seeds');
    }

    const body = await request.json();
    const { canonical_entity_id, notes } = body;

    if (!canonical_entity_id) {
      return apiError('bad_request', 'canonical_entity_id is required');
    }

    // Verify entity exists
    const { data: entity } = await supabase
      .from('canonical_entities')
      .select('canonical_entity_id')
      .eq('canonical_entity_id', canonical_entity_id)
      .single();

    if (!entity) {
      return apiError('not_found', 'Canonical entity not found', undefined, 404);
    }

    const seedId = generateId();

    const { data, error } = await supabase
      .from('seeds')
      .insert({
        seed_id: seedId,
        canonical_entity_id,
        added_by: user.id,
        notes: notes ?? null,
        active: true,
      })
      .select()
      .single();

    if (error) {
      return serverError('Failed to create seed', error.message);
    }

    return Response.json(data, { status: 201 });
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
});

// GET /api/seeds — list seeds, optional ?active=true/false filter
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const activeParam = request.nextUrl.searchParams.get('active');

    let query = supabase
      .from('seeds')
      .select()
      .order('added_at', { ascending: false })
      .limit(200);

    if (activeParam !== null) {
      query = query.eq('active', activeParam === 'true');
    }

    const { data, error } = await query;

    if (error) {
      return serverError('Failed to list seeds', error.message);
    }

    return Response.json(data);
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
}
