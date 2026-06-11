'use client';

import { useEffect, useMemo, useState } from 'react';
import { SUGGESTED_TAGS } from '@/lib/crm/tags';

interface EntityTag {
  tag_id: string;
  entity_id: string;
  tag: string;
  author: string;
  created_at: string;
}

/**
 * Per-entity tag editor (IDEA 9). Current tags show as removable chips; new tags
 * come from the SUGGESTED_TAGS pick-list or free-text. Adds/removes are
 * optimistic and de-duplicated, mirroring EntityNotes.
 */
export function EntityTags({ entityId }: { entityId: string }) {
  const [tags, setTags] = useState<EntityTag[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const res = await fetch(`/api/crm/entities/${entityId}/tags`);
        const json = await res.json();
        if (!cancelled) setTags(json.tags ?? []);
      } catch {
        if (!cancelled) setTags([]);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [entityId]);

  const current = useMemo(() => new Set((tags ?? []).map(t => t.tag)), [tags]);
  const unusedSuggestions = SUGGESTED_TAGS.filter(t => !current.has(t));

  async function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag || busy || current.has(tag)) { if (current.has(tag)) setDraft(''); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/crm/entities/${entityId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag }),
      });
      const json = await res.json();
      if (json.tag) {
        setTags(prev => {
          const next = prev ?? [];
          return next.some(t => t.tag === json.tag.tag) ? next : [...next, json.tag];
        });
        setDraft('');
      }
    } catch { /* keep draft so nothing is lost */ }
    setBusy(false);
  }

  async function removeTag(tag: EntityTag) {
    setTags(prev => (prev ?? []).filter(t => t.tag_id !== tag.tag_id));
    try {
      await fetch(`/api/crm/entities/${entityId}/tags?tag=${encodeURIComponent(tag.tag)}`, { method: 'DELETE' });
    } catch { /* server is source of truth on next load */ }
  }

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(draft); } }}
          placeholder="Add a tag…"
          className="flex-1 bg-mid-charcoal border border-border-subtle rounded-md px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold/50"
        />
        <button
          onClick={() => addTag(draft)}
          disabled={!draft.trim() || busy}
          className="text-xs px-3 py-1.5 rounded bg-gold/10 text-gold border border-gold/20 hover:bg-gold/20 disabled:opacity-30 transition-colors"
        >
          Add
        </button>
      </div>

      {tags === null ? (
        <p className="text-[10px] text-text-muted">Loading tags…</p>
      ) : tags.length === 0 ? (
        <p className="text-[10px] text-text-muted mb-3">No tags yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {tags.map(t => (
            <span key={t.tag_id} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-gold/30 bg-gold/[0.06] text-gold">
              {t.tag}
              <button
                onClick={() => removeTag(t)}
                title="Remove tag"
                className="text-gold/60 hover:text-red-400 transition-colors"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {unusedSuggestions.length > 0 && (
        <div>
          <p className="text-[9px] uppercase tracking-wider text-text-muted mb-1.5">Suggested</p>
          <div className="flex flex-wrap gap-1.5">
            {unusedSuggestions.map(s => (
              <button
                key={s}
                onClick={() => addTag(s)}
                disabled={busy}
                className="text-[11px] px-2 py-0.5 rounded-full border border-border-subtle bg-mid-charcoal/30 text-text-secondary hover:border-gold/40 hover:text-gold disabled:opacity-30 transition-colors"
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
