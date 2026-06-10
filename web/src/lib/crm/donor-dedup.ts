import { normaliseSeedName, seedInfo, type SeedPerson } from './seed-reference';
import seedPeople from './data/seed-people.json';

/**
 * Existing-donor deduplication for generated leads.
 *
 * A generated lead that is really one of our current donors (the supporters
 * in the original list) must not be ranked as a fresh lead. Matching is:
 *   - exact:   normalised display name equals a supporter's name
 *   - variant: first + last name tokens match a supporter (catches middle
 *              names/initials the augmentation pipeline introduces, e.g.
 *              "John A. Smith" vs supporter "John Smith")
 *
 * HNW targets from the original list are NOT donors — they are the people we
 * want to reach — so they stay rankable and are never matched here.
 */

export interface DonorMatch {
  matchName: string;
  kind: 'exact' | 'variant';
  tier: string | null;
}

const SUPPORTERS = (seedPeople as SeedPerson[]).filter(p => p.source === 'supporters');

/** "john a smith" -> "john|smith". Single-token names return null (too weak to match on). */
function firstLastKey(name: string): string | null {
  const tokens = normaliseSeedName(name).split(' ').filter(t => t.length > 1 || /^[a-z]$/.test(t) === false);
  if (tokens.length < 2) return null;
  return `${tokens[0]}|${tokens[tokens.length - 1]}`;
}

const SUPPORTER_BY_FIRST_LAST = new Map<string, SeedPerson>();
for (const s of SUPPORTERS) {
  const key = firstLastKey(s.name);
  if (key && !SUPPORTER_BY_FIRST_LAST.has(key)) SUPPORTER_BY_FIRST_LAST.set(key, s);
}

/** Match a display name against the current-donor (supporters) list. */
export function matchExistingDonor(displayName: string): DonorMatch | null {
  const info = seedInfo(displayName);
  if (info?.source === 'supporters') {
    return { matchName: info.name, kind: 'exact', tier: info.tier };
  }
  // Variant match only when the exact form does not resolve to any seed person
  // (an HNW target with a supporter's first+last would be a false positive).
  if (!info) {
    const key = firstLastKey(displayName);
    if (key) {
      const supporter = SUPPORTER_BY_FIRST_LAST.get(key);
      if (supporter && normaliseSeedName(supporter.name) !== normaliseSeedName(displayName)) {
        return { matchName: supporter.name, kind: 'variant', tier: supporter.tier };
      }
    }
  }
  return null;
}
