import type { SupabaseClient } from '@supabase/supabase-js';
import { ulid } from 'ulid';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

const AUTO_PROMOTE_THRESHOLD = 0.90;
const QUARANTINE_THRESHOLD = 0.75;

export interface PromotionResult {
  staged_entity_id: string;
  action: 'promoted' | 'merged' | 'quarantined';
  canonical_entity_id: string | null;
  match_confidence: number;
}

export interface StagingReviewResult {
  processed: number;
  promoted: number;
  merged: number;
  quarantined: number;
}

export async function reviewStagedEntities(
  supabase: AnySupabaseClient,
  runId: string,
): Promise<StagingReviewResult> {
  const { data: staged, error } = await supabase
    .from('staged_entities')
    .select('*')
    .eq('promotion_status', 'pending')
    .order('created_at');

  if (error || !staged) throw new Error(`Failed to fetch staged entities: ${error?.message}`);

  const result: StagingReviewResult = { processed: 0, promoted: 0, merged: 0, quarantined: 0 };

  for (const entity of staged) {
    const promotion = await evaluatePromotion(supabase, entity, runId);

    if (promotion.action === 'merged') {
      result.merged++;
    } else if (promotion.action === 'promoted') {
      result.promoted++;
    } else {
      result.quarantined++;
    }
    result.processed++;
  }

  return result;
}

async function evaluatePromotion(
  supabase: AnySupabaseClient,
  staged: Record<string, unknown>,
  runId: string,
): Promise<PromotionResult> {
  const stagedId = staged.staged_entity_id as string;
  const displayName = staged.display_name as string;
  const attributes = (staged.attributes ?? {}) as Record<string, unknown>;

  const match = await findBestCanonicalMatch(supabase, displayName, attributes);

  if (match && match.confidence >= AUTO_PROMOTE_THRESHOLD) {
    await supabase.from('entity_aliases').insert({
      alias_id: ulid(),
      alias_entity_id: stagedId,
      canonical_entity_id: match.canonical_entity_id,
      alias_source: 'auto_staging_review',
    });

    await supabase.from('staged_entities').update({
      promotion_status: 'merged',
      match_candidate_id: match.canonical_entity_id,
      match_confidence: match.confidence,
      promoted_entity_id: match.canonical_entity_id,
    }).eq('staged_entity_id', stagedId);

    await updateNetworkConnectionsFks(supabase, stagedId, match.canonical_entity_id);

    return { staged_entity_id: stagedId, action: 'merged', canonical_entity_id: match.canonical_entity_id, match_confidence: match.confidence };
  }

  if (match && match.confidence >= QUARANTINE_THRESHOLD) {
    await supabase.from('staged_entities').update({
      match_candidate_id: match.canonical_entity_id,
      match_confidence: match.confidence,
    }).eq('staged_entity_id', stagedId);

    await supabase.from('quarantine').insert({
      quarantine_id: ulid(),
      run_id: runId,
      source_phase: 'entity_staging_review',
      source_record: {
        staged_entity_id: stagedId,
        display_name: displayName,
        match_candidate_id: match.canonical_entity_id,
        match_confidence: match.confidence,
      },
      reason_code: 'ambiguous_staged_match',
      details: `${displayName} matched existing entity at ${match.confidence.toFixed(3)}`,
    });

    return { staged_entity_id: stagedId, action: 'quarantined', canonical_entity_id: null, match_confidence: match.confidence };
  }

  // No strong match — promote as new canonical entity
  const entityId = ulid();
  await supabase.from('canonical_entities').insert({
    canonical_entity_id: entityId,
    entity_type: (staged.entity_type as string) ?? 'person',
    display_name: displayName,
    first_seen_run_id: (staged.source_run_id as string) ?? entityId,
    last_seen_run_id: (staged.source_run_id as string) ?? entityId,
    attributes,
    source: 'augmentation',
  });

  await supabase.from('staged_entities').update({
    promotion_status: 'promoted',
    promoted_entity_id: entityId,
    match_confidence: match?.confidence ?? 0,
  }).eq('staged_entity_id', stagedId);

  await updateNetworkConnectionsFks(supabase, stagedId, entityId);

  return { staged_entity_id: stagedId, action: 'promoted', canonical_entity_id: entityId, match_confidence: match?.confidence ?? 0 };
}

interface CanonicalMatch {
  canonical_entity_id: string;
  display_name: string;
  confidence: number;
}

async function findBestCanonicalMatch(
  supabase: AnySupabaseClient,
  displayName: string,
  attributes: Record<string, unknown>,
): Promise<CanonicalMatch | null> {
  // Use pg_trgm for name similarity
  const { data: candidates } = await supabase.rpc('bootstrap_name_match', {
    search_name: displayName,
    match_threshold: 0.5,
    result_limit: 10,
  });

  if (!candidates || candidates.length === 0) return null;

  let bestMatch: CanonicalMatch | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    let score = candidate.similarity as number;

    // Boost for shared organisation
    const candidateAttrs = (candidate.attributes ?? {}) as Record<string, unknown>;
    const affiliationA = String(attributes.primary_affiliation ?? attributes.current_role ?? '').toLowerCase();
    const affiliationB = JSON.stringify(candidateAttrs).toLowerCase();
    if (affiliationA && affiliationB.includes(affiliationA)) {
      score += 0.10;
    }

    // Boost for shared role keywords
    const roleA = String(attributes.current_role ?? '').toLowerCase();
    const roleB = JSON.stringify(candidateAttrs).toLowerCase();
    if (roleA && roleA.length > 3 && roleB.includes(roleA)) {
      score += 0.05;
    }

    score = Math.min(score, 1.0);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        canonical_entity_id: candidate.canonical_entity_id,
        display_name: candidate.display_name,
        confidence: score,
      };
    }
  }

  return bestMatch;
}

async function updateNetworkConnectionsFks(
  supabase: AnySupabaseClient,
  stagedEntityId: string,
  canonicalEntityId: string,
): Promise<void> {
  await supabase.from('network_connections').update({
    connected_entity_id: canonicalEntityId,
  }).eq('staged_entity_id', stagedEntityId);
}

export async function resolveEntityId(
  supabase: AnySupabaseClient,
  entityId: string,
): Promise<string> {
  const { data: alias } = await supabase
    .from('entity_aliases')
    .select('canonical_entity_id')
    .eq('alias_entity_id', entityId)
    .limit(1)
    .single();

  if (alias) return alias.canonical_entity_id;
  return entityId;
}

export async function resolveAllAliases(
  supabase: AnySupabaseClient,
  entityIds: string[],
): Promise<Map<string, string>> {
  const resolvedMap = new Map<string, string>();

  if (entityIds.length === 0) return resolvedMap;

  const { data: aliases } = await supabase
    .from('entity_aliases')
    .select('alias_entity_id, canonical_entity_id')
    .in('alias_entity_id', entityIds);

  for (const id of entityIds) {
    const alias = aliases?.find(a => a.alias_entity_id === id);
    resolvedMap.set(id, alias?.canonical_entity_id ?? id);
  }

  return resolvedMap;
}
