/**
 * Budget gate and cost tracking for pipeline runs.
 * PRD ref: §25.1 (cost drivers), §25.2 (unit economics), §25.3 (budget gate)
 */

// -------------------------------------------------------------------
// Cost Driver Types (§25.1)
// -------------------------------------------------------------------

export interface CostDrivers {
  /** LLM extraction: docs x avg tokens x batch pricing */
  llm_extraction: number;
  /** LLM intro-angle generation: candidates x seeds x tokens */
  llm_intro_angle: number;
  /** Embedding generation via pgvector / ada-002 */
  embedding_generation: number;
  /** Enrichment APIs: Companies House (free), Charity Commission (free), SerpAPI/news */
  enrichment_apis: number;
  /** Supabase + Vercel recurring monthly */
  supabase_vercel_recurring: number;
}

// -------------------------------------------------------------------
// Unit Economics Types (§25.2)
// -------------------------------------------------------------------

export interface UnitEconomics {
  cost_per_surfaced_candidate: number;
  cost_per_reviewed_candidate: number;
  cost_per_qualified_candidate: number;
  cost_per_intro_request: number;
  cost_per_successful_intro: number;
  cost_per_qualified_opportunity: number;
}

export interface FunnelCounts {
  surfaced_candidates: number;
  reviewed_candidates: number;
  qualified_candidates: number;
  intro_requests: number;
  successful_intros: number;
  qualified_opportunities: number;
}

// -------------------------------------------------------------------
// Cost Estimate
// -------------------------------------------------------------------

export interface CostEstimate {
  drivers: CostDrivers;
  total: number;
}

// -------------------------------------------------------------------
// Budget Approval
// -------------------------------------------------------------------

export interface BudgetApproval {
  run_id: string;
  estimated_cost: number;
  approved: boolean;
  approved_by: string | null;
  approved_at: string | null;
  threshold: number;
}

// -------------------------------------------------------------------
// Constants from PRD §25.1
// -------------------------------------------------------------------

/** Per-document LLM cost estimate: ~4800 input + 800 output tokens at Sonnet batch pricing */
const LLM_COST_PER_DOC = 0.0096; // ~$180-260 for 25k docs => ~$0.0096/doc midpoint
/** Per-candidate intro-angle LLM cost */
const LLM_INTRO_ANGLE_COST_PER_CANDIDATE = 0.004; // ~$2 for 500 candidates
/** Per-document embedding cost */
const EMBEDDING_COST_PER_DOC = 0.0016; // ~$40 for 25k docs
/** Monthly SerpAPI/news cost */
const NEWS_API_MONTHLY = 50;
/** Monthly Supabase Pro cost */
const SUPABASE_MONTHLY = 25;
/** Monthly Vercel Pro cost */
const VERCEL_MONTHLY = 20;

// -------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------

/**
 * Estimate cost for a full-corpus run.
 *
 * @param documentCount Number of documents in corpus
 * @param seedCount Number of seeds configured
 * @param candidatesPerSeed Expected candidates per seed (default 50 per PRD)
 */
export function estimateCost(
  documentCount: number,
  seedCount: number,
  candidatesPerSeed = 50,
): CostEstimate {
  const totalCandidates = seedCount * candidatesPerSeed;

  const drivers: CostDrivers = {
    llm_extraction: documentCount * LLM_COST_PER_DOC,
    llm_intro_angle: totalCandidates * LLM_INTRO_ANGLE_COST_PER_CANDIDATE,
    embedding_generation: documentCount * EMBEDDING_COST_PER_DOC,
    enrichment_apis: NEWS_API_MONTHLY,
    supabase_vercel_recurring: SUPABASE_MONTHLY + VERCEL_MONTHLY,
  };

  const total = Object.values(drivers).reduce((sum, v) => sum + v, 0);

  return { drivers, total };
}

/**
 * Calculate unit economics from total run cost and funnel counts.
 * PRD §25.2 - all 6 metrics.
 */
export function calculateUnitEconomics(
  totalCost: number,
  counts: FunnelCounts,
): UnitEconomics {
  const safeDivide = (cost: number, count: number) =>
    count === 0 ? 0 : cost / count;

  return {
    cost_per_surfaced_candidate: safeDivide(totalCost, counts.surfaced_candidates),
    cost_per_reviewed_candidate: safeDivide(totalCost, counts.reviewed_candidates),
    cost_per_qualified_candidate: safeDivide(totalCost, counts.qualified_candidates),
    cost_per_intro_request: safeDivide(totalCost, counts.intro_requests),
    cost_per_successful_intro: safeDivide(totalCost, counts.successful_intros),
    cost_per_qualified_opportunity: safeDivide(totalCost, counts.qualified_opportunities),
  };
}

/**
 * Check whether estimated cost is within the approval threshold.
 * PRD §25.3 - budget gate before each full-corpus run.
 *
 * @returns true if cost is within threshold (auto-approved), false if manual approval needed
 */
export function checkBudgetGate(
  estimatedCost: number,
  approvalThreshold: number,
): boolean {
  return estimatedCost <= approvalThreshold;
}
