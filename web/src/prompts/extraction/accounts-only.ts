/**
 * Extraction prompt for bare accounts documents.
 * These are minimal filings (often micro-entity or small charity)
 * with limited narrative but structured financial data.
 */
import { buildExtractionPrompt } from './shared';

export const ACCOUNTS_ONLY_PROMPT = buildExtractionPrompt({
  docTypeDescription:
    'This is a **bare accounts** document — a minimal filing that contains financial figures ' +
    'with little or no narrative. It may be a micro-entity set of accounts, an abbreviated balance sheet, ' +
    'or a receipt-and-payment account. Entity density is low; focus on what is explicitly stated.',

  extractionGuidance: `### What to expect
- These filings are short and contain mostly numbers with minimal text.
- There may be a cover page with the charity/company name, registration numbers, and the signing trustee.
- There may be a simple balance sheet or income/expenditure summary but no detailed notes.

### Entities
- Extract the reporting entity name as an "organisation".
- Extract any registration numbers from the cover page.
- Extract the name(s) of the signing trustee(s) or director(s) as "person" entities.
- If an accountant or examiner is named, extract them.

### Donations
- Bare accounts rarely name individual donors. Only extract donations if a specific donor or grant source is named with an amount.
- If the accounts show "donations received: £X" without naming a source, do NOT fabricate a donor — skip it.

### Relationships
- Create trustee_of or director_of relationships for any signing officers.
- If an accountant or independent examiner is named, create a "related_to" relationship.

### Confidence
- Due to limited context in bare accounts, set confidence to 0.8-0.9 for clearly stated items.
- For items where the role is implied but not explicitly stated (e.g., a name at the bottom of a balance sheet assumed to be the signing trustee), set confidence to 0.7.`,

  examples: `### Good extraction from a bare accounts document

Input snippet:
"Hope Community Trust. Charity Registration Number: 1198765. Receipts and Payments Account for the year ended 31 December 2023. Approved by the trustees on 15 May 2024 and signed on their behalf by: Mrs Patricia Green, Trustee. Independent examiner: H. Roberts & Co."

Expected entities:
\`\`\`json
[
  {
    "entity_type": "organisation",
    "raw_value": "Hope Community Trust",
    "normalised_value": "Hope Community Trust",
    "attributes": {},
    "evidence_span": "Hope Community Trust",
    "span_start": 0,
    "span_end": 20,
    "extraction_confidence": 1.0
  },
  {
    "entity_type": "registration_number",
    "raw_value": "1198765",
    "normalised_value": "1198765",
    "attributes": { "register": "charity_commission" },
    "evidence_span": "Charity Registration Number: 1198765",
    "span_start": 22,
    "span_end": 58,
    "extraction_confidence": 1.0
  },
  {
    "entity_type": "person",
    "raw_value": "Mrs Patricia Green",
    "normalised_value": "Green, Patricia",
    "attributes": { "title": "Mrs", "role": "Trustee" },
    "evidence_span": "Mrs Patricia Green, Trustee",
    "span_start": 165,
    "span_end": 192,
    "extraction_confidence": 1.0
  },
  {
    "entity_type": "organisation",
    "raw_value": "H. Roberts & Co",
    "normalised_value": "H. Roberts & Co",
    "attributes": { "role": "independent_examiner" },
    "evidence_span": "Independent examiner: H. Roberts & Co",
    "span_start": 194,
    "span_end": 231,
    "extraction_confidence": 0.9
  }
]
\`\`\`

Expected relationships:
\`\`\`json
[
  {
    "relationship_type": "trustee_of",
    "source_entity_ref": "Mrs Patricia Green",
    "target_entity_ref": "Hope Community Trust",
    "evidence_span": "Mrs Patricia Green, Trustee",
    "valid_from": null,
    "valid_to": null,
    "confidence": 1.0
  },
  {
    "relationship_type": "related_to",
    "source_entity_ref": "H. Roberts & Co",
    "target_entity_ref": "Hope Community Trust",
    "evidence_span": "Independent examiner: H. Roberts & Co",
    "valid_from": null,
    "valid_to": null,
    "confidence": 0.9
  }
]
\`\`\``,
});
