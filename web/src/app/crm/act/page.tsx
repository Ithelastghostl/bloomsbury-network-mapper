import { getAdminClient } from '@/lib/supabase/admin';
import { ActionBacklog } from '@/components/crm/action-backlog';

export default async function ActPage() {
  const supabase = getAdminClient();

  const all: Array<{ canonical_entity_id: string; display_name: string; attributes: Record<string, unknown> }> = [];
  let offset = 0;
  for (;;) {
    const { data } = await supabase.from('canonical_entities').select('canonical_entity_id, display_name, attributes').eq('entity_type', 'person').range(offset, offset + 999);
    if (!data?.length) break;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    all.push(...(data as any[]));
    if (data.length < 1000) break;
    offset += 1000;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = all.filter(p => (p.attributes as any)?.action_item).map(p => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ai = (p.attributes as any).action_item;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attrs = p.attributes as any;
    return {
      id: p.canonical_entity_id,
      name: p.display_name,
      status: ai.status as string,
      assignee: ai.assignee as string | null,
      notes: ai.notes as string,
      createdAt: ai.created_at as string,
      updatedAt: ai.updated_at as string,
      leadScore: ai.lead_score as number,
      category: ai.lead_category as string,
      bestPath: ai.best_path as string | null,
      rootSupporter: ai.root_supporter as string | null,
      wealthBand: ai.wealth_band as string | null,
      estimatedNw: ai.estimated_nw as number | null,
      sector: ai.sector as string | null,
      bio: ai.bio as string | null,
      isHumanValidated: !!attrs.identity_confirmed,
      breakdown: ai.breakdown ?? null,
      affinityRationale: (ai.affinity_rationale ?? ai.explanations?.affinity ?? null) as string | null,
      bestPathReason: (ai.best_path_reason ?? null) as string | null,
      viaOrgs: (Array.isArray(ai.via_orgs) ? ai.via_orgs : null) as string[] | null,
      rankingMethod: (ai.ranking_method ?? null) as string | null,
    };
  }).sort((a, b) => {
    const statusOrder: Record<string, number> = { new: 0, outreach: 1, contacted: 2, information_needed: 3, deferred: 4, won: 5, lost: 6 };
    const sa = statusOrder[a.status] ?? 99, sb = statusOrder[b.status] ?? 99;
    if (sa !== sb) return sa - sb;
    return b.leadScore - a.leadScore;
  });

  return <ActionBacklog items={items} />;
}
