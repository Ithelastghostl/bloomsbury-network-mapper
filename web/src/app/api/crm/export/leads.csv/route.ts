import { getAdminClient } from '@/lib/supabase/admin';
import { computeScoredLeads } from '@/lib/crm/lead-loader';
import { serverError } from '@/lib/api-error';
import { requireAdminOrLocal } from '@/lib/crm/auth';

/**
 * GET /api/crm/export/leads.csv?method=composite&scope=all|actions&includeExisting=0|1
 *
 * Handoff export of ranked leads with scores, best path, and action status.
 * `scope=actions` limits to leads already sent to the Action Backlog.
 * Existing donors / excluded entries are omitted unless includeExisting=1.
 */

const COLUMNS = [
  'Rank', 'Name', 'Category', 'Composite Score', 'Connectivity', 'Wealth', 'Paths', 'Affinity',
  'Min Hops', 'Path Count', 'Best Route', 'Root Supporter', 'Via Organisations',
  'Wealth Band', 'Estimated Net Worth GBP', 'Sector', 'Affinity Rationale',
  'Existing Donor Flag', 'Action Status',
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
    const method = url.searchParams.get('method') ?? 'composite';
    const scope = url.searchParams.get('scope') ?? 'all';
    const includeExisting = url.searchParams.get('includeExisting') === '1';

    let leads = await computeScoredLeads(getAdminClient());
    if (!includeExisting) leads = leads.filter(l => !l.existingDonor);
    if (scope === 'actions') leads = leads.filter(l => l.actionStatus);

    const sortField: Record<string, (l: typeof leads[number]) => number> = {
      composite: l => l.compositeScore,
      connectivity: l => l.connectivity,
      wealth: l => l.networkWorth,
      paths: l => l.breakdown.paths,
      affinity: l => l.donorAffinity,
    };
    const keyFn = sortField[method] ?? sortField.composite;
    leads.sort((a, b) => keyFn(b) - keyFn(a));

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
        String(l.compositeScore),
        String(l.connectivity),
        String(l.networkWorth),
        String(l.breakdown.paths),
        String(l.donorAffinity),
        l.minHops != null ? String(l.minHops) : '',
        String(l.pathCount),
        l.bestPath ?? '',
        l.rootSupporter ?? '',
        (l.introPaths[0]?.via_orgs ?? []).join('; '),
        l.wealthBand ?? '',
        l.estimatedNw != null ? String(l.estimatedNw) : '',
        l.sector ?? '',
        l.explanations.affinity,
        l.existingDonor ? `${l.existingDonor.kind}: ${l.existingDonor.matchName}` : '',
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
