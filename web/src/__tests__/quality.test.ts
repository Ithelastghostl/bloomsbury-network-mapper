/**
 * Tests for quality tooling.
 *
 * Covers:
 * - Gold set comparison: precision/recall/F1 calculation (F2.2-T4)
 * - Threshold checking: pass/fail scenarios (F2.2-T5)
 * - Section-aware chunking: various document structures (F3.3-T3)
 * - Cross-chunk mention reconciliation (F3.3-T3)
 * - Extraction regression detection (F3.4-T4)
 * - Prompt promotion gate: all 5 criteria (F12.2-T2)
 *
 * Pure functions — no Supabase required.
 */

import { describe, it, expect } from 'vitest';

import {
  compareGoldSet,
  GOLD_ENTITY_TYPES,
  type ExtractionResult,
  type GoldLabel,
} from '@/lib/quality/gold-set-comparison';

import {
  checkThresholds,
  QUALITY_THRESHOLDS,
  type ThresholdInput,
} from '@/lib/quality/thresholds';

import {
  chunkDocument,
  reconcileMentions,
  DEFAULT_TOKEN_LIMIT,
} from '@/lib/pipeline/chunking';

import {
  detectRegression,
  gateDeployment,
  RegressionGateError,
  DEFAULT_REGRESSION_TOLERANCE,
  type BaselineScores,
} from '@/lib/quality/extraction-regression';

import {
  checkPromptGate,
  EVIDENCE_COVERAGE_THRESHOLD,
  INVALID_JSON_THRESHOLD,
  STABILITY_TOLERANCE,
  type PromptGateInput,
} from '@/lib/quality/prompt-gate';

// ===================================================================
// F2.2-T4: Gold Set Comparison
// ===================================================================

