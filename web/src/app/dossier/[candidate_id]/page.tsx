/**
 * Candidate Dossier page — §18.7, F9.3-T2.
 * Server component that fetches and renders all dossier sections:
 *   - Summary header (name, entity type, scores)
 *   - Discovery paths (shortest + strongest)
 *   - Evidence table (source docs, spans, confidence)
 *   - Roles and positions timeline
 *   - Enrichment signals by source
 *   - Identity notes (cluster info, decisions)
 *   - Decision panel (qualify/reject actions)
 */

import type { Dossier, PriorityScoreBreakdown, ConfidenceScoreBreakdown, DossierPath, DossierEvidence, DossierRole, DossierEnrichmentSignal, DossierIdentityNotes, DossierDecision, DossierIntroAngle } from '@/lib/dossier/types';
import { requireUser } from '@/lib/crm/auth';
import { headers, cookies } from 'next/headers';

// ---------------------------------------------------------------
// Server data fetching
// ---------------------------------------------------------------

async function fetchDossier(candidateId: string): Promise<Dossier | null> {
  // This is a server-to-server call to our own API, which the Proxy gates like
  // any other request. Forward the caller's session cookie so the internal
  // fetch is authenticated, and derive the origin from the incoming request so
  // it resolves correctly on Vercel (where there is no fixed localhost).
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? (host ? `${proto}://${host}` : 'http://localhost:3000');

  const cookieStore = await cookies();
  const cookieHeader = cookieStore.getAll().map((c) => `${c.name}=${c.value}`).join('; ');

  const res = await fetch(`${baseUrl}/api/candidates/${candidateId}/dossier`, {
    cache: 'no-store',
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
  if (!res.ok) return null;
  return res.json();
}

// ---------------------------------------------------------------
// Page component
// ---------------------------------------------------------------

export default async function DossierPage({
  params,
}: {
  params: Promise<{ candidate_id: string }>;
}) {
  await requireUser();
  const { candidate_id } = await params;
  const dossier = await fetchDossier(candidate_id);

  if (!dossier) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8 dark:bg-zinc-950">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            Dossier Not Found
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Candidate recommendation {candidate_id} was not found.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8 dark:bg-zinc-950">
      <div className="mx-auto max-w-4xl space-y-8">
        <SummaryHeader dossier={dossier} />
        <IntroAngleSection introAngle={dossier.introAngle} />
        <DiscoveryPaths
          paths={dossier.paths}
          strongestPath={dossier.strongestPath}
          shortestPath={dossier.shortestPath}
          sharedAffiliations={dossier.sharedAffiliations}
          discoveryMethods={dossier.discoveryMethods}
        />
        <EvidenceTable evidence={dossier.evidence} />
        <RolesTimeline roles={dossier.roles} />
        <EnrichmentSignals signals={dossier.enrichmentSignals} />
        <IdentityNotesSection notes={dossier.identityNotes} warnings={dossier.identityWarnings} />
        <DecisionPanel
          decision={dossier.decision}
          candidateId={dossier.candidateRecommendationId}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Summary Header — R5.1, R5.2
// ---------------------------------------------------------------

function SummaryHeader({ dossier }: { dossier: Dossier }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {dossier.candidateName}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {dossier.candidateType} &middot; {dossier.aggregatedMentions} mention{dossier.aggregatedMentions !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-4">
          <ScoreBadge label="Priority" breakdown={dossier.priorityScore} color="blue" />
          <ScoreBadge label="Confidence" breakdown={dossier.confidenceScore} color="green" />
        </div>
      </div>
      {dossier.reasonCodes.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {dossier.reasonCodes.map((code) => (
            <span
              key={code}
              className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {code.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------
// Score Badge with expandable breakdown — F9.3-T3
// ---------------------------------------------------------------

function ScoreBadge({
  label,
  breakdown,
  color,
}: {
  label: string;
  breakdown: PriorityScoreBreakdown | ConfidenceScoreBreakdown;
  color: 'blue' | 'green';
}) {
  const bgClass = color === 'blue'
    ? 'bg-blue-50 dark:bg-blue-950'
    : 'bg-green-50 dark:bg-green-950';
  const textClass = color === 'blue'
    ? 'text-blue-700 dark:text-blue-300'
    : 'text-green-700 dark:text-green-300';

  const components = getScoreComponents(breakdown);

  return (
    <details className={`rounded-lg ${bgClass} px-4 py-2`}>
      <summary className="cursor-pointer list-none">
        <div className="text-center">
          <div className={`text-2xl font-bold ${textClass}`}>
            {(breakdown.total * 100).toFixed(0)}
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
        </div>
      </summary>
      <div className="mt-2 space-y-1 border-t border-zinc-200 pt-2 dark:border-zinc-700">
        {components.map(({ name, value, weight }) => (
          <div key={name} className="flex justify-between text-xs">
            <span className="text-zinc-600 dark:text-zinc-400">{name} ({(weight * 100).toFixed(0)}%)</span>
            <span className={textClass}>{(value * 100).toFixed(0)}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

function getScoreComponents(
  breakdown: PriorityScoreBreakdown | ConfidenceScoreBreakdown,
): Array<{ name: string; value: number; weight: number }> {
  if ('introability' in breakdown) {
    const b = breakdown as PriorityScoreBreakdown;
    return [
      { name: 'Introability', value: b.introability, weight: 0.30 },
      { name: 'Affinity', value: b.affinity, weight: 0.25 },
      { name: 'Capacity Signal', value: b.capacitySignal, weight: 0.20 },
      { name: 'Influence', value: b.influence, weight: 0.15 },
      { name: 'Strategic Fit', value: b.strategicFit, weight: 0.10 },
    ];
  }
  const b = breakdown as ConfidenceScoreBreakdown;
  return [
    { name: 'Identity Confidence', value: b.identityConfidence, weight: 0.35 },
    { name: 'Relationship Confidence', value: b.relationshipConfidence, weight: 0.30 },
    { name: 'Source Corroboration', value: b.sourceCorroboration, weight: 0.20 },
    { name: 'Freshness', value: b.freshness, weight: 0.15 },
  ];
}

// ---------------------------------------------------------------
// Introduction Angle — R5.3, R5.4, F9.3-T4
// ---------------------------------------------------------------

function IntroAngleSection({ introAngle }: { introAngle: DossierIntroAngle }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Introduction Angle
      </h2>
      {introAngle.recommendedIntroducer && (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Recommended introducer: <span className="font-medium text-zinc-900 dark:text-zinc-100">{introAngle.recommendedIntroducer}</span>
        </p>
      )}
      <div className="mt-4 space-y-3">
        <div>
          <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Skeleton</h3>
          <p className="mt-1 rounded bg-zinc-50 p-3 text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
            {introAngle.skeleton}
          </p>
        </div>
        {introAngle.natural && introAngle.natural !== introAngle.skeleton && (
          <div>
            <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Natural Language</h3>
            <p className="mt-1 rounded bg-zinc-50 p-3 text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
              {introAngle.natural}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------
// Discovery Paths — §18.7 "Why this candidate was surfaced"
// ---------------------------------------------------------------

function DiscoveryPaths({
  paths,
  strongestPath,
  shortestPath,
  sharedAffiliations,
  discoveryMethods,
}: {
  paths: DossierPath[];
  strongestPath: DossierPath | null;
  shortestPath: DossierPath | null;
  sharedAffiliations: string[];
  discoveryMethods: string[];
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Why This Candidate Was Surfaced
      </h2>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        {discoveryMethods.map((m) => (
          <span key={m} className="rounded bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
            {m}
          </span>
        ))}
      </div>

      {strongestPath && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Strongest Path (score: {strongestPath.score.toFixed(3)})
          </h3>
          <PathDisplay path={strongestPath} />
        </div>
      )}

      {shortestPath && shortestPath !== strongestPath && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Shortest Path
          </h3>
          <PathDisplay path={shortestPath} />
        </div>
      )}

      {paths.length > 2 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-zinc-600 dark:text-zinc-400">
            All {paths.length} paths
          </summary>
          <div className="mt-2 space-y-2">
            {paths.map((p, i) => (
              <div key={i} className="text-sm">
                <PathDisplay path={p} />
              </div>
            ))}
          </div>
        </details>
      )}

      {sharedAffiliations.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Shared Affiliations
          </h3>
          <div className="mt-1 flex flex-wrap gap-2">
            {sharedAffiliations.map((a) => (
              <span
                key={a}
                className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300"
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function PathDisplay({ path }: { path: DossierPath }) {
  return (
    <div className="mt-1 flex items-center gap-1 overflow-x-auto text-sm">
      {path.description.split(' -> ').map((node, i, arr) => (
        <span key={i} className="flex items-center gap-1">
          <span className="whitespace-nowrap rounded bg-zinc-100 px-2 py-0.5 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
            {node}
          </span>
          {i < arr.length - 1 && (
            <span className="text-zinc-400">&rarr;</span>
          )}
        </span>
      ))}
      {path.templateName && (
        <span className="ml-2 text-xs text-zinc-400">({path.templateName})</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// Evidence Table — §18.7
// ---------------------------------------------------------------

function EvidenceTable({ evidence }: { evidence: DossierEvidence[] }) {
  if (evidence.length === 0) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Evidence</h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">No evidence spans available.</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Evidence</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="pb-2 pr-4 font-medium text-zinc-600 dark:text-zinc-400">Claim</th>
              <th className="pb-2 pr-4 font-medium text-zinc-600 dark:text-zinc-400">Evidence Span</th>
              <th className="pb-2 pr-4 font-medium text-zinc-600 dark:text-zinc-400">Source</th>
              <th className="pb-2 font-medium text-zinc-600 dark:text-zinc-400">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {evidence.map((e, i) => (
              <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800">
                <td className="py-2 pr-4 text-zinc-800 dark:text-zinc-200">{e.claim}</td>
                <td className="py-2 pr-4 max-w-xs truncate text-zinc-600 dark:text-zinc-400" title={e.evidenceSpan}>
                  {e.evidenceSpan}
                </td>
                <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">{e.sourceDocument}</td>
                <td className="py-2">
                  <ConfidencePill value={e.confidence} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------
// Roles & Positions Timeline — §18.7
// ---------------------------------------------------------------

function RolesTimeline({ roles }: { roles: DossierRole[] }) {
  if (roles.length === 0) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Known Roles and Affiliations
        </h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">No roles found.</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Known Roles and Affiliations
      </h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="pb-2 pr-4 font-medium text-zinc-600 dark:text-zinc-400">Entity</th>
              <th className="pb-2 pr-4 font-medium text-zinc-600 dark:text-zinc-400">Role</th>
              <th className="pb-2 pr-4 font-medium text-zinc-600 dark:text-zinc-400">Start</th>
              <th className="pb-2 pr-4 font-medium text-zinc-600 dark:text-zinc-400">End</th>
              <th className="pb-2 font-medium text-zinc-600 dark:text-zinc-400">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r, i) => (
              <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800">
                <td className="py-2 pr-4 text-zinc-800 dark:text-zinc-200">{r.entity}</td>
                <td className="py-2 pr-4 capitalize text-zinc-700 dark:text-zinc-300">{r.role}</td>
                <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">{r.start ?? '-'}</td>
                <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">{r.end ?? '-'}</td>
                <td className="py-2">
                  <ConfidencePill value={r.confidence} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------
// Enrichment Signals — §18.7
// ---------------------------------------------------------------

function EnrichmentSignals({ signals }: { signals: DossierEnrichmentSignal[] }) {
  if (signals.length === 0) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Enrichment Signals
        </h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">No enrichment signals yet.</p>
      </section>
    );
  }

  // Group by source
  const bySource = new Map<string, DossierEnrichmentSignal[]>();
  for (const s of signals) {
    const group = bySource.get(s.source) ?? [];
    group.push(s);
    bySource.set(s.source, group);
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Enrichment Signals
      </h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="pb-2 pr-4 font-medium text-zinc-600 dark:text-zinc-400">Source</th>
              <th className="pb-2 pr-4 font-medium text-zinc-600 dark:text-zinc-400">Signal</th>
              <th className="pb-2 pr-4 font-medium text-zinc-600 dark:text-zinc-400">Match Confidence</th>
              <th className="pb-2 font-medium text-zinc-600 dark:text-zinc-400">Freshness</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((s, i) => (
              <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800">
                <td className="py-2 pr-4 text-zinc-800 dark:text-zinc-200">{s.source}</td>
                <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">{s.signal}</td>
                <td className="py-2 pr-4">
                  <ConfidencePill value={s.matchConfidence} />
                </td>
                <td className="py-2 text-zinc-600 dark:text-zinc-400">
                  {new Date(s.freshness).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------
// Identity Notes — §18.7
// ---------------------------------------------------------------

function IdentityNotesSection({
  notes,
  warnings,
}: {
  notes: DossierIdentityNotes;
  warnings: string[];
}) {
  const hasContent =
    notes.possibleDuplicates.length > 0 ||
    notes.conflictingData.length > 0 ||
    notes.missingData.length > 0 ||
    warnings.length > 0 ||
    notes.clusterConfidence !== null;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Identity Resolution Notes
      </h2>
      {!hasContent ? (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          No identity issues detected.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {warnings.length > 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
              <h3 className="text-sm font-medium text-amber-800 dark:text-amber-200">Warnings</h3>
              <ul className="mt-1 list-inside list-disc text-sm text-amber-700 dark:text-amber-300">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {notes.clusterConfidence !== null && (
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              Cluster confidence: <ConfidencePill value={notes.clusterConfidence} />
              {notes.decisionStatus && (
                <span className="ml-2">Status: {notes.decisionStatus}</span>
              )}
            </div>
          )}

          <NoteList title="Possible Duplicates" items={notes.possibleDuplicates} />
          <NoteList title="Conflicting Data" items={notes.conflictingData} />
          <NoteList title="Missing Data" items={notes.missingData} />

          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {notes.underlyingMentions.length} underlying mention{notes.underlyingMentions.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </section>
  );
}

function NoteList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{title}</h3>
      <ul className="mt-1 list-inside list-disc text-sm text-zinc-600 dark:text-zinc-400">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------
// Decision Panel — §18.7
// ---------------------------------------------------------------

function DecisionPanel({
  decision,
  candidateId,
}: {
  decision: DossierDecision | null;
  candidateId: string;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Reviewer Decision
      </h2>
      {decision ? (
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-3">
            <StatusBadge status={decision.status} />
            {decision.outcome && (
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                Reason: {decision.outcome}
              </span>
            )}
          </div>
          {decision.notes && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Notes: {decision.notes}
            </p>
          )}
          {decision.decidedBy && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Decided by {decision.decidedBy}
              {decision.decidedAt && (
                <> on {new Date(decision.decidedAt).toLocaleDateString()}</>
              )}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No decision yet. Use the API to submit a decision.
          </p>
          <div className="mt-4 flex gap-3">
            <ActionButton label="Qualify" action="qualified" candidateId={candidateId} variant="primary" />
            <ActionButton label="Reject" action="rejected" candidateId={candidateId} variant="danger" />
            <ActionButton label="Needs Research" action="needs_more_research" candidateId={candidateId} variant="secondary" />
          </div>
        </div>
      )}
    </section>
  );
}

function ActionButton({
  label,
  action,
  candidateId,
  variant,
}: {
  label: string;
  action: string;
  candidateId: string;
  variant: 'primary' | 'danger' | 'secondary';
}) {
  const baseClasses = 'rounded-md px-4 py-2 text-sm font-medium transition-colors';
  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    secondary: 'border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700',
  };

  return (
    <a
      href={`/api/candidates/${candidateId}/decision`}
      data-action={action}
      className={`${baseClasses} ${variantClasses[variant]}`}
    >
      {label}
    </a>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    qualified: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    needs_more_research: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    in_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  };

  const colorClass = colors[status.toLowerCase()] ?? 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200';

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ---------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------

function ConfidencePill({ value }: { value: number }) {
  const pct = (value * 100).toFixed(0);
  let colorClass = 'text-red-600 dark:text-red-400';
  if (value >= 0.8) colorClass = 'text-green-600 dark:text-green-400';
  else if (value >= 0.5) colorClass = 'text-amber-600 dark:text-amber-400';

  return <span className={`text-sm font-medium ${colorClass}`}>{pct}%</span>;
}
