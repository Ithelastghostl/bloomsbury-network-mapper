import { readFileSync } from "fs";
import { resolve } from "path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { ulid } from "ulid";

// Load env from web/.env.local
const PROJECT_ROOT = resolve(import.meta.dirname, "..");
config({ path: resolve(PROJECT_ROOT, "web", ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in web/.env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: { schema: "app" },
});

const BATCH_SIZE = 500;

// --- Classification heuristics ---

type DocType =
  | "trustee_filing"
  | "financial_statement"
  | "annual_report"
  | "accounts_only"
  | "mixed"
  | "unsupported";

const TRUSTEE_PATTERNS = [
  /report\s+of\s+the\s+trustees/i,
  /trustees[''’]?\s*report/i,
  /trustees\s+annual\s+report/i,
];

const FINANCIAL_PATTERNS = [
  /statement\s+of\s+financial\s+activities/i,
  /balance\s+sheet/i,
];

const ANNUAL_REPORT_PATTERN = /annual\s+report/i;

// Heuristic: financial tables have multiple currency figures
const FINANCIAL_TABLE_PATTERN = /[£$]\s*[\d,]+/g;

function classify(content: string): DocType {
  const hasTrusteeKeywords = TRUSTEE_PATTERNS.some((p) => p.test(content));
  const hasFinancialKeywords = FINANCIAL_PATTERNS.some((p) => p.test(content));
  const hasAnnualReport = ANNUAL_REPORT_PATTERN.test(content);
  const financialFigures = content.match(FINANCIAL_TABLE_PATTERN);
  const hasFinancialTables = (financialFigures?.length ?? 0) >= 3;

  // Narrative heuristic: more than 500 chars of non-table text suggests narrative content
  const lines = content.split("\n");
  const narrativeLines = lines.filter(
    (l) => l.length > 80 && !l.includes("|") && !l.includes("---")
  );
  const hasNarrative = narrativeLines.length >= 5;

  if (hasTrusteeKeywords && hasFinancialKeywords) {
    // Classic trustee filing with financial statements
    return "trustee_filing";
  }

  if (hasTrusteeKeywords && hasAnnualReport && hasFinancialKeywords) {
    return "trustee_filing";
  }

  // Mixed: has elements of multiple types
  if (hasTrusteeKeywords && hasAnnualReport) {
    return "mixed";
  }

  if (hasFinancialKeywords && !hasTrusteeKeywords) {
    return "financial_statement";
  }

  if (hasAnnualReport && !hasTrusteeKeywords && !hasFinancialKeywords) {
    if (hasFinancialTables) {
      return "mixed";
    }
    return "annual_report";
  }

  if (hasFinancialTables && !hasNarrative) {
    return "accounts_only";
  }

  if (hasFinancialTables && hasNarrative) {
    return "mixed";
  }

  if (content.trim().length < 100) {
    return "unsupported";
  }

  return "unsupported";
}

async function ensureClassificationRun(): Promise<string> {
  const RUN_ID = "classification-v1.0";

  // Check if it already exists (idempotent)
  const { data } = await supabase
    .from("runs")
    .select("run_id")
    .eq("run_id", RUN_ID)
    .limit(1);

  if (data && data.length > 0) {
    return RUN_ID;
  }

  const { error } = await supabase.from("runs").insert({
    run_id: RUN_ID,
    corpus_version: "v1.0",
    schema_version: "1",
    extraction_prompt_versions: {},
    graph_build_version: "n/a",
    identity_resolution_version: "n/a",
    scoring_config_version: "n/a",
    status: "completed",
  });

  if (error) {
    throw new Error(`Failed to create classification run: ${error.message}`);
  }
  return RUN_ID;
}

async function main() {
  const runId = await ensureClassificationRun();
  console.log(`Using run_id: ${runId}`);

  // Fetch all unclassified documents
  console.log("Fetching unclassified documents...");
  let allDocs: { document_id: string; storage_uri: string }[] = [];
  let from = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("documents")
      .select("document_id, storage_uri")
      .eq("document_type", "unclassified")
      .range(from, from + PAGE - 1);

    if (error) {
      throw new Error(`Failed to fetch documents: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    allDocs = allDocs.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  console.log(`Found ${allDocs.length} unclassified documents`);
  if (allDocs.length === 0) {
    console.log("Nothing to classify.");
    return;
  }

  const counts: Record<string, number> = {};
  let quarantined = 0;
  let processed = 0;
  let readErrors = 0;

  // Process in batches for DB updates
  for (let i = 0; i < allDocs.length; i += BATCH_SIZE) {
    const batch = allDocs.slice(i, i + BATCH_SIZE);
    const updates: { document_id: string; docType: DocType }[] = [];
    const quarantineRows: {
      quarantine_id: string;
      run_id: string;
      source_phase: string;
      source_record: Record<string, unknown>;
      reason_code: string;
      details: string;
    }[] = [];

    for (const doc of batch) {
      const filePath = resolve(PROJECT_ROOT, doc.storage_uri);
      let content: string;
      try {
        content = readFileSync(filePath, "utf-8");
      } catch {
        // File not readable -- quarantine
        updates.push({ document_id: doc.document_id, docType: "unsupported" });
        quarantineRows.push({
          quarantine_id: ulid(),
          run_id: runId,
          source_phase: "classification",
          source_record: { document_id: doc.document_id, storage_uri: doc.storage_uri },
          reason_code: "file_not_readable",
          details: `Could not read file: ${doc.storage_uri}`,
        });
        readErrors++;
        continue;
      }

      const docType = classify(content);
      updates.push({ document_id: doc.document_id, docType });

      if (docType === "unsupported") {
        quarantineRows.push({
          quarantine_id: ulid(),
          run_id: runId,
          source_phase: "classification",
          source_record: { document_id: doc.document_id, storage_uri: doc.storage_uri },
          reason_code: "unsupported_document_type",
          details: `Document did not match any classification pattern`,
        });
      }
    }

    // Update document types -- one update per type to minimise round-trips
    const byType = new Map<string, string[]>();
    for (const u of updates) {
      const ids = byType.get(u.docType) ?? [];
      ids.push(u.document_id);
      byType.set(u.docType, ids);
    }

    for (const [docType, ids] of byType) {
      const { error } = await supabase
        .from("documents")
        .update({ document_type: docType })
        .in("document_id", ids);

      if (error) {
        console.error(`Failed to update ${ids.length} docs to ${docType}: ${error.message}`);
      } else {
        counts[docType] = (counts[docType] ?? 0) + ids.length;
      }
    }

    // Insert quarantine rows (skip on conflict via upsert on quarantine_id)
    if (quarantineRows.length > 0) {
      const { error } = await supabase
        .from("quarantine")
        .upsert(quarantineRows, { onConflict: "quarantine_id", ignoreDuplicates: true });

      if (error) {
        console.error(`Failed to insert quarantine rows: ${error.message}`);
      } else {
        quarantined += quarantineRows.length;
      }
    }

    processed += batch.length;
    if (processed % 1000 === 0 || processed === allDocs.length) {
      console.log(`Progress: ${processed}/${allDocs.length} classified`);
    }
  }

  console.log("\n=== Classification Summary ===");
  console.log(`Total classified:  ${processed}`);
  for (const [type, count] of Object.entries(counts).sort()) {
    console.log(`  ${type}: ${count}`);
  }
  console.log(`Quarantined:       ${quarantined}`);
  if (readErrors > 0) {
    console.log(`File read errors:  ${readErrors}`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