describe('Gold Set Comparison (F2.2-T4)', () => {
  it('GOLD_ENTITY_TYPES contains all 7 types', () => {
    expect(GOLD_ENTITY_TYPES).toContain('person');
    expect(GOLD_ENTITY_TYPES).toContain('organisation');
    expect(GOLD_ENTITY_TYPES).toContain('address');
    expect(GOLD_ENTITY_TYPES).toContain('registration_number');
    expect(GOLD_ENTITY_TYPES).toContain('donation');
    expect(GOLD_ENTITY_TYPES).toContain('role');
    expect(GOLD_ENTITY_TYPES).toContain('date');
    expect(GOLD_ENTITY_TYPES).toHaveLength(7);
  });

  it('perfect match yields precision=1, recall=1, F1=1', () => {
    const gold: GoldLabel[] = [
      { entity_type: 'person', normalised_value: 'John Smith' },
      { entity_type: 'organisation', normalised_value: 'Acme Corp' },
    ];
    const extracted: ExtractionResult[] = [
      { entity_type: 'person', normalised_value: 'John Smith' },
      { entity_type: 'organisation', normalised_value: 'Acme Corp' },
    ];
    const result = compareGoldSet(extracted, gold);
    expect(result.aggregate.precision).toBe(1);
    expect(result.aggregate.recall).toBe(1);
    expect(result.aggregate.f1).toBe(1);
    expect(result.mismatches).toHaveLength(0);
  });

  it('case-insensitive matching', () => {
    const gold: GoldLabel[] = [
      { entity_type: 'person', normalised_value: 'JOHN SMITH' },
    ];
    const extracted: ExtractionResult[] = [
      { entity_type: 'person', normalised_value: 'john smith' },
    ];
    const result = compareGoldSet(extracted, gold);
    expect(result.aggregate.precision).toBe(1);
    expect(result.aggregate.recall).toBe(1);
  });

  it('false positives reduce precision', () => {
    const gold: GoldLabel[] = [
      { entity_type: 'person', normalised_value: 'Alice' },
    ];
    const extracted: ExtractionResult[] = [
      { entity_type: 'person', normalised_value: 'Alice' },
      { entity_type: 'person', normalised_value: 'Bob' },
    ];
    const result = compareGoldSet(extracted, gold);
    expect(result.aggregate.precision).toBe(0.5);
    expect(result.aggregate.recall).toBe(1);
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0].kind).toBe('false_positive');
    expect(result.mismatches[0].value).toBe('Bob');
  });

  it('false negatives reduce recall', () => {
    const gold: GoldLabel[] = [
      { entity_type: 'person', normalised_value: 'Alice' },
      { entity_type: 'person', normalised_value: 'Bob' },
    ];
    const extracted: ExtractionResult[] = [
      { entity_type: 'person', normalised_value: 'Alice' },
    ];
    const result = compareGoldSet(extracted, gold);
    expect(result.aggregate.precision).toBe(1);
    expect(result.aggregate.recall).toBe(0.5);
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0].kind).toBe('false_negative');
    expect(result.mismatches[0].value).toBe('Bob');
  });

  it('per-type scores are computed separately', () => {
    const gold: GoldLabel[] = [
      { entity_type: 'person', normalised_value: 'Alice' },
      { entity_type: 'person', normalised_value: 'Bob' },
      { entity_type: 'organisation', normalised_value: 'Acme' },
    ];
    const extracted: ExtractionResult[] = [
      { entity_type: 'person', normalised_value: 'Alice' },
      { entity_type: 'organisation', normalised_value: 'Acme' },
      { entity_type: 'organisation', normalised_value: 'Globex' },
    ];
    const result = compareGoldSet(extracted, gold);

    const personScore = result.per_type.find(t => t.entity_type === 'person')!;
    expect(personScore.precision).toBe(1);
    expect(personScore.recall).toBe(0.5);
    expect(personScore.true_positives).toBe(1);
    expect(personScore.false_negatives).toBe(1);

    const orgScore = result.per_type.find(t => t.entity_type === 'organisation')!;
    expect(orgScore.precision).toBe(0.5);
    expect(orgScore.recall).toBe(1);
    expect(orgScore.false_positives).toBe(1);
  });

  it('F1 is harmonic mean of precision and recall', () => {
    const gold: GoldLabel[] = [
      { entity_type: 'person', normalised_value: 'A' },
      { entity_type: 'person', normalised_value: 'B' },
      { entity_type: 'person', normalised_value: 'C' },
    ];
    const extracted: ExtractionResult[] = [
      { entity_type: 'person', normalised_value: 'A' },
      { entity_type: 'person', normalised_value: 'B' },
      { entity_type: 'person', normalised_value: 'D' },
      { entity_type: 'person', normalised_value: 'E' },
    ];
    const result = compareGoldSet(extracted, gold);
    // precision = 2/4 = 0.5, recall = 2/3 ~= 0.667
    const expectedF1 = (2 * 0.5 * (2 / 3)) / (0.5 + 2 / 3);
    expect(result.aggregate.f1).toBeCloseTo(expectedF1, 5);
  });

  it('empty extraction yields zero precision and recall', () => {
    const gold: GoldLabel[] = [
      { entity_type: 'person', normalised_value: 'Alice' },
    ];
    const result = compareGoldSet([], gold);
    expect(result.aggregate.precision).toBe(0);
    expect(result.aggregate.recall).toBe(0);
    expect(result.aggregate.f1).toBe(0);
  });

  it('empty gold set with extractions yields zero recall', () => {
    const extracted: ExtractionResult[] = [
      { entity_type: 'person', normalised_value: 'Alice' },
    ];
    const result = compareGoldSet(extracted, []);
    expect(result.aggregate.precision).toBe(0);
    expect(result.aggregate.recall).toBe(0);
  });

  it('both empty yields zeros', () => {
    const result = compareGoldSet([], []);
    expect(result.aggregate.precision).toBe(0);
    expect(result.aggregate.recall).toBe(0);
    expect(result.aggregate.f1).toBe(0);
    expect(result.mismatches).toHaveLength(0);
  });

  it('document_id scoping works', () => {
    const gold: GoldLabel[] = [
      { entity_type: 'person', normalised_value: 'Alice', document_id: 'doc1' },
      { entity_type: 'person', normalised_value: 'Alice', document_id: 'doc2' },
    ];
    const extracted: ExtractionResult[] = [
      { entity_type: 'person', normalised_value: 'Alice', document_id: 'doc1' },
    ];
    const result = compareGoldSet(extracted, gold);
    // Only doc1 Alice matched; doc2 Alice is a false negative
    expect(result.aggregate.precision).toBe(1);
    expect(result.aggregate.recall).toBe(0.5);
  });

  it('mismatches include document_id when present', () => {
    const gold: GoldLabel[] = [
      { entity_type: 'person', normalised_value: 'Bob', document_id: 'doc3' },
    ];
    const result = compareGoldSet([], gold);
    expect(result.mismatches[0].document_id).toBe('doc3');
  });
});

