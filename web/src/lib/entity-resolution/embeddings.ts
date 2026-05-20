/**
 * Embedding generation for entity mentions (F6.1-T4).
 *
 * Generates embeddings using OpenAI ada-002 and stores them in the
 * `embedding` column (pgvector, vector(1536)) on entity_mentions.
 *
 * PRD refs: §15.3 (embedding_similarity signal), §11.1 (embedding column)
 */

import type { EntityMention } from '@/types/database';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface EmbeddingResult {
  entity_mention_id: string;
  embedding: number[];
}

export interface BatchEmbeddingResult {
  results: EmbeddingResult[];
  errors: Array<{ entity_mention_id: string; error: string }>;
}

/** Minimal interface for the OpenAI embedding API response. */
interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
  usage: { prompt_tokens: number; total_tokens: number };
}

/** Options for embedding generation. */
export interface EmbeddingOptions {
  /** OpenAI API key. If not provided, reads from OPENAI_API_KEY env var. */
  apiKey?: string;
  /** Model to use. Defaults to text-embedding-ada-002 per PRD. */
  model?: string;
  /** Maximum texts per API call. OpenAI allows up to 2048. */
  batchSize?: number;
  /** Base URL for the OpenAI API. */
  baseUrl?: string;
}

// -------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------

const DEFAULT_MODEL = 'text-embedding-ada-002';
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const EMBEDDING_DIMENSION = 1536;

// -------------------------------------------------------------------
// Text preparation
// -------------------------------------------------------------------

/**
 * Build the text string to embed for an entity mention.
 * Combines normalised_value with key attributes for richer semantic matching.
 */
export function buildEmbeddingText(mention: EntityMention): string {
  const parts: string[] = [mention.normalised_value];

  const attrs = mention.attributes as Record<string, unknown>;

  // Add entity type for context
  parts.push(`[${mention.entity_type}]`);

  // Add organisation context if available
  const org = attrs?.organisation ?? attrs?.organization;
  if (typeof org === 'string') parts.push(org);
  const orgs = attrs?.organisations ?? attrs?.organizations;
  if (Array.isArray(orgs)) {
    for (const o of orgs) {
      if (typeof o === 'string') parts.push(o);
    }
  }

  // Add role context
  const role = attrs?.role;
  if (typeof role === 'string') parts.push(role);
  const roles = attrs?.roles;
  if (Array.isArray(roles)) {
    for (const r of roles) {
      if (typeof r === 'string') parts.push(r);
    }
  }

  // Add address if available
  const address = attrs?.address;
  if (typeof address === 'string') parts.push(address);

  return parts.join(' | ');
}

// -------------------------------------------------------------------
// API calls
// -------------------------------------------------------------------

/**
 * Call OpenAI embeddings API for a batch of texts.
 * Exported for testing with dependency injection.
 */
export async function callEmbeddingApi(
  texts: string[],
  options: EmbeddingOptions = {},
): Promise<number[][]> {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for embedding generation');
  }

  const model = options.model ?? DEFAULT_MODEL;
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;

  const response = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input: texts, model }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${body}`);
  }

  const json = (await response.json()) as OpenAIEmbeddingResponse;

  // Sort by index to maintain input order
  const sorted = [...json.data].sort((a, b) => a.index - b.index);
  return sorted.map((d) => d.embedding);
}

// -------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------

/**
 * Generate embeddings for a batch of entity mentions.
 *
 * Splits into sub-batches per batchSize, calls OpenAI ada-002,
 * and returns results mapped to entity_mention_ids.
 */
export async function generateEmbeddings(
  mentions: EntityMention[],
  options: EmbeddingOptions = {},
): Promise<BatchEmbeddingResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const results: EmbeddingResult[] = [];
  const errors: BatchEmbeddingResult['errors'] = [];

  // Process in batches
  for (let i = 0; i < mentions.length; i += batchSize) {
    const batch = mentions.slice(i, i + batchSize);
    const texts = batch.map(buildEmbeddingText);

    try {
      const embeddings = await callEmbeddingApi(texts, options);

      for (let j = 0; j < batch.length; j++) {
        const embedding = embeddings[j];
        if (embedding && embedding.length === EMBEDDING_DIMENSION) {
          results.push({
            entity_mention_id: batch[j].entity_mention_id,
            embedding,
          });
        } else {
          errors.push({
            entity_mention_id: batch[j].entity_mention_id,
            error: `Invalid embedding dimension: expected ${EMBEDDING_DIMENSION}, got ${embedding?.length ?? 0}`,
          });
        }
      }
    } catch (err) {
      // Record error for all mentions in this batch
      for (const m of batch) {
        errors.push({
          entity_mention_id: m.entity_mention_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return { results, errors };
}

/**
 * Apply generated embeddings back to entity mentions (in-memory).
 * Returns new mention objects with embeddings set.
 */
export function applyEmbeddings(
  mentions: EntityMention[],
  embeddingResults: EmbeddingResult[],
): EntityMention[] {
  const embeddingMap = new Map<string, number[]>();
  for (const r of embeddingResults) {
    embeddingMap.set(r.entity_mention_id, r.embedding);
  }

  return mentions.map((m) => {
    const embedding = embeddingMap.get(m.entity_mention_id);
    return embedding ? { ...m, embedding } : m;
  });
}
