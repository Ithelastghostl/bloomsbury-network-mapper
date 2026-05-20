/**
 * select-gold-set.ts — Selects 100 documents for the gold annotation set.
 *
 * Selection is stratified by year, file size, and entity density.
 * Uses a deterministic seed for reproducibility.
 *
 * Usage: npx tsx scripts/select-gold-set.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ── Config ──────────────────────────────────────────────────────────
const SEED = 42;
const TARGET = 100;
const CORPUS_DIR = path.resolve(__dirname, "../MKData/markdown");
const PROFILE_PATH = path.resolve(
  __dirname,
  "../workspace/corpus-profile.json"
);
const OUT_DIR = path.resolve(__dirname, "../workspace/gold-set");
const ANNOTATIONS_DIR = path.join(OUT_DIR, "annotations");
const SCHEMA_PATH = path.join(OUT_DIR, "schema.json");
const MANIFEST_PATH = path.join(OUT_DIR, "manifest.json");

// ── Seeded PRNG (mulberry32) ────────────────────────────────────────
function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);

/** Shuffle array in place using Fisher-Yates with seeded PRNG. */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Types ───────────────────────────────────────────────────────────
interface ProfileSample {
  filename: string;
  registry: string;
  year: number;
  bytes: number;
  lines: number;
  doc_type: string;
  entities: {
    person_names: number;
    monetary_amounts: number;
    dates: number;
    charity_numbers: number;
    addresses: number;
  };
}

interface CorpusProfile {
  samples: ProfileSample[];
  corpus_year_distribution: Record<string, number>;
}

