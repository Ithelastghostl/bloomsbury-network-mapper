import './EmptyState.css';

interface Props {
  filtered?: boolean;
  onReset?: () => void;
}

export function EmptyState({ filtered, onReset }: Props) {
  if (filtered) {
    return (
      <div className="empty-state">
        <p className="empty-state__heading">No leads match these filters</p>
        <p className="empty-state__body">Try adjusting the filters above.</p>
        {onReset && (
          <button className="empty-state__cta" onClick={onReset}>
            Clear filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="empty-state">
      <p className="empty-state__heading">No sponsors yet</p>
      <p className="empty-state__body">
        Add a sponsor to begin mapping their network. The recommender will surface donor candidates
        once the first record is enriched.
      </p>
      <button className="empty-state__cta">Add sponsor</button>
    </div>
  );
}
