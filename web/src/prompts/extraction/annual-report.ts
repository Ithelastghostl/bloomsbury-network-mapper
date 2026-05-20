/**
 * Extraction prompt for annual report documents.
 * PRD §13: extraction focus = trustees, donations, narrative affiliations.
 */
import { buildExtractionPrompt } from './shared';

export const ANNUAL_REPORT_PROMPT = buildExtractionPrompt({
  docTypeDescription:
    'This is an **Annual Report** — a narrative-heavy document that combines strategic commentary, ' +
    'activity highlights, impact stories, donor acknowledgements, and governance information. ' +
    'It may or may not include full financial statements. Annual reports are rich in named entities ' +
    'and affiliations but amounts may be rounded or approximate.',

  extractionGuidance: `### Trustees and Governance
- Extract all listed trustees, directors, patrons, ambassadors, honorary officers, and advisory board members.
- Annual reports often include a "Who We Are" or "Governance" section with a full board list — extract every name.
- Record roles and any noted appointment/resignation dates.

### Staff and Key Personnel
- If a "Staff" or "Our Team" section lists named individuals with job titles, extract them as "person" entities with employee_of relationships.
- Senior leadership (CEO, Director, Head of...) are high-value extractions.

### Donors and Funders
- Annual reports frequently include a "Thank You" or "Our Supporters" section listing donors.
- Extract every named donor as an entity and create donation records where amounts are given.
- If donors are listed without amounts, still extract the entity and a "donor_to" relationship but omit the donation record amount.
- For tiered donor lists (e.g., "Gold: £10,000+"), do NOT invent an exact amount — use the tier threshold as a minimum if confident, otherwise omit the amount.

### Partner Organisations
- Extract named partner charities, government bodies, corporate sponsors, and collaborating institutions.
- Create "related_to" relationships for partnerships, collaborations, and memberships.

### Narrative Affiliations
- If the report says "We worked with X", "In partnership with Y", "Funded by Z", extract these as relationships.
- Use "related_to" for general affiliations and more specific types (donor_to, subsidiary_of) where the text supports it.

### Confidence for Narrative Text
- Annual report language can be promotional. Rate confidence 0.8-0.9 for clearly factual statements.
- For vague affiliations ("We are grateful to our many supporters"), do NOT extract unnamed entities.`,

  examples: `### Good extraction from an annual report

Input snippet:
"Our Board of Trustees: Lady Margaret Thornton CBE (Chair), Dr Raj Patel, Ms Olivia Harper (appointed July 2023). Chief Executive: Tom Bradley. We are grateful for the generous support of The Garfield Weston Foundation (£200,000), Esmee Fairbairn Foundation, and our corporate partner Deloitte LLP."

Expected entities:
\`\`\`json
[
  {
    "entity_type": "person",
    "raw_value": "Lady Margaret Thornton CBE",
    "normalised_value": "Thornton, Margaret",
    "attributes": { "title": "Lady", "honours": "CBE", "role": "Chair" },
    "evidence_span": "Lady Margaret Thornton CBE (Chair)",
    "span_start": 23,
    "span_end": 57,
    "extraction_confidence": 1.0
  },
  {
    "entity_type": "person",
    "raw_value": "Tom Bradley",
    "normalised_value": "Bradley, Tom",
    "attributes": { "role": "Chief Executive" },
    "evidence_span": "Chief Executive: Tom Bradley",
    "span_start": 120,
    "span_end": 148,
    "extraction_confidence": 1.0
  },
  {
    "entity_type": "organisation",
    "raw_value": "The Garfield Weston Foundation",
    "normalised_value": "The Garfield Weston Foundation",
    "attributes": { "role": "donor" },
    "evidence_span": "The Garfield Weston Foundation (£200,000)",
    "span_start": 196,
    "span_end": 237,
    "extraction_confidence": 1.0
  },
  {
    "entity_type": "organisation",
    "raw_value": "Deloitte LLP",
    "normalised_value": "Deloitte LLP",
    "attributes": { "role": "corporate_partner" },
    "evidence_span": "our corporate partner Deloitte LLP",
    "span_start": 268,
    "span_end": 302,
    "extraction_confidence": 0.9
  }
]
\`\`\`

Expected donations:
\`\`\`json
[
  {
    "donor_ref": "The Garfield Weston Foundation",
    "recipient_ref": "The charity",
    "amount": 200000,
    "currency": "GBP",
    "year": null,
    "evidence_span": "The Garfield Weston Foundation (£200,000)",
    "confidence": 1.0
  }
]
\`\`\`

Expected relationships:
\`\`\`json
[
  {
    "relationship_type": "trustee_of",
    "source_entity_ref": "Lady Margaret Thornton CBE",
    "target_entity_ref": "The charity",
    "evidence_span": "Lady Margaret Thornton CBE (Chair)",
    "valid_from": null,
    "valid_to": null,
    "confidence": 1.0
  },
  {
    "relationship_type": "employee_of",
    "source_entity_ref": "Tom Bradley",
    "target_entity_ref": "The charity",
    "evidence_span": "Chief Executive: Tom Bradley",
    "valid_from": null,
    "valid_to": null,
    "confidence": 1.0
  },
  {
    "relationship_type": "donor_to",
    "source_entity_ref": "The Garfield Weston Foundation",
    "target_entity_ref": "The charity",
    "evidence_span": "The Garfield Weston Foundation (£200,000)",
    "valid_from": null,
    "valid_to": null,
    "confidence": 1.0
  },
  {
    "relationship_type": "related_to",
    "source_entity_ref": "Deloitte LLP",
    "target_entity_ref": "The charity",
    "evidence_span": "our corporate partner Deloitte LLP",
    "valid_from": null,
    "valid_to": null,
    "confidence": 0.9
  }
]
\`\`\``,
});
