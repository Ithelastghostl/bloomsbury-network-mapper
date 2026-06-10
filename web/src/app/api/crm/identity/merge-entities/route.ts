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
    ['lead_scores', 'entity_id'],
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
    // A unique constraint can block the update when keep already has the same
    // row (e.g. both were directors of the same company). Record it: the loser
    // row still points at drop_id and would block the delete, so we remove it.
    const { error } = await supabase.from(table).update({ [column]: keep_id }).eq(column, drop_id);
    if (error) {
      repointWarnings.push(`${table}.${column}: ${error.message}`);
      // Delete the colliding rows that still reference drop_id so the final
      // delete can proceed (the equivalent row already exists on keep_id).
      await supabase.from(table).delete().eq(column, drop_id);
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