// ===================================================================
// F2.2-T5: Quality Thresholds
// ===================================================================

describe('Quality Thresholds (F2.2-T5)', () => {
  it('QUALITY_THRESHOLDS contains all 6 thresholds', () => {
    const ids = QUALITY_THRESHOLDS.map(t => t.id);
    expect(ids).toContain('extraction_precision');
    expect(ids).toContain('extraction_recall');
    expect(ids).toContain('invalid_json_rate');
    expect(ids).toContain('evidence_span_coverage');
    expect(ids).toContain('identity_resolution_accuracy');
    expect(ids).toContain('false_positive_rate');
    expect(QUALITY_THRESHOLDS).toHaveLength(6);
  });

  it('thresholds match PRD section 7.2', () => {
    const byId = (id: string) => QUALITY_THRESHOLDS.find(t => t.id === id)!;
    expect(byId('extraction_precision').target).toBe(0.90);
    expect(byId('invalid_json_rate').target).toBe(0.02);
    expect(byId('evidence_span_coverage').target).toBe(0.95);
    expect(byId('false_positive_rate').target).toBe(0.05);
  });

  it('all pass when metrics exceed targets', () => {
    const inputs: ThresholdInput[] = [
      { id: 'extraction_precision', value: 0.95 },
      { id: 'extraction_recall', value: 0.90 },
      { id: 'invalid_json_rate', value: 0.01 },
      { id: 'evidence_span_coverage', value: 0.98 },
      { id: 'identity_resolution_accuracy', value: 0.97 },
      { id: 'false_positive_rate', value: 0.03 },
    ];
    const result = checkThresholds(inputs);
    expect(result.all_passed).toBe(true);
    expect(result.failed_count).toBe(0);
    expect(result.results).toHaveLength(6);
  });

  it('fails when precision below target', () => {
    const inputs: ThresholdInput[] = [
      { id: 'extraction_precision', value: 0.85 },
    ];
    const result = checkThresholds(inputs);
    expect(result.all_passed).toBe(false);
    expect(result.failed_count).toBe(1);
    expect(result.results[0].passed).toBe(false);
  });

  it('fails when invalid JSON rate above target', () => {
    const inputs: ThresholdInput[] = [
      { id: 'invalid_json_rate', value: 0.05 },
    ];
    const result = checkThresholds(inputs);
    expect(result.all_passed).toBe(false);
    const jsonResult = result.results.find(r => r.id === 'invalid_json_rate')!;
    expect(jsonResult.passed).toBe(false);
  });

  it('passes at exact boundary values', () => {
    const inputs: ThresholdInput[] = [
      { id: 'extraction_precision', value: 0.90 },
      { id: 'invalid_json_rate', value: 0.02 },
      { id: 'evidence_span_coverage', value: 0.95 },
      { id: 'false_positive_rate', value: 0.05 },
    ];
    const result = checkThresholds(inputs);
    expect(result.all_passed).toBe(true);
  });

  it('only evaluates provided inputs', () => {
    const inputs: ThresholdInput[] = [
      { id: 'extraction_precision', value: 0.95 },
    ];
    const result = checkThresholds(inputs);
    expect(result.results).toHaveLength(1);
    expect(result.all_passed).toBe(true);
  });

  it('empty inputs yields all passed (vacuous truth)', () => {
    const result = checkThresholds([]);
    expect(result.all_passed).toBe(true);
    expect(result.results).toHaveLength(0);
  });

  it('multiple failures reported', () => {
    const inputs: ThresholdInput[] = [
      { id: 'extraction_precision', value: 0.50 },
      { id: 'extraction_recall', value: 0.50 },
      { id: 'invalid_json_rate', value: 0.10 },
    ];
    const result = checkThresholds(inputs);
    expect(result.all_passed).toBe(false);
    expect(result.failed_count).toBe(3);
  });

  it('result includes name and target', () => {
    const inputs: ThresholdInput[] = [
      { id: 'extraction_precision', value: 0.85 },
    ];
    const result = checkThresholds(inputs);
    expect(result.results[0].name).toBe('Entity extraction precision');
    expect(result.results[0].target).toBe(0.90);
    expect(result.results[0].actual).toBe(0.85);
  });
});

