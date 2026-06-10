'use client';

import { useState } from 'react';
import type { EnrichedEntity, ConnectionEntry } from '@/lib/crm/types';
import { StatusBadge } from '@/components/crm/status-badge';
import { WealthBadge } from '@/components/crm/wealth-badge';
import { ScoreBar } from '@/components/crm/score-bar';
import { AugmentButton } from '@/components/crm/augment-button';
import { EntityNotes } from '@/components/crm/entity-notes';
import Link from 'next/link';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-deep-charcoal border border-border-subtle rounded-lg p-5">
      <h3 className="text-[10px] font-semibold tracking-widest uppercase text-text-muted mb-3">{title}</h3>
      {children}
    </div>
  );
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) return `£${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `£${(value / 1_000_000).toFixed(0)}M`;
  return `£${value.toLocaleString()}`;
}

function ConnectionRow({ entityId, conn, onRemoved }: {
  entityId: string;
  conn: ConnectionEntry;
  onRemoved: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function suppress() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/crm/connections/suppress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: conn.connection_id,
          source_entity_id: entityId,
          connected_entity_id: conn.connected_entity_id,
          reason: reason || undefined,
        }),
      });
      if (res.ok) onRemoved(conn.connection_id);
    } catch { /* keep the row; analyst can retry */ }
    setBusy(false);
  }

  return (
    <div className="py-1.5 border-b border-border-subtle last:border-0">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/crm/entity/${conn.connected_entity_id}`}
            className="text-sm text-text-primary hover:text-gold transition-colors"
          >
            {conn.connected_name ?? conn.connected_entity_id.slice(0, 12)}
          </Link>
          <p className="text-xs text-text-muted">{conn.connection_type.replace(/_/g, ' ')}</p>
        </div>
        <div className="flex items-center gap-2">
          {conn.via_organisation && (
            <span className="text-xs text-text-muted">via {conn.via_organisation}</span>
          )}
          <button
            onClick={() => setConfirming(!confirming)}
            title="Remove this connection (analyst override)"
            className="text-xs text-text-muted hover:text-red-400 transition-colors px-1"
          >
            ✕
          </button>
        </div>
      </div>
      {confirming && (
        <div className="flex items-center gap-2 mt-1.5">
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Reason (optional) — why is this edge wrong?"
            className="flex-1 bg-mid-charcoal border border-border-subtle rounded px-2 py-1 text-[11px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-red-400/50"
          />
          <button
            onClick={suppress}
            disabled={busy}
            className="text-[10px] px-2 py-1 rounded bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 disabled:opacity-40 transition-colors"
          >
            {busy ? 'Removing…' : 'Confirm remove'}
          </button>
          <button onClick={() => setConfirming(false)} className="text-[10px] text-text-muted hover:text-text-secondary">Cancel</button>
        </div>
      )}
    </div>
  );
}

