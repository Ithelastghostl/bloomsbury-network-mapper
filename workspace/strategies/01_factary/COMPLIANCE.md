# Compliance — Strategy 1: Factary Outsourced

**Governing law:** UK GDPR (retained in DPA 2018), PECR 2003 as amended by DUA Act 2025, Fundraising Regulator Code of Fundraising Practice 2025.
**Sources:** 02_regulatory_frame.md throughout.

---

## 1. LIA Three-Step Test — Strategy 1 Specific Answers

### Step 1 — Purpose Test

**What is Bloomsbury trying to achieve?**
Identify which existing and prospective donors have the financial capacity and philanthropic inclination to make major gifts (£25,000+), enabling the Director of Fundraising to prioritise cultivation effort and advance Bloomsbury's charitable objects (expanding access to football for young people in London's most deprived areas).

**Who benefits?**
Primarily Bloomsbury as an organisation, which uses major gift income to fund subsidised places, hub expansion, and inclusion programmes. The indirect beneficiary is the charitable cause — 6,500+ young people weekly, with a target of 20,000 by 2028.

**Is the interest genuine, lawful, and not contrary to public policy?**
Yes. The ICO recognises that charities have a legitimate interest in identifying potential major donors. Prospect research and wealth screening are established practice in the UK charity sector, provided they are disclosed. The Fundraising Regulator Code of Fundraising Practice does not prohibit wealth screening; it requires it to be conducted ethically and transparently.

**Conclusion:** Purpose test passed.

---

### Step 2 — Necessity Test

**Is passing donor records to Factary necessary to achieve the purpose?**
Yes, with qualifications. The open-source alternative (Companies House + Charity Commission data queried internally) can provide structural data on directorships and trusteeships but cannot provide the philanthropic donation history, wealth proxies, and integrated capacity assessment that Factary Phi and managed screening deliver. For Job A (donor enrichment) and Job C (£5M+ qualification), the information needed to assess major gift capacity is not practically accessible without a specialist provider — internal assembly of equivalent data would require a full-time researcher.

**Is this the minimum data needed?**
Bloomsbury submits: name, postcode, donation history, and consent metadata. It does not submit: date of birth, national insurance number, financial account details, or special category data. The data set is proportionate to the screening purpose.

**Could a less privacy-intrusive method achieve the same result?**
For network discovery (Job B), the Charity Commission and Companies House open data achieves ~90–95% recall without a third-party processor. If Job B were the only goal, third-party screening would not be necessary. However, Jobs A and C require the specialist philanthropic database and integrated capacity assessment that only a managed service currently provides in the UK.

**Document this explicitly in the LIA:** The necessity argument should be recorded as: "We have considered whether open-source data alone is sufficient. For network discovery it largely is; for donor enrichment and wealth qualification it is not. Factary provides the philanthropic donation history (Factary Phi) and integrated capacity methodology that has no equivalent in freely available UK data."

**Conclusion:** Necessity test passed, with the open-source-for-Job-B caveat documented.

---

### Step 3 — Balancing Test

**Factors weighing for Bloomsbury:**
- Donors who have already given to Bloomsbury have an existing relationship and a reasonable expectation that their details will be used to understand their giving capacity.
- The processing uses publicly available information compiled by Factary, not private financial records.
- Bloomsbury's privacy notice (once updated per §4 below) will disclose prospect research and wealth screening. Donors can object at any time.
- The impact on individuals is low: no automated decision with legal effect; no credit decision; no adverse consequence other than being approached for a gift.
- The Fundraising Regulator Code requires Bloomsbury to treat donors respectfully and in accordance with their wishes — a robust opt-out process satisfies this.

**Factors weighing against Bloomsbury:**
- Individuals who are merely on a mailing list or have made small past donations may not expect their data to be used for wealth screening.
- New contacts identified via network discovery (NetworkCandidates) have no prior relationship with Bloomsbury at all — the balancing test is harder to pass for this group.
- Processing involves financial capacity inferences, which the ICO treats as sensitive in the context of the balancing test.

**Conclusion:** Balancing test passes for existing donors with a relationship, provided the privacy notice clearly discloses the practice. For NetworkCandidates with no prior relationship, the balancing test is more marginal — the Article 14 notice (§4) must be issued within 30 days of first processing their data, and they must be offered an easy opt-out before any contact is made. Story 9.3 implements the compliance checklist for this group.

