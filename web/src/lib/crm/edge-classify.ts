/**
 * Edge classification + tie-strength (IDEAS 5 & 6).
 *
 * Makes each CONNECTION legible: derives an edge TYPE from the raw
 * `connection_type` + `via_organisation`, a default per-type TRUST weight, and a
 * TIE STRENGTH that folds in recency (co-director appointment/resignation dates)
 * and multiplicity (how many distinct reasons back the edge).
 *
 * Pure + DB-free so it is unit-testable and usable from any client component.
 * Trust weights echo the §15.7 / Appendix A.1 base strengths in
 * lib/graph/weights.ts, restated here per edge-type bucket.
 */

export type EdgeType =
  | 'shared_board'
  | 'co_director'
  | 'co_trustee'
  | 'shared_employer'
  | 'corpus_mention'
  | 'inferred'
  | 'direct';

export type Freshness = 'active' | 'recent' | 'stale' | 'unknown';

export interface CoDirectorInfo {
  /** ISO date the relationship began (co_director_edges.appointed_on). */
  appointed_on?: string | null;
  /** ISO date the relationship ended; null/absent => still active. */
  resigned_on?: string | null;
  /** Companies House company the directorship sits on. */
  company_name?: string | null;
}

/** Minimal connection shape this module reads — a subset of ConnectionEntry. */
export interface ClassifiableConnection {
  connection_type: string;
  via_organisation?: string | null;
  evidence?: Record<string, unknown> | null;
}

export interface EdgeDossier {
  edgeType: EdgeType;
  /** Default trust for the edge type, 0–1. */
  trustWeight: number;
  /** trustWeight folded with recency + multiplicity, 0–1. */
  tieStrength: number;
  freshness: Freshness;
  /** Human one-liner, e.g. "Co-director of Acme Ltd (active since 2019)". */
  label: string;
  /** Coarse warmth bucket derived from tieStrength, for compact badges. */
  warmth: 'warm' | 'cool' | 'cold';
  /** Short reasons that fed multiplicity — surfaced in the dossier. */
  reasons: string[];
}

/** Per-edge-type default trust (0–1). Mirrors Appendix A.1 buckets. */
const TRUST_BY_TYPE: Record<EdgeType, number> = {
  shared_board: 0.9,
  co_director: 0.9,
  co_trustee: 0.85,
  shared_employer: 0.6,
  corpus_mention: 0.5,
  inferred: 0.4,
  direct: 0.95,
};

const TYPE_LABELS: Record<EdgeType, string> = {
  shared_board: 'Shared board',
  co_director: 'Co-director',
  co_trustee: 'Co-trustee',
  shared_employer: 'Shared employer',
  corpus_mention: 'Corpus mention',
  inferred: 'Inferred',
  direct: 'Direct relationship',
};

/** Charity / foundation / trust-named orgs imply a trustee (not company) board. */
const CHARITY_ORG_RE = /\b(foundation|charit\w*|trust|charitable|fund|institute|appeal|society)\b/i;

/**
 * Classify the edge type from connection_type (+ via_organisation context).
 *
 * Connection-type tokens seen in this codebase: DIRECTOR_OF, CO_DIRECTOR_OF,
 * TRUSTEE_OF, FAMILY_MEMBER, ASSOCIATE, SHARES_AFFILIATION(_WITH), MENTIONED_IN,
 * CO_OCCURS(_WITH), INFERRED_CONFIRMED, MADE_DONATION, RECEIVED_BY.
 */
export function classifyEdgeType(conn: ClassifiableConnection): EdgeType {
  const t = (conn.connection_type ?? '').toUpperCase();
  const via = conn.via_organisation ?? '';
  const viaIsCharity = !!via && CHARITY_ORG_RE.test(via);

  if (t.startsWith('CO_DIRECTOR')) return 'co_director';
  if (t.startsWith('TRUSTEE')) return 'co_trustee';
  if (t.startsWith('DIRECTOR')) {
    // A directorship "via" a charity-named org is really a shared trustee board.
    return viaIsCharity ? 'co_trustee' : 'shared_board';
  }
  if (t === 'FAMILY_MEMBER') return 'direct';
  if (t.startsWith('INFERRED')) return 'inferred';
  if (t.startsWith('MENTIONED') || t.startsWith('CO_OCCUR')) return 'corpus_mention';
  if (t.startsWith('SHARES_AFFILIATION') || t === 'ASSOCIATE') {
    return viaIsCharity ? 'co_trustee' : 'shared_employer';
  }
  if (t === 'MADE_DONATION' || t === 'RECEIVED_BY') return 'direct';
  // Unknown token: lean on via context, else treat as inferred.
  if (via) return viaIsCharity ? 'co_trustee' : 'shared_employer';
  return 'inferred';
}

