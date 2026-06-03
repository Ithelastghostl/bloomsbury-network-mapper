import type { SupabaseClient } from '@supabase/supabase-js';
import type { ResolvedEntity } from './types';
import { generateId } from '@/lib/ulid';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>;

/**
 * In-memory entity cache, pre-loaded at batch start.
 * All dedup happens through this cache so we don't re-query for every relationship.
 */
export class EntityCache {
  private byNormName = new Map<string, { id: string; displayName: string; entityType: string }>();
  private byCompanyNumber = new Map<string, string>();

  static async load(supabase: AnySupabase): Promise<EntityCache> {
    const cache = new EntityCache();

    const { data, error } = await supabase
      .from('canonical_entities')
      .select('canonical_entity_id, display_name, entity_type, attributes');

    if (error) throw new Error(`Failed to load entity cache: ${error.message}`);

    for (const row of data ?? []) {
      const normKey = normaliseName(row.display_name);
      cache.byNormName.set(normKey, {
        id: row.canonical_entity_id,
        displayName: row.display_name,
        entityType: row.entity_type,
      });

      const attrs = row.attributes as Record<string, unknown> | null;
      if (attrs?.company_number) {
        cache.byCompanyNumber.set(String(attrs.company_number), row.canonical_entity_id);
      }
    }

    return cache;
  }

  get size(): number {
    return this.byNormName.size;
  }

  findByName(name: string, entityType?: string): ResolvedEntity | null {
    const norm = normaliseName(name);
    const match = this.byNormName.get(norm);
    if (!match) return null;
    if (entityType && match.entityType !== entityType) return null;
    return {
      canonicalEntityId: match.id,
      displayName: match.displayName,
      entityType: match.entityType,
      isNew: false,
    };
  }

  findByFuzzyName(name: string): ResolvedEntity | null {
    const norm = normaliseName(name);
    const parts = norm.split(' ').filter(Boolean);
    if (parts.length < 2) return null;

    const first = parts[0];
    const last = parts[parts.length - 1];

    for (const entry of Array.from(this.byNormName.entries())) {
      const key = entry[0];
      const val = entry[1];
      const kParts = key.split(' ').filter(Boolean);
      if (kParts.length < 2) continue;
      const kFirst = kParts[0];
      const kLast = kParts[kParts.length - 1];

      if (kLast === last && kFirst === first) {
        return {
          canonicalEntityId: val.id,
          displayName: val.displayName,
          entityType: val.entityType,
          isNew: false,
        };
      }
    }
    return null;
  }

  findByCompanyNumber(companyNumber: string): string | null {
    return this.byCompanyNumber.get(companyNumber) ?? null;
  }

  register(id: string, displayName: string, entityType: string, companyNumber?: string): void {
    const norm = normaliseName(displayName);
    this.byNormName.set(norm, { id, displayName, entityType });
    if (companyNumber) {
      this.byCompanyNumber.set(companyNumber, id);
    }
  }
}

/**
 * Resolve a name to an existing entity or create a new one.
 * Uses the 3-tier strategy: exact → fuzzy name → company number → create.
 */
export async function resolveOrCreate(
  supabase: AnySupabase,
  cache: EntityCache,
  name: string,
  entityType: string,
  runId: string,
  companyNumber?: string,
): Promise<ResolvedEntity> {
  const cleanedName = cleanName(name);
  if (!cleanedName || cleanedName.length < 2) {
    throw new Error(`Invalid entity name: "${name}"`);
  }

  // Tier 1: Exact normalised match
  const exact = cache.findByName(cleanedName, entityType)
    ?? cache.findByName(cleanedName); // type-agnostic fallback
  if (exact) return exact;

  // Tier 2: Fuzzy first+last match
  const fuzzy = cache.findByFuzzyName(cleanedName);
  if (fuzzy) return fuzzy;

  // Tier 3: Company number match (for companies)
  if (companyNumber) {
    const byCoNum = cache.findByCompanyNumber(companyNumber);
    if (byCoNum) {
      return {
        canonicalEntityId: byCoNum,
        displayName: cleanedName,
        entityType,
        isNew: false,
      };
    }
  }

  // Create new entity
  const entityId = generateId();
  const { error } = await supabase.from('canonical_entities').insert({
    canonical_entity_id: entityId,
    entity_type: entityType,
    display_name: cleanedName,
    first_seen_run_id: runId,
    last_seen_run_id: runId,
    attributes: companyNumber ? { company_number: companyNumber } : {},
    source: 'augmentation',
  });

  if (error) {
    // Race condition — check if it was created concurrently
    const { data: retry } = await supabase
      .from('canonical_entities')
      .select('canonical_entity_id')
      .eq('display_name', cleanedName)
      .eq('entity_type', entityType)
      .limit(1)
      .single();
    if (retry) {
      cache.register(retry.canonical_entity_id, cleanedName, entityType, companyNumber);
      return { canonicalEntityId: retry.canonical_entity_id, displayName: cleanedName, entityType, isNew: false };
    }
    throw new Error(`Failed to create entity "${cleanedName}": ${error.message}`);
  }

  cache.register(entityId, cleanedName, entityType, companyNumber);
  return { canonicalEntityId: entityId, displayName: cleanedName, entityType, isNew: true };
}

function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/,\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strip parenthetical descriptions, titles, and honourifics from a name.
 * "John Smith (CEO, Acme Corp)" → "John Smith"
 * "Sir John Smith CBE" → "John Smith"
 */
export function cleanName(raw: string): string {
  let name = raw;

  // Remove parenthetical descriptions
  name = name.replace(/\s*\(.*?\)\s*/g, ' ').trim();
  // Remove trailing descriptions after -- or —
  name = name.split(/\s+--\s+/)[0].split(/\s+—\s+/)[0].split(/\s+–\s+/)[0].trim();

  // Remove titles
  const lower = name.toLowerCase();
  const titles = [
    'sir ', 'dame ', 'lord ', 'lady ', 'baron ', 'baroness ',
    'professor ', 'prof ', 'dr ', 'mr ', 'mrs ', 'ms ', 'miss ',
    'hon ', 'rt hon ', 'the rt hon ', 'reverend ', 'rev ',
  ];
  for (const t of titles) {
    if (lower.startsWith(t)) {
      name = name.slice(t.length);
      break;
    }
  }

  // Remove honourifics
  const suffixes = [
    ' CBE', ' OBE', ' MBE', ' KCB', ' DBE', ' CVO', ' KCVO',
    ' QC', ' KC', ' MP', ' PhD', ' FRS', ' FRSA', ' KCMG',
    ' GCMG', ' LVO', ' DSC', ' KT', ' CH', ' KBE', ' GBE',
  ];
  for (const s of suffixes) {
    if (name.endsWith(s)) {
      name = name.slice(0, -s.length);
    }
  }

  // Convert "SURNAME, First" → "First Surname" (Companies House format)
  if (name.includes(',') && name.split(',').length === 2) {
    const [surname, rest] = name.split(',', 2);
    const restTrimmed = rest.trim();
    if (surname === surname.toUpperCase() && restTrimmed.length > 0) {
      const first = restTrimmed.split(' ')[0];
      const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
      name = `${titleCase(first)} ${titleCase(surname.trim())}`;
    }
  }

  return name.replace(/\s+/g, ' ').trim();
}
