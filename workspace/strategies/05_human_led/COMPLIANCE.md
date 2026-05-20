# Compliance — Strategy 5: Human-Led + Claude Copilot

**Applicable law:** UK GDPR (as retained in DPA 2018), PECR 2003 (as amended by DUA Act 2025), Fundraising Regulator Code of Practice 2025.
**Primary reference:** 02_regulatory_frame.md (binding sources), 07_ranking_and_recommendation.md (strategy context).

---

## 1. Legitimate Interest Assessment (LIA)

Strategy 5 is the easiest of the five strategies to defend under the three-step LIA test (02_regulatory_frame.md §2), for the following reasons:

**Step 1 — Purpose test.** The purpose is identifying individuals capable of making major gifts to support Bloomsbury Football Foundation's charitable objects. The Foundation's stated mission (serving 6,500+ young people weekly, targeting 20,000 by 2028) provides a clear and genuine purpose [from 01_context.md]. A reasonable person who has donated to or engaged with the Foundation would recognise that it might conduct due diligence research before approaching them about a significant gift.

**Step 2 — Necessity test.** Prospect research using public registers (Companies House, Charity Commission, 360Giving) is a targeted and proportionate method of assessing philanthropic capacity. The researcher consults only public information. No data matching across purchased lists, no third-party wealth screening of personal financial data, and no profiling via private credit or commercial databases unless the optional Factary Phi route is used (see §6 below).

**Step 3 — Balancing test.** Factors in favour: processing uses only publicly available information; existing donor relationships create reasonable expectation of continued engagement; no automated decision with significant effects is made; each output is reviewed by a human researcher. Factors against: individuals with no existing relationship with the Foundation are researched as network candidates; wealth indicators are estimated, not provided by the individual. On balance, the human-review design, the restriction to public sources, and the Foundation's charitable purpose weigh in favour of legitimate interest.

**Documentation required:** A written LIA must be completed and retained before the first donor record is processed. The LIA should reference this document, 02_regulatory_frame.md, and the specific donor segments and data sources used. The ICO template (ico.org.uk/media2/for-organisations/forms/2258435/gdpr-guidance-legitimate-interests-sample-lia-template.docx) should be used.

The LIA for Strategy 5 is simpler to draft and defend than for Strategies 2–4, because there is no automated profiling pipeline, no algorithmic scoring, and no combination of datasets at scale. The LIA covers the researcher's manual workflow; the human nature of the process reduces both the privacy impact and the complexity of the balancing test.

---

## 2. DPIA

A DPIA is required **even though Strategy 5 is human-led and does not involve automated profiling**. The trigger is the nature of the data processed, not the method of processing.

**Why a DPIA is still required:**

The three-step criterion analysis from 02_regulatory_frame.md §3 applies:

- **Criterion 1 — Evaluation or scoring:** The researcher assesses an individual's financial capacity and philanthropic inclination. This is evaluation of a natural person's personal characteristics.
- **Criterion 4 — Sensitive or highly personal data:** Financial capacity estimation involves data of a highly personal nature, even when derived from public sources.
- **Criterion 6 — Data from multiple sources:** The researcher combines Companies House data, Charity Commission data, 360Giving data, and web search results to build a profile. This is data combination.

Two or more criteria are met. A DPIA is therefore required before the first donor record is processed [from 02_regulatory_frame.md §3].

**DPIA hot-spots for Strategy 5:**

1. **Wealth estimation from proxy signals.** Even without a commercial screening tool, the researcher is forming a view of an individual's financial capacity from PSC interests, property addresses, and philanthropic giving records. The DPIA must assess whether this is proportionate to the purpose and whether individuals would reasonably expect it.

2. **Network candidates who have no existing relationship with the Foundation.** When a researcher identifies a co-trustee as a prospect, that individual has not chosen to engage with Bloomsbury. They are being researched without their knowledge. The DPIA must address the Article 14 notice obligation (see §4 below).

