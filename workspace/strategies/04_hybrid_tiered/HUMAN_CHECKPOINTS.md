# Human Checkpoints — Strategy 4 Hybrid Tiered Pipeline

Four stacked checkpoints, one more than Strategy 3, reflecting the additional commercial spend gate that Tier 2 introduces.

---

## Checkpoint 1 — Tier 1 ShortlistGate

**Trigger:** Tier1Orchestrator and ShortlistScorer have completed for a batch of records. ShortlistQueue is populated.

**What humans see:**
- A markdown file `reviews/shortlist_YYYYMMDD.md` containing, for each candidate:
  - Rank (by composite_score)
  - Full name, donor_id
  - Composite score (0.0–1.0)
  - Top 3 signals with source URLs (e.g., "Co-trustee of Esmée Fairbairn Foundation since 2021 — [CC register link]")
  - PSC wealth indicator (if present): company name and nature of control
  - Estimated Tier 2 cost if this candidate is approved (Factary lookup pro-rata; Wealth-X flag if uhnwi_flag = true)
  - Any adverse flags (sanctions, adverse media)
- A summary line: N candidates shortlisted from M records processed; estimated Tier 2 spend if all approved: £X

**Reviewer actions:**
- `approve`: candidate advances to Tier 2 queue
- `reject`: candidate excluded from Tier 2; reason required
- `modify`: composite_score threshold adjusted for this batch; or a specific candidate's score manually overridden
- `add_unlisted`: fundraiser can add a candidate not shortlisted by automation; override reason required

**Decision gate:** No Tier 2 Prefect flow starts for any candidate until a ShortlistApproval record with decision = "approved" exists in Postgres for that donor_id.

**Interface:** Markdown file (in-file annotations) plus CLI command `shortlist approve --donor-id <UUID> [--reason "..."]`. Prefect pauses Tier 2 flow until approval is recorded.

**Time budget:** Target ≤ 2 business days. Prefect sends a reminder notification at 48 hours for any pending approvals. If approval is not received within 5 business days, Prefect raises an alert to the project lead.

**Schema (shortlist_approvals table):**
```json
{
  "donor_id": "string (UUID)",
  "decision": "approved | rejected | modified | add_unlisted",
  "reviewer_id": "string",
  "reviewed_at": "ISO8601 datetime",
  "notes": "string | null",
  "override_reason": "string | null (required for add_unlisted and rejected)"
}
```

---

## Checkpoint 2 — Mid-Tier 2 Review (post-Factary/Wealth-X, pre-Job C)

**Trigger:** Tier 2 vendor enrichment (Factary Phi and, where applicable, Wealth-X) has returned results for a candidate. WealthConfirmer has reconciled Tier 1 and Tier 2 data and produced a ReconciledLeadRecord. wealth_confirmation_confidence ≥ 0.7 and entity_resolution_confidence ≥ 0.85 (if below these thresholds, the record goes to Checkpoint 3 instead).

**What humans see:**
- A markdown file `reviews/tier2_review_{donor_id}.md` per candidate containing:
  - Tier 1 signals summary (co-trusteeship, PSC, property indicators)
  - Factary Phi results: donation list with source URLs, wealth proxies
  - Wealth-X profile (if requested): net worth estimate, source of wealth, philanthropic interests
  - WealthConfirmer reconciliation summary: agreements, conflicts, resolution approach
  - wealth_confirmation_confidence score
  - Recommendation from WealthConfirmer: "proceed to Job C", "request additional lookup", or "wealth unconfirmed"

**Reviewer actions:**
- `proceed`: approve Job C SynthesisAgent run; Tier 2 spend is now committed
- `request_additional`: trigger a second Factary lookup or Wealth-X lookup if the first was thin (adds latency and cost; requires explicit decision)
- `wealth_unconfirmed`: proceed to Job C but flag that wealth band cannot be estimated; dossier will state this explicitly

**Decision gate:** Job C SynthesisAgent does not run until a mid_tier2_review record exists for that donor_id.

**Interface:** Markdown file plus CLI command `tier2 proceed --donor-id <UUID>`.

**Time budget:** Target ≤ 1 business day per candidate. This review is lighter than Checkpoint 1 (single-candidate focus rather than batch ranking); most approvals should take < 15 minutes per candidate.

**Schema (tier2_reviews table):**
```json
{
  "donor_id": "string (UUID)",
  "decision": "proceed | request_additional | wealth_unconfirmed",
  "reviewer_id": "string",
  "reviewed_at": "ISO8601 datetime",
  "notes": "string | null"
}
```

---

## Checkpoint 3 — Uncertainty-Threshold Review

**Trigger:** WealthConfirmer returns entity_resolution_confidence < 0.85 OR wealth_confirmation_confidence < 0.7 for a candidate.

