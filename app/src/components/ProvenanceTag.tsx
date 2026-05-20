import './ProvenanceTag.css';

interface Props {
  source: string;
  date: string;
}

export function ProvenanceTag({ source, date }: Props) {
  return (
    <span className="provenance-tag">
      {source} · {date}
    </span>
  );
}
