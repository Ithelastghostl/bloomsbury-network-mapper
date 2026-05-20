/**
 * profile-corpus.ts — Corpus profiling for Bloomsbury Network Mapper (F2.1-T1/T2/T3)
 *
 * Samples 600 documents from MKData/markdown/ with stratified random sampling
 * across years and registry number ranges, then computes structural and entity
 * density metrics. Outputs JSON profile + human-readable summary.
 *
 * Dependencies: Node built-ins only (fs, path, crypto).
 * Run: npx tsx scripts/profile-corpus.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

// ─── Config ────────────────────────────────────────────────────────────────
const CORPUS_DIR = path.resolve(__dirname, "../MKData/markdown");
const OUTPUT_JSON = path.resolve(__dirname, "../workspace/corpus-profile.json");
const SAMPLE_SIZE = 600;
const SEED = "bloomsbury-corpus-profile-2026";

// ─── Seeded PRNG (xorshift128+) ───────────────────────────────────────────
function createRng(seed: string) {
  const hash = crypto.createHash("sha256").update(seed).digest();
  let s0 = hash.readUInt32BE(0) >>> 0 || 1;
  let s1 = hash.readUInt32BE(4) >>> 0 || 1;
  return function next(): number {
    let a = s0;
    const b = s1;
    s0 = b;
    a ^= a << 23;
    a ^= a >>> 17;
    a ^= b;
    a ^= b >>> 26;
    s1 = a;
    return ((s0 + s1) >>> 0) / 0x100000000;
  };
}

// ─── Fisher-Yates shuffle with seeded RNG ─────────────────────────────────
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Parse filename ───────────────────────────────────────────────────────
function parseFilename(name: string): { registry: string; year: number } | null {
  const m = name.match(/^(\d+)_(\d{4})\.txt$/);
  if (!m) return null;
  return { registry: m[1], year: parseInt(m[2], 10) };
}

// ─── Stratified sampling ──────────────────────────────────────────────────
function stratifiedSample(
  files: string[],
  size: number,
  rng: () => number
): string[] {
  // Bucket by year
  const byYear = new Map<number, string[]>();
  for (const f of files) {
    const parsed = parseFilename(f);
    if (!parsed) continue;
    let bucket = byYear.get(parsed.year);
    if (!bucket) {
      bucket = [];
      byYear.set(parsed.year, bucket);
    }
    bucket.push(f);
  }

  // Proportional allocation per year, then shuffle within each bucket
  const years = [...byYear.keys()].sort();
  const totalParsed = [...byYear.values()].reduce((s, b) => s + b.length, 0);
  const selected: string[] = [];
  let remaining = size;

  for (let i = 0; i < years.length; i++) {
    const year = years[i];
    const bucket = byYear.get(year)!;
    const isLast = i === years.length - 1;
    const alloc = isLast
      ? remaining
      : Math.max(1, Math.round((bucket.length / totalParsed) * size));
    const take = Math.min(alloc, bucket.length, remaining);
    const shuffled = shuffle(bucket, rng);
    selected.push(...shuffled.slice(0, take));
    remaining -= take;
    if (remaining <= 0) break;
  }

  return shuffle(selected, rng);
}

// ─── Document type classification ─────────────────────────────────────────
type DocType =
  | "trustee_filing"
  | "financial_statement"
  | "annual_report"
  | "accounts_only"
  | "mixed"
  | "other";

function classifyDocument(content: string): DocType {
  const upper = content.toUpperCase();
  const hasTrustee =
    upper.includes("REPORT OF THE TRUSTEES") ||
    upper.includes("TRUSTEES' REPORT") ||
    upper.includes("TRUSTEES’ REPORT") ||
    upper.includes("TRUSTEES ANNUAL REPORT") ||
    upper.includes("TRUSTEES' ANNUAL REPORT") ||
    upper.includes("TRUSTEES’ ANNUAL REPORT");
  const hasSOFA =
    upper.includes("STATEMENT OF FINANCIAL ACTIVITIES") ||
    upper.includes("BALANCE SHEET");
  const hasAnnualReport = upper.includes("ANNUAL REPORT");
  const hasFinancialTables = /\|[^|]*£[^|]*\|/.test(content);

  if (hasTrustee && hasSOFA) return "mixed";
  if (hasTrustee) return "trustee_filing";
  if (hasSOFA) return "financial_statement";
  if (hasAnnualReport) return "annual_report";
  if (hasFinancialTables) return "accounts_only";
  return "other";
}

// ─── Entity density regexes ───────────────────────────────────────────────
const RE_PERSON_NAME = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4}\b/g;
const RE_MONETARY = /£[\d,]+(?:\.\d{1,2})?/g;
const RE_DATE =
  /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/gi;
const RE_CHARITY_NUMBER = /\b\d{7}\b/g;
const RE_POSTCODE = /\b[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}\b/gi;

function countMatches(text: string, re: RegExp): number {
  const m = text.match(re);
  return m ? m.length : 0;
}

// ─── Profile a single document ────────────────────────────────────────────
interface DocProfile {
  filename: string;
  registry: string;
  year: number;
  bytes: number;
  lines: number;
  chars: number;
  doc_type: DocType;
  format: {
    has_headers: boolean;
    has_tables: boolean;
    has_horizontal_rules: boolean;
    empty_line_pct: number;
    starts_with_charity_number: boolean;
  };
  entities: {
    person_names: number;
    monetary_amounts: number;
    dates: number;
    charity_numbers: number;
    addresses: number;
  };
}

function profileDocument(filename: string): DocProfile {
  const filepath = path.join(CORPUS_DIR, filename);
  const content = fs.readFileSync(filepath, "utf-8");
  const stat = fs.statSync(filepath);
  const lines = content.split("\n");
  const parsed = parseFilename(filename)!;
  const emptyLines = lines.filter((l) => l.trim() === "").length;

  return {
    filename,
    registry: parsed.registry,
    year: parsed.year,
    bytes: stat.size,
    lines: lines.length,
    chars: content.length,
    doc_type: classifyDocument(content),
    format: {
      has_headers: /^#{1,6}\s/m.test(content),
      has_tables: content.includes("|"),
      has_horizontal_rules: /^-{3,}$/m.test(content),
      empty_line_pct: lines.length > 0 ? (emptyLines / lines.length) * 100 : 0,
      starts_with_charity_number: content
        .trimStart()
        .startsWith("REGISTERED CHARITY NUMBER:"),
    },
    entities: {
      person_names: countMatches(content, RE_PERSON_NAME),
      monetary_amounts: countMatches(content, RE_MONETARY),
      dates: countMatches(content, RE_DATE),
      charity_numbers: countMatches(content, RE_CHARITY_NUMBER),
      addresses: countMatches(content, RE_POSTCODE),
    },
  };
}

// ─── Stats helpers ────────────────────────────────────────────────────────
function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function computeStats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(sum / sorted.length),
    median: Math.round(percentile(sorted, 50)),
    p95: Math.round(percentile(sorted, 95)),
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────
function main() {
  console.log("Bloomsbury Corpus Profiler");
  console.log("=".repeat(60));

  // List corpus
  const allFiles = fs.readdirSync(CORPUS_DIR).filter((f) => f.endsWith(".txt"));
  console.log(`\nCorpus: ${allFiles.length} files in ${CORPUS_DIR}`);

  // Stratified sample
  const rng = createRng(SEED);
  const sampled = stratifiedSample(allFiles, SAMPLE_SIZE, rng);
  console.log(`Sample: ${sampled.length} files (stratified by year, seed="${SEED}")\n`);

  // Profile each document
  console.log("Profiling documents...");
  const profiles: DocProfile[] = [];
  for (let i = 0; i < sampled.length; i++) {
    profiles.push(profileDocument(sampled[i]));
    if ((i + 1) % 100 === 0) {
      console.log(`  ${i + 1}/${sampled.length} processed`);
    }
  }
  console.log(`  ${profiles.length}/${sampled.length} processed\n`);

  // ── Aggregate stats ──────────────────────────────────────────────────
  const sizeStats = computeStats(profiles.map((p) => p.bytes));
  const lineStats = computeStats(profiles.map((p) => p.lines));
  const charStats = computeStats(profiles.map((p) => p.chars));

  // Year distribution
  const yearDist: Record<string, number> = {};
  for (const p of profiles) {
    yearDist[p.year] = (yearDist[p.year] || 0) + 1;
  }

  // Corpus-wide year distribution
  const corpusYearDist: Record<string, number> = {};
  for (const f of allFiles) {
    const parsed = parseFilename(f);
    if (parsed) corpusYearDist[parsed.year] = (corpusYearDist[parsed.year] || 0) + 1;
  }

  // Document types
  const docTypes: Record<string, number> = {};
  for (const p of profiles) {
    docTypes[p.doc_type] = (docTypes[p.doc_type] || 0) + 1;
  }

  // Format quality
  const formatQuality = {
    has_headers_pct: round2(
      (profiles.filter((p) => p.format.has_headers).length / profiles.length) * 100
    ),
    has_tables_pct: round2(
      (profiles.filter((p) => p.format.has_tables).length / profiles.length) * 100
    ),
    has_horizontal_rules_pct: round2(
      (profiles.filter((p) => p.format.has_horizontal_rules).length / profiles.length) * 100
    ),
    starts_with_charity_number_pct: round2(
      (profiles.filter((p) => p.format.starts_with_charity_number).length / profiles.length) * 100
    ),
    avg_empty_line_pct: round2(
      profiles.reduce((s, p) => s + p.format.empty_line_pct, 0) / profiles.length
    ),
  };

  // Entity density
  const entityDensity = {
    avg_person_names: round2(
      profiles.reduce((s, p) => s + p.entities.person_names, 0) / profiles.length
    ),
    avg_monetary_amounts: round2(
      profiles.reduce((s, p) => s + p.entities.monetary_amounts, 0) / profiles.length
    ),
    avg_dates: round2(
      profiles.reduce((s, p) => s + p.entities.dates, 0) / profiles.length
    ),
    avg_charity_numbers: round2(
      profiles.reduce((s, p) => s + p.entities.charity_numbers, 0) / profiles.length
    ),
    avg_addresses: round2(
      profiles.reduce((s, p) => s + p.entities.addresses, 0) / profiles.length
    ),
  };

  // ── Build output JSON ────────────────────────────────────────────────
  const report = {
    generated_at: new Date().toISOString(),
    sample_size: profiles.length,
    total_corpus: allFiles.length,
    year_distribution: Object.fromEntries(
      Object.entries(yearDist).sort(([a], [b]) => Number(a) - Number(b))
    ),
    corpus_year_distribution: Object.fromEntries(
      Object.entries(corpusYearDist).sort(([a], [b]) => Number(a) - Number(b))
    ),
    size_stats: {
      min_bytes: sizeStats.min,
      max_bytes: sizeStats.max,
      avg_bytes: sizeStats.avg,
      median_bytes: sizeStats.median,
      p95_bytes: sizeStats.p95,
    },
    line_stats: {
      min_lines: lineStats.min,
      max_lines: lineStats.max,
      avg_lines: lineStats.avg,
      median_lines: lineStats.median,
    },
    char_stats: {
      min_chars: charStats.min,
      max_chars: charStats.max,
      avg_chars: charStats.avg,
      median_chars: charStats.median,
    },
    document_types: Object.fromEntries(
      Object.entries(docTypes).sort(([, a], [, b]) => b - a)
    ),
    format_quality: formatQuality,
    entity_density: entityDensity,
    samples: profiles.map((p) => ({
      filename: p.filename,
      registry: p.registry,
      year: p.year,
      bytes: p.bytes,
      lines: p.lines,
      doc_type: p.doc_type,
      entities: p.entities,
    })),
  };

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2));
  console.log(`JSON report written to ${OUTPUT_JSON}\n`);

  // ── Human-readable summary ───────────────────────────────────────────
  console.log("=".repeat(60));
  console.log("CORPUS PROFILE SUMMARY");
  console.log("=".repeat(60));

  console.log(`\nTotal corpus files:  ${allFiles.length}`);
  console.log(`Sample size:         ${profiles.length}`);
  console.log(`Seed:                ${SEED}`);

  console.log("\n--- Size Statistics ---");
  console.log(`  Min:    ${fmtBytes(sizeStats.min)} (${sizeStats.min} bytes)`);
  console.log(`  Max:    ${fmtBytes(sizeStats.max)} (${sizeStats.max} bytes)`);
  console.log(`  Avg:    ${fmtBytes(sizeStats.avg)} (${sizeStats.avg} bytes)`);
  console.log(`  Median: ${fmtBytes(sizeStats.median)} (${sizeStats.median} bytes)`);
  console.log(`  P95:    ${fmtBytes(sizeStats.p95)} (${sizeStats.p95} bytes)`);

  console.log("\n--- Line Statistics ---");
  console.log(`  Min:    ${lineStats.min}`);
  console.log(`  Max:    ${lineStats.max}`);
  console.log(`  Avg:    ${lineStats.avg}`);
  console.log(`  Median: ${lineStats.median}`);

  console.log("\n--- Year Distribution (sample / corpus) ---");
  for (const yr of Object.keys(corpusYearDist).sort()) {
    const sampleN = yearDist[yr] || 0;
    const corpusN = corpusYearDist[yr] || 0;
    const samplePct = ((sampleN / profiles.length) * 100).toFixed(1);
    const corpusPct = ((corpusN / allFiles.length) * 100).toFixed(1);
    console.log(
      `  ${yr}:  ${String(sampleN).padStart(4)} (${samplePct}%)  /  ${String(corpusN).padStart(5)} (${corpusPct}%)`
    );
  }

  console.log("\n--- Document Type Distribution ---");
  const typeEntries = Object.entries(docTypes).sort(([, a], [, b]) => b - a);
  for (const [type, count] of typeEntries) {
    const pct = ((count / profiles.length) * 100).toFixed(1);
    console.log(`  ${type.padEnd(22)} ${String(count).padStart(4)}  (${pct}%)`);
  }

  console.log("\n--- Format Quality ---");
  console.log(`  Has markdown headers:         ${formatQuality.has_headers_pct}%`);
  console.log(`  Has tables:                   ${formatQuality.has_tables_pct}%`);
  console.log(`  Has horizontal rules:         ${formatQuality.has_horizontal_rules_pct}%`);
  console.log(
    `  Starts with charity number:   ${formatQuality.starts_with_charity_number_pct}%`
  );
  console.log(`  Avg empty line percentage:    ${formatQuality.avg_empty_line_pct}%`);

  console.log("\n--- Entity Density (averages per document) ---");
  console.log(`  Person name patterns:    ${entityDensity.avg_person_names}`);
  console.log(`  Monetary amounts:        ${entityDensity.avg_monetary_amounts}`);
  console.log(`  Date patterns:           ${entityDensity.avg_dates}`);
  console.log(`  Charity/company numbers: ${entityDensity.avg_charity_numbers}`);
  console.log(`  Address (postcode) pats: ${entityDensity.avg_addresses}`);

  // Entity density ranges
  const entityFields = [
    "person_names",
    "monetary_amounts",
    "dates",
    "charity_numbers",
    "addresses",
  ] as const;
  console.log("\n--- Entity Density Ranges ---");
  for (const field of entityFields) {
    const vals = profiles.map((p) => p.entities[field]).sort((a, b) => a - b);
    console.log(
      `  ${field.padEnd(22)} min=${vals[0]}  max=${vals[vals.length - 1]}  median=${vals[Math.floor(vals.length / 2)]}`
    );
  }

  // Top 5 largest
  const bySize = [...profiles].sort((a, b) => b.bytes - a.bytes);
  console.log("\n--- Top 5 Largest Files ---");
  for (const p of bySize.slice(0, 5)) {
    console.log(`  ${p.filename.padEnd(30)} ${fmtBytes(p.bytes).padStart(10)}  (${p.doc_type})`);
  }

  // Top 5 smallest
  console.log("\n--- Top 5 Smallest Files ---");
  for (const p of bySize.slice(-5).reverse()) {
    console.log(`  ${p.filename.padEnd(30)} ${fmtBytes(p.bytes).padStart(10)}  (${p.doc_type})`);
  }

  // Quality issues
  console.log("\n--- Quality Issues ---");
  const zeroEntity = profiles.filter(
    (p) =>
      p.entities.person_names === 0 &&
      p.entities.monetary_amounts === 0 &&
      p.entities.dates === 0
  );
  console.log(`  Files with 0 person names + 0 monetary + 0 dates: ${zeroEntity.length}`);
  if (zeroEntity.length > 0) {
    for (const p of zeroEntity.slice(0, 5)) {
      console.log(`    - ${p.filename} (${p.bytes} bytes, ${p.lines} lines)`);
    }
    if (zeroEntity.length > 5)
      console.log(`    ... and ${zeroEntity.length - 5} more`);
  }

  const veryShort = profiles.filter((p) => p.bytes < 500);
  console.log(`  Files under 500 bytes: ${veryShort.length}`);
  if (veryShort.length > 0) {
    for (const p of veryShort.slice(0, 5)) {
      console.log(`    - ${p.filename} (${p.bytes} bytes)`);
    }
  }

  const veryFewLines = profiles.filter((p) => p.lines < 10);
  console.log(`  Files under 10 lines: ${veryFewLines.length}`);
  if (veryFewLines.length > 0) {
    for (const p of veryFewLines.slice(0, 5)) {
      console.log(`    - ${p.filename} (${p.lines} lines)`);
    }
  }

  const noHeaders = profiles.filter((p) => !p.format.has_headers);
  console.log(`  Files without markdown headers: ${noHeaders.length}`);

  const noTables = profiles.filter((p) => !p.format.has_tables);
  console.log(`  Files without tables: ${noTables.length}`);

  console.log("\n" + "=".repeat(60));
  console.log("Done.");
}

// ─── Formatting helpers ───────────────────────────────────────────────────
function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

main();
