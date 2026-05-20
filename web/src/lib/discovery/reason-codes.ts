/**
 * Reason code generation — F7.3-T7
 * PRD ref: §16.5 R3.8 — return reason codes per candidate.
 * Every candidate must have at least one reason code explaining
 * why they were surfaced.
 */

/** All valid reason codes for candidate discovery. */
export type ReasonCode =
  | 'shared_trustee_role'
  | 'shared_director_role'
  | 'shared_charity_affiliation'
  | 'shared_company_affiliation'
  | 'donation_link'
  | 'shared_address'
  | 'board_network_overlap'
  | 'high_pagerank_proximity'
  | 'direct_relationship'
  | 'multi_path_convergence';

export interface ReasonCodeInput {
  /** Relationship types on the strongest path from seed to candidate. */
  pathRelationshipTypes: string[];
  /** Number of qualifying paths from seed to candidate. */
  pathCount: number;
  /** Whether the candidate shares an affiliation with the seed. */
  sharedAffiliationTypes: string[];
  /** Personalised PageRank score for this candidate (0-1). */
  pprScore: number;
  /** PPR threshold above which high_pagerank_proximity is assigned. */
  pprThreshold?: number;
  /** Whether there is a direct (1-edge) relationship. */
  directRelationship: boolean;
}

/**
 * Generate reason codes for a candidate based on discovery signals.
 * Guarantees at least one reason code if the candidate is eligible.
 */
export function generateReasonCodes(input: ReasonCodeInput): ReasonCode[] {
  const codes: ReasonCode[] = [];
  const pprThreshold = input.pprThreshold ?? 0.01;

  // Path-based reasons
  for (const relType of input.pathRelationshipTypes) {
    const upper = relType.toUpperCase();
    if (upper === 'TRUSTEE_OF') {
      addUnique(codes, 'shared_trustee_role');
    } else if (upper === 'DIRECTOR_OF') {
      addUnique(codes, 'shared_director_role');
    } else if (upper === 'MADE_DONATION' || upper === 'RECEIVED_BY') {
      addUnique(codes, 'donation_link');
    } else if (upper === 'REGISTERED_AT') {
      addUnique(codes, 'shared_address');
    }
  }

  // Affiliation-based reasons
  for (const affType of input.sharedAffiliationTypes) {
    const upper = affType.toUpperCase();
    if (upper === 'CHARITY') {
      addUnique(codes, 'shared_charity_affiliation');
    } else if (upper === 'COMPANY') {
      addUnique(codes, 'shared_company_affiliation');
    } else if (upper === 'BOARD') {
      addUnique(codes, 'board_network_overlap');
    }
  }

  // PPR proximity
  if (input.pprScore >= pprThreshold) {
    addUnique(codes, 'high_pagerank_proximity');
  }

  // Direct relationship
  if (input.directRelationship) {
    addUnique(codes, 'direct_relationship');
  }

  // Multi-path convergence
  if (input.pathCount >= 2) {
    addUnique(codes, 'multi_path_convergence');
  }

  return codes;
}

function addUnique(arr: ReasonCode[], code: ReasonCode): void {
  if (!arr.includes(code)) {
    arr.push(code);
  }
}
