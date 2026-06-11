/**
 * Activate the dormant donation_events table (IDEA 7) from evidence we already
 * hold — EVIDENCE-FIRST: this never invents an amount, a year, or a donation.
 *
 * It scans enrichment_evidence for rows whose evidence_text actually contains
 * giving language (donate / grant / gift / pledge / endow / benefaction …) and,
 * for each match, writes one app.donation_events row:
 *   donor_entity_id      = the evidence row's entity_id
 *   recipient_entity_id  = a canonical entity whose name appears in the sentence,
 *                          else null (the named recipient is kept in `detail`)
 *   amount / currency / year = parsed ONLY when clearly present, else null
 *   evidence_url / source / detail / confidence = carried from the evidence row
 *
 * Be realistic about the corpus: most enrichment_evidence today is companies_house
 * director facts + web_search bios, so the parseable-donation count is expected to
 * be THIN (possibly zero). That is the true state — the plumbing is the deliverable
 * and it lights up when richer enrichment (electoral_commission / 360Giving grants)
 * runs. The log reports the real count, low or zero, without dressing it up.
 *
 * Idempotent: skips inserting when a donation_event already exists for the same
 * (donor_entity_id, detail) pair.
 *
 * Usage:  npx tsx scripts/ingest-donations.ts [--dry-run]
 * Env:    SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *         (auto-loaded from web/.env.local)
 */
import fs from 'fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { generateId } from '../src/lib/ulid';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

