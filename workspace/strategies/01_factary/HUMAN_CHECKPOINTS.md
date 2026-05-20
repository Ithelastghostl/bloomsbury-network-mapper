# Human Checkpoints — Strategy 1: Factary Outsourced

Three stacked checkpoints. Each gate must be cleared in order; no checkpoint can be skipped.

---

## Checkpoint 1 — Batch Acceptance Review

**When:** Immediately after `ingest.py` completes and produces the ingested dossier summary. Before any dossier is seen by a gift officer.

**Who:** Fundraising coordinator (the person who manages the Factary relationship day-to-day). Does not require Director of Fundraising.

**Purpose:** Confirm the returned Factary batch is fit for purpose as a whole before spending reviewer time on individual records. Catches mismatched batches, anomalously high thin-profile rates, and any obvious data quality issues.

### Interface

A Markdown review file is generated at:
```
reviews/cp1_<batch_id>.md
```

Contents of the file:
```markdown
# Checkpoint 1 — Batch Acceptance Review
Batch ID: <batch_id>
Vendor: <vendor>
Exported at: <exported_at>
Ingested at: <ingested_at>
Turnaround (business days): <N>

## Summary
- Total dossiers received: N
- Matched to submitted records: N
- Unmatched dossiers: N  ← see unmatched_YYYYMMDD/ folder
- Thin profiles (dossier_quality = 'thin'): N (X%)
- Partial profiles (dossier_quality = 'partial'): N (X%)
- Substantial profiles (dossier_quality = 'substantial'): N (X%)
- Low vendor confidence (score < 60): N (X%)

## Decision
[ ] proceed
[ ] send_back — reason: ___
[ ] reject — reason: ___

## Reviewer notes
___

## Reviewer
Name: ___
Date: ___
```

The reviewer edits the file, checks the decision box, and runs:
```
review.py --submit 1 --batch-id <id>
```

### Decisions

