import { getAdminClient } from '@/lib/supabase/admin';
import { computeScoredLeads } from '@/lib/crm/lead-loader';
import { rankingValue, type RankingMethod } from '@/lib/crm/lead-score';
import { serverError } from '@/lib/api-error';
import { requireAdminOrLocal } from '@/lib/crm/auth';

/**
 * GET /api/crm/export/leads.csv?method=composite&scope=all|actions&includeExisting=0|1
 *
 * Handoff export of ranked leads with scores, best path, and action status.
 * `scope=actions` limits to leads already sent to the Action Backlog.
 * Existing supporters / excluded entries are omitted unless includeExisting=1.
 */

// PRD §18.1 priority + §18.2 confidence model.
const COLUMNS = [
  'Rank', 'Name', 'Category', 'Priority Score', 'Confidence Score',
  'Introability', 'Affinity', 'Capacity', 'Influence', 'Strategic Fit',
  'Min Hops', 'Path Count', 'Best Route', 'Root Supporter', 'Via Organisations',
  'Wealth Band', 'Estimated Net Worth GBP', 'Sector', 'Affinity Rationale',
  'Existing Supporter Flag', 'Action Status',
] as const;

function escapeCSV(value: string): string {
  // Neutralise spreadsheet formula injection: a leading =, +, -, @, or tab/CR
  // makes Excel/Sheets evaluate the cell. Prefix with a single quote.
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export async function GET(request: Request) {
  try {
    const denied = await requireAdminOrLocal();
    if (denied) return denied;

    const url = new URL(request.url);
    const method = (url.searchParams.get('method') ?? 'priority') as RankingMethod;
    const scope = url.searchParams.get('scope') ?? 'all';
    const includeExisting = url.searchParams.get('includeExisting') === '1';

    let leads = await computeScoredLeads(getAdminClient());
    if (!includeExisting) leads = leads.filter(l => !l.existingSupporter);
    if (scope === 'actions') leads = leads.filter(l => l.actionStatus);

    leads.sort((a, b) => rankingValue(b, method) - rankingValue(a, method));

    // Hard cap so the export can't silently grow into a slow/huge response.
    const MAX_ROWS = 50_000;
    if (leads.length > MAX_ROWS) {
      console.warn(`leads.csv: truncated ${leads.length} → ${MAX_ROWS} rows (method=${method}, scope=${scope})`);
      leads = leads.slice(0, MAX_ROWS);
    }

    const rows = [COLUMNS.join(',')];
    leads.forEach((l, i) => {
      rows.push([
        String(i + 1),
        l.name,
        l.category,
        String(l.priority),
        String(l.confidence),
        String(l.dimensions.introability),
        String(l.dimensions.affinity),
        String(l.dimensions.capacity),
        String(l.dimensions.influence),
        String(l.dimensions.strategicFit),
        l.minHops != null ? String(l.minHops) : '',
        String(l.pathCount),
        l.bestPath ?? '',
        l.rootSupporter ?? '',
        (l.introPaths[0]?.via_orgs ?? []).join('; '),
        l.wealthBand ?? '',
        l.estimatedNw != null ? String(l.estimatedNw) : '',
        l.sector ?? '',
        l.explanations.affinity,
        l.existingSupporter ? `${l.existingSupporter.kind}${l.existingSupporter.subType ? ` (${l.existingSupporter.subType})` : ''}: ${l.existingSupporter.matchName}` : '',
        l.actionStatus ?? '',
      ].map(escapeCSV).join(','));
    });

    return new Response(rows.join('\n') + '\n', {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="leads-${method}-${scope}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return serverError('Failed to export leads', err instanceof Error ? err.message : undefined);
  }
}
