# Human Checkpoints: Strategy 3 — Open-Source Agentic Pipeline

**Version:** 1.0 | **Date:** 2026-05-05

---

## Overview

Three mandatory checkpoints gate pipeline progression. No automated step bypasses these checkpoints. All decisions are logged with operator_id and timestamp.

```
Pipeline flow with checkpoints:

[Job A complete] → CHECKPOINT 1: Shortlist review
                       │
              [approved candidates only]
                       │
              [uncertainty escalations reviewed]
                       │ CHECKPOINT 2: Uncertainty threshold
                       │
              [approved leads]
                       │
              [Job C Opus batch runs]
                       │
              [Job C dossiers complete] → CHECKPOINT 3: Final sign-off
                                                │
                                        [approved_for_outreach]
```

---

## Checkpoint 1 — Shortlist Review (Mid-Pipeline)

**Trigger:** All Job A dossiers in a batch are complete. Candidates with `wealth_tier: probable_5m | confirmed_5m` are shortlisted automatically.

**Purpose:** Fundraiser reviews the co-trustee candidate shortlist and confirms which candidates are in scope before the expensive Job C Opus batch runs. This prevents Opus API costs being incurred for candidates the fundraiser already knows are unsuitable.

**Interface:** One markdown file per candidate at `reviews/short_YYYYMMDD_DONORNAME.md`

### File format

```markdown
# Shortlist Review: [DONOR_NAME]
**Tracking ID:** [UUID]
**Generated:** [ISO 8601 datetime]
**Wealth tier:** [confirmed_5m | probable_5m]
**Wealth basis:** [sourced summary, e.g. "PSC: 30% stake in [Company], confirmed; HMLR: overseas property via [Entity]"]

## Executive Summary
[3-sentence Job A summary]

## Top Co-Trustee Connections
1. [Co-trustee name] — shared at [Charity name] ([charity_number]) — connection_strength: [0.0–1.0]
2. [Co-trustee name] — shared at [Charity name] ([charity_number]) — connection_strength: [0.0–1.0]
3. [Co-trustee name] — shared at [Charity name] ([charity_number]) — connection_strength: [0.0–1.0]

## Corporate Connections
[CH appointments summary — company name, role, status]

## Adverse Signals
[Any adverse_media or sanctions-adjacent signals from WebSearchAgent or SanctionsResult]

## Reviewer Decision
<!-- Complete this section and save the file -->
decision: [approve | reject | hold]
notes: [optional — any context for the decision]
operator_id: [your ID]
```

**Decision schema:**
- `approve` — candidate proceeds to Job C enrichment
- `reject` — candidate is excluded; reason optionally noted; no further processing
- `hold` — candidate is paused pending additional information; operator must return within 7 days or record auto-expires to `reject`

**Time budget:** 5–10 minutes per candidate. For a batch of 20 shortlisted candidates, expect 90–120 minutes of fundraiser time.

**Pipeline behaviour:** Pipeline waits for review files to be saved. Polling interval: 60 seconds. Timeout: 72 hours. After timeout, a reminder is written to the log; operator must re-trigger manually.

**Automated routing to this checkpoint:** All records with `wealth_tier ≠ insufficient_signal`.

---

## Checkpoint 2 — Uncertainty Threshold Review

**Trigger:** Automatic; fires whenever any of the following conditions are detected, regardless of wealth tier:

| Threshold | Condition | Reason |
|---|---|---|
| Entity resolution confidence | < 0.85 | Wrong person's data may be in the dossier — all downstream signals are potentially wrong |
| Wealth confidence | `insufficient_signal` but GrantNav shows > £50k connected grants | Possible false negative in wealth scoring; may be a strong lead missed by the PSC/web path |
| Relationship strength | Lead co-trustee `connection_strength` < 0.6 | Weak connection may not justify an approach; human should validate |
| Adverse media | Any `adverse_media` signal, any confidence level | Reputational risk; fundraiser must review before any approach |

**Purpose:** These are records where the pipeline's automated confidence falls below the threshold for self-service progression. The fundraiser (or a senior reviewer for adverse media) decides whether to approve, reject, or request manual research.

**Interface:** One markdown file per escalated record at `reviews/uncertainty_YYYYMMDD_DONORNAME.md`

### File format

