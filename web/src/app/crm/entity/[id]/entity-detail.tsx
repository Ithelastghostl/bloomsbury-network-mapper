'use client';

import { useState } from 'react';
import type { EnrichedEntity, ConnectionEntry, WealthBand } from '@/lib/crm/types';
import { WEALTH_BAND_LABELS, WEALTH_BAND_ORDER } from '@/lib/crm/types';
import { scoreLead, type IntroPathDetail } from '@/lib/crm/lead-score';
import { DOWNWEIGHT_FACTOR } from '@/lib/crm/suppressions';
import { detectAttributeConflicts } from '@/lib/crm/attribute-conflicts';
import { StatusBadge } from '@/components/crm/status-badge';
import { WealthBadge } from '@/components/crm/wealth-badge';
import { ScoreBar } from '@/components/crm/score-bar';
import { SignalList } from '@/components/crm/signal-chips';
import { AugmentButton } from '@/components/crm/augment-button';
import { EntityNotes } from '@/components/crm/entity-notes';
import { EntityTags } from '@/components/crm/entity-tags';
import { edgeDossier, EDGE_TYPE_META, WARMTH_META } from '@/lib/crm/edge-classify';
import Link from 'next/link';

function Card({ title, action, span, children }: { title: string; action?: React.ReactNode; span?: boolean; children: React.ReactNode }) {
  return (
    <div className={`bg-deep-charcoal border border-border-subtle rounded-lg p-5${span ? ' lg:col-span-2' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] font-semibold tracking-widest uppercase text-text-muted">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) return `£${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `£${(value / 1_000_000).toFixed(0)}M`;
  return `£${value.toLocaleString()}`;
}

/** Dimension bar (0–100) used by the Priority & Confidence dossier card. */
function DimensionBar({ label, value, explanation }: { label: string; value: number; explanation?: string }) {
  const color = value >= 70 ? 'bg-gold' : value >= 40 ? 'bg-status-info' : 'bg-text-muted';
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="w-24 shrink-0 text-xs text-text-secondary capitalize">{label}</span>
        <div className="flex-1 h-1.5 rounded-full bg-mid-charcoal overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
        </div>
        <span className="w-8 text-right text-xs text-text-secondary font-mono">{value}</span>
      </div>
      {explanation && <p className="text-[11px] text-text-muted mt-0.5 ml-[104px] leading-snug">{explanation}</p>}
    </div>
  );
}

const PRIORITY_LABELS: Record<string, string> = {
  introability: 'Introability',
  affinity: 'Affinity',
  capacity: 'Capacity',
  influence: 'Influence',
  strategicFit: 'Strategic fit',
};
const CONFIDENCE_LABELS: Record<string, string> = {
  identity: 'Identity',
  relationship: 'Relationship',
  corroboration: 'Corroboration',
  freshness: 'Freshness',
};

/**
 * Deterministic one-line suggested action from the best intro path's facts.
 * No fabrication — every clause is read from the path/category, and we fall back
 * to a generic prompt when there is no warm route.
 */
function suggestedAction(best: IntroPathDetail | undefined, category: string): string {
  if (best?.root_supporter) {
    const via = best.via_orgs?.length ? ` via your shared connection to ${best.via_orgs[0]}` : '';
    const hop = best.hops === 1 ? 'a direct' : 'a warm';
    return `Ask ${best.root_supporter} for ${hop} introduction${via}.`;
  }
  if (category === 'hnw_target') return 'No warm path mapped yet — research a mutual connection before a cold approach.';
  return 'No introduction path from our supporters yet — map shared affiliations to open a warm route.';
}

/** Plain-language qualification framing keyed to the lead category. */
function qualificationFraming(category: string): string {
  switch (category) {
    case 'hnw_target': return 'Qualify capacity and affinity to the cause before the ask; confirm identity first.';
    case 'charity_donor': return 'Already gives to charities we track — qualify alignment with our specific cause.';
    case 'wealth_identified': return 'Capacity is evidenced — qualify warmth and intent before progressing.';
    default: return 'Early-stage lead — qualify identity, capacity, and a warm route before acting.';
  }
}

function ConnectionRow({ entityId, conn, onRemoved }: {
  entityId: string;
  conn: ConnectionEntry;
  onRemoved: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  // Downweight = "real but weak/suspect" (IDEA 14). Reflects the persisted flag,
  // or an in-session toggle so the badge updates without a reload.
  const [downweighted, setDownweighted] = useState(!!conn.downweighted);

  // Typed edge + tie strength (IDEAS 5 & 6). Pure, derived from this row alone.
  const ed = edgeDossier(conn, conn.co_director);
  // A downweighted tie keeps its edge but its strength is reduced so warmer
  // routes outrank it (mirrors SuppressionSet.downweightFactor at read time).
  const tieStrength = downweighted ? ed.tieStrength * DOWNWEIGHT_FACTOR : ed.tieStrength;
  const typeMeta = EDGE_TYPE_META[ed.edgeType];
  const warmMeta = WARMTH_META[ed.warmth];
  const evidenceText = (() => {
    const e = conn.evidence;
    if (!e || typeof e !== 'object') return null;
    const raw = (e as Record<string, unknown>).evidence_summary ?? (e as Record<string, unknown>).summary
      ?? (e as Record<string, unknown>).detail ?? (e as Record<string, unknown>).note;
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  })();

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

  async function downweight() {
    if (busy || downweighted) return;
    setBusy(true);
    try {
      const res = await fetch('/api/crm/connections/suppress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'downweight',
          connection_id: conn.connection_id,
          source_entity_id: entityId,
          connected_entity_id: conn.connected_entity_id,
          reason: reason || undefined,
        }),
      });
      if (res.ok) { setDownweighted(true); setConfirming(false); }
    } catch { /* leave as-is; analyst can retry */ }
    setBusy(false);
  }

  return (
    <div className="py-1.5 border-b border-border-subtle last:border-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExpanded(!expanded)}
              title="Show connection dossier"
              className="text-text-muted text-[9px] w-2 shrink-0 hover:text-text-secondary"
            >
              {expanded ? '▾' : '▸'}
            </button>
            <Link
              href={`/crm/entity/${conn.connected_entity_id}`}
              className="text-sm text-text-primary hover:text-gold transition-colors truncate"
            >
              {conn.connected_name ?? conn.connected_entity_id.slice(0, 12)}
            </Link>
            <span className={`text-[8px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded border shrink-0 ${typeMeta.cls}`}>
              {typeMeta.label}
            </span>
          </div>
          <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 mt-0.5 ml-4 text-left" title="Show connection dossier">
            <span className={`inline-flex items-center gap-1 text-[9px] px-1 py-0.5 rounded border ${warmMeta.cls}`} title={`Tie strength ${(tieStrength * 100).toFixed(0)}% · freshness ${ed.freshness}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${warmMeta.dot}`} />
              {warmMeta.label}
            </span>
            {downweighted && (
              <span className="text-[8px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400" title="Analyst flagged this tie as real but weak/suspect — its strength is reduced">
                Weak
              </span>
            )}
            <span className="text-[10px] text-text-muted truncate">{ed.label}</span>
          </button>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!downweighted && (
            <button
              onClick={downweight}
              disabled={busy}
              title="Downweight: this tie is real but weak or suspect — keep it but reduce its strength"
              className="text-[9px] uppercase tracking-wider text-text-muted hover:text-amber-400 transition-colors px-1 disabled:opacity-40"
            >
              Weak
            </button>
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
      {expanded && (
        <div className="mt-2 ml-4 rounded border border-border-subtle bg-mid-charcoal/20 px-2.5 py-2 space-y-1.5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
            <div className="flex justify-between"><span className="text-text-muted">Edge type</span><span className="text-text-secondary">{typeMeta.label}</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Connection</span><span className="text-text-secondary">{conn.connection_type.replace(/_/g, ' ')}</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Via</span><span className="text-text-secondary truncate ml-2">{conn.via_organisation ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Freshness</span><span className="text-text-secondary capitalize">{ed.freshness}</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Trust weight</span><span className="text-text-secondary font-mono">{(ed.trustWeight * 100).toFixed(0)}%</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Tie strength</span><span className={`font-mono ${warmMeta.cls.split(' ')[0]}`}>{(tieStrength * 100).toFixed(0)}%{downweighted && <span className="text-amber-400"> (downweighted)</span>}</span></div>
          </div>
          {(ed.freshness === 'active' || ed.freshness === 'recent' || ed.freshness === 'stale') && conn.co_director && (
            <p className="text-[10px] text-text-muted">
              {conn.co_director.appointed_on && <>Appointed {conn.co_director.appointed_on.slice(0, 10)}. </>}
              {conn.co_director.resigned_on ? <>Resigned {conn.co_director.resigned_on.slice(0, 10)}.</> : <>Still active.</>}
            </p>
          )}
          {evidenceText && (
            <div className="pt-1 border-t border-border-subtle/60">
              <p className="text-[9px] uppercase tracking-wider text-text-muted mb-0.5">Evidence</p>
              <p className="text-[10px] text-text-secondary leading-relaxed">{evidenceText}</p>
            </div>
          )}
          {!evidenceText && ed.reasons.length > 0 && (
            <div className="pt-1 border-t border-border-subtle/60">
              <p className="text-[9px] uppercase tracking-wider text-text-muted mb-0.5">Reasons ({ed.reasons.length})</p>
              {ed.reasons.slice(0, 4).map((r, i) => (
                <p key={i} className="text-[10px] text-text-muted leading-relaxed">· {r.slice(0, 120)}</p>
              ))}
            </div>
          )}
        </div>
      )}
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

/**
 * Data conflicts card (IDEA 13). Renders only when the entity's attributes
 * disagree with its evidence/other sources. Each conflict offers a lightweight
 * "trust this value" action that records the analyst's choice as a structured
 * note ([resolved conflict] field=value), so the decision is auditable.
 * Full resolution-persistence (writing the chosen value back onto attributes)
 * is a follow-up — the note captures intent without mutating source data.
 */
function DataConflictsCard({ entity }: { entity: EnrichedEntity }) {
  const conflicts = detectAttributeConflicts(entity);
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  if (conflicts.length === 0) return null;

  async function trust(field: string, value: string, key: string) {
    if (busy) return;
    setBusy(key);
    try {
      const res = await fetch(`/api/crm/entities/${entity.canonical_entity_id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: `[resolved conflict] ${field}=${value}` }),
      });
      if (res.ok) setResolved(prev => new Set(prev).add(key));
    } catch { /* leave unresolved; analyst can retry */ }
    setBusy(null);
  }

  return (
    <Card
      title="Data Conflicts"
      span
      action={<span className="text-[10px] text-text-muted">{conflicts.length} disagreement{conflicts.length === 1 ? '' : 's'} across sources</span>}
    >
      <div className="space-y-3">
        {conflicts.map((c, ci) => (
          <div key={ci} className="rounded border border-amber-500/20 bg-amber-500/5 px-3 py-2">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-400">{c.field.replace(/_/g, ' ')}</span>
              <span className="text-[11px] text-text-muted">{c.detail}</span>
            </div>
            <div className="space-y-1">
              {c.values.map((v, vi) => {
                const key = `${ci}:${vi}`;
                const done = resolved.has(`${ci}:0`) || resolved.has(`${ci}:1`);
                return (
                  <div key={vi} className="flex items-center justify-between gap-3">
                    <span className="text-xs text-text-secondary">
                      <span className="text-text-primary font-medium">{v.value}</span>
                      <span className="text-text-muted"> · {v.source}</span>
                    </span>
                    {done ? (
                      resolved.has(key)
                        ? <span className="text-[10px] text-green-400">✓ Trusted</span>
                        : <span className="text-[10px] text-text-muted">superseded</span>
                    ) : (
                      <button
                        onClick={() => trust(c.field, v.value, key)}
                        disabled={busy !== null}
                        className="text-[10px] px-2 py-0.5 rounded bg-mid-charcoal border border-border-subtle text-text-secondary hover:text-gold hover:border-gold/40 disabled:opacity-40 transition-colors shrink-0"
                      >
                        {busy === key ? 'Saving…' : 'Trust this'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * Human wealth-band override (IDEA 14). Sets or clears a hand-corrected band
 * via the wealth-override API; human decisions win, so the corrected band
 * supersedes the automated estimate wherever wealth is read. Mounted inside the
 * Wealth Profile card.
 */
function WealthOverrideControl({ entity }: { entity: EnrichedEntity }) {
  const override = entity.wealth?.override ?? null;
  const automatedBand = (override?.automated_band ?? entity.wealth?.band ?? 'unknown') as WealthBand;
  const [open, setOpen] = useState(false);
  const [band, setBand] = useState<WealthBand>((override?.band ?? automatedBand) as WealthBand);
  const [reason, setReason] = useState(override?.reason ?? '');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/crm/entities/${entity.canonical_entity_id}/wealth-override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ band, reason: reason || undefined }),
      });
      if (res.ok) window.location.reload();
    } catch { /* leave form open; analyst can retry */ }
    setBusy(false);
  }

  async function clear() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/crm/entities/${entity.canonical_entity_id}/wealth-override`, { method: 'DELETE' });
      if (res.ok) window.location.reload();
    } catch { /* leave as-is; analyst can retry */ }
    setBusy(false);
  }

  return (
    <div className="mt-3 pt-3 border-t border-border-subtle">
      {override ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-text-muted">
            <span className="text-amber-400 font-medium">Human override</span> — {WEALTH_BAND_LABELS[override.band]} (was {WEALTH_BAND_LABELS[automatedBand]})
            {override.reason && <span className="text-text-secondary"> · {override.reason}</span>}
          </p>
          <button onClick={clear} disabled={busy} className="text-[10px] text-text-muted hover:text-red-400 disabled:opacity-40 transition-colors shrink-0">
            {busy ? '…' : 'Clear'}
          </button>
        </div>
      ) : open ? (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-text-muted">Correct wealth band — human override wins</p>
          <div className="flex items-center gap-2">
            <select
              value={band}
              onChange={e => setBand(e.target.value as WealthBand)}
              className="bg-mid-charcoal border border-border-subtle rounded px-2 py-1 text-[11px] text-text-primary focus:outline-none focus:border-gold/50"
            >
              {WEALTH_BAND_ORDER.map(b => <option key={b} value={b}>{WEALTH_BAND_LABELS[b]}</option>)}
            </select>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Reason (optional)"
              className="flex-1 bg-mid-charcoal border border-border-subtle rounded px-2 py-1 text-[11px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold/50"
            />
            <button onClick={save} disabled={busy} className="text-[10px] px-2 py-1 rounded bg-gold/10 text-gold border border-gold/20 hover:bg-gold/20 disabled:opacity-40 transition-colors shrink-0">
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setOpen(false)} className="text-[10px] text-text-muted hover:text-text-secondary">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="text-[10px] text-text-muted hover:text-gold transition-colors">
          Correct wealth band (human override)
        </button>
      )}
    </div>
  );
}

export function EntityDetail({ entity }: { entity: EnrichedEntity }) {
  const [removedConnections, setRemovedConnections] = useState<Set<string>>(new Set());
  const visibleConnections = entity.connections.filter(c => !removedConnections.has(c.connection_id));

  // Compute the SAME §18.1 priority + §18.2 confidence the Lead Generator uses,
  // inline from the data already on the entity (see scoreLead's `extra` contract).
  const charityOverlap = entity.connections.filter(c => /foundation|trust|charit/i.test(c.via_organisation ?? '')).length;
  const directorshipCount = entity.connections.filter(c => /DIRECTOR|TRUSTEE/i.test(c.connection_type)).length;
  const newestEvidenceAt = entity.evidence.length > 0
    ? entity.evidence.reduce((newest, e) => (e.created_at > newest ? e.created_at : newest), entity.evidence[0].created_at)
    : null;
  const scored = scoreLead(
    entity.canonical_entity_id,
    entity.display_name,
    entity.attributes,
    entity.connections.length,
    charityOverlap,
    {
      evidenceCount: entity.evidence.length,
      newestEvidenceAt,
      directorshipCount,
      signalCategories: entity.signals?.byCategory,
      signalSources: entity.signals?.sources.length,
    },
  );
  const introPaths = Array.isArray(entity.attributes.intro_paths) ? scored.introPaths : [];
  const isScoredLead = introPaths.length > 0 || scored.category === 'hnw_target' || !!entity.attributes.target_category;

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
        {/* Data conflicts (IDEA 13) — only renders when sources disagree */}
        <DataConflictsCard entity={entity} />

        {/* Priority & Confidence — §18.1 / §18.2 scoring, mirrors the Lead Generator */}
        {isScoredLead && (
          <Card
            title="Priority & Confidence"
            span
            action={
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <span className="text-[10px] text-text-muted uppercase tracking-wider">Priority</span>
                  <span className="ml-2 text-lg font-semibold text-gold font-mono">{scored.priority}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-text-muted uppercase tracking-wider">Confidence</span>
                  <span className="ml-2 text-lg font-semibold text-text-primary font-mono">{scored.confidence}</span>
                </div>
              </div>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary mb-2">Priority dimensions (§18.1)</p>
                <div className="space-y-2.5">
                  {(Object.keys(PRIORITY_LABELS) as (keyof typeof scored.dimensions)[]).map(k => (
                    <DimensionBar key={k} label={PRIORITY_LABELS[k]} value={scored.dimensions[k]} explanation={scored.explanations[k]} />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary mb-2">Confidence dimensions (§18.2)</p>
                <div className="space-y-2.5">
                  {(Object.keys(CONFIDENCE_LABELS) as (keyof typeof scored.confidenceDimensions)[]).map(k => (
                    <DimensionBar key={k} label={CONFIDENCE_LABELS[k]} value={scored.confidenceDimensions[k]} />
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Enrichment signals — the complete grouped signal display */}
        <Card
          title="Enrichment Signals"
          span
          action={
            entity.signals && entity.signals.signals.length > 0 ? (
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-text-muted">{entity.signals.signals.length} signal{entity.signals.signals.length === 1 ? '' : 's'} · {entity.signals.sources.length} source{entity.signals.sources.length === 1 ? '' : 's'}</span>
                {entity.signals.multiSource && (
                  <span className="text-green-400 border border-green-400/20 bg-green-400/10 rounded px-1.5 py-0.5 font-semibold uppercase tracking-wider">✓ Multi-source</span>
                )}
              </div>
            ) : undefined
          }
        >
          <SignalList signals={entity.signals} />
        </Card>

        {/* Introduction paths — HOW to reach them */}
        {introPaths.length > 0 && (
          <Card title={`Introduction Paths (${introPaths.length})`} span>
            <div className="space-y-2.5">
              {introPaths.map(p => (
                <div key={p.rank} className="pb-2.5 border-b border-border-subtle last:border-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-mono text-text-muted shrink-0">#{p.rank}</span>
                      <span className="text-sm text-text-secondary">{p.path_names?.join(' → ') ?? p.root_supporter}</span>
                    </div>
                    <span className="text-xs font-mono text-gold shrink-0">{p.score}/100</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 ml-6 text-[11px] text-text-muted">
                    <span>from {p.root_supporter}{p.supporter_tier ? ` (${p.supporter_tier})` : ''}</span>
                    <span>{p.hops} hop{p.hops === 1 ? '' : 's'}</span>
                    {p.via_orgs?.length > 0 && <span>via {p.via_orgs.join(', ')}</span>}
                  </div>
                  {p.reason && <p className="text-[11px] text-text-muted mt-0.5 ml-6 leading-snug">{p.reason}</p>}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Suggested action — model-derived, deterministic from path facts */}
        {isScoredLead && (
          <Card
            title="Suggested Action"
            span
            action={<span className="text-[10px] text-text-muted italic">Suggested by model — verify before acting</span>}
          >
            <div className="space-y-2">
              <p className="text-sm text-text-primary leading-relaxed">{suggestedAction(introPaths[0], scored.category)}</p>
              <p className="text-xs text-text-secondary leading-relaxed">{qualificationFraming(scored.category)}</p>
            </div>
          </Card>
        )}

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
              <WealthOverrideControl entity={entity} />
            </div>
          </Card>
        )}

        {/* Giving history (donation_events) — recorded gifts, evidence-first. */}
        <Card title={`Giving History (${entity.donations.length})`}>
          {entity.donations.length > 0 ? (
            <div className="space-y-2.5 max-h-80 overflow-y-auto">
              {entity.donations.map(d => (
                <div key={d.donation_event_id} className="pb-2.5 border-b border-border-subtle last:border-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-text-secondary">
                      {d.recipient_name ?? 'Recipient not resolved'}
                    </span>
                    <span className="text-sm font-medium text-gold shrink-0">
                      {d.amount != null ? formatCurrency(d.amount) : 'Amount not stated'}
                    </span>
                  </div>
                  {d.detail && <p className="text-xs text-text-muted mt-1 leading-relaxed">{d.detail}</p>}
                  <div className="flex items-center gap-3 mt-1">
                    {d.year != null && <span className="text-xs text-text-muted font-mono">{d.year}</span>}
                    {d.source && <span className="text-xs text-text-muted">{d.source.replace(/_/g, ' ')}</span>}
                    {d.evidence_url && (
                      <a
                        href={d.evidence_url}
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
            <p className="text-sm text-text-muted">No recorded giving.</p>
          )}
        </Card>

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

        {/* Tags */}
        <Card title="Tags">
          <EntityTags entityId={entity.canonical_entity_id} />
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