export function EntityDetail({ entity }: { entity: EnrichedEntity }) {
  const [removedConnections, setRemovedConnections] = useState<Set<string>>(new Set());
  const visibleConnections = entity.connections.filter(c => !removedConnections.has(c.connection_id));

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">{entity.display_name}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-sm text-text-muted capitalize">{entity.entity_type}</span>
            <StatusBadge state={entity.pipeline_state} />
            {entity.wealth && <WealthBadge band={entity.wealth.band} />}
          </div>
        </div>
        {entity.entity_type === 'person' && (
          <AugmentButton
            entityId={entity.canonical_entity_id}
            initialState={
              entity.attributes?.wealth_augmented_at
                ? 'augmented'
                : entity.attributes?.augmentation_requested
                  ? 'requested'
                  : 'idle'
            }
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Wealth */}
        {entity.wealth && (
          <Card title="Wealth Profile">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">Band</span>
                <WealthBadge band={entity.wealth.band} />
              </div>
              {entity.wealth.estimated_net_worth_gbp && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Estimated Net Worth</span>
                  <span className="text-sm font-medium text-gold">{formatCurrency(entity.wealth.estimated_net_worth_gbp)}</span>
                </div>
              )}
              <ScoreBar label="Score" value={entity.wealth.score} />
              <ScoreBar label="Confidence" value={entity.wealth.confidence} />
              {entity.wealth.wealth_source && (
                <div className="mt-3 pt-3 border-t border-border-subtle">
                  <p className="text-xs text-text-muted mb-1">Source of wealth</p>
                  <p className="text-sm text-text-secondary">{entity.wealth.wealth_source}</p>
                </div>
              )}
              {entity.wealth.wealth_origin && (
                <div>
                  <p className="text-xs text-text-muted mb-1">Origin</p>
                  <p className="text-sm text-text-secondary capitalize">{entity.wealth.wealth_origin}</p>
                </div>
              )}
              {entity.wealth.evidence_summary && (
                <div>
                  <p className="text-xs text-text-muted mb-1">Summary</p>
                  <p className="text-sm text-text-secondary leading-relaxed">{entity.wealth.evidence_summary}</p>
                </div>
              )}
              {entity.wealth.evidence && entity.wealth.evidence.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border-subtle">
                  <p className="text-xs text-text-muted mb-2">Wealth signals</p>
                  <div className="space-y-1.5">
                    {entity.wealth.evidence.map((e, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-text-secondary">{e.detail}</span>
                        <span className="text-text-muted font-mono">{(e.contribution * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Connections */}
        <Card title={`Network Connections (${visibleConnections.length})`}>
          {visibleConnections.length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {visibleConnections.map(c => (
                <ConnectionRow
                  key={c.connection_id}
                  entityId={entity.canonical_entity_id}
                  conn={c}
                  onRemoved={id => setRemovedConnections(prev => new Set(prev).add(id))}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted">No connections mapped yet.</p>
          )}
        </Card>

        {/* Analyst notes */}
        <Card title="Analyst Notes">
          <EntityNotes entityId={entity.canonical_entity_id} />
        </Card>

        {/* Evidence */}
        <Card title={`Evidence (${entity.evidence.length})`}>
          {entity.evidence.length > 0 ? (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {entity.evidence.map(e => (
                <div key={e.evidence_id} className="pb-2.5 border-b border-border-subtle last:border-0">
                  <p className="text-sm text-text-secondary leading-relaxed">{e.evidence_text}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-text-muted">{e.source}</span>
                    <span className="text-xs text-text-muted">Layer {e.source_layer}</span>
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
        </Card>

        {/* First Contact Intelligence */}
        <Card title="First Contact Intelligence">
          <div className="space-y-3">
            {entity.wealth?.wealth_source && (
              <div>
                <p className="text-xs text-text-muted mb-1">Talking point — Wealth background</p>
                <p className="text-sm text-text-secondary">{entity.wealth.wealth_source}</p>
              </div>
            )}
            {entity.connections.filter(c => c.connection_type === 'DIRECTOR_OF').length > 0 && (
              <div>
                <p className="text-xs text-text-muted mb-1">Directorships</p>
                <div className="flex flex-wrap gap-1.5">
                  {entity.connections
                    .filter(c => c.connection_type === 'DIRECTOR_OF')
                    .map(c => (
                      <span key={c.connection_id} className="text-xs bg-mid-charcoal px-2 py-0.5 rounded text-text-secondary">
                        {c.connected_name ?? 'Company'}
                      </span>
                    ))}
                </div>
              </div>
            )}
            {entity.evidence.filter(e => e.source === 'charity_commission').length > 0 && (
              <div>
                <p className="text-xs text-text-muted mb-1">Charity involvement</p>
                <div className="space-y-1">
                  {entity.evidence
                    .filter(e => e.source === 'charity_commission')
                    .slice(0, 5)
                    .map(e => (
                      <p key={e.evidence_id} className="text-xs text-text-secondary">{e.evidence_text}</p>
                    ))}
                </div>
              </div>
            )}
            {entity.connections.length === 0 && !entity.wealth?.wealth_source && (
              <p className="text-sm text-text-muted">No first-contact intelligence available. Run enrichment to gather data.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
