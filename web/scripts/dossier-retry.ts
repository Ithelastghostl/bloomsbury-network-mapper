/**
 * Dossier retry step — second-pass, charity-anchored augmentation for people the
 * first pass could not confidently identify (e.g. private Bloomsbury Football
 * donors/supporters with no generic web footprint).
 *
 * The web research itself is performed by the Claude Code subscription (NOT a
 * metered API — see PIPELINE_AUGMENTATION_PLAN.md / memory), so this script is a
 * harness with two modes:
 *
 *   1. List the retry queue (people flagged as needing better augmentation):
 *        npx tsx scripts/dossier-retry.ts --list
 *      Prints JSON: [{ canonical_entity_id, name, dossier_attempts, next_action }]
 *      Claude Code then researches each one (anchored on the charity: trustees,
 *      Charity Commission, donor/gala pages, LinkedIn co-occurrence) and writes a
 *      dossier object per person.
 *
 *   2. Apply researched dossiers back to the DB (idempotent, re-runnable):
 *        npx tsx scripts/dossier-retry.ts --apply <dossiers.json>
 *      where the file is an array of DossierResult (see type below). Each is
 *      stored on canonical_entities.attributes.dossier, dossier_attempts is
 *      incremented, and the human-review flag is set/cleared from `found`.
 *
 * A person enters the retry queue when attributes.needs_human_review === true OR
 * attributes.identity_confirmed === false. Confirmed people (found + high
 * confidence) leave the queue automatically.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-loaded from web/.env.local).
 */
import fs from 'fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;
type Attrs = Record<string, unknown>;

interface DossierResult {
  canonical_entity_id?: string;
  name: string;
  found: boolean;
  identity_confidence: 'high' | 'medium' | 'low';
  bloomsbury_connection?: string;
  current_role?: string;
  employer?: string;
  location?: string;
  wealth_signal?: string | null;
  summary?: string;
  candidate_leads?: Array<{ lead: string; url?: string }>;
  sources?: string[];
  reviewer_notes?: string;
}

function loadEnv() {
  const p = '.env.local';
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

function req(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
}

function client(): DB {
  return createClient(req('SUPABASE_URL'), req('SUPABASE_SERVICE_ROLE_KEY'), {
    db: { schema: 'app' }, auth: { persistSession: false },
  });
}

/** People flagged as needing a better dossier. Filtered server-side so the
 * 1000-row PostgREST page limit can't hide flagged people in a large table. */
async function listQueue(sb: DB) {
  const { data, error } = await sb
    .from('canonical_entities')
    .select('canonical_entity_id, display_name, attributes')
    .eq('entity_type', 'person')
    .or('attributes->>needs_human_review.eq.true,attributes->>identity_confirmed.eq.false');
  if (error) throw new Error(error.message);
  const queue = (data ?? [])
    .map((e: { canonical_entity_id: string; display_name: string; attributes: Attrs }) => ({
      canonical_entity_id: e.canonical_entity_id,
      name: e.display_name,
      dossier_attempts: (e.attributes?.dossier_attempts as number) ?? 0,
      next_action: e.attributes?.next_action ?? null,
    }));
  console.log(JSON.stringify(queue, null, 2));
  console.error(`\n${queue.length} person(s) in the dossier-retry queue.`);
}

async function applyDossiers(sb: DB, file: string) {
  const results = JSON.parse(fs.readFileSync(file, 'utf8')) as DossierResult[];
  const nowIso = new Date().toISOString();
  let updated = 0;

  for (const r of results) {
    // Resolve the entity by id, else by exact display name.
    let id = r.canonical_entity_id;
    let attrs: Attrs = {};
    if (id) {
      const { data } = await sb.from('canonical_entities').select('attributes').eq('canonical_entity_id', id).single();
      attrs = (data?.attributes as Attrs) ?? {};
    } else {
      const { data } = await sb.from('canonical_entities').select('canonical_entity_id, attributes').eq('display_name', r.name).eq('entity_type', 'person').limit(1);
      if (!data?.length) { console.error(`! no entity for "${r.name}" — skipped`); continue; }
      id = data[0].canonical_entity_id as string;
      attrs = (data[0].attributes as Attrs) ?? {};
    }

    const confirmed = r.found && r.identity_confidence === 'high';
    const dossier = {
      generated_at: nowIso,
      method: 'charity_anchored_retry',
      found: r.found,
      identity_confidence: r.identity_confidence,
      bloomsbury_connection: r.bloomsbury_connection ?? null,
      current_role: r.current_role ?? null,
      employer: r.employer ?? null,
      location: r.location ?? null,
      wealth_signal: r.wealth_signal ?? null,
      summary: r.summary ?? null,
      candidate_leads: r.candidate_leads ?? [],
      sources: r.sources ?? [],
      reviewer_notes: r.reviewer_notes ?? null,
    };

    const next: Attrs = {
      ...attrs,
      dossier,
      dossier_attempts: ((attrs.dossier_attempts as number) ?? 0) + 1,
      identity_confirmed: confirmed ? true : false,
      // Flag for closer human review unless we now have a confident identity.
      needs_human_review: !confirmed,
      augmentation_quality: confirmed ? 'ok' : 'low',
      review_reason: confirmed
        ? null
        : `Identity unconfirmed after ${((attrs.dossier_attempts as number) ?? 0) + 1} pass(es) incl. charity-anchored retry — verify against internal Bloomsbury Football donor/event records before outreach.`,
      next_action: confirmed ? (attrs.next_action ?? 'Research contact route') : 'Confirm identity from internal CRM/referral source',
    };

    const { error } = await sb.from('canonical_entities').update({ attributes: next }).eq('canonical_entity_id', id);
    if (error) { console.error(`! ${r.name}: ${error.message}`); continue; }
    updated++;
    console.error(`${confirmed ? 'CONFIRMED' : 'flagged  '} ${r.name} (attempt ${next.dossier_attempts})`);
  }
  console.error(`\nApplied ${updated}/${results.length} dossier(s).`);
}

async function main() {
  loadEnv();
  const sb = client();
  const args = process.argv.slice(2);
  if (args.includes('--list') || args.length === 0) {
    await listQueue(sb);
  } else if (args.includes('--apply')) {
    const file = args[args.indexOf('--apply') + 1];
    if (!file) throw new Error('--apply requires a path to a dossiers JSON file');
    await applyDossiers(sb, file);
  } else {
    console.error('Usage: dossier-retry.ts --list | --apply <dossiers.json>');
    process.exit(1);
  }
}
main().catch(e => { console.error('Fatal:', e); process.exit(1); });
