import type { UnifiedSweepConfig } from './unified-sweep';

export function buildSweepConfig(overrides?: Partial<UnifiedSweepConfig>): UnifiedSweepConfig {
  const base: UnifiedSweepConfig = {
    companiesHouse: { apiKey: requireEnv('COMPANIES_HOUSE_API_KEY') },
    charityCommission: {},
    electoralCommission: {},
    threesSixtyGiving: {},
    fcaRegister: {},
    landRegistry: {},
    gdelt: {},
    guardian: { apiKey: process.env.GUARDIAN_API_KEY },
    forbes: {},
    llm: {
      apiKey: requireEnv('ANTHROPIC_API_KEY'),
      model: process.env.SWEEP_LLM_MODEL ?? 'claude-sonnet-4-20250514',
    },
  };
  return { ...base, ...overrides };
}

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}