**Documentation requirement:** The completed three-step LIA must be a written document, retained as part of Bloomsbury's accountability records, signed by the Director of Fundraising and reviewed by the DPO. Reference: `compliance/LIA_strategy1_vN.pdf`. The `lia_ref` field in every DonorRecord must point to a specific version of this document.

---

## 2. Is Factary a Data Processor or a Joint Controller?

**This must be resolved before the first data transfer.** The answer determines which legal instrument governs the relationship.

**Processor (Article 28):** Factary processes personal data only on Bloomsbury's documented instructions, for Bloomsbury's purposes, and deletes/returns all data at contract end. Bloomsbury remains the sole controller.

**Joint controller (Article 26):** Factary also processes the submitted data for its own purposes — for example, enriching its own Factary Phi database with new donation signals, or retaining profiles for future screening requests from other clients. In this case, Bloomsbury and Factary are joint controllers and must execute a joint controller agreement determining each party's responsibilities.

**Factary's public position (from 02_regulatory_frame.md §7):** Factary's Guide to GDPR-Compliant Wealth Screenings (factary.com, accessed 2026-05-05) is described as explicitly designed for the GDPR compliance context. However, their post-2019 methodology was rebuilt specifically because they could no longer maintain a pre-compiled individual database under legitimate interest — they deleted it. This history suggests Factary does not retain submitted individual records for its own database purposes. But this must be confirmed contractually, not assumed.

**Action required at procurement:**
1. Ask Factary directly: "Do you retain any personal data submitted by clients for your own purposes after the screening engagement?" and "Do you enrich your own databases using submitted records?"
2. If the answer to either is yes: negotiate a joint controller agreement under Article 26 in addition to or instead of the Article 28 DPA.
3. If the answer is no: proceed with Article 28 DPA only.
4. Record this exchange in writing and retain it in `compliance/vendor_due_diligence/factary/`.

**Working assumption for this document:** Factary operates as a data processor. The Article 28 DPA is the required instrument. This assumption must be verified at procurement.

---

## 3. DPIA Hot-Spots for the Outsourced Model

A DPIA is required under UK GDPR Article 35 because the Strategy 1 screening operation engages at least three of the nine WP248/ICO criteria [02_regulatory_frame.md §3]:

- **Criterion 1 (evaluation/scoring):** Factary produces a financial capacity estimate for each record.
- **Criterion 5 (large-scale processing):** Once Bloomsbury screens its full donor list (potentially 500–2,000 records), this qualifies.
- **Criterion 6 (data matching):** Factary combines submitted records with property, Companies House, charity register, and press sources.

**Additionally:** The 2016–2017 ICO enforcement actions against UK charities for undisclosed wealth screening (02_regulatory_frame.md §6) make a DPIA strongly advisable as a risk management step even if the volume does not formally trigger it.

### Hot-spot 1: Transfer to Factary is an irrecoverable step

Once encrypted files are sent to Factary, Bloomsbury cannot unilaterally retrieve or delete them until the contract's deletion clause activates. If a donor exercises their right to erasure after the batch has been exported but before Factary returns dossiers, Bloomsbury must notify Factary immediately and Factary must confirm deletion within a defined timeframe. The DPA must include this obligation explicitly. **Story 9.1 enforces the DPA-prerequisite check before export.**

### Hot-spot 2: Sub-processors used by Factary

Factary may use sub-processors (data aggregators, hosting providers) that Bloomsbury has not specifically authorised. Under Article 28(2), Factary cannot engage new sub-processors without Bloomsbury's prior written authorisation. **Action: obtain Factary's current sub-processor list at procurement and require notification of changes.**

### Hot-spot 3: NetworkCandidates are data subjects Bloomsbury did not originally collect data from

Article 14 of UK GDPR requires a privacy notice to be issued to data subjects whose data was not collected directly from them — within one month of obtaining their data. Every NetworkCandidate who is not already in Bloomsbury's records is a new Article 14 subject. **Story 9.3 implements the compliance checklist. The DPIA must record this obligation and the process for meeting it.**

### Hot-spot 4: Capacity estimates labelled as estimates, not facts

If a capacity estimate derived from Factary screening were treated internally as a confirmed wealth figure and used to set a specific gift ask (e.g., "we have confirmed this person has £10m"), this could constitute profiling with significant effects under Article 22. The mandatory `capacity_ceiling_note` field (Story 4.3) and the Checkpoint 3 hard block on approving dossiers without the caveat are the primary mitigations. The DPIA must record that estimates are not used as inputs to automated decisions with legal effects.