3. **Researcher's local data storage.** All data is held on the researcher's workstation and in a local SQLite database. The DPIA must assess the security of this arrangement — particularly if the researcher works on a personal or shared machine. Recommendation: encrypted storage; full-disk encryption; no data on unencrypted removable media.

4. **Factary Phi optional use.** If the researcher uses Factary Phi to cross-check philanthropic records, this is a manual researcher action (not a data transfer to a processor), but it may involve the researcher entering personal data (a name) into Factary's platform. The DPIA should note this and confirm that it is within the scope of Factary's terms of use.

**The human nature of the process does not remove the DPIA trigger.** The ICO's criteria are based on the nature of the processing and its potential impact on individuals, not on whether a machine or a human performs it. A researcher manually combining public data to produce wealth estimates engages the same criteria as an automated pipeline doing the same thing.

---

## 3. Data Retention

All personal data processed under this strategy must be subject to a documented retention schedule. Recommended periods:

| Data category | Retention period | Basis |
|---|---|---|
| Donor records (`donor_record` JSON) with no approved dossier | Delete 6 months from creation if no Checkpoint 3 sign-off | No ongoing purpose |
| Approved dossiers and signals data | 3 years from date of Checkpoint 3 sign-off | Supports ongoing fundraising relationship; review at each annual cycle |
| Audit log entries (`audit.db`) | Same retention as the donor record they relate to | Must be deleted when the donor record is deleted |
| Network candidate records (`candidates.json`) | Same as parent donor record | Part of the same processing purpose |
| DSAR export folders | 30 days from export date | Fulfil the DSAR purpose; no reason to retain export copies longer |
| Sanctions FLAGGED records | Retain until resolved; alert fundraising director | Compliance record |

**Retention review:** The researcher should run `copilot.py retention-report` (Story 8.2) annually and present the output to the DPO or data protection lead. The DPO confirms which records should be deleted. Deletion is performed by the researcher using `mv` to a `Bin/` folder in the working directory, then permanently deleted after DPO sign-off (per the FILE DELETION POLICY in the user-level CLAUDE.md).

---

## 4. DSAR Procedure

Strategy 5 has the simplest DSAR procedure of all five strategies. All personal data is held locally on the researcher's machine in a structured folder (`working/`, `output/`, `audit.db`). There are no third-party processors holding personal data on the Foundation's behalf in the automated pipeline (as there would be in Strategies 2–4). The Factary Phi optional use does not result in personal data being held by Factary — the researcher queries Factary's own database; no donor data is uploaded.

**When a DSAR is received:**

1. The fundraising director or DPO notifies the researcher within 3 working days.
2. The researcher runs `copilot.py dsar --name "<Subject Name>"` (Story 8.1), which searches all working files, output files, and `audit.db` for records referencing that name.
3. The export folder (`dsar_exports/<date>_<name>/`) is produced and reviewed manually by the researcher before sending.
4. The DPO reviews the export for completeness and confirms whether any data should be withheld under a legitimate exemption (e.g., third-party data, legal professional privilege).
5. The export is sent to the data subject within 30 days of the original DSAR receipt.

**Why this is simpler than other strategies:** There is no automated pipeline with multiple API logs, no message queue with intermediate processing artefacts, and no cloud database with access logs. The researcher knows exactly where the data is because they put it there.

**Note:** The DSAR search must cover all locations including any email threads where dossier drafts may have been forwarded. The copilot CLI does not scan email. The researcher must check their own email for forwarded dossier content and include any relevant records in the export.

---

## 5. Privacy Notice Clauses

The Foundation's main privacy notice must include the following clauses before the first donor record is processed:

**Prospect research and wealth assessment:**
> "We conduct prospect research to identify individuals who may wish to support our charitable work through a significant gift. This research uses publicly available information including company register data (Companies House), charity register data (Charity Commission for England and Wales), publicly reported grant-making activity (360Giving GrantNav), and UK government records. Our research may include an assessment of your financial capacity derived from publicly available indicators. We rely on our legitimate interest in advancing our charitable purposes as the legal basis for this processing. You have the right to object to this processing at any time by contacting [DPO contact]."

