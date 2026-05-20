/**
 * Shared metrics collection functions for observability dashboards.
 * PRD ref: §22.1, §22.2 — per-run metrics aggregation from app schema tables.
 */

import { createClient } from '@/lib/supabase/server';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface ExtractionMetrics {
  run_id: string;
  documents_processed: number;
  invalid_json_count: number;
  invalid_json_rate: number;
  evidence_spans_count: number;
  evidence_coverage: number; // ratio of docs with at least one evidence span
}

export interface IdentityMetrics {
  run_id: string;
  cluster_count: number;
  merge_count: number;
  split_count: number;
  false_match_reasons: Record<string, number>;
}

export interface GraphMetrics {
  run_id: string;
  snapshot_id: string | null;
  node_count: number;
  edge_count: number;
  build_time_ms: number;
  built_at: string | null;
}

export interface DiscoveryMetrics {
  run_id: string;
  candidates_per_seed: Record<string, number>;
  total_candidates: number;
  path_diversity: number; // unique path templates used
  weak_seed_count: number; // seeds producing fewer than 5 candidates
}

export interface EnrichmentMetrics {
  run_id: string;
  success_rate_by_source: Record<string, number>;
  ambiguous_match_count: number;
  ambiguous_match_rate: number;
  api_failure_count: number;
  api_failure_rate: number;
  cache_hit_count: number;
  cache_hit_rate: number;
  total_signals: number;
}

export interface ReviewMetrics {
  run_id: string | null;
  avg_time_to_decision_ms: number;
  decision_distribution: Record<string, number>;
  rejection_reasons: Record<string, number>;
  total_decisions: number;
}

export interface OutcomeMetrics {
  intro_requests: number;
  intro_successes: number;
  meetings: number;
  conversions: number;
  intro_success_rate: number;
  meeting_rate: number;
  conversion_rate: number;
}

export interface CostMetrics {
  run_id: string;
  llm_cost: number;
  api_cost: number;
  total_cost: number;
  qualified_candidates: number;
  cost_per_qualified: number;
}

export interface ValidationMetrics {
  run_id: string;
  accepted_count: number;
  quarantined_count: number;
  quarantine_rate: number;
}

// -------------------------------------------------------------------
// Extraction metrics (§22.2)
// -------------------------------------------------------------------

export async function getExtractionMetrics(runId: string): Promise<ExtractionMetrics> {
  const supabase = await createClient();

  const [extractionResult, evidenceResult] = await Promise.all([
    supabase
      .from('extraction_runs')
      .select('extraction_run_id, document_id, status, invalid_json_retries')
      .eq('run_id', runId),
    supabase
      .from('evidence_spans')
      .select('evidence_id, document_id')
      .eq('run_id', runId),
  ]);

  const extractions = extractionResult.data ?? [];
  const evidence = evidenceResult.data ?? [];

  const total = extractions.length;
  const invalidJsonCount = extractions.filter(e => e.invalid_json_retries > 0).length;
  const docsWithEvidence = new Set(evidence.map(e => e.document_id));
  const uniqueDocs = new Set(extractions.map(e => e.document_id));

  return {
    run_id: runId,
    documents_processed: total,
    invalid_json_count: invalidJsonCount,
    invalid_json_rate: total > 0 ? invalidJsonCount / total : 0,
    evidence_spans_count: evidence.length,
    evidence_coverage: uniqueDocs.size > 0 ? docsWithEvidence.size / uniqueDocs.size : 0,
  };
}

// -------------------------------------------------------------------
// Identity metrics (§22.2)
// -------------------------------------------------------------------

export async function getIdentityMetrics(runId: string): Promise<IdentityMetrics> {
  const supabase = await createClient();

  const [clusterResult, decisionsResult] = await Promise.all([
    supabase
      .from('identity_clusters')
      .select('cluster_id')
      .eq('run_id', runId),
    supabase
      .from('human_identity_decisions')
      .select('identity_decision_id, decision, reason_code'),
  ]);

  const clusters = clusterResult.data ?? [];
  const decisions = decisionsResult.data ?? [];

  const merges = decisions.filter(d => d.decision === 'same_person');
  const splits = decisions.filter(d => d.decision === 'not_same_person');

  const falseMatchReasons: Record<string, number> = {};
  for (const d of splits) {
    const code = d.reason_code ?? 'unknown';
    falseMatchReasons[code] = (falseMatchReasons[code] ?? 0) + 1;
  }

  return {
    run_id: runId,
    cluster_count: clusters.length,
    merge_count: merges.length,
    split_count: splits.length,
    false_match_reasons: falseMatchReasons,
  };
}

// -------------------------------------------------------------------
// Graph metrics (§22.2)
// -------------------------------------------------------------------

