import type { ScoreTier } from '../data/mockLeads';
import './ScoreBadge.css';

interface Props {
  score: number;
  tier: ScoreTier;
  size?: 'sm' | 'lg';
}

export function ScoreBadge({ score, tier, size = 'sm' }: Props) {
  return (
    <span className={`score-badge score-badge--${tier.toLowerCase()} score-badge--${size}`}>
      <span className="score-badge__number">{score}</span>
      <span className="score-badge__tier">{tier}</span>
    </span>
  );
}
