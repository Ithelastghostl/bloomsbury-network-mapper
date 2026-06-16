/**
 * Review Queue page — §18.6
 *
 * Sortable/filterable table showing all candidate recommendations.
 * Columns: rank, name, priority score, confidence score, seed, reason codes,
 *          status, reviewer.
 * Filters: seed, score range, confidence range, status.
 * Sortable: rank, priority, confidence.
 *
 * Server Component with client-interactive table.
 */

import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/crm/auth';
import { ReviewTable } from './review-table';

interface SearchParams {
  seed_id?: string;
  status?: string;
  min_priority?: string;
  max_priority?: string;
  min_confidence?: string;
  max_confidence?: string;
  sort?: string;
  order?: string;
  run_id?: string;
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireUser();
  const params = await searchParams;
  const supabase = await createClient();

  // Fetch seeds for filter dropdown
  const { data: seeds } = await supabase
    .from('seeds')
    .select('seed_id, canonical_entity_id')
    .eq('active', true);

  const seedEntityIds = (seeds ?? []).map(s => s.canonical_entity_id);
  const { data: seedEntities } = await supabase
    .from('canonical_entities')
    .select('canonical_entity_id, display_name')
    .in('canonical_entity_id', seedEntityIds.length > 0 ? seedEntityIds : ['__none__']);

  const seedOptions = (seeds ?? []).map(s => {
    const entity = (seedEntities ?? []).find(
      e => e.canonical_entity_id === s.canonical_entity_id,
    );
    return { seed_id: s.seed_id, name: entity?.display_name ?? s.seed_id };
  });

  // Build candidate query
  let query = supabase
    .from('candidate_recommendations')
    .select()
    .order(params.sort === 'confidence' ? 'confidence_score' : params.sort === 'priority' ? 'priority_score' : 'rank', {
      ascending: params.order !== 'desc',
    })
    .limit(200);

  if (params.run_id) {
    query = query.eq('run_id', params.run_id);
  }

  if (params.seed_id) {
    query = query.eq('seed_id', params.seed_id);
  }

  if (params.status) {
    query = query.eq('status', params.status);
  }

  if (params.min_priority) {
    query = query.gte('priority_score', parseFloat(params.min_priority));
  }
  if (params.max_priority) {
    query = query.lte('priority_score', parseFloat(params.max_priority));
  }
  if (params.min_confidence) {
    query = query.gte('confidence_score', parseFloat(params.min_confidence));
  }
  if (params.max_confidence) {
    query = query.lte('confidence_score', parseFloat(params.max_confidence));
  }

  const { data: candidates, error } = await query;

  // Map entity IDs to names for display
  const entityIds = [...new Set((candidates ?? []).map(c => c.candidate_entity_id))];
  const { data: entities } = await supabase
    .from('canonical_entities')
    .select('canonical_entity_id, display_name, entity_type')
    .in('canonical_entity_id', entityIds.length > 0 ? entityIds : ['__none__']);

  const entityMap = Object.fromEntries(
    (entities ?? []).map(e => [e.canonical_entity_id, e.display_name]),
  );

  const seedMap = Object.fromEntries(
    seedOptions.map(s => [s.seed_id, s.name]),
  );

  // Transform for table
  const rows = (candidates ?? []).map(c => ({
    candidate_recommendation_id: c.candidate_recommendation_id,
    rank: c.rank,
    name: entityMap[c.candidate_entity_id] ?? c.candidate_entity_id,
    priority_score: c.priority_score,
    confidence_score: c.confidence_score,
    seed: seedMap[c.seed_id] ?? c.seed_id,
    reason_codes: c.reason_codes ?? [],
    status: c.status,
    identity_warnings: c.identity_warnings ?? [],
  }));

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Review Queue
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Candidate recommendations for review
        </p>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            Failed to load candidates: {error.message}
          </div>
        )}

        <ReviewTable
          rows={rows}
          seedOptions={seedOptions}
          currentFilters={{
            seed_id: params.seed_id ?? '',
            status: params.status ?? '',
            min_priority: params.min_priority ?? '',
            max_priority: params.max_priority ?? '',
            min_confidence: params.min_confidence ?? '',
            max_confidence: params.max_confidence ?? '',
            sort: params.sort ?? 'rank',
            order: params.order ?? 'asc',
          }}
        />
      </main>
    </div>
  );
}
