import { generateId } from '@/lib/ulid';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

/**
 * Result shape produced by wealth research (Claude Code agents via web search)
 * and consumed by both the wealth-augment CLI (`--import`) and the in-app
 * persist route. This is the contract the local tethered agent POSTs back.
 */
export interface WealthResearchResult {
  entity_id: string;
  display_name: string;
  estimated_net_worth_gbp: number | null;
  wealth_band: string;
  wealth_score: number;
  confidence: number;
  wealth_source: string;
  wealth_origin: string;
  evidence_summary: string;
  sources: string[];
}

/**
 * Persist a wealth research result. Performs three writes:
 *   1. insert enrichment_evidence (web_search, layer B)
 *   2. upsert wealth_estimates (band/score/confidence + structured evidence)
 *   3. update canonical_entities.attributes, setting wealth_augmented_at
 *
 * Setting wealth_augmented_at is what promotes a Lead to a Seed in the CRM
 * (the Seeds tab filters on attributes.wealth_augmented_at != null).
 *
 * Shared by web/scripts/wealth-augment.ts and the persist API route so the
 * persistence logic lives in exactly one place.
 */
export async function storeWealthResult(
  supabase: AnySupabase,
  result: WealthResearchResult,
): Promise<void> {
  const evidenceId = generateId();

  await supabase.from('enrichment_evidence').insert({
    evidence_id: evidenceId,
    entity_id: result.entity_id,
    source: 'web_search',
    source_layer: 'B',
    evidence_text: result.evidence_summary.slice(0, 1000),
    confidence: result.confidence,
  });

  const { error: weError } = await supabase.from('wealth_estimates').upsert({
    wealth_estimate_id: generateId(),
    entity_id: result.entity_id,
    band: result.wealth_band,
    score: result.wealth_score,
    confidence: result.confidence,
    evidence: [
      {
        signal: 'web_research_net_worth',
        source_layer: 'B',
        contribution: result.wealth_score,
        detail: result.evidence_summary,
        estimated_net_worth_gbp: result.estimated_net_worth_gbp,
        wealth_source: result.wealth_source,
        wealth_origin: result.wealth_origin,
        sources: result.sources,
      },
    ],
    assessed_at: new Date().toISOString(),
  }, {
    onConflict: 'entity_id,sweep_run_id',
    ignoreDuplicates: false,
  });

  if (weError && !weError.code?.startsWith('23505')) {
    throw new Error(`wealth_estimates upsert failed: ${weError.message}`);
  }

  const { data: existing } = await supabase
    .from('canonical_entities')
    .select('attributes')
    .eq('canonical_entity_id', result.entity_id)
    .single();

  const attrs = (existing?.attributes ?? {}) as Record<string, unknown>;
  const nextAttrs: Record<string, unknown> = {
    ...attrs,
    estimated_net_worth_gbp: result.estimated_net_worth_gbp,
    wealth_band: result.wealth_band,
    wealth_score: result.wealth_score,
    wealth_source: result.wealth_source,
    wealth_origin: result.wealth_origin,
    wealth_augmented_at: new Date().toISOString(),
  };
  // Clear the queue flag now that this lead has been augmented into a seed.
  delete nextAttrs.augmentation_requested;

  const { error: updateErr } = await supabase
    .from('canonical_entities')
    .update({ attributes: nextAttrs })
    .eq('canonical_entity_id', result.entity_id);

  if (updateErr) {
    throw new Error(`entity attributes update failed: ${updateErr.message}`);
  }
}