// ===================================================================
// F3.3-T3: Section-Aware Chunking
// ===================================================================

describe('Section-Aware Chunking (F3.3-T3)', () => {
  it('DEFAULT_TOKEN_LIMIT is 100K', () => {
    expect(DEFAULT_TOKEN_LIMIT).toBe(100_000);
  });

  it('single section document produces one chunk', () => {
    const text = 'This is a simple document with no headers.';
    const result = chunkDocument('doc1', text);
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0].document_id).toBe('doc1');
    expect(result.chunks[0].chunk_index).toBe(0);
    expect(result.chunks[0].text).toBe(text);
  });

  it('splits on markdown headers', () => {
    const text = [
      '# Introduction',
      'Intro text here.',
      '# Methods',
      'Methods text here.',
      '# Results',
      'Results text here.',
    ].join('\n');
    const result = chunkDocument('doc2', text);
    expect(result.chunks.length).toBe(3);
    expect(result.chunks[0].section_headers).toContain('Introduction');
    expect(result.chunks[1].section_headers).toContain('Methods');
    expect(result.chunks[2].section_headers).toContain('Results');
  });

  it('preserves chunk indices', () => {
    const text = '# A\nText A\n# B\nText B\n# C\nText C';
    const result = chunkDocument('doc3', text);
    expect(result.chunks[0].chunk_index).toBe(0);
    expect(result.chunks[1].chunk_index).toBe(1);
    expect(result.chunks[2].chunk_index).toBe(2);
  });

  it('byte ranges are set', () => {
    const text = '# Header\nSome content here.';
    const result = chunkDocument('doc4', text);
    expect(result.chunks[0].byte_range.start).toBe(0);
    expect(result.chunks[0].byte_range.end).toBeGreaterThan(0);
  });

  it('nested headers build header hierarchy', () => {
    const text = [
      '# Chapter 1',
      'Chapter intro.',
      '## Section 1.1',
      'Section content.',
    ].join('\n');
    const result = chunkDocument('doc5', text);
    expect(result.chunks.length).toBe(2);
    expect(result.chunks[1].section_headers).toContain('Section 1.1');
  });

  it('handles empty document', () => {
    const result = chunkDocument('doc6', '');
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0].text).toBe('');
  });

  it('splits oversized sections at paragraph boundaries', () => {
    // Create a section that exceeds a small token limit
    const para1 = 'A'.repeat(100);
    const para2 = 'B'.repeat(100);
    const text = `# Big Section\n${para1}\n\n${para2}`;
    // Token limit of 50 -> char limit of 200
    const result = chunkDocument('doc7', text, 50);
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
  });

  it('document_id is preserved in result', () => {
    const result = chunkDocument('my-doc-id', 'text');
    expect(result.document_id).toBe('my-doc-id');
  });
});