for (const line of (fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8').split(/\r?\n/) : [])) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
function req(...keys: string[]): string {
  for (const k of keys) { const v = process.env[k]; if (v) return v; }
  throw new Error(`Missing env: one of ${keys.join(', ')}`);
}

async function pageAll(sb: DB, table: string, cols: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []; let from = 0;
  for (;;) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    out.push(...(data as Record<string, unknown>[]));
    if (data.length < 1000) break;
    from += 1000;
  }
  return out;
}

/**
 * Discrete-giving language only — a donation/grant/gift EVENT, not a vague
 * "philanthropist" descriptor (that's a wealth signal, handled elsewhere; folding
 * it in here would pollute donation_events with un-evidenced bio puffery). "grant"
 * and "gift" are constrained to their giving senses (followed by of/to/worth/…)
 * so they don't fire on "granted permission" / "gifted athlete".
 */
const DONATION_RE = /\b(donat(?:e|ed|es|ing|ion|ions)|grant(?:ed|s|ing)?\s+(?:of|to|worth|totalling|totaling)|gift(?:ed|s)?\s+(?:of|to|worth)|pledg(?:e|ed|es|ing)\s+(?:£|\$|to|of)|endow(?:ed|ment|ments)|benefaction|bequest(?:ed|s)?|major\s+gift|gave\s+£)/i;

/** Amount: £/$ then a number with optional thousands separators + optional m/bn/k or "million"/"billion". */
const AMOUNT_RE = /[£$]\s?([\d][\d,]*(?:\.\d+)?)\s*(bn|billion|m|mn|million|k|thousand)?\b/i;
/** A 4-digit year in a plausible giving window. */
const YEAR_RE = /\b(20[0-2]\d)\b/;

function parseAmount(text: string): number | null {
  const m = text.match(AMOUNT_RE);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  if (!isFinite(n)) return null;
  const unit = (m[2] ?? '').toLowerCase();
  if (unit === 'bn' || unit === 'billion') return Math.round(n * 1e9);
  if (unit === 'm' || unit === 'mn' || unit === 'million') return Math.round(n * 1e6);
  if (unit === 'k' || unit === 'thousand') return Math.round(n * 1e3);
  // Bare "£500" is too noisy to trust as a donation amount; require either a
  // unit or a thousands-separated figure (£250,000) to record an amount.
  if (!m[1].includes(',')) return null;
  return Math.round(n);
}

function parseYear(text: string): number | null {
  const m = text.match(YEAR_RE);
  return m ? parseInt(m[1], 10) : null;
}

/** The sentence around the first donation keyword — keeps `detail` focused. */
function donationSentence(text: string): string {
  const idx = text.search(DONATION_RE);
  if (idx < 0) return text.slice(0, 300);
  const sentences = text.split(/(?<=[.!?])\s+/);
  let pos = 0;
  for (const s of sentences) {
    if (idx >= pos && idx < pos + s.length + 1) return s.trim().slice(0, 500);
    pos += s.length + 1;
  }
  return text.slice(Math.max(0, idx - 60), idx + 240).trim();
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const sb = createClient(req('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'), req('SUPABASE_SERVICE_ROLE_KEY'), {
    db: { schema: 'app' }, auth: { persistSession: false },
  });

  console.log('Loading enrichment_evidence + canonical_entities + existing donation_events…');
  const evidence = await pageAll(sb, 'enrichment_evidence', 'entity_id, source, evidence_text, evidence_url, confidence');
  const entities = await pageAll(sb, 'canonical_entities', 'canonical_entity_id, display_name, entity_type');
  const existing = await pageAll(sb, 'donation_events', 'donor_entity_id, detail');

  console.log(`  enrichment_evidence rows: ${evidence.length}`);

  // Idempotency key: donor + detail. Build the set of pairs already recorded.
  const have = new Set(existing.map(d => `${d.donor_entity_id}::${d.detail ?? ''}`));

  // For (optional) recipient resolution: org-type canonical entities, longest
  // names first so the most specific match wins. Only well-formed names (≥6 chars,
  // multi-word) are eligible — avoids matching a one-word common noun.
  const orgs = entities
    .filter(e => e.entity_type === 'company')
    .map(e => ({ id: e.canonical_entity_id as string, name: ((e.display_name as string) ?? '').trim() }))
    .filter(o => o.name.length >= 6 && /\s/.test(o.name))
    .sort((a, b) => b.name.length - a.name.length);

  function resolveRecipient(sentence: string, donorId: string): string | null {
    const lc = sentence.toLowerCase();
    for (const o of orgs) {
      if (o.id === donorId) continue;
      if (lc.includes(o.name.toLowerCase())) return o.id;
    }
    return null;
  }

  const rows: Record<string, unknown>[] = [];
  let matched = 0, withAmount = 0, withYear = 0, withRecipient = 0, skippedDup = 0, skippedNoUrl = 0;
  const bySource: Record<string, number> = {};

  for (const ev of evidence) {
    const text = ((ev.evidence_text as string) ?? '');
    if (!text || !DONATION_RE.test(text)) continue;
    matched++;

    const donorId = ev.entity_id as string;
    const sentence = donationSentence(text);
    const detail = sentence;

    const key = `${donorId}::${detail}`;
    if (have.has(key)) { skippedDup++; continue; }
    have.add(key);

    // Evidence-first guarantee (donation_events_evidence_present): enrichment
    // rows have no evidence_span, so they must carry an evidence_url. Without one
    // we can't anchor the claim to a citable source — skip rather than assert a
    // hard donation record on an unciteable mention.
    const evidenceUrl = (ev.evidence_url as string) ?? null;
    if (!evidenceUrl) { skippedNoUrl++; continue; }

    const amount = parseAmount(sentence);
    const year = parseYear(sentence);
    const recipientId = resolveRecipient(sentence, donorId);
    const source = (ev.source as string) ?? null;
    if (amount != null) withAmount++;
    if (year != null) withYear++;
    if (recipientId) withRecipient++;
    if (source) bySource[source] = (bySource[source] ?? 0) + 1;

    rows.push({
      donation_event_id: generateId(),
      run_id: null,
      donor_entity_id: donorId,
      recipient_entity_id: recipientId,
      amount,
      currency: amount != null ? 'GBP' : null,
      year,
      evidence_id: null,
      evidence_url: evidenceUrl,
      source,
      detail,
      confidence: typeof ev.confidence === 'number' ? ev.confidence : null,
    });
  }

  console.log(`\nGiving-language matches in evidence: ${matched}`);
  console.log(`  new donation_events to write: ${rows.length} (skipped ${skippedDup} already-recorded, ${skippedNoUrl} with no citable source URL)`);
  console.log(`  with a parsed amount: ${withAmount} | with a year: ${withYear} | with a resolved recipient: ${withRecipient}`);
  console.log(`  by source: ${JSON.stringify(bySource)}`);
  if (matched === 0) {
    console.log('\nNo giving language found in enrichment_evidence yet. This is the real state:');
    console.log('the corpus currently holds companies_house director facts + web_search bios,');
    console.log('not electoral_commission / 360Giving grant records. The table + scoring + UI');
    console.log('plumbing is in place and will populate when richer enrichment runs.');
  }

  if (dryRun) { console.log('\nDRY RUN — nothing written.'); return; }
  if (rows.length === 0) { console.log('\nNothing to insert.'); return; }

  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await sb.from('donation_events').insert(chunk);
    if (error) throw new Error(`insert chunk ${i}: ${error.message}`);
    process.stdout.write(`  inserted ${Math.min(i + 200, rows.length)}/${rows.length}\r`);
  }
  console.log(`\nDone. ${rows.length} donation_events rows written.`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
