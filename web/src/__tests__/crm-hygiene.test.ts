/**
 * Tests for the CRM hygiene / lead-generation pure-logic modules.
 *
 * Covers three modules that gate which leads surface and how they rank, so a
 * regression here silently corrupts the ranked donor list:
 *
 * - lib/crm/suppressions.ts  — SuppressionSet, suppressionPairKey,
 *   EMPTY_SUPPRESSIONS, pruneIntroPaths (the human "this edge is wrong"
 *   decisions that every graph/path replay must honour). loadSuppressions is
 *   skipped here: it needs a live Supabase client.
 * - lib/crm/supporter-dedup.ts — matchSupporter (our supporters aren't leads;
 *   we already have access, so they're excluded; HNW targets stay rankable).
 * - lib/crm/lead-score.ts    — scoreLead (the composite priority blend).
 *
 * Real supporter / HNW-target names are pulled from the seed JSON so the tests
 * stay honest against the actual reference data rather than fabricated names.
 *
 * Pure functions — no Supabase required.
 */

import { describe, it, expect } from 'vitest';
import {
  SuppressionSet,
  suppressionPairKey,
  pruneIntroPaths,
  EMPTY_SUPPRESSIONS,
  type OverrideRow,
} from '@/lib/crm/suppressions';
import { matchSupporter } from '@/lib/crm/supporter-dedup';
import {
  scoreLead,
  SCORING_CONFIG_VERSION,
  SCORING_WEIGHTS,
} from '@/lib/crm/lead-score';
import {
  normaliseSeedName,
  seedInfo,
  isHnwTarget,
  type SeedPerson,
} from '@/lib/crm/seed-reference';
import seedPeople from '@/lib/crm/data/seed-people.json';

// ===================================================================
// Real seed fixtures — chosen from the actual reference data so the
// dedup tests aren't brittle against fabricated names.
// ===================================================================

const SEEDS = seedPeople as SeedPerson[];

/** A supporter whose name is exactly two tokens and whose first+last pair is
 *  not shared by any other seed, so a constructed middle-initial variant is
 *  unambiguous and the variant form is not itself a seed. */
const SUPPORTER = pickCleanTwoTokenSupporter();
/** A real HNW target — these are people we want to reach, never donors. */
const HNW_TARGET = SEEDS.find((p) => p.source === 'hnw_targets')!;

function pickCleanTwoTokenSupporter(): SeedPerson {
  const allNorm = new Set(SEEDS.map((p) => normaliseSeedName(p.name)));
  const firstLast = (name: string) => {
    const n = normaliseSeedName(name).split(' ');
    return n.length >= 2 ? `${n[0]}|${n[n.length - 1]}` : null;
  };
  for (const s of SEEDS) {
    if (s.source !== 'supporters') continue;
    const n = normaliseSeedName(s.name);
    if (!/^[a-z]+ [a-z]+$/.test(n)) continue; // exactly two alpha tokens
    const key = firstLast(s.name);
    if (!key) continue;
    // Only this seed has this first+last (no HNW collision, no ambiguity).
    if (SEEDS.filter((p) => firstLast(p.name) === key).length !== 1) continue;
    // The middle-initial variant must not itself be a seed (would hit exact).
    const [first, last] = n.split(' ');
    if (allNorm.has(`${first} a. ${last}`)) continue;
    return s;
  }
  throw new Error('no clean two-token supporter found in seed data');
}

/** "Grant Gordon" -> "Grant A. Gordon": a middle-initial variant of a real
 *  supporter that the augmentation pipeline might introduce. */
function middleInitialVariant(name: string): string {
  const [first, ...rest] = name.split(' ');
  return `${first} A. ${rest.join(' ')}`;
}