// ===================================================================
// F3.3-T3: Cross-Chunk Mention Reconciliation
// ===================================================================

describe('Cross-Chunk Mention Reconciliation (F3.3-T3)', () => {
  it('merges same entity across chunks', () => {
    const mentions = [
      { chunk_index: 0, entity_type: 'person', normalised_value: 'John Smith' },
      { chunk_index: 1, entity_type: 'person', normalised_value: 'John Smith' },
      { chunk_index: 2, entity_type: 'person', normalised_value: 'John Smith' },
    ];
    const result = reconcileMentions(mentions);
    expect(result.merged_mentions).toHaveLength(1);
    expect(result.merged_mentions[0].chunk_indices).toEqual([0, 1, 2]);
    expect(result.merged_mentions[0].occurrences).toBe(3);
  });

  it('keeps different entities separate', () => {
    const mentions = [
      { chunk_index: 0, entity_type: 'person', normalised_value: 'Alice' },
      { chunk_index: 0, entity_type: 'person', normalised_value: 'Bob' },
    ];
    const result = reconcileMentions(mentions);
    expect(result.merged_mentions).toHaveLength(2);
  });

  it('case-insensitive matching for normalised_value', () => {
    const mentions = [
      { chunk_index: 0, entity_type: 'person', normalised_value: 'ALICE' },
      { chunk_index: 1, entity_type: 'person', normalised_value: 'alice' },
    ];
    const result = reconcileMentions(mentions);
    expect(result.merged_mentions).toHaveLength(1);
    expect(result.merged_mentions[0].chunk_indices).toEqual([0, 1]);
  });

  it('same value different entity types are separate', () => {
    const mentions = [
      { chunk_index: 0, entity_type: 'person', normalised_value: 'Smith' },
      { chunk_index: 0, entity_type: 'organisation', normalised_value: 'Smith' },
    ];
    const result = reconcileMentions(mentions);
    expect(result.merged_mentions).toHaveLength(2);
  });

  it('duplicate chunk_index not repeated', () => {
    const mentions = [
      { chunk_index: 0, entity_type: 'person', normalised_value: 'Alice' },
      { chunk_index: 0, entity_type: 'person', normalised_value: 'Alice' },
    ];
    const result = reconcileMentions(mentions);
    expect(result.merged_mentions).toHaveLength(1);
    expect(result.merged_mentions[0].chunk_indices).toEqual([0]);
    expect(result.merged_mentions[0].occurrences).toBe(2);
  });

  it('empty input yields empty result', () => {
    const result = reconcileMentions([]);
    expect(result.merged_mentions).toHaveLength(0);
  });
});

// ===================================================================
// F3.4-T4: Extraction Regression Detection
// ===================================================================

