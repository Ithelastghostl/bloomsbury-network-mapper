/**
 * Score persons from their stored network position + evidence, for everyone
 * who has no wealth_estimate yet. Complements the per-transcript scorer
 * (wealth-scorer.ts) which only runs on people who had a research transcript.
 *
 * Signals are read from the DB (no web research, no fabrication):
 *   - active directorships (network_connections DIRECTOR_OF)
 *   - co-director network degree (co_director_edges)
 *   - charity/foundation involvement (CO_TRUSTEE edges + charity-named cos)
 *   - evidence rows that name wealth/rich-list/fund/property keywords
 * A person only gets a non-`unknown` band when real signal exists; bare names
 * with one weak link stay `unknown` (kept, not invented).
 *
 * Usage:
 *   npx tsx scripts/score-network-position.ts [--dry-run] [--all]
 *     --all     re-score everyone (default: only persons with NO estimate yet)
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { generateId } from '../src/lib/ulid';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

const CHARITY_WORDS = ['foundation', 'trust', 'charity', 'charitable', 'endowment'];

type Signal = { signal: string; source_layer: string; contribution: number; detail: string };

async function pageAll(sb: DB, table: string, cols: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || !data.length) break;
    out.push(...(data as Record<string, unknown>[]));
    if (data.length < 1000) break;
    from += 1000;
  }
  return out;
}

function bandFromScore(score: number): string {
  if (score >= 0.80) return '100m_plus';
  if (score >= 0.65) return '25m_100m';
  if (score >= 0.45) return '5m_25m';
  if (score >= 0.25) return '1m_5m';
  return 'unknown';
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const scoreAll = args.includes('--all');

  const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    db: { schema: 'app' }, auth: { persistSession: false },
  });

  console.log('Loading entities, connections, edges, evidence…');
  const entities = await pageAll(sb, 'canonical_entities', 'canonical_entity_id, display_name, entity_type, attributes');
  const persons = entities.filter(e => e.entity_type === 'person');
  const entityType = new Map(entities.map(e => [e.canonical_entity_id as string, e.entity_type as string]));
  const entityName = new Map(entities.map(e => [e.canonical_entity_id as string, (e.display_name as string) ?? '']));

  const conns = await pageAll(sb, 'network_connections', 'source_entity_id, connected_entity_id, connection_type, via_organisation');
  const cdEdges = await pageAll(sb, 'co_director_edges', 'seed_entity_id, co_director_entity_id, company_name');
  const evidence = await pageAll(sb, 'enrichment_evidence', 'entity_id, evidence_text');
  const existingEst = new Set((await pageAll(sb, 'wealth_estimates', 'entity_id')).map(r => r.entity_id as string));

  // Build per-person signal aggregates
  const dirCount = new Map<string, number>();           // DIRECTOR_OF
  const charityCount = new Map<string, Set<string>>();  // distinct charities they touch
  const coDeg = new Map<string, Set<string>>();          // distinct co-directors
  const coTrustee = new Map<string, number>();           // CO_TRUSTEE edges
  const evText = new Map<string, string>();              // concatenated evidence text

  const isCharity = (name: string) => {
    const n = (name || '').toLowerCase();
    return CHARITY_WORDS.some(w => n.includes(w));
  };

  for (const c of conns) {
    const src = c.source_entity_id as string;
    const t = c.connection_type as string;
    if (t === 'DIRECTOR_OF') {
      dirCount.set(src, (dirCount.get(src) ?? 0) + 1);
      if (isCharity((c.via_organisation as string) ?? entityName.get(c.connected_entity_id as string) ?? '')) {
        if (!charityCount.has(src)) charityCount.set(src, new Set());
        charityCount.get(src)!.add((c.connected_entity_id as string) ?? (c.via_organisation as string));
      }
    } else if (t === 'CO_TRUSTEE') {
      coTrustee.set(src, (coTrustee.get(src) ?? 0) + 1);
    }
  }
  for (const e of cdEdges) {
    const a = e.seed_entity_id as string, b = e.co_director_entity_id as string;
    if (!coDeg.has(a)) coDeg.set(a, new Set());
    if (!coDeg.has(b)) coDeg.set(b, new Set());
    coDeg.get(a)!.add(b); coDeg.get(b)!.add(a);
    if (isCharity(e.company_name as string)) {
      for (const id of [a, b]) { if (!charityCount.has(id)) charityCount.set(id, new Set()); charityCount.get(id)!.add(e.company_name as string); }
    }
  }
  for (const ev of evidence) {
    const id = ev.entity_id as string;
    evText.set(id, (evText.get(id) ?? '') + ' ' + ((ev.evidence_text as string) ?? '').toLowerCase());
  }

  const targets = persons.filter(p => scoreAll || !existingEst.has(p.canonical_entity_id as string));
  console.log(`Persons: ${persons.length}. To score this run: ${targets.length} (${scoreAll ? 'all' : 'unscored only'}).`);

  const sweepRunId = generateId();
  const bandTally: Record<string, number> = {};
  let written = 0, skippedNoSignal = 0;
  const rows: Record<string, unknown>[] = [];

  for (const p of targets) {
    const id = p.canonical_entity_id as string;
    const evidenceArr: Signal[] = [];
    let score = 0;

    const nDir = dirCount.get(id) ?? 0;
    if (nDir > 0) { const c = Math.min(nDir * 0.015, 0.15); evidenceArr.push({ signal: 'active_directorships', source_layer: 'A', contribution: c, detail: `${nDir} directorships in graph` }); score += c; }

    const deg = coDeg.get(id)?.size ?? 0;
    if (deg >= 3) { const c = Math.min(deg * 0.006, 0.12); evidenceArr.push({ signal: 'co_director_network', source_layer: 'A', contribution: c, detail: `${deg} board co-directors` }); score += c; }

    const nChar = charityCount.get(id)?.size ?? 0;
    const nTrustee = coTrustee.get(id) ?? 0;
    const phil = nChar + nTrustee;
    if (phil > 0) { const c = Math.min(phil * 0.03, 0.12); evidenceArr.push({ signal: 'philanthropy', source_layer: 'B', contribution: c, detail: `${nChar} charity/foundation links, ${nTrustee} co-trustee ties` }); score += c; }

    const text = evText.get(id) ?? '';
    if (text) {
      if (/\bbillion|billionaire\b/.test(text)) { evidenceArr.push({ signal: 'billionaire_reference', source_layer: 'B', contribution: 0.25, detail: 'Billion reference in evidence' }); score += 0.25; }
      else { const m = text.match(/[£$]\s*(\d+)\s*(?:m\b|million)/); if (m) { const amt = parseInt(m[1], 10); const c = amt >= 100 ? 0.20 : amt >= 25 ? 0.15 : amt >= 5 ? 0.10 : 0.05; evidenceArr.push({ signal: 'million_reference', source_layer: 'B', contribution: c, detail: `${m[0]} in evidence` }); score += c; } }
      if (/rich list|sunday times|forbes/.test(text)) { evidenceArr.push({ signal: 'rich_list_mention', source_layer: 'B', contribution: 0.15, detail: 'Rich list / Forbes in evidence' }); score += 0.15; }
      if (/property|real estate|portfolio/.test(text)) { evidenceArr.push({ signal: 'property_signals', source_layer: 'B', contribution: 0.05, detail: 'Property references' }); score += 0.05; }
      if (/hedge fund|private equity|\bfund\b|investment/.test(text)) { evidenceArr.push({ signal: 'fund_management', source_layer: 'B', contribution: 0.10, detail: 'Fund / investment references' }); score += 0.10; }
    }

    // Only persist where there is genuine signal. Bare names → skip (stay unknown, no row).
    if (evidenceArr.length === 0) { skippedNoSignal++; continue; }

    score = Math.min(score, 1.0);
    const band = bandFromScore(score);
    // An `unknown` band carries no ranking value — don't write a noise row for it.
    // Keep the person unscored (they show as Pipeline, awaiting research).
    if (band === 'unknown') { skippedNoSignal++; continue; }
    const confidence = Math.min(0.35 + evidenceArr.length * 0.08, 0.85); // network-only is slightly lower confidence than researched
    bandTally[band] = (bandTally[band] ?? 0) + 1;

    // Tag the method inside evidence so this sweep is identifiable/reversible
    // without needing a sweep_runs FK row (sweep_run_id is nullable, matching
    // how the batch-ingest scorer writes).
    evidenceArr.push({ signal: 'scoring_method', source_layer: 'A', contribution: 0, detail: `network_position_sweep:${sweepRunId}` });
    rows.push({
      wealth_estimate_id: generateId(),
      entity_id: id,
      band, score: Math.round(score * 1000) / 1000, confidence,
      evidence: evidenceArr,
      sweep_run_id: null,
      assessed_at: new Date().toISOString(),
    });
    written++;
  }

  console.log(`\nScored ${written} | skipped (no signal, left unknown): ${skippedNoSignal}`);
  console.log('Band distribution this sweep:', JSON.stringify(bandTally));
  console.log('sweep_run_id:', sweepRunId);

  if (dryRun) { console.log('\nDRY RUN — nothing written.'); return; }

  // Insert in chunks
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await sb.from('wealth_estimates').insert(chunk);
    if (error) throw new Error(`insert chunk ${i}: ${error.message}`);
    process.stdout.write(`  inserted ${Math.min(i + 500, rows.length)}/${rows.length}\r`);
  }
  console.log(`\nDone. ${written} wealth_estimates rows written (sweep ${sweepRunId}).`);
  // suppress unused warning
  void entityType;
}

function requireEnv(k: string): string { const v = process.env[k]; if (!v) throw new Error(`Missing env: ${k}`); return v; }

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
