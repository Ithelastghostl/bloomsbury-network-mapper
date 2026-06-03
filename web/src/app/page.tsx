import { getAdminClient } from '@/lib/supabase/admin';
import { fetchStats } from '@/lib/crm/queries';
import type { CrmStats } from '@/lib/crm/types';
import Link from 'next/link';

// Live stats from Supabase — render per request, not at build time.
export const dynamic = 'force-dynamic';

const EMPTY_STATS: CrmStats = {
  total_entities: 0, total_persons: 0, total_companies: 0,
  wealth_estimated: 0, evidence_entries: 0, connections: 0,
  wealth_bands: { unknown: 0, '1m_5m': 0, '5m_25m': 0, '25m_100m': 0, '100m_plus': 0 },
};

export default async function Home() {
  const supabase = getAdminClient();
  const stats = await fetchStats(supabase).catch(() => EMPTY_STATS);

  return (
    <div className="min-h-screen bg-pitch-black text-text-primary flex flex-col items-center justify-center px-6">
      <div className="max-w-2xl w-full text-center">
        <h1 className="text-sm font-semibold tracking-widest uppercase text-gold mb-2">
          Bloomsbury Football Foundation
        </h1>
        <h2 className="text-3xl font-semibold text-text-primary mb-2">
          Network Mapper
        </h2>
        <p className="text-text-secondary mb-10">
          Intelligence platform for mapping HNW networks and surfacing warm introduction routes.
        </p>

        <div className="grid grid-cols-3 gap-4 mb-10">
          <div className="bg-deep-charcoal border border-border-subtle rounded-lg p-4">
            <span className="text-2xl font-semibold text-text-primary tabular-nums">{stats.total_persons.toLocaleString()}</span>
            <p className="text-xs text-text-muted mt-1">Person Entities</p>
          </div>
          <div className="bg-deep-charcoal border border-border-subtle rounded-lg p-4">
            <span className="text-2xl font-semibold text-gold tabular-nums">{stats.wealth_estimated}</span>
            <p className="text-xs text-text-muted mt-1">Wealth Profiles</p>
          </div>
          <div className="bg-deep-charcoal border border-border-subtle rounded-lg p-4">
            <span className="text-2xl font-semibold text-text-primary tabular-nums">{stats.connections.toLocaleString()}</span>
            <p className="text-xs text-text-muted mt-1">Connections</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/crm"
            className="inline-flex items-center justify-center px-6 py-2.5 bg-gold text-pitch-black font-medium rounded-md hover:bg-gold-light transition-colors text-sm"
          >
            Open CRM Dashboard
          </Link>
          <Link
            href="/crm/graph"
            className="inline-flex items-center justify-center px-6 py-2.5 bg-mid-charcoal text-text-secondary font-medium rounded-md hover:text-text-primary hover:bg-border-mid transition-colors text-sm"
          >
            View Social Graph
          </Link>
          <Link
            href="/leadership-roadmap.html"
            className="inline-flex items-center justify-center px-6 py-2.5 bg-mid-charcoal text-text-secondary font-medium rounded-md hover:text-text-primary hover:bg-border-mid transition-colors text-sm"
          >
            Leadership Roadmap
          </Link>
        </div>

        <div className="flex items-center justify-center gap-4 mt-6 text-sm">
          <a href="/getting-started.html" className="text-gold hover:text-gold-light transition-colors">
            Getting Started Guide →
          </a>
          <span className="text-border-mid">·</span>
          <a href="/how-it-works.html" className="text-text-muted hover:text-text-primary transition-colors">
            How It Works
          </a>
        </div>
      </div>
    </div>
  );
}
