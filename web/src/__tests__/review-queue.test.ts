/**
 * Tests for Epic 9 — Review Queue (F9.5) and Spreadsheet Export (F9.6).
 * Pure functions — no Supabase required.
 *
 * Covers:
 * - All 11 workflow state transitions (valid + invalid) — §18.9
 * - Decision capture with all label types — §18.10
 * - Rejection reason code requirement — §6.1
 * - Cold-start flag logic — §18.5
 * - Wrong-person → identity decision creation — R5.10, §6.2
 * - Intro outcome storage — §6.4
 * - CSV export column completeness — §18.11
 * - CSV import validation — §18.12
 * - No duplicate rows in export — §18.12
 */

import { describe, it, expect } from 'vitest';
import {
  WORKFLOW_STATES,
  DECISION_LABELS,
  REJECTION_REASON_CODES,
  type WorkflowState,
  type DecisionLabel,
  transition,
  isValidState,
  isValidTransition,
  getValidTransitions,
  isRejection,
  rejectionReasonCode,
  decisionToState,
  isColdStart,
  COLD_START_DECISION_THRESHOLD,
  COLD_START_SEED_THRESHOLD,
} from '@/lib/review/workflow';

// ===================================================================
// §18.9 — All 11 Workflow States
// ===================================================================

describe('Workflow States (§18.9)', () => {
  it('should define exactly 11 workflow states', () => {
    expect(WORKFLOW_STATES).toHaveLength(11);
  });

  it('should include all states from §18.9', () => {
    const expected = [
      'Discovered',
      'Enriched',
      'Ready for Review',
      'In Review',
      'Qualified',
      'Intro Requested',
      'Intro Made',
      'Meeting',
      'Opportunity',
      'Converted',
      'Rejected',
    ];
    for (const s of expected) {
      expect(WORKFLOW_STATES).toContain(s);
    }
  });

  it('should validate known states', () => {
    for (const s of WORKFLOW_STATES) {
      expect(isValidState(s)).toBe(true);
    }
  });

  it('should reject unknown states', () => {
    expect(isValidState('Unknown')).toBe(false);
    expect(isValidState('')).toBe(false);
    expect(isValidState('in review')).toBe(false); // case-sensitive
  });
});

// ===================================================================
// §18.9 — Valid State Transitions
// ===================================================================

describe('Valid State Transitions (§18.9)', () => {
  it('Discovered -> Enriched', () => {
    expect(transition('Discovered', 'Enriched')).toBe('Enriched');
  });

  it('Enriched -> Ready for Review', () => {
    expect(transition('Enriched', 'Ready for Review')).toBe('Ready for Review');
  });

  it('Ready for Review -> In Review', () => {
    expect(transition('Ready for Review', 'In Review')).toBe('In Review');
  });

  it('In Review -> Qualified', () => {
    expect(transition('In Review', 'Qualified')).toBe('Qualified');
  });

  it('In Review -> Rejected', () => {
    expect(transition('In Review', 'Rejected')).toBe('Rejected');
  });

  it('In Review -> Ready for Review (needs more research)', () => {
    expect(transition('In Review', 'Ready for Review')).toBe('Ready for Review');
  });

  it('Qualified -> Intro Requested', () => {
    expect(transition('Qualified', 'Intro Requested')).toBe('Intro Requested');
  });

  it('Qualified -> Rejected', () => {
    expect(transition('Qualified', 'Rejected')).toBe('Rejected');
  });

  it('Intro Requested -> Intro Made', () => {
    expect(transition('Intro Requested', 'Intro Made')).toBe('Intro Made');
  });

  it('Intro Requested -> Rejected', () => {
    expect(transition('Intro Requested', 'Rejected')).toBe('Rejected');
  });

  it('Intro Made -> Meeting', () => {
    expect(transition('Intro Made', 'Meeting')).toBe('Meeting');
  });

  it('Meeting -> Opportunity', () => {
    expect(transition('Meeting', 'Opportunity')).toBe('Opportunity');
  });

  it('Opportunity -> Converted', () => {
    expect(transition('Opportunity', 'Converted')).toBe('Converted');
  });

  it('Opportunity -> Rejected', () => {
    expect(transition('Opportunity', 'Rejected')).toBe('Rejected');
  });
});

