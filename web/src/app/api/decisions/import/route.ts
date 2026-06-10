/**
 * POST /api/decisions/import — import decisions from CSV (§18.12, §20.7)
 *
 * Accepts CSV with: candidate_recommendation_id, decision, reason_code, notes
 * Validates each row; rejects invalid rows with reasons.
 */

import { createClient } from '@/lib/supabase/server';
import { apiError, forbidden, serverError } from '@/lib/api-error';
import { generateId } from '@/lib/ulid';
import { withIdempotency } from '@/lib/with-idempotency';
import {
  DECISION_LABELS,
  type DecisionLabel,
  isRejection,
  rejectionReasonCode,
  decisionToState,
  isColdStart,
} from '@/lib/review/workflow';

// ---------------------------------------------------------------
// CSV parsing (simple — no streaming needed for review decisions)
// ---------------------------------------------------------------

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

function parseLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

const REQUIRED_HEADERS = [
  'candidate_recommendation_id',
  'decision',
  'reason_code',
  'notes',
];

interface ImportResult {
  imported: number;
  rejected: Array<{ row: number; reason: string }>;
}

export const POST = withIdempotency(async (request: Request) => {
  try {
    const supabase = await createClient();

    // Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return forbidden('Authentication required');
    }

    const contentType = request.headers.get('content-type') ?? '';
    let csvText: string;

    if (contentType.includes('text/csv') || contentType.includes('text/plain')) {
      csvText = await request.text();
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file');
      if (!file || !(file instanceof File)) {
        return apiError('bad_request', 'No CSV file provided');
      }
      csvText = await file.text();
    } else {
      // Try reading as text
      csvText = await request.text();
    }

    if (!csvText.trim()) {
      return apiError('bad_request', 'Empty CSV');
    }

    const { headers, rows } = parseCSV(csvText);

    // Validate headers
    for (const h of REQUIRED_HEADERS) {
      if (!headers.includes(h)) {
        return apiError('bad_request', `Missing required CSV header: "${h}"`);
      }
    }

    const colIndex = Object.fromEntries(
      REQUIRED_HEADERS.map(h => [h, headers.indexOf(h)]),
    );

    // Cold-start check
    const { count: totalDecisions } = await supabase
      .from('human_decisions')
      .select('*', { count: 'exact', head: true });

    const { data: distinctSeedData } = await supabase
      .rpc('count_distinct_decision_seeds')
      .single();

    const distinctSeeds = (distinctSeedData as { count: number } | null)?.count ?? 0;

    const coldStartFlag = isColdStart({
      totalDecisions: totalDecisions ?? 0,
      distinctSeeds,
    });

    const result: ImportResult = { imported: 0, rejected: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-indexed, skip header

      const candidateId = row[colIndex.candidate_recommendation_id];
      const decision = row[colIndex.decision];
      const reasonCode = row[colIndex.reason_code];
      const notes = row[colIndex.notes];

      // Validate decision label
      if (!decision || !DECISION_LABELS.includes(decision as DecisionLabel)) {
        result.rejected.push({
          row: rowNum,
          reason: `Invalid decision: "${decision}". Must be one of: ${DECISION_LABELS.join(', ')}`,
        });
        continue;
      }

      const decisionLabel = decision as DecisionLabel;

      // Validate rejection reason code
      if (isRejection(decisionLabel)) {
        const expectedCode = rejectionReasonCode(decisionLabel);
        if (!reasonCode) {
          result.rejected.push({
            row: rowNum,
            reason: `reason_code is required for rejection: "${decision}"`,
          });
          continue;
        }
        if (expectedCode && reasonCode !== expectedCode) {
          result.rejected.push({
            row: rowNum,
            reason: `reason_code must be "${expectedCode}" for "${decision}", got "${reasonCode}"`,
          });
          continue;
        }
      }

      if (!candidateId) {
        result.rejected.push({ row: rowNum, reason: 'Missing candidate_recommendation_id' });
        continue;
      }

      // Verify candidate exists
      const { data: candidate, error: fetchError } = await supabase
        .from('candidate_recommendations')
        .select('candidate_recommendation_id')
        .eq('candidate_recommendation_id', candidateId)
        .single();

      if (fetchError || !candidate) {
        result.rejected.push({
          row: rowNum,
          reason: `Candidate not found: "${candidateId}"`,
        });
        continue;
      }

      // Insert decision
      const { error: insertError } = await supabase
        .from('human_decisions')
        .insert({
          human_decision_id: generateId(),
          candidate_recommendation_id: candidateId,
          decision: decisionLabel,
          reason_code: reasonCode || null,
          notes: notes || null,
          decided_by: user.id,
          cold_start_decision: coldStartFlag,
        });

      if (insertError) {
        result.rejected.push({
          row: rowNum,
          reason: `Database error: ${insertError.message}`,
        });
        continue;
      }

      // Update status
      const newStatus = decisionToState(decisionLabel);
      await supabase
        .from('candidate_recommendations')
        .update({ status: newStatus })
        .eq('candidate_recommendation_id', candidateId);

      result.imported++;
    }

    return Response.json(result, { status: 200 });
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
});
