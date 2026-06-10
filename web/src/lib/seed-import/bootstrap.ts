import { ulid } from 'ulid';
import type { SupabaseClient } from '@supabase/supabase-js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;
import type { BootstrapMatch, BootstrapResult } from '@/types/seed-import';
import type { SeedImportRow } from '@/types/database';
import { normaliseName } from './xlsx-parser';

const AUTO_LINK_THRESHOLD = 0.95;
const QUARANTINE_THRESHOLD = 0.85;

interface BootstrapOptions {
  runId: string;
  importId: string;
  importType: 'hnw_targets' | 'supporters';
  userId: string;
}

export async function bootstrapMatchName(
  supabase: AnySupabaseClient,
  firstName: string,
  lastName: string,
  affiliation?: string,
): Promise<BootstrapMatch | null> {
  const normFirst = normaliseName(firstName);
  const normLast = normaliseName(lastName);
  const searchName = `${normFirst} ${normLast}`.trim();
  if (!searchName) return null;

  const { data, error } = await supabase.rpc('bootstrap_name_match', {
    search_name: searchName,
    match_threshold: 0.6,
    result_limit: 5,
  });

  if (error || !data || data.length === 0) return null;

  let bestMatch = data[0] as {
    canonical_entity_id: string;
    display_name: string;
    similarity: number;
  };
  let bestScore = bestMatch.similarity;
  let affiliationMatch = false;

  if (affiliation) {
    const normAff = affiliation.toLowerCase().trim();
    for (const candidate of data) {
      const attrs = (candidate as Record<string, unknown>).attributes as Record<string, unknown> | undefined;
      const candidateOrgs = JSON.stringify(attrs ?? {}).toLowerCase();
      const hasAff = candidateOrgs.includes(normAff);
      const boosted = candidate.similarity + (hasAff ? 0.05 : 0);
      if (boosted > bestScore) {
        bestScore = boosted;
        bestMatch = candidate;
        affiliationMatch = hasAff;
      }
    }
  }

  return {
    canonical_entity_id: bestMatch.canonical_entity_id,
    display_name: bestMatch.display_name,
    similarity: Math.min(bestScore, 1.0),
    affiliation_match: affiliationMatch,
  };
}

export async function bootstrapRow(
  supabase: AnySupabaseClient,
  row: SeedImportRow,
  opts: BootstrapOptions,
): Promise<BootstrapResult> {
  const match = await bootstrapMatchName(
    supabase,
    row.first_name,
    row.last_name,
    row.primary_affiliation ?? undefined,
  );

  if (match && match.similarity >= AUTO_LINK_THRESHOLD) {
    return {
      row_id: row.row_id,
      action: 'linked',
      canonical_entity_id: match.canonical_entity_id,
      match_confidence: match.similarity,
      match_details: match,
    };
  }

  if (match && match.similarity >= QUARANTINE_THRESHOLD) {
    const entityId = ulid();
    await createCanonicalEntity(supabase, entityId, row, opts.runId);

    await supabase.from('quarantine').insert({
      quarantine_id: ulid(),
      run_id: opts.runId,
      source_phase: 'seed_bootstrap',
      source_record: {
        row_id: row.row_id,
        created_entity_id: entityId,
        match_candidate: match,
      },
      reason_code: 'ambiguous_name_match',
      details: `${row.first_name} ${row.last_name} matched ${match.display_name} at ${match.similarity.toFixed(3)}`,
    });

    return {
      row_id: row.row_id,
      action: 'quarantined',
      canonical_entity_id: entityId,
      match_confidence: match.similarity,
      match_details: match,
    };
  }

  const entityId = ulid();
  await createCanonicalEntity(supabase, entityId, row, opts.runId);

  return {
    row_id: row.row_id,
    action: 'created',
    canonical_entity_id: entityId,
    match_confidence: match?.similarity ?? 0,
    match_details: match,
  };
}

async function createCanonicalEntity(
  supabase: AnySupabaseClient,
  entityId: string,
  row: SeedImportRow,
  runId: string,
): Promise<void> {
  const displayName = `${row.first_name} ${row.last_name}`.trim();
  const attributes: Record<string, unknown> = {};
  if (row.primary_affiliation) attributes.primary_affiliation = row.primary_affiliation;
  if (row.email) attributes.email = row.email;
  if (row.tier) attributes.tier = row.tier;

  await supabase.from('canonical_entities').insert({
    canonical_entity_id: entityId,
    entity_type: 'person',
    display_name: displayName,
    first_seen_run_id: runId,
    last_seen_run_id: runId,
    attributes,
    source: 'seed_import',
  });
}

