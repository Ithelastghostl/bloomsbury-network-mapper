# Human Checkpoints — Strategy 5: Human-Led + Claude Copilot

## Overview

In Strategy 5, the checkpoints ARE the workflow. There is no automated quality gate, no approval queue, and no pipeline step that decides whether to proceed. The researcher decides at each checkpoint; the tooling records the decision and enforces that subsequent steps cannot run without it.

Three checkpoints apply to every donor record, in sequence. They cannot be bypassed (see Enforcement below).

---

## Checkpoint 1 — Initial Entity Confirmation

### Purpose

Before any research is used or shared, the researcher must confirm that the Companies House and Charity Commission records retrieved by the copilot refer to the correct individual — not a namesake, a dissolved entity, or a data entry error.

This checkpoint addresses the most common failure mode in automated prospect research: false positives from name collisions. A 0.5 FTE researcher who is interrupted or working quickly will be tempted to skip this step. Making it an enforced audit entry prevents that.

### What the researcher reviews

The researcher opens `working/<donor_id>/summary.md` (produced by `copilot.py enrich`) and reviews:

1. **Entity match section.** The copilot lists: name as found in CH/CC, DOB range (where available), address associated with officer record, and appointment count. The researcher confirms this is the intended individual using any additional identifiers available (e.g., the donor's employer, a known trustee role, a LinkedIn profile, or a previous gift reference in the CRM).

2. **Disambiguation table** (if shown). When the copilot found multiple CH officer matches, it printed a table of candidates and paused. The researcher must either:
   - Confirm which officer_id is correct and re-run with `--officer-id`
   - Confirm that no CH record exists for this individual and proceed with CC/360G data only
   - Mark the record as "identity unresolved" and pause research pending further information from the fundraising team

3. **False-positive removal.** The researcher reviews the list of corporate roles and trusteeships in the summary. Any role that clearly belongs to a different person (wrong postcode, incompatible DOB, company type inconsistent with donor background) is excluded using `copilot.py exclude`.

4. **Open questions.** The copilot flags open questions in `summary.md` (e.g., "Two CH officer records found with the same name and overlapping DOB range — confirm which is correct"). The researcher must address or explicitly acknowledge each open question before logging Checkpoint 1.

### Files the researcher works with

| File | Location | Action |
|---|---|---|
| `summary.md` | `working/<donor_id>/` | Read; confirms entity match |
| `signals.json` | `working/<donor_id>/` | Reviewed if needed; exclusions applied via CLI |
| Factary Phi | Researcher's browser (manual) | Optional cross-check for known donors |
| LinkedIn / Google | Researcher's browser (manual) | Identity confirmation for thin-footprint records |

### What the researcher records

```bash
copilot.py audit-log \
  --donor-id <id> \
  --checkpoint 1 \
  --researcher "Alice Brown" \
  --note "Confirmed: CH officer ID 123456 is the correct record. Excluded 1 false positive (Director of ABC Ltd — wrong DOB range). No disambiguation issues."
```

The `--note` field must not be blank. A note of "confirmed" without detail is insufficient; the audit log is the evidence record if a DSAR or regulatory enquiry asks how entity confirmation was performed.

### Enforcement

`copilot.py draft-profiles` refuses to run unless a Checkpoint 1 `audit_event` record exists for the donor in `audit.db`. This is a hard block, not a warning.

---

## Checkpoint 2 — Network Candidate Review

### Purpose

The researcher reviews each candidate profile drafted by Claude (from `copilot.py draft-profiles`) and decides:
- Is this the correct person (entity resolution, again)?
- Is the described connection genuine?
- What is the connection strength?
- Is this candidate worth including in the lead dossier?

This checkpoint is where the researcher adds their own contextual knowledge. A co-trustee role in the register is a fact; whether that co-trusteeship reflects a meaningful relationship or a coincidental appointment is a judgement. The researcher makes that judgement here.

### What the researcher reviews

1. **Each candidate profile** in `working/<donor_id>/profiles/`. Each profile contains:
   - Name and known roles (drawn from signals.json, CH, and CC)
   - Shared connection with the source donor (e.g., "Co-trustee of Charity X from 2019 to 2022")
   - Any wealth indicators the copilot found in the same signals data
   - Sources section listing the API endpoints used

2. **Connection strength assessment.** The copilot assigns `confirmed`, `probable`, or `possible` to each connection based on register evidence:
   - `confirmed`: both individuals appear as trustees/directors of the same entity with overlapping dates in the public register
   - `probable`: overlap inferred from related-charity traversal (e.g., both are trustees of charities in the same group, connected via a shared parent)
   - `possible`: inferred connection (e.g., both attended the same firm at the same time, derived from CH dates alone)
   The researcher may override any of these assessments and must record their reasoning in the score note.

3. **Researcher's own knowledge.** The researcher may know additional context not in the structured data:
   - "These two are on the same golf club board — I know this from a 2024 press piece, not in the register."
   - "This co-trusteeship is a family trust; they are siblings — adds to connection strength."
   The researcher adds this context as `researcher_notes` in `candidates.json`.

4. **Scoring and approval.** Each candidate is scored 1–5:
   - 5: strong, confirmed connection; known philanthropist; clear major gift prospect
   - 3: confirmed connection; limited public philanthropic footprint; moderate prospect
   - 1: confirmed connection but no evidence of philanthropic capacity or inclination

   Candidates with `approved_for_dossier: true` appear in the final dossier. Candidates with `approved_for_dossier: false` remain in `candidates.json` for audit purposes but are not drafted.

### Files the researcher works with

| File | Location | Action |
|---|---|---|
| `profiles/<candidate_name>.md` | `working/<donor_id>/profiles/` | Read and evaluate each profile |
| `candidates.json` | `working/<donor_id>/` | Updated via `copilot.py score-candidate` or `review-candidates` |
| Factary Phi | Researcher's browser | Cross-check on key candidates |
| Company accounts (CH) | companies.house.gov.uk | Manual review for PSC-listed candidates where wealth indicator is significant |

### What the researcher records

Scores and approvals are recorded via the interactive review command:

```bash
copilot.py review-candidates --donor-id <id> --researcher "Alice Brown"
```

This displays each candidate in turn and prompts for:
- Score (1–5)
- Approved for dossier (y/n)
- Note (free text; required if score < 3 or if overriding connection strength)

After completion, a Checkpoint 2 audit entry is automatically written to `audit.db` with a summary: "N candidates approved, M rejected."

Alternatively, the researcher can use `copilot.py score-candidate` for individual candidates.

### Enforcement

`copilot.py draft-dossier` refuses to run unless:
1. A Checkpoint 1 audit entry exists
2. At least one candidate in `candidates.json` has `approved_for_dossier: true`

If all candidates are rejected (plausible for thin-footprint records), the researcher must explicitly confirm this using:

```bash
copilot.py audit-log \
  --donor-id <id> \
  --checkpoint 2 \
  --researcher "Alice Brown" \
  --note "All candidates rejected — no network connections of sufficient confidence identified. Proceeding to individual dossier with no network section."
```

After this log entry, `draft-dossier` will run in "no-network" mode, omitting the Network Connections section.

---

## Checkpoint 3 — Dossier Sign-off

### Purpose

Before any dossier is released to the fundraising team, the researcher reviews the final drafted dossier for:
- Factual accuracy of every claim
- Completeness of citations
- Appropriate tone and absence of speculation
- Correct labelling of wealth estimates as estimates (not confirmed facts)
- Absence of any Claude hallucinations or misrepresentations

This is the last quality gate before the dossier leaves the research workflow and enters use. It is the researcher's professional responsibility, not a software function.

### What the researcher reviews

1. **Narrative accuracy.** Read the full dossier (`output/<donor_id>/dossier.md`) and verify each factual claim against the cited source. The source may be a Companies House URL, a Charity Commission API response, a 360Giving record, or a manually added web reference.

2. **Citations audit checklist:**
   - Every person's current role is cited
   - Every trustee appointment is cited with charity name, charity number, and CC register URL
   - Every PSC interest is cited with company number and CH register URL
   - Every wealth indicator is cited with its source and labelled as an estimate
   - Every network connection is cited with the shared entity and register source
   - No claim is made without a source in the Sources section

3. **Wealth estimate review.** Check that the Wealth Indicators section carries the required ceiling caveat: "All capacity estimates are derived from identified public indicators and should be treated as estimates, not confirmed figures." [from 03_reliability_ceiling.md]. If this caveat is absent, add it before sign-off.

4. **Claude error check.** Read each source URL in the Sources section and verify the source supports the claim as written. This step takes 5–10 minutes for a typical dossier. If any source does not support its claimed fact, the researcher corrects the dossier text directly in `output/<donor_id>/dossier.md` and notes the correction.

5. **Tone and compliance check.** The dossier must not:
   - Make assertions about an individual's private financial affairs beyond what is evidenced
   - Include information that was obtained without lawful basis (e.g., a source that is not public or not within scope of the LIA)
   - Describe an individual's personal or family circumstances in a way that would cause distress if disclosed
   If any of the above are present, the researcher redacts or corrects before sign-off.

### Files the researcher works with

| File | Location | Action |
|---|---|---|
| `dossier.md` | `output/<donor_id>/` | Read and edit directly if corrections needed |
| `signals.json` | `working/<donor_id>/` | Cross-reference claims against raw API data |
| Source URLs (in dossier) | External (browser) | Open and verify each source supports its claim |

### What the researcher records

```bash
copilot.py audit-log \
  --donor-id <id> \
  --checkpoint 3 \
  --researcher "Alice Brown" \
  --dossier-approved true \
  --note "All citations verified. Corrected one CH role date (resigned date was wrong in Claude draft — corrected to 2023-04-15 per CH register). Wealth caveat confirmed present."
```

The `--dossier-approved true` flag triggers the record to be marked as "approved for release" in `audit.db`. The export command (Story 6.3) requires this flag.

If the researcher finds significant errors that require a full re-draft, they should:
1. Run `copilot.py draft-dossier --donor-id <id> --researcher "Alice Brown"` to generate a new version
2. The previous draft is archived automatically
3. Review the new draft and log Checkpoint 3 again with `--dossier-approved true`

### Enforcement

`copilot.py export --donor-id <id>` is blocked unless a Checkpoint 3 audit entry with `dossier_approved: true` exists for the current dossier version.

---

## Audit Trail

All three checkpoint actions are recorded in `audit.db` as `audit_event` records (Schema 7 from ARCHITECTURE.md). The full audit trail for a donor record looks like:

```
event_id  | donor_id  | checkpoint | researcher   | timestamp           | action              | dossier_approved
----------|-----------|------------|--------------|---------------------|---------------------|------------------
uuid-001  | <id>      | 1          | Alice Brown  | 2026-05-06T09:15:00 | Entity confirmed    | null
uuid-002  | <id>      | 2          | Alice Brown  | 2026-05-06T14:30:00 | 3 approved, 1 rej   | null
uuid-003  | <id>      | 3          | Alice Brown  | 2026-05-07T11:00:00 | Dossier signed off  | true
```

This trail is the evidence record for:
- DSAR responses (demonstrating what information was held and when decisions were made)
- ICO compliance audit (demonstrating that human review was performed before output was used)
- Internal quality review (identifying which researcher approved which dossiers)
- DPIA accountability obligations (demonstrating that systematic review of each output was conducted)

The researcher should be aware that `audit.db` is a personal data record in its own right — it records the fact that a named individual was researched. It is therefore subject to the same retention and deletion obligations as `signals.json` and `dossier.md`. See COMPLIANCE.md §Data Retention.
