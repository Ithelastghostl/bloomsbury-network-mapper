/**
 * Barrel export for extraction prompts.
 *
 * Each prompt targets a specific document type (PRD §13, R1.2).
 * Use getPromptForDocType() to route a classified document to its prompt.
 */
export { MIXED_PROMPT } from './mixed';
export { TRUSTEE_FILING_PROMPT } from './trustee-filing';
export { FINANCIAL_STATEMENT_PROMPT } from './financial-statement';
export { ACCOUNTS_ONLY_PROMPT } from './accounts-only';
export { ANNUAL_REPORT_PROMPT } from './annual-report';

export {
  EXTRACTION_PROMPT_VERSION,
  EXTRACTION_MODEL,
  EXTRACTION_TEMPERATURE,
} from './version';

import { MIXED_PROMPT } from './mixed';
import { TRUSTEE_FILING_PROMPT } from './trustee-filing';
import { FINANCIAL_STATEMENT_PROMPT } from './financial-statement';
import { ACCOUNTS_ONLY_PROMPT } from './accounts-only';
import { ANNUAL_REPORT_PROMPT } from './annual-report';

const PROMPT_MAP: Record<string, string> = {
  mixed: MIXED_PROMPT,
  trustee_filing: TRUSTEE_FILING_PROMPT,
  financial_statement: FINANCIAL_STATEMENT_PROMPT,
  accounts_only: ACCOUNTS_ONLY_PROMPT,
  annual_report: ANNUAL_REPORT_PROMPT,
};

/**
 * Returns the extraction system prompt for a given document type.
 *
 * @throws Error if docType is unsupported (should be quarantined per PRD §13).
 */
export function getPromptForDocType(docType: string): string {
  const prompt = PROMPT_MAP[docType];
  if (!prompt) {
    throw new Error(
      `Unsupported document type for extraction: "${docType}". ` +
      `Supported types: ${Object.keys(PROMPT_MAP).join(', ')}`,
    );
  }
  return prompt;
}
