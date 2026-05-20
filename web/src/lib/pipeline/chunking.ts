/**
 * Section-aware document chunking — F3.3-T3.
 * PRD ref: §13 — chunk documents at section boundaries (markdown headers).
 *
 * Features:
 * - Splits on markdown headers (# to ######)
 * - Respects configurable context window limit (default 100K tokens)
 * - Cross-chunk mention reconciliation: merges entity mentions across chunks
 * - Each chunk preserves metadata: document_id, chunk_index, section_headers, byte_range
 */

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface ChunkMeta {
  document_id: string;
  chunk_index: number;
  section_headers: string[];
  byte_range: { start: number; end: number };
  text: string;
}

export interface EntityMention {
  normalised_value: string;
  entity_type: string;
  chunk_indices: number[];
  /** Combined evidence spans across chunks. */
  occurrences: number;
}

export interface ChunkingResult {
  chunks: ChunkMeta[];
  document_id: string;
}

export interface ReconciliationResult {
  merged_mentions: EntityMention[];
}

// -------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------

/** Default context window limit in tokens. Roughly 4 chars per token. */
export const DEFAULT_TOKEN_LIMIT = 100_000;
const CHARS_PER_TOKEN = 4;

// -------------------------------------------------------------------
// Header detection
// -------------------------------------------------------------------

const HEADER_REGEX = /^(#{1,6})\s+(.+)$/;

function isHeader(line: string): { level: number; text: string } | null {
  const match = HEADER_REGEX.exec(line.trimEnd());
  if (!match) return null;
  return { level: match[1].length, text: match[2] };
}

// -------------------------------------------------------------------
// Core chunking
// -------------------------------------------------------------------

/**
 * Chunk a markdown document at section boundaries.
 * If a section exceeds the token limit, it is split at paragraph boundaries.
 */
export function chunkDocument(
  documentId: string,
  text: string,
  tokenLimit: number = DEFAULT_TOKEN_LIMIT,
): ChunkingResult {
  const charLimit = tokenLimit * CHARS_PER_TOKEN;
  const lines = text.split('\n');

  const sections: { headers: string[]; startByte: number; lines: string[] }[] = [];
  let currentHeaders: string[] = [];
  let currentLines: string[] = [];
  let currentStartByte = 0;
  let byteOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const header = isHeader(line);

    if (header && currentLines.length > 0) {
      // Flush previous section
      sections.push({
        headers: [...currentHeaders],
        startByte: currentStartByte,
        lines: [...currentLines],
      });
      currentLines = [];
      currentStartByte = byteOffset;
    }

    if (header) {
      // Trim header stack to the appropriate level
      currentHeaders = currentHeaders.filter((_, idx) => idx < header.level - 1);
      currentHeaders[header.level - 1] = header.text;
      // Remove any deeper headers
      currentHeaders = currentHeaders.slice(0, header.level);
    }

    currentLines.push(line);
    byteOffset += Buffer.byteLength(line, 'utf-8') + 1; // +1 for newline
  }

  // Flush last section
  if (currentLines.length > 0) {
    sections.push({
      headers: [...currentHeaders],
      startByte: currentStartByte,
      lines: [...currentLines],
    });
  }

  // Build chunks, splitting oversized sections
  const chunks: ChunkMeta[] = [];

  for (const section of sections) {
    const sectionText = section.lines.join('\n');
    const sectionBytes = Buffer.byteLength(sectionText, 'utf-8');

    if (sectionText.length <= charLimit) {
      chunks.push({
        document_id: documentId,
        chunk_index: chunks.length,
        section_headers: section.headers.filter(Boolean),
        byte_range: { start: section.startByte, end: section.startByte + sectionBytes },
        text: sectionText,
      });
    } else {
      // Split at paragraph boundaries (double newline)
      const paragraphs = sectionText.split(/\n\n+/);
      let buffer = '';
      let bufferStart = section.startByte;

      for (const para of paragraphs) {
        if (buffer.length + para.length + 2 > charLimit && buffer.length > 0) {
          const bufferBytes = Buffer.byteLength(buffer, 'utf-8');
          chunks.push({
            document_id: documentId,
            chunk_index: chunks.length,
            section_headers: section.headers.filter(Boolean),
            byte_range: { start: bufferStart, end: bufferStart + bufferBytes },
            text: buffer,
          });
          bufferStart = bufferStart + bufferBytes;
          buffer = '';
        }
        buffer += (buffer ? '\n\n' : '') + para;
      }

      if (buffer) {
        const bufferBytes = Buffer.byteLength(buffer, 'utf-8');
        chunks.push({
          document_id: documentId,
          chunk_index: chunks.length,
          section_headers: section.headers.filter(Boolean),
          byte_range: { start: bufferStart, end: bufferStart + bufferBytes },
          text: buffer,
        });
      }
    }
  }

  return { chunks, document_id: documentId };
}

// -------------------------------------------------------------------
// Cross-chunk mention reconciliation
// -------------------------------------------------------------------

/**
 * Reconcile entity mentions across chunks. When the same entity
 * (matched by entity_type + normalised_value) appears in multiple
 * chunks, merge into a single mention tracking all chunk indices.
 */
export function reconcileMentions(
  chunkMentions: { chunk_index: number; entity_type: string; normalised_value: string }[],
): ReconciliationResult {
  const map = new Map<string, EntityMention>();

  for (const m of chunkMentions) {
    const key = `${m.entity_type}::${m.normalised_value.trim().toLowerCase()}`;
    const existing = map.get(key);
    if (existing) {
      if (!existing.chunk_indices.includes(m.chunk_index)) {
        existing.chunk_indices.push(m.chunk_index);
      }
      existing.occurrences++;
    } else {
      map.set(key, {
        normalised_value: m.normalised_value,
        entity_type: m.entity_type,
        chunk_indices: [m.chunk_index],
        occurrences: 1,
      });
    }
  }

  return { merged_mentions: Array.from(map.values()) };
}
