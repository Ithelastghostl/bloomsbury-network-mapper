/**
 * Extraction prompt for standalone trustee filing documents.
 * PRD §13: extraction focus = people, roles, dates, charity IDs.
 */
import { buildExtractionPrompt } from './shared';

export const TRUSTEE_FILING_PROMPT = buildExtractionPrompt({
  docTypeDescription:
    'This is a **standalone Trustees\' Report** for a UK charity. ' +
    'It covers governance, activities, and achievements but does NOT contain financial statements. ' +
    'Focus extraction on people, their roles, dates of service, and organisational identifiers.',

  extractionGuidance: `### People and Roles
- Extract every named trustee, patron, president, honorary officer, key management person, and named staff member.
- Record each person's role in attributes AND as a typed relationship (trustee_of, director_of, employee_of, related_to).
- Look for appointment dates, resignation dates, and terms of office. Record as valid_from/valid_to on the relationship.
- If "Chair", "Vice-Chair", "Treasurer", "Secretary" or similar officer titles are mentioned, store them in attributes.role.

### Organisations and Identifiers
- Extract the charity's own name as an "organisation" entity.
- Extract Charity Commission number, Companies House number, HMRC reference, OSCR number as "registration_number" entities with attributes.register indicating the source register.
- Extract any partner organisations, funders, or collaborators mentioned in the narrative.
- Extract the registered office or principal address.

### Dates
- Use the reporting period dates (e.g. "for the year ended 31 March 2023") as context for valid_from/valid_to when exact appointment dates are not given.
- If trustees are listed as serving "during the year" without specific dates, set valid_from to the period start and valid_to to the period end if the period is stated.

### Donations (if mentioned in narrative)
- If the report names specific donors or grants in the narrative, extract them even though this is not a financial document. Mark confidence lower (0.7-0.8) since amounts may be approximate in narrative text.`,

  examples: `### Good extraction from a trustee filing

Input snippet:
"Trustees serving during the period 1 April 2022 to 31 March 2023: Professor Sarah Williams OBE (Chair), Mr David Chen (appointed 12 September 2022), Ms Fatima Al-Hassan (resigned 30 November 2022). Charity number: 301234. Company number: RC000456."

Expected entities:
\`\`\`json
[
  {
    "entity_type": "person",
    "raw_value": "Professor Sarah Williams OBE",
    "normalised_value": "Williams, Sarah",
    "attributes": { "title": "Professor", "honours": "OBE", "role": "Chair" },
    "evidence_span": "Professor Sarah Williams OBE (Chair)",
    "span_start": 65,
    "span_end": 101,
    "extraction_confidence": 1.0
  },
  {
    "entity_type": "person",
    "raw_value": "Mr David Chen",
    "normalised_value": "Chen, David",
    "attributes": { "title": "Mr" },
    "evidence_span": "Mr David Chen (appointed 12 September 2022)",
    "span_start": 103,
    "span_end": 147,
    "extraction_confidence": 1.0
  },
  {
    "entity_type": "registration_number",
    "raw_value": "301234",
    "normalised_value": "301234",
    "attributes": { "register": "charity_commission" },
    "evidence_span": "Charity number: 301234",
    "span_start": 200,
    "span_end": 222,
    "extraction_confidence": 1.0
  }
]
\`\`\`

Expected relationships:
\`\`\`json
[
  {
    "relationship_type": "trustee_of",
    "source_entity_ref": "Professor Sarah Williams OBE",
    "target_entity_ref": "The charity",
    "evidence_span": "Professor Sarah Williams OBE (Chair)",
    "valid_from": "2022-04-01",
    "valid_to": "2023-03-31",
    "confidence": 0.9
  },
  {
    "relationship_type": "trustee_of",
    "source_entity_ref": "Mr David Chen",
    "target_entity_ref": "The charity",
    "evidence_span": "Mr David Chen (appointed 12 September 2022)",
    "valid_from": "2022-09-12",
    "valid_to": null,
    "confidence": 1.0
  }
]
\`\`\``,
});
