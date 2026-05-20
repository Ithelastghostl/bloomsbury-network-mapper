# Human Checkpoints: Strategy 2 — Commercial API Stack + Claude Synthesis

Three checkpoints are defined. Each is triggered by a specific pipeline condition, produces a file in `reviews/`, and blocks the pipeline until a reviewer decision is recorded. All checkpoints are logged in `audit_events`.

---

## Checkpoint 1 — Entity Resolution Confidence Review

### Trigger
EntityResolver produces a `confidence` score < 0.85 for the best candidate match. This indicates the pipeline cannot reliably identify which Companies House or Charity Commission record corresponds to the submitted donor name.

### Why this matters
A wrong entity merge at this stage causes every subsequent API call — including calls to US commercial vendors that constitute restricted international data transfers — to be made under an incorrect identity. A wrong merge in DonorSearch or Wealth-X creates a composite dossier attributed to the wrong person. For Job C, this means a false sanctions flag or fabricated capacity narrative on the wrong individual. This is the highest-consequence error in the pipeline.

### Who reviews
Prospect researcher (or fundraiser who submitted the record). Not a compliance decision — it is an identity confirmation task.

### Interface
Review file written to: `reviews/checkpoint1/{job_id}.md`

File schema:
```markdown
# Checkpoint 1: Entity Resolution Review
**Job ID:** {job_id}
**Submitted name:** {name}
**Submitted DOB (if provided):** {dob_month}/{dob_year}
**Submitted address (if provided):** {address}
**Confidence score:** {score} (threshold: 0.85)

## Candidates

### Candidate 1 (score: {score})
- **Name (CH/CC):** {candidate_name}
- **DOB (CH/CC):** {dob}
- **Address:** {address}
- **Companies House profile:** {url}
- **Charity Commission trustee entries:** {url}
- **Match rationale:** {EntityResolver explanation}

### Candidate 2 ...

## Reviewer decision
<!-- Edit this section to record your decision -->
**Selected candidate:** [enter candidate number, OR "none — new record" if no match is correct]
**Reviewer:** [name / initials]
**Reviewed at:** [timestamp]
**Notes:** [optional]
```

### Routing logic
- Reviewer selects a candidate → pipeline resumes fan-out with `selected_id` from that candidate
- Reviewer selects "none — new record" → fan-out proceeds with name-only match against commercial vendors (lower confidence); flagged in dossier
- Record unreviewed after **24 hours** → escalated to fundraising director via audit log notification; pipeline paused

### Time budget
≤ 15 minutes per record. Expected volume: ~15% of submissions (records with common names, missing DOB/address, or no CH/CC record) [my estimate].

---

## Checkpoint 2 — Uncertainty Threshold Review

### Trigger
WealthScorer produces `wealth_confidence < 0.70` OR `relationship_score < 0.60` for a record that has completed Job A synthesis. These thresholds indicate the pipeline's output lacks enough signal to warrant automatic progression to Job C enrichment, but the record may still be worth a human look before archiving.

### Why this matters
The commercial pipeline is calibrated for records where at least some signal exists. Below these thresholds, the pipeline is in territory where it cannot reliably distinguish a promising prospect with a sparse footprint from a non-prospect. Automatically archiving such records risks losing high-value individuals who happen to have low public profiles (a known characteristic of the most private wealth holders). Automatically escalating all of them to Job C wastes Opus API budget.

### Who reviews
Prospect researcher. Decision requires familiarity with the charity's existing donor relationships to apply contextual judgement.

### Interface
Review file written to: `reviews/checkpoint2/{job_id}.md`

File schema:
```markdown
# Checkpoint 2: Uncertainty Threshold Review
**Job ID:** {job_id}
**Donor name:** {name}
**Wealth confidence score:** {wealth_confidence} (threshold: 0.70)
**Relationship score:** {relationship_score} (threshold: 0.60)
**Triggered because:** {which threshold(s) failed}

## Dossier summary
**Wealth band:** {band} ({label})
**Philanthropic indicators found:** {count} signals
**Corporate roles found:** {count} signals
**Network connections to Bloomsbury trustees:** {count} (hops: {min_hops})
**US bias warning:** {true/false}
**Commercial vendor coverage:** {list of vendors that returned results / not_found}

## Signals present
{list of source_signal_ids with brief description}

## Signals absent
{list of signals expected for this record type but not found}

## Reviewer options
<!-- Edit this section to record your decision -->
**Decision:** [one of: approve_for_job_c | archive | request_additional_research]
**Reviewer:** [name / initials]
**Reviewed at:** [timestamp]
**Notes:** [optional — required if decision is request_additional_research]
```

