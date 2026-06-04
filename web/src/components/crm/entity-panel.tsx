'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { EnrichedEntity } from '@/lib/crm/types';
import { StatusBadge } from '@/components/crm/status-badge';
import { WealthBadge } from '@/components/crm/wealth-badge';
import { ScoreBar } from '@/components/crm/score-bar';
import { AugmentButton } from '@/components/crm/augment-button';

function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) return `£${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `£${(value / 1_000_000).toFixed(0)}M`;
  return `£${value.toLocaleString()}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border-subtle pt-4">
      <h3 className="text-[10px] font-semibold tracking-widest uppercase text-text-muted mb-3">{title}</h3>
      {children}
    </div>
  );
}

function augmentStateFor(entity: EnrichedEntity): 'augmented' | 'requested' | 'idle' {
  if (entity.attributes?.wealth_augmented_at) return 'augmented';
  if (entity.attributes?.augmentation_requested) return 'requested';
  return 'idle';
}

export function EntityPanel({
  entityId,
  onClose,
}: {
  entityId: string | null;
  onClose: () => void;
}) {
  const open = entityId !== null;
  const [entity, setEntity] = useState<EnrichedEntity | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch the profile whenever a new node is selected. State is mutated only
  // inside the async run() (not synchronously in the effect body), and a
  // `cancelled` flag + AbortController discard a stale response if the user
  // clicks another node mid-flight.
  useEffect(() => {
    if (!entityId) return;
    const controller = new AbortController();
    let cancelled = false;

    async function run(id: string) {
      setLoading(true);
      setError(null);
      setEntity(null);
      try {
        const res = await fetch(`/api/crm/entities/${id}/profile`, { signal: controller.signal });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error?.message ?? `Failed to load (${res.status})`);
        }
        const data = (await res.json()) as EnrichedEntity;
        if (!cancelled) setEntity(data);
      } catch (e) {
        if (cancelled || (e as Error).name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'Failed to load profile');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run(entityId);
    return () => { cancelled = true; controller.abort(); };
  }, [entityId]);

  // Close on Escape while the panel is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const directorships = entity?.connections.filter(c => c.connection_type === 'DIRECTOR_OF') ?? [];

  return (
    <>
      {/* Click-outside scrim. Transparent so the graph stays visible. */}
      {open && (
        <div
          className="absolute inset-0 z-20"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={`absolute top-0 right-0 h-full w-[380px] max-w-[90%] z-30 bg-deep-charcoal border-l border-border-subtle shadow-2xl
          transform transition-transform duration-300 ease-out overflow-y-auto
          ${open ? 'translate-x-0' : 'translate-x-full pointer-events-none'}`}
        role="dialog"
        aria-label="Entity profile"
      >
        {/* Header */}
        <div className="sticky top-0 bg-deep-charcoal border-b border-border-subtle px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {entity ? (
              <>
                <h2 className="text-lg font-semibold text-text-primary truncate">{entity.display_name}</h2>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-xs text-text-muted capitalize">{entity.entity_type}</span>
                  <StatusBadge state={entity.pipeline_state} />
                  {entity.wealth && <WealthBadge band={entity.wealth.band} />}
                </div>
              </>
            ) : (
              <h2 className="text-lg font-semibold text-text-muted">{loading ? 'Loading…' : 'Profile'}</h2>
            )}
          </div>
          <button
            onClick={onClose}
            title="Close (Esc)"
            className="shrink-0 -mr-1 -mt-1 p-1.5 rounded-md text-text-muted hover:text-gold hover:bg-mid-charcoal transition-colors"
            aria-label="Close panel"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && (
            <p className="text-sm text-status-danger">{error}</p>
          )}

          {loading && !entity && (
            <div className="space-y-2">
              <div className="h-3 w-2/3 bg-mid-charcoal rounded animate-pulse" />
              <div className="h-3 w-1/2 bg-mid-charcoal rounded animate-pulse" />
              <div className="h-24 w-full bg-mid-charcoal rounded animate-pulse mt-4" />
            </div>
          )}

          {entity && (
            <>
              {/* Augment action + full-page link */}
              <div className="flex items-center justify-between gap-3">
                <Link
                  href={`/crm/entity/${entity.canonical_entity_id}`}
                  className="text-xs text-text-muted hover:text-gold transition-colors"
                >
                  Open full profile →
                </Link>
                {entity.entity_type === 'person' && (
                  <AugmentButton
                    entityId={entity.canonical_entity_id}
                    initialState={augmentStateFor(entity)}
                  />
                )}
              </div>

              {/* Wealth */}
              {entity.wealth && (
                <Section title="Wealth Profile">
                  <div className="space-y-3">
                    {entity.wealth.estimated_net_worth_gbp != null && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-text-secondary">Estimated Net Worth</span>
                        <span className="text-sm font-medium text-gold">{formatCurrency(entity.wealth.estimated_net_worth_gbp)}</span>
                      </div>
                    )}
                    <ScoreBar label="Score" value={entity.wealth.score} />
                    <ScoreBar label="Confidence" value={entity.wealth.confidence} />
                    {entity.wealth.wealth_source && (
                      <div>
                        <p className="text-xs text-text-muted mb-1">Source of wealth</p>
                        <p className="text-sm text-text-secondary">{entity.wealth.wealth_source}</p>
                      </div>
                    )}
                    {entity.wealth.evidence_summary && (
                      <div>
                        <p className="text-xs text-text-muted mb-1">Summary</p>
                        <p className="text-sm text-text-secondary leading-relaxed">{entity.wealth.evidence_summary}</p>
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {/* Connections */}
              <Section title={`Network Connections (${entity.connections.length})`}>
                {entity.connections.length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {entity.connections.map(c => (
                      <div key={c.connection_id} className="flex items-center justify-between py-1.5 border-b border-border-subtle last:border-0">
                        <div className="min-w-0">
                          <Link
                            href={`/crm/entity/${c.connected_entity_id}`}
                            className="text-sm text-text-primary hover:text-gold transition-colors block truncate"
                          >
                            {c.connected_name ?? c.connected_entity_id.slice(0, 12)}
                          </Link>
                          <p className="text-xs text-text-muted">{c.connection_type.replace(/_/g, ' ')}</p>
                        </div>
                        {c.via_organisation && (
                          <span className="text-xs text-text-muted shrink-0 ml-2">via {c.via_organisation}</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-text-muted">No connections mapped yet.</p>
                )}
              </Section>

              {/* First contact intelligence */}
              {(entity.wealth?.wealth_source || directorships.length > 0) && (
                <Section title="First Contact Intelligence">
                  <div className="space-y-3">
                    {entity.wealth?.wealth_source && (
                      <div>
                        <p className="text-xs text-text-muted mb-1">Talking point — Wealth background</p>
                        <p className="text-sm text-text-secondary">{entity.wealth.wealth_source}</p>
                      </div>
                    )}
                    {directorships.length > 0 && (
                      <div>
                        <p className="text-xs text-text-muted mb-1">Directorships</p>
                        <div className="flex flex-wrap gap-1.5">
                          {directorships.map(c => (
                            <span key={c.connection_id} className="text-xs bg-mid-charcoal px-2 py-0.5 rounded text-text-secondary">
                              {c.connected_name ?? 'Company'}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {/* Evidence */}
              <Section title={`Evidence (${entity.evidence.length})`}>
                {entity.evidence.length > 0 ? (
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {entity.evidence.map(e => (
                      <div key={e.evidence_id} className="pb-2.5 border-b border-border-subtle last:border-0">
                        <p className="text-sm text-text-secondary leading-relaxed">{e.evidence_text}</p>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-xs text-text-muted">{e.source}</span>
                          <span className="text-xs text-text-muted font-mono">{(e.confidence * 100).toFixed(0)}%</span>
                          {e.evidence_url && (
                            <a
                              href={e.evidence_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-gold hover:text-gold-light transition-colors"
                            >
                              Source →
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-text-muted">No evidence collected yet.</p>
                )}
              </Section>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
