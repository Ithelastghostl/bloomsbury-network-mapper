import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrLocal } from '@/lib/crm/auth';
import { logAudit } from '@/lib/crm/audit';
import { generateId } from '@/lib/ulid';

export async function GET() {
  const denied = await requireAdminOrLocal();
  if (denied) return denied;
  const supabase = getAdminClient();

  const { data: cohorts, error } = await supabase
    .from('lead_cohorts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: { code: 'FETCH_FAILED', message: error.message } }, { status: 500 });
  }

  // Member counts: one pass over the membership table, tallied in memory. The
  // cohort set is small (analyst-curated), so this is cheaper than per-cohort
  // count queries.
  const { data: members, error: memberError } = await supabase
    .from('lead_cohort_members')
    .select('cohort_id');
  if (memberError) {
    return NextResponse.json({ error: { code: 'FETCH_FAILED', message: memberError.message } }, { status: 500 });
  }

  const counts: Record<string, number> = {};
  for (const m of (members ?? []) as Array<{ cohort_id: string }>) {
    counts[m.cohort_id] = (counts[m.cohort_id] ?? 0) + 1;
  }

  const withCounts = ((cohorts ?? []) as Array<Record<string, unknown>>).map(c => ({
    ...c,
    member_count: counts[c.cohort_id as string] ?? 0,
  }));

  return NextResponse.json({ cohorts: withCounts });
}

export async function POST(request: Request) {
  const denied = await requireAdminOrLocal();
  if (denied) return denied;
  const body = await request.json();
  const supabase = getAdminClient();

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Cohort name is required' } }, { status: 400 });
  }

  const cohort = {
    cohort_id: generateId(),
    name,
    description: typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null,
    created_by: typeof body.created_by === 'string' && body.created_by.trim() ? body.created_by.trim() : 'analyst',
  };

  const { data, error } = await supabase.from('lead_cohorts').insert(cohort).select().single();
  if (error) {
    return NextResponse.json({ error: { code: 'INSERT_FAILED', message: error.message } }, { status: 500 });
  }

  await logAudit(supabase, 'lead_cohort.create', `cohort:${cohort.cohort_id}`, {
    cohort_id: cohort.cohort_id,
    name,
  }, cohort.created_by);

  return NextResponse.json({ ok: true, cohort: { ...data, member_count: 0 } });
}