/** Build an override row with sensible defaults. */
function override(o: Partial<OverrideRow>): OverrideRow {
  return {
    override_id: 'o_' + Math.random().toString(36).slice(2),
    connection_id: null,
    co_director_edge_id: null,
    source_entity_id: null,
    connected_entity_id: null,
    action: 'remove',
    reason: null,
    author: 'analyst',
    created_at: new Date().toISOString(),
    ...o,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function introPath(over: Record<string, any>) {
  return {
    rank: 1,
    score: 80,
    hops: 1,
    path_ids: [] as string[],
    path_names: [] as string[],
    via_orgs: [] as string[],
    root_supporter: '',
    ...over,
  };
}

// ===================================================================
// suppressionPairKey
// ===================================================================

describe('suppressionPairKey', () => {
  it('is order-independent (key(a,b) === key(b,a))', () => {
    expect(suppressionPairKey('a', 'b')).toBe(suppressionPairKey('b', 'a'));
    expect(suppressionPairKey('ent_9', 'ent_1')).toBe(
      suppressionPairKey('ent_1', 'ent_9'),
    );
  });

  it('produces the lexicographically-sorted "low|high" form', () => {
    expect(suppressionPairKey('b', 'a')).toBe('a|b');
    expect(suppressionPairKey('a', 'b')).toBe('a|b');
  });

  it('distinguishes different pairs', () => {
    expect(suppressionPairKey('a', 'b')).not.toBe(suppressionPairKey('a', 'c'));
  });
});

// ===================================================================
// SuppressionSet
// ===================================================================

describe('SuppressionSet', () => {
  const rows: OverrideRow[] = [
    override({
      connection_id: 'conn_1',
      source_entity_id: 'E1',
      connected_entity_id: 'E2',
      action: 'remove',
    }),
    override({
      co_director_edge_id: 'cd_1',
      source_entity_id: 'S1',
      connected_entity_id: 'C1',
      action: 'remove',
    }),
    // A downweight row — must NOT suppress anything.
    override({
      connection_id: 'conn_dw',
      source_entity_id: 'D1',
      connected_entity_id: 'D2',
      action: 'downweight',
    }),
  ];
  const sup = new SuppressionSet(rows);

  it('size reflects all rows (including downweights)', () => {
    expect(sup.size).toBe(3);
  });

  it('isSuppressedPair is true for a removed pair in BOTH directions', () => {
    expect(sup.isSuppressedPair('E1', 'E2')).toBe(true);
    expect(sup.isSuppressedPair('E2', 'E1')).toBe(true);
  });

  it('isSuppressedPair is false for unrelated pairs', () => {
    expect(sup.isSuppressedPair('E1', 'X9')).toBe(false);
    expect(sup.isSuppressedPair('X', 'Y')).toBe(false);
  });

  it('only action:remove rows count — a downweight pair is NOT suppressed', () => {
    expect(sup.isSuppressedPair('D1', 'D2')).toBe(false);
    expect(sup.isSuppressedConnection({ connection_id: 'conn_dw' })).toBe(false);
  });

  it('isSuppressedPair handles null/undefined ids', () => {
    expect(sup.isSuppressedPair(null, 'E2')).toBe(false);
    expect(sup.isSuppressedPair('E1', undefined)).toBe(false);
    expect(sup.isSuppressedPair(null, null)).toBe(false);
    expect(sup.isSuppressedPair(undefined, undefined)).toBe(false);
  });

  it('isSuppressedConnection matches by connection_id', () => {
    expect(sup.isSuppressedConnection({ connection_id: 'conn_1' })).toBe(true);
    expect(sup.isSuppressedConnection({ connection_id: 'nope' })).toBe(false);
  });

  it('isSuppressedConnection matches by entity pair (no connection_id)', () => {
    expect(
      sup.isSuppressedConnection({ source_entity_id: 'E1', connected_entity_id: 'E2' }),
    ).toBe(true);
    expect(
      sup.isSuppressedConnection({ source_entity_id: 'E2', connected_entity_id: 'E1' }),
    ).toBe(true);
    expect(
      sup.isSuppressedConnection({ source_entity_id: 'A', connected_entity_id: 'B' }),
    ).toBe(false);
  });

  it('isSuppressedCoDirector matches by co_director_edge_id', () => {
    expect(sup.isSuppressedCoDirector({ co_director_edge_id: 'cd_1' })).toBe(true);
    expect(sup.isSuppressedCoDirector({ co_director_edge_id: 'nope' })).toBe(false);
  });

  it('isSuppressedCoDirector matches by seed/co_director pair', () => {
    expect(
      sup.isSuppressedCoDirector({ seed_entity_id: 'S1', co_director_entity_id: 'C1' }),
    ).toBe(true);
    expect(
      sup.isSuppressedCoDirector({ seed_entity_id: 'C1', co_director_entity_id: 'S1' }),
    ).toBe(true);
    expect(
      sup.isSuppressedCoDirector({ seed_entity_id: 'X', co_director_entity_id: 'Y' }),
    ).toBe(false);
  });

  it('a remove row missing one endpoint id registers no pair', () => {
    const partial = new SuppressionSet([
      override({ source_entity_id: 'E1', connected_entity_id: null, action: 'remove' }),
    ]);
    expect(partial.isSuppressedPair('E1', 'E2')).toBe(false);
    expect(partial.pairs.size).toBe(0);
  });
});

describe('EMPTY_SUPPRESSIONS', () => {
  it('suppresses nothing', () => {
    expect(EMPTY_SUPPRESSIONS.size).toBe(0);
    expect(EMPTY_SUPPRESSIONS.isSuppressedPair('E1', 'E2')).toBe(false);
    expect(EMPTY_SUPPRESSIONS.isSuppressedConnection({ connection_id: 'conn_1' })).toBe(false);
    expect(EMPTY_SUPPRESSIONS.isSuppressedCoDirector({ co_director_edge_id: 'cd_1' })).toBe(false);
  });
});

// ===================================================================
// pruneIntroPaths
// ===================================================================

describe('pruneIntroPaths', () => {
  // Suppress the undirected pair B|C.
  const sup = new SuppressionSet([
    override({ source_entity_id: 'B', connected_entity_id: 'C', action: 'remove' }),
  ]);

  it('returns null when there are no intro_paths', () => {
    expect(pruneIntroPaths({}, sup)).toBeNull();
    expect(pruneIntroPaths({ intro_paths: [] }, sup)).toBeNull();
    expect(pruneIntroPaths({ intro_paths: 'not-an-array' }, sup)).toBeNull();
  });

  it('returns null when no path traverses a suppressed pair', () => {
    const attrs = {
      intro_paths: [introPath({ path_ids: ['A', 'X', 'Y'] })],
    };
    expect(pruneIntroPaths(attrs, sup)).toBeNull();
  });

  it('removes a path whose path_ids contains an ADJACENT suppressed pair', () => {
    const attrs = {
      intro_paths: [
        introPath({ path_ids: ['A', 'B', 'C'], path_names: ['Aa', 'Bb', 'Cc'] }), // B->C adjacent: dead
        introPath({ path_ids: ['A', 'D'], path_names: ['Aa', 'Dd'] }), // survives
      ],
    };
    const next = pruneIntroPaths(attrs, sup);
    expect(next).not.toBeNull();
    expect(next!.intro_paths).toHaveLength(1);
    expect(next!.intro_paths[0].path_ids).toEqual(['A', 'D']);
  });

  it('a suppressed pair appearing NON-adjacently does not remove the path', () => {
    // B and C both present but separated by Z — adjacency is consecutive-only.
    const attrs = {
      intro_paths: [introPath({ path_ids: ['B', 'Z', 'C'] })],
    };
    expect(pruneIntroPaths(attrs, sup)).toBeNull();
  });

  it('a path with empty or single-element path_ids survives (no pair to check)', () => {
    expect(pruneIntroPaths({ intro_paths: [introPath({ path_ids: [] })] }, sup)).toBeNull();
    expect(pruneIntroPaths({ intro_paths: [introPath({ path_ids: ['B'] })] }, sup)).toBeNull();
    // A path missing path_ids entirely also survives.
    const noIds = { intro_paths: [{ rank: 1, hops: 1, path_names: ['Bb'] }] };
    expect(pruneIntroPaths(noIds, sup)).toBeNull();
  });

  it('when ALL paths are removed, deletes both intro_paths and introduction', () => {
    const attrs = {
      intro_paths: [introPath({ path_ids: ['B', 'C'] })],
      introduction: { degree: 1, root_supporter: 'Bb' },
    };
    const next = pruneIntroPaths(attrs, sup);
    expect(next).not.toBeNull();
    expect('intro_paths' in next!).toBe(false);
    expect('introduction' in next!).toBe(false);
  });

  it('when SOME paths are removed, survivors are re-ranked 1..n', () => {
    const deadPairSup = new SuppressionSet([
      override({ source_entity_id: 'M', connected_entity_id: 'N', action: 'remove' }),
    ]);
    const attrs = {
      intro_paths: [
        introPath({ rank: 1, score: 90, path_ids: ['A', 'B'], path_names: ['Aa', 'Bb'], root_supporter: 'Aa' }),
        introPath({ rank: 2, score: 80, path_ids: ['M', 'N'], path_names: ['Mm', 'Nn'], root_supporter: 'Mm' }), // dead
        introPath({ rank: 3, score: 70, path_ids: ['P', 'Q'], path_names: ['Pp', 'Qq'], root_supporter: 'Pp' }),
      ],
    };
    const next = pruneIntroPaths(attrs, deadPairSup)!;
    expect(next.intro_paths).toHaveLength(2);
    expect(next.intro_paths.map((p: { rank: number }) => p.rank)).toEqual([1, 2]);
    // Survivors keep their original order (best first), the dead middle removed.
    expect(next.intro_paths[0].root_supporter).toBe('Aa');
    expect(next.intro_paths[1].root_supporter).toBe('Pp');
  });

  it('rebuilds introduction from the new best surviving path', () => {
    const attrs = {
      introduction: { existing: 'keep-me' }, // pre-existing fields are merged through
      intro_paths: [
        introPath({ path_ids: ['B', 'C'], path_names: ['Bb', 'Cc'], via_orgs: ['DeadOrg'] }), // dead
        introPath({
          hops: 2,
          path_ids: ['A', 'M', 'Z'],
          path_names: ['Aa', 'Mm', 'Zz'], // 3 names => introducer is the middle one
          via_orgs: ['ViaOrg'],
          root_supporter: 'Aa',
        }),
      ],
    };
    const next = pruneIntroPaths(attrs, sup)!;
    expect(next.introduction.degree).toBe(2);
    expect(next.introduction.introducer).toBe('Mm');
    expect(next.introduction.via).toBe('ViaOrg');
    expect(next.introduction.root_supporter).toBe('Aa');
    expect(next.introduction.path).toEqual(['Aa', 'Mm', 'Zz']);
    expect(next.introduction.existing).toBe('keep-me'); // merged, not clobbered
    expect(typeof next.introduction.computed_at).toBe('string');
  });

  it('introducer is undefined when the best path is not exactly 3 names', () => {
    const attrs = {
      intro_paths: [
        introPath({ path_ids: ['B', 'C'], path_names: ['Bb', 'Cc'] }), // dead
        introPath({ path_ids: ['A', 'D'], path_names: ['Aa', 'Dd'], via_orgs: [], root_supporter: 'Aa' }), // 2 names
      ],
    };
    const next = pruneIntroPaths(attrs, sup)!;
    expect(next.introduction.introducer).toBeUndefined();
    expect(next.introduction.via).toBeNull(); // empty via_orgs -> null
  });

  it('does not mutate the input attrs object', () => {
    const attrs = {
      intro_paths: [
        introPath({ path_ids: ['B', 'C'] }),
        introPath({ path_ids: ['A', 'D'], root_supporter: 'Aa', path_names: ['Aa', 'Dd'] }),
      ],
    };
    const before = JSON.stringify(attrs);
    pruneIntroPaths(attrs, sup);
    expect(JSON.stringify(attrs)).toBe(before);
  });
});

// ===================================================================
// matchSupporter
// ===================================================================

describe('matchSupporter', () => {
  it('exact-matches a known supporter name', () => {
    const m = matchSupporter(SUPPORTER.name);
    expect(m).not.toBeNull();
    expect(m!.kind).toBe('exact');
    expect(m!.matchName).toBe(SUPPORTER.name);
    expect(m!.tier).toBe(SUPPORTER.tier);
  });

  it('returns null for an HNW-target name (targets are not donors)', () => {
    // Sanity-check the fixture really is an HNW target, then assert no match.
    expect(isHnwTarget(HNW_TARGET.name)).toBe(true);
    expect(matchSupporter(HNW_TARGET.name)).toBeNull();
  });

  it('returns null for a completely unknown name', () => {
    expect(matchSupporter('Zzqx Notarealperson')).toBeNull();
  });

  it('variant-matches a middle-initial form of a supporter', () => {
    const variant = middleInitialVariant(SUPPORTER.name); // "Grant A. Gordon"
    // Guard: the variant itself must not be a seed (else it would be exact).
    expect(seedInfo(variant)).toBeNull();
    const m = matchSupporter(variant);
    expect(m).not.toBeNull();
    expect(m!.kind).toBe('variant');
    expect(m!.matchName).toBe(SUPPORTER.name);
    expect(m!.tier).toBe(SUPPORTER.tier);
  });

  it('variant-matches a full middle-name form too', () => {
    const [first, ...rest] = SUPPORTER.name.split(' ');
    const m = matchSupporter(`${first} Alexander ${rest.join(' ')}`);
    expect(m).not.toBeNull();
    expect(m!.kind).toBe('variant');
    expect(m!.matchName).toBe(SUPPORTER.name);
  });

  it('returns null for a single-token name (cannot variant-match)', () => {
    expect(matchSupporter('Cher')).toBeNull();
    // Even the first token of a real supporter alone must not match.
    expect(matchSupporter(SUPPORTER.name.split(' ')[0])).toBeNull();
  });

  it('normalises case and surrounding/internal whitespace on exact match', () => {
    const [first, last] = SUPPORTER.name.split(' ');
    expect(matchSupporter(SUPPORTER.name.toUpperCase())?.kind).toBe('exact');
    expect(matchSupporter(`  ${SUPPORTER.name}  `)?.kind).toBe('exact');
    expect(matchSupporter(`${first}   ${last}`)?.kind).toBe('exact');
  });

  it('strips a leading honorific when it starts the string', () => {
    // normaliseSeedName anchors honorific-stripping to the start of the string.
    expect(normaliseSeedName(`Sir ${SUPPORTER.name}`)).toBe(normaliseSeedName(SUPPORTER.name));
    expect(matchSupporter(`Sir ${SUPPORTER.name}`)?.kind).toBe('exact');
    expect(matchSupporter(`Dr ${SUPPORTER.name}`)?.kind).toBe('exact');
  });

  it('does NOT strip an honorific preceded by whitespace (source anchors on ^)', () => {
    // Documents a real quirk: "  SIR Grant Gordon  " keeps "sir" because the
    // leading spaces stop the ^-anchored honorific regex from firing, so the
    // normalised name is "sir grant gordon" and no donor match is found.
    const padded = `  SIR ${SUPPORTER.name}  `;
    expect(normaliseSeedName(padded)).toBe(`sir ${normaliseSeedName(SUPPORTER.name)}`);
    expect(matchSupporter(padded)).toBeNull();
  });
});

// ===================================================================
// scoreLead
// ===================================================================

describe('scoreLead (PRD §18.1 priority + §18.2 confidence)', () => {
  it('exposes the §18.1 config version and canonical weights', () => {
    expect(SCORING_CONFIG_VERSION).toBe('prd-18.1-v1');
    // Re-exported PRIORITY_WEIGHTS from ranking/priority.
    expect(SCORING_WEIGHTS).toEqual({ introability: 0.30, affinity: 0.25, capacity_signal: 0.20, influence: 0.15, strategic_fit: 0.10 });
    const sum = Object.values(SCORING_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('handles an empty attributes object without crashing', () => {
    const s = scoreLead('id1', 'Nobody Inparticular', {}, 0, 0);
    // An empty lead still scores a low non-zero priority: strategic_fit has a
    // 0.3 baseline (§18), so priority = 0.10 * 0.3 * 100 = 3. The other four
    // dimensions are 0.
    expect(s.priority).toBe(3);
    expect(s.dimensions.strategicFit).toBe(30);
    expect(s.confidence).toBeGreaterThanOrEqual(0);
    expect(s.dimensions.influence).toBe(0);
    expect(s.dimensions.capacity).toBe(0);
    expect(s.dimensions.introability).toBe(0);
    expect(s.dimensions.affinity).toBe(0);
    expect(s.pathCount).toBe(0);
    expect(s.minHops).toBeNull();
    expect(s.bestPath).toBeNull();
    expect(s.rootSupporter).toBeNull();
    expect(s.introPaths).toEqual([]);
    expect(s.existingSupporter).toBeNull();
    expect(s.category).toBe('discovered');
  });

  // --- influence dimension (was connectivity): connectionCount/20, saturates at 20 ---
  it('influence normalises connection count and saturates at 20', () => {
    expect(scoreLead('i', 'n', {}, 0, 0).dimensions.influence).toBe(0);
    expect(scoreLead('i', 'n', {}, 10, 0).dimensions.influence).toBe(50);
    expect(scoreLead('i', 'n', {}, 20, 0).dimensions.influence).toBe(100);
    expect(scoreLead('i', 'n', {}, 1000, 0).dimensions.influence).toBe(100);
  });

  // --- capacity dimension (§18.3): observable wealth band + directorships ---
  it('capacity is 0 with no observable wealth signal', () => {
    expect(scoreLead('i', 'n', {}, 0, 0).dimensions.capacity).toBe(0);
    expect(scoreLead('i', 'n', { wealth_band: 'unknown' }, 0, 0).dimensions.capacity).toBe(0);
  });

  it('capacity rises with wealth band and saturates at the top band', () => {
    expect(scoreLead('i', 'n', { wealth_band: '1m_5m' }, 0, 0).dimensions.capacity).toBe(40);
    expect(scoreLead('i', 'n', { wealth_band: '25m_100m' }, 0, 0).dimensions.capacity).toBe(80);
    expect(scoreLead('i', 'n', { wealth_band: '100m_plus' }, 0, 0).dimensions.capacity).toBe(100);
    // Monotonic across bands.
    const lo = scoreLead('i', 'n', { wealth_band: '1m_5m' }, 0, 0).dimensions.capacity;
    const hi = scoreLead('i', 'n', { wealth_band: '5m_25m' }, 0, 0).dimensions.capacity;
    expect(hi).toBeGreaterThan(lo);
  });

  it('capacity adds a directorship signal (§18.3 observable roles)', () => {
    // band 1m_5m (0.4) + 2 directorships (0.1) = 0.5 -> 50
    const s = scoreLead('i', 'n', { wealth_band: '1m_5m' }, 0, 0, { directorshipCount: 2 });
    expect(s.dimensions.capacity).toBe(50);
  });

  // --- affinity dimension ---
  it('affinity applies category weighting', () => {
    expect(scoreLead('i', 'n', { target_category: 'charity_donor' }, 0, 0).dimensions.affinity).toBe(40);
    expect(scoreLead('i', 'n', { target_category: 'hnw_target' }, 0, 0).dimensions.affinity).toBe(30);
    expect(scoreLead('i', 'n', { target_category: 'wealth_identified' }, 0, 0).dimensions.affinity).toBe(15);
    expect(scoreLead('i', 'n', { target_category: 'discovered' }, 0, 0).dimensions.affinity).toBe(0);
  });

  it('affinity adds charity overlap (capped) and philanthropy sector', () => {
    // discovered (0) + overlap 2*0.15 (0.3) + philanthropy sector (0.1) = 0.4 -> 40
    expect(scoreLead('i', 'n', { target_category: 'discovered', sector: 'philanthropy' }, 0, 2).dimensions.affinity).toBe(40);
    // overlap caps at 0.5: 10*0.15 -> 0.5 -> 50
    expect(scoreLead('i', 'n', { target_category: 'discovered' }, 0, 10).dimensions.affinity).toBe(50);
  });

  // --- introability dimension (was paths) ---
  it('introability comes from the best path score', () => {
    const attrs = { intro_paths: [introPath({ hops: 1, score: 90 })] };
    expect(scoreLead('i', 'n', attrs, 0, 0).dimensions.introability).toBe(90);
  });

  it('introability falls back to hop distance with no scored path', () => {
    expect(scoreLead('i', 'n', { introduction: { degree: 1 } }, 0, 0).dimensions.introability).toBe(60);
    expect(scoreLead('i', 'n', { introduction: { degree: 2 } }, 0, 0).dimensions.introability).toBe(35);
    expect(scoreLead('i', 'n', {}, 0, 0).dimensions.introability).toBe(0);
  });

  // --- §18.1 priority blend ---
  it('priority is the §18.1 weighted blend of the five dimensions', () => {
    const attrs = { target_category: 'hnw_target', wealth_band: '5m_25m', intro_paths: [introPath({ hops: 1, score: 80 })] };
    const s = scoreLead('i', 'n', attrs, 10, 0);
    // priority = (.30*introability + .25*affinity + .20*capacity + .15*influence + .10*strategicFit)
    // computed on the 0-1 dimension raws, then scaled to 0-100.
    const blend =
      0.30 * (s.dimensions.introability / 100) +
      0.25 * (s.dimensions.affinity / 100) +
      0.20 * (s.dimensions.capacity / 100) +
      0.15 * (s.dimensions.influence / 100) +
      0.10 * (s.dimensions.strategicFit / 100);
    const expected = Math.round(blend * 100);
    // Allow ±1: dimensions are rounded for display, the priority is rounded from raws.
    expect(Math.abs(s.priority - expected)).toBeLessThanOrEqual(1);
    expect(s.priority).toBeGreaterThan(0);
    expect(s.priority).toBeLessThanOrEqual(100);
  });

  // --- §18.2 confidence ---
  it('confidence reflects identity confirmation', () => {
    const unconfirmed = scoreLead('i', 'n', {}, 0, 0).confidenceDimensions.identity;
    const confirmed = scoreLead('i', 'n', { identity_confirmed: true }, 0, 0).confidenceDimensions.identity;
    expect(confirmed).toBeGreaterThan(unconfirmed);
    expect(confirmed).toBe(100);
  });

  it('confidence corroboration rises with distinct evidence', () => {
    expect(scoreLead('i', 'n', {}, 0, 0, { evidenceCount: 0 }).confidenceDimensions.corroboration).toBe(10);
    expect(scoreLead('i', 'n', {}, 0, 0, { evidenceCount: 1 }).confidenceDimensions.corroboration).toBe(40);
    expect(scoreLead('i', 'n', {}, 0, 0, { evidenceCount: 2 }).confidenceDimensions.corroboration).toBe(70);
    expect(scoreLead('i', 'n', {}, 0, 0, { evidenceCount: 5 }).confidenceDimensions.corroboration).toBe(100);
  });

  // --- paths / minHops ---
  it('derives minHops from the minimum hops across intro_paths', () => {
    const attrs = {
      intro_paths: [introPath({ hops: 2, score: 80 }), introPath({ hops: 1, score: 90 })],
    };
    expect(scoreLead('i', 'n', attrs, 0, 0).minHops).toBe(1);
  });

  it('falls back to intro.degree for minHops when there are no scored paths', () => {
    expect(scoreLead('i', 'n', { introduction: { degree: 3 } }, 0, 0).minHops).toBe(3);
    // A degree of 0 is treated as "no path" -> null.
    expect(scoreLead('i', 'n', { introduction: { degree: 0 } }, 0, 0).minHops).toBeNull();
  });

  it('derives bestPath and rootSupporter from the first intro path', () => {
    const attrs = {
      intro_paths: [
        introPath({ hops: 1, score: 90, path_names: ['Sue', 'Bob'], root_supporter: 'Sue' }),
      ],
    };
    const s = scoreLead('i', 'n', attrs, 0, 0);
    expect(s.bestPath).toBe('Sue → Bob');
    expect(s.rootSupporter).toBe('Sue');
    expect(s.pathCount).toBe(1);
    expect(s.bestPathScore).toBe(90);
  });

  it('falls back to introduction.path / root_supporter when no scored paths exist', () => {
    const attrs = { introduction: { degree: 2, path: ['Ann', 'Cara', 'Dan'], root_supporter: 'Ann' } };
    const s = scoreLead('i', 'n', attrs, 0, 0);
    expect(s.bestPath).toBe('Ann → Cara → Dan');
    expect(s.rootSupporter).toBe('Ann');
  });

  it('slices introPaths to at most 10', () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      introPath({ rank: i + 1, hops: 1, score: 90, path_names: ['A', 'B'], root_supporter: 'A' }),
    );
    const s = scoreLead('i', 'n', { intro_paths: many }, 0, 0);
    expect(s.introPaths).toHaveLength(10);
    expect(s.pathCount).toBe(15); // pathCount reflects the true total
  });

  it('defaults existingSupporter to null', () => {
    expect(scoreLead('i', 'n', { intro_paths: [introPath({})] }, 5, 1).existingSupporter).toBeNull();
  });

  it('defaults the category from the name when target_category is absent', () => {
    expect(scoreLead('i', HNW_TARGET.name, {}, 0, 0).category).toBe('hnw_target');
    expect(scoreLead('i', 'Zzqx Notarealperson', {}, 0, 0).category).toBe('discovered');
  });

  it('passes through enrichment attributes and the validation flag', () => {
    const attrs = {
      wealth_band: 'high',
      estimated_net_worth_gbp: 5_000_000,
      wealth_source: 'companies_house',
      bio_summary: 'Founder.',
      sector: 'technology',
      current_role: 'CEO',
      employer: 'Acme',
      location: 'London',
      identity_confirmed: true,
      action_item: { status: 'in_progress' },
    };
    const s = scoreLead('id7', 'Some One', attrs, 3, 1);
    expect(s.wealthBand).toBe('high');
    expect(s.estimatedNw).toBe(5_000_000);
    expect(s.wealthSource).toBe('companies_house');
    expect(s.bio).toBe('Founder.');
    expect(s.sector).toBe('technology');
    expect(s.currentRole).toBe('CEO');
    expect(s.employer).toBe('Acme');
    expect(s.location).toBe('London');
    expect(s.isHumanValidated).toBe(true);
    expect(s.actionStatus).toBe('in_progress');
    expect(s.connectionCount).toBe(3);
    expect(s.charityOverlap).toBe(1);
  });
});
