import { getAdminClient } from '@/lib/supabase/admin';
import { enrichEntities } from '@/lib/crm/queries';
import { EntityTable } from '@/components/crm/entity-table';
import { isSeedPerson } from '@/lib/crm/seed-reference';
import Link from 'next/link';

type PersonRow = { canonical_entity_id: string; entity_type: string; display_name: string; source: string; attributes: Record<string, unknown> };

const PAGE_SIZE = 200;

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; tier?: string }>;
}) {
  const { p, tier } = await searchParams;
  const pageNum = Math.max(0, Number(p ?? 0) || 0);
  const tierFilter = tier === 'A' || tier === 'B' ? tier : 'all';
  const supabase = getAdminClient();

  // Full person list (paged — the table is ~3k rows, the old .limit(1100) truncated it).
  const allPersons: PersonRow[] = [];
  let offset = 0;
  for (;;) {
    const { data } = await supabase
      .from('canonical_entities')
      .select('canonical_entity_id, entity_type, display_name, source, attributes')
      .eq('entity_type', 'person')
      .order('display_name')
      .range(offset, offset + 999);
    if (!data?.length) break;
    allPersons.push(...(data as PersonRow[]));
    if (data.length < 1000) break;
    offset += 1000;
  }

  const [wealthRes, evidenceRes] = await Promise.all([
    supabase.from('wealth_estimates').select('entity_id').limit(5000),
    supabase.from('enrichment_evidence').select('entity_id').limit(10000),
  ]);
  const wealthSet = new Set(((wealthRes.data ?? []) as Array<{ entity_id: string }>).map(w => w.entity_id));
  const evidenceSet = new Set(((evidenceRes.data ?? []) as Array<{ entity_id: string }>).map(e => e.entity_id));

  // Pipeline: discovered people (not original seeds) with NO enrichment yet.
  let pipeline = allPersons.filter(e =>
    !isSeedPerson(e.display_name) &&
    !wealthSet.has(e.canonical_entity_id) &&
    !evidenceSet.has(e.canonical_entity_id)
  );

  const tierOf = (e: PersonRow): 'A' | 'B' | null => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = (e.attributes as Record<string, any>)?.pipeline_tier as string | undefined;
    if (!t) return null;
    return t.startsWith('A') ? 'A' : 'B';
  };
  const tierCounts = { A: pipeline.filter(e => tierOf(e) === 'A').length, B: pipeline.filter(e => tierOf(e) === 'B').length };
  if (tierFilter !== 'all') pipeline = pipeline.filter(e => tierOf(e) === tierFilter);

  const totalPages = Math.max(1, Math.ceil(pipeline.length / PAGE_SIZE));
  const safePage = Math.min(pageNum, totalPages - 1);
  const batch = pipeline.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const enriched = await enrichEntities(supabase, batch);

  const qs = (page: number) => `?p=${page}${tierFilter !== 'all' ? `&tier=${tierFilter}` : ''}`;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Link href="/crm/pipeline" className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${tierFilter === 'all' ? 'bg-gold/10 text-gold border-gold/20' : 'bg-mid-charcoal text-text-muted border-border-subtle hover:text-text-secondary'}`}>
          All tiers
        </Link>
        <Link href="/crm/pipeline?tier=A" className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${tierFilter === 'A' ? 'bg-gold/10 text-gold border-gold/20' : 'bg-mid-charcoal text-text-muted border-border-subtle hover:text-text-secondary'}`}>
          Tier A — derivable ({tierCounts.A})
        </Link>
        <Link href="/crm/pipeline?tier=B" className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${tierFilter === 'B' ? 'bg-gold/10 text-gold border-gold/20' : 'bg-mid-charcoal text-text-muted border-border-subtle hover:text-text-secondary'}`}>
          Tier B — needs research ({tierCounts.B})
        </Link>
      </div>

      <EntityTable
        entities={enriched}
        title="Pipeline"
        description={`${pipeline.length} discovered leads awaiting enrichment — server page ${safePage + 1} of ${totalPages} (${PAGE_SIZE} per page).`}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          {safePage > 0 ? (
            <Link href={qs(safePage - 1)} className="px-3 py-1.5 text-sm rounded-md bg-mid-charcoal text-text-secondary hover:text-text-primary transition-colors">← Earlier</Link>
          ) : <span />}
          <span className="text-sm text-text-muted tabular-nums">Server page {safePage + 1} of {totalPages}</span>
          {safePage < totalPages - 1 ? (
            <Link href={qs(safePage + 1)} className="px-3 py-1.5 text-sm rounded-md bg-mid-charcoal text-text-secondary hover:text-text-primary transition-colors">Later →</Link>
          ) : <span />}
        </div>
      )}
    </div>
  );
}
