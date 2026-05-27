// TypeScript interfaces matching the Postgres schema from PRD §11.1
// All tables in the `app` schema.

// =========================================================
// CORE OBJECTS
// =========================================================

export type RunType = 'corpus' | 'seed' | 'hybrid';

export interface Run {
  run_id: string;
  corpus_version: string | null;
  schema_version: string;
  extraction_prompt_versions: Record<string, unknown> | null;
  graph_build_version: string | null;
  identity_resolution_version: string | null;
  scoring_config_version: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  error: Record<string, unknown> | null;
  run_type: RunType;
  cost_cap_usd: number | null;
  total_cost_usd: number;
}

export interface Document {
  document_id: string;
  corpus_version: string;
  source: string;
  document_type: string;
  content_hash: string;
  storage_uri: string;
  year: number | null;
  ingested_at: string;
  metadata: Record<string, unknown>;
}

export interface ExtractionRun {
  extraction_run_id: string;
  run_id: string;
  document_id: string;
  prompt_version: string;
  model: string;
  temperature: number;
  status: string;
  invalid_json_retries: number;
  started_at: string;
  completed_at: string | null;
  error: Record<string, unknown> | null;
}

export interface EntityMention {
  entity_mention_id: string;
  document_id: string;
  run_id: string;
  entity_type: string;
  raw_value: string;
  normalised_value: string;
  attributes: Record<string, unknown>;
  evidence_span: string;
  span_start: number;
  span_end: number;
  extraction_confidence: number;
  validation_status: string;
  embedding: number[] | null;
  created_at: string;
}

export interface EvidenceSpan {
  evidence_id: string;
  document_id: string;
  run_id: string;
  text: string;
  span_start: number;
  span_end: number;
  source_section: string | null;
  evidence_type: string;
  created_at: string;
}

export type EntitySource = 'corpus' | 'seed_import' | 'augmentation';

export interface CanonicalEntity {
  canonical_entity_id: string;
  entity_type: string;
  display_name: string;
  first_seen_run_id: string;
  last_seen_run_id: string;
  attributes: Record<string, unknown>;
  source: EntitySource;
}

export interface IdentityCluster {
  cluster_id: string;
  canonical_entity_id: string;
  run_id: string;
  entity_type: string;
  member_mention_ids: string[];
  cluster_confidence: number;
  decision_status: string;
  created_by: string;
  created_at: string;
}

export interface HumanIdentityDecision {
  identity_decision_id: string;
  entity_a_mention_id: string;
  entity_b_mention_id: string;
  decision: 'same_person' | 'not_same_person';
  reason_code: string;
  notes: string | null;
  decided_by: string;
  decided_at: string;
  replay_on_future_runs: boolean;
  superseded_by: string | null;
}

export interface Relationship {
  relationship_id: string;
  run_id: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
  valid_from: string | null;
  valid_to: string | null;
  evidence_id: string;
  confidence: number;
  freshness_multiplier: number;
  source_reliability: number;
  edge_weight: number;
  status: string;
}

export interface DonationEvent {
  donation_event_id: string;
  run_id: string;
  donor_entity_id: string;
  recipient_entity_id: string;
  amount: number | null;
  currency: string | null;
  year: number | null;
  evidence_id: string;
  confidence: number;
}

export interface GraphSnapshot {
  snapshot_id: string;
  run_id: string;
  storage_uri: string;
  node_count: number;
  edge_count: number;
  built_at: string;
}

// =========================================================
// DISCOVERY & REVIEW
// =========================================================

export interface Seed {
  seed_id: string;
  canonical_entity_id: string;
  added_by: string;
  added_at: string;
  notes: string | null;
  active: boolean;
  seed_quality_score: number | null;
  import_row_id: string | null;
  tier: string | null;
  funder_type: string | null;
  sub_type: string | null;
  augmentation_status: string;
}

export interface CandidateRecommendation {
  candidate_recommendation_id: string;
  run_id: string;
  seed_id: string;
  candidate_entity_id: string;
  presentation_group_id: string | null;
  rank: number;
  priority_score: number;
  confidence_score: number;
  status: string;
  strongest_path: Record<string, unknown>;
  reason_codes: string[];
  identity_warnings: string[];
  created_at: string;
  introduction_route_id: string | null;
  target_seed_id: string | null;
}

export interface EnrichmentSignal {
  enrichment_signal_id: string;
  candidate_entity_id: string;
  source: string;
  external_record_id: string;
  signal_type: string;
  signal_payload: Record<string, unknown>;
  match_confidence: number;
  retrieved_at: string;
  cache_expires_at: string;
  accepted_for_scoring: boolean;
  status: string;
}

export interface HumanDecision {
  human_decision_id: string;
  candidate_recommendation_id: string;
  decision: string;
  reason_code: string | null;
  notes: string | null;
  decided_by: string;
  decided_at: string;
  cold_start_decision: boolean;
}

export interface IntroOutcome {
  intro_outcome_id: string;
  candidate_recommendation_id: string;
  seed_id: string;
  intro_status: string;
  decline_reason: string | null;
  meeting_at: string | null;
  converted: boolean | null;
  notes: string | null;
  recorded_by: string;
  recorded_at: string;
}