/** Parse a year from an ISO-ish date string; null if unparseable. */
function yearOf(date?: string | null): number | null {
  if (!date) return null;
  const m = /^(\d{4})/.exec(String(date).trim());
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) ? y : null;
}

/**
 * Recency multiplier from co-director dates.
 *   active (no resignation)        -> 1.0
 *   resigned <=2yr ago             -> 0.7  (recent)
 *   resigned >2yr ago              -> 0.4  (stale)
 *   no dates at all                -> 0.8  (unknown)
 */
function recencyFactor(
  info: CoDirectorInfo | undefined,
  nowYear: number,
): { factor: number; freshness: Freshness } {
  if (!info || (info.appointed_on == null && info.resigned_on == null)) {
    return { factor: 0.8, freshness: 'unknown' };
  }
  if (info.resigned_on == null) {
    return { factor: 1.0, freshness: 'active' };
  }
  const resignedYear = yearOf(info.resigned_on);
  if (resignedYear == null) {
    // Has dates but the resignation year is unreadable — treat as unknown.
    return { factor: 0.8, freshness: 'unknown' };
  }
  const age = nowYear - resignedYear;
  if (age <= 2) return { factor: 0.7, freshness: 'recent' };
  return { factor: 0.4, freshness: 'stale' };
}

/**
 * Count distinct corroborating reasons inside a connection's evidence jsonb.
 * Evidence is free-form across the pipeline, so probe the common shapes:
 * arrays, {reasons|sources|signals: [...]}, summary strings, or plain objects.
 * Returns both a count and short human strings for the dossier.
 */
export function extractReasons(evidence?: Record<string, unknown> | null): string[] {
  if (!evidence) return [];
  const out: string[] = [];
  const push = (v: unknown) => {
    if (v == null) return;
    if (typeof v === 'string') { const s = v.trim(); if (s) out.push(s); return; }
    if (typeof v === 'number' || typeof v === 'boolean') { out.push(String(v)); return; }
  };

  if (Array.isArray(evidence)) {
    for (const v of evidence) push(typeof v === 'object' && v ? JSON.stringify(v) : v);
  } else {
    for (const key of ['reasons', 'sources', 'signals', 'reason', 'source', 'note', 'notes']) {
      const v = (evidence as Record<string, unknown>)[key];
      if (Array.isArray(v)) v.forEach(push);
      else push(v);
    }
    for (const key of ['summary', 'evidence_summary', 'detail', 'description', 'company_name', 'company']) {
      push((evidence as Record<string, unknown>)[key]);
    }
  }
  // De-dupe, cap length, keep order.
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const s of out) {
    const k = s.slice(0, 200);
    if (!seen.has(k)) { seen.add(k); uniq.push(k); }
  }
  return uniq;
}

/**
 * Multiplicity multiplier: more distinct reasons => stronger, with diminishing
 * returns. 0–1 reasons => 1.0 (no boost), capped at 1.15 for 4+.
 */
function multiplicityFactor(reasonCount: number): number {
  if (reasonCount <= 1) return 1.0;
  return Math.min(1.15, 1.0 + (reasonCount - 1) * 0.05);
}

function warmthOf(tieStrength: number): 'warm' | 'cool' | 'cold' {
  if (tieStrength >= 0.7) return 'warm';
  if (tieStrength >= 0.45) return 'cool';
  return 'cold';
}

