/**
 * Optional Claude-powered rephrasing of the skeleton introduction angle.
 * PRD ref: §18.8 steps 3-4.
 *
 * CRITICAL: validates every entity, date, role, and organisation in the
 * output appears in the input facts. Falls back to skeleton on failure (step 5).
 */

import type { SkeletonInput } from './skeleton';

// ---------------------------------------------------------------
// Fact extraction
// ---------------------------------------------------------------

export interface ExtractedFacts {
  /** All named entities and organisations from the input. */
  names: Set<string>;
  /** All dates/years from the input. */
  dates: Set<string>;
  /** All role titles from the input. */
  roles: Set<string>;
}

/**
 * Extract all verifiable facts from the skeleton input.
 * Used to validate LLM output against source data.
 */
export function extractFacts(input: SkeletonInput): ExtractedFacts {
  const names = new Set<string>();
  const dates = new Set<string>();
  const roles = new Set<string>();

  // Seed and candidate names
  names.add(normalise(input.seedName));
  names.add(normalise(input.candidateName));

  // Entity names from the path
  for (const id of input.pathNodes) {
    const name = input.entityNames[id];
    if (name) names.add(normalise(name));
  }

  // All entity names in the map
  for (const name of Object.values(input.entityNames)) {
    names.add(normalise(name));
  }

  // Shared affiliations
  for (const aff of input.sharedAffiliations) {
    names.add(normalise(aff));
  }

  // Roles
  for (const role of input.roles) {
    names.add(normalise(role.entity));
    roles.add(normalise(role.role));
    if (role.start) dates.add(normalise(role.start));
    if (role.end) dates.add(normalise(role.end));
  }

  return { names, dates, roles };
}

// ---------------------------------------------------------------
// Validation
// ---------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  /** Tokens found in output but not in input facts. */
  violations: string[];
}

/**
 * Validate that a rephrased output contains ONLY facts from the input.
 * PRD §18.8 step 4 — every named entity, date, role, and org must appear in input.
 *
 * Strategy: extract proper nouns, dates, and role-like words from the output,
 * then check each against the known facts.
 */
export function validateRephrase(
  output: string,
  facts: ExtractedFacts,
): ValidationResult {
  const violations: string[] = [];

  // Extract potential proper nouns (capitalised words that aren't sentence starters)
  const outputNames = extractProperNouns(output);
  for (const name of outputNames) {
    if (!facts.names.has(normalise(name))) {
      violations.push(`Unknown entity: "${name}"`);
    }
  }

  // Extract dates (4-digit years, date patterns)
  const outputDates = extractDates(output);
  for (const date of outputDates) {
    if (!facts.dates.has(normalise(date))) {
      violations.push(`Unknown date: "${date}"`);
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

// ---------------------------------------------------------------
// Rephrase with validation
// ---------------------------------------------------------------

export interface RephraseOptions {
  /**
   * LLM call function. Injected so this module has no direct LLM dependency.
   * Takes a system prompt and user prompt, returns the LLM response text.
   */
  callLLM: (systemPrompt: string, userPrompt: string) => Promise<string>;
}

/**
 * Rephrase a skeleton into natural language using Claude (§18.8 step 3).
 * Validates the result (step 4). Falls back to skeleton on failure (step 5).
 *
 * Returns both skeleton and natural versions per step 6 and R5.5.
 */
export async function rephraseWithValidation(
  skeleton: string,
  input: SkeletonInput,
  options: RephraseOptions,
): Promise<{ skeleton: string; natural: string }> {
  const facts = extractFacts(input);

  try {
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(skeleton, input);

    const natural = await options.callLLM(systemPrompt, userPrompt);

    const validation = validateRephrase(natural, facts);

    if (!validation.valid) {
      // §18.8 step 5: fall back to skeleton
      return { skeleton, natural: skeleton };
    }

    return { skeleton, natural };
  } catch {
    // On any LLM failure, fall back to skeleton
    return { skeleton, natural: skeleton };
  }
}

// ---------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------

function buildSystemPrompt(): string {
  return [
    'You are a concise business writing assistant.',
    'Rephrase the provided introduction angle into natural, professional English.',
    'CRITICAL RULES:',
    '1. Use ONLY the facts provided. Do NOT add any information not present in the input.',
    '2. Every person name, organisation name, role title, and date in your output MUST appear in the provided facts.',
    '3. Do NOT infer, assume, or hallucinate any details.',
    '4. Keep the output to 2-4 sentences.',
    '5. Maintain a professional but warm tone suitable for a warm introduction context.',
  ].join('\n');
}

function buildUserPrompt(skeleton: string, input: SkeletonInput): string {
  const factLines: string[] = [
    `Seed contact: ${input.seedName}`,
    `Candidate: ${input.candidateName}`,
  ];

  for (const role of input.roles) {
    const dates = [role.start, role.end].filter(Boolean).join(' to ');
    factLines.push(
      `Role: ${input.candidateName} - ${role.role} at ${role.entity}${dates ? ` (${dates})` : ''}`,
    );
  }

  for (const aff of input.sharedAffiliations) {
    factLines.push(`Shared affiliation: ${aff}`);
  }

  return [
    'FACTS:',
    ...factLines,
    '',
    'SKELETON TO REPHRASE:',
    skeleton,
    '',
    'Rephrase the skeleton using only the facts above. Output the rephrased text only, nothing else.',
  ].join('\n');
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function normalise(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Extract likely proper nouns from text.
 * Matches sequences of capitalised words that aren't common English words.
 */
function extractProperNouns(text: string): string[] {
  const commonWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'has', 'have',
    'had', 'been', 'be', 'will', 'would', 'could', 'should', 'may', 'might',
    'shall', 'can', 'do', 'does', 'did', 'this', 'that', 'these', 'those',
    'it', 'its', 'they', 'them', 'their', 'he', 'she', 'him', 'her', 'his',
    'we', 'us', 'our', 'you', 'your', 'who', 'which', 'what', 'where',
    'when', 'how', 'not', 'no', 'so', 'if', 'then', 'than', 'as', 'also',
    'both', 'each', 'all', 'any', 'few', 'more', 'most', 'some', 'such',
    'only', 'very', 'just', 'about', 'between', 'through', 'during',
    'before', 'after', 'above', 'below', 'up', 'down', 'out', 'off',
    'over', 'under', 'again', 'further', 'once', 'there', 'here',
  ]);

  // Match capitalised word sequences (potential proper nouns)
  const matches = text.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) ?? [];

  const results: string[] = [];
  for (const match of matches) {
    const words = match.split(/\s+/);
    // Filter out common words that happen to start sentences
    const meaningful = words.filter(
      (w) => !commonWords.has(w.toLowerCase()),
    );
    if (meaningful.length > 0) {
      results.push(meaningful.join(' '));
    }
  }

  return results;
}

/**
 * Extract date-like patterns from text: years (2019-2025), date strings.
 */
function extractDates(text: string): string[] {
  const yearPattern = /\b(19|20)\d{2}\b/g;
  const matches = text.match(yearPattern) ?? [];
  return [...new Set(matches)];
}
