import { createClient } from '@/lib/supabase/server';
import { apiError, forbidden, notFound, serverError } from '@/lib/api-error';

// GET /api/seeds/:seed_id — get single seed
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ seed_id: string }> },
) {
  try {
    const { seed_id } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('seeds')
      .select()
      .eq('seed_id', seed_id)
      .single();

    if (error || !data) {
      return notFound('Seed not found');
    }

    return Response.json(data);
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
}

// PATCH /api/seeds/:seed_id — update seed (toggle active, update notes) (admin only, §24)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ seed_id: string }> },
) {
  try {
    const { seed_id } = await params;
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

    // Verify seed exists
    const { data: existing } = await supabase
      .from('seeds')
      .select('seed_id')
      .eq('seed_id', seed_id)
      .single();

    if (!existing) {
      return notFound('Seed not found');
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (typeof body.active === 'boolean') {
      updates.active = body.active;
    }
    if (typeof body.notes === 'string' || body.notes === null) {
      updates.notes = body.notes;
    }

    if (Object.keys(updates).length === 0) {
      return apiError('bad_request', 'No valid fields to update');
    }

    const { data, error } = await supabase
      .from('seeds')
      .update(updates)
      .eq('seed_id', seed_id)
      .select()
      .single();

    if (error) {
      return serverError('Failed to update seed', error.message);
    }

    return Response.json(data);
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
}
