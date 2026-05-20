import { readFileSync } from "fs";
import { resolve } from "path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

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

const SEED_PATH = resolve(PROJECT_ROOT, "workspace", "documents-seed.jsonl");
const BATCH_SIZE = 500;
const CORPUS_VERSION = "v1.0";

interface SeedRecord {
  document_id: string;
  source: string;
  document_type: string;
  content_hash: string;
  storage_uri: string;
  year: number;
  metadata: Record<string, unknown>;
}

async function main() {
  console.log("Reading seed file...");
  const raw = readFileSync(SEED_PATH, "utf-8").trim();
  const lines = raw.split("\n");
  console.log(`Loaded ${lines.length} records from seed file`);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < lines.length; i += BATCH_SIZE) {
    const batch = lines.slice(i, i + BATCH_SIZE);
    const rows = batch.map((line) => {
      const rec: SeedRecord = JSON.parse(line);
      return {
        document_id: rec.document_id,
        corpus_version: CORPUS_VERSION,
        source: rec.source,
        document_type: "unclassified",
        content_hash: rec.content_hash,
        storage_uri: rec.storage_uri,
        year: rec.year,
        metadata: rec.metadata,
      };
    });

    const { data, error } = await supabase
      .from("documents")
      .upsert(rows, { onConflict: "content_hash", ignoreDuplicates: true })
      .select("document_id");

    if (error) {
      console.error(`Batch starting at ${i} failed: ${error.message}`);
      errors += batch.length;
    } else {
      const batchInserted = data?.length ?? 0;
      inserted += batchInserted;
      skipped += batch.length - batchInserted;
    }

    const processed = Math.min(i + BATCH_SIZE, lines.length);
    if (processed % 1000 === 0 || processed === lines.length) {
      console.log(`Progress: ${processed}/${lines.length} processed (inserted=${inserted}, skipped=${skipped}, errors=${errors})`);
    }
  }

  console.log("\n=== Ingestion Summary ===");
  console.log(`Total records:  ${lines.length}`);
  console.log(`Inserted:       ${inserted}`);
  console.log(`Skipped (dups): ${skipped}`);
  console.log(`Errors:         ${errors}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
