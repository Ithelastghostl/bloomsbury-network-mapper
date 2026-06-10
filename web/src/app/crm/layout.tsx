import { getAdminClient } from '@/lib/supabase/admin';
import { fetchStats } from '@/lib/crm/queries';
import { SidebarNav } from '@/components/crm/sidebar-nav';
import { StatsBar } from '@/components/crm/stats-bar';
import { GlobalSearch } from '@/components/crm/global-search';
import type { CrmStats } from '@/lib/crm/types';

// The CRM is a live read-only view of Supabase — render per request, never
// prerender at build time. This keeps `next build`/CI independent of the DB and
// always shows current data. Applies to every route nested under /crm.
export const dynamic = 'force-dynamic';

const EMPTY_STATS: CrmStats = {
  total_entities: 0, total_persons: 0, total_companies: 0,
  wealth_estimated: 0, evidence_entries: 0, connections: 0,
  wealth_bands: { unknown: 0, '1m_5m': 0, '5m_25m': 0, '25m_100m': 0, '100m_plus': 0 },
};

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const supabase = getAdminClient();
  // Never let a transient DB hiccup crash every CRM page — degrade to empty stats.
  const stats = await fetchStats(supabase).catch(() => EMPTY_STATS);

  return (
    <div className="flex h-screen bg-pitch-black text-text-primary overflow-hidden">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle">
          <StatsBar stats={stats} />
          <div className="px-4">
            <GlobalSearch />
          </div>
        </div>
        <main className="flex-1 overflow-y-auto px-6 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