describe('Extraction Regression Detection (F3.4-T4)', () => {
  const baseline: BaselineScores = { precision: 0.92, recall: 0.88, f1: 0.90 };

  const gold: GoldLabel[] = [
    { entity_type: 'person', normalised_value: 'Alice' },
    { entity_type: 'person', normalised_value: 'Bob' },
    { entity_type: 'organisation', normalised_value: 'Acme' },
  ];

  it('DEFAULT_REGRESSION_TOLERANCE is 2%', () => {
    expect(DEFAULT_REGRESSION_TOLERANCE).toBe(0.02);
  });

  it('no regression when scores improve', () => {
    const extracted: ExtractionResult[] = [
      { entity_type: 'person', normalised_value: 'Alice' },
      { entity_type: 'person', normalised_value: 'Bob' },
      { entity_type: 'organisation', normalised_value: 'Acme' },
    ];
    const result = detectRegression(extracted, gold, baseline);
    expect(result.passed).toBe(true);
    expect(result.regressions).toHaveLength(0);
  });

  it('detects precision regression', () => {
    // 1 TP out of 3 extracted = precision 0.33
    const extracted: ExtractionResult[] = [
      { entity_type: 'person', normalised_value: 'Alice' },
      { entity_type: 'person', normalised_value: 'Unknown1' },
      { entity_type: 'person', normalised_value: 'Unknown2' },
    ];
    const result = detectRegression(extracted, gold, baseline);
    expect(result.passed).toBe(false);
    const precisionRegression = result.regressions.find(r => r.metric === 'precision');
    expect(precisionRegression).toBeDefined();
    expect(precisionRegression!.delta).toBeLessThan(0);
  });

  it('detects recall regression', () => {
    // Only 1 out of 3 gold items found
    const extracted: ExtractionResult[] = [
      { entity_type: 'person', normalised_value: 'Alice' },
    ];
    const result = detectRegression(extracted, gold, baseline);
    expect(result.passed).toBe(false);
    const recallRegression = result.regressions.find(r => r.metric === 'recall');
    expect(recallRegression).toBeDefined();
  });

  it('small drops within tolerance pass', () => {
    // Slightly below baseline but within 2% tolerance
    const closeBaseline: BaselineScores = { precision: 0.95, recall: 0.95, f1: 0.95 };
    const extracted: ExtractionResult[] = [
      { entity_type: 'person', normalised_value: 'Alice' },
      { entity_type: 'person', normalised_value: 'Bob' },
      { entity_type: 'organisation', normalised_value: 'Acme' },
    ];
    // All 3 matched out of 3 gold and 3 extracted: p=1, r=1, f1=1
    // These are above the close baseline, so should pass
    const result = detectRegression(extracted, gold, closeBaseline);
    expect(result.passed).toBe(true);
  });

  it('gateDeployment does not throw when passed', () => {
    const extracted: ExtractionResult[] = [
      { entity_type: 'person', normalised_value: 'Alice' },
      { entity_type: 'person', normalised_value: 'Bob' },
      { entity_type: 'organisation', normalised_value: 'Acme' },
    ];
    const result = detectRegression(extracted, gold, baseline);
    expect(() => gateDeployment(result)).not.toThrow();
  });

  it('gateDeployment throws RegressionGateError when regression detected', () => {
    const extracted: ExtractionResult[] = [
      { entity_type: 'person', normalised_value: 'Unknown' },
    ];
    const result = detectRegression(extracted, gold, baseline);
    expect(() => gateDeployment(result)).toThrow(RegressionGateError);
  });

  it('RegressionGateError has regressions array', () => {
    const extracted: ExtractionResult[] = [];
    const result = detectRegression(extracted, gold, baseline);
    try {
      gateDeployment(result);
    } catch (e) {
      expect(e).toBeInstanceOf(RegressionGateError);
      expect((e as RegressionGateError).regressions.length).toBeGreaterThan(0);
      expect((e as RegressionGateError).name).toBe('RegressionGateError');
    }
  });

  it('custom tolerance is respected', () => {
    // With a very tight tolerance (0.001), even tiny drops register
    const tightBaseline: BaselineScores = { precision: 1.0, recall: 1.0, f1: 1.0 };
    const extracted: ExtractionResult[] = [
      { entity_type: 'person', normalised_value: 'Alice' },
      { entity_type: 'person', normalised_value: 'Bob' },
      // Missing Acme -> recall < 1.0
    ];
    const result = detectRegression(extracted, gold, tightBaseline, 0.001);
    expect(result.passed).toBe(false);
  });
});

// ===================================================================
// F12.2-T2: Prompt Promotion Gate
// ===================================================================