interface DocInfo {
  filename: string;
  registry: string;
  year: number;
  sizeBytes: number;
  sizeCategory: "small" | "medium" | "large";
  entityDensity: number; // total entity count from profile, or 0
  docType: string;
  profiled: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────
function parseFilename(filename: string): {
  registry: string;
  year: number;
} | null {
  const m = filename.match(/^(\d+)_(\d{4})\.txt$/);
  if (!m) return null;
  return { registry: m[1], year: parseInt(m[2], 10) };
}

function sizeCategory(bytes: number): "small" | "medium" | "large" {
  if (bytes < 50_000) return "small";
  if (bytes <= 150_000) return "medium";
  return "large";
}

function totalEntities(e: ProfileSample["entities"]): number {
  return (
    e.person_names +
    e.monetary_amounts +
    e.dates +
    e.charity_numbers +
    e.addresses
  );
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log("Reading corpus profile...");
  const profile: CorpusProfile = JSON.parse(
    fs.readFileSync(PROFILE_PATH, "utf-8")
  );

  // Build lookup from profile samples
  const profileMap = new Map<string, ProfileSample>();
  for (const s of profile.samples) {
    profileMap.set(s.filename, s);
  }

  console.log("Scanning corpus directory...");
  const allFiles = fs.readdirSync(CORPUS_DIR).filter((f) => f.endsWith(".txt"));
  console.log(`  Found ${allFiles.length} files`);

  // Build doc info for every file
  console.log("Gathering file metadata...");
  const docs: DocInfo[] = [];
  for (const filename of allFiles) {
    const parsed = parseFilename(filename);
    if (!parsed) continue;

    const filePath = path.join(CORPUS_DIR, filename);
    const stat = fs.statSync(filePath);
    const profiled = profileMap.get(filename);

    docs.push({
      filename,
      registry: parsed.registry,
      year: parsed.year,
      sizeBytes: stat.size,
      sizeCategory: sizeCategory(stat.size),
      entityDensity: profiled ? totalEntities(profiled.entities) : 0,
      docType: profiled ? profiled.doc_type : "unknown",
      profiled: !!profiled,
    });
  }

  console.log(`  Parsed ${docs.length} valid documents`);

  // ── Build lookup for quick access ──────────────────────────────────
  const docByName = new Map<string, DocInfo>();
  for (const d of docs) docByName.set(d.filename, d);

  const selected = new Set<string>();

  // Helper: rank candidates by entity density (profiled first, high density first)
  // then shuffle unprofiled for randomness
  function rankCandidates(pool: DocInfo[]): DocInfo[] {
    const profiled = pool
      .filter((d) => d.profiled)
      .sort((a, b) => b.entityDensity - a.entityDensity);
    const unprofiled = shuffle(pool.filter((d) => !d.profiled));
    return [...profiled, ...unprofiled];
  }

  // ── Step 1: Reserve priority doc-type slots ───────────────────────
  // Pick 5 financial_statement and up to 5 trustee_filing, spread across sizes
  for (const dtype of ["financial_statement", "trustee_filing"]) {
    const pool = shuffle(docs.filter((d) => d.docType === dtype));
    let count = 0;
    for (const d of pool) {
      if (count >= 5) break;
      selected.add(d.filename);
      count++;
    }
  }

  // ── Step 2: Stratified fill — year x size ─────────────────────────
  // Global targets: 25 small, 50 medium, 25 large across 100 docs
  // Year minimums: 10 per year (2019-2024), up to 10 for 2025
  const years = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
  const sizeCategories: Array<"small" | "medium" | "large"> = [
    "small",
    "medium",
    "large",
  ];
  const sizeTargets: Record<string, number> = {
    small: 25,
    medium: 50,
    large: 25,
  };

  // Track counts
  function yearCount(year: number): number {
    let c = 0;
    for (const fn of selected) {
      if (docByName.get(fn)!.year === year) c++;
    }
    return c;
  }
  function sizeCount(cat: string): number {
    let c = 0;
    for (const fn of selected) {
      if (docByName.get(fn)!.sizeCategory === cat) c++;
    }
    return c;
  }

  // Build year buckets with size sub-buckets
  const yearSizeBuckets = new Map<string, DocInfo[]>();
  for (const y of years) {
    for (const sz of sizeCategories) {
      const key = `${y}_${sz}`;
      const pool = docs.filter(
        (d) => d.year === y && d.sizeCategory === sz && !selected.has(d.filename)
      );
      yearSizeBuckets.set(key, rankCandidates(pool));
    }
  }

  function pickFrom(key: string): DocInfo | null {
    const bucket = yearSizeBuckets.get(key);
    if (!bucket) return null;
    while (bucket.length > 0) {
      const d = bucket.shift()!;
      if (!selected.has(d.filename)) return d;
    }
    return null;
  }

  // Phase A: Fill year minimums, distributing across sizes proportionally
  // For each year needing 10: target 2-3 small, 5 medium, 2-3 large
  for (const year of years) {
    const minNeeded = year === 2025 ? 0 : 10;
    const alreadyHave = yearCount(year);
    const toAdd = Math.max(0, minNeeded - alreadyHave);
    if (toAdd === 0) continue;

    // Proportional size targets for this year's fill
    const yearSizeGoals = { small: 2, medium: 5, large: 3 };
    // Adjust for what we already have from priority picks
    for (const fn of selected) {
      const d = docByName.get(fn)!;
      if (d.year === year) {
        const cat = d.sizeCategory;
        if (yearSizeGoals[cat] > 0) yearSizeGoals[cat]--;
      }
    }

    // Fill each size target
    let added = 0;
    for (const sz of sizeCategories) {
      const key = `${year}_${sz}`;
      let szGoal = yearSizeGoals[sz];
      while (szGoal > 0 && added < toAdd) {
        const d = pickFrom(key);
        if (!d) break;
        selected.add(d.filename);
        added++;
        szGoal--;
      }
    }

    // If still short (some size buckets exhausted), fill from any size
    for (const sz of sizeCategories) {
      if (added >= toAdd) break;
      const key = `${year}_${sz}`;
      while (added < toAdd) {
        const d = pickFrom(key);
        if (!d) break;
        selected.add(d.filename);
        added++;
      }
    }
  }

  // Phase B: Fill remaining slots to hit global size targets
  // Determine which size categories need more
  while (selected.size < TARGET) {
    let added = false;
    for (const sz of sizeCategories) {
      if (selected.size >= TARGET) break;
      const current = sizeCount(sz);
      if (current >= sizeTargets[sz]) continue;

      // Find a candidate from any year, prefer years with fewer picks
      // Respect year caps: 2025 max 10, others max 20
      const maxForYear = (y: number) => (y === 2025 ? 10 : 20);
      const yearsByCount = [...years]
        .filter((y) => yearCount(y) < maxForYear(y))
        .sort((a, b) => yearCount(a) - yearCount(b));
      for (const y of yearsByCount) {
        const key = `${y}_${sz}`;
        const d = pickFrom(key);
        if (d) {
          selected.add(d.filename);
          added = true;
          break;
        }
      }
    }
    // If all size targets met or no candidates, fill freely
    if (!added) {
      const maxForYear = (y: number) => (y === 2025 ? 10 : 20);
      const remaining = rankCandidates(
        docs.filter(
          (d) =>
            !selected.has(d.filename) &&
            yearCount(d.year) < maxForYear(d.year)
        )
      );
      if (remaining.length === 0) break;
      selected.add(remaining[0].filename);
    }
  }

  // ── Step 5: Verify content ────────────────────────────────────────
  console.log("Verifying selected documents have content...");
  const verified: DocInfo[] = [];
  const rejected: string[] = [];

  for (const fn of selected) {
    const filePath = path.join(CORPUS_DIR, fn);
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(200);
    const bytesRead = fs.readSync(fd, buf, 0, 200, 0);
    fs.closeSync(fd);

    const content = buf.toString("utf-8", 0, bytesRead).trim();
    if (content.length < 10) {
      rejected.push(fn);
      continue;
    }
    verified.push(docs.find((d) => d.filename === fn)!);
  }

  if (rejected.length > 0) {
    console.log(`  Rejected ${rejected.length} docs with insufficient content`);
  }

  // Backfill if any were rejected
  if (verified.length < TARGET) {
    const backfillPool = shuffle(
      docs.filter(
        (d) => !selected.has(d.filename) && !rejected.includes(d.filename)
      )
    );
    for (const d of backfillPool) {
      if (verified.length >= TARGET) break;
      const filePath = path.join(CORPUS_DIR, d.filename);
      const fd = fs.openSync(filePath, "r");
      const buf = Buffer.alloc(200);
      const bytesRead = fs.readSync(fd, buf, 0, 200, 0);
      fs.closeSync(fd);
      const content = buf.toString("utf-8", 0, bytesRead).trim();
      if (content.length >= 10) {
        verified.push(d);
      }
    }
  }

  console.log(`  Verified ${verified.length} documents`);

  // ── Step 6: Write manifest ────────────────────────────────────────
  // Sort by filename for stable output
  verified.sort((a, b) => a.filename.localeCompare(b.filename));

  const manifest = {
    selected_at: new Date().toISOString(),
    total_selected: verified.length,
    selection_criteria: "stratified by year, size, entity density",
    documents: verified.map((d) => ({
      filename: d.filename,
      registry_number: d.registry,
      year: d.year,
      size_bytes: d.sizeBytes,
      path: `MKData/markdown/${d.filename}`,
    })),
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Manifest written to ${MANIFEST_PATH}`);

  // ── Step 7: Write annotation stubs ────────────────────────────────
  // Clean stale stubs from prior runs
  fs.mkdirSync(ANNOTATIONS_DIR, { recursive: true });
  for (const existing of fs.readdirSync(ANNOTATIONS_DIR)) {
    fs.unlinkSync(path.join(ANNOTATIONS_DIR, existing));
  }

  for (const d of verified) {
    const stub = {
      metadata: {
        document_id: d.filename,
        annotator: "",
        annotation_date: "",
        document_type: d.docType,
        quality_notes: "",
      },
      entities: [],
      relationships: [],
      donations: [],
    };
    const stubPath = path.join(ANNOTATIONS_DIR, `${d.filename}.json`);
    fs.writeFileSync(stubPath, JSON.stringify(stub, null, 2) + "\n");
  }
  console.log(
    `Wrote ${verified.length} annotation stubs to ${ANNOTATIONS_DIR}`
  );

  // ── Summary ───────────────────────────────────────────────────────
  const yearDist: Record<number, number> = {};
  const sizeDist: Record<string, number> = { small: 0, medium: 0, large: 0 };
  const typeDist: Record<string, number> = {};

  for (const d of verified) {
    yearDist[d.year] = (yearDist[d.year] || 0) + 1;
    sizeDist[d.sizeCategory]++;
    typeDist[d.docType] = (typeDist[d.docType] || 0) + 1;
  }

  console.log("\n=== Selection Summary ===");
  console.log(`Total: ${verified.length}`);
  console.log("By year:", JSON.stringify(yearDist));
  console.log("By size:", JSON.stringify(sizeDist));
  console.log("By type:", JSON.stringify(typeDist));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
