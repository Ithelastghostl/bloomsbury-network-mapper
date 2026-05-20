/**
 * Unit tests for the Phase 1.5 validation pipeline.
 * Pure functions — no Supabase required.
 */
import { describe, it, expect } from 'vitest';
import { normaliseName, normaliseAddress, normaliseRegistrationNumber } from '@/lib/pipeline/validation/normaliser';
import { schemaValidate } from '@/lib/pipeline/validation/schema-validator';
import { deduplicateExact } from '@/lib/pipeline/validation/deduplicator';
import { refineConfidence } from '@/lib/pipeline/validation/confidence';
import { validateAndNormalise } from '@/lib/pipeline/validation/index';
import type { EntityMention } from '@/types/database';

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

/** Build a minimal valid EntityMention for testing. */
function makeMention(overrides: Partial<EntityMention> = {}): EntityMention {
  return {
    entity_mention_id: 'em_001',
    document_id: 'doc_001',
    run_id: 'run_001',
    entity_type: 'person',
    raw_value: 'John Smith',
    normalised_value: 'John Smith',
    attributes: {},
    evidence_span: 'John Smith is a trustee of the charity.',
    span_start: 0,
    span_end: 40,
    extraction_confidence: 0.85,
    validation_status: 'pending',
    embedding: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ===================================================================
// Name Normalisation (R1.5.4)
// ===================================================================

describe('normaliseName', () => {
  it('normalises ALL CAPS to title case', () => {
    const result = normaliseName('JOHN SMITH');
    expect(result.normalised).toBe('John Smith');
  });

  it('removes Mr title and creates alias', () => {
    const result = normaliseName('MR JOHN SMITH');
    expect(result.normalised).toBe('John Smith');
    expect(result.aliases).toContain('Mr John Smith');
  });

  it('removes Mrs title', () => {
    const result = normaliseName('Mrs Jane Doe');
    expect(result.normalised).toBe('Jane Doe');
    expect(result.aliases).toContain('Mrs Jane Doe');
  });

  it('removes Dr title', () => {
    const result = normaliseName('DR ALICE BROWN');
    expect(result.normalised).toBe('Alice Brown');
    expect(result.aliases).toContain('Dr Alice Brown');
  });

  it('removes Prof title', () => {
    const result = normaliseName('Prof. Robert Jones');
    expect(result.normalised).toBe('Robert Jones');
    expect(result.aliases).toContain('Prof. Robert Jones');
  });

  it('removes Sir title', () => {
    const result = normaliseName('Sir David Attenborough');
    expect(result.normalised).toBe('David Attenborough');
    expect(result.aliases).toContain('Sir David Attenborough');
  });

  it('removes Dame title', () => {
    const result = normaliseName('Dame Judi Dench');
    expect(result.normalised).toBe('Judi Dench');
    expect(result.aliases).toContain('Dame Judi Dench');
  });

  it('removes Lord title', () => {
    const result = normaliseName('LORD SUGAR');
    expect(result.normalised).toBe('Sugar');
    expect(result.aliases).toContain('Lord Sugar');
  });

  it('removes Lady title', () => {
    const result = normaliseName('LADY THATCHER');
    expect(result.normalised).toBe('Thatcher');
    expect(result.aliases).toContain('Lady Thatcher');
  });

  it('removes Rev title', () => {
    const result = normaliseName('Rev Martin Luther King');
    expect(result.normalised).toBe('Martin Luther King');
    expect(result.aliases).toContain('Rev Martin Luther King');
  });

  it('returns empty for empty input', () => {
    const result = normaliseName('');
    expect(result.normalised).toBe('');
    expect(result.aliases).toEqual([]);
  });

  it('handles name with no title', () => {
    const result = normaliseName('John Smith');
    expect(result.normalised).toBe('John Smith');
    expect(result.aliases).toEqual([]);
  });

  it('collapses extra whitespace', () => {
    const result = normaliseName('  JOHN   SMITH  ');
    expect(result.normalised).toBe('John Smith');
  });
});

// ===================================================================
// Address Normalisation (R1.5.3)
// ===================================================================

describe('normaliseAddress', () => {
  it('extracts a standard UK postcode', () => {
    const result = normaliseAddress('10 Downing Street, London SW1A 2AA');
    expect(result.postcode).toBe('SW1A 2AA');
  });

  it('extracts postcode without space', () => {
    const result = normaliseAddress('Flat 3, 42 High Street, Manchester M11AA');
    expect(result.postcode).toBe('M1 1AA');
  });

  it('extracts short-form postcode', () => {
    const result = normaliseAddress('1 Park Lane, Leeds LS1 5ES');
    expect(result.postcode).toBe('LS1 5ES');
  });

  it('normalises whitespace', () => {
    const result = normaliseAddress('  10  Downing   Street ,  London  ');
    expect(result.normalised).toBe('10 Downing Street, London');
  });

  it('returns undefined postcode when none found', () => {
    const result = normaliseAddress('123 Fake Street, Springfield');
    expect(result.postcode).toBeUndefined();
  });

  it('handles empty input', () => {
    const result = normaliseAddress('');
    expect(result.normalised).toBe('');
    expect(result.postcode).toBeUndefined();
  });
});

// ===================================================================
// Registration Number Normalisation (R1.5.5)
// ===================================================================

describe('normaliseRegistrationNumber', () => {
  describe('charity numbers', () => {
    it('zero-pads 6-digit charity number to 7', () => {
      const result = normaliseRegistrationNumber('123456', 'charity');
      expect(result.normalised).toBe('0123456');
      expect(result.valid).toBe(true);
    });

    it('keeps 7-digit charity number as-is', () => {
      const result = normaliseRegistrationNumber('1234567', 'charity');
      expect(result.normalised).toBe('1234567');
      expect(result.valid).toBe(true);
    });

    it('rejects too-short charity number', () => {
      const result = normaliseRegistrationNumber('12345', 'charity');
      expect(result.valid).toBe(false);
    });

    it('rejects too-long charity number', () => {
      const result = normaliseRegistrationNumber('12345678', 'charity');
      expect(result.valid).toBe(false);
    });
  });

  describe('company numbers', () => {
    it('zero-pads short company number to 8 digits', () => {
      const result = normaliseRegistrationNumber('12345', 'company');
      expect(result.normalised).toBe('00012345');
      expect(result.valid).toBe(true);
    });

    it('keeps 8-digit company number as-is', () => {
      const result = normaliseRegistrationNumber('12345678', 'company');
      expect(result.normalised).toBe('12345678');
      expect(result.valid).toBe(true);
    });

    it('handles SC prefix', () => {
      const result = normaliseRegistrationNumber('SC123456', 'company');
      expect(result.normalised).toBe('SC123456');
      expect(result.valid).toBe(true);
    });

    it('handles NI prefix with zero-padding', () => {
      const result = normaliseRegistrationNumber('NI1234', 'company');
      expect(result.normalised).toBe('NI001234');
      expect(result.valid).toBe(true);
    });

    it('rejects too-long pure-digit company number', () => {
      const result = normaliseRegistrationNumber('123456789', 'company');
      expect(result.valid).toBe(false);
    });
  });
});

// ===================================================================
// Schema Validation (R1.5.1, R1.5.2, R1.5.8)
// ===================================================================

describe('schemaValidate', () => {
  it('passes a valid mention through', () => {
    const mention = makeMention();
    const { valid, quarantined } = schemaValidate([mention], 'doc_001', 'run_001');
    expect(valid).toHaveLength(1);
    expect(quarantined).toHaveLength(0);
  });

  it('quarantines mention with missing entity_type', () => {
    const mention = makeMention({ entity_type: '' });
    const { valid, quarantined } = schemaValidate([mention], 'doc_001', 'run_001');
    expect(valid).toHaveLength(0);
    expect(quarantined).toHaveLength(1);
    expect(quarantined[0].reason_code).toBe('invalid_json');
  });

  it('quarantines mention with missing document_id', () => {
    const mention = makeMention({ document_id: '' });
    const { valid, quarantined } = schemaValidate([mention], 'doc_001', 'run_001');
    expect(valid).toHaveLength(0);
    expect(quarantined[0].reason_code).toBe('missing_evidence_span');
  });

  it('quarantines mention with missing evidence_span', () => {
    const mention = makeMention({ evidence_span: '' });
    const { valid, quarantined } = schemaValidate([mention], 'doc_001', 'run_001');
    expect(valid).toHaveLength(0);
    expect(quarantined[0].reason_code).toBe('missing_evidence_span');
  });

  it('quarantines mention with span_start >= span_end', () => {
    const mention = makeMention({ span_start: 50, span_end: 10 });
    const { valid, quarantined } = schemaValidate([mention], 'doc_001', 'run_001');
    expect(valid).toHaveLength(0);
    expect(quarantined[0].reason_code).toBe('missing_evidence_span');
  });

  it('quarantines mention with impossible date year', () => {
    const mention = makeMention({
      attributes: { date_of_birth: '1850-01-01' },
    });
    const { valid, quarantined } = schemaValidate([mention], 'doc_001', 'run_001');
    expect(valid).toHaveLength(0);
    expect(quarantined[0].reason_code).toBe('impossible_date');
  });

  it('quarantines mention with future date year', () => {
    const mention = makeMention({
      attributes: { year: 2099 },
    });
    const { valid, quarantined } = schemaValidate([mention], 'doc_001', 'run_001');
    expect(valid).toHaveLength(0);
    expect(quarantined[0].reason_code).toBe('impossible_date');
  });

  it('passes mention with valid date', () => {
    const mention = makeMention({
      attributes: { year: 2020 },
    });
    const { valid, quarantined } = schemaValidate([mention], 'doc_001', 'run_001');
    expect(valid).toHaveLength(1);
    expect(quarantined).toHaveLength(0);
  });

  it('quarantines registration number with bad format', () => {
    const mention = makeMention({
      entity_type: 'registration_number',
      raw_value: 'ABC',
      attributes: { registration_type: 'charity' },
    });
    const { valid, quarantined } = schemaValidate([mention], 'doc_001', 'run_001');
    expect(valid).toHaveLength(0);
    expect(quarantined[0].reason_code).toBe('invalid_registration_number');
  });

  it('quarantines mention with non-positive amount', () => {
    const mention = makeMention({
      attributes: { amount: -100 },
    });
    const { valid, quarantined } = schemaValidate([mention], 'doc_001', 'run_001');
    expect(valid).toHaveLength(0);
    expect(quarantined[0].reason_code).toBe('invalid_json');
  });

  it('passes mention with positive amount', () => {
    const mention = makeMention({
      attributes: { amount: 500 },
    });
    const { valid, quarantined } = schemaValidate([mention], 'doc_001', 'run_001');
    expect(valid).toHaveLength(1);
    expect(quarantined).toHaveLength(0);
  });
});

// ===================================================================
// Deduplication (R1.5.6)
// ===================================================================

describe('deduplicateExact', () => {
  it('removes exact duplicates', () => {
    const m1 = makeMention();
    const m2 = makeMention(); // same normalised_value, entity_type, document_id, spans
    const { unique, duplicates } = deduplicateExact([m1, m2]);
    expect(unique).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].reason_code).toBe('duplicate_exact');
  });

  it('keeps mentions with different normalised_values', () => {
    const m1 = makeMention({ normalised_value: 'John Smith' });
    const m2 = makeMention({ normalised_value: 'Jane Doe' });
    const { unique, duplicates } = deduplicateExact([m1, m2]);
    expect(unique).toHaveLength(2);
    expect(duplicates).toHaveLength(0);
  });

  it('keeps mentions with same name but different spans', () => {
    const m1 = makeMention({ span_start: 0, span_end: 40 });
    const m2 = makeMention({ span_start: 100, span_end: 140 });
    const { unique, duplicates } = deduplicateExact([m1, m2]);
    expect(unique).toHaveLength(2);
    expect(duplicates).toHaveLength(0);
  });

  it('keeps mentions with same name but different documents', () => {
    const m1 = makeMention({ document_id: 'doc_001' });
    const m2 = makeMention({ document_id: 'doc_002' });
    const { unique, duplicates } = deduplicateExact([m1, m2]);
    expect(unique).toHaveLength(2);
    expect(duplicates).toHaveLength(0);
  });

  it('keeps mentions with same name but different entity types', () => {
    const m1 = makeMention({ entity_type: 'person' });
    const m2 = makeMention({ entity_type: 'organisation' });
    const { unique, duplicates } = deduplicateExact([m1, m2]);
    expect(unique).toHaveLength(2);
    expect(duplicates).toHaveLength(0);
  });
});

