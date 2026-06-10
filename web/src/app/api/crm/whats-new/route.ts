import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrLocal } from '@/lib/crm/auth';

/**
 * GET /api/crm/whats-new?days=7
 *
 * Deltas since the window start: new connections, wealth estimates,
 * co-director edges, evidence, promoted entities, and analyst activity
 * (notes, suppressions, exclusions, action changes from the audit log).
 */
export interface FeedItem {
  type: string;
  at: string;
  title: string;
  detail: string | null;
  entity_id: string | null;
}

export async function GET(request: Request) {
  const denied = await requireAdminOrLocal();
  if (denied) return denied;

  const url = new URL(request.url);
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get('days') ?? 7)));
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const supabase = getAdminClient();

  const [conns, wealth, coDirs, evidence, promoted, audit] = await Promise.all([
    supabase.from('network_connections')
      .select('connection_id, source_entity_id, connected_entity_id, via_organisation, created_at')
      .gte('created_at', since).order('created_at', { ascending: false }).limit(300),
    supabase.from('wealth_estimates')
      .select('entity_id, band, score, assessed_at')
      .gte('assessed_at', since).order('assessed_at', { ascending: false }).limit(300),
    supabase.from('co_director_edges')
      .select('seed_entity_id, co_director_entity_id, co_director_name, company_name, created_at')
      .gte('created_at', since).order('created_at', { ascending: false }).limit(300),
    supabase.from('enrichment_evidence')
      .select('entity_id, source, created_at')
      .gte('created_at', since).limit(1000),
    supabase.from('staged_entities')
      .select('staged_entity_id, display_name, promoted_entity_id, created_at')
      .eq('promotion_status', 'promoted')
      .gte('created_at', since).limit(100),
    supabase.from('audit_log')
      .select('log_id, user_id, action, resource, payload, created_at')
      .gte('created_at', since).order('created_at', { ascending: false }).limit(300),
  ]);

  // Resolve names for the ids we'll display.
  const ids = new Set<string>();
  for (const c of conns.data ?? []) { if (c.source_entity_id) ids.add(c.source_entity_id); if (c.connected_entity_id) ids.add(c.connected_entity_id); }
  for (const w of wealth.data ?? []) ids.add(w.entity_id);
  for (const d of coDirs.data ?? []) ids.add(d.seed_entity_id);
  const nameOf = new Map<string, string>();
  const idList = [...ids];
  for (let i = 0; i < idList.length; i += 500) {
    const { data } = await supabase
      .from('canonical_entities')
      .select('canonical_entity_id, display_name')
      .in('canonical_entity_id', idList.slice(i, i + 500));
    for (const e of data ?? []) nameOf.set(e.canonical_entity_id, e.display_name);
  }

  const items: FeedItem[] = [];

  for (const w of wealth.data ?? []) {
    items.push({
      type: 'wealth',
      at: w.assessed_at,
      title: `New wealth estimate: ${nameOf.get(w.entity_id) ?? w.entity_id}`,
      detail: `Band ${String(w.band).replace(/_/g, '–')} (score ${Math.round((w.score ?? 0) * 100)}/100)`,
      entity_id: w.entity_id,
    });
  }
  for (const c of conns.data ?? []) {
    if (!c.connected_entity_id) continue;
    items.push({
      type: 'connection',
      at: c.created_at,
      title: `New connection: ${nameOf.get(c.source_entity_id) ?? '?'} — ${nameOf.get(c.connected_entity_id) ?? '?'}`,
      detail: c.via_organisation ? `Via ${c.via_organisation}` : null,
      entity_id: c.source_entity_id,
    });
  }
  for (const d of coDirs.data ?? []) {
    items.push({
      type: 'co_director',
      at: d.created_at,
      title: `New co-director: ${nameOf.get(d.seed_entity_id) ?? '?'} — ${d.co_director_name}`,
      detail: `Board: ${d.company_name}`,
      entity_id: d.seed_entity_id,
    });
  }
  for (const p of promoted.data ?? []) {
    items.push({
      type: 'promotion',
      at: p.created_at,
      title: `Promoted to entity: ${p.display_name}`,
      detail: 'Staged discovery promoted into the canonical graph',
      entity_id: p.promoted_entity_id,
    });
  }
  // Evidence rolls up per entity to keep the feed readable.
  const evidenceByEntity = new Map<string, { count: number; latest: string }>();
  for (const e of evidence.data ?? []) {
    const cur = evidenceByEntity.get(e.entity_id) ?? { count: 0, latest: e.created_at };
    cur.count++;
    if (e.created_at > cur.latest) cur.latest = e.created_at;
    evidenceByEntity.set(e.entity_id, cur);
  }
  const evIds = [...evidenceByEntity.keys()].filter(id => !nameOf.has(id));
  for (let i = 0; i < evIds.length; i += 500) {
    const { data } = await supabase
      .from('canonical_entities')
      .select('canonical_entity_id, display_name')
      .in('canonical_entity_id', evIds.slice(i, i + 500));
    for (const e of data ?? []) nameOf.set(e.canonical_entity_id, e.display_name);
  }
  for (const [entityId, agg] of evidenceByEntity) {
    items.push({
      type: 'evidence',
      at: agg.latest,
      title: `${agg.count} new evidence item${agg.count > 1 ? 's' : ''}: ${nameOf.get(entityId) ?? entityId}`,
      detail: null,
      entity_id: entityId,
    });
  }
  for (const a of audit.data ?? []) {
    const p = (a.payload ?? {}) as Record<string, unknown>;
    const entityId = (p.entity_id as string) ?? null;
    const label: Record<string, string> = {
      'action_item.create': 'Sent to action backlog',
      'action_item.update': 'Action updated',
      'connection.suppress': 'Connection removed by analyst',
      'entity_note.create': 'Analyst note added',
      'entity_note.update': 'Analyst note updated',
      'entity_note.delete': 'Analyst note deleted',
      'lead.exclude': 'Lead excluded',
      'lead.restore': 'Lead restored',
    };
    items.push({
      type: 'analyst',
      at: a.created_at,
      title: `${label[a.action] ?? a.action}${p.entity_name ? `: ${p.entity_name}` : ''}`,
      detail: (p.reason as string) ?? null,
      entity_id: entityId,
    });
  }

  items.sort((a, b) => b.at.localeCompare(a.at));
  return NextResponse.json({ since, days, items: items.slice(0, 500) });
}
