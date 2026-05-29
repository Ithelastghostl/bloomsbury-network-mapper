import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { ParsedAgentOutput, ParsedDirectorship, ParsedCoDirector } from './types';

/**
 * Parse JSONL agent transcript files and extract structured enrichment data.
 *
 * Agent outputs are JSONL where each line is a transcript event.
 * We look for assistant messages containing ```json blocks with seed_name.
 */
export function parseTranscriptDir(dirPath: string): ParsedAgentOutput[] {
  const files = readdirSync(dirPath)
    .filter(f => f.endsWith('.output'))
    .sort();

  const results: ParsedAgentOutput[] = [];
  for (const file of files) {
    const parsed = parseTranscriptFile(join(dirPath, file));
    if (parsed) results.push(parsed);
  }
  return results;
}

export function parseTranscriptFile(filePath: string): ParsedAgentOutput | null {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(Boolean);

  let best: ParsedAgentOutput | null = null;

  for (const line of lines) {
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    if (obj.type !== 'assistant') continue;

    const msg = obj.message as Record<string, unknown> | undefined;
    if (!msg) continue;
    const rawContent = msg.content;

    const texts: string[] = [];
    if (Array.isArray(rawContent)) {
      for (const block of rawContent) {
        if (
          typeof block === 'object' &&
          block !== null &&
          (block as Record<string, unknown>).type === 'text'
        ) {
          texts.push((block as Record<string, string>).text ?? '');
        }
      }
    } else if (typeof rawContent === 'string') {
      texts.push(rawContent);
    }

    for (const text of texts) {
      const jsonBlocks = extractJsonBlocks(text);
      for (const data of jsonBlocks) {
        if (typeof data.seed_name !== 'string') continue;
        const parsed = normalizeAgentOutput(data);
        if (parsed && (!best || parsed.relationships_found.length > best.relationships_found.length)) {
          best = parsed;
        }
      }
    }
  }

  return best;
}

function extractJsonBlocks(text: string): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];
  const regex = /```json\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    try {
      const data = JSON.parse(match[1].trim());
      if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        blocks.push(data as Record<string, unknown>);
      }
    } catch {
      // malformed JSON — skip
    }
  }
  return blocks;
}

function normalizeAgentOutput(data: Record<string, unknown>): ParsedAgentOutput | null {
  const seedName = data.seed_name as string;
  if (!seedName) return null;

  return {
    seed_name: seedName,
    directorships: normalizeDirectorships(data.directorships),
    co_directors: normalizeCoDirectors(data.co_directors),
    wealth_signals: normalizeStringArray(data.wealth_signals),
    philanthropy: normalizeStringArray(data.philanthropy),
    relationships_found: normalizeRelationships(data.relationships_found),
    family_connections: normalizeStringArray(data.family_connections),
  };
}

function normalizeDirectorships(raw: unknown): ParsedDirectorship[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((d): d is Record<string, unknown> => typeof d === 'object' && d !== null)
    .map(d => ({
      company_name: String(d.company_name ?? d.name ?? ''),
      company_number: d.company_number != null ? String(d.company_number) : undefined,
      role: String(d.role ?? d.officer_role ?? 'director'),
      status: d.status != null ? String(d.status) : undefined,
      appointed: d.appointed != null ? String(d.appointed) : d.appointed_on != null ? String(d.appointed_on) : undefined,
      resigned: d.resigned != null ? String(d.resigned) : d.resigned_on != null ? String(d.resigned_on) : undefined,
    }))
    .filter(d => d.company_name.length > 0);
}

function normalizeCoDirectors(raw: unknown): ParsedCoDirector[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((d): d is Record<string, unknown> => typeof d === 'object' && d !== null)
    .map(d => ({
      name: String(d.name ?? ''),
      company_name: d.company_name != null ? String(d.company_name) : undefined,
      companies: Array.isArray(d.companies) ? d.companies.map(String) : undefined,
      role: d.role != null ? String(d.role) : undefined,
      note: d.note != null ? String(d.note) : undefined,
    }))
    .filter(d => d.name.length > 1);
}

function normalizeRelationships(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(r => {
      if (typeof r === 'string') return r;
      if (typeof r === 'object' && r !== null && 'name' in r) return String((r as Record<string, unknown>).name);
      return '';
    })
    .filter(r => r.length > 1 && r.length < 200);
}

function normalizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(s => (typeof s === 'string' ? s : typeof s === 'object' && s !== null ? JSON.stringify(s) : String(s)))
    .filter(s => s.length > 0);
}
