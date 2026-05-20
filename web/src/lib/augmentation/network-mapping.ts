import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ulid } from 'ulid';
import { loadNetworkMappingPrompt, buildNetworkMappingSystemPrompt } from './prompt-loader';
import { parseNetworkMappingOutput, type ParsedNetworkMap } from './output-parser';
import { estimateCost } from './hnw-research';
import type { CanonicalEntity } from '@/types/database';

type AnySupabaseClient = SupabaseClient<any, any, any>;

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 32000;

export interface NetworkMappingResult {
  augmentation_run_id: string;
  parsed: ParsedNetworkMap;
  staged_entity_count: number;
  connection_count: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
}

export async function runNetworkMapping(
  entity: CanonicalEntity,
  researchProfile: string,
  supabase: AnySupabaseClient,
  runId: string,
  anthropicApiKey: string,
): Promise<NetworkMappingResult> {
  const { content: promptContent, hash: promptHash } = await loadNetworkMappingPrompt();
  const systemPrompt = buildNetworkMappingSystemPrompt(promptContent, researchProfile);

  const augRunId = ulid();
  await supabase.from('seed_augmentation_runs').insert({
    augmentation_run_id: augRunId,
    canonical_entity_id: entity.canonical_entity_id,
    run_id: runId,
    phase: 'network_mapping',
    prompt_version: `network_v10_${promptHash}`,
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
          content: `Map the network outward from ${entity.display_name}'s research profile. Follow the prompt instructions exactly: extract organisations, fetch people pages, run background checks, produce Priority 1 and Priority 2 contact lists.`,
        },
      ],
    });

    const textBlocks = response.content.filter(b => b.type === 'text');
    const rawText = textBlocks.map(b => b.text).join('\n\n');
    const parsed = parseNetworkMappingOutput(rawText);

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const cost = estimateCost(inputTokens, outputTokens, MODEL);

    const allContacts = [...parsed.priority_1_contacts, ...parsed.priority_2_contacts, ...parsed.inferred_connections];
    let stagedCount = 0;
    let connectionCount = 0;

    for (const contact of allContacts) {
      const stagedId = ulid();
      await supabase.from('staged_entities').insert({
        staged_entity_id: stagedId,
        display_name: contact.name,
        entity_type: 'person',
        attributes: {
          current_role: contact.current_role,
          wealth_signals: contact.wealth_signals,
          philanthropic_track: contact.philanthropic_track,
          linkedin_url: contact.linkedin_url,
          wikipedia_url: contact.wikipedia_url,
          sensitivity_flag: contact.sensitivity_flag,
        },
        source: 'augmentation',
        source_run_id: runId,
        promotion_status: 'pending',
      });
      stagedCount++;

      await supabase.from('network_connections').insert({
        connection_id: ulid(),
        source_entity_id: entity.canonical_entity_id,
        staged_entity_id: stagedId,
        connection_type: contact.warm_route ? 'documented' : 'inferred',
        via_organisation: contact.via_organisation,
        priority: contact.priority,
        augmentation_run_id: augRunId,
        background_check: {
          current_role: contact.current_role,
          wealth_signals: contact.wealth_signals,
          philanthropic_track: contact.philanthropic_track,
          linkedin_url: contact.linkedin_url,
          wikipedia_url: contact.wikipedia_url,
        },
        evidence: { warm_route: contact.warm_route },
      });
      connectionCount++;

      if (contact.priority === 1) {
        // unique constraint violation is expected for duplicate routes — ignore errors
        await supabase.from('introduction_routes').upsert({
          route_id: ulid(),
          target_entity_id: entity.canonical_entity_id,
          introducer_entity_id: entity.canonical_entity_id,
          route_type: 'network_inferred',
          warmth_tier: 2,
          via_organisation: contact.via_organisation,
          evidence: {
            source: 'network_mapping',
            contact_name: contact.name,
            warm_route: contact.warm_route,
            staged_entity_id: stagedId,
          },
          source: 'augmentation',
        }, { onConflict: 'route_id', ignoreDuplicates: true });
      }
    }

    const storageUri = `augmentation/${runId}/${entity.canonical_entity_id}/network_mapping.md`;

    await supabase.from('seed_augmentation_runs').update({
      status: 'completed',
      result_storage_uri: storageUri,
      result_summary: {
        organisations: parsed.organisations.length,
        priority_1: parsed.priority_1_contacts.length,
        priority_2: parsed.priority_2_contacts.length,
        inferred: parsed.inferred_connections.length,
        research_gaps: parsed.research_gaps.length,
      },
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: cost,
      completed_at: new Date().toISOString(),
    }).eq('augmentation_run_id', augRunId);

    await supabase.from('seeds').update({
      augmentation_status: 'network_mapped',
    }).eq('canonical_entity_id', entity.canonical_entity_id);

    await updateRunCost(supabase, runId, cost);

    return {
      augmentation_run_id: augRunId,
      parsed,
      staged_entity_count: stagedCount,
      connection_count: connectionCount,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: cost,
    };
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
