'use client';

import { useEffect, useState } from 'react';

export interface EntityNote {
  note_id: string;
  entity_id: string;
  author: string;
  body: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Persistent analyst notes for one entity. Notes live in app.entity_notes so
 * they survive re-scores, re-augmentation, and action-item churn.
 */
export function EntityNotes({ entityId, compact = false }: { entityId: string; compact?: boolean }) {
  const [notes, setNotes] = useState<EntityNote[] | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const res = await fetch(`/api/crm/entities/${entityId}/notes`);
        const json = await res.json();
        if (!cancelled) setNotes(json.notes ?? []);
      } catch {
        if (!cancelled) setNotes([]);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [entityId]);

  async function addNote() {
    const body = draft.trim();
    if (!body || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/crm/entities/${entityId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      const json = await res.json();
      if (json.note) {
        setNotes(prev => [json.note, ...(prev ?? [])]);
        setDraft('');
      }
    } catch { /* leave draft intact so nothing is lost */ }
    setSaving(false);
  }

  async function togglePin(note: EntityNote) {
    const res = await fetch(`/api/crm/notes/${note.note_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: !note.pinned }),
    });
    const json = await res.json();
    if (json.note) {
      setNotes(prev => {
        const next = (prev ?? []).map(n => n.note_id === note.note_id ? json.note : n);
        next.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at));
        return next;
      });
    }
  }

  async function removeNote(note: EntityNote) {
    const res = await fetch(`/api/crm/notes/${note.note_id}`, { method: 'DELETE' });
    if (res.ok) setNotes(prev => (prev ?? []).filter(n => n.note_id !== note.note_id));
  }

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Add a persistent note (survives re-scores and re-augmentation)…"
          rows={compact ? 1 : 2}
          className="flex-1 bg-mid-charcoal border border-border-subtle rounded-md px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold/50 resize-y"
        />
        <button
          onClick={addNote}
          disabled={!draft.trim() || saving}
          className="self-start text-xs px-3 py-1.5 rounded bg-gold/10 text-gold border border-gold/20 hover:bg-gold/20 disabled:opacity-30 transition-colors"
        >
          {saving ? 'Saving…' : 'Add note'}
        </button>
      </div>

      {notes === null ? (
        <p className="text-[10px] text-text-muted">Loading notes…</p>
      ) : notes.length === 0 ? (
        <p className="text-[10px] text-text-muted">No notes yet.</p>
      ) : (
        <div className={`space-y-1.5 ${compact ? 'max-h-40' : 'max-h-72'} overflow-y-auto`}>
          {notes.map(n => (
            <div key={n.note_id} className={`rounded border px-2.5 py-1.5 ${n.pinned ? 'border-gold/30 bg-gold/[0.04]' : 'border-border-subtle bg-mid-charcoal/30'}`}>
              <p className="text-xs text-text-secondary whitespace-pre-wrap">{n.body}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[9px] text-text-muted">{n.author} · {n.created_at.slice(0, 10)}</span>
                <button onClick={() => togglePin(n)} className="text-[9px] text-text-muted hover:text-gold transition-colors">
                  {n.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button onClick={() => removeNote(n)} className="text-[9px] text-text-muted hover:text-red-400 transition-colors">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
