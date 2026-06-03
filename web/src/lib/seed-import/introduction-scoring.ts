import type { SupabaseClient } from '@supabase/supabase-js';
import { ulid } from 'ulid';
import { calculatePriorityScore, type PriorityInput } from '@/lib/ranking/priority';
import { calculateConfidenceScore, type ConfidenceInput } from '@/lib/ranking/confidence';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

// Warmth tier → introability score mapping
const WARMTH_TIER_MAP: Record<number, number> = {
  1: 0.95,  // direct (spreadsheet declared)
  2: 0.75,  // one-step (network inferred, Priority 1)
  3: 0.55,  // two-step (corpus discovered)
  4: 0.35,  // inferred (sector peer)
};

export interface ScoringResult {
  routes_scored: number;
  recommendations_created: number;
}

export async function scoreIntroductionRoutes(
  supabase: AnySupabaseClient,
  runId: string,
): Promise<ScoringResult> {
  const { data: routes, error } = await supabase
    .from('introduction_routes')
    .select('*')
    .order('warmth_tier', { ascending: true });

  if (error || !routes) throw new Error(`Failed to fetch routes: ${error?.message}`);

  const result: ScoringResult = { routes_scored: 0, recommendations_created: 0 };

  for (const route of routes) {
    const introducerSignals = await getEnrichmentSignals(supabase, route.introducer_entity_id);
    const targetSignals = await getEnrichmentSignals(supabase, route.target_entity_id);

    const warmthTier = (route.warmth_tier ?? 4) as number;
    const introabilityScore = WARMTH_TIER_MAP[warmthTier] ?? 0.35;

    const priorityInput: PriorityInput = {
      introabilityScore,
      affinityScore: computeAffinity(introducerSignals),
      capacitySignalScore: computeCapacity(introducerSignals),
      influenceScore: computeInfluence(introducerSignals),
      strategicFitScore: computeStrategicFit(targetSignals),
    };

    const priorityResult = calculatePriorityScore(priorityInput);

    const confidenceInput: ConfidenceInput = {
      identityConfidence: route.match_confidence ?? 0.8,
      relationshipConfidence: computeRelationshipConfidence(route),
      sourceCorroborationScore: computeCorroboration(introducerSignals),
      freshnessScore: computeFreshness(route, introducerSignals),
    };

    const confidenceResult = calculateConfidenceScore(confidenceInput);

    // Find the seed record for the target entity
    const { data: targetSeed } = await supabase
      .from('seeds')
      .select('seed_id')
      .eq('canonical_entity_id', route.target_entity_id)
      .eq('active', true)
      .limit(1)
      .single();

    // Find the seed record for the introducer (used as seed_id in candidate_recommendations)
    const { data: introducerSeed } = await supabase
      .from('seeds')
      .select('seed_id')
      .eq('canonical_entity_id', route.introducer_entity_id)
      .eq('active', true)
      .limit(1)
      .single();

    if (!introducerSeed) {
      result.routes_scored++;
      continue;
    }

    const { error: insertError } = await supabase
      .from('candidate_recommendations')
      .upsert({
        candidate_recommendation_id: ulid(),
        run_id: runId,
        seed_id: introducerSeed.seed_id,
        candidate_entity_id: route.target_entity_id,
        rank: 0,
        priority_score: priorityResult.score,
        confidence_score: confidenceResult.score,
        status: 'pending_review',
        strongest_path: {
          route_id: route.route_id,
          route_type: route.route_type,
          warmth_tier: warmthTier,
          via_entity_id: route.via_entity_id,
          via_organisation: route.via_organisation,
        },
        reason_codes: buildReasonCodes(route, priorityResult.score),
        identity_warnings: [],
        introduction_route_id: route.route_id,
        target_seed_id: targetSeed?.seed_id ?? null,
      }, {
        onConflict: 'run_id,seed_id,candidate_entity_id',
        ignoreDuplicates: false,
      });

    if (!insertError) result.recommendations_created++;
    result.routes_scored++;
  }

  // Rank recommendations by priority_score within each seed
  await rankRecommendations(supabase, runId);

  return result;
}

async function getEnrichmentSignals(
  supabase: AnySupabaseClient,
  entityId: string,
): Promise<Array<{ signal_type: string; signal_payload: Record<string, unknown>; source: string; retrieved_at: string }>> {
  const { data } = await supabase
    .from('enrichment_signals')
    .select('signal_type, signal_payload, source, retrieved_at')
    .eq('candidate_entity_id', entityId)
    .eq('accepted_for_scoring', true);

  return (data ?? []) as Array<{ signal_type: string; signal_payload: Record<string, unknown>; source: string; retrieved_at: string }>;
}

