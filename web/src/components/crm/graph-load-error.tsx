/**
 * Shown when graph data can't be loaded from Supabase (e.g. transient network
 * failure / unreachable host). Keeps the page responsive instead of hanging or
 * crashing, and tells the user it's a connectivity issue they can retry.
 */
export function GraphLoadError({ title }: { title: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-text-primary uppercase tracking-wide mb-4">{title}</h2>
      <div className="border border-border-subtle rounded-lg bg-surface-raised px-6 py-16 text-center">
        <p className="text-sm font-medium text-text-primary">Couldn&apos;t load the network data</p>
        <p className="text-sm text-text-muted mt-1.5 max-w-md mx-auto">
          The connection to the database timed out. This is usually a temporary network issue —
          refresh the page to try again.
        </p>
      </div>
    </div>
  );
}