### DPIA documentation

File location: `compliance/DPIA_strategy1_vN.pdf`. The DPIA must be completed and signed before the first batch is exported. ICO template: ico.org.uk (link in 02_regulatory_frame.md). Review annually or when the processing changes materially (e.g., adding a new vendor, expanding the donor population screened).

---

## 4. Data Retention Policy

| Data category | Retention period | Basis | Action at end of period |
|---|---|---|---|
| Submitted DonorRecord (original intake) | 3 years from submission date, or until donor relationship ends, whichever is later | ICO guidance: retain as long as necessary for the purpose; major gift cultivation cycles run 2–3 years | Archive to `archive/` folder (not deleted in v1 per FILE DELETION POLICY); DPO reviews annually |
| EnrichedDonor (Factary-returned dossier) | 2 years from dossier sign-off date (Checkpoint 3) | Capacity assessments become stale; re-screening is required after 2 years | Suppress from active workflow; retain audit trail record; redact personal fields on DSAR request |
| LeadDossier | 3 years from creation, or until the donor relationship ends | Active cultivation period | Archive; gift officer notes removed on donor opt-out |
| NetworkCandidate | 2 years from creation, or until Article 14 notice opt-out received | New data subjects have shorter legitimate expectation window without a relationship | Suppress and archive |
| HumanReview decisions (audit log) | 7 years from decision date | Accountability obligations; ICO enforcement window | Retain in audit_log (no personal data in audit entries beyond tracking_id and reviewer name) |
| Consent metadata | Indefinitely (immutable record of lawful basis) | Accountability principle, Article 5(2) | Do not delete; redact personal fields but preserve lia_ref and privacy_notice_version |

**Periodic review:** DPO reviews the donor database for records beyond their retention period at least annually. Story 7.3 (`redact.py`) implements the technical erasure mechanism.

---

## 5. DSAR Procedure

A Data Subject Access Request (DSAR) or erasure request must be responded to within one calendar month [ICO guidance, UK GDPR Article 12].

### Step-by-step procedure (must be working procedure, not aspirational)

**Day 0 — Request received:**
- Fundraising coordinator receives request by email or post.
- Forward immediately to DPO and Director of Fundraising.
- Log in `compliance/dsar_log.csv`: date received, subject name, request type (access/erasure/restriction), tracking_id if known.

**Day 1–3 — Identity verification:**
- Confirm the requester's identity. Do not disclose or erase any data until identity is confirmed.
- If tracking_id is unknown: run `audit.py --name "<name>"` to locate records. If multiple matches, request additional identifying information (e.g., postcode, email).

**Day 3–7 — Scope the data held:**
- Run `audit.py --tracking-id <id>` to retrieve the full audit trail.
- Identify all tables holding data for this individual: donors, enriched_donors, network_candidates, batch_submissions, audit_log.
- Identify any data shared with Factary: check `batch_submissions` for their tracking_id and `exported_at` timestamp.

