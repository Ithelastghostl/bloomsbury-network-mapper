export type WealthBand = 'unknown' | '1m_5m' | '5m_25m' | '25m_100m' | '100m_plus';

export type TabType = 'seeds' | 'manual' | 'network' | 'all';

export type LeadSource = 'seed' | 'manual_import' | 'network_discovery' | 'unknown';

export interface WealthData {
  band: WealthBand;
  score: number;
  confidence: number;
  estimated_net_worth_gbp?: number;
  wealth_source?: string;
  wealth_origin?: string;
  evidence_summary?: string;
  evidence?: Array<{
    signal: string;
    detail: string;
    contribution: number;
    source_layer: string;
  }>;
}

export interface EvidenceEntry {
  evidence_id: string;
  source: string;
  source_layer: string;
  evidence_url: string | null;
  evidence_text: string;
  confidence: number;
  created_at: string;
}

export interface ConnectionEntry {
  connection_id: string;
  connected_entity_id: string;
  connected_name?: string;
  connection_type: string;
  via_organisation?: string;
  priority: number;
  evidence: Record<string, unknown>;
}

export interface EnrichedEntity {
  canonical_entity_id: string;
  entity_type: 'person' | 'company';
  display_name: string;
  source?: string;
  attributes: Record<string, unknown>;
  wealth: WealthData | null;
  evidence: EvidenceEntry[];
  connections: ConnectionEntry[];
  pipeline_state: string;
  lead_source: LeadSource;
}

export interface CrmStats {
  total_entities: number;
  total_persons: number;
  total_companies: number;
  wealth_estimated: number;
  evidence_entries: number;
  connections: number;
  wealth_bands: Record<WealthBand, number>;
}

export const WEALTH_BAND_LABELS: Record<WealthBand, string> = {
  unknown: 'Unknown',
  '1m_5m': '£1M–5M',
  '5m_25m': '£5M–25M',
  '25m_100m': '£25M–100M',
  '100m_plus': '£100M+',
};

export const WEALTH_BAND_ORDER: WealthBand[] = [
  '100m_plus', '25m_100m', '5m_25m', '1m_5m', 'unknown',
];