// =========================================================
// CONFIG & OPERATIONS
// =========================================================

export interface ScoringConfig {
  scoring_config_version: string;
  config: Record<string, unknown>;
  promoted_at: string;
  promoted_by: string;
  rationale: string | null;
}

export interface IcpConfig {
  icp_id: string;
  config: Record<string, unknown>;
  version: string;
  active: boolean;
  updated_at: string;
}

export interface Quarantine {
  quarantine_id: string;
  run_id: string;
  source_phase: string;
  source_record: Record<string, unknown>;
  reason_code: string;
  details: string | null;
  created_at: string;
  resolved: boolean;
}

export interface PipelineJob {
  job_id: string;
  run_id: string;
  phase: string;
  status: string;
  priority: number;
  attempts: number;
  max_attempts: number;
  payload: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  enqueued_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface KnownContact {
  canonical_entity_id: string;
  added_by: string;
  added_at: string;
  source: string;
  exclude_as_candidate: boolean;
  available_as_introducer: boolean;
}

export interface RejectionLog {
  rejection_log_id: string;
  seed_id: string;
  candidate_entity_id: string;
  decided_at: string;
  reason_code: string;
}

export interface AuditLog {
  log_id: string;
  actor: string;
  action: string;
  payload: Record<string, unknown>;
  created_at: string;
}

// =========================================================
// SEED PIPELINE TABLES (migrations 00007, 00008)
// =========================================================

export interface SeedImport {
  import_id: string;
  import_type: 'hnw_targets' | 'supporters';
  file_name: string;
  row_count: number;
  processed_count: number;
  status: string;
  imported_by: string;
  imported_at: string;
  error: Record<string, unknown> | null;
}

export interface SeedImportRow {
  row_id: string;
  import_id: string;
  row_number: number;
  raw_data: Record<string, unknown>;
  first_name: string;
  last_name: string;
  tier: string | null;
  primary_affiliation: string | null;
  introduced_by_raw: string | null;
  email: string | null;
  funder_type: string | null;
  sub_type: string | null;
  canonical_entity_id: string | null;
  introducer_entity_id: string | null;
  status: string;
  error: string | null;
  created_at: string;
}

export type PromotionStatus = 'pending' | 'promoted' | 'rejected' | 'merged';

export interface StagedEntity {
  staged_entity_id: string;
  display_name: string;
  entity_type: string;
  attributes: Record<string, unknown>;
  source: string;
  source_run_id: string | null;
  match_candidate_id: string | null;
  match_confidence: number | null;
  promotion_status: PromotionStatus;
  promoted_entity_id: string | null;
  created_at: string;
}

export interface EntityAlias {
  alias_id: string;
  alias_entity_id: string;
  canonical_entity_id: string;
  alias_source: string;
  created_at: string;
}

export type RouteType = 'spreadsheet_declared' | 'network_inferred' | 'corpus_discovered';

export interface IntroductionRoute {
  route_id: string;
  target_entity_id: string;
  introducer_entity_id: string;
  route_type: RouteType;
  warmth_tier: number | null;
  via_entity_id: string | null;
  via_organisation: string | null;
  evidence: Record<string, unknown>;
  source: string;
  created_at: string;
}

export type AugmentationPhase = 'research' | 'network_mapping';

export interface SeedAugmentationRun {
  augmentation_run_id: string;
  canonical_entity_id: string;
  run_id: string | null;
  phase: AugmentationPhase;
  prompt_version: string;
  model: string;
  status: string;
  result_storage_uri: string | null;
  result_summary: Record<string, unknown> | null;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost_usd: number | null;
  started_at: string;
  completed_at: string | null;
  error: Record<string, unknown> | null;
}

export interface NetworkConnection {
  connection_id: string;
  source_entity_id: string;
  connected_entity_id: string | null;
  staged_entity_id: string | null;
  connection_type: string;
  via_organisation: string | null;
  via_organisation_id: string | null;
  priority: number | null;
  augmentation_run_id: string | null;
  background_check: Record<string, unknown>;
  evidence: Record<string, unknown>;
  created_at: string;
}

// =========================================================
// SWEEP GRAPH STORAGE (migration 00009)
// =========================================================

export type ArticleType = 'news' | 'filing' | 'profile' | 'philanthropy' | 'rich_list' | 'other';

export interface EntityArticle {
  article_id: string;
  entity_id: string;
  url: string;
  title: string;
  source_name: string;
  published_date: string | null;
  excerpt: string | null;
  article_type: ArticleType;
  enrichment_source: string;
  source_layer: 'A' | 'B' | 'C';
  sweep_run_id: string | null;
  created_at: string;
}

export interface EnrichmentEvidence {
  evidence_id: string;
  entity_id: string;
  source: string;
  source_layer: 'A' | 'B' | 'C';
  evidence_url: string | null;
  evidence_text: string;
  confidence: number;
  sweep_run_id: string | null;
  created_at: string;
}

export interface SweepRun {
  sweep_run_id: string;
  entity_id: string;
  run_id: string | null;
  layers_completed: string[];
  wealth_band: string | null;
  wealth_score: number | null;
  signals_count: number;
  relationships_found: number;
  articles_found: number;
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at: string | null;
  error: Record<string, unknown> | null;
}
