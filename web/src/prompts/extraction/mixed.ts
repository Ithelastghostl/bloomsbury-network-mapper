/**
 * Extraction prompt for "mixed" documents (92.3% of corpus).
 * These contain both a trustee report and financial statements in one markdown file.
 * PRD §13: extraction focus = general entities and relationships.
 */
import { buildExtractionPrompt } from './shared';

export const MIXED_PROMPT = buildExtractionPrompt({
  docTypeDescription:
    'This is a **mixed** document containing both a Trustees\' Report and Financial Statements for a UK charity. ' +
    'It typically includes narrative sections (objectives, activities, achievements, future plans, governance) ' +
    'followed by financial sections (statement of financial activities, balance sheet, notes to accounts). ' +
    'Extract from BOTH sections — do not skip the financial statements.',

  extractionGuidance: `### Trustee Report Section
- Extract all named trustees, patrons, advisors, staff, and key management personnel as "person" entities.
- Record their roles (trustee, chair, treasurer, secretary, patron, CEO, etc.) in the attributes field AND as relationship records (trustee_of, director_of, employee_of, or related_to).
- Extract the charity name and any subsidiary or connected organisations as "organisation" entities.
- Extract charity registration numbers, company numbers, and OSCR numbers as "registration_number" entities.
- Extract the registered office address as an "address" entity.
- Look for appointment and resignation dates for trustees; record these as valid_from/valid_to on relationships.

### Financial Statements Section
- Extract all named donors and grantmakers from the notes to accounts.
- Extract donation amounts, linking donor to recipient with "donor_to" / "received_donation_from" relationships and donation records.
- Extract grants received and grants made, including amounts, years, and counterparties.
- If the document lists "related party transactions", extract those as relationships with type "related_to".
- Extract any auditor or banker names as "organisation" entities with "related_to" relationships.

### General
- If the document mentions other charities, companies, or bodies the charity works with, extract them as organisations with "related_to" relationships.
- For role-based relationships where exact dates are not given, use the financial year dates if stated (e.g., "for the year ended 31 March 2023").`,

  examples: `### Good extraction from a mixed document

Input snippet:
"The trustees who served during the year were: Mr John Smith (Chair, appointed 1 June 2019), Mrs Jane Doe (Treasurer, resigned 15 March 2023), and Dr Alan Brown. The charity is registered with the Charity Commission under number 1234567 and with Companies House under number 07654321. The registered office is 10 Downing Street, London SW1A 2AA."

Expected entities:
\`\`\`json
[
  {
    "entity_type": "person",
    "raw_value": "Mr John Smith",
    "normalised_value": "Smith, John",
    "attributes": { "title": "Mr", "role": "Chair" },
    "evidence_span": "Mr John Smith (Chair, appointed 1 June 2019)",
    "span_start": 43,
    "span_end": 87,
    "extraction_confidence": 1.0
  },
  {
    "entity_type": "person",
    "raw_value": "Mrs Jane Doe",
    "normalised_value": "Doe, Jane",
    "attributes": { "title": "Mrs", "role": "Treasurer" },
    "evidence_span": "Mrs Jane Doe (Treasurer, resigned 15 March 2023)",
    "span_start": 90,
    "span_end": 138,
    "extraction_confidence": 1.0
  },
  {
    "entity_type": "registration_number",
    "raw_value": "1234567",
    "normalised_value": "1234567",
    "attributes": { "register": "charity_commission" },
    "evidence_span": "Charity Commission under number 1234567",
    "span_start": 189,
    "span_end": 228,
    "extraction_confidence": 1.0
  }
]
\`\`\`

Expected relationships:
\`\`\`json
[
  {
    "relationship_type": "trustee_of",
    "source_entity_ref": "Mr John Smith",
    "target_entity_ref": "The charity",
    "evidence_span": "Mr John Smith (Chair, appointed 1 June 2019)",
    "valid_from": "2019-06-01",
    "valid_to": null,
    "confidence": 1.0
  },
  {
    "relationship_type": "trustee_of",
    "source_entity_ref": "Mrs Jane Doe",
    "target_entity_ref": "The charity",
    "evidence_span": "Mrs Jane Doe (Treasurer, resigned 15 March 2023)",
    "valid_from": null,
    "valid_to": "2023-03-15",
    "confidence": 1.0
  }
]
\`\`\`

Input snippet (financial):
"Donations received during the year included £50,000 from The Big Lottery Fund and £25,000 from The Garfield Weston Foundation."

Expected donations:
\`\`\`json
[
  {
    "donor_ref": "The Big Lottery Fund",
    "recipient_ref": "The charity",
    "amount": 50000,
    "currency": "GBP",
    "year": null,
    "evidence_span": "£50,000 from The Big Lottery Fund",
    "confidence": 1.0
  }
]
\`\`\``,
});
