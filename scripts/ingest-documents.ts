import { readFileSync, writeFileSync, statSync, mkdirSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { ulid } from "ulid";

const PROJECT_ROOT = join(import.meta.dirname, "..");
const MANIFEST_PATH = join(PROJECT_ROOT, "workspace", "corpus-manifest.json");
const OUTPUT_DIR = join(PROJECT_ROOT, "workspace");
const OUTPUT_PATH = join(OUTPUT_DIR, "documents-seed.jsonl");

const PLACEHOLDER_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // SHA-256 of empty

// Read manifest
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
const files: Array<{
  filename: string;
  registry_number: string;
  year: number;
  relative_path: string;
  size_bytes: number;
}> = manifest.files;

console.log(`Read manifest: ${files.length} files`);

// Process each file into a document record
const lines: string[] = [];
const yearCounts: Record<string, number> = {};
const registryCounts: Record<string, number> = {};

for (const entry of files) {
  const absPath = join(PROJECT_ROOT, entry.relative_path);
  let contentHash: string;

  if (entry.size_bytes === 0) {
    contentHash = PLACEHOLDER_HASH;
  } else {
    const content = readFileSync(absPath);
    contentHash = createHash("sha256").update(content).digest("hex");
  }

  const doc = {
    document_id: ulid(),
    source: "charity_commission",
    document_type: "trustee_filing",
    content_hash: contentHash,
    storage_uri: entry.relative_path,
    year: entry.year,
    metadata: {
      registry_number: entry.registry_number,
      original_filename: entry.filename,
    },
  };

  lines.push(JSON.stringify(doc));

  const yk = String(entry.year);
  yearCounts[yk] = (yearCounts[yk] || 0) + 1;
  registryCounts[entry.registry_number] = (registryCounts[entry.registry_number] || 0) + 1;
}

// Write JSONL
mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(OUTPUT_PATH, lines.join("\n") + "\n");

// Print summary
console.log("\n=== Document Seed Summary ===");
console.log(`Total documents:    ${lines.length}`);
console.log(`Unique registries:  ${Object.keys(registryCounts).length}`);
console.log("\nBy year:");
for (const [year, count] of Object.entries(yearCounts).sort()) {
  console.log(`  ${year}: ${count}`);
}
console.log(`\nSeed written to: ${OUTPUT_PATH}`);