```markdown
# Uncertainty Review: [DONOR_NAME]
**Tracking ID:** [UUID]
**Generated:** [ISO 8601 datetime]
**Escalation reason(s):**
- [List of threshold breaches, e.g. "Entity resolution confidence: 0.72 (threshold: 0.85)"]
- [e.g. "Adverse media signal: [description], source: [URL]"]

## Entity Resolution Detail
[Candidates considered; scores; basis for uncertainty]

## Adverse Media (if applicable)
[Signal description, source URL, date]

## Wealth Scoring Detail
[Signals present; signals absent; scoring rationale]

## Reviewer Decision
<!-- Complete this section and save the file -->
decision: [approve_for_job_c | reject | request_manual_research | resolve_entity_manually]
entity_override: [officer_id or trustee_id if resolving entity manually]
notes: [required for any decision on an adverse_media escalation]
operator_id: [your ID]
```

**Decision options:**
- `approve_for_job_c` — reviewer is satisfied despite the threshold breach; proceeds to Job C
- `reject` — excluded from further processing
- `request_manual_research` — pauses the record; opens a manual research task; researcher adds findings to the record before re-review
- `resolve_entity_manually` — reviewer provides the correct entity ID to override the ambiguous resolution

**Time budget:** 10–20 minutes per uncertainty record (involves reading source materials). Adverse media cases may require DPO input before decision.

**Note on adverse media:** Any record with an adverse media signal must be reviewed by a senior fundraiser or the DPO before `approve_for_job_c` is set. This is a mandatory step, not advisory.

---

## Checkpoint 3 — Final Dossier Sign-Off

**Trigger:** Job C Opus dossier is complete for an approved lead.

**Purpose:** No prospect is approached without a human having read the complete dossier and made an explicit approval decision. This is the final safeguard against:
- Hallucinations passing undetected
- £5M+ confirmed/probable labels being misread or conflated
- Reputational risks missed in automated processing
- Approach strategy being inappropriate for the individual

**Interface:** One markdown file per dossier at `reviews/dossier_YYYYMMDD_DONORNAME.md`

### Sign-off block (appended to Job C dossier)

```markdown
---
## Sign-Off

**Dossier reviewed by:**
**Operator ID:**
**Date reviewed:**

**Checklist (tick each or note issue):**
- [ ] I have verified that £5M+ labels (confirmed vs. probable) are correctly applied
- [ ] I have reviewed all adverse signals and am satisfied this lead is appropriate for approach
- [ ] I accept that wealth estimates are probabilistic [my estimate] and not confirmed facts where labelled as such
- [ ] The connection path to Bloomsbury network is plausible and has been verified
- [ ] I am satisfied the source citations are genuine and the dossier does not contain unsourced claims

**Decision:** [approve_for_outreach | reject | hold_for_further_research]
**Approach notes (optional):** [suggested introducer, timing, context]
```

**Decision schema:**
- `approve_for_outreach` — dossier moves to `output/approved/` and enters the outreach pipeline
- `reject` — dossier moves to `output/rejected/`; reason recorded
- `hold_for_further_research` — record is paused; manual research task created; 30-day maximum hold period

**Time budget:** 15–25 minutes per dossier (reading a full Job C Opus dossier carefully). For a batch of 10 Job C dossiers, expect 3–4 hours of fundraiser time.

**Storage:** Approved dossiers in `output/approved/dossier_YYYYMMDD_DONORNAME.md`. All files retained for DSAR compliance period (see COMPLIANCE.md).

---

## Summary: Time Budgets Across All Checkpoints

| Checkpoint | Records affected | Time per record | Total (20 shortlisted, 10 Job C) |
|---|---|---|---|
| CP1 — Shortlist review | All `probable_5m` + `confirmed_5m` | 5–10 min | 90–120 min |
| CP2 — Uncertainty escalations | Estimated 20–30% of all records | 10–20 min | Variable; expect 60–90 min per batch of 20 uncertainty cases |
| CP3 — Final dossier sign-off | All approved Job C leads | 15–25 min | 150–250 min (for 10 Job C dossiers) |

**Total human review time estimate per 100-record batch:** ~6–9 hours [my estimate — based on time budgets above and assumed 20% uncertainty escalation rate and 10% Job C qualify rate].

---

## Audit Trail

All checkpoint decisions are written to the `audit_log` table with:
- `tracking_id`
- `checkpoint` (enum: shortlist_review | uncertainty_review | final_sign_off)
- `decision`
- `operator_id`
- `timestamp` (ISO 8601)
- `notes` (verbatim from review file)

Audit log entries are append-only and cannot be modified by the application layer. Full audit trail is queryable by tracking_id for DSAR and ICO compliance purposes (see COMPLIANCE.md §4 — DSAR procedure).
