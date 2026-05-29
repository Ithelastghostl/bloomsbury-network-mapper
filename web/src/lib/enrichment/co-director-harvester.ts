import type { GraphEnrichmentSignal, DiscoveredRelationship } from './types';
import type { UnifiedSweepConfig, DirectorshipRecord } from './unified-sweep';
import { companiesHouseLimiter } from './rate-limiter';

export interface CoDirectorRecord {
  seed_name: string;
  co_director_name: string;
  company_number: string;
  company_name: string;
  seed_role: string;
  co_director_role: string;
  appointed_on?: string;
  resigned_on?: string;
}

interface OfficerItem {
  name: string;
  officer_role: string;
  appointed_on?: string;
  resigned_on?: string;
  links?: { officer?: { appointments?: string } };
}

interface OfficerListResponse {
  items?: OfficerItem[];
  total_results?: number;
}

export async function harvestCoDirectors(
  seedName: string,
  directorships: DirectorshipRecord[],
  config: UnifiedSweepConfig,
): Promise<{ signals: GraphEnrichmentSignal[]; coDirectors: CoDirectorRecord[] }> {
  const signals: GraphEnrichmentSignal[] = [];
  const coDirectors: CoDirectorRecord[] = [];
  const seenPairs = new Set<string>();
  const seedNorm = normaliseName(seedName);

  const baseUrl = config.companiesHouse.baseUrl ?? 'https://api.company-information.service.gov.uk';
  const authHeader = `Basic ${btoa(config.companiesHouse.apiKey + ':')}`;

  for (const d of directorships) {
    if (!d.company_number) continue;
    if (d.company_status === 'dissolved') continue;

    await companiesHouseLimiter.acquire();

    let data: OfficerListResponse;
    try {
      const resp = await fetch(
        `${baseUrl}/company/${d.company_number}/officers?items_per_page=100`,
        { headers: { Authorization: authHeader } },
      );
      if (!resp.ok) continue;
      data = await resp.json() as OfficerListResponse;
    } catch {
      continue;
    }

    if (!data.items) continue;

    for (const officer of data.items) {
      const officerNorm = normaliseName(officer.name);
      if (isSamePerson(seedNorm, officerNorm)) continue;

      const pairKey = `${officerNorm}::${d.company_number}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      const displayName = formatOfficerName(officer.name);

      const coDir: CoDirectorRecord = {
        seed_name: seedName,
        co_director_name: displayName,
        company_number: d.company_number,
        company_name: d.company_name,
        seed_role: d.role,
        co_director_role: officer.officer_role,
        appointed_on: officer.appointed_on,
        resigned_on: officer.resigned_on,
      };
      coDirectors.push(coDir);

      const rel: DiscoveredRelationship = {
        target_name: displayName,
        target_entity_type: 'person',
        relationship_type: 'CO_DIRECTOR_OF',
        via_organisation: d.company_name,
        confidence: 0.95,
        source_layer: 'A',
        evidence_url: `https://find-and-update.company-information.service.gov.uk/company/${d.company_number}/officers`,
        evidence_text: `Co-${officer.officer_role} at ${d.company_name} (${d.company_number})`,
      };

      signals.push({
        source: 'companies_house_co_director',
        signal_type: 'co_director',
        external_record_id: `ch_codir_${d.company_number}_${officerNorm}`,
        signal_payload: { ...coDir },
        match_confidence: 0.95,
        match_features: [{ feature: 'ch_officer_list', weight: 1.0, score: 0.95 }],
        discovered_relationships: [rel],
        discovered_articles: [],
      });
    }
  }

  return { signals, coDirectors };
}

function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/,\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSamePerson(a: string, b: string): boolean {
  if (a === b) return true;
  const aParts = a.split(' ').filter(Boolean);
  const bParts = b.split(' ').filter(Boolean);
  const aSet = new Set(aParts);
  const overlap = bParts.filter(p => aSet.has(p));
  return overlap.length >= 2 && overlap.length >= Math.min(aParts.length, bParts.length) - 1;
}

// Companies House returns "SURNAME, First Middle" — convert to "First Surname"
function formatOfficerName(raw: string): string {
  if (!raw.includes(',')) return raw;
  const [surname, rest] = raw.split(',', 2);
  const first = (rest ?? '').trim().split(' ')[0];
  if (!first) return surname.trim();
  const titleCase = (s: string) =>
    s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return `${titleCase(first)} ${titleCase(surname.trim())}`;
}
