'use client';

import { useMemo, useState } from 'react';
import { NetworkGraph } from './network-graph';
import type { IntroductionGraph as IntroData } from '@/lib/crm/introduction-graph';

// Degree colours: donor (core) → 1st order → 2nd order, plus orgs in the via view.
const DONOR = '#a07d0a';   // gold — we already know them
const FIRST = '#2f6f6b';   // teal — a donor can introduce us
const SECOND = '#c2410c';  // burnt orange — reached via a 1st-order person
const ORG = '#3b5a8a';     // slate — organisation node (via-orgs view)

function colorForDegree(d: number): string {
  if (d === 0) return DONOR;
  if (d === 1) return FIRST;
  if (d === 2) return SECOND;
  return ORG;
}

export function IntroductionGraph({ data }: { data: IntroData }) {
  const [tab, setTab] = useState<'people' | 'orgs'>('people');
  const active = tab === 'people' ? data.peopleChain : data.viaOrgs;

  const nodeColorById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const n of active.nodes) m[n.id] = colorForDegree(n.degree);
    return m;
  }, [active.nodes]);

  const legend = useMemo(() => {
    const base = [
      { color: DONOR, label: `Donor — core (${data.donorCount})` },
      { color: FIRST, label: `1st order — donor can introduce (${data.firstOrder})` },
      { color: SECOND, label: `2nd order — via a 1st-order person (${data.secondOrder})` },
    ];
    return tab === 'orgs' ? [...base, { color: ORG, label: 'Organisation' }] : base;
  }, [tab, data.donorCount, data.firstOrder, data.secondOrder]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary uppercase tracking-wide">Introduction Graph</h2>
          <p className="text-sm text-text-muted mt-0.5">
            {data.donorCount} donors → {data.firstOrder} first-order → {data.secondOrder} second-order contacts.
            Trace a warm path: ask a donor to introduce you to a 1st-order person, or reach a 2nd-order person through them.
          </p>
        </div>
        <div className="inline-flex rounded-md border border-border-subtle overflow-hidden text-xs font-medium">
          <button
            onClick={() => setTab('people')}
            className={`px-3 py-1.5 uppercase tracking-wide transition-colors ${
              tab === 'people' ? 'bg-gold text-warm-white' : 'bg-surface-raised text-text-secondary hover:text-text-primary'
            }`}
          >
            People chain
          </button>
          <button
            onClick={() => setTab('orgs')}
            className={`px-3 py-1.5 uppercase tracking-wide transition-colors border-l border-border-subtle ${
              tab === 'orgs' ? 'bg-gold text-warm-white' : 'bg-surface-raised text-text-secondary hover:text-text-primary'
            }`}
          >
            Via organisations
          </button>
        </div>
      </div>

      <div
        className="border border-border-subtle rounded-lg overflow-hidden bg-deep-charcoal"
        style={{ height: 'calc(100vh - 220px)' }}
      >
        <NetworkGraph
          key={tab}
          nodes={active.nodes}
          edges={active.edges}
          nodeColorById={nodeColorById}
          legend={legend}
        />
      </div>
    </div>
  );
}
