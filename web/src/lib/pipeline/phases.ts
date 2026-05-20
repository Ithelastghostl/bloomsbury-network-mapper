export const CORPUS_PHASES = [
  'classification',
  'extraction',
  'validation',
  'entity_resolution',
  'graph_build',
  'discovery',
  'enrichment',
  'ranking',
  'dossier_generation',
] as const;

export const SEED_PHASES = [
  'seed_import',
  'seed_bootstrap',
  'seed_augmentation_research',
  'seed_augmentation_network',
  'entity_staging_review',
  'corpus_crossref',
  'introduction_scoring',
] as const;

export const PIPELINE_PHASES = [...CORPUS_PHASES, ...SEED_PHASES] as const;

export type CorpusPhase = (typeof CORPUS_PHASES)[number];
export type SeedPhase = (typeof SEED_PHASES)[number];
export type PipelinePhase = (typeof PIPELINE_PHASES)[number];

export type RunType = 'corpus' | 'seed' | 'hybrid';

export function isValidPhase(value: string): value is PipelinePhase {
  return (PIPELINE_PHASES as readonly string[]).includes(value);
}

export function isCorpusPhase(value: string): value is CorpusPhase {
  return (CORPUS_PHASES as readonly string[]).includes(value);
}

export function isSeedPhase(value: string): value is SeedPhase {
  return (SEED_PHASES as readonly string[]).includes(value);
}

export function nextPhase(current: PipelinePhase, runType: RunType = 'corpus'): PipelinePhase | null {
  const phases = runType === 'seed' ? SEED_PHASES
    : runType === 'corpus' ? CORPUS_PHASES
    : PIPELINE_PHASES;

  const idx = (phases as readonly string[]).indexOf(current);
  if (idx === -1 || idx === phases.length - 1) return null;
  return phases[idx + 1] as PipelinePhase;
}