// ===================================================================
// Confidence Refinement (R1.8, §14)
// ===================================================================

describe('refineConfidence', () => {
  it('quarantines mentions below 0.40 threshold', () => {
    const mention = makeMention({ extraction_confidence: 0.30 });
    const { accepted, quarantined } = refineConfidence([mention]);
    expect(accepted).toHaveLength(0);
    expect(quarantined).toHaveLength(1);
    expect(quarantined[0].reason_code).toBe('low_extraction_confidence');
  });

  it('accepts mentions above threshold', () => {
    const mention = makeMention({ extraction_confidence: 0.80 });
    const { accepted, quarantined } = refineConfidence([mention]);
    expect(accepted).toHaveLength(1);
    expect(quarantined).toHaveLength(0);
  });

  it('boosts confidence for validated registration numbers', () => {
    const mention = makeMention({
      entity_type: 'registration_number',
      extraction_confidence: 0.80,
      attributes: { valid: true },
    });
    const { accepted } = refineConfidence([mention]);
    expect(accepted[0].extraction_confidence).toBeGreaterThan(0.80);
  });

  it('boosts confidence for repeated person names', () => {
    const m1 = makeMention({ entity_mention_id: 'em_001', extraction_confidence: 0.70, span_start: 0, span_end: 40 });
    const m2 = makeMention({ entity_mention_id: 'em_002', extraction_confidence: 0.70, span_start: 100, span_end: 140 });
    const { accepted } = refineConfidence([m1, m2]);
    // Both should get the repeated-name boost
    expect(accepted[0].extraction_confidence).toBeGreaterThan(0.70);
    expect(accepted[1].extraction_confidence).toBeGreaterThan(0.70);
  });

  it('boosts confidence for address with valid postcode', () => {
    // Use two addresses so they are not single-occurrence (avoids -0.03 penalty)
    const m1 = makeMention({
      entity_mention_id: 'em_addr_1',
      entity_type: 'address',
      extraction_confidence: 0.75,
      normalised_value: '10 Downing Street',
      attributes: { postcode: 'SW1A 1AA' },
      span_start: 0,
      span_end: 40,
    });
    const m2 = makeMention({
      entity_mention_id: 'em_addr_2',
      entity_type: 'address',
      extraction_confidence: 0.75,
      normalised_value: '10 Downing Street',
      attributes: { postcode: 'SW1A 1AA' },
      span_start: 100,
      span_end: 140,
    });
    const { accepted } = refineConfidence([m1, m2]);
    // Postcode boost (+0.03) should raise above 0.75
    expect(accepted[0].extraction_confidence).toBeGreaterThan(0.75);
  });

  it('reduces confidence for short evidence spans', () => {
    const mention = makeMention({
      extraction_confidence: 0.80,
      evidence_span: 'John Smith', // 10 chars, below 20
    });
    const { accepted } = refineConfidence([mention]);
    expect(accepted[0].extraction_confidence).toBeLessThan(0.80);
  });

  it('reduces confidence for single-occurrence entities', () => {
    const mention = makeMention({ extraction_confidence: 0.80 });
    const { accepted } = refineConfidence([mention]);
    // Single occurrence gets a penalty
    expect(accepted[0].extraction_confidence).toBeLessThan(0.80);
  });

  it('clamps confidence to [0, 1] range', () => {
    const mention = makeMention({ extraction_confidence: 0.99 });
    // Even with boosts it should not exceed 1
    const { accepted } = refineConfidence([mention]);
    expect(accepted[0].extraction_confidence).toBeLessThanOrEqual(1);
    expect(accepted[0].extraction_confidence).toBeGreaterThanOrEqual(0);
  });
});

