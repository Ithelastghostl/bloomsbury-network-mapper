import type { SeedImportRow } from './database';

export interface HnwTargetRow {
  funder_type: string;
  funder_sub_type: string;
  tier: string;
  first_name: string;
  last_name: string;
  account_name: string;
  account_owner: string;
  email: string;
  primary_affiliation: string;
  introduced_by: string;
}

export interface SupporterRow {
  funder_type: string;
  funder_sub_type: string;
  first_name: string;
  last_name: string;
  account_name: string;
  primary_affiliation: string;
  account_owner: string;
  email: string;
  introduced_by: string;
  tier: string;
}

export type ParsedRow = HnwTargetRow | SupporterRow;

export interface ParseResult {
  import_type: 'hnw_targets' | 'supporters';
  file_name: string;
  rows: ParsedRow[];
  skipped_rows: number;
  errors: Array<{ row: number; message: string }>;
}

export interface BootstrapMatch {
  canonical_entity_id: string;
  display_name: string;
  similarity: number;
  affiliation_match: boolean;
}

export interface BootstrapResult {
  row_id: string;
  action: 'linked' | 'created' | 'quarantined';
  canonical_entity_id: string;
  match_confidence: number;
  match_details: BootstrapMatch | null;
}

export type ImportRowToSeedImportRow = (
  row: ParsedRow,
  rowNumber: number,
  importId: string,
) => Omit<SeedImportRow, 'canonical_entity_id' | 'introducer_entity_id' | 'status' | 'error' | 'created_at'>;