### Routing logic
- `approve_for_job_c` → record added to Redis queue "job_c"; proceeds to Opus synthesis
- `archive` → record written to archived dossiers table with `status = archived_human`; no further processing
- `request_additional_research` → record paused; fundraiser notified to provide additional context (e.g., a known relationship not captured in the data); record re-submitted once additional context is added

### Time budget
≤ 30 minutes per record. Expected volume: ~25% of records proceeding past Job A [my estimate — records with sparse footprints, UK-only donors not found in commercial sources].

---

## Checkpoint 3 — Final Dossier Sign-Off

### Trigger
LeadDossier produced by Claude Opus (Job C) is ready for release to the cultivation team. This checkpoint applies to every dossier before it is released, regardless of confidence scores.

### Why this matters
The dossier will be used to inform a major gift approach. An error in the wealth estimate, a wrong sanctions flag, or a fabricated biographical claim could damage a donor relationship or expose the charity to reputational risk. No automated pipeline output leaves the system without a named human reviewer taking accountability.

This checkpoint is also the compliance gate: the reviewer confirms that the dossier is accurate, the sources are legitimate, and the prospecting approach is proportionate (consistent with the LIA and DPIA completed under COMPLIANCE.md).

### Who reviews
Director of Fundraising (Anthony Hayman) or a designated deputy. Not delegable below fundraising manager level.

### Interface
Review file written to: `reviews/checkpoint3/{job_id}.md`

File schema:
```markdown
# Checkpoint 3: Final Dossier Sign-Off
**Job ID:** {job_id}
**Donor name:** {name}
**Prepared at:** {timestamp}
**Opus model version:** {model_id}

---
{full LeadDossier content}
---

## Reviewer checklist
<!-- Complete before signing off -->
- [ ] Every wealth claim carries the correct confidence label ([verified] / [vendor_estimate] / [my_estimate])
- [ ] Sanctions status is confirmed clear (or flagged with specific regime noted)
- [ ] Capacity narrative is grounded in cited sources — no unsourced claims
- [ ] Relationship path to Bloomsbury trustees is accurate (or correctly labelled as not found)
- [ ] US bias warning (if present) acknowledged — dossier limitations noted
- [ ] Adverse media summary (if present) is sourced and not fabricated
- [ ] Prospecting approach is proportionate to the individual's known relationship with the charity

## Decision
<!-- Edit to record decision -->
**Decision:** [one of: approved | rejected | edited]
**Reviewer:** [full name]
**Role:** [job title]
**Reviewed at:** [timestamp]
**Notes (required if rejected or edited):**
```

If the reviewer edits the dossier content directly in the markdown file, `decision = edited` is recorded; the edited version is what is copied to `output/`.

### Routing logic
- `approved` → dossier copied to `output/{job_id}.md`; audit log entry `dossier_released`
- `edited` → edited dossier copied to `output/{job_id}.md`; audit log entry `dossier_released_edited`
- `rejected` → dossier archived; audit log entry `dossier_rejected`; reason recorded

### Time budget
≤ 60 minutes per dossier. For a batch of 20 qualifying leads, allow 1–2 working days for this checkpoint.

### Escalation
Records unreviewed at Checkpoint 3 after **72 hours** are escalated to the CEO (Charlie Hyman) via audit log notification. Dossiers are never automatically released without a signed review.

---

## Summary Table

| Checkpoint | Trigger | Reviewer | Time budget | File location |
|---|---|---|---|---|
| 1 — Entity resolution | Confidence < 0.85 | Prospect researcher | ≤15 min | `reviews/checkpoint1/{job_id}.md` |
| 2 — Uncertainty threshold | Wealth conf. < 0.70 OR relationship score < 0.60 | Prospect researcher | ≤30 min | `reviews/checkpoint2/{job_id}.md` |
| 3 — Final sign-off | Every Job C dossier before release | Director of Fundraising | ≤60 min | `reviews/checkpoint3/{job_id}.md` |

All decisions are recorded in `audit_events` with reviewer identity, timestamp, and decision. The pipeline does not release any dossier without a Checkpoint 3 record.
