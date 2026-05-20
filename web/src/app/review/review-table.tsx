'use client';

/**
 * Client-side interactive review table — §18.6
 *
 * Sorting and filtering are done via URL search params (server-side query),
 * but column header clicks and filter form submit use client navigation.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { WORKFLOW_STATES } from '@/lib/review/workflow';

export interface ReviewRow {
  candidate_recommendation_id: string;
  rank: number;
  name: string;
  priority_score: number;
  confidence_score: number;
  seed: string;
  reason_codes: string[];
  status: string;
  identity_warnings: string[];
}

interface ReviewTableProps {
  rows: ReviewRow[];
  seedOptions: Array<{ seed_id: string; name: string }>;
  currentFilters: {
    seed_id: string;
    status: string;
    min_priority: string;
    max_priority: string;
    min_confidence: string;
    max_confidence: string;
    sort: string;
    order: string;
  };
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    'Discovered': 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
    'Enriched': 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    'Ready for Review': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    'In Review': 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
    'Qualified': 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    'Intro Requested': 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    'Intro Made': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
    'Meeting': 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',
    'Opportunity': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300',
    'Converted': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
    'Rejected': 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? 'bg-zinc-100 text-zinc-700'}`}>
      {status}
    </span>
  );
}

export function ReviewTable({ rows, seedOptions, currentFilters }: ReviewTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      router.push(`/review?${params.toString()}`);
    },
    [router, searchParams],
  );

  const handleSort = (column: string) => {
    const newOrder =
      currentFilters.sort === column && currentFilters.order === 'asc'
        ? 'desc'
        : 'asc';
    updateParams({ sort: column, order: newOrder });
  };

  const sortIndicator = (column: string) => {
    if (currentFilters.sort !== column) return '';
    return currentFilters.order === 'asc' ? ' ↑' : ' ↓';
  };

  const handleFilterSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const updates: Record<string, string> = {};
    for (const key of ['seed_id', 'status', 'min_priority', 'max_priority', 'min_confidence', 'max_confidence']) {
      updates[key] = (formData.get(key) as string) ?? '';
    }
    updateParams(updates);
  };

  return (
    <div>
      {/* Filters */}
      <form
        onSubmit={handleFilterSubmit}
        className="mb-6 grid grid-cols-2 gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 md:grid-cols-4"
      >
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Seed
          </label>
          <select
            name="seed_id"
            defaultValue={currentFilters.seed_id}
            className="mt-1 block w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          >
            <option value="">All seeds</option>
            {seedOptions.map(s => (
              <option key={s.seed_id} value={s.seed_id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Status
          </label>
          <select
            name="status"
            defaultValue={currentFilters.status}
            className="mt-1 block w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          >
            <option value="">All statuses</option>
            {WORKFLOW_STATES.map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Priority range
          </label>
          <div className="mt-1 flex gap-2">
            <input
              name="min_priority"
              type="number"
              step="0.01"
              min="0"
              max="1"
              placeholder="Min"
              defaultValue={currentFilters.min_priority}
              className="block w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            />
            <input
              name="max_priority"
              type="number"
              step="0.01"
              min="0"
              max="1"
              placeholder="Max"
              defaultValue={currentFilters.max_priority}
              className="block w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Confidence range
          </label>
          <div className="mt-1 flex gap-2">
            <input
              name="min_confidence"
              type="number"
              step="0.01"
              min="0"
              max="1"
              placeholder="Min"
              defaultValue={currentFilters.min_confidence}
              className="block w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            />
            <input
              name="max_confidence"
              type="number"
              step="0.01"
              min="0"
              max="1"
              placeholder="Max"
              defaultValue={currentFilters.max_confidence}
              className="block w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            />
          </div>
        </div>

        <div className="col-span-full flex justify-end">
          <button
            type="submit"
            className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Apply filters
          </button>
        </div>
      </form>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
          <thead className="bg-zinc-50 dark:bg-zinc-900">
            <tr>
              <th
                onClick={() => handleSort('rank')}
                className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Rank{sortIndicator('rank')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Name
              </th>
              <th
                onClick={() => handleSort('priority')}
                className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Priority{sortIndicator('priority')}
              </th>
              <th
                onClick={() => handleSort('confidence')}
                className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Confidence{sortIndicator('confidence')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Seed
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Reason Codes
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400"
                >
                  No candidates found
                </td>
              </tr>
            )}
            {rows.map(row => (
              <tr
                key={row.candidate_recommendation_id}
                className="hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-900 dark:text-zinc-100">
                  {row.rank}
                </td>
                <td className="px-4 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  <a
                    href={`/api/candidates/${row.candidate_recommendation_id}/dossier`}
                    className="hover:underline"
                  >
                    {row.name}
                  </a>
                  {row.identity_warnings.length > 0 && (
                    <span
                      className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                      title={row.identity_warnings.join('; ')}
                    >
                      ID warning
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">
                  {row.priority_score.toFixed(2)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">
                  {row.confidence_score.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">
                  {row.seed}
                </td>
                <td className="px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">
                  <div className="flex flex-wrap gap-1">
                    {row.reason_codes.slice(0, 3).map((code, i) => (
                      <span
                        key={i}
                        className="inline-flex rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  <StatusBadge status={row.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  <a
                    href={`/api/candidates/${row.candidate_recommendation_id}/dossier`}
                    className="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Review
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
        {rows.length} candidate{rows.length !== 1 ? 's' : ''} shown
      </p>
    </div>
  );
}