function computeAffinity(signals: Array<{ signal_type: string; signal_payload: Record<string, unknown> }>): number {
  let score = 0.3; // baseline
  for (const s of signals) {
    const payload = s.signal_payload;
    const text = JSON.stringify(payload).toLowerCase();
    if (text.includes('sport') || text.includes('football') || text.includes('youth')) score += 0.2;
    if (text.includes('education') || text.includes('social mobility')) score += 0.15;
    if (text.includes('mental health') || text.includes('wellbeing')) score += 0.1;
    if (text.includes('community') || text.includes('poverty')) score += 0.1;
  }
  return Math.min(score, 1.0);
}

function computeCapacity(signals: Array<{ signal_type: string; signal_payload: Record<string, unknown> }>): number {
  let score = 0.2; // baseline
  for (const s of signals) {
    const payload = s.signal_payload;
    const text = JSON.stringify(payload).toLowerCase();
    if (text.includes('rich list') || text.includes('net worth') || text.includes('forbes')) score += 0.3;
    if (text.includes('foundation') || text.includes('charitable trust')) score += 0.2;
    if (text.includes('director') || text.includes('partner') || text.includes('founder')) score += 0.1;
  }
  return Math.min(score, 1.0);
}

function computeInfluence(signals: Array<{ signal_type: string; signal_payload: Record<string, unknown> }>): number {
  let score = 0.2;
  const directorshipCount = signals.filter(s => s.signal_type === 'company_officer' || s.signal_type === 'charity_trustee').length;
  score += Math.min(directorshipCount * 0.1, 0.5);
  return Math.min(score, 1.0);
}

function computeStrategicFit(signals: Array<{ signal_type: string; signal_payload: Record<string, unknown> }>): number {
  let score = 0.3;
  for (const s of signals) {
    const text = JSON.stringify(s.signal_payload).toLowerCase();
    if (text.includes('sport') || text.includes('football')) score += 0.3;
    if (text.includes('youth') || text.includes('children') || text.includes('young people')) score += 0.2;
  }
  return Math.min(score, 1.0);
}

function computeRelationshipConfidence(route: Record<string, unknown>): number {
  const routeType = route.route_type as string;
  switch (routeType) {
    case 'spreadsheet_declared': return 0.95;
    case 'network_inferred': return 0.70;
    case 'corpus_discovered': return 0.85;
    default: return 0.50;
  }
}

function computeCorroboration(
  signals: Array<{ source: string }>,
): number {
  const sources = new Set(signals.map(s => s.source));
  if (sources.size >= 3) return 1.0;
  if (sources.size === 2) return 0.7;
  if (sources.size === 1) return 0.4;
  return 0.1;
}

function computeFreshness(
  route: Record<string, unknown>,
  signals: Array<{ retrieved_at: string }>,
): number {
  const now = Date.now();
  let newestMs = 0;

  for (const s of signals) {
    const ts = new Date(s.retrieved_at).getTime();
    if (ts > newestMs) newestMs = ts;
  }

  const createdAt = route.created_at as string | undefined;
  if (createdAt) {
    const ts = new Date(createdAt).getTime();
    if (ts > newestMs) newestMs = ts;
  }

  if (newestMs === 0) return 0.5;

  const ageMs = now - newestMs;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  if (ageDays <= 30) return 1.0;
  if (ageDays <= 90) return 0.85;
  if (ageDays <= 180) return 0.7;
  if (ageDays <= 365) return 0.5;
  return 0.3;
}

function buildReasonCodes(route: Record<string, unknown>, priorityScore: number): string[] {
  const codes: string[] = [];
  const routeType = route.route_type as string;

  if (routeType === 'spreadsheet_declared') codes.push('declared_introduction');
  if (routeType === 'network_inferred') codes.push('network_mapped');
  if (routeType === 'corpus_discovered') codes.push('corpus_match');

  if (priorityScore >= 0.8) codes.push('high_priority');
  else if (priorityScore >= 0.5) codes.push('medium_priority');

  if (route.via_organisation) codes.push('shared_organisation');

  return codes;
}

async function rankRecommendations(
  supabase: AnySupabaseClient,
  runId: string,
): Promise<void> {
  const { data: recs } = await supabase
    .from('candidate_recommendations')
    .select('candidate_recommendation_id, seed_id, priority_score')
    .eq('run_id', runId)
    .order('priority_score', { ascending: false });

  if (!recs) return;

  const bySeed = new Map<string, typeof recs>();
  for (const rec of recs) {
    const list = bySeed.get(rec.seed_id) ?? [];
    list.push(rec);
    bySeed.set(rec.seed_id, list);
  }

  for (const [, seedRecs] of bySeed) {
    for (let i = 0; i < seedRecs.length; i++) {
      await supabase
        .from('candidate_recommendations')
        .update({ rank: i + 1 })
        .eq('candidate_recommendation_id', seedRecs[i].candidate_recommendation_id);
    }
  }
}