export async function getGraphMetrics(runId: string): Promise<GraphMetrics> {
  const supabase = await createClient();

  const { data: snapshot } = await supabase
    .from('graph_snapshots')
    .select('snapshot_id, node_count, edge_count, built_at')
    .eq('run_id', runId)
    .order('built_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Approximate build time from pipeline_jobs
  const { data: job } = await supabase
    .from('pipeline_jobs')
    .select('started_at, finished_at')
    .eq('run_id', runId)
    .eq('phase', 'graph_build')
    .eq('status', 'completed')
    .order('finished_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let buildTimeMs = 0;
  if (job?.started_at && job?.finished_at) {
    buildTimeMs = new Date(job.finished_at).getTime() - new Date(job.started_at).getTime();
  }

  return {
    run_id: runId,
    snapshot_id: snapshot?.snapshot_id ?? null,
    node_count: snapshot?.node_count ?? 0,
    edge_count: snapshot?.edge_count ?? 0,
    build_time_ms: buildTimeMs,
    built_at: snapshot?.built_at ?? null,
  };
}

// -------------------------------------------------------------------
// Discovery metrics (§22.2)
// -------------------------------------------------------------------

export async function getDiscoveryMetrics(runId: string): Promise<DiscoveryMetrics> {
  const supabase = await createClient();

  const { data: candidates } = await supabase
    .from('candidate_recommendations')
    .select('candidate_recommendation_id, seed_id, strongest_path')
    .eq('run_id', runId);

  const recs = candidates ?? [];
  const perSeed: Record<string, number> = {};
  const pathTemplates = new Set<string>();

  for (const c of recs) {
    perSeed[c.seed_id] = (perSeed[c.seed_id] ?? 0) + 1;
    const templateName = (c.strongest_path as Record<string, unknown>)?.template_name;
    if (typeof templateName === 'string') {
      pathTemplates.add(templateName);
    }
  }

  const weakSeeds = Object.values(perSeed).filter(count => count < 5).length;

  return {
    run_id: runId,
    candidates_per_seed: perSeed,
    total_candidates: recs.length,
    path_diversity: pathTemplates.size,
    weak_seed_count: weakSeeds,
  };
}

// -------------------------------------------------------------------
// Enrichment metrics (§22.2)
// -------------------------------------------------------------------

export async function getEnrichmentMetrics(runId: string): Promise<EnrichmentMetrics> {
  const supabase = await createClient();

  // Get candidate entity IDs for this run
  const { data: candidates } = await supabase
    .from('candidate_recommendations')
    .select('candidate_entity_id')
    .eq('run_id', runId);

  const entityIds = (candidates ?? []).map(c => c.candidate_entity_id);
  if (entityIds.length === 0) {
    return {
      run_id: runId,
      success_rate_by_source: {},
      ambiguous_match_count: 0,
      ambiguous_match_rate: 0,
      api_failure_count: 0,
      api_failure_rate: 0,
      cache_hit_count: 0,
      cache_hit_rate: 0,
      total_signals: 0,
    };
  }

  const { data: signals } = await supabase
    .from('enrichment_signals')
    .select('enrichment_signal_id, source, status, match_confidence, cache_expires_at')
    .in('candidate_entity_id', entityIds);

  const all = signals ?? [];
  const total = all.length;

  const bySource: Record<string, { success: number; total: number }> = {};
  let ambiguous = 0;
  let failures = 0;
  let cacheHits = 0;

  for (const s of all) {
    if (!bySource[s.source]) bySource[s.source] = { success: 0, total: 0 };
    bySource[s.source].total++;
    if (s.status === 'accepted' || s.status === 'completed') {
      bySource[s.source].success++;
    }
    if (s.match_confidence < 0.7 && s.match_confidence > 0) {
      ambiguous++;
    }
    if (s.status === 'failed') {
      failures++;
    }
    // Cache hit: has a future expiry, indicating it was served from cache
    if (s.cache_expires_at && new Date(s.cache_expires_at) > new Date()) {
      cacheHits++;
    }
  }

  const successBySource: Record<string, number> = {};
  for (const [source, counts] of Object.entries(bySource)) {
    successBySource[source] = counts.total > 0 ? counts.success / counts.total : 0;
  }

  return {
    run_id: runId,
    success_rate_by_source: successBySource,
    ambiguous_match_count: ambiguous,
    ambiguous_match_rate: total > 0 ? ambiguous / total : 0,
    api_failure_count: failures,
    api_failure_rate: total > 0 ? failures / total : 0,
    cache_hit_count: cacheHits,
    cache_hit_rate: total > 0 ? cacheHits / total : 0,
    total_signals: total,
  };
}

// -------------------------------------------------------------------
// Review metrics (§22.2)
// -------------------------------------------------------------------

export async function getReviewMetrics(filters?: {
  run_id?: string;
  reviewer?: string;
  seed_id?: string;
  since?: string;
  until?: string;
}): Promise<ReviewMetrics> {
  const supabase = await createClient();

  let query = supabase
    .from('human_decisions')
    .select('human_decision_id, decision, reason_code, decided_at, decided_by, candidate_recommendation_id');

  if (filters?.reviewer) {
    query = query.eq('decided_by', filters.reviewer);
  }
  if (filters?.since) {
    query = query.gte('decided_at', filters.since);
  }
  if (filters?.until) {
    query = query.lte('decided_at', filters.until);
  }

  const { data: decisions } = await query;
  const all = decisions ?? [];

  // If filtering by run_id or seed_id, we need to join with candidate_recommendations
  let filtered = all;
  if (filters?.run_id || filters?.seed_id) {
    const recIds = all.map(d => d.candidate_recommendation_id);
    if (recIds.length > 0) {
      let recQuery = supabase
        .from('candidate_recommendations')
        .select('candidate_recommendation_id, run_id, seed_id')
        .in('candidate_recommendation_id', recIds);

      if (filters.run_id) recQuery = recQuery.eq('run_id', filters.run_id);
      if (filters.seed_id) recQuery = recQuery.eq('seed_id', filters.seed_id);

      const { data: recs } = await recQuery;
      const validRecIds = new Set((recs ?? []).map(r => r.candidate_recommendation_id));
      filtered = all.filter(d => validRecIds.has(d.candidate_recommendation_id));
    }
  }

  const distribution: Record<string, number> = {};
  const rejectionReasons: Record<string, number> = {};

  for (const d of filtered) {
    distribution[d.decision] = (distribution[d.decision] ?? 0) + 1;
    if (d.decision === 'rejected' && d.reason_code) {
      rejectionReasons[d.reason_code] = (rejectionReasons[d.reason_code] ?? 0) + 1;
    }
  }

  // Approximate time-to-decision: difference between candidate created_at and decided_at
  // For now, just compute average interval between decisions as a proxy
  const avgTimeMs = 0; // Requires candidate creation timestamps for real computation

  return {
    run_id: filters?.run_id ?? null,
    avg_time_to_decision_ms: avgTimeMs,
    decision_distribution: distribution,
    rejection_reasons: rejectionReasons,
    total_decisions: filtered.length,
  };
}

// -------------------------------------------------------------------
// Outcome metrics (§22.2)
// -------------------------------------------------------------------

export async function getOutcomeMetrics(): Promise<OutcomeMetrics> {
  const supabase = await createClient();

  const { data: outcomes } = await supabase
    .from('intro_outcomes')
    .select('intro_outcome_id, intro_status, meeting_at, converted');

  const all = outcomes ?? [];
  const requests = all.length;
  const successes = all.filter(o => o.intro_status === 'intro_made').length;
  const meetings = all.filter(o => o.meeting_at !== null).length;
  const conversions = all.filter(o => o.converted === true).length;

  return {
    intro_requests: requests,
    intro_successes: successes,
    meetings,
    conversions,
    intro_success_rate: requests > 0 ? successes / requests : 0,
    meeting_rate: successes > 0 ? meetings / successes : 0,
    conversion_rate: meetings > 0 ? conversions / meetings : 0,
  };
}

// -------------------------------------------------------------------
// Validation / quarantine metrics
// -------------------------------------------------------------------

export async function getValidationMetrics(runId: string): Promise<ValidationMetrics> {
  const supabase = await createClient();

  const [entityResult, quarantineResult] = await Promise.all([
    supabase
      .from('entity_mentions')
      .select('entity_mention_id, validation_status')
      .eq('run_id', runId),
    supabase
      .from('quarantine')
      .select('quarantine_id')
      .eq('run_id', runId),
  ]);

  const entities = entityResult.data ?? [];
  const quarantined = quarantineResult.data ?? [];
  const accepted = entities.filter(e => e.validation_status === 'accepted').length;
  const total = accepted + quarantined.length;

  return {
    run_id: runId,
    accepted_count: accepted,
    quarantined_count: quarantined.length,
    quarantine_rate: total > 0 ? quarantined.length / total : 0,
  };
}

// -------------------------------------------------------------------
// Cost metrics (§22.2, §25)
// -------------------------------------------------------------------

export async function getCostMetrics(runId: string): Promise<CostMetrics> {
  const supabase = await createClient();

  // Get extraction count for LLM cost estimate
  const { data: extractions } = await supabase
    .from('extraction_runs')
    .select('extraction_run_id')
    .eq('run_id', runId);

  // Get enrichment signals for API cost estimate
  const { data: candidates } = await supabase
    .from('candidate_recommendations')
    .select('candidate_recommendation_id, candidate_entity_id, status')
    .eq('run_id', runId);

  const recs = candidates ?? [];
  const entityIds = recs.map(c => c.candidate_entity_id);

  let signalCount = 0;
  if (entityIds.length > 0) {
    const { data: signals } = await supabase
      .from('enrichment_signals')
      .select('enrichment_signal_id')
      .in('candidate_entity_id', entityIds);
    signalCount = (signals ?? []).length;
  }

  const docCount = (extractions ?? []).length;
  const llmCost = docCount * 0.0096; // Per budget.ts constant
  const apiCost = signalCount * 0.001; // Nominal per-signal cost
  const totalCost = llmCost + apiCost;
  const qualifiedCount = recs.filter(c => c.status === 'qualified').length;

  return {
    run_id: runId,
    llm_cost: llmCost,
    api_cost: apiCost,
    total_cost: totalCost,
    qualified_candidates: qualifiedCount,
    cost_per_qualified: qualifiedCount > 0 ? totalCost / qualifiedCount : 0,
  };
}