| Decision | Trigger | Routing |
|---|---|---|
| **proceed** | Thin-profile rate ≤ 30%; unmatched ≤ 5%; turnaround ≤ 15 business days | Batch moves to Checkpoint 2 |
| **send_back** | Thin-profile rate > 30%; unmatched > 5%; systematic quality concern | Coordinator notifies Factary with notes; batch status set to `awaiting_redelivery`; original records remain in donors.db |
| **reject** | Batch is entirely misdirected (wrong organisation's data returned) or turnaround > 15 business days with no explanation | Batch archived; records returned to `pending_submission` state; fundraiser notified |
| **escalate** | Possible data breach (another organisation's data in the ZIP; personal data not matching any submission) | Fundraiser notifies Director of Fundraising and DPO within 1 hour; DPO assesses 72-hour breach notification obligation |

### Time budget

15–30 minutes. The coordinator reads the summary counts, samples 2–3 dossiers manually, and makes a proceed/send-back decision. This is a quality gate, not a detailed review.

**SLA:** Checkpoint 1 must be completed within 1 working day of `ingest.py` completing. An uncompleted Checkpoint 1 blocks the entire batch from progressing.

---

## Checkpoint 2 — Uncertainty Threshold Review

**When:** After Checkpoint 1 has returned `proceed`. Before individual dossiers are promoted to LeadDossier status.

**Who:** Senior fundraiser or Director of Fundraising. Requires someone with prospect research experience who can judge whether a thin or low-confidence dossier is worth proceeding with.

**Purpose:** Review every record flagged as low-confidence or thin — either by Factary's own confidence score or by the ingest pipeline. Prevents uncertain data from reaching gift officers without explicit human sign-off.

### Trigger conditions for flagging

A record is included in the Checkpoint 2 review file if any of the following are true:
- `vendor_confidence_score < 60` (Factary's own score, where provided)
- `dossier_quality = 'thin'` (zero or one sourced wealth indicator)
- `adverse_flags.adverse_media_summary` is non-null (any adverse media flag, however low-level)
- `adverse_flags.sanctions_hit = true` (must always appear here regardless of confidence score)
- `has_uncited_claims = true` on any field (Claude ingest flagged a field with no source)

### Interface

A Markdown review file is generated at:
```
reviews/cp2_<batch_id>.md
```

Contents per flagged record:
```markdown
## Record: <name> | tracking_id: <id>
Dossier quality: <thin|partial|substantial>
Vendor confidence score: <N> | Flag trigger: <reason>

### Wealth indicators
<list from EnrichedDonor.wealth_indicators, or 'none found'>

### Adverse flags
Sanctions hit: <true|false>
Adverse media: <summary or 'none'>

### Uncited fields
<list of fields with no source citation, or 'none'>

### Decision
[ ] proceed_with_caveat — caveat: ___
[ ] suppress — reason: ___
[ ] escalate — reason: ___

### Reviewer notes
___
```

The reviewer edits the file, records a decision for each flagged record, and runs:
```
review.py --submit 2 --batch-id <id>
```

### Decisions

| Decision | Effect |
|---|---|
| **proceed_with_caveat** | EnrichedDonor is marked `review_status = 'caveated'`; caveat text is stored; record enters qualification step. Gift officer will see the caveat. |
| **suppress** | EnrichedDonor is marked `review_status = 'suppressed'`; record does not enter qualification; audit log entry records reason. The record is not deleted — it can be reviewed again if new information arrives. |
| **escalate** | Director of Fundraising and DPO are alerted; record is held pending their decision. Used for: sanctions hits, serious adverse media, data that appears to belong to a different person. |

**Sanctions hit rule:** Any record with `sanctions_hit = true` must be escalated. It cannot be approved at this checkpoint without DPO sign-off. This is not discretionary.

### Time budget

30–60 minutes for a batch of 100 records assuming ~20–30% flagged (20–30 records). If the thin-profile rate is high, this checkpoint may take longer. A batch where >50% of records require Checkpoint 2 review should trigger a conversation with Factary about prospect list quality.

**SLA:** Checkpoint 2 must be completed within 3 working days of Checkpoint 1 approval. Uncompleted Checkpoint 2 blocks qualification.

---

## Checkpoint 3 — Final Dossier Sign-Off

**When:** After a LeadDossier has been generated (Stories 5.1–5.3) and the Claude-drafted summary narrative has been reviewed. Before any dossier is seen by a gift officer or used to inform donor contact.

**Who:** Director of Fundraising. This is a senior gate: the person signing off is accountable for the accuracy of the dossier and the appropriateness of the proposed cultivation approach.

**Purpose:** Final quality check. Confirms: the capacity estimate is appropriately caveated; the summary narrative is accurate and not misleading; the recommended contact approach is suitable; all citations are present. This is also the last opportunity to catch any compliance issue before the dossier enters active use.

### Interface

A Markdown review file is generated at:
```
reviews/cp3_<lead_id>.md
```

Contents:
```markdown
# Checkpoint 3 — Final Dossier Sign-Off
Lead ID: <lead_id>
Name: <name>
Capacity band: <band> | Confidence: <confirmed|estimated>
Capacity ceiling note: [MANDATORY] No UK public source covers the £5m–£350m band
systematically. This estimate is derived from identified indicators, not confirmed
net worth. Do not cite this figure as a fact.

## Summary narrative (Claude draft — review before approving)
<LeadDossier.summary_narrative>

## Wealth indicators
<table: indicator_type | value_band | confidence | source>

## Network connections
<list: connection_type | shared_entity | hops>

## Adverse flags
Sanctions: <true|false> | PEP: <true|null|false> | Adverse media: <summary>

## Citations
<all citations with source_name, URL, retrieved_at, confidence>

## Uncited claims flag
has_uncited_claims: <true|false>
<if true: list of uncited fields>

## Recommended ask
<LeadDossier.recommended_ask or 'not set'>

## Recommended contact route
<LeadDossier.recommended_contact_route or 'not set'>

## Decision
[ ] approve
[ ] request_amendment — required changes: ___
[ ] reject — reason: ___

## Override: uncited claims
[ ] I confirm I have reviewed the uncited claims and approve the dossier regardless
    Reason: ___

## Reviewer
Name: ___
Date: ___
```

The reviewer runs:
```
review.py --submit 3 --lead-id <id>
```

### Decisions

| Decision | Effect |
|---|---|
| **approve** | `LeadDossier.signed_off_by` and `signed_off_at` are set (immutable). Dossier is available for export via `export_dossier.py`. Audit log entry written. |
| **request_amendment** | Dossier status set to `amendment_required`; notes are stored. Fundraiser coordinator addresses the listed changes and re-submits for Checkpoint 3. |
| **reject** | Dossier status set to `rejected`; reason stored in audit log. The QualifiedLead is not deleted — it can be re-processed if new Factary data becomes available. |

**Hard blocks on approval (cannot be overridden without explicit written note):**
- `adverse_flags.sanctions_hit = true` — DPO must countersign before approval.
- `has_uncited_claims = true` without an override note — reviewer must explicitly confirm they have read the uncited fields.
- `capacity_ceiling_note` is null — the note is mandatory; the pipeline should never allow this, but the reviewer must confirm it is present.

### Time budget

20–45 minutes per dossier at full depth. In steady-state operation, the Director of Fundraising may review a batch of 5–10 dossiers in a single sitting (1.5–3 hours). Schedule a standing weekly review slot once the pipeline is live.

**SLA:** Checkpoint 3 must be completed within 5 working days of dossier generation. Uncompleted Checkpoint 3 blocks dossier export.

---

## Checkpoint Routing Summary

```
ingest.py completes
        │
        ▼
Checkpoint 1 (Coordinator, ≤1 day)
        │
   ┌────┴────────────────────┐
proceed              send_back/reject
   │                       │
   │                  → re-export or archive
   ▼
Checkpoint 2 (Sr. Fundraiser, ≤3 days)
   │
   ├── proceed_with_caveat → qualify.py → dossier.py
   ├── suppress → archived (no LeadDossier)
   └── escalate → DPO + Director
                       │
                    resolved → qualify.py → dossier.py
                       │
                    rejected → archived
                              │
                              ▼
                   Checkpoint 3 (Director of Fundraising, ≤5 days)
                              │
                    ┌─────────┼─────────┐
                 approve   amend     reject
                    │         │
              export_dossier  │
              .py             │
                        (loop back)
```