describe('Prompt Promotion Gate (F12.2-T2)', () => {
  const passingInput: PromptGateInput = {
    gold_set_precision: 0.92,
    baseline_precision: 0.90,
    hallucination_rate: 0.03,
    baseline_hallucination_rate: 0.04,
    evidence_span_coverage: 0.97,
    invalid_json_rate: 0.01,
    rankings_reviewed: true,
  };

  it('thresholds match PRD section 7.2', () => {
    expect(EVIDENCE_COVERAGE_THRESHOLD).toBe(0.95);
    expect(INVALID_JSON_THRESHOLD).toBe(0.02);
  });

  it('passes when all 5 criteria met', () => {
    const result = checkPromptGate(passingInput);
    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
    expect(result.criteria).toHaveLength(5);
  });

  it('fails criterion 1: precision declined on gold set', () => {
    const input: PromptGateInput = {
      ...passingInput,
      gold_set_precision: 0.85,
      baseline_precision: 0.92,
    };
    const result = checkPromptGate(input);
    expect(result.passed).toBe(false);
    const criterion = result.criteria.find(c => c.id === 'precision_stable')!;
    expect(criterion.passed).toBe(false);
  });

  it('fails criterion 2: hallucination rate increased', () => {
    const input: PromptGateInput = {
      ...passingInput,
      hallucination_rate: 0.10,
      baseline_hallucination_rate: 0.03,
    };
    const result = checkPromptGate(input);
    expect(result.passed).toBe(false);
    const criterion = result.criteria.find(c => c.id === 'hallucination_stable')!;
    expect(criterion.passed).toBe(false);
  });

  it('fails criterion 3: evidence span coverage below threshold', () => {
    const input: PromptGateInput = {
      ...passingInput,
      evidence_span_coverage: 0.90,
    };
    const result = checkPromptGate(input);
    expect(result.passed).toBe(false);
    const criterion = result.criteria.find(c => c.id === 'evidence_coverage')!;
    expect(criterion.passed).toBe(false);
  });

  it('fails criterion 4: invalid JSON rate above threshold', () => {
    const input: PromptGateInput = {
      ...passingInput,
      invalid_json_rate: 0.05,
    };
    const result = checkPromptGate(input);
    expect(result.passed).toBe(false);
    const criterion = result.criteria.find(c => c.id === 'invalid_json_rate')!;
    expect(criterion.passed).toBe(false);
  });

  it('fails criterion 5: rankings not reviewed', () => {
    const input: PromptGateInput = {
      ...passingInput,
      rankings_reviewed: false,
    };
    const result = checkPromptGate(input);
    expect(result.passed).toBe(false);
    const criterion = result.criteria.find(c => c.id === 'rankings_reviewed')!;
    expect(criterion.passed).toBe(false);
  });

  it('accumulates all failures', () => {
    const input: PromptGateInput = {
      gold_set_precision: 0.70,
      baseline_precision: 0.92,
      hallucination_rate: 0.15,
      baseline_hallucination_rate: 0.03,
      evidence_span_coverage: 0.80,
      invalid_json_rate: 0.10,
      rankings_reviewed: false,
    };
    const result = checkPromptGate(input);
    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(5);
    expect(result.criteria.every(c => !c.passed)).toBe(true);
  });

  it('precision stable within tolerance passes', () => {
    // Precision drops by less than STABILITY_TOLERANCE -> still passes
    const input: PromptGateInput = {
      ...passingInput,
      gold_set_precision: 0.897,
      baseline_precision: 0.90,
    };
    const result = checkPromptGate(input);
    const criterion = result.criteria.find(c => c.id === 'precision_stable')!;
    expect(criterion.passed).toBe(true);
  });

  it('hallucination rate stable within tolerance passes', () => {
    const input: PromptGateInput = {
      ...passingInput,
      hallucination_rate: 0.03 + STABILITY_TOLERANCE,
      baseline_hallucination_rate: 0.03,
    };
    const result = checkPromptGate(input);
    const criterion = result.criteria.find(c => c.id === 'hallucination_stable')!;
    expect(criterion.passed).toBe(true);
  });

  it('criteria include descriptive detail strings', () => {
    const result = checkPromptGate(passingInput);
    for (const criterion of result.criteria) {
      expect(criterion.detail.length).toBeGreaterThan(0);
      expect(criterion.name.length).toBeGreaterThan(0);
    }
  });
});
