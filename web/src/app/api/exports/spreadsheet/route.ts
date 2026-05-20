/**
 * GET /api/exports/spreadsheet?run_id= — CSV export (§18.11, §18.12, §20.7)
 *
 * All 20 columns from §18.11. Natural key (run_id, candidate_recommendation_id)
 * ensures no duplicate rows.
 */

import { type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, serverError } from '@/lib/api-error';

// §18.11 column order
const CSV_COLUMNS = [
  'Candidate ID',
  'Run ID',
  'Candidate Name',
  'Candidate Type',
  'Priority Score',
  'Confidence Score',
  'Recommended Introducer',
  'Intro Path',
  'Shared Affiliations',
  'Strongest Evidence',
  'Capacity Signal',
  'Affinity Signal',
  'Influence Signal',
  'Identity Warnings',
  'Aggregated Mentions',
  'Suggested Angle (Skeleton)',
  'Suggested Angle (Natural)',
  'Reviewer Status',
  'Rejection Reason',
  'Dossier Link',
] as const;

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCSVRow(values: string[]): string {
  return values.map(escapeCSV).join(',');
}

export async function GET(request: NextRequest) {
  try {
    const runId = request.nextUrl.searchParams.get('run_id');
    if (!runId) {
      return apiError('bad_request', 'run_id query parameter is required');
    }

    const supabase = await createClient();

    // Verify run exists
    const { data: run, error: runError } = await supabase
      .from('runs')
      .select('run_id')
      .eq('run_id', runId)
      .single();

    if (runError || !run) {
      return apiError('not_found', 'Run not found', undefined, 404);
    }

    // Fetch all candidates for this run, ordered by rank
    const { data: candidates, error: candError } = await supabase
      .from('candidate_recommendations')
      .select()
      .eq('run_id', runId)
      .order('rank', { ascending: true });

    if (candError) {
      return serverError('Failed to fetch candidates', candError.message);
    }

    if (!candidates || candidates.length === 0) {
      // Return headers-only CSV
      return new Response(toCSVRow([...CSV_COLUMNS]) + '\n', {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="export_${runId}.csv"`,
        },
      });
    }

    // Collect entity IDs for batch lookup
    const entityIds = [...new Set(candidates.map(c => c.candidate_entity_id))];
    const seedIds = [...new Set(candidates.map(c => c.seed_id))];

    // Fetch entity names
    const { data: entities } = await supabase
      .from('canonical_entities')
      .select('canonical_entity_id, display_name, entity_type')
      .in('canonical_entity_id', entityIds);

    const entityMap = new Map(
      (entities ?? []).map(e => [e.canonical_entity_id, e]),
    );

    // Fetch seed entities for introducer names
    const { data: seedEntities } = await supabase
      .from('seeds')
      .select('seed_id, canonical_entity_id')
      .in('seed_id', seedIds);

    const seedEntityIds = (seedEntities ?? []).map(s => s.canonical_entity_id);
    const { data: seedEntityNames } = await supabase
      .from('canonical_entities')
      .select('canonical_entity_id, display_name')
      .in('canonical_entity_id', seedEntityIds);

    const seedIdToEntityId = new Map(
      (seedEntities ?? []).map(s => [s.seed_id, s.canonical_entity_id]),
    );
    const entityIdToName = new Map(
      (seedEntityNames ?? []).map(e => [e.canonical_entity_id, e.display_name]),
    );

    // Fetch latest decisions per candidate
    const candIds = candidates.map(c => c.candidate_recommendation_id);
    const { data: decisions } = await supabase
      .from('human_decisions')
      .select()
      .in('candidate_recommendation_id', candIds)
      .order('decided_at', { ascending: false });

    const decisionMap = new Map<string, { decision: string; reason_code: string | null }>();
    for (const d of decisions ?? []) {
      if (!decisionMap.has(d.candidate_recommendation_id)) {
        decisionMap.set(d.candidate_recommendation_id, {
          decision: d.decision,
          reason_code: d.reason_code,
        });
      }
    }

    // Deduplicate by natural key (run_id, candidate_recommendation_id)
    const seen = new Set<string>();
    const rows: string[] = [toCSVRow([...CSV_COLUMNS])];

    for (const c of candidates) {
      const key = `${c.run_id}:${c.candidate_recommendation_id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const entity = entityMap.get(c.candidate_entity_id);
      const seedEntityId = seedIdToEntityId.get(c.seed_id);
      const introducerName = seedEntityId ? (entityIdToName.get(seedEntityId) ?? '') : '';

      const path = c.strongest_path as Record<string, unknown>;
      const allPaths = (path?.allPaths as Array<Record<string, unknown>>) ?? [];
      const firstPath = allPaths[0];
      const pathNodes = (firstPath?.path as string[]) ?? [];
      const introPath = pathNodes.join(' -> ');

      const sharedAffiliations = ((path?.sharedAffiliations as string[]) ?? []).join('; ');

      const priorityBreakdown = (path?.priorityBreakdown as Record<string, number>) ?? {};
      const confidenceBreakdown = (path?.confidenceBreakdown as Record<string, number>) ?? {};

      const dec = decisionMap.get(c.candidate_recommendation_id);

      const dossierLink = `/api/candidates/${c.candidate_recommendation_id}/dossier`;

      // Fetch cluster mention count for aggregated mentions
      const mentionCount = (c as Record<string, unknown>).aggregated_mentions ?? '';

      const values: string[] = [
        c.candidate_recommendation_id,
        c.run_id,
        entity?.display_name ?? '',
        entity?.entity_type ?? '',
        String(c.priority_score),
        String(c.confidence_score),
        introducerName,
        introPath,
        sharedAffiliations,
        (c.reason_codes ?? []).join('; '),
        String(priorityBreakdown.capacitySignal ?? ''),
        String(priorityBreakdown.affinity ?? ''),
        String(priorityBreakdown.influence ?? ''),
        (c.identity_warnings ?? []).join('; '),
        String(mentionCount),
        '', // Skeleton angle — would need dossier assembly, left blank for export
        '', // Natural angle
        c.status ?? '',
        dec?.reason_code ?? '',
        dossierLink,
      ];

      rows.push(toCSVRow(values));
    }

    const csv = rows.join('\n') + '\n';

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="export_${runId}.csv"`,
      },
    });
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
}
