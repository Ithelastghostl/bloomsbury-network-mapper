import { useState, useEffect, useCallback } from 'react';
import { MOCK_LEADS, type Lead, type OutreachStage } from '../data/mockLeads';
import { FilterBar, type Filters } from './FilterBar';
import { LeadRow } from './LeadRow';
import { LeadPanel } from './LeadPanel';
import { EmptyState } from './EmptyState';
import './LeadPipeline.css';

export function LeadPipeline() {
  const [leads, setLeads] = useState<Lead[]>(MOCK_LEADS);
  const [selectedId, setSelectedId] = useState<string | null>(MOCK_LEADS[0]?.id ?? null);
  const [filters, setFilters] = useState<Filters>({
    tier: 'All',
    stage: 'All',
    sponsor: 'All sponsors',
    triggerOnly: false,
  });

  const filtered = leads.filter(l => {
    if (filters.tier !== 'All' && l.tier !== filters.tier) return false;
    if (filters.stage !== 'All' && l.stage !== filters.stage) return false;
    if (filters.sponsor !== 'All sponsors' && l.introducingSponsor !== filters.sponsor) return false;
    if (filters.triggerOnly && !l.triggerSignal) return false;
    return true;
  });

  const selectedLead = filtered.find(l => l.id === selectedId) ??
    (filtered.length > 0 ? filtered[0] : null);

  function handleStageChange(id: string, stage: OutreachStage) {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, stage } : l));
  }

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!filtered.length) return;
    const currentIndex = filtered.findIndex(l => l.id === selectedId);

    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = filtered[Math.min(currentIndex + 1, filtered.length - 1)];
      setSelectedId(next.id);
    } else if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = filtered[Math.max(currentIndex - 1, 0)];
      setSelectedId(prev.id);
    } else if (e.key === 'Escape') {
      setSelectedId(null);
    }
  }, [filtered, selectedId]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const isFiltered = filters.tier !== 'All' || filters.stage !== 'All' ||
    filters.sponsor !== 'All sponsors' || filters.triggerOnly;

  function resetFilters() {
    setFilters({ tier: 'All', stage: 'All', sponsor: 'All sponsors', triggerOnly: false });
  }

  return (
    <div className="pipeline">
      <div className="pipeline__list-col">
        <FilterBar
          filters={filters}
          onChange={setFilters}
          totalCount={leads.length}
          filteredCount={filtered.length}
        />
        <div className="pipeline__list">
          {filtered.length === 0 ? (
            <EmptyState filtered={isFiltered} onReset={resetFilters} />
          ) : (
            filtered.map(lead => (
              <LeadRow
                key={lead.id}
                lead={lead}
                isSelected={lead.id === selectedLead?.id}
                onClick={() => setSelectedId(lead.id)}
              />
            ))
          )}
        </div>
      </div>

      <div className="pipeline__panel-col">
        <LeadPanel lead={selectedLead} onStageChange={handleStageChange} />
      </div>
    </div>
  );
}
