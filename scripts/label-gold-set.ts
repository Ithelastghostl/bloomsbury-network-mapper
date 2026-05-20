/**
 * label-gold-set.ts — Auto-label gold set documents using Claude.
 *
 * Reads the manifest, sends each document to Claude for entity/relationship/donation
 * extraction, validates against the gold set schema, and writes annotations.
 *
 * Usage:
 *   npx tsx scripts/label-gold-set.ts              # label all 100 documents
 *   npx tsx scripts/label-gold-set.ts --dry-run    # label only the first 3
 *   npx tsx scripts/label-gold-set.ts --resume     # skip already-labelled documents
 */

import * as fs from "node:fs";
import * as path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

// ── Paths ──────────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "workspace/gold-set/manifest.json");
const SCHEMA_PATH = path.join(ROOT, "workspace/gold-set/schema.json");
const ANNOTATIONS_DIR = path.join(ROOT, "workspace/gold-set/annotations");
const SUMMARY_PATH = path.join(ROOT, "workspace/gold-set/labelling-summary.json");
const MARKDOWN_DIR = path.join(ROOT, "MKData/markdown");

// ── Config ─────────────────────────────────────────────────────────
const MODEL = "claude-sonnet-4-20250514";
const MAX_CONTENT_CHARS = 100_000;
const DRY_RUN_LIMIT = 3;

// Pricing per 1M tokens (Sonnet 4 / claude-sonnet-4-20250514)
const INPUT_COST_PER_M = 3.0;
const OUTPUT_COST_PER_M = 15.0;

// ── Types ──────────────────────────────────────────────────────────
interface ManifestDoc {
  filename: string;
  registry_number: string;
  year: number;
  size_bytes: number;
  path: string;
}

interface Manifest {
  selected_at: string;
  total_selected: number;
  selection_criteria: string;
  documents: ManifestDoc[];
}

interface LabelResult {
  filename: string;
  success: boolean;
  entities: number;
  relationships: number;
  donations: number;
  input_tokens: number;
  output_tokens: number;
  error?: string;
}

interface LabellingSummary {
  labelled_at: string;
  model: string;
  total_documents: number;
  labelled: number;
  skipped: number;
  failed: number;
  errors: { filename: string; error: string }[];
  avg_entities_per_doc: Record<string, number>;
  avg_relationships_per_doc: number;
  avg_donations_per_doc: number;
  total_input_tokens: number;
  total_output_tokens: number;
  estimated_cost_usd: number;
}

// ── CLI flags ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const resume = args.includes("--resume");

// ── Helpers ────────────────────────────────────────────────────────

function buildPrompt(schema: object, docContent: string, filename: string): string {
  return `You are an expert document annotator for UK charity filings. Your task is to extract structured information from the following document and return a JSON object that conforms exactly to the provided schema.

## Schema
\`\`\`json
${JSON.stringify(schema, null, 2)}
\`\`\`

## Rules
1. Extract ALL entities: persons, organisations, addresses, registration numbers, dates, and monetary amounts.
2. For each entity, provide the exact raw_value as it appears in the text, a normalised_value (cleaned/standardised form), and the character offsets (span_start, span_end) where the entity appears. The evidence_span should be a surrounding sentence or phrase giving context.
3. Assign sequential entity_id values: E1, E2, E3, etc.
4. Extract ALL relationships between entities. Use the entity_id references. Assign R1, R2, R3, etc.
5. Extract ALL donation events. Use entity_id references for donor and recipient. Assign D1, D2, D3, etc.
6. Rate confidence for each relationship from 0 to 1.
7. For the metadata:
   - document_id: "${filename}"
   - annotator: "claude-sonnet-4-auto"
   - annotation_date: "${new Date().toISOString().slice(0, 10)}"
   - document_type: infer from content (e.g., "mixed", "financial_statement", "trustee_filing", "accounts_only")
   - quality_notes: note any issues (truncation, poor OCR, missing sections)
8. For monetary amounts, include currency attribute (default "GBP").
9. For dates, include date_format attribute.
10. For persons, include role attribute when identifiable.
11. For organisations, include charity_number and/or company_number when present.
12. Be thorough: extract every entity you can find. It is better to over-extract than to miss entities.

## Document (filename: ${filename})
\`\`\`
${docContent}
\`\`\`

Return ONLY a valid JSON object matching the schema. No markdown fences, no explanation, just JSON.`;
}

function hasExistingAnnotation(filename: string): boolean {
  const annotationPath = path.join(ANNOTATIONS_DIR, `${filename}.json`);
  if (!fs.existsSync(annotationPath)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(annotationPath, "utf-8"));
    return (
      data.entities?.length > 0 ||
      data.relationships?.length > 0 ||
      data.donations?.length > 0
    );
  } catch {
    return false;
  }
}