**Right to object to direct marketing:**
> "You have the absolute right to object to us using your personal data for direct marketing purposes, including approaches about making a gift. If you exercise this right, we will stop contacting you for this purpose without delay. To object, contact [contact details]."

**Source of data (Article 14 notice for network candidates):**
> Where the Foundation contacts a person who was identified through network research (i.e., they are not an existing donor), the Article 14 notice must be provided within one month of first obtaining their data. The notice must state: (a) the identity of the Foundation as controller, (b) that their data was obtained from public registers (specify which), (c) the purposes and legal basis for processing, (d) their right to object, and (e) the Foundation's contact details.

**Third-party tools:**
> If Factary Phi is used as a researcher tool, no personal data about Foundation donors is transferred to Factary. The researcher uses Factary to search Factary's own pre-existing database. However, the privacy notice should note: "We may use specialist research tools to supplement public register data. We do not share your personal information with these tools' providers; we use them to research publicly available information only."

---

## 6. Third-Party Processor Obligations

**Anthropic (Claude API):** When the researcher uses Claude via `copilot.py`, personal data about donors (names, roles, connections) is sent to the Anthropic Claude API for processing. Anthropic is therefore a data processor under Article 4(8) UK GDPR.

An Article 28 DPA must be executed with Anthropic before the copilot CLI is used on live donor data. Anthropic's standard Data Processing Addendum (DPA) is available at anthropic.com; the Foundation's legal contact should review it and confirm it meets UK GDPR Article 28 requirements. [from 02_regulatory_frame.md §7]

By default, data sent to the Anthropic API is not used for model training. Confirm this in the current API terms before signing the DPA.

**No additional processor DPAs required in base v1** (unlike Strategies 2–4 which involve multiple commercial API vendors). The only processor in the base configuration is Anthropic.

**If Factary Phi is used as a researcher tool:** The researcher is using Factary's platform as a normal user — they are not uploading Foundation donor data to Factary. Factary is not acting as a processor on behalf of the Foundation in this scenario. No Article 28 DPA is required for Factary Phi used in this way. However, the researcher must not use Factary's "upload your list for screening" function (if it exists) without first obtaining a DPA.

**If Prospecting for Gold screening is used** (for the highest-priority records beyond the base configuration): Prospecting for Gold will be acting as a processor. An Article 28 DPA must be executed before any Foundation donor data is uploaded to their platform. This is the same requirement that applies to Strategy 1. [from 02_regulatory_frame.md §7]

---

## 7. PECR: Outreach Channel Constraints

The compliance obligations for outreach channels are the same regardless of which strategy is used to research a prospect. Strategy 5 does not change these rules.

| Channel | Rule applicable to Bloomsbury |
|---|---|
| Email to individual prospects with no prior relationship | Consent required (PECR Reg. 22); copilot research does not create a lawful basis for cold email |
| Email to existing donors (charitable soft opt-in, DUA Act 2025) | LI permissible where contact details obtained via expression of support for charitable purposes, message furthers charitable purposes, opt-out offered |
| Live telephone (not TPS-registered) | LI permissible; check TPS before calling |
| Post | LI permissible; no PECR rule; LIA applies |

The researcher's role ends at dossier delivery. Whether and how the fundraiser contacts the prospect is a separate compliance question governed by PECR and the outreach channel rules above.

---

## 8. Code of Fundraising Practice

The Fundraising Regulator's Code of Practice 2025 applies to any approach to a prospect or donor. The researcher's output feeds into a fundraising process; the following Code requirements are relevant:

- Due diligence on major donors: the Code requires charities to conduct appropriate due diligence before accepting a major gift. Strategy 5 dossiers support this requirement.
- Respect for individuals: the Code requires fundraisers to treat individuals with dignity. Dossiers should not include personal information that goes beyond what is necessary for the gift conversation.
- Data protection: the Code requires compliance with UK GDPR and PECR. Strategy 5's human-review design and public-source restriction support this.

The Foundation's fundraising director should review the Code requirements annually and confirm that the dossier format and outreach approach remain compliant.
