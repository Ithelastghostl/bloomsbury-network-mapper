import { normaliseSeedName, seedInfo, type SeedPerson } from './seed-reference';
import seedPeople from './data/seed-people.json';

/**
 * Supporter exclusion for generated leads.
 *
 * Our supporters are people we ALREADY have direct access to (current donors,
 * key introducers, strategic contacts). They are not leads — the value of the
 * platform is the *introductions* they can give us to people we DON'T yet have
 * access to. So a generated lead that is really one of our supporters is
 * excluded from the lead list (it belongs in Supporter Reach / Introductions,
 * as a source of warm paths, not as a prospect).
 *
 * Matching:
 *   - exact:   normalised display name equals a supporter's name
 *   - variant: first + last name tokens match a supporter (catches middle
 *              names/initials the augmentation pipeline introduces, e.g.
 *              "John A. Smith" vs supporter "John Smith")
 *
 * HNW targets are NOT supporters — they are exactly the people we want to reach
 * — so they stay rankable as leads and are never matched here.
 */

export interface SupporterMatch {
  matchName: string;
  kind: 'exact' | 'variant';
  /** Funder sub-type from the supporters sheet: "Current donor", "Key introducer", "Strategic contact". */
  subType: string | null;
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

/** Match a display name against our supporters (the people we already have access to). */
export function matchSupporter(displayName: string): SupporterMatch | null {
  const info = seedInfo(displayName);
  if (info?.source === 'supporters') {
    return { matchName: info.name, kind: 'exact', subType: info.funder_sub_type, tier: info.tier };
  }
  // Variant match only when the exact form does not resolve to any seed person
  // (an HNW target with a supporter's first+last would be a false positive).
  if (!info) {
    const key = firstLastKey(displayName);
    if (key) {
      const supporter = SUPPORTER_BY_FIRST_LAST.get(key);
      if (supporter && normaliseSeedName(supporter.name) !== normaliseSeedName(displayName)) {
        return { matchName: supporter.name, kind: 'variant', subType: supporter.funder_sub_type, tier: supporter.tier };
      }
    }
  }
  return null;
}
