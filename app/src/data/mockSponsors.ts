export type EnrichmentStatus = 'idle' | 'running' | 'complete' | 'error';

export interface Sponsor {
  id: string;
  name: string;
  title: string;
  organisation: string;
  relationshipStart: string;
  leadsGenerated: number;
  lastEnriched: string | null;
  enrichmentStatus: EnrichmentStatus;
  enrichmentProgress?: number;
  notes?: string;
  philanthropicFocus?: string;
  estimatedCapacity?: string;
}

export const MOCK_SPONSORS: Sponsor[] = [
  {
    id: 's1',
    name: 'James Okafor',
    title: 'Chief Executive Officer',
    organisation: 'Okafor Group Holdings',
    relationshipStart: 'Mar 2022',
    leadsGenerated: 3,
    lastEnriched: '12 Jan 2025',
    enrichmentStatus: 'complete',
    enrichmentProgress: 100,
    philanthropicFocus: 'Youth sport, education, social mobility',
    estimatedCapacity: '£500k+',
    notes: 'Patron. Warm introducer for Margaret Thornton and Priya Mehta. Highly responsive.',
  },
  {
    id: 's2',
    name: 'Sarah Khan',
    title: 'Director',
    organisation: 'Khan Advisory Partners',
    relationshipStart: 'Sep 2022',
    leadsGenerated: 2,
    lastEnriched: '20 Feb 2025',
    enrichmentStatus: 'complete',
    enrichmentProgress: 100,
    philanthropicFocus: 'Women in sport, urban community development',
    estimatedCapacity: '£100k–£250k',
    notes: 'Board observer. Introduced David Achebe. Prefers direct contact over intermediaries.',
  },
  {
    id: 's3',
    name: 'Patrick Lowe',
    title: 'Senior Partner',
    organisation: 'Lowe & Britten LLP',
    relationshipStart: 'Jan 2023',
    leadsGenerated: 1,
    lastEnriched: null,
    enrichmentStatus: 'idle',
    enrichmentProgress: 0,
    philanthropicFocus: 'Infrastructure, community sports facilities',
    estimatedCapacity: '£50k–£150k',
    notes: 'Recent addition. Network not yet fully mapped. Warm link to Oliver Westbrook confirmed.',
  },
];

export const ENRICHMENT_LOG_LINES: Record<string, string[]> = {
  s1: [
    'Resolved: Companies House — 3 directorships confirmed',
    'Resolved: Charity Commission — 2 trustee roles found',
    'Resolved: Sunday Times Rich List proxy — wealth band estimated',
    'Mapped: 14 network contacts identified',
    'Scored: 3 leads above threshold (High: 1, Medium: 2)',
  ],
  s2: [
    'Resolved: Companies House — 2 directorships confirmed',
    'Resolved: LinkedIn public profile — philanthropic focus noted',
    'Mapped: 9 network contacts identified',
    'Scored: 2 leads above threshold (High: 1, Medium: 1)',
  ],
  s3: [
    'Pending: enrichment not yet run for this sponsor',
  ],
};
