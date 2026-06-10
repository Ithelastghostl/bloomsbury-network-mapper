export interface ParsedResearchProfile {
  sensitivity_flags: string[];
  snapshot: Record<string, string>;
  career_wealth: string;
  directorships: DirectorshipEntry[];
  philanthropy: string;
  foundation: FoundationInfo | null;
  media_quotes: string[];
  key_links: string[];
  raw_text: string;
}

export interface DirectorshipEntry {
  company: string;
  role: string;
  appointed: string | null;
  resigned: string | null;
  nature: string;
  flag: string | null;
  source: string;
}

export interface FoundationInfo {
  name: string;
  charity_number: string | null;
  mission: string;
  cause_areas: string[];
  trustees: string[];
}

export interface ParsedNetworkMap {
  organisations: OrganisationEntry[];
  priority_1_contacts: NetworkContact[];
  priority_2_contacts: NetworkContact[];
  inferred_connections: NetworkContact[];
  research_gaps: string[];
  raw_text: string;
}

export interface OrganisationEntry {
  name: string;
  connection_type: string;
  status: 'active' | 'resigned' | 'historic';
  people_extracted: string[];
}

export interface NetworkContact {
  name: string;
  current_role: string | null;
  wealth_signals: string | null;
  philanthropic_track: string | null;
  warm_route: string;
  linkedin_url: string | null;
  wikipedia_url: string | null;
  sensitivity_flag: string | null;
  via_organisation: string | null;
  priority: 1 | 2 | null;
}

function extractSection(text: string, startMarker: string, endMarker?: string): string {
  const startIdx = text.indexOf(startMarker);
  if (startIdx === -1) return '';
  const contentStart = startIdx + startMarker.length;
  if (endMarker) {
    const endIdx = text.indexOf(endMarker, contentStart);
    if (endIdx === -1) return text.slice(contentStart).trim();
    return text.slice(contentStart, endIdx).trim();
  }
  return text.slice(contentStart).trim();
}

function extractBullets(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean);
}

function parseDirectorshipsTable(text: string): DirectorshipEntry[] {
  const lines = text.split('\n').filter(l => l.includes('|') && !l.match(/^[\s|:-]+$/));
  if (lines.length <= 1) return [];

  return lines.slice(1).map(line => {
    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    return {
      company: cells[0] ?? '',
      role: cells[1] ?? '',
      appointed: cells[2] || null,
      resigned: cells[3] || null,
      nature: cells[4] ?? '',
      flag: cells[5] || null,
      source: cells[6] ?? '',
    };
  }).filter(d => d.company);
}

export function parseResearchOutput(rawText: string): ParsedResearchProfile {
  const sensitivitySection = extractSection(rawText, 'SENSITIVITY FLAGS', 'SNAPSHOT');
  const snapshotSection = extractSection(rawText, 'SNAPSHOT', 'TIER 1');
  const tier1Section = extractSection(rawText, 'TIER 1', 'TIER 2');
  const tier2Section = extractSection(rawText, 'TIER 2', 'TIER 3');

  const directorshipsStart = tier1Section.indexOf('|');
  const directorshipsEnd = tier1Section.indexOf('\n\n', directorshipsStart);
  const tableText = directorshipsStart >= 0
    ? tier1Section.slice(directorshipsStart, directorshipsEnd > 0 ? directorshipsEnd : undefined)
    : '';

  const snapshot: Record<string, string> = {};
  for (const bullet of extractBullets(snapshotSection)) {
    const colonIdx = bullet.indexOf(':');
    if (colonIdx > 0) {
      const key = bullet.slice(0, colonIdx).trim().toUpperCase();
      snapshot[key] = bullet.slice(colonIdx + 1).trim();
    }
  }

  let foundation: FoundationInfo | null = null;
  const foundationSection = extractSection(tier2Section, 'FOUNDATION', 'STEP 3');
  if (foundationSection && !foundationSection.includes('not applicable')) {
    const nameLine = foundationSection.split('\n').find(l => l.match(/foundation|trust/i));
    foundation = {
      name: nameLine?.replace(/^[-•*]\s*/, '').split('(')[0]?.trim() ?? '',
      charity_number: (foundationSection.match(/\b(\d{6,7})\b/) ?? [])[1] ?? null,
      mission: extractSection(foundationSection, 'Mission', '\n') || '',
      cause_areas: [],
      trustees: [],
    };
  }

  return {
    sensitivity_flags: extractBullets(sensitivitySection).filter(s => s !== 'None identified.'),
    snapshot,
    career_wealth: extractSection(tier1Section, 'CAREER', 'DIRECTORSHIPS'),
    directorships: parseDirectorshipsTable(tableText),
    philanthropy: tier2Section,
    foundation,
    media_quotes: [],
    key_links: [],
    raw_text: rawText,
  };
}