// ===================================================================
// Full Pipeline Integration
// ===================================================================

describe('validateAndNormalise (orchestrator)', () => {
  it('runs the full pipeline on valid mentions', () => {
    const mention = makeMention({
      raw_value: 'MR JOHN SMITH',
      normalised_value: 'MR JOHN SMITH',
    });
    const result = validateAndNormalise([mention], 'doc_001', 'run_001');

    expect(result.accepted).toHaveLength(1);
    // Name should be normalised
    expect(result.accepted[0].normalised_value).toBe('John Smith');
    // Raw preserved
    expect(result.accepted[0].raw_value).toBe('MR JOHN SMITH');
    // Report should exist
    expect(result.report.run_id).toBe('run_001');
    expect(result.report.accepted_count).toBe(1);
  });

  it('quarantines invalid and returns report', () => {
    const valid = makeMention();
    const invalid = makeMention({ evidence_span: '', entity_mention_id: 'em_002' });
    const result = validateAndNormalise([valid, invalid], 'doc_001', 'run_001');

    expect(result.accepted).toHaveLength(1);
    expect(result.quarantined).toHaveLength(1);
    expect(result.report.quarantined_count).toBe(1);
    expect(result.report.quarantined_by_reason['missing_evidence_span']).toBe(1);
  });

  it('deduplicates and reports duplicates', () => {
    const m1 = makeMention({ entity_mention_id: 'em_001' });
    const m2 = makeMention({ entity_mention_id: 'em_002' });
    const result = validateAndNormalise([m1, m2], 'doc_001', 'run_001');

    expect(result.accepted).toHaveLength(1);
    expect(result.quarantined.some((q) => q.reason_code === 'duplicate_exact')).toBe(true);
  });

  it('includes normalisation rates in report', () => {
    const person = makeMention({
      entity_type: 'person',
      raw_value: 'DR ALICE BROWN',
      normalised_value: 'DR ALICE BROWN',
    });
    const address = makeMention({
      entity_mention_id: 'em_002',
      entity_type: 'address',
      raw_value: '10 Downing Street, London SW1A 2AA',
      normalised_value: '10 Downing Street, London SW1A 2AA',
    });
    const result = validateAndNormalise([person, address], 'doc_001', 'run_001');

    expect(result.report.normalisation_rates.names_total).toBe(1);
    expect(result.report.normalisation_rates.names_normalised).toBe(1);
    expect(result.report.normalisation_rates.addresses_total).toBe(1);
    expect(result.report.normalisation_rates.addresses_normalised).toBe(1);
  });
});
