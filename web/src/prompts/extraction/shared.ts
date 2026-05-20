/**
 * Shared extraction prompt fragments used by all document-type prompts.
 *
 * Keeps the JSON schema and core extraction rules in one place so
 * per-type prompts only add document-specific guidance and examples.
 */
import { EXTRACTION_OUTPUT_JSON_SCHEMA } from '@/schemas/extraction-output';

/** Core extraction rules that apply regardless of document type. */
export const CORE_EXTRACTION_RULES = `## Core Rules

1. Extract ONLY what is explicitly stated in the document. Never infer, guess, or hallucinate.
2. Every extracted item MUST include an evidence_span — the exact quote from the source text.
3. Every evidence_span MUST include accurate span_start and span_end character offsets into the original document.
4. Rate extraction_confidence between 0 and 1 for every item:
   - 1.0 = unambiguous, clearly stated
   - 0.8-0.9 = high confidence, minor formatting ambiguity
   - 0.6-0.7 = moderate confidence, some interpretation needed
   - below 0.6 = low confidence, include only if the text still explicitly supports it
5. For entity normalisation:
   - Person names: "SURNAME, First Middle" format, title-cased, titles removed but stored in attributes
   - Organisation names: official registered name where stated, preserve "Ltd", "PLC", "CIO" suffixes
   - Addresses: preserve as written; normalisation happens downstream
   - Registration numbers: preserve exactly as written; validation happens downstream
6. Use entity_type values exactly: "person", "organisation", "address", "registration_number"
7. Use relationship_type values exactly: "trustee_of", "director_of", "employee_of", "donor_to", "received_donation_from", "subsidiary_of", "related_to"
8. For source_entity_ref and target_entity_ref in relationships, use the raw_value of the referenced entity.
9. For donor_ref and recipient_ref in donations, use the raw_value of the referenced entity.
10. Dates should be ISO 8601 format (YYYY-MM-DD) where possible. If only a year is known, use "YYYY-01-01".
11. Currency defaults to "GBP" unless another currency is explicitly stated.
12. If a person holds multiple roles at the same organisation, create separate relationship records for each role.
13. Include ALL evidence spans — one per extracted entity, relationship, and donation, plus any additional spans for financial figures or role descriptions.`;

/** The JSON schema block to embed in prompts (R1.3). */
export const OUTPUT_SCHEMA_BLOCK = `## Output Format

Return a single JSON object matching this schema exactly. No markdown fencing, no commentary — only valid JSON.

\`\`\`json
${EXTRACTION_OUTPUT_JSON_SCHEMA}
\`\`\``;

/** Builds a complete system prompt from document-type-specific parts. */
export function buildExtractionPrompt(parts: {
  docTypeDescription: string;
  extractionGuidance: string;
  examples: string;
}): string {
  return `You are a structured data extraction system. Your task is to extract entities, relationships, donations, and evidence spans from UK charity and company filings.

## Document Type

${parts.docTypeDescription}

${CORE_EXTRACTION_RULES}

## Document-Specific Guidance

${parts.extractionGuidance}

${OUTPUT_SCHEMA_BLOCK}

## Examples

${parts.examples}`;
}
