/**
 * Admin layout — shared sidebar navigation for all /admin routes.
 * PRD ref: §22.1 — dashboards built as Next.js routes in /admin.
 */

import { requireUser } from '@/lib/crm/auth';

const NAV_ITEMS = [
  { href: '/admin/runs', label: 'Pipeline Runs' },
  { href: '/admin/quarantine', label: 'Quarantine' },
  { href: '/admin/costs', label: 'Costs' },
  { href: '/admin/quality/extraction', label: 'Extraction Quality' },
  { href: '/admin/quality/identity', label: 'Identity Resolution' },
  { href: '/admin/quality/graph', label: 'Graph Health' },
  { href: '/admin/quality/enrichment', label: 'Enrichment' },
  { href: '/admin/review', label: 'Review Workflow' },
  { href: '/admin/outcomes', label: 'Outcome Funnel' },
  { href: '/admin/discovery', label: 'Discovery' },
  { href: '/admin/monitoring', label: 'Monitoring' },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <nav className="w-56 shrink-0 border-r border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Admin
        </h2>
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className="block rounded-md px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
