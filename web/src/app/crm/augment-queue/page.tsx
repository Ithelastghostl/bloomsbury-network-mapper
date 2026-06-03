import { getAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';

interface QueueRow {
  canonical_entity_id: string;
  display_name: string;
  attributes: Record<string, unknown>;
}

export default async function AugmentQueuePage() {
  const supabase = getAdminClient();

  const { data } = await supabase
    .from('canonical_entities')
    .select('canonical_entity_id, display_name, attributes')
    .eq('entity_type', 'person')
    .not('attributes->>augmentation_requested', 'is', null)
    .is('attributes->>wealth_augmented_at', null);

  const rows = ((data ?? []) as QueueRow[]).sort((a, b) =>
    String(b.attributes?.augmentation_requested ?? '').localeCompare(String(a.attributes?.augmentation_requested ?? '')),
  );

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-text-primary uppercase tracking-wide">Augment Queue</h2>
        <p className="text-sm text-text-muted mt-0.5">
          {rows.length} {rows.length === 1 ? 'lead' : 'leads'} queued for wealth research.
          The local agent reads <code className="text-gold">GET /api/crm/augment-queue</code>, researches each,
          then POSTs results to <code className="text-gold">/api/entities/&#123;id&#125;/augment</code> to persist.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="border border-border-subtle rounded-lg bg-surface-raised px-6 py-12 text-center text-text-muted text-sm">
          Nothing queued. Open a lead and click <span className="text-gold font-medium">Augment &amp; Persist</span> to add it here.
        </div>
      ) : (
        <div className="border border-border-subtle rounded-lg overflow-hidden bg-surface-raised">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-deep-charcoal border-b border-border-subtle">
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted">Name</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted">Requested</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.map(r => (
                <tr key={r.canonical_entity_id} className="hover:bg-deep-charcoal/60 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/crm/entity/${r.canonical_entity_id}`} className="text-text-primary hover:text-gold font-medium transition-colors">
                      {r.display_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-text-secondary tabular-nums">
                    {new Date(String(r.attributes.augmentation_requested)).toLocaleString('en-GB')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-status-warning">
                      <span className="w-1.5 h-1.5 rounded-full bg-status-warning animate-pulse" />
                      Awaiting research
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
