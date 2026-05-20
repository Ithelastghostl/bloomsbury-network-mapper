/**
 * Extraction pipeline orchestrator (F3.3-T1 through F3.3-T7).
 *
 * Processes documents through the Anthropic batch API to extract
 * entities, relationships, donations, and evidence spans.
 *
 * Usage:
 *   npx tsx scripts/run-extraction.ts --dry-run --limit 5
 *   npx tsx scripts/run-extraction.ts --limit 100 --batch-size 50
 *   npx tsx scripts/run-extraction.ts --run-id 01ABC... --doc-type mixed
 */
import { readFileSync, mkdirSync, appendFileSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { ulid } from 'ulid';

// Import extraction schemas and prompts via relative paths
// (these live under web/src but we import the compiled TS directly via tsx)
import { extractionOutputSchema, type ExtractionOutput } from '../web/src/schemas/extraction-output';
import { getPromptForDocType } from '../web/src/prompts/extraction/index';
import {
  EXTRACTION_PROMPT_VERSION,
  EXTRACTION_MODEL,
  EXTRACTION_TEMPERATURE,
} from '../web/src/prompts/extraction/version';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PROJECT_ROOT = resolve(import.meta.dirname, '..');
config({ path: resolve(PROJECT_ROOT, 'web', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in web/.env.local');
  process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: { schema: 'app' },
});

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

interface CliArgs {
  runId: string | null;
  limit: number | null;
  batchSize: number;
  docType: string | null;
  dryRun: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    runId: null,
    limit: null,
    batchSize: 100,
    docType: null,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--run-id':
        result.runId = args[++i];
        break;
      case '--limit':
        result.limit = parseInt(args[++i], 10);
        break;
      case '--batch-size':
        result.batchSize = parseInt(args[++i], 10);
        break;
      case '--doc-type':
        result.docType = args[++i];
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocumentRow {
  document_id: string;
  storage_uri: string;
  document_type: string;
}

// ---------------------------------------------------------------------------
// Run management
// ---------------------------------------------------------------------------

const PROMPT_VERSIONS: Record<string, string> = {
  mixed: EXTRACTION_PROMPT_VERSION,
  trustee_filing: EXTRACTION_PROMPT_VERSION,
  financial_statement: EXTRACTION_PROMPT_VERSION,
  accounts_only: EXTRACTION_PROMPT_VERSION,
  annual_report: EXTRACTION_PROMPT_VERSION,
};

async function createRun(): Promise<string> {
  const runId = ulid();
  const { error } = await supabase.from('runs').insert({
    run_id: runId,
    corpus_version: 'v1.0',
    schema_version: 'v1.0',
    extraction_prompt_versions: PROMPT_VERSIONS,
    graph_build_version: 'pending',
    identity_resolution_version: 'pending',
    scoring_config_version: 'pending',
    status: 'running',
  });

  if (error) {
    throw new Error(`Failed to create run: ${error.message}`);
  }
  console.log(`Created run: ${runId}`);
  return runId;
}

async function updateRunStatus(
  runId: string,
  status: string,
  error?: object,
): Promise<void> {
  const update: Record<string, unknown> = { status, completed_at: new Date().toISOString() };
  if (error) update.error = error;

  const { error: dbError } = await supabase
    .from('runs')
    .update(update)
    .eq('run_id', runId);

  if (dbError) {
    console.error(`Failed to update run status: ${dbError.message}`);
  }
}

// ---------------------------------------------------------------------------
// Fetch unprocessed documents
// ---------------------------------------------------------------------------

const SUPPORTED_DOC_TYPES = ['mixed', 'trustee_filing', 'financial_statement', 'accounts_only', 'annual_report'];

async function fetchUnprocessedDocuments(
  runId: string,
  limit: number | null,
  docType: string | null,
): Promise<DocumentRow[]> {
  // First get document IDs already processed in this run
  const processedIds = new Set<string>();
  let from = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('extraction_runs')
      .select('document_id')
      .eq('run_id', runId)
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`Failed to fetch extraction_runs: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) processedIds.add(row.document_id);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Now fetch documents, filtering by type
  const targetTypes = docType ? [docType] : SUPPORTED_DOC_TYPES;
  const allDocs: DocumentRow[] = [];
  from = 0;

  while (true) {
    let query = supabase
      .from('documents')
      .select('document_id, storage_uri, document_type')
      .in('document_type', targetTypes)
      .range(from, from + PAGE - 1);

    if (limit && allDocs.length >= limit) break;

    const { data, error } = await query;

    if (error) throw new Error(`Failed to fetch documents: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const doc of data) {
      if (processedIds.has(doc.document_id)) continue;
      allDocs.push(doc);
      if (limit && allDocs.length >= limit) break;
    }

    if (data.length < PAGE) break;
    from += PAGE;
  }

  return allDocs;
}

// ---------------------------------------------------------------------------
// Batch API helpers
// ---------------------------------------------------------------------------

function buildBatchRequest(
  doc: DocumentRow,
  content: string,
): Anthropic.Messages.Batches.BatchCreateParams.Request {
  const systemPrompt = getPromptForDocType(doc.document_type);

  return {
    custom_id: doc.document_id,
    params: {
      model: EXTRACTION_MODEL,
      max_tokens: 16384,
      temperature: EXTRACTION_TEMPERATURE,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Extract all entities, relationships, donations, and evidence spans from this document.\n\n${content}`,
        },
      ],
    },
  };
}

async function submitBatch(
  anthropic: Anthropic,
  requests: Anthropic.Messages.Batches.BatchCreateParams.Request[],
): Promise<Anthropic.Messages.Batches.MessageBatch> {
  console.log(`Submitting batch of ${requests.length} requests...`);
  const batch = await anthropic.messages.batches.create({ requests });
  console.log(`Batch created: ${batch.id} (status: ${batch.processing_status})`);
  return batch;
}

async function pollBatchCompletion(
  anthropic: Anthropic,
  batchId: string,
): Promise<Anthropic.Messages.Batches.MessageBatch> {
  const POLL_INTERVAL_MS = 30_000; // 30 seconds
  const MAX_POLLS = 2880; // 24 hours at 30s intervals

  for (let i = 0; i < MAX_POLLS; i++) {
    const batch = await anthropic.messages.batches.retrieve(batchId);
    const counts = batch.request_counts;
    console.log(
      `  Poll ${i + 1}: status=${batch.processing_status} ` +
      `processing=${counts.processing} succeeded=${counts.succeeded} ` +
      `errored=${counts.errored} canceled=${counts.canceled} expired=${counts.expired}`,
    );

    if (batch.processing_status === 'ended') {
      return batch;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Batch ${batchId} did not complete within 24 hours`);
}

// ---------------------------------------------------------------------------
// Result processing
// ---------------------------------------------------------------------------

function parseExtractionResponse(
  message: Anthropic.Messages.Message,
): { output: ExtractionOutput | null; rawJson: string | null; error: string | null } {
  // Extract text from the message content blocks
  const textBlocks = message.content.filter(
    (b): b is Anthropic.Messages.TextBlock => b.type === 'text',
  );
  if (textBlocks.length === 0) {
    return { output: null, rawJson: null, error: 'No text content in response' };
  }

  const rawJson = textBlocks.map((b) => b.text).join('');

  // Try to parse JSON -- handle potential markdown fencing
  let jsonStr = rawJson.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return { output: null, rawJson, error: `JSON parse error: ${jsonStr.substring(0, 200)}...` };
  }

  // Validate against Zod schema
  const result = extractionOutputSchema.safeParse(parsed);
  if (!result.success) {
    return {
      output: null,
      rawJson,
      error: `Schema validation failed: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    };
  }

  return { output: result.data, rawJson };
}

async function writeEntityMentions(
  runId: string,
  documentId: string,
  entities: ExtractionOutput['entities'],
): Promise<void> {
  if (entities.length === 0) return;

  const rows = entities.map((e) => ({
    entity_mention_id: ulid(),
    document_id: documentId,
    run_id: runId,
    entity_type: e.entity_type,
    raw_value: e.raw_value,
    normalised_value: e.normalised_value,
    attributes: e.attributes,
    evidence_span: e.evidence_span,
    span_start: e.span_start,
    span_end: e.span_end,
    extraction_confidence: e.extraction_confidence,
    validation_status: 'auto_accepted',
  }));

  // Insert in chunks of 200 to avoid payload limits
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabase.from('entity_mentions').insert(chunk);
    if (error) {
      throw new Error(`Failed to insert entity_mentions: ${error.message}`);
    }
  }
}

async function writeEvidenceSpans(
  runId: string,
  documentId: string,
  spans: ExtractionOutput['evidence_spans'],
): Promise<void> {
  if (spans.length === 0) return;

  const rows = spans.map((s) => ({
    evidence_id: ulid(),
    document_id: documentId,
    run_id: runId,
    text: s.text,
    span_start: s.span_start,
    span_end: s.span_end,
    source_section: s.source_section ?? null,
    evidence_type: s.evidence_type,
  }));

  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabase.from('evidence_spans').insert(chunk);
    if (error) {
      throw new Error(`Failed to insert evidence_spans: ${error.message}`);
    }
  }
}

function writeStagingJsonl(
  runId: string,
  documentId: string,
  output: ExtractionOutput,
): void {
  const stagingDir = resolve(PROJECT_ROOT, 'workspace', 'staging', runId);
  mkdirSync(stagingDir, { recursive: true });

  // Write relationships to staging JSONL (needs canonical entities from Phase 2)
  for (const rel of output.relationships) {
    appendFileSync(
      resolve(stagingDir, 'relationships.jsonl'),
      JSON.stringify({ document_id: documentId, run_id: runId, ...rel }) + '\n',
    );
  }

  // Write donations to staging JSONL
  for (const don of output.donations) {
    appendFileSync(
      resolve(stagingDir, 'donations.jsonl'),
      JSON.stringify({ document_id: documentId, run_id: runId, ...don }) + '\n',
    );
  }
}

function writeSnapshotJsonl(
  runId: string,
  documentId: string,
  output: ExtractionOutput,
): void {
  const snapshotDir = resolve(PROJECT_ROOT, 'workspace', 'extraction-output');
  mkdirSync(snapshotDir, { recursive: true });

  appendFileSync(
    resolve(snapshotDir, `${runId}.jsonl`),
    JSON.stringify({ document_id: documentId, ...output }) + '\n',
  );
}

async function createExtractionRun(
  runId: string,
  documentId: string,
  status: string,
  retries: number,
  error?: object,
): Promise<void> {
  const row: Record<string, unknown> = {
    extraction_run_id: ulid(),
    run_id: runId,
    document_id: documentId,
    prompt_version: EXTRACTION_PROMPT_VERSION,
    model: EXTRACTION_MODEL,
    temperature: EXTRACTION_TEMPERATURE,
    status,
    invalid_json_retries: retries,
  };
  if (status === 'completed') {
    row.completed_at = new Date().toISOString();
  }
  if (error) {
    row.error = error;
  }

  const { error: dbError } = await supabase.from('extraction_runs').insert(row);
  if (dbError) {
    console.error(`Failed to insert extraction_run for ${documentId}: ${dbError.message}`);
  }
}

async function quarantineDocument(
  runId: string,
  documentId: string,
  reasonCode: string,
  details: string,
): Promise<void> {
  const { error } = await supabase.from('quarantine').insert({
    quarantine_id: ulid(),
    run_id: runId,
    source_phase: 'extraction',
    source_record: { document_id: documentId },
    reason_code: reasonCode,
    details,
  });
  if (error) {
    console.error(`Failed to quarantine ${documentId}: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Process a single completed result
// ---------------------------------------------------------------------------

async function processResult(
  runId: string,
  documentId: string,
  result: Anthropic.Messages.Batches.MessageBatchResult,
): Promise<{ status: 'completed' | 'failed' }> {
  if (result.type !== 'succeeded') {
    const reason = result.type === 'errored'
      ? `API error: ${JSON.stringify(result.error)}`
      : `Request ${result.type}`;
    await quarantineDocument(runId, documentId, `batch_${result.type}`, reason);
    await createExtractionRun(runId, documentId, 'failed_final', 0, { reason });
    return { status: 'failed' };
  }

  const { output, rawJson, error } = parseExtractionResponse(result.message);

  if (!output) {
    // Parse/validation failed -- will be retried by the retry loop
    await createExtractionRun(runId, documentId, 'failed_final', 1, {
      reason: error,
      raw_response: rawJson?.substring(0, 2000),
    });
    await quarantineDocument(runId, documentId, 'invalid_json', error ?? 'Unknown parse error');
    return { status: 'failed' };
  }

  // Write to database
  await writeEntityMentions(runId, documentId, output.entities);
  await writeEvidenceSpans(runId, documentId, output.evidence_spans);

  // Write relationships and donations to staging JSONL
  writeStagingJsonl(runId, documentId, output);

  // Write snapshot
  writeSnapshotJsonl(runId, documentId, output);

  // Record successful extraction run
  await createExtractionRun(runId, documentId, 'completed', 0);

  return { status: 'completed' };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs();

  console.log('=== Extraction Pipeline ===');
  console.log(`  dry-run:    ${args.dryRun}`);
  console.log(`  limit:      ${args.limit ?? 'all'}`);
  console.log(`  batch-size: ${args.batchSize}`);
  console.log(`  doc-type:   ${args.docType ?? 'all supported'}`);
  console.log(`  model:      ${EXTRACTION_MODEL}`);
  console.log(`  prompt ver: ${EXTRACTION_PROMPT_VERSION}`);
  console.log('');

  // Validate doc-type if provided
  if (args.docType && !SUPPORTED_DOC_TYPES.includes(args.docType)) {
    console.error(`Unsupported doc-type: ${args.docType}. Supported: ${SUPPORTED_DOC_TYPES.join(', ')}`);
    process.exit(1);
  }

  // Check ANTHROPIC_API_KEY early (before creating a run record)
  if (!args.dryRun && !ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set.');
    console.error('Add it to web/.env.local or export it as an environment variable:');
    console.error('  export ANTHROPIC_API_KEY=sk-ant-...');
    process.exit(1);
  }

  // Create or reuse run (skip DB write for dry-run unless run-id provided)
  const runId = args.dryRun
    ? (args.runId ?? `dry-run-${ulid()}`)
    : (args.runId ?? await createRun());
  console.log(`Run ID: ${runId}`);

  // Fetch unprocessed documents
  console.log('Fetching unprocessed documents...');
  const docs = await fetchUnprocessedDocuments(runId, args.limit, args.docType);
  console.log(`Found ${docs.length} documents to process`);

  if (docs.length === 0) {
    console.log('Nothing to process.');
    if (!args.dryRun) {
      await updateRunStatus(runId, 'completed');
    }
    return;
  }

  // Validate that we can read files and build prompts
  const docsByType: Record<string, number> = {};
  const readableDocIds: string[] = [];
  const readErrors: string[] = [];

  for (const doc of docs) {
    const filePath = resolve(PROJECT_ROOT, doc.storage_uri);
    try {
      readFileSync(filePath, 'utf-8');
      readableDocIds.push(doc.document_id);
      docsByType[doc.document_type] = (docsByType[doc.document_type] ?? 0) + 1;

      // Validate that we have a prompt for this doc type
      getPromptForDocType(doc.document_type);
    } catch (err) {
      readErrors.push(`${doc.document_id}: ${(err as Error).message}`);
    }
  }

  console.log('\nDocuments by type:');
  for (const [type, count] of Object.entries(docsByType).sort()) {
    console.log(`  ${type}: ${count}`);
  }
  if (readErrors.length > 0) {
    console.log(`\nRead errors (${readErrors.length}):`);
    for (const e of readErrors.slice(0, 10)) {
      console.log(`  ${e}`);
    }
    if (readErrors.length > 10) {
      console.log(`  ... and ${readErrors.length - 10} more`);
    }
  }

  // Dry-run: stop here
  if (args.dryRun) {
    console.log('\n=== DRY RUN — would process the above documents ===');
    console.log(`Total readable: ${readableDocIds.length}`);
    console.log(`Read errors: ${readErrors.length}`);

    // Show a sample batch request for the first document
    if (docs.length > 0) {
      const sampleDoc = docs[0];
      const filePath = resolve(PROJECT_ROOT, sampleDoc.storage_uri);
      try {
        const content = readFileSync(filePath, 'utf-8');
        const batchReq = buildBatchRequest(sampleDoc, content);
        console.log('\nSample batch request (first doc):');
        console.log(`  custom_id: ${batchReq.custom_id}`);
        console.log(`  model: ${batchReq.params.model}`);
        console.log(`  max_tokens: ${batchReq.params.max_tokens}`);
        console.log(`  system prompt length: ${(batchReq.params.system as string).length} chars`);
        console.log(`  user message length: ${(batchReq.params.messages[0].content as string).length} chars`);
      } catch {
        // Already reported above
      }
    }

    return;
  }

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY! });

  // Process in batches
  const docsToProcess = docs.filter((d) => readableDocIds.includes(d.document_id));
  let totalCompleted = 0;
  let totalFailed = 0;

  for (let batchStart = 0; batchStart < docsToProcess.length; batchStart += args.batchSize) {
    const batchDocs = docsToProcess.slice(batchStart, batchStart + args.batchSize);
    const batchNum = Math.floor(batchStart / args.batchSize) + 1;
    const totalBatches = Math.ceil(docsToProcess.length / args.batchSize);
    console.log(`\n--- Batch ${batchNum}/${totalBatches} (${batchDocs.length} docs) ---`);

    // Build batch requests
    const requests: Anthropic.Messages.Batches.BatchCreateParams.Request[] = [];
    const docMap = new Map<string, DocumentRow>();

    for (const doc of batchDocs) {
      const filePath = resolve(PROJECT_ROOT, doc.storage_uri);
      const content = readFileSync(filePath, 'utf-8');
      requests.push(buildBatchRequest(doc, content));
      docMap.set(doc.document_id, doc);
    }

    // Submit batch
    const batch = await submitBatch(anthropic, requests);

    // Poll for completion
    const completedBatch = await pollBatchCompletion(anthropic, batch.id);

    // Collect and process results
    console.log('Processing results...');
    const results = await anthropic.messages.batches.results(completedBatch.id);

    for await (const item of results) {
      const docId = item.custom_id;
      const { status } = await processResult(runId, docId, item.result);

      if (status === 'completed') {
        totalCompleted++;
      } else {
        totalFailed++;
      }
    }

    console.log(`Batch ${batchNum} done: ${totalCompleted} completed, ${totalFailed} failed so far`);
  }

  // Quarantine documents with read errors
  for (const errMsg of readErrors) {
    const docId = errMsg.split(':')[0];
    await quarantineDocument(runId, docId, 'file_not_readable', errMsg);
    await createExtractionRun(runId, docId, 'failed_final', 0, { reason: errMsg });
    totalFailed++;
  }

  // Update run status
  const finalStatus = totalFailed > 0 ? 'completed_with_warnings' : 'completed';
  await updateRunStatus(runId, finalStatus);

  console.log('\n=== Extraction Complete ===');
  console.log(`Run ID:    ${runId}`);
  console.log(`Status:    ${finalStatus}`);
  console.log(`Completed: ${totalCompleted}`);
  console.log(`Failed:    ${totalFailed}`);
  console.log(`Staging:   workspace/staging/${runId}/`);
  console.log(`Snapshot:  workspace/extraction-output/${runId}.jsonl`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