**What humans see:**
- A markdown file `reviews/uncertainty_{donor_id}.md` containing:
  - The specific conflict or low-confidence signal: e.g., "Two 'James Bennett' records in Companies House; unable to determine which is the donor" or "Factary wealth proxies contradict Tier 1 PSC indicators"
  - Both or all candidate identities (for entity resolution conflicts) with distinguishing fields (DOB, address, company names)
  - A confidence score breakdown showing which signals drove the low score
  - Available options: select correct identity, mark as unresolvable, accept low confidence and proceed, mark wealth as unconfirmed

**Reviewer actions (entity resolution conflict):**
- `select_identity`: choose the correct individual from the list of candidates; provide distinguishing evidence
- `unresolvable`: record moved to unresolvable_queue; no dossier produced; donor_id flagged for manual follow-up
- `accept_low_confidence`: acknowledge uncertainty; proceed to Job C with entity_resolution_confidence as-is; dossier must note uncertainty

**Reviewer actions (wealth confidence conflict):**
- `accept_low_confidence`: proceed to Job C; dossier states "wealth indicators insufficient for confident band estimate"
- `request_additional_lookup`: trigger Factary re-run or Wealth-X request; adds cost and latency
- `wealth_unconfirmed`: proceed without wealth band; dossier states "no wealth band estimate available"

**Decision gate:** No Job C run until uncertainty_queue entry is resolved for that donor_id.

**Interface:** Markdown file plus CLI command `uncertainty resolve --donor-id <UUID> --action <action> [--identity-index N]`.

**Time budget:** Variable — entity resolution may require additional manual research. Target: ≤ 3 business days. Flag to project lead at 5 business days.

**Schema (uncertainty_queue table):**
```json
{
  "donor_id": "string (UUID)",
  "uncertainty_type": "entity_resolution | wealth_confidence | both",
  "conflict_description": "string",
  "entity_resolution_confidence": "number",
  "wealth_confirmation_confidence": "number",
  "resolution": "string | null",
  "resolved_by": "string | null",
  "resolved_at": "ISO8601 datetime | null"
}
```

---

## Checkpoint 4 — Final Dossier Sign-Off

**Trigger:** Job C SynthesisAgent has produced a LeadDossier. Review status = "pending".

**What humans see:**
- A formatted markdown file `reviews/dossier_{donor_id}.md` with standard sections:
  - Executive Summary (2–3 sentences)
  - Wealth Indicators (labelled [my estimate]; structural ceiling caveat present)
  - Network Connections (sourced; co-trusteeship links to Bloomsbury network)
  - Giving History (sourced from Factary Phi and open-source)
  - Recommended Approach (how to cultivate; suggested ask level)
  - Source List (all signal IDs and URLs)

**Reviewer actions:**
- `approve`: dossier copied to output/ folder; available to fundraising team
- `revision_requested`: specific sections flagged for revision; notes required; dossier sent back to Job C SynthesisAgent with revision instruction (adds ≤ 24h latency for batch re-run)
- `reject`: dossier archived to reviews/rejected/; record flagged; reason required

**Decision gate:** Approved dossiers only go to output/. No dossier is shared with fundraising team without sign-off.

**Interface:** In-file annotation in markdown plus CLI command `dossier approve --donor-id <UUID>` or `dossier reject --donor-id <UUID> --reason "..."`.

**Time budget:** Target ≤ 2 business days per dossier. Most dossiers reviewed in batches; allow one review session per week.

**Schema (dossier_reviews table):**
```json
{
  "donor_id": "string (UUID)",
  "dossier_version": "string",
  "decision": "approved | revision_requested | rejected",
  "reviewer_id": "string",
  "reviewed_at": "ISO8601 datetime",
  "revision_notes": "string | null",
  "rejection_reason": "string | null"
}
```

---

## Review File Locations

All human-facing review files are markdown in the reviews/ folder:

```
reviews/
  shortlist_YYYYMMDD.md          # Checkpoint 1 — batch shortlist
  tier2_review_{donor_id}.md     # Checkpoint 2 — per-candidate
  uncertainty_{donor_id}.md      # Checkpoint 3 — per-candidate
  dossier_{donor_id}.md          # Checkpoint 4 — per-candidate
  rejected/                      # Rejected dossiers archived here
output/
  dossier_{donor_id}.md          # Approved dossiers only
```

---

## Time Budget Summary

| Checkpoint | Trigger | Reviewer | Target SLA | Estimated Time/Batch |
|---|---|---|---|---|
| 1 — ShortlistGate | Tier 1 complete | Head of Fundraising | ≤ 2 business days | 2–4 hours for 20–40 candidates |
| 2 — Mid-Tier 2 review | Factary/Wealth-X returned | Head of Fundraising | ≤ 1 business day per candidate | 10–15 min/candidate |
| 3 — Uncertainty review | Confidence thresholds missed | Project lead or DPO | ≤ 3 business days | Variable; 30–60 min/case |
| 4 — Final dossier sign-off | Job C complete | Head of Fundraising | ≤ 2 business days | 15–20 min/dossier |

Total human time estimate at 200 records/month (20% shortlist = 40 candidates, ~30 reaching Job C): approximately **6–10 hours/month** [my estimate].
