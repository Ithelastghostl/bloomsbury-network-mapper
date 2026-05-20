/**
 * Zod schemas for LLM extraction output (Phase 1, PRD §13).
 *
 * These define the JSON structure that Claude returns per document.
 * Every extracted fact includes an evidence span (R1.5) and
 * confidence score (R1.8). The schemas are used both for runtime
 * validation (R1.3) and for embedding in extraction prompts.
 */
import { z } from 'zod';

// -------------------------------------------------------------------
// Entity types matching PRD §13 extraction focus + §11.1 entity_type
// -------------------------------------------------------------------

export const entityTypeSchema = z.enum([
  'person',
  'organisation',
  'address',
  'registration_number',
]);

// -------------------------------------------------------------------
// Relationship types matching PRD §11.1 relationships table
// -------------------------------------------------------------------

export const relationshipTypeSchema = z.enum([
  'trustee_of',
  'director_of',
  'employee_of',
  'donor_to',
  'received_donation_from',
  'subsidiary_of',
  'related_to',
]);

// -------------------------------------------------------------------
// Evidence types matching PRD §11.1 evidence_spans table
// -------------------------------------------------------------------

export const evidenceTypeSchema = z.enum([
  'entity',
  'relationship',
  'donation',
  'role',
  'financial',
]);

// -------------------------------------------------------------------
// Confidence: a number between 0 and 1 (inclusive)
// -------------------------------------------------------------------

const confidenceSchema = z.number().min(0).max(1);

// -------------------------------------------------------------------
// Extracted Entity — maps to app.entity_mentions (§11.1)
// -------------------------------------------------------------------

export const extractedEntitySchema = z.object({
  entity_type: entityTypeSchema,
  raw_value: z.string().min(1),
  normalised_value: z.string().min(1),
  attributes: z.record(z.string(), z.unknown()).default({}),
  evidence_span: z.string().min(1),
  span_start: z.number().int().min(0),
  span_end: z.number().int().min(0),
  extraction_confidence: confidenceSchema,
});

// -------------------------------------------------------------------
// Extracted Relationship — maps to app.relationships (§11.1)
// -------------------------------------------------------------------

export const extractedRelationshipSchema = z.object({
  relationship_type: relationshipTypeSchema,
  source_entity_ref: z.string().min(1),
  target_entity_ref: z.string().min(1),
  evidence_span: z.string().min(1),
  valid_from: z.string().nullable().optional(),
  valid_to: z.string().nullable().optional(),
  confidence: confidenceSchema,
});

// -------------------------------------------------------------------
// Extracted Donation — maps to app.donation_events (§11.1)
// -------------------------------------------------------------------

export const extractedDonationSchema = z.object({
  donor_ref: z.string().min(1),
  recipient_ref: z.string().min(1),
  amount: z.number().positive().nullable().optional(),
  currency: z.string().min(1).default('GBP'),
  year: z.number().int().nullable().optional(),
  evidence_span: z.string().min(1),
  confidence: confidenceSchema,
});

// -------------------------------------------------------------------
// Extracted Evidence — maps to app.evidence_spans (§11.1)
// -------------------------------------------------------------------

export const extractedEvidenceSchema = z.object({
  text: z.string().min(1),
  span_start: z.number().int().min(0),
  span_end: z.number().int().min(0),
  source_section: z.string().nullable().optional(),
  evidence_type: evidenceTypeSchema,
});

// -------------------------------------------------------------------
// Top-level extraction output — the complete LLM response per doc
// -------------------------------------------------------------------

export const extractionOutputSchema = z.object({
  entities: z.array(extractedEntitySchema),
  relationships: z.array(extractedRelationshipSchema),
  donations: z.array(extractedDonationSchema),
  evidence_spans: z.array(extractedEvidenceSchema),
});

// -------------------------------------------------------------------
// Inferred TypeScript types
// -------------------------------------------------------------------

export type EntityType = z.infer<typeof entityTypeSchema>;
export type RelationshipType = z.infer<typeof relationshipTypeSchema>;
export type EvidenceType = z.infer<typeof evidenceTypeSchema>;
export type ExtractedEntity = z.infer<typeof extractedEntitySchema>;
export type ExtractedRelationship = z.infer<typeof extractedRelationshipSchema>;
export type ExtractedDonation = z.infer<typeof extractedDonationSchema>;
export type ExtractedEvidence = z.infer<typeof extractedEvidenceSchema>;
export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;

// -------------------------------------------------------------------
// JSON Schema representation for embedding in prompts (R1.3)
// -------------------------------------------------------------------

export const EXTRACTION_OUTPUT_JSON_SCHEMA = `{
  "type": "object",
  "required": ["entities", "relationships", "donations", "evidence_spans"],
  "properties": {
    "entities": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["entity_type", "raw_value", "normalised_value", "attributes", "evidence_span", "span_start", "span_end", "extraction_confidence"],
        "properties": {
          "entity_type": { "type": "string", "enum": ["person", "organisation", "address", "registration_number"] },
          "raw_value": { "type": "string", "minLength": 1 },
          "normalised_value": { "type": "string", "minLength": 1 },
          "attributes": { "type": "object" },
          "evidence_span": { "type": "string", "minLength": 1 },
          "span_start": { "type": "integer", "minimum": 0 },
          "span_end": { "type": "integer", "minimum": 0 },
          "extraction_confidence": { "type": "number", "minimum": 0, "maximum": 1 }
        }
      }
    },
    "relationships": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["relationship_type", "source_entity_ref", "target_entity_ref", "evidence_span", "confidence"],
        "properties": {
          "relationship_type": { "type": "string", "enum": ["trustee_of", "director_of", "employee_of", "donor_to", "received_donation_from", "subsidiary_of", "related_to"] },
          "source_entity_ref": { "type": "string", "minLength": 1 },
          "target_entity_ref": { "type": "string", "minLength": 1 },
          "evidence_span": { "type": "string", "minLength": 1 },
          "valid_from": { "type": ["string", "null"] },
          "valid_to": { "type": ["string", "null"] },
          "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
        }
      }
    },
    "donations": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["donor_ref", "recipient_ref", "currency", "evidence_span", "confidence"],
        "properties": {
          "donor_ref": { "type": "string", "minLength": 1 },
          "recipient_ref": { "type": "string", "minLength": 1 },
          "amount": { "type": ["number", "null"] },
          "currency": { "type": "string", "minLength": 1 },
          "year": { "type": ["integer", "null"] },
          "evidence_span": { "type": "string", "minLength": 1 },
          "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
        }
      }
    },
    "evidence_spans": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["text", "span_start", "span_end", "evidence_type"],
        "properties": {
          "text": { "type": "string", "minLength": 1 },
          "span_start": { "type": "integer", "minimum": 0 },
          "span_end": { "type": "integer", "minimum": 0 },
          "source_section": { "type": ["string", "null"] },
          "evidence_type": { "type": "string", "enum": ["entity", "relationship", "donation", "role", "financial"] }
        }
      }
    }
  }
}`;