export async function createSeedFromRow(
  supabase: AnySupabaseClient,
  row: SeedImportRow,
  canonicalEntityId: string,
  opts: BootstrapOptions,
): Promise<string> {
  const seedId = ulid();
  await supabase.from('seeds').insert({
    seed_id: seedId,
    canonical_entity_id: canonicalEntityId,
    added_by: opts.userId,
    notes: `Imported from ${opts.importType} spreadsheet (import ${opts.importId})`,
    active: true,
    import_row_id: row.row_id,
    tier: row.tier,
    funder_type: row.funder_type,
    sub_type: row.sub_type,
    augmentation_status: 'not_started',
  });
  return seedId;
}

export async function createKnownContact(
  supabase: AnySupabaseClient,
  canonicalEntityId: string,
  userId: string,
): Promise<void> {
  await supabase.from('known_contacts').upsert({
    canonical_entity_id: canonicalEntityId,
    added_by: userId,
    source: 'seed_import',
    exclude_as_candidate: true,
    available_as_introducer: true,
  }, { onConflict: 'canonical_entity_id' });
}

export async function resolveIntroducedBy(
  supabase: AnySupabaseClient,
  targetEntityId: string,
  introducedByRaw: string,
  _runId: string,
): Promise<string | null> {
  if (!introducedByRaw) return null;

  const cleaned = introducedByRaw.replace(/\s*\(household\)\s*/i, '').trim();
  if (!cleaned) return null;

  const parts = cleaned.split(/\s+/);
  const firstName = parts[0] ?? '';
  const lastName = parts.slice(1).join(' ');

  const match = await bootstrapMatchName(supabase, firstName, lastName);
  if (!match || match.similarity < QUARANTINE_THRESHOLD) return null;

  const routeId = ulid();
  await supabase.from('introduction_routes').insert({
    route_id: routeId,
    target_entity_id: targetEntityId,
    introducer_entity_id: match.canonical_entity_id,
    route_type: 'spreadsheet_declared',
    warmth_tier: 1,
    evidence: { source: 'spreadsheet', raw_value: introducedByRaw },
    source: 'seed_import',
  });

  return match.canonical_entity_id;
}

export async function createBootstrapRun(
  supabase: AnySupabaseClient,
  _userId: string,
): Promise<string> {
  const runId = ulid();
  await supabase.from('runs').insert({
    run_id: runId,
    run_type: 'seed',
    schema_version: '00008',
    status: 'running',
  });
  return runId;
}

export async function processImport(
  supabase: AnySupabaseClient,
  importId: string,
  opts: Omit<BootstrapOptions, 'importId'>,
): Promise<{ processed: number; linked: number; created: number; quarantined: number }> {
  const { data: rows, error } = await supabase
    .from('seed_import_rows')
    .select('*')
    .eq('import_id', importId)
    .eq('status', 'pending')
    .order('row_number');

  if (error || !rows) throw new Error(`Failed to fetch import rows: ${error?.message}`);

  const fullOpts: BootstrapOptions = { ...opts, importId };
  let linked = 0, created = 0, quarantined = 0;

  for (const row of rows as SeedImportRow[]) {
    try {
      const result = await bootstrapRow(supabase, row, fullOpts);

      await supabase.from('seed_import_rows').update({
        canonical_entity_id: result.canonical_entity_id,
        status: 'processed',
      }).eq('row_id', row.row_id);

      await createSeedFromRow(supabase, row, result.canonical_entity_id, fullOpts);

      if (fullOpts.importType === 'supporters') {
        await createKnownContact(supabase, result.canonical_entity_id, fullOpts.userId);
      }

      if (row.introduced_by_raw) {
        const introducerEntityId = await resolveIntroducedBy(
          supabase, result.canonical_entity_id, row.introduced_by_raw, fullOpts.runId,
        );
        if (introducerEntityId) {
          await supabase.from('seed_import_rows').update({
            introducer_entity_id: introducerEntityId,
          }).eq('row_id', row.row_id);
        }
      }

      if (result.action === 'linked') linked++;
      else if (result.action === 'created') created++;
      else quarantined++;
    } catch (err) {
      await supabase.from('seed_import_rows').update({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      }).eq('row_id', row.row_id);
    }
  }

  await supabase.from('seed_imports').update({
    processed_count: linked + created + quarantined,
    status: 'completed',
  }).eq('import_id', importId);

  return { processed: linked + created + quarantined, linked, created, quarantined };
}
