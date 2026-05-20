/**
 * Outcome Funnel dashboard — F11.4-T2.
 * PRD ref: §22.2 — intro request rate, intro success, meeting, conversion funnel.
 */

import type { OutcomeMetrics } from '@/lib/monitoring/metrics';

// -------------------------------------------------------------------
// Data fetching
// -------------------------------------------------------------------

async function fetchOutcomeMetrics(): Promise<OutcomeMetrics> {
  // In production, calls getOutcomeMetrics() from metrics module
  return {
    intro_requests: 0,
    intro_successes: 0,
    meetings: 0,
    conversions: 0,
    intro_success_rate: 0,
    meeting_rate: 0,
    conversion_rate: 0,
  };
}

// -------------------------------------------------------------------
// Page
// -------------------------------------------------------------------

export default async function OutcomeFunnelPage() {
  const metrics = await fetchOutcomeMetrics();

  const funnelSteps = [
    { label: 'Intro Requests', value: metrics.intro_requests, rate: null },
    { label: 'Intro Successes', value: metrics.intro_successes, rate: metrics.intro_success_rate },
    { label: 'Meetings', value: metrics.meetings, rate: metrics.meeting_rate },
    { label: 'Conversions', value: metrics.conversions, rate: metrics.conversion_rate },
  ];

  const maxValue = Math.max(...funnelSteps.map(s => s.value), 1);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        Outcome Funnel
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Intro request rate to intro success to meeting to conversion.
      </p>

      {/* Funnel visualization */}
      <div className="mt-8 space-y-4">
        {funnelSteps.map((step, i) => (
          <div key={step.label}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                {step.label}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                  {step.value}
                </span>
                {step.rate !== null && (
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    ({formatPct(step.rate)} of previous)
                  </span>
                )}
              </div>
            </div>
            <div className="mt-1 h-8 w-full rounded bg-zinc-200 dark:bg-zinc-700">
              <div
                className={`h-8 rounded ${getFunnelColor(i)}`}
                style={{ width: `${maxValue > 0 ? (step.value / maxValue) * 100 : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Conversion rates summary */}
      <div className="mt-8 grid grid-cols-3 gap-4">
        <RateCard label="Intro Success Rate" value={metrics.intro_success_rate} />
        <RateCard label="Meeting Rate" value={metrics.meeting_rate} />
        <RateCard label="Conversion Rate" value={metrics.conversion_rate} />
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Components
// -------------------------------------------------------------------

function RateCard({ label, value }: { label: string; value: number }) {
  const color = value >= 0.5 ? 'text-green-600 dark:text-green-400'
    : value >= 0.2 ? 'text-amber-600 dark:text-amber-400'
    : 'text-zinc-600 dark:text-zinc-400';

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${color}`}>{formatPct(value)}</p>
    </div>
  );
}

function getFunnelColor(index: number): string {
  const colors = ['bg-blue-500', 'bg-blue-400', 'bg-blue-300', 'bg-green-500'];
  return colors[index] ?? 'bg-blue-500';
}

function formatPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}