**For an access request (SAR):**
- Prepare a summary of all personal data held, in plain English.
- Include: what data is held, where it came from (Bloomsbury's own records vs. Factary-returned dossier), the lawful basis for processing, and any sharing with third parties (Factary/Prospecting for Gold, under DPA).
- Do not include other donors' data. Redact third-party personal information before responding.
- Send response by Day 28.

**For an erasure request:**
- Confirm whether any exemption applies (e.g., legal obligation to retain audit log entries — these are retained but personal fields are nullified).
- Run `redact.py --tracking-id <id>` (Story 7.3) to nullify personal fields in all tables.
- Notify Factary in writing that they must delete all data relating to this individual that was submitted by Bloomsbury (per Article 28(3)(e): processor must assist controller in fulfilling data subject rights). Retain Factary's confirmation of deletion.
- Confirm to the requester that erasure has been completed, including the date.
- Send response by Day 28.

**For an opt-out from direct marketing:**
- Set `consent_metadata.opt_out_date` on the donor record immediately.
- Record is blocked from future batch exports (Story 1.2 AC3).
- Confirm to the requester. This must happen "without delay" and no later than Day 28 [ICO, Article 21].

**Day 28 — Deadline:**
- If for any reason the response cannot be completed by Day 28, notify the requester of the delay and provide a revised date (maximum 3 months total).

**Template files:** `compliance/templates/sar_response.md`, `compliance/templates/erasure_confirmation.md`.

---

## 6. Privacy Notice Clause Additions

The following clauses must be added to Bloomsbury's public privacy notice before the first batch is submitted to Factary. Without these additions, the processing is not fairly disclosed and the balancing test in the LIA is not passed.

**Add to the "How we use your data" section:**

> **Prospect research and wealth screening**
> We use information you provide to us, together with information from publicly available sources, to assess whether you or others connected to you may have the capacity to make a major gift to support Bloomsbury Football Foundation's charitable objectives.
>
> This may include passing your name, postcode, and giving history to specialist third-party prospect research firms (currently Factary and/or Prospecting for Gold) who compile a profile using public records including the Charity Commission register, Companies House filings, HM Land Registry data, and published philanthropy records. We do this under the lawful basis of **legitimate interest**: we have a genuine and proportionate interest in identifying individuals who may wish to support our work at a major gift level.
>
> We will tell you about this processing if we identify you through this research and you have not previously been in contact with us (as required by UK GDPR Article 14). You can object to your data being used for this purpose at any time by contacting [data@bloomsburyfootball.com].

**Add to the "Who we share your data with" section:**

> **Prospect research providers:** We may share your name, contact details, and giving history with Factary (factary.com) and/or Prospecting for Gold (prospectingforgold.co.uk) solely for the purpose of prospect research described above. These firms act as our data processors under a written Data Processing Agreement. They do not use your data for their own purposes.

**Add to the "Your rights" section (explicitly, separately, as ICO requires for direct marketing objection):**

> **Your right to object to this processing:** You have the right to object to your data being used for prospect research and major gift cultivation at any time. To exercise this right, contact [data@bloomsburyfootball.com]. We will stop processing your data for this purpose immediately.

**Timing:** Privacy notice must be updated before the first batch is exported. Version number must be incremented and the new version registered in `config/privacy_notices.json`.

---

## 7. Third-Party Processor DPA Requirements for Factary

The following obligations must be included in the Article 28 DPA with Factary (and with Prospecting for Gold if used). This is a working checklist for the procurement conversation, not a template DPA.

| Obligation | Required clause | Notes |
|---|---|---|
| Process only on Bloomsbury's instructions | "Factary shall process personal data only on documented instructions from Bloomsbury Football Foundation, unless required to do so by applicable law." | Standard Article 28(3)(a) |
| Staff confidentiality | All staff with access to submitted data must be bound by confidentiality obligations. | Article 28(3)(b) |
| Security measures | Factary must implement appropriate TOMs commensurate with the risk, including: encrypted file transfer, access controls, pseudonymisation of submitted records where feasible. | Article 28(3)(c); ask for ISO 27001 certificate or equivalent |
| Sub-processor authorisation | Factary must not engage new sub-processors without Bloomsbury's prior written authorisation. Current sub-processor list must be provided at contract signature. | Article 28(2) |
| Data subject rights assistance | Factary must assist Bloomsbury in responding to DSARs, erasure requests, and restrictions within 7 days of Bloomsbury's written request. | Article 28(3)(e) |
| DPIA and breach assistance | Factary must notify Bloomsbury of any personal data breach affecting submitted data within 24 hours of discovery. Factary must assist in any DPIA or ICO notification process. | Articles 28(3)(f) and 33 |
| Deletion at contract end | Within 30 days of contract termination or on Bloomsbury's written request, Factary must delete all personal data submitted by Bloomsbury and provide written confirmation of deletion. | Article 28(3)(g) |
| Audit rights | Bloomsbury has the right to audit Factary's processing activities on reasonable notice, or to commission an independent auditor. | Article 28(3)(h) |
| No retention for own purposes | Factary does not retain submitted data for its own database or for future screening engagements with other clients. (Verify this is the correct characterisation — see §2 above.) | Confirm at procurement |
| Data portability | At contract end, Factary must provide all enriched dossiers and source citations in a machine-readable format (JSON or CSV). | Not a statutory requirement but strongly advisable |
| Jurisdiction | Data must not be transferred outside the UK/EEA without Bloomsbury's written agreement and an appropriate safeguard (standard contractual clauses if applicable). | Article 44+ |

**DPA file location:** `compliance/vendor_due_diligence/factary/DPA_signed_vN.pdf`. Must be in place before `config/vendors.json` can be set to `approved = true` for Factary.