function validateAnnotation(annotation: any): string[] {
  const errors: string[] = [];
  if (!annotation.metadata) errors.push("missing metadata");
  if (!Array.isArray(annotation.entities)) errors.push("missing entities array");
  if (!Array.isArray(annotation.relationships)) errors.push("missing relationships array");
  if (!Array.isArray(annotation.donations)) errors.push("missing donations array");

  if (annotation.metadata) {
    if (!annotation.metadata.document_id) errors.push("missing metadata.document_id");
    if (!annotation.metadata.annotator) errors.push("missing metadata.annotator");
    if (!annotation.metadata.annotation_date) errors.push("missing metadata.annotation_date");
    if (!annotation.metadata.document_type) errors.push("missing metadata.document_type");
  }

  const entityIds = new Set<string>();
  if (Array.isArray(annotation.entities)) {
    for (const e of annotation.entities) {
      if (!e.entity_id) errors.push("entity missing entity_id");
      else entityIds.add(e.entity_id);
      if (!e.entity_type) errors.push(`entity ${e.entity_id || "?"} missing entity_type`);
      const validTypes = ["person", "organisation", "address", "registration_number", "date", "monetary_amount"];
      if (e.entity_type && !validTypes.includes(e.entity_type)) {
        errors.push(`entity ${e.entity_id || "?"} invalid type: ${e.entity_type}`);
      }
    }
  }

  if (Array.isArray(annotation.relationships)) {
    for (const r of annotation.relationships) {
      if (r.source_entity_id && !entityIds.has(r.source_entity_id)) {
        errors.push(`relationship ${r.relationship_id || "?"} references unknown source: ${r.source_entity_id}`);
      }
      if (r.target_entity_id && !entityIds.has(r.target_entity_id)) {
        errors.push(`relationship ${r.relationship_id || "?"} references unknown target: ${r.target_entity_id}`);
      }
    }
  }

  if (Array.isArray(annotation.donations)) {
    for (const d of annotation.donations) {
      if (d.donor_entity_id && !entityIds.has(d.donor_entity_id)) {
        errors.push(`donation ${d.donation_id || "?"} references unknown donor: ${d.donor_entity_id}`);
      }
      if (d.recipient_entity_id && !entityIds.has(d.recipient_entity_id)) {
        errors.push(`donation ${d.donation_id || "?"} references unknown recipient: ${d.recipient_entity_id}`);
      }
    }
  }

  return errors;
}

