import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ulid } from 'ulid';
import { loadHnwResearchPrompt, buildResearchSystemPrompt } from './prompt-loader';
import { parseResearchOutput, type ParsedResearchProfile } from './output-parser';
import type { CanonicalEntity } from '@/types/database';

type AnySupabaseClient = SupabaseClient<any, any, any>;

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 16000;

export interface ResearchResult {
  augmentation_run_id: string;
  parsed: ParsedResearchProfile;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
}

export async function runHnwResearch(
  entity: CanonicalEntity,
  supabase: AnySupabaseClient,
  runId: string,
  anthropicApiKey: string,
): Promise<ResearchResult> {
  const { content: promptContent, hash: promptHash } = await loadHnwResearchPrompt();
  const systemPrompt = buildResearchSystemPrompt(promptContent, entity.display_name);

  const augRunId = ulid();
  await supabase.from('seed_augmentation_runs').insert({
    augmentation_run_id: augRunId,
    canonical_entity_id: entity.canonical_entity_id,
    run_id: runId,
    phase: 'research',
    prompt_version: `hnw_v10_${promptHash}`,
    model: MODEL,
    status: 'running',
  });

  const client = new Anthropic({ apiKey: anthropicApiKey });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: 0,
      system: systemPrompt,
      tools: [
        {
          name: 'web_search',
          type: 'web_search_20250305',
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Begin the research profile for ${entity.display_name}. Start with Sensitivity Flags, then Snapshot, then work through all tiers. Follow the prompt instructions exactly.`,
        },
      ],
    });

    const textBlocks = response.content.filter(b => b.type === 'text');
    const rawText = textBlocks.map(b => b.text).join('\n\n');
    const parsed = parseResearchOutput(rawText);

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const cost = estimateCost(inputTokens, outputTokens, MODEL);

    const storageUri = `augmentation/${runId}/${entity.canonical_entity_id}/research.md`;

    await supabase.from('seed_augmentation_runs').update({
      status: 'completed',
      result_storage_uri: storageUri,
      result_summary: {
        sensitivity_flags: parsed.sensitivity_flags.length,
        directorships: parsed.directorships.length,
        has_foundation: parsed.foundation !== null,
      },
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: cost,
      completed_at: new Date().toISOString(),
    }).eq('augmentation_run_id', augRunId);

    await supabase.from('seeds').update({
      augmentation_status: 'research_complete',
    }).eq('canonical_entity_id', entity.canonical_entity_id);

    await updateRunCost(supabase, runId, cost);

    return { augmentation_run_id: augRunId, parsed, input_tokens: inputTokens, output_tokens: outputTokens, estimated_cost_usd: cost };
  } catch (err) {
    await supabase.from('seed_augmentation_runs').update({
      status: 'failed',
      error: { message: err instanceof Error ? err.message : String(err) },
      completed_at: new Date().toISOString(),
    }).eq('augmentation_run_id', augRunId);

    throw err;
  }
}

async function updateRunCost(supabase: AnySupabaseClient, runId: string, cost: number): Promise<void> {
  const { data: run } = await supabase
    .from('runs')
    .select('total_cost_usd')
    .eq('run_id', runId)
    .single();

  if (run) {
    await supabase.from('runs').update({
      total_cost_usd: (run.total_cost_usd ?? 0) + cost,
    }).eq('run_id', runId);
  }
}

function estimateCost(inputTokens: number, outputTokens: number, model: string): number {
  // Sonnet 4 pricing: $3/M input, $15/M output
  if (model.includes('sonnet')) {
    return (inputTokens * 3 + outputTokens * 15) / 1_000_000;
  }
  // Haiku 4.5 pricing: $1/M input, $5/M output
  if (model.includes('haiku')) {
    return (inputTokens * 1 + outputTokens * 5) / 1_000_000;
  }
  // Opus fallback: $15/M input, $75/M output
  return (inputTokens * 15 + outputTokens * 75) / 1_000_000;
}

export { estimateCost };
