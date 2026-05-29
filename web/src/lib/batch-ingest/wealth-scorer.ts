import type { WealthBand } from '@/lib/enrichment/types';
import type { ParsedAgentOutput, WealthAssessmentFromSignals } from './types';

/**
 * Compute a wealth band from the text-based signals in agent output.
 * Mirrors the logic in unified-sweep.ts calculateWealthBand but works
 * from the free-text wealth_signals array instead of structured API data.
 */
export function assessWealth(output: ParsedAgentOutput): WealthAssessmentFromSignals {
  const evidence: WealthAssessmentFromSignals['evidence'] = [];
  let score = 0;

  const signals = output.wealth_signals.map(s => s.toLowerCase());
  const all = signals.join(' ');

  // Directorship volume
  const activeDir = output.directorships.filter(
    d => !d.status || d.status === 'active',
  ).length;
  if (activeDir > 0) {
    const contribution = Math.min(activeDir * 0.015, 0.15);
    evidence.push({
      signal: 'active_directorships',
      source_layer: 'A',
      contribution,
      detail: `${activeDir} active directorships`,
    });
    score += contribution;
  }

  // Co-director network density
  if (output.co_directors.length >= 5) {
    const contribution = Math.min(output.co_directors.length * 0.005, 0.10);
    evidence.push({
      signal: 'co_director_network',
      source_layer: 'A',
      contribution,
      detail: `${output.co_directors.length} co-directors across companies`,
    });
    score += contribution;
  }

  // Philanthropy depth
  if (output.philanthropy.length > 0) {
    const contribution = Math.min(output.philanthropy.length * 0.025, 0.10);
    evidence.push({
      signal: 'philanthropy',
      source_layer: 'B',
      contribution,
      detail: `${output.philanthropy.length} philanthropy signals`,
    });
    score += contribution;
  }

  // Text-based wealth keywords
  const billionMatch = all.match(/\b(\d+)\s*billion/);
  if (billionMatch || all.includes('billionaire')) {
    const contribution = 0.25;
    evidence.push({
      signal: 'billionaire_reference',
      source_layer: 'B',
      contribution,
      detail: billionMatch ? `${billionMatch[1]} billion referenced` : 'Billionaire reference',
    });
    score += contribution;
  } else {
    const millionMatch = all.match(/[£$]\s*(\d+)\s*million/);
    if (millionMatch) {
      const amount = parseInt(millionMatch[1], 10);
      let contribution = 0.05;
      if (amount >= 100) contribution = 0.20;
      else if (amount >= 25) contribution = 0.15;
      else if (amount >= 5) contribution = 0.10;
      evidence.push({
        signal: 'million_reference',
        source_layer: 'B',
        contribution,
        detail: `${millionMatch[0]} referenced`,
      });
      score += contribution;
    }
  }

  // Rich list / Sunday Times / Forbes mentions
  if (all.includes('rich list') || all.includes('sunday times') || all.includes('forbes')) {
    const contribution = 0.15;
    evidence.push({
      signal: 'rich_list_mention',
      source_layer: 'B',
      contribution,
      detail: 'Rich list or Forbes mention in wealth signals',
    });
    score += contribution;
  }

  // Property / real estate signals
  if (all.includes('property') || all.includes('real estate') || all.includes('portfolio')) {
    const contribution = 0.05;
    evidence.push({
      signal: 'property_signals',
      source_layer: 'B',
      contribution,
      detail: 'Property/real estate references',
    });
    score += contribution;
  }

  // Fund management / investment
  if (all.includes('fund') || all.includes('investment') || all.includes('hedge fund') || all.includes('private equity')) {
    const contribution = 0.10;
    evidence.push({
      signal: 'fund_management',
      source_layer: 'B',
      contribution,
      detail: 'Fund/investment management references',
    });
    score += contribution;
  }

  score = Math.min(score, 1.0);

  let band: WealthBand;
  if (score >= 0.80) band = '100m_plus';
  else if (score >= 0.65) band = '25m_100m';
  else if (score >= 0.45) band = '5m_25m';
  else if (score >= 0.25) band = '1m_5m';
  else band = 'unknown';

  const confidence = Math.min(0.4 + evidence.length * 0.08, 0.90);

  return { band, score, confidence, evidence };
}
