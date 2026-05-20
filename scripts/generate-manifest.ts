import { readdirSync, statSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const CORPUS_DIR = "MKData/markdown/";
const PROJECT_ROOT = join(import.meta.dirname, "..");
const ABS_CORPUS = join(PROJECT_ROOT, CORPUS_DIR);
const OUTPUT_DIR = join(PROJECT_ROOT, "workspace");
const OUTPUT_PATH = join(OUTPUT_DIR, "corpus-manifest.json");

// Read and parse filenames
const entries = readdirSync(ABS_CORPUS)
  .filter((f) => f.endsWith(".txt"))
  .map((filename) => {
    const match = filename.match(/^(\d+)_(\d{4})\.txt$/);
    if (!match) {
      console.warn(`Skipping unrecognized filename: ${filename}`);
      return null;
    }
    const relativePath = join(CORPUS_DIR, filename);
    const size = statSync(join(ABS_CORPUS, filename)).size;
    return {
      filename,
      registry_number: match[1],
      year: Number(match[2]),
      relative_path: relativePath,
      size_bytes: size,
    };
  })
  .filter(Boolean) as Array<{
  filename: string;
  registry_number: string;
  year: number;
  relative_path: string;
  size_bytes: number;
}>;

// Sort by registry number then year
entries.sort((a, b) =>
  a.registry_number === b.registry_number
    ? a.year - b.year
    : a.registry_number.localeCompare(b.registry_number, undefined, { numeric: true }),
);

// Compute aggregates
const uniqueRegistries = new Set(entries.map((e) => e.registry_number));
const years = entries.map((e) => e.year);
const yearDist: Record<string, number> = {};
for (const y of years) {
  yearDist[String(y)] = (yearDist[String(y)] || 0) + 1;
}

const registryCounts: Record<string, number> = {};
for (const e of entries) {
  registryCounts[e.registry_number] = (registryCounts[e.registry_number] || 0) + 1;
}
const top10 = Object.entries(registryCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

const manifest = {
  generated_at: new Date().toISOString(),
  corpus_dir: CORPUS_DIR,
  total_files: entries.length,
  unique_registries: uniqueRegistries.size,
  year_range: { min: Math.min(...years), max: Math.max(...years) },
  year_distribution: yearDist,
  files: entries,
};

// Write manifest
mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(OUTPUT_PATH, JSON.stringify(manifest, null, 2));

// Print summary
console.log("=== Corpus Manifest Summary ===");
console.log(`Total files:        ${manifest.total_files}`);
console.log(`Unique registries:  ${manifest.unique_registries}`);
console.log(`Year range:         ${manifest.year_range.min}–${manifest.year_range.max}`);
console.log("\nYear distribution:");
for (const [year, count] of Object.entries(yearDist).sort()) {
  console.log(`  ${year}: ${count}`);
}
console.log("\nTop 10 registries by file count:");
for (const [reg, count] of top10) {
  console.log(`  ${reg}: ${count} files`);
}
console.log(`\nManifest written to: ${OUTPUT_PATH}`);
