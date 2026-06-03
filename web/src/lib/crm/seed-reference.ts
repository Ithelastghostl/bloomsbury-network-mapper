import seedPeople from './data/seed-people.json';

export interface SeedPerson {
  name: string;
  source: 'hnw_targets' | 'supporters';
  tier: string | null;
}

const SEED_PEOPLE = seedPeople as SeedPerson[];

/**
 * Normalise a person's name for matching across the seed reference lists and
 * canonical_entities. Mirrors the spreadsheet parser (src/lib/seed-import/
 * xlsx-parser.ts): lowercases, strips honorific prefixes (Sir, Dr, …) and
 * trailing honours (CBE, OBE, …), and collapses whitespace.
 */
export function normaliseSeedName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^(sir|dame|lord|lady|dr|prof|professor|mr|mrs|ms|miss|rev|hon)\b\.?\s*/i, '')
    .replace(/\s+(cbe|obe|mbe|kcb|kbe|dbe|kt|gcb|gcmg|gcvo|ch|frs|fra|fba)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalised-name → seed metadata, for fast lookup by display name. */
const SEED_BY_NAME = new Map<string, SeedPerson>(
  SEED_PEOPLE.map(p => [normaliseSeedName(p.name), p]),
);

/**
 * Is this entity one of the original seed people we already have (from the
 * Seed_reference HNW + supporter lists)? Match is by normalised display name.
 */
export function isSeedPerson(displayName: string): boolean {
  return SEED_BY_NAME.has(normaliseSeedName(displayName));
}

/** Seed metadata for an entity, or null if it isn't a seed. */
export function seedInfo(displayName: string): SeedPerson | null {
  return SEED_BY_NAME.get(normaliseSeedName(displayName)) ?? null;
}

export const SEED_PERSON_COUNT = SEED_PEOPLE.length;
