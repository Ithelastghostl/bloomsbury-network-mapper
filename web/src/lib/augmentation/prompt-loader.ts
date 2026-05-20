import { readFile } from 'fs/promises';
import { createHash } from 'crypto';
import { join } from 'path';

const PROMPT_DIR = join(process.cwd(), '..', 'Seed_reference');

const promptCache = new Map<string, { content: string; hash: string }>();

async function loadPromptFile(filename: string): Promise<{ content: string; hash: string }> {
  const cached = promptCache.get(filename);
  if (cached) return cached;

  const filePath = join(PROMPT_DIR, filename);
  const content = await readFile(filePath, 'utf-8');
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
  const result = { content, hash };
  promptCache.set(filename, result);
  return result;
}

export async function loadHnwResearchPrompt(): Promise<{ content: string; hash: string }> {
  return loadPromptFile('HNW_Research_Prompt_v10.txt');
}

export async function loadNetworkMappingPrompt(): Promise<{ content: string; hash: string }> {
  return loadPromptFile('Network_Mapping_Prompt_v10.txt');
}

export function buildResearchSystemPrompt(promptContent: string, targetName: string): string {
  return promptContent
    .replace('[INSERT FULL NAME HERE]', targetName)
    .replace('[NAME]', targetName);
}

export function buildNetworkMappingSystemPrompt(promptContent: string, researchProfile: string): string {
  return promptContent.replace('[PASTE FULL HNW RESEARCH PROFILE HERE]', researchProfile);
}
