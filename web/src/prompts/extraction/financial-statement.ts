/**
 * Extraction prompt for standalone financial statement documents.
 * PRD §13: extraction focus = donors, recipients, amounts, years, related parties.
 */
import { buildExtractionPrompt } from './shared';

export const FINANCIAL_STATEMENT_PROMPT = buildExtractionPrompt({
  docTypeDescription:
    'This is a **standalone Financial Statements** document for a UK charity or company. ' +
    'It contains the Statement of Financial Activities (SOFA), balance sheet, cash flow statement, ' +
    'and notes to the accounts. Focus extraction on financial entities, donation flows, and related parties.',

  extractionGuidance: `### Donations and Grants
- Extract every named donor, grantor, and funding body from the notes to accounts.
- For each donation, record the amount, currency (default GBP), and the financial year.
- Link donors to the reporting entity using donor_to / received_donation_from relationships AND donation records.
- Distinguish between "donations received" and "grants made" — the direction matters.
- If a schedule of grants lists multiple recipients, extract each one individually.

### Related Parties
- The "related party transactions" note is high-value. Extract every named party, the nature of the relationship, and any amounts.
- Create "related_to" relationships for related party connections.
- If trustees made personal donations, extract those as donation records with the trustee as donor.

### Auditors, Bankers, Investment Managers
- Extract the auditor firm, banker, solicitor, and investment manager as "organisation" entities.
- Create "related_to" relationships linking them to the reporting entity.

### Registration Numbers
- The cover page or notes often restate charity and company numbers. Extract them.

### People
- Financial statements may name the signing trustee(s) and the auditor's signing partner. Extract them.
- If a note names key management personnel with remuneration, extract each person.

### Amounts
- Extract monetary amounts in numeric form without commas or currency symbols.
- If an amount is stated as "nil" or zero, you may omit the donation record unless the named party is still valuable (then include the relationship but omit the donation amount).`,

  examples: `### Good extraction from a financial statement

Input snippet:
"Note 4 — Donations and legacies: The Wolfson Foundation £100,000; The Headley Trust £75,000; Anonymous donors £12,450. Note 12 — Related party transactions: During the year, Mr James Wilson, a trustee, donated £5,000 to the charity (2022: £3,000). BDO LLP acted as auditors for the year."

Expected donations:
\`\`\`json
[
  {
    "donor_ref": "The Wolfson Foundation",
    "recipient_ref": "The charity",
    "amount": 100000,
    "currency": "GBP",
    "year": null,
    "evidence_span": "The Wolfson Foundation £100,000",
    "confidence": 1.0
  },
  {
    "donor_ref": "The Headley Trust",
    "recipient_ref": "The charity",
    "amount": 75000,
    "currency": "GBP",
    "year": null,
    "evidence_span": "The Headley Trust £75,000",
    "confidence": 1.0
  },
  {
    "donor_ref": "Mr James Wilson",
    "recipient_ref": "The charity",
    "amount": 5000,
    "currency": "GBP",
    "year": null,
    "evidence_span": "Mr James Wilson, a trustee, donated £5,000 to the charity",
    "confidence": 1.0
  }
]
\`\`\`

Expected entities:
\`\`\`json
[
  {
    "entity_type": "organisation",
    "raw_value": "The Wolfson Foundation",
    "normalised_value": "The Wolfson Foundation",
    "attributes": { "role": "donor" },
    "evidence_span": "The Wolfson Foundation £100,000",
    "span_start": 35,
    "span_end": 65,
    "extraction_confidence": 1.0
  },
  {
    "entity_type": "organisation",
    "raw_value": "BDO LLP",
    "normalised_value": "BDO LLP",
    "attributes": { "role": "auditor" },
    "evidence_span": "BDO LLP acted as auditors for the year",
    "span_start": 250,
    "span_end": 288,
    "extraction_confidence": 1.0
  },
  {
    "entity_type": "person",
    "raw_value": "Mr James Wilson",
    "normalised_value": "Wilson, James",
    "attributes": { "title": "Mr", "role": "trustee" },
    "evidence_span": "Mr James Wilson, a trustee, donated £5,000 to the charity",
    "span_start": 180,
    "span_end": 238,
    "extraction_confidence": 1.0
  }
]
\`\`\``,
});