function buildLabel(
  edgeType: EdgeType,
  via: string | null | undefined,
  info: CoDirectorInfo | undefined,
  freshness: Freshness,
): string {
  const org = info?.company_name || via || null;
  const base = TYPE_LABELS[edgeType];
  // Date qualifier for co-director / board relationships.
  let when = '';
  const startY = yearOf(info?.appointed_on);
  if (freshness === 'active') when = startY ? ` (active since ${startY})` : ' (active)';
  else if (freshness === 'recent') when = ' (recently ended)';
  else if (freshness === 'stale') {
    const endY = yearOf(info?.resigned_on);
    when = endY ? ` (ended ${endY})` : ' (ended)';
  }

  if (edgeType === 'co_director') return `Co-director${org ? ` of ${org}` : ''}${when}`;
  if (edgeType === 'co_trustee') return `Co-trustee${org ? ` of ${org}` : ''}${when}`;
  if (edgeType === 'shared_board') return `${base}${org ? `: ${org}` : ''}${when}`;
  if (edgeType === 'shared_employer') return `${base}${org ? `: ${org}` : ''}`;
  if (edgeType === 'corpus_mention') return `${base}${org ? ` (${org})` : ''}`;
  if (edgeType === 'inferred') return 'Inferred — confirmed by analyst';
  if (edgeType === 'direct') return org ? `Direct relationship (${org})` : 'Direct relationship';
  return base;
}

/**
 * Full per-edge dossier: type, trust, tie strength, freshness, label, reasons.
 *
 * @param conn            the connection (type + via + evidence jsonb)
 * @param coDirectorInfo  optional appointment/resignation dates (drives freshness)
 * @param nowYear         reference year for recency (defaults to current year)
 */
export function edgeDossier(
  conn: ClassifiableConnection,
  coDirectorInfo?: CoDirectorInfo,
  nowYear: number = new Date().getFullYear(),
): EdgeDossier {
  const edgeType = classifyEdgeType(conn);
  const trustWeight = TRUST_BY_TYPE[edgeType];

  // Recency only applies to relationships that carry dates (co-director/board).
  const datesApply = edgeType === 'co_director' || edgeType === 'shared_board' || edgeType === 'co_trustee';
  const { factor: recency, freshness } = datesApply
    ? recencyFactor(coDirectorInfo, nowYear)
    : { factor: 1.0, freshness: 'unknown' as Freshness };

  const reasons = extractReasons(conn.evidence);
  const multiplicity = multiplicityFactor(reasons.length);

  const tieStrength = Math.max(0, Math.min(1, trustWeight * recency * multiplicity));

  return {
    edgeType,
    trustWeight,
    tieStrength,
    freshness: datesApply ? freshness : 'unknown',
    label: buildLabel(edgeType, conn.via_organisation, coDirectorInfo, datesApply ? freshness : 'unknown'),
    warmth: warmthOf(tieStrength),
    reasons,
  };
}

/** Display metadata for an edge type — label + Tailwind badge classes. */
export const EDGE_TYPE_META: Record<EdgeType, { label: string; cls: string }> = {
  shared_board: { label: 'Shared board', cls: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
  co_director: { label: 'Co-director', cls: 'text-blue-300 bg-blue-300/10 border-blue-300/20' },
  co_trustee: { label: 'Co-trustee', cls: 'text-teal-400 bg-teal-400/10 border-teal-400/20' },
  shared_employer: { label: 'Shared employer', cls: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
  corpus_mention: { label: 'Corpus mention', cls: 'text-orange-400 bg-orange-400/10 border-orange-400/20' },
  inferred: { label: 'Inferred', cls: 'text-text-muted bg-mid-charcoal border-border-subtle' },
  direct: { label: 'Direct', cls: 'text-gold bg-gold/10 border-gold/20' },
};

/** Warmth label + Tailwind classes for the compact tie-strength indicator. */
export const WARMTH_META: Record<'warm' | 'cool' | 'cold', { label: string; cls: string; dot: string }> = {
  warm: { label: 'Warm', cls: 'text-green-400 bg-green-400/10 border-green-400/20', dot: 'bg-green-400' },
  cool: { label: 'Cool', cls: 'text-gold bg-gold/10 border-gold/20', dot: 'bg-gold' },
  cold: { label: 'Cold', cls: 'text-text-muted bg-mid-charcoal border-border-subtle', dot: 'bg-text-muted' },
};
