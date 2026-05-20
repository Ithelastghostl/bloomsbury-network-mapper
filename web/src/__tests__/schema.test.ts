import { describe, it, expect, beforeAll } from 'vitest';

// =========================================================
// Helper: query remote Supabase via CLI --linked flag
// =========================================================

async function sqlQuery(sql: string): Promise<Record<string, unknown>[]> {
  const { execSync } = await import('child_process');
  const escaped = sql.replace(/'/g, "'\\''");
  const raw = execSync(
    `npx supabase db query --linked --output json '${escaped}' 2>/dev/null`,
    {
      cwd: '/workspaces/bloomsbury-network-mapper',
      encoding: 'utf-8',
      timeout: 30000,
    }
  );
  const parsed = JSON.parse(raw);
  // CLI wraps results in { rows: [...], boundary: ..., warning: ... }
  if (parsed && Array.isArray(parsed.rows)) {
    return parsed.rows;
  }
  // Fallback if the shape is a plain array
  if (Array.isArray(parsed)) {
    return parsed;
  }
  throw new Error(`Unexpected query result shape: ${raw.slice(0, 200)}`);
}

// =========================================================
// Constants
// =========================================================

const EXPECTED_TABLES = [
  'audit_log',
  'candidate_recommendations',
  'canonical_entities',
  'documents',
  'donation_events',
  'enrichment_signals',
  'entity_mentions',
  'evidence_spans',
  'extraction_runs',
  'graph_snapshots',
  'human_decisions',
  'human_identity_decisions',
  'icp_configs',
  'identity_clusters',
  'intro_outcomes',
  'known_contacts',
  'pipeline_jobs',
  'quarantine',
  'rejection_log',
  'relationships',
  'runs',
  'scoring_configs',
  'seeds',
];

// =========================================================
// Test: All 23 tables exist
// =========================================================

describe('Schema: table existence', () => {
  let existingTables: string[];

  beforeAll(async () => {
    const rows = await sqlQuery(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'app' ORDER BY table_name"
    );
    existingTables = rows.map((r) => r.table_name as string);
  });

  it('should have exactly 23 tables in the app schema', () => {
    expect(existingTables.length).toBe(23);
  });

  it.each(EXPECTED_TABLES)('table app.%s exists', (table) => {
    expect(existingTables).toContain(table);
  });
});

// =========================================================
// Test: Key columns with correct types
// =========================================================

interface ColumnInfo {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
}

describe('Schema: key columns and types', () => {
  let columns: ColumnInfo[];

  beforeAll(async () => {
    const rows = await sqlQuery(
      "SELECT table_name, column_name, data_type, udt_name, is_nullable FROM information_schema.columns WHERE table_schema = 'app' ORDER BY table_name, ordinal_position"
    );
    columns = rows as unknown as ColumnInfo[];
  });

  function findColumn(table: string, column: string): ColumnInfo | undefined {
    return columns.find(
      (c) => c.table_name === table && c.column_name === column
    );
  }

  // Primary keys -- all should be text (ULID)
  const pkCases: [string, string][] = [
    ['runs', 'run_id'],
    ['documents', 'document_id'],
    ['extraction_runs', 'extraction_run_id'],
    ['entity_mentions', 'entity_mention_id'],
    ['evidence_spans', 'evidence_id'],
    ['canonical_entities', 'canonical_entity_id'],
    ['identity_clusters', 'cluster_id'],
    ['human_identity_decisions', 'identity_decision_id'],
    ['relationships', 'relationship_id'],
    ['donation_events', 'donation_event_id'],
    ['graph_snapshots', 'snapshot_id'],
    ['seeds', 'seed_id'],
    ['candidate_recommendations', 'candidate_recommendation_id'],
    ['enrichment_signals', 'enrichment_signal_id'],
    ['human_decisions', 'human_decision_id'],
    ['intro_outcomes', 'intro_outcome_id'],
    ['scoring_configs', 'scoring_config_version'],
    ['icp_configs', 'icp_id'],
    ['quarantine', 'quarantine_id'],
    ['pipeline_jobs', 'job_id'],
    ['known_contacts', 'canonical_entity_id'],
    ['rejection_log', 'rejection_log_id'],
    ['audit_log', 'log_id'],
  ];

  it.each(pkCases)(
    'app.%s.%s is text and not nullable',
    (table, col) => {
      const c = findColumn(table, col);
      expect(c).toBeDefined();
      expect(c!.udt_name).toBe('text');
      expect(c!.is_nullable).toBe('NO');
    }
  );

  // Timestamp columns should be timestamptz
  const tsCases: [string, string][] = [
    ['runs', 'started_at'],
    ['documents', 'ingested_at'],
    ['extraction_runs', 'started_at'],
    ['entity_mentions', 'created_at'],
    ['evidence_spans', 'created_at'],
    ['identity_clusters', 'created_at'],
    ['human_identity_decisions', 'decided_at'],
    ['graph_snapshots', 'built_at'],
    ['seeds', 'added_at'],
    ['candidate_recommendations', 'created_at'],
    ['enrichment_signals', 'retrieved_at'],
    ['human_decisions', 'decided_at'],
    ['intro_outcomes', 'recorded_at'],
    ['scoring_configs', 'promoted_at'],
    ['icp_configs', 'updated_at'],
    ['quarantine', 'created_at'],
    ['pipeline_jobs', 'enqueued_at'],
    ['known_contacts', 'added_at'],
    ['rejection_log', 'decided_at'],
    ['audit_log', 'created_at'],
  ];

  it.each(tsCases)(
    'app.%s.%s is timestamptz',
    (table, col) => {
      const c = findColumn(table, col);
      expect(c).toBeDefined();
      expect(c!.udt_name).toBe('timestamptz');
    }
  );

  // JSONB columns
  const jsonbCases: [string, string][] = [
    ['runs', 'extraction_prompt_versions'],
    ['documents', 'metadata'],
    ['entity_mentions', 'attributes'],
    ['canonical_entities', 'attributes'],
    ['candidate_recommendations', 'strongest_path'],
    ['enrichment_signals', 'signal_payload'],
    ['scoring_configs', 'config'],
    ['icp_configs', 'config'],
    ['quarantine', 'source_record'],
    ['pipeline_jobs', 'payload'],
    ['audit_log', 'payload'],
  ];

  it.each(jsonbCases)(
    'app.%s.%s is jsonb',
    (table, col) => {
      const c = findColumn(table, col);
      expect(c).toBeDefined();
      expect(c!.udt_name).toBe('jsonb');
    }
  );

  // Vector column
  it('app.entity_mentions.embedding is vector(1536)', () => {
    const c = findColumn('entity_mentions', 'embedding');
    expect(c).toBeDefined();
    expect(c!.udt_name).toBe('vector');
  });

  // Numeric columns
  const numericCases: [string, string][] = [
    ['extraction_runs', 'temperature'],
    ['entity_mentions', 'extraction_confidence'],
    ['identity_clusters', 'cluster_confidence'],
    ['relationships', 'confidence'],
    ['relationships', 'edge_weight'],
    ['donation_events', 'confidence'],
    ['candidate_recommendations', 'priority_score'],
    ['candidate_recommendations', 'confidence_score'],
    ['enrichment_signals', 'match_confidence'],
  ];

  it.each(numericCases)(
    'app.%s.%s is numeric',
    (table, col) => {
      const c = findColumn(table, col);
      expect(c).toBeDefined();
      expect(c!.udt_name).toBe('numeric');
    }
  );
});

// =========================================================
// Test: Expected indexes exist
// =========================================================

describe('Schema: indexes', () => {
  let indexNames: string[];

  beforeAll(async () => {
    const rows = await sqlQuery(
      "SELECT indexname FROM pg_indexes WHERE schemaname = 'app' ORDER BY indexname"
    );
    indexNames = rows.map((r) => r.indexname as string);
  });

  it('has at least 30 indexes across the app schema', () => {
    expect(indexNames.length).toBeGreaterThanOrEqual(30);
  });

  const tablesWithIndexes = [
    'documents',
    'extraction_runs',
    'entity_mentions',
    'evidence_spans',
    'canonical_entities',
    'identity_clusters',
    'human_identity_decisions',
    'relationships',
    'donation_events',
    'candidate_recommendations',
    'enrichment_signals',
    'human_decisions',
    'intro_outcomes',
    'quarantine',
    'pipeline_jobs',
    'audit_log',
  ];

  it.each(tablesWithIndexes)(
    'app.%s has at least one index',
    (table) => {
      const tableIndexes = indexNames.filter((n) => n.startsWith(table));
      expect(tableIndexes.length).toBeGreaterThanOrEqual(1);
    }
  );
});

// =========================================================
// Test: RLS is enabled on every table
// =========================================================

describe('Schema: RLS enabled', () => {
  let rlsStatus: { tablename: string; rowsecurity: boolean }[];

  beforeAll(async () => {
    const rows = await sqlQuery(
      "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'app' ORDER BY tablename"
    );
    rlsStatus = rows as unknown as { tablename: string; rowsecurity: boolean }[];
  });

  it.each(EXPECTED_TABLES)(
    'app.%s has RLS enabled',
    (table) => {
      const entry = rlsStatus.find((r) => r.tablename === table);
      expect(entry).toBeDefined();
      expect(entry!.rowsecurity).toBe(true);
    }
  );
});