function countEntitiesByType(entities: any[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of entities) {
    const t = e.entity_type || "unknown";
    counts[t] = (counts[t] || 0) + 1;
  }
  return counts;
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  // Check API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "check") {
    console.error("ERROR: ANTHROPIC_API_KEY environment variable is not set.");
    console.error("");
    console.error("To run this script:");
    console.error("  export ANTHROPIC_API_KEY='your-api-key-here'");
    console.error("  npx tsx scripts/label-gold-set.ts --dry-run");
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });

  // Load manifest and schema
  const manifest: Manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf-8"));

  let docs = manifest.documents;
  if (dryRun) {
    docs = docs.slice(0, DRY_RUN_LIMIT);
    console.log(`[dry-run] Processing ${docs.length} of ${manifest.total_selected} documents\n`);
  } else {
    console.log(`Processing ${docs.length} documents\n`);
  }

  const results: LabelResult[] = [];
  let skipped = 0;

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const progress = `[${i + 1}/${docs.length}]`;

    // Resume: skip documents that already have annotations
    if (resume && hasExistingAnnotation(doc.filename)) {
      console.log(`${progress} SKIP ${doc.filename} (already annotated)`);
      skipped++;
      continue;
    }

    console.log(`${progress} Labelling ${doc.filename} (${(doc.size_bytes / 1024).toFixed(0)} KB)...`);

    // Read document content
    const docPath = path.join(MARKDOWN_DIR, doc.filename);
    if (!fs.existsSync(docPath)) {
      const errMsg = `File not found: ${docPath}`;
      console.log(`  ERROR: ${errMsg}`);
      results.push({
        filename: doc.filename,
        success: false,
        entities: 0,
        relationships: 0,
        donations: 0,
        input_tokens: 0,
        output_tokens: 0,
        error: errMsg,
      });
      continue;
    }

    let content = fs.readFileSync(docPath, "utf-8");
    let truncated = false;
    if (content.length > MAX_CONTENT_CHARS) {
      content = content.slice(0, MAX_CONTENT_CHARS);
      truncated = true;
      console.log(`  Truncated from ${doc.size_bytes} bytes to ${MAX_CONTENT_CHARS} chars`);
    }

    // Build prompt
    const prompt = buildPrompt(schema, content, doc.filename);

    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      });

      // Extract text from response
      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );
      if (!textBlock) {
        throw new Error("No text block in response");
      }

      // Parse JSON — strip any markdown fences if present
      let jsonText = textBlock.text.trim();
      if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }

      const annotation = JSON.parse(jsonText);

      // Add truncation note if needed
      if (truncated && annotation.metadata) {
        const note = annotation.metadata.quality_notes || "";
        annotation.metadata.quality_notes = note
          ? `${note}; Document truncated at ${MAX_CONTENT_CHARS} chars.`
          : `Document truncated at ${MAX_CONTENT_CHARS} chars.`;
      }

      // Validate
      const validationErrors = validateAnnotation(annotation);
      if (validationErrors.length > 0) {
        console.log(`  Validation warnings: ${validationErrors.join("; ")}`);
      }

      // Write annotation
      const annotationPath = path.join(ANNOTATIONS_DIR, `${doc.filename}.json`);
      fs.writeFileSync(annotationPath, JSON.stringify(annotation, null, 2) + "\n");

      const entityCount = annotation.entities?.length || 0;
      const relCount = annotation.relationships?.length || 0;
      const donCount = annotation.donations?.length || 0;

      console.log(
        `  OK: ${entityCount} entities, ${relCount} relationships, ${donCount} donations` +
          ` (${response.usage.input_tokens} in / ${response.usage.output_tokens} out)`
      );

      results.push({
        filename: doc.filename,
        success: true,
        entities: entityCount,
        relationships: relCount,
        donations: donCount,
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      });
    } catch (err: any) {
      const errMsg = err instanceof Anthropic.APIError
        ? `API ${err.status}: ${err.message}`
        : err.message || String(err);

      console.log(`  ERROR: ${errMsg}`);
      results.push({
        filename: doc.filename,
        success: false,
        entities: 0,
        relationships: 0,
        donations: 0,
        input_tokens: 0,
        output_tokens: 0,
        error: errMsg,
      });
    }
  }

  // ── Summary ────────────────────────────────────────────────────
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  // Entity type averages
  const entityTypeTotals: Record<string, number> = {};
  for (const r of successful) {
    const annotationPath = path.join(ANNOTATIONS_DIR, `${r.filename}.json`);
    try {
      const ann = JSON.parse(fs.readFileSync(annotationPath, "utf-8"));
      const counts = countEntitiesByType(ann.entities || []);
      for (const [t, c] of Object.entries(counts)) {
        entityTypeTotals[t] = (entityTypeTotals[t] || 0) + c;
      }
    } catch {
      // skip if can't read
    }
  }

  const avgEntities: Record<string, number> = {};
  if (successful.length > 0) {
    for (const [t, total] of Object.entries(entityTypeTotals)) {
      avgEntities[t] = Math.round((total / successful.length) * 100) / 100;
    }
  }

  const totalIn = results.reduce((s, r) => s + r.input_tokens, 0);
  const totalOut = results.reduce((s, r) => s + r.output_tokens, 0);
  const cost = (totalIn / 1_000_000) * INPUT_COST_PER_M + (totalOut / 1_000_000) * OUTPUT_COST_PER_M;

  const summary: LabellingSummary = {
    labelled_at: new Date().toISOString(),
    model: MODEL,
    total_documents: docs.length,
    labelled: successful.length,
    skipped,
    failed: failed.length,
    errors: failed.map((r) => ({ filename: r.filename, error: r.error! })),
    avg_entities_per_doc: avgEntities,
    avg_relationships_per_doc:
      successful.length > 0
        ? Math.round((successful.reduce((s, r) => s + r.relationships, 0) / successful.length) * 100) / 100
        : 0,
    avg_donations_per_doc:
      successful.length > 0
        ? Math.round((successful.reduce((s, r) => s + r.donations, 0) / successful.length) * 100) / 100
        : 0,
    total_input_tokens: totalIn,
    total_output_tokens: totalOut,
    estimated_cost_usd: Math.round(cost * 10000) / 10000,
  };

  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2) + "\n");

  console.log("\n── Summary ──────────────────────────────────────────");
  console.log(`Labelled: ${summary.labelled} / ${summary.total_documents}`);
  console.log(`Skipped:  ${summary.skipped}`);
  console.log(`Failed:   ${summary.failed}`);
  console.log(`Tokens:   ${totalIn.toLocaleString()} in / ${totalOut.toLocaleString()} out`);
  console.log(`Cost:     ~$${summary.estimated_cost_usd.toFixed(4)}`);
  console.log(`Summary:  ${SUMMARY_PATH}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
