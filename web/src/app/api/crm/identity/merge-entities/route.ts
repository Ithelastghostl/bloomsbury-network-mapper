import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrLocal } from '@/lib/crm/auth';
import { logAudit } from '@/lib/crm/audit';
import { generateId } from '@/lib/ulid';

/**
 * POST /api/crm/identity/merge-entities — human-confirmed merge of two
 * canonical entities (duplicate identities). Mirrors what
 * scripts/merge-duplicate-entities.ts does for one pair, plus an
 * entity_aliases record so the decision replays on future ingests.
 *
 * Body: { keep_id, drop_id, reason? }
 */

/**
 * Single-column primary key per repointed table, used to repoint row-by-row
 * when a bulk UPDATE collides with a unique constraint. Tables whose PK *is*
 * the repoint column, or is composite on it, are handled specially below
 * (the only safe action on collision there is to delete the colliding row).
 */
const PRIMARY_KEY: Record<string, string> = {
  co_director_edges: 'co_director_edge_id',
  network_connections: 'connection_id',
  enrichment_evidence: 'evidence_id',
  enrichment_signals: 'enrichment_signal_id',
  entity_articles: 'article_id',
  wealth_estimates: 'wealth_estimate_id',
  sweep_runs: 'sweep_run_id',
  seed_augmentation_runs: 'augmentation_run_id',
  entity_notes: 'note_id',
  connection_overrides: 'override_id',
  intro_outcomes: 'intro_outcome_id',
  identity_clusters: 'cluster_id',
  relationships: 'relationship_id',
  donation_events: 'donation_event_id',
  candidate_recommendations: 'candidate_recommendation_id',
  rejection_log: 'rejection_log_id',
  introduction_routes: 'route_id',
  seeds: 'seed_id',
  seed_import_rows: 'row_id',
  staged_entities: 'staged_entity_id',
  entity_aliases: 'alias_id',
  // known_contacts PK is canonical_entity_id (== the repoint column); lead_scores
  // PK is composite (entity_id, config_version). Both are absent here on purpose
  // so the fallback deletes the colliding row instead of trying to re-key it.
};
export async function POST(request: Request) {
  const denied = await requireAdminOrLocal();
  if (denied) return denied;
  const body = await request.json();
  const { keep_id, drop_id } = body;
  if (!keep_id || !drop_id || keep_id === drop_id) {
    return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'keep_id and drop_id (distinct) are required' } }, { status: 400 });
  }
  const supabase = getAdminClient();

  const { data: entities } = await supabase
    .from('canonical_entities')
    .select('canonical_entity_id, display_name, entity_type, attributes')
    .in('canonical_entity_id', [keep_id, drop_id]);
  const keep = entities?.find((e: { canonical_entity_id: string }) => e.canonical_entity_id === keep_id);
  const drop = entities?.find((e: { canonical_entity_id: string }) => e.canonical_entity_id === drop_id);
  if (!keep || !drop) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'One or both entities not found' } }, { status: 404 });
  }
  if (keep.entity_type !== drop.entity_type) {
    return NextResponse.json({ error: { code: 'TYPE_MISMATCH', message: 'Cannot merge a person with a company' } }, { status: 400 });
  }

  // Concurrency guard: if drop_id already appears as an alias source, a merge of
  // it is already in flight or done. Reject rather than race a second merge that
  // would repoint onto an entity another merge is mid-deleting (→ dangling refs).
  const { data: existingAlias } = await supabase
    .from('entity_aliases')
    .select('alias_id')
    .eq('alias_entity_id', drop_id)
    .limit(1);
  if (existingAlias?.length) {
    return NextResponse.json(
      { error: { code: 'CONFLICT', message: 'This entity has already been merged.' } },
      { status: 409 },
    );
  }

  // Repoint EVERY column that FK-references canonical_entities, from drop → keep.
  // Anything missed here would leave a dangling reference and make the final
  // DELETE of drop_id fail with an FK violation (kept in sync with the schema —
  // see `grep "references app.canonical_entities" supabase/migrations`).
  const repoints: Array<[string, string]> = [
    ['co_director_edges', 'seed_entity_id'],
    ['co_director_edges', 'co_director_entity_id'],
    ['network_connections', 'source_entity_id'],
    ['network_connections', 'connected_entity_id'],
    ['network_connections', 'via_organisation_id'],
    ['enrichment_evidence', 'entity_id'],
    ['enrichment_signals', 'candidate_entity_id'],
    ['entity_articles', 'entity_id'],
    ['wealth_estimates', 'entity_id'],
    ['sweep_runs', 'entity_id'],
    ['seed_augmentation_runs', 'canonical_entity_id'],
    ['entity_notes', 'entity_id'],
    ['connection_overrides', 'source_entity_id'],
    ['connection_overrides', 'connected_entity_id'],
    // lead_scores is intentionally omitted: the table is no longer written
    // (live scoring replaced the persist script), so it never references an
    // entity. If a persisted-scores reader is ever reintroduced, add it back.
    ['intro_outcomes', 'entity_id'],
    ['identity_clusters', 'canonical_entity_id'],
    ['relationships', 'source_entity_id'],
    ['relationships', 'target_entity_id'],
    ['donation_events', 'donor_entity_id'],
    ['donation_events', 'recipient_entity_id'],
    ['candidate_recommendations', 'candidate_entity_id'],
    ['rejection_log', 'candidate_entity_id'],
    ['introduction_routes', 'target_entity_id'],
    ['introduction_routes', 'introducer_entity_id'],
    ['introduction_routes', 'via_entity_id'],
    ['known_contacts', 'canonical_entity_id'],
    ['seeds', 'canonical_entity_id'],
    ['seed_import_rows', 'canonical_entity_id'],
    ['seed_import_rows', 'introducer_entity_id'],
    ['staged_entities', 'match_candidate_id'],
    ['staged_entities', 'promoted_entity_id'],
    ['entity_aliases', 'canonical_entity_id'],
  ];
  const repointWarnings: string[] = [];
  for (const [table, column] of repoints) {
    // Bulk-repoint first; this moves every drop row to keep in one statement.
    const { error } = await supabase.from(table).update({ [column]: keep_id }).eq(column, drop_id);
    if (!error) continue;

    // A unique constraint blocked the *whole* statement because at least one
    // drop row duplicates a row keep already has. PostgREST UPDATE is atomic, so
    // nothing moved. Retry row-by-row: move what we can, and delete ONLY the
    // individual rows that still collide (the equivalent already exists on keep).
    // The old code deleted every drop row for the column here — that destroyed
    // the non-colliding rows too. We must not do that.
    repointWarnings.push(`${table}.${column}: ${error.message} (row-by-row fallback)`);
    const pkCol = PRIMARY_KEY[table];
    if (!pkCol) {
      // known_contacts / lead_scores: the repoint column is (part of) the PK, so
      // there's at most one drop row per key and a collision means keep already
      // holds the equivalent. Deleting drop's rows for this column is the correct
      // resolution (and is scoped to drop_id only — never touches keep's rows).
      const { error: delErr } = await supabase.from(table).delete().eq(column, drop_id);
      if (delErr) repointWarnings.push(`${table}.${column}: delete failed: ${delErr.message}`);
      continue;
    }
    const { data: rows } = await supabase.from(table).select(pkCol).eq(column, drop_id);
    for (const r of (rows ?? []) as unknown as Array<Record<string, string>>) {
      const id = r[pkCol];
      const { error: rowErr } = await supabase.from(table).update({ [column]: keep_id }).eq(pkCol, id);
      if (rowErr) {
        // This specific row collides with one keep already has → drop just it.
        const { error: delErr } = await supabase.from(table).delete().eq(pkCol, id);
        if (delErr) repointWarnings.push(`${table}.${pkCol}=${id}: delete failed: ${delErr.message}`);
      }
    }
  }
  if (repointWarnings.length) {
    console.warn(`merge ${drop_id}→${keep_id} repoint collisions:`, repointWarnings.join('; '));
  }

  // Drop self-loops the merge created.
  const { data: selfCoDir } = await supabase.from('co_director_edges').select('co_director_edge_id').eq('seed_entity_id', keep_id).eq('co_director_entity_id', keep_id);
  for (const r of selfCoDir ?? []) await supabase.from('co_director_edges').delete().eq('co_director_edge_id', r.co_director_edge_id);
  const { data: selfConn } = await supabase.from('network_connections').select('connection_id').eq('source_entity_id', keep_id).eq('connected_entity_id', keep_id);
  for (const r of selfConn ?? []) await supabase.from('network_connections').delete().eq('connection_id', r.connection_id);

  // Merge attributes: keep's values win; fill gaps from the duplicate.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mergedAttrs = { ...(drop.attributes as Record<string, any> ?? {}), ...(keep.attributes as Record<string, any> ?? {}) };
  await supabase.from('canonical_entities').update({ attributes: mergedAttrs }).eq('canonical_entity_id', keep_id);

  // Alias record — makes the merge replayable and auditable.
  const { error: aliasErr } = await supabase.from('entity_aliases').upsert({
    alias_id: generateId(),
    alias_entity_id: drop_id,
    canonical_entity_id: keep_id,
    alias_source: 'crm_merge',
  }, { onConflict: 'alias_entity_id,canonical_entity_id', ignoreDuplicates: true });
  if (aliasErr) console.error(`entity_aliases write failed: ${aliasErr.message}`);

  const { error: delErr } = await supabase.from('canonical_entities').delete().eq('canonical_entity_id', drop_id);
  if (delErr) {
    return NextResponse.json({ error: { code: 'DELETE_FAILED', message: `References repointed but duplicate row not deleted: ${delErr.message}` } }, { status: 500 });
  }

  await logAudit(supabase, 'identity.merge_entities', `entity:${keep_id}`, {
    entity_id: keep_id,
    entity_name: keep.display_name,
    merged_from_id: drop_id,
    merged_from_name: drop.display_name,
    reason: body.reason ?? null,
  });

  return NextResponse.json({ ok: true, keep_id, dropped: drop_id });
}