export function parseNetworkMappingOutput(rawText: string): ParsedNetworkMap {
  const orgSection = extractSection(rawText, 'STEP 1', 'STEP 2');
  const priority1Section = extractSection(rawText, 'PRIORITY 1', 'PRIORITY 2');
  const priority2Section = extractSection(rawText, 'PRIORITY 2', 'RESEARCH GAPS');
  const gapsSection = extractSection(rawText, 'RESEARCH GAPS', '');

  const organisations: OrganisationEntry[] = [];
  const orgBlocks = orgSection.split(/\n(?=\d+\.\s|\(.\)\s)/);
  for (const block of orgBlocks) {
    const firstLine = block.split('\n')[0] ?? '';
    const name = firstLine.replace(/^\d+\.\s*|\([a-z]\)\s*/i, '').split('—')[0]?.trim();
    if (!name) continue;
    const status = block.toLowerCase().includes('resigned') ? 'resigned'
      : block.toLowerCase().includes('historic') ? 'historic' : 'active';
    organisations.push({ name, connection_type: '', status, people_extracted: [] });
  }

  function parseContacts(section: string, priority: 1 | 2): NetworkContact[] {
    const contacts: NetworkContact[] = [];
    const blocks = section.split(/\n(?=\d+\.\s|\*\*\d+\.)/);
    for (const block of blocks) {
      const lines = block.split('\n').filter(Boolean);
      if (lines.length === 0) continue;

      const nameLine = lines[0].replace(/^\d+\.\s*\*?\*?/, '').replace(/\*\*/g, '');
      const name = nameLine.split('·')[0]?.split('—')[0]?.split('(')[0]?.trim();
      if (!name || name.length < 3) continue;

      const linkedinMatch = block.match(/linkedin\.com\/in\/[^\s)]+/i);
      const wikiMatch = block.match(/en\.wikipedia\.org\/wiki\/[^\s)]+/i);
      const sensitivityMatch = block.match(/⚠\s*SENSITIVITY:\s*(.+)/i);

      let viaOrg: string | null = null;
      const routeMatch = block.match(/(?:warm route|route|via|shared board)[:\s]+(.+?)(?:\n|$)/i);
      if (routeMatch) {
        const routeText = routeMatch[1];
        const orgMatch = routeText.match(/(?:at|via|through|shared)\s+([A-Z][^\n,]+)/);
        if (orgMatch) viaOrg = orgMatch[1].trim();
      }

      contacts.push({
        name,
        current_role: extractFieldFromBlock(lines, 'current', 'role', 'title'),
        wealth_signals: extractFieldFromBlock(lines, 'wealth', 'net worth', 'rich list'),
        philanthropic_track: extractFieldFromBlock(lines, 'philanthrop', 'foundation', 'trustee', 'giving'),
        warm_route: extractFieldFromBlock(lines, 'warm route', 'route', 'how') ?? nameLine,
        linkedin_url: linkedinMatch ? `https://${linkedinMatch[0]}` : null,
        wikipedia_url: wikiMatch ? `https://${wikiMatch[0]}` : null,
        sensitivity_flag: sensitivityMatch?.[1]?.trim() ?? null,
        via_organisation: viaOrg,
        priority,
      });
    }
    return contacts;
  }

  function extractFieldFromBlock(lines: string[], ...keywords: string[]): string | null {
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (keywords.some(k => lower.includes(k))) {
        return line.replace(/^[-•*]\s*/, '').replace(/^\*\*[^*]+\*\*:?\s*/, '').trim();
      }
    }
    return null;
  }

  return {
    organisations,
    priority_1_contacts: parseContacts(priority1Section, 1),
    priority_2_contacts: parseContacts(priority2Section, 2),
    inferred_connections: [],
    research_gaps: extractBullets(gapsSection),
    raw_text: rawText,
  };
}
