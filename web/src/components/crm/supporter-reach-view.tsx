'use client';

import { useState } from 'react';
import { SupporterReachGraph } from './supporter-reach-graph';
import { SupporterReachTable } from './supporter-reach-table';
import type { SupporterReachData } from '@/lib/crm/supporter-reach';

export function SupporterReachView({ data }: { data: SupporterReachData }) {
  const [view, setView] = useState<'graph' | 'table'>('graph');

  return (
    <div>
      <div className="flex items-center justify-end mb-2">
        <div className="inline-flex rounded-md border border-border-subtle overflow-hidden text-xs font-medium">
          <button
            onClick={() => setView('graph')}
            className={`px-3 py-1.5 uppercase tracking-wide transition-colors ${
              view === 'graph' ? 'bg-gold text-warm-white' : 'bg-surface-raised text-text-secondary hover:text-text-primary'
            }`}
          >
            Graph
          </button>
          <button
            onClick={() => setView('table')}
            className={`px-3 py-1.5 uppercase tracking-wide transition-colors border-l border-border-subtle ${
              view === 'table' ? 'bg-gold text-warm-white' : 'bg-surface-raised text-text-secondary hover:text-text-primary'
            }`}
          >
            Table
          </button>
        </div>
      </div>
      {view === 'graph' ? <SupporterReachGraph data={data} /> : <SupporterReachTable data={data} />}
    </div>
  );
}
