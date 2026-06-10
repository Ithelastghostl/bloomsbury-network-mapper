'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface SearchResult {
  canonical_entity_id: string;
  display_name: string;
  entity_type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attributes: Record<string, any>;
}

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
      if (!res.ok) return;
      const data = await res.json();
      if (!controller.signal.aborted) {
        setResults(data.results ?? []);
        setSelectedIdx(0);
      }
    } catch {
      // aborted or network error
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(query), 200);
    return () => clearTimeout(t);
  }, [query, search]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function navigate(id: string) {
    setOpen(false);
    setQuery('');
    setResults([]);
    router.push(`/crm/entity/${id}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && results[selectedIdx]) { navigate(results[selectedIdx].canonical_entity_id); }
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="flex items-center gap-2 bg-mid-charcoal border border-border-subtle rounded-md px-3 py-1.5 text-sm text-text-muted hover:text-text-secondary hover:border-gold/30 transition-colors w-64"
      >
        <span className="text-xs">⌘K</span>
        <span>Search people...</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setOpen(false)} />
          <div className="fixed top-[15%] left-1/2 -translate-x-1/2 w-[520px] max-h-[60vh] bg-deep-charcoal border border-border-subtle rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-border-subtle">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search people, organisations..."
                className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
                autoFocus
              />
            </div>
            <div className="overflow-y-auto max-h-[45vh]">
              {loading && results.length === 0 && (
                <p className="px-4 py-6 text-sm text-text-muted text-center">Searching...</p>
              )}
              {!loading && query.length >= 2 && results.length === 0 && (
                <p className="px-4 py-6 text-sm text-text-muted text-center">No results found.</p>
              )}
              {results.map((r, i) => {
                const si = r.attributes?.seed_info;
                const intro = r.attributes?.introduction;
                return (
                  <button
                    key={r.canonical_entity_id}
                    onClick={() => navigate(r.canonical_entity_id)}
                    className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition-colors ${
                      i === selectedIdx ? 'bg-gold/10' : 'hover:bg-mid-charcoal'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-text-primary truncate">{r.display_name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-text-muted capitalize">{r.entity_type}</span>
                        {si?.source === 'supporters' && <span className="text-[10px] text-gold">Supporter</span>}
                        {si?.source === 'hnw_targets' && <span className="text-[10px] text-orange-400">HNW Target</span>}
                        {intro?.degree != null && intro.degree > 0 && (
                          <span className="text-[10px] text-text-muted">{intro.degree}-hop from {intro.root_supporter}</span>
                        )}
                      </div>
                    </div>
                    {r.attributes?.target_category && (
                      <span className="text-[10px] text-text-muted shrink-0">{r.attributes.target_category.replace(/_/g, ' ')}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
