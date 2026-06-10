import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrLocal } from '@/lib/crm/auth';
import { withIdempotency } from '@/lib/with-idempotency';
import { logAudit } from '@/lib/crm/audit';
import { generateId } from '@/lib/ulid';
import { SuppressionSet, pruneIntroPaths, type OverrideRow } from '@/lib/crm/suppressions';

/**
 * POST /api/crm/connections/suppress
 *
 * Records a human suppression of a connection (a "remove" override). The edge
 * is never hard-deleted: every loader filters against connection_overrides, so
 * the decision survives re-augmentation. Stored intro_paths that traverse the
 * suppressed pair are pruned immediately so Decide/Act views update without a
 * full recompute.
 *
 * Body: { connection_id?, co_director_edge_id?, source_entity_id?,
 *         connected_entity_id?, reason?, author? }
 * Requires either a row id or a full entity pair.
 *
 * Idempotent on the `Idempotency-Key` header — a double-submit returns the
 * first response instead of creating a second override row.
 */
export const POST = withIdempotency(async (request: Request) => {
  const denied = await requireAdminOrLocal();
  if (denied) return denied;
  const body = await request.json();
  const supabase = getAdminClient();

  // enrichEntities synthesises reversed rows with an `_rev` suffix — strip it.
  const connectionId: string | null = typeof body.connection_id === 'string'
    ? body.connection_id.replace(/_rev$/, '')
    : null;
  const coDirectorEdgeId: string | null = typeof body.co_director_edge_id === 'string' ? body.co_director_edge_id : null;
  let sourceId: string | null = typeof body.source_entity_id === 'string' ? body.source_entity_id : null;
  let connectedId: string | null = typeof body.connected_entity_id === 'string' ? body.connected_entity_id : null;

  // Resolve the pair from the referenced row when not supplied, so the
  // suppression also covers derived edges (shared-board projections etc.).
  if ((!sourceId || !connectedId) && connectionId) {
    const { data } = await supabase
      .from('network_connections')
      .select('source_entity_id, connected_entity_id')
      .eq('connection_id', connectionId)
      .single();
    if (data) {
      sourceId = sourceId ?? data.source_entity_id;
      connectedId = connectedId ?? data.connected_entity_id;
    }
  }
  if ((!sourceId || !connectedId) && coDirectorEdgeId) {
    const { data } = await supabase
      .from('co_director_edges')
      .select('seed_entity_id, co_director_entity_id')
      .eq('co_director_edge_id', coDirectorEdgeId)
      .single();
    if (data) {
      sourceId = sourceId ?? data.seed_entity_id;
      connectedId = connectedId ?? data.co_director_entity_id;
    }
  }

  if (!connectionId && !coDirectorEdgeId && !(sourceId && connectedId)) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Provide connection_id, co_director_edge_id, or both entity ids' } },
      { status: 400 },
    );
  }

  const override: OverrideRow = {
    override_id: generateId(),
    connection_id: connectionId,
    co_director_edge_id: coDirectorEdgeId,
    source_entity_id: sourceId,
    connected_entity_id: connectedId,
    action: 'remove',
    reason: typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null,
    author: typeof body.author === 'string' && body.author.trim() ? body.author.trim() : 'analyst',
    created_at: new Date().toISOString(),
  };

  const { error: insertErr } = await supabase.from('connection_overrides').insert({
    override_id: override.override_id,
    connection_id: override.connection_id,
    co_director_edge_id: override.co_director_edge_id,
    source_entity_id: override.source_entity_id,
    connected_entity_id: override.connected_entity_id,
    action: override.action,
    reason: override.reason,
    author: override.author,
  });
  if (insertErr) {
    return NextResponse.json({ error: { code: 'INSERT_FAILED', message: insertErr.message } }, { status: 500 });
  }

  await logAudit(supabase, 'connection.suppress', `pair:${sourceId ?? '?'}|${connectedId ?? '?'}`, {
    override_id: override.override_id,
    connection_id: connectionId,
    co_director_edge_id: coDirectorEdgeId,
    source_entity_id: sourceId,
    connected_entity_id: connectedId,
    reason: override.reason,
  }, override.author);

  // Prune stored intro_paths that traverse the suppressed pair. Only the new
  // override matters here — earlier ones were pruned when they were created.
  //
  // The scan is filtered to persons who HAVE intro_paths (a small subset —
  // ~hundreds, not the whole table) and pruneIntroPaths only rewrites the rows
  // whose paths actually traverse the pair, so writes are minimal. If the
  // intro_paths population ever grows large enough that this scan dominates the
  // request, move it to a background job (there is no general job worker today;
  // pipeline_jobs is run-scoped, so it isn't the right home yet).
  let pruned = 0;
  if (sourceId && connectedId) {
    const sup = new SuppressionSet([override]);
    let offset = 0;
    for (;;) {
      const { data } = await supabase
        .from('canonical_entities')
        .select('canonical_entity_id, attributes')
        .eq('entity_type', 'person')
        .not('attributes->intro_paths', 'is', null)
        .range(offset, offset + 999);
      if (!data?.length) break;
      for (const row of data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const next = pruneIntroPaths((row.attributes ?? {}) as Record<string, any>, sup);
        if (next) {
          const { error } = await supabase
            .from('canonical_entities')
            .update({ attributes: next })
            .eq('canonical_entity_id', row.canonical_entity_id);
          if (!error) pruned++;
        }
      }
      if (data.length < 1000) break;
      offset += 1000;
    }
  }

  return NextResponse.json({ ok: true, override_id: override.override_id, paths_pruned: pruned });
});
