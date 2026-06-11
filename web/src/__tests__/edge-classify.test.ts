import { describe, it, expect } from 'vitest';
import {
  classifyEdgeType,
  edgeDossier,
  extractReasons,
} from '@/lib/crm/edge-classify';

describe('classifyEdgeType', () => {
  it('maps CO_DIRECTOR_OF to co_director', () => {
    expect(classifyEdgeType({ connection_type: 'CO_DIRECTOR_OF' })).toBe('co_director');
  });

  it('maps TRUSTEE_OF to co_trustee', () => {
    expect(classifyEdgeType({ connection_type: 'TRUSTEE_OF' })).toBe('co_trustee');
  });

  it('maps DIRECTOR_OF via a company to shared_board', () => {
    expect(classifyEdgeType({ connection_type: 'DIRECTOR_OF', via_organisation: 'Acme Ltd' })).toBe('shared_board');
  });

  it('maps DIRECTOR_OF via a charity-named org to co_trustee', () => {
    expect(classifyEdgeType({ connection_type: 'DIRECTOR_OF', via_organisation: 'Tate Foundation' })).toBe('co_trustee');
  });

  it('maps FAMILY_MEMBER to direct', () => {
    expect(classifyEdgeType({ connection_type: 'FAMILY_MEMBER' })).toBe('direct');
  });

  it('maps INFERRED_CONFIRMED to inferred', () => {
    expect(classifyEdgeType({ connection_type: 'INFERRED_CONFIRMED' })).toBe('inferred');
  });

  it('maps MENTIONED_IN / CO_OCCURS to corpus_mention', () => {
    expect(classifyEdgeType({ connection_type: 'MENTIONED_IN' })).toBe('corpus_mention');
    expect(classifyEdgeType({ connection_type: 'CO_OCCURS_WITH' })).toBe('corpus_mention');
  });

  it('maps SHARES_AFFILIATION_WITH via a company to shared_employer', () => {
    expect(classifyEdgeType({ connection_type: 'SHARES_AFFILIATION_WITH', via_organisation: 'Goldman Sachs' })).toBe('shared_employer');
  });
});

describe('edgeDossier tieStrength + freshness', () => {
  it('active co-director (no resignation) keeps full trust', () => {
    const d = edgeDossier(
      { connection_type: 'CO_DIRECTOR_OF', via_organisation: 'Acme Ltd' },
      { appointed_on: '2019-01-01', resigned_on: null, company_name: 'Acme Ltd' },
      2026,
    );
    expect(d.edgeType).toBe('co_director');
    expect(d.freshness).toBe('active');
    expect(d.tieStrength).toBeCloseTo(0.9, 5); // 0.9 * 1.0 * 1.0
    expect(d.warmth).toBe('warm');
    expect(d.label).toContain('active since 2019');
  });

  it('resigned >2yr ago decays the tie strength to stale', () => {
    const d = edgeDossier(
      { connection_type: 'CO_DIRECTOR_OF' },
      { appointed_on: '2010-01-01', resigned_on: '2015-06-01' },
      2026,
    );
    expect(d.freshness).toBe('stale');
    expect(d.tieStrength).toBeCloseTo(0.36, 5); // 0.9 * 0.4
    expect(d.warmth).toBe('cold');
  });

  it('recently resigned (<=2yr) is recent', () => {
    const d = edgeDossier(
      { connection_type: 'CO_DIRECTOR_OF' },
      { appointed_on: '2018-01-01', resigned_on: '2025-01-01' },
      2026,
    );
    expect(d.freshness).toBe('recent');
    expect(d.tieStrength).toBeCloseTo(0.63, 5); // 0.9 * 0.7
  });

  it('unknown dates on a board edge => 0.8 recency, unknown freshness', () => {
    const d = edgeDossier({ connection_type: 'CO_DIRECTOR_OF' }, undefined, 2026);
    expect(d.freshness).toBe('unknown');
    expect(d.tieStrength).toBeCloseTo(0.72, 5); // 0.9 * 0.8
  });

  it('non-dated edge types ignore recency (factor 1.0)', () => {
    const d = edgeDossier({ connection_type: 'FAMILY_MEMBER' }, undefined, 2026);
    expect(d.edgeType).toBe('direct');
    expect(d.tieStrength).toBeCloseTo(0.95, 5);
    expect(d.freshness).toBe('unknown');
  });

  it('multiplicity from multiple reasons boosts tie strength (capped)', () => {
    const single = edgeDossier({ connection_type: 'MENTIONED_IN', evidence: { reason: 'one filing' } });
    const many = edgeDossier({
      connection_type: 'MENTIONED_IN',
      evidence: { reasons: ['a', 'b', 'c', 'd', 'e'] },
    });
    expect(many.tieStrength).toBeGreaterThan(single.tieStrength);
    // corpus_mention trust 0.5, capped multiplier 1.15 => 0.575
    expect(many.tieStrength).toBeCloseTo(0.575, 5);
  });

  it('clamps tie strength to [0,1]', () => {
    const d = edgeDossier(
      { connection_type: 'FAMILY_MEMBER', evidence: { reasons: ['a', 'b', 'c', 'd', 'e', 'f'] } },
      undefined,
      2026,
    );
    expect(d.tieStrength).toBeLessThanOrEqual(1);
    expect(d.tieStrength).toBeGreaterThanOrEqual(0);
  });
});

describe('extractReasons', () => {
  it('returns [] for empty evidence', () => {
    expect(extractReasons(null)).toEqual([]);
    expect(extractReasons({})).toEqual([]);
  });

  it('reads a reasons array', () => {
    expect(extractReasons({ reasons: ['x', 'y'] })).toEqual(['x', 'y']);
  });

  it('reads a summary string', () => {
    expect(extractReasons({ evidence_summary: 'shared a board' })).toEqual(['shared a board']);
  });

  it('de-dupes repeated reasons', () => {
    expect(extractReasons({ reasons: ['x', 'x', 'y'] })).toEqual(['x', 'y']);
  });
});