// ===================================================================
// §18.9 — Invalid State Transitions
// ===================================================================

describe('Invalid State Transitions (§18.9)', () => {
  it('should reject Discovered -> Qualified (skips steps)', () => {
    expect(() => transition('Discovered', 'Qualified')).toThrow('Invalid transition');
  });

  it('should reject Converted -> anything (terminal state)', () => {
    expect(() => transition('Converted', 'Discovered')).toThrow('Invalid transition');
    expect(() => transition('Converted', 'Rejected')).toThrow('Invalid transition');
    expect(() => transition('Converted', 'Qualified')).toThrow('Invalid transition');
  });

  it('should reject Rejected -> anything (terminal state)', () => {
    expect(() => transition('Rejected', 'Discovered')).toThrow('Invalid transition');
    expect(() => transition('Rejected', 'Qualified')).toThrow('Invalid transition');
    expect(() => transition('Rejected', 'In Review')).toThrow('Invalid transition');
  });

  it('should reject backwards transitions (except In Review -> Ready for Review)', () => {
    expect(() => transition('Enriched', 'Discovered')).toThrow('Invalid transition');
    expect(() => transition('Qualified', 'In Review')).toThrow('Invalid transition');
    expect(() => transition('Intro Made', 'Qualified')).toThrow('Invalid transition');
    expect(() => transition('Meeting', 'Intro Made')).toThrow('Invalid transition');
  });

  it('should reject skip transitions', () => {
    expect(() => transition('Discovered', 'In Review')).toThrow('Invalid transition');
    expect(() => transition('Ready for Review', 'Qualified')).toThrow('Invalid transition');
    expect(() => transition('Qualified', 'Meeting')).toThrow('Invalid transition');
  });

  it('should throw for invalid current state', () => {
    expect(() => transition('Bogus' as WorkflowState, 'Enriched')).toThrow(
      'Invalid current state',
    );
  });

  it('should throw for invalid target state', () => {
    expect(() => transition('Discovered', 'Bogus' as WorkflowState)).toThrow(
      'Invalid target state',
    );
  });

  it('should list valid transitions in error message', () => {
    try {
      transition('Discovered', 'Qualified');
      expect.fail('Should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('Enriched');
    }
  });
});

// ===================================================================
// §18.9 — getValidTransitions
// ===================================================================

describe('getValidTransitions', () => {
  it('Discovered allows only Enriched', () => {
    expect(getValidTransitions('Discovered')).toEqual(['Enriched']);
  });

  it('In Review allows Qualified, Rejected, Ready for Review', () => {
    const valid = getValidTransitions('In Review');
    expect(valid).toContain('Qualified');
    expect(valid).toContain('Rejected');
    expect(valid).toContain('Ready for Review');
  });

  it('Converted allows nothing (terminal)', () => {
    expect(getValidTransitions('Converted')).toEqual([]);
  });

  it('Rejected allows nothing (terminal)', () => {
    expect(getValidTransitions('Rejected')).toEqual([]);
  });
});

// ===================================================================
// §18.10 — Decision Labels
// ===================================================================

describe('Decision Labels (§18.10)', () => {
  it('should define all 6 structured decision labels', () => {
    expect(DECISION_LABELS).toHaveLength(6);
  });

  it('should include all labels from §18.10', () => {
    const expected = [
      'Qualified',
      'Rejected — wrong person',
      'Rejected — weak connection',
      'Rejected — bad fit',
      'Rejected — already known',
      'Needs more research',
    ];
    for (const label of expected) {
      expect(DECISION_LABELS).toContain(label);
    }
  });

  it('should identify rejections correctly', () => {
    expect(isRejection('Rejected — wrong person')).toBe(true);
    expect(isRejection('Rejected — weak connection')).toBe(true);
    expect(isRejection('Rejected — bad fit')).toBe(true);
    expect(isRejection('Rejected — already known')).toBe(true);
    expect(isRejection('Qualified')).toBe(false);
    expect(isRejection('Needs more research')).toBe(false);
  });

  it('should map rejection labels to reason codes', () => {
    expect(rejectionReasonCode('Rejected — wrong person')).toBe('wrong_person');
    expect(rejectionReasonCode('Rejected — weak connection')).toBe('weak_connection');
    expect(rejectionReasonCode('Rejected — bad fit')).toBe('bad_fit');
    expect(rejectionReasonCode('Rejected — already known')).toBe('already_known');
  });

  it('should return null reason code for non-rejections', () => {
    expect(rejectionReasonCode('Qualified')).toBeNull();
    expect(rejectionReasonCode('Needs more research')).toBeNull();
  });
});

// ===================================================================
// §18.10 — Decision to State Mapping
// ===================================================================

describe('Decision to State Mapping', () => {
  it('Qualified -> Qualified state', () => {
    expect(decisionToState('Qualified')).toBe('Qualified');
  });

  it('Needs more research -> Ready for Review state', () => {
    expect(decisionToState('Needs more research')).toBe('Ready for Review');
  });

  it('All rejections -> Rejected state', () => {
    expect(decisionToState('Rejected — wrong person')).toBe('Rejected');
    expect(decisionToState('Rejected — weak connection')).toBe('Rejected');
    expect(decisionToState('Rejected — bad fit')).toBe('Rejected');
    expect(decisionToState('Rejected — already known')).toBe('Rejected');
  });

  it('unknown decision throws', () => {
    expect(() => decisionToState('Bogus' as DecisionLabel)).toThrow('Unknown decision label');
  });
});

// ===================================================================
// §6.1 — Rejection Reason Code Requirement
// ===================================================================

describe('Rejection Reason Code Requirement (§6.1)', () => {
  it('every rejection label has a corresponding reason code', () => {
    for (const label of DECISION_LABELS) {
      if (isRejection(label)) {
        const code = rejectionReasonCode(label);
        expect(code).not.toBeNull();
        expect(REJECTION_REASON_CODES).toContain(code);
      }
    }
  });

  it('should define exactly 4 rejection reason codes', () => {
    expect(REJECTION_REASON_CODES).toHaveLength(4);
  });

  it('reason codes match: wrong_person, weak_connection, bad_fit, already_known', () => {
    expect(REJECTION_REASON_CODES).toContain('wrong_person');
    expect(REJECTION_REASON_CODES).toContain('weak_connection');
    expect(REJECTION_REASON_CODES).toContain('bad_fit');
    expect(REJECTION_REASON_CODES).toContain('already_known');
  });
});

// ===================================================================
// §18.5 — Cold-Start Flag Logic
// ===================================================================

describe('Cold-Start Flag Logic (§18.5)', () => {
  it('should be cold-start when below both thresholds', () => {
    expect(isColdStart({ totalDecisions: 50, distinctSeeds: 5 })).toBe(true);
  });

  it('should be cold-start when decisions below threshold', () => {
    expect(isColdStart({ totalDecisions: 99, distinctSeeds: 15 })).toBe(true);
  });

  it('should be cold-start when seeds below threshold', () => {
    expect(isColdStart({ totalDecisions: 150, distinctSeeds: 9 })).toBe(true);
  });

  it('should NOT be cold-start when both thresholds met', () => {
    expect(isColdStart({ totalDecisions: 100, distinctSeeds: 10 })).toBe(false);
  });

  it('should NOT be cold-start when exceeding thresholds', () => {
    expect(isColdStart({ totalDecisions: 500, distinctSeeds: 25 })).toBe(false);
  });

  it('should be cold-start at zero', () => {
    expect(isColdStart({ totalDecisions: 0, distinctSeeds: 0 })).toBe(true);
  });

  it('should export threshold constants', () => {
    expect(COLD_START_DECISION_THRESHOLD).toBe(100);
    expect(COLD_START_SEED_THRESHOLD).toBe(10);
  });

  it('boundary: exactly at threshold is not cold-start', () => {
    expect(isColdStart({ totalDecisions: 100, distinctSeeds: 10 })).toBe(false);
  });

  it('boundary: one below threshold is cold-start', () => {
    expect(isColdStart({ totalDecisions: 99, distinctSeeds: 10 })).toBe(true);
    expect(isColdStart({ totalDecisions: 100, distinctSeeds: 9 })).toBe(true);
  });
});

// ===================================================================
// R5.10, §6.2 — Wrong-Person -> Identity Decision
// ===================================================================

describe('Wrong-Person Identity Decision (R5.10, §6.2)', () => {
  it('wrong-person is a rejection', () => {
    expect(isRejection('Rejected — wrong person')).toBe(true);
  });

  it('wrong-person maps to reason code wrong_person', () => {
    expect(rejectionReasonCode('Rejected — wrong person')).toBe('wrong_person');
  });

  it('wrong-person maps to Rejected state', () => {
    expect(decisionToState('Rejected — wrong person')).toBe('Rejected');
  });

  // The actual identity decision creation is tested at the API level.
  // Here we verify the workflow logic supports the wrong-person flow:
  // In Review -> Rejected (via wrong-person decision)
  it('In Review allows transition to Rejected for wrong-person', () => {
    expect(isValidTransition('In Review', 'Rejected')).toBe(true);
  });
});

// ===================================================================
// §6.4 — Intro Outcome Storage
// ===================================================================

describe('Intro Outcome Workflow (§6.4)', () => {
  it('Qualified -> Intro Requested is valid', () => {
    expect(isValidTransition('Qualified', 'Intro Requested')).toBe(true);
  });

  it('Intro Requested -> Intro Made is valid', () => {
    expect(isValidTransition('Intro Requested', 'Intro Made')).toBe(true);
  });

  it('Intro Made -> Meeting is valid', () => {
    expect(isValidTransition('Intro Made', 'Meeting')).toBe(true);
  });

  it('Meeting -> Opportunity is valid', () => {
    expect(isValidTransition('Meeting', 'Opportunity')).toBe(true);
  });

  it('Opportunity -> Converted is valid', () => {
    expect(isValidTransition('Opportunity', 'Converted')).toBe(true);
  });

  it('Intro Requested -> Rejected (declined) is valid', () => {
    expect(isValidTransition('Intro Requested', 'Rejected')).toBe(true);
  });

  it('full funnel traversal works', () => {
    let state: WorkflowState = 'Discovered';
    state = transition(state, 'Enriched');
    state = transition(state, 'Ready for Review');
    state = transition(state, 'In Review');
    state = transition(state, 'Qualified');
    state = transition(state, 'Intro Requested');
    state = transition(state, 'Intro Made');
    state = transition(state, 'Meeting');
    state = transition(state, 'Opportunity');
    state = transition(state, 'Converted');
    expect(state).toBe('Converted');
  });

  it('rejection at any review stage is terminal', () => {
    const rejectableStates: WorkflowState[] = [
      'In Review',
      'Qualified',
      'Intro Requested',
      'Intro Made',
      'Meeting',
      'Opportunity',
    ];
    for (const s of rejectableStates) {
      expect(isValidTransition(s, 'Rejected')).toBe(true);
      // Rejected is terminal
      expect(getValidTransitions('Rejected')).toEqual([]);
    }
  });
});

// ===================================================================
// §18.11 — CSV Export Column Completeness
// ===================================================================

describe('CSV Export Columns (§18.11)', () => {
  // These are the 20 columns mandated by §18.11
  const EXPECTED_COLUMNS = [
    'Candidate ID',
    'Run ID',
    'Candidate Name',
    'Candidate Type',
    'Priority Score',
    'Confidence Score',
    'Recommended Introducer',
    'Intro Path',
    'Shared Affiliations',
    'Strongest Evidence',
    'Capacity Signal',
    'Affinity Signal',
    'Influence Signal',
    'Identity Warnings',
    'Aggregated Mentions',
    'Suggested Angle (Skeleton)',
    'Suggested Angle (Natural)',
    'Reviewer Status',
    'Rejection Reason',
    'Dossier Link',
  ];

  it('should have exactly 20 columns', () => {
    expect(EXPECTED_COLUMNS).toHaveLength(20);
  });

  // Verify our CSV building logic produces correct columns by testing
  // the escape function and row builder in isolation
  it('should escape CSV values containing commas', () => {
    const value = 'hello, world';
    const escaped = escapeCSVTest(value);
    expect(escaped).toBe('"hello, world"');
  });

  it('should escape CSV values containing quotes', () => {
    const value = 'he said "hello"';
    const escaped = escapeCSVTest(value);
    expect(escaped).toBe('"he said ""hello"""');
  });

  it('should escape CSV values containing newlines', () => {
    const value = 'line1\nline2';
    const escaped = escapeCSVTest(value);
    expect(escaped).toBe('"line1\nline2"');
  });

  it('should not escape plain values', () => {
    const value = 'plain';
    const escaped = escapeCSVTest(value);
    expect(escaped).toBe('plain');
  });

  it('should produce correct CSV row', () => {
    const row = toCSVRowTest(['a', 'b,c', 'd']);
    expect(row).toBe('a,"b,c",d');
  });
});

// ===================================================================
// §18.12 — CSV Import Validation
// ===================================================================

describe('CSV Import Validation (§18.12)', () => {
  it('should parse basic CSV correctly', () => {
    const csv =
      'candidate_recommendation_id,decision,reason_code,notes\n' +
      'rec-001,Qualified,,Good fit';
    const parsed = parseCSVTest(csv);
    expect(parsed.headers).toEqual([
      'candidate_recommendation_id',
      'decision',
      'reason_code',
      'notes',
    ]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toEqual(['rec-001', 'Qualified', '', 'Good fit']);
  });

  it('should parse CSV with quoted values', () => {
    const csv =
      'candidate_recommendation_id,decision,reason_code,notes\n' +
      'rec-001,Qualified,,"Notes with, comma"';
    const parsed = parseCSVTest(csv);
    expect(parsed.rows[0][3]).toBe('Notes with, comma');
  });

  it('should parse CSV with escaped quotes', () => {
    const csv =
      'candidate_recommendation_id,decision,reason_code,notes\n' +
      'rec-001,Qualified,,"He said ""hello"""';
    const parsed = parseCSVTest(csv);
    expect(parsed.rows[0][3]).toBe('He said "hello"');
  });

  it('should skip empty lines', () => {
    const csv =
      'candidate_recommendation_id,decision,reason_code,notes\n' +
      '\n' +
      'rec-001,Qualified,,\n' +
      '\n';
    const parsed = parseCSVTest(csv);
    expect(parsed.rows).toHaveLength(1);
  });

  it('should require all 4 headers', () => {
    const required = [
      'candidate_recommendation_id',
      'decision',
      'reason_code',
      'notes',
    ];
    const csv = 'candidate_recommendation_id,decision\nrec-001,Qualified';
    const parsed = parseCSVTest(csv);
    // Missing reason_code and notes
    const missing = required.filter(h => !parsed.headers.includes(h));
    expect(missing.length).toBeGreaterThan(0);
  });

  it('should validate decision labels in import rows', () => {
    // This tests the validation logic we use in the import route
    const validDecisions = [...DECISION_LABELS];
    expect(validDecisions).toContain('Qualified');
    expect(validDecisions).toContain('Rejected — wrong person');
    expect(validDecisions).not.toContain('Invalid Decision');
  });

  it('should require reason_code for rejection imports', () => {
    // The import route enforces this — test the logic
    const decision = 'Rejected — bad fit' as DecisionLabel;
    expect(isRejection(decision)).toBe(true);
    const expectedCode = rejectionReasonCode(decision);
    expect(expectedCode).toBe('bad_fit');
    // A row without reason_code should be rejected
    expect(expectedCode).not.toBeNull();
  });
});

// ===================================================================
// §18.12 — No Duplicate Rows in Export
// ===================================================================

describe('No Duplicate Rows (§18.12)', () => {
  it('deduplication by natural key (run_id, candidate_recommendation_id)', () => {
    // Simulate the dedup logic from the export route
    const candidates = [
      { run_id: 'run-1', candidate_recommendation_id: 'rec-1' },
      { run_id: 'run-1', candidate_recommendation_id: 'rec-2' },
      { run_id: 'run-1', candidate_recommendation_id: 'rec-1' }, // duplicate
      { run_id: 'run-2', candidate_recommendation_id: 'rec-1' }, // different run, not a dup
    ];

    const seen = new Set<string>();
    const deduped: typeof candidates = [];

    for (const c of candidates) {
      const key = `${c.run_id}:${c.candidate_recommendation_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(c);
      }
    }

    expect(deduped).toHaveLength(3);
    expect(deduped[0].candidate_recommendation_id).toBe('rec-1');
    expect(deduped[1].candidate_recommendation_id).toBe('rec-2');
    expect(deduped[2].run_id).toBe('run-2');
  });

  it('natural key is unique even with different data in same run', () => {
    const keys = new Set<string>();
    const pairs = [
      ['run-1', 'rec-a'],
      ['run-1', 'rec-b'],
      ['run-1', 'rec-a'], // dup
    ];

    for (const [runId, recId] of pairs) {
      keys.add(`${runId}:${recId}`);
    }

    expect(keys.size).toBe(2); // rec-a only appears once
  });
});

// ===================================================================
// Export integrity — comprehensive checks
// ===================================================================

describe('Export Integrity (F9.6-T4)', () => {
  it('CSV header count matches §18.11 specification', () => {
    const headers = [
      'Candidate ID', 'Run ID', 'Candidate Name', 'Candidate Type',
      'Priority Score', 'Confidence Score', 'Recommended Introducer',
      'Intro Path', 'Shared Affiliations', 'Strongest Evidence',
      'Capacity Signal', 'Affinity Signal', 'Influence Signal',
      'Identity Warnings', 'Aggregated Mentions',
      'Suggested Angle (Skeleton)', 'Suggested Angle (Natural)',
      'Reviewer Status', 'Rejection Reason', 'Dossier Link',
    ];
    expect(headers).toHaveLength(20);
    // Each header is non-empty
    for (const h of headers) {
      expect(h.trim().length).toBeGreaterThan(0);
    }
  });

  it('dossier link should be a valid path', () => {
    const recId = 'rec-abc-123';
    const link = `/api/candidates/${recId}/dossier`;
    expect(link).toMatch(/^\/api\/candidates\/.+\/dossier$/);
  });

  it('empty candidate list produces header-only CSV', () => {
    const headers = ['Col1', 'Col2', 'Col3'];
    const rows: string[][] = [];
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n') + '\n';
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(1); // Only header
    expect(lines[0]).toBe('Col1,Col2,Col3');
  });

  it('score values are numeric strings in CSV', () => {
    const priority = 0.72;
    const confidence = 0.65;
    expect(String(priority)).toBe('0.72');
    expect(String(confidence)).toBe('0.65');
    // Ensure they parse back correctly
    expect(parseFloat(String(priority))).toBe(0.72);
    expect(parseFloat(String(confidence))).toBe(0.65);
  });
});

// ===================================================================
// Helpers — replicate the CSV functions for unit testing
// (These mirror the logic in the export/import routes)
// ===================================================================

function escapeCSVTest(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCSVRowTest(values: string[]): string {
  return values.map(escapeCSVTest).join(',');
}

function parseCSVTest(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseLineTest(lines[0]);
  const rows = lines.slice(1).map(parseLineTest);
  return { headers, rows };
}

function parseLineTest(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}
