import Anthropic from '@anthropic-ai/sdk';
import type { CanonicalEntity } from '@/types/database';
import type { GraphEnrichmentSignal, DiscoveredRelationship, DiscoveredArticle } from './types';
import type { LayerAResult } from './unified-sweep';

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 8000;

interface WebSearchFinding {
  finding_type: 'wealth_signal' | 'philanthropy' | 'relationship' | 'honour' | 'biographical';
  summary: string;
  source_url: string;
  confidence: number;
  entities_mentioned: string[];
  relationships_found: Array<{
    target_name: string;
    target_type: 'person' | 'organisation' | 'charity' | 'company';
    relationship_type: string;
  }>;
}

export async function runLlmWebSearch(
  entity: CanonicalEntity,
  layerA: LayerAResult,
  existingArticles: DiscoveredArticle[],
  config: { apiKey: string; model?: string },
): Promise<GraphEnrichmentSignal[]> {
  const client = new Anthropic({ apiKey: config.apiKey });
  const name = entity.display_name;

  const context = buildContextFromLayerA(name, layerA, existingArticles);

  const response = await client.messages.create({
    model: config.model ?? MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 0,
    system: buildSystemPrompt(),
    tools: [{ name: 'web_search', type: 'web_search_20250305' as const }],
    messages: [
      {
        role: 'user',
        content: `Research "${name}" using web search. ${context}\n\nRun ALL the search queries described in your instructions. Return your findings as a JSON array.`,
      },
    ],
  });

  const textBlocks = response.content.filter(
    (b): b is Anthropic.TextBlock => b.type === 'text',
  );
  const rawText = textBlocks.map(b => b.text).join('\n\n');
  const findings = parseFindings(rawText);

  return findingsToSignals(name, findings);
}

function buildSystemPrompt(): string {
  return `You are a UK wealth and philanthropy researcher. You have web_search available.

For the given individual, run EVERY one of these searches (do not skip any):

1. "{name}" net worth OR "rich list" OR wealth OR "Sunday Times Rich List"
2. "{name}" philanthropy OR foundation OR "charitable trust" OR donor
3. "{name}" trustee OR "charity commission" OR patron
4. "{name}" Companies House OR director OR board
5. "{name}" honour OR knighthood OR CBE OR OBE OR MBE
6. "{name}" + their top company/charity (given in context) + board OR colleagues
7. "{name}" political donation OR Electoral Commission
8. "{name}" sport OR football OR youth

After running ALL searches, return your findings as a JSON array wrapped in <findings> tags.
Each finding must have: finding_type, summary, source_url, confidence (0-1),
entities_mentioned (string[]), relationships_found (array of {target_name, target_type, relationship_type}).

finding_type must be one of: wealth_signal, philanthropy, relationship, honour, biographical.
target_type must be one of: person, organisation, charity, company.

Only include findings with genuine evidence from search results. Do not fabricate.
If a search returns nothing relevant, skip it in the output.`;
}

function buildContextFromLayerA(
  name: string,
  layerA: LayerAResult,
  existingArticles: DiscoveredArticle[],
): string {
  const parts: string[] = [];

  if (layerA.directorships.length > 0) {
    const active = layerA.directorships.filter(d => !d.resigned_on);
    const top = active.slice(0, 3).map(d => d.company_name);
    if (top.length > 0) parts.push(`Known directorships: ${top.join(', ')}.`);
  }

  if (layerA.trusteeships.length > 0) {
    const top = layerA.trusteeships.slice(0, 3).map(t => t.charity_name);
    parts.push(`Known trusteeships: ${top.join(', ')}.`);
  }

  if (layerA.politicalDonations.length > 0) {
    const total = layerA.politicalDonations.reduce((s, d) => s + d.value, 0);
    parts.push(`Known political donations totalling £${total.toLocaleString()}.`);
  }

  if (existingArticles.length > 0) {
    parts.push(`${existingArticles.length} news articles already found.`);
  }

  return parts.length > 0 ? `Context from government registries: ${parts.join(' ')}` : '';
}

function parseFindings(text: string): WebSearchFinding[] {
  const match = text.match(/<findings>([\s\S]*?)<\/findings>/);
  if (!match) {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    try {
      return JSON.parse(jsonMatch[0]) as WebSearchFinding[];
    } catch {
      return [];
    }
  }
  try {
    return JSON.parse(match[1]) as WebSearchFinding[];
  } catch {
    return [];
  }
}

function findingsToSignals(
  entityName: string,
  findings: WebSearchFinding[],
): GraphEnrichmentSignal[] {
  const signals: GraphEnrichmentSignal[] = [];

  for (const f of findings) {
    const relationships: DiscoveredRelationship[] = (f.relationships_found ?? []).map(r => ({
      target_name: r.target_name,
      target_entity_type: r.target_type,
      relationship_type: r.relationship_type,
      confidence: f.confidence,
      source_layer: 'B' as const,
      evidence_url: f.source_url,
      evidence_text: f.summary,
    }));

    const articles: DiscoveredArticle[] = f.source_url
      ? [
          {
            url: f.source_url,
            title: f.summary.slice(0, 120),
            source_name: extractDomain(f.source_url),
            mentions_entity: true,
            article_type: mapFindingToArticleType(f.finding_type),
          },
        ]
      : [];

    signals.push({
      source: 'web_search',
      signal_type: 'web_research_finding',
      external_record_id: `ws_${entityName}_${f.finding_type}_${signals.length}`,
      signal_payload: {
        finding_type: f.finding_type,
        summary: f.summary,
        source_url: f.source_url,
        entities_mentioned: f.entities_mentioned,
      },
      match_confidence: f.confidence,
      match_features: [{ feature: 'web_search', weight: 1.0, score: f.confidence }],
      discovered_relationships: relationships,
      discovered_articles: articles,
    });
  }

  return signals;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return 'unknown';
  }
}

function mapFindingToArticleType(
  type: string,
): 'news' | 'filing' | 'profile' | 'philanthropy' | 'rich_list' | 'other' {
  switch (type) {
    case 'wealth_signal':
      return 'rich_list';
    case 'philanthropy':
      return 'philanthropy';
    case 'biographical':
      return 'profile';
    default:
      return 'news';
  }
}
