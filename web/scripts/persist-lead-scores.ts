/**
 * Persist the Lead Generator's composite scores to app.lead_scores, keyed by
 * SCORING_CONFIG_VERSION, and register the formula in app.scoring_configs.
 * Makes ranked lists reproducible and queryable (the UI computes the same
 * scores at render time from the same shared loader).
 *
 * Usage: npx tsx scripts/persist-lead-scores.ts [--dry-run]
 * Env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 */
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { computeScoredLeads } from '../src/lib/crm/lead-loader';
import { SCORING_CONFIG_VERSION, SCORING_WEIGHTS } from '../src/lib/crm/lead-score';

for (const line of (fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8').split(/\r?\n/) : [])) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
function req(k: string, fallback?: string): string {
  const v = process.env[k] ?? (fallback ? process.env[fallback] : undefined);
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const sb = createClient(
    req('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'),
    req('SUPABASE_SERVICE_ROLE_KEY'),
    { db: { schema: 'app' }, auth: { persistSession: false } },
  );

  console.log('Scoring leads...');
  const leads = await computeScoredLeads(sb);
  console.log(`Scored ${leads.length} leads (config ${SCORING_CONFIG_VERSION}).`);

  if (dryRun) {
    console.log('[DRY RUN] top 10:');
    for (const l of leads.slice(0, 10)) console.log(`  ${l.compositeScore}  ${l.name}${l.existingDonor ? `  [${l.existingDonor.kind}]` : ''}`);
    return;
  }

  // Register the formula version (idempotent).
  const { error: cfgErr } = await sb.from('scoring_configs').upsert({
    scoring_config_version: SCORING_CONFIG_VERSION,
    config: { type: 'crm_lead_composite', weights: SCORING_WEIGHTS },
    promoted_by: 'persist-lead-scores',
    rationale: 'Composite Lead Generator score: connectivity 20%, wealth 30%, paths 30%, affinity 20%.',
  }, { onConflict: 'scoring_config_version' });
  if (cfgErr) throw new Error(`scoring_configs: ${cfgErr.message}`);

  // Replace this version's scores wholesale (rank set changes between runs).
  const { error: delErr } = await sb.from('lead_scores').delete().eq('config_version', SCORING_CONFIG_VERSION);
  if (delErr) throw new Error(`lead_scores delete: ${delErr.message}`);

  const rows = leads.map(l => ({
    entity_id: l.id,
    config_version: SCORING_CONFIG_VERSION,
    composite: l.compositeScore,
    connectivity: l.connectivity,
    wealth: l.networkWorth,
    paths: l.breakdown.paths,
    affinity: l.donorAffinity,
    min_hops: l.minHops,
    path_count: l.pathCount,
    category: l.category,
  }));

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await sb.from('lead_scores').insert(chunk);
    if (error) throw new Error(`lead_scores insert (batch ${i / 500}): ${error.message}`);
    process.stdout.write(`  ${Math.min(i + 500, rows.length)}/${rows.length}\r`);
  }
  console.log(`\nDone. ${rows.length} lead scores persisted under ${SCORING_CONFIG_VERSION}.`);
}
main().catch(e => { console.error('Fatal:', e); process.exit(1); });
