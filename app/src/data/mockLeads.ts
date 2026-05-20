export type ScoreTier = 'High' | 'Medium' | 'Low';
export type OutreachStage = 'New' | 'Contacted' | 'Meeting' | 'Donated' | 'Closed';

export interface ProvenanceField {
  value: string;
  source: string;
  date: string; // DD Mon YYYY
}

export interface ScoreReason {
  label: string;
  detail: string;
  source?: string;
  sourceDate?: string;
}

export interface Lead {
  id: string;
  name: string;
  title: string;
  organisation: string;
  score: number;
  tier: ScoreTier;
  stage: OutreachStage;
  introducingSponsor: string;
  connectionPath: string; // e.g. "2nd degree"
  connectionVia: string;  // e.g. "via James Okafor"
  triggerSignal?: string;
  scoreReasons: ScoreReason[];
  enrichedFields: {
    knownDonations?: ProvenanceField;
    netWorthEstimate?: ProvenanceField;
    boardRoles?: ProvenanceField;
    philanthropicFocus?: ProvenanceField;
  };
  introDraft: string;
}

export const MOCK_LEADS: Lead[] = [
  {
    id: '1',
    name: 'Margaret Thornton',
    title: 'Non-Executive Director',
    organisation: 'Thornton Capital Advisors',
    score: 91,
    tier: 'High',
    stage: 'New',
    introducingSponsor: 'James Okafor',
    connectionPath: '2nd degree',
    connectionVia: 'via James Okafor',
    triggerSignal: 'New trustee role',
    scoreReasons: [
      {
        label: 'Philanthropy record',
        detail: '£180k donation to Sport England foundation, confirmed gift to Crisis UK',
        source: 'Companies House',
        sourceDate: '12 Jan 2025',
      },
      {
        label: 'Shared network',
        detail: 'Direct connection to James Okafor (current patron) and two Bloomsbury advisors',
      },
      {
        label: 'Recent signal',
        detail: 'Appointed trustee at Shelter UK, Jan 2025 — active philanthropic posture',
        source: 'Charity Commission',
        sourceDate: '08 Jan 2025',
      },
    ],
    enrichedFields: {
      knownDonations: { value: '£180k (Sport England), £45k (Crisis UK)', source: 'Companies House', date: '12 Jan 2025' },
      netWorthEstimate: { value: '£2.4m–£5m (estimated)', source: 'Sunday Times Rich List proxy', date: '03 Apr 2024' },
      boardRoles: { value: 'Thornton Capital Advisors NED; Shelter UK Trustee (new)', source: 'Companies House', date: '08 Jan 2025' },
      philanthropicFocus: { value: 'Social mobility, sport, housing', source: 'Public statements', date: '15 Nov 2024' },
    },
    introDraft: `Dear Margaret,\n\nI'm writing on behalf of the Bloomsbury Football Foundation, introduced by our patron James Okafor who speaks highly of your work.\n\nBloomsbury Football supports over 5,000 young people across London each week through community football programmes. Given your focus on social mobility and your recent appointment at Shelter, I thought you might find our work compelling.\n\nWould you be open to a short call to learn more?\n\nBest wishes,`,
  },
  {
    id: '2',
    name: 'David Achebe',
    title: 'Managing Partner',
    organisation: 'Achebe & Partners LLP',
    score: 78,
    tier: 'High',
    stage: 'Contacted',
    introducingSponsor: 'Sarah Khan',
    connectionPath: '2nd degree',
    connectionVia: 'via Sarah Khan',
    scoreReasons: [
      {
        label: 'Professional network overlap',
        detail: '4 shared connections with current sponsors including Sarah Khan and Patrick Lowe',
      },
      {
        label: 'Philanthropic focus',
        detail: 'Public statements on youth sport and urban community investment',
        source: 'LinkedIn',
        sourceDate: '20 Feb 2025',
      },
      {
        label: 'Financial capacity',
        detail: 'Managing partner at mid-market PE firm; estimated £1.8m–£3.5m net worth',
        source: 'Companies House',
        sourceDate: '01 Mar 2025',
      },
    ],
    enrichedFields: {
      boardRoles: { value: 'Managing Partner, Achebe & Partners LLP', source: 'Companies House', date: '01 Mar 2025' },
      philanthropicFocus: { value: 'Youth sport, urban regeneration', source: 'LinkedIn', date: '20 Feb 2025' },
    },
    introDraft: `Dear David,\n\nFollowing Sarah Khan's suggestion, I wanted to reach out about the Bloomsbury Football Foundation.\n\nWe work with young people across London who might not otherwise access sport. I'd love to share what we're doing.\n\nWould you have 20 minutes in the coming weeks?`,
  },
  {
    id: '3',
    name: 'Priya Mehta',
    title: 'Chief Investment Officer',
    organisation: 'Meridian Endowment Trust',
    score: 64,
    tier: 'Medium',
    stage: 'New',
    introducingSponsor: 'James Okafor',
    connectionPath: '3rd degree',
    connectionVia: 'via Claire Stanton',
    triggerSignal: 'Public donation announced',
    scoreReasons: [
      {
        label: 'Endowment role',
        detail: 'CIO at Meridian Trust — manages a £40m charitable endowment with sport & education focus',
        source: 'Meridian Trust annual report',
        sourceDate: '30 Jun 2024',
      },
      {
        label: 'Recent public donation',
        detail: 'Personal £30k gift to Greenhouse Sports announced Feb 2025',
        source: 'Greenhouse Sports press release',
        sourceDate: '14 Feb 2025',
      },
      {
        label: 'Weak direct connection',
        detail: 'No direct link to current sponsors — 3rd degree path via Claire Stanton',
      },
    ],
    enrichedFields: {
      knownDonations: { value: '£30k (Greenhouse Sports)', source: 'Greenhouse Sports', date: '14 Feb 2025' },
      boardRoles: { value: 'CIO, Meridian Endowment Trust', source: 'Meridian Trust', date: '30 Jun 2024' },
    },
    introDraft: '',
  },
  {
    id: '4',
    name: 'Oliver Westbrook',
    title: 'Partner',
    organisation: 'Greenvale Infrastructure',
    score: 58,
    tier: 'Medium',
    stage: 'Meeting',
    introducingSponsor: 'Patrick Lowe',
    connectionPath: '2nd degree',
    connectionVia: 'via Patrick Lowe',
    scoreReasons: [
      {
        label: 'Direct sponsor link',
        detail: 'Patrick Lowe (current sponsor) is a named reference; warm introduction confirmed',
      },
      {
        label: 'Moderate giving capacity',
        detail: 'Infrastructure partner; estimated giving range £20k–£80k based on comparable peers',
        source: 'Companies House',
        sourceDate: '15 Nov 2024',
      },
      {
        label: 'No confirmed philanthropic history',
        detail: 'No public donation record found — capacity inferred from role and network only',
      },
    ],
    enrichedFields: {
      netWorthEstimate: { value: 'Not available', source: 'Companies House', date: '15 Nov 2024' },
      boardRoles: { value: 'Partner, Greenvale Infrastructure', source: 'Companies House', date: '15 Nov 2024' },
    },
    introDraft: `Dear Oliver,\n\nPatrick Lowe suggested I get in touch. He thought our work at the Bloomsbury Football Foundation might be of interest to you.`,
  },
  {
    id: '5',
    name: 'Anita Osei-Bonsu',
    title: 'Senior Associate',
    organisation: 'Clifford Chance LLP',
    score: 41,
    tier: 'Medium',
    stage: 'New',
    introducingSponsor: 'Sarah Khan',
    connectionPath: '2nd degree',
    connectionVia: 'via Sarah Khan',
    scoreReasons: [
      {
        label: 'Network proximity',
        detail: 'Direct connection to Sarah Khan; shares 3 mutual contacts with sponsors',
      },
      {
        label: 'Early career — limited capacity',
        detail: 'Senior associate level; giving capacity likely £5k–£20k range',
      },
      {
        label: 'No philanthropic record',
        detail: 'No public donation history found',
      },
    ],
    enrichedFields: {
      boardRoles: { value: 'Senior Associate, Clifford Chance LLP', source: 'Companies House', date: '20 Jan 2025' },
    },
    introDraft: '',
  },
  {
    id: '6',
    name: 'Thomas Hargreaves',
    title: 'Retired — Former CFO',
    organisation: 'Previously Barclays PLC',
    score: 29,
    tier: 'Low',
    stage: 'Closed',
    introducingSponsor: 'James Okafor',
    connectionPath: '3rd degree',
    connectionVia: 'via indirect network',
    scoreReasons: [
      {
        label: 'Weak network path',
        detail: '3rd degree connection with no confirmed warm link',
      },
      {
        label: 'No recent activity',
        detail: 'Retired 2021; no public philanthropic activity since 2022',
        source: 'Companies House',
        sourceDate: '01 Apr 2021',
      },
      {
        label: 'Low signal',
        detail: 'Included due to historical capacity — no current indicators of giving intent',
      },
    ],
    enrichedFields: {
      boardRoles: { value: 'Retired (former CFO, Barclays)', source: 'Companies House', date: '01 Apr 2021' },
    },
    introDraft: '',
  },
];

export const SPONSORS = ['All sponsors', 'James Okafor', 'Sarah Khan', 'Patrick Lowe'];
export const STAGES: OutreachStage[] = ['New', 'Contacted', 'Meeting', 'Donated', 'Closed'];
export const TIERS: ScoreTier[] = ['High', 'Medium', 'Low'];
