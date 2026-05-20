# Strategy 5 — Human-Led Prospect Researcher + Claude as Copilot

## Mechanism of Reliability

A trained prospect researcher is the quality control layer. Every judgement call — entity resolution ("is this the right John Smith?"), wealth estimation ("do these PSC stakes imply £5M+?"), connection strength ("are they co-trustees or just listed in the same annual report?") — is made by a human with contextual knowledge of UK philanthropy, not by an algorithm. Claude's role is to reduce the researcher's grunt work: running structured API lookups against Companies House (signal.companies_house.officer_search, signal.companies_house.officer_appointments, signal.companies_house.persons_with_significant_control), Charity Commission (signal.charity_commission_ew.trustee_data), and 360Giving (signal.threesixtygiving.grantnav), formatting raw API responses into a structured working document, and drafting narrative sections from researcher-curated data. Claude never decides; it surfaces and organises. Because a human reviews every structured output before any information is written into a dossier, and a human reviews every dossier before release, the hallucination risk is effectively zero for delivered outputs — any Claude error is caught at the review step. This is the easiest strategy to defend to trustees, the Fundraising Regulator, and the ICO: there is no automated profiling, no algorithmic scoring with legal or significant effects, and every output is traceable to a named researcher's judgement.

---

## Architecture: Researcher Workflow

```
  [Donor Record Intake]
          |
          v
  Researcher reviews record
  - Confirms scope of research
  - Flags entity resolution risk (common names, etc.)
          |
          v
  Claude Copilot CLI runs lookups
  - CH officer search + appointments
  - CC trustee query + related charities
  - 360Giving grant search
  - (Optional) Factary Phi manual search
          |
          v
  Claude returns structured JSON + formatted summary
          |
          v
  CHECKPOINT 1: Researcher reviews structured output
  - Confirms correct entity identified
  - Removes false positives
  - Adds context from own knowledge
          |
          v
  Researcher identifies network candidates
  - Co-trustees, co-directors, co-philanthropists
  - Peer-network inferences from biographical context
          |
          v
  Claude drafts candidate profiles
  - One structured profile per candidate
  - Cites only confirmed sources
          |
          v
  CHECKPOINT 2: Researcher scores and filters candidates
  - Removes low-probability or misidentified candidates
  - Adds wealth-capacity judgement
  - Ranks candidates for dossier inclusion
          |
          v
  Claude drafts lead dossier
  - Narrative synthesis from researcher-approved data
  - Sections: Identity, Network, Wealth Indicators,
    Philanthropic Activity, Recommended Ask, Sources
          |
          v
  CHECKPOINT 3: Final researcher review and sign-off
  - Checks narrative for accuracy and tone
  - Adds or corrects citations
  - Records approval in audit log
          |
          v
  [Output: Verified, cited lead dossier]
```

---

## Data Sources

**Open-source (primary):**

| Signal ID | Source | Primary use |
|---|---|---|
| signal.companies_house.officer_search | Companies House API | Corporate role identification |
| signal.companies_house.officer_appointments | Companies House API | Full directorship history |
| signal.companies_house.persons_with_significant_control | Companies House API | Beneficial ownership indicators |
| signal.charity_commission_ew.trustee_data | Charity Commission EW API / bulk download | Trustee network mapping |
| signal.threesixtygiving.grantnav | 360Giving GrantNav | Grant-giving history |
| signal.hmlr.price_paid | HMLR Price Paid Data | Property wealth proxy (address-level) |
| signal.hmlr.overseas_companies_property | HMLR OCOD | Overseas-held UK property |
| signal.ofsi.uk_sanctions_list | UK Sanctions List | Sanctions screening |
| signal.govuk.honours_lists | GOV.UK Honours archive | Prominence and philanthropy signals |
| signal.oscr.scottish_charities | OSCR bulk download | Scottish trustee networks |
| signal.ccni.northern_ireland_charities | CCNI export | NI trustee data |

**Commercial (optional — researcher tool, not pipeline input):**

- Factary Phi (signal.factary.phi_donations_db): UK philanthropic donation records, used directly by the researcher as a reference database. Not passed through Claude; researcher consults Phi manually and incorporates sourced findings into the working document.
- Prospecting for Gold (signal.prospecting_for_gold.wealth_screening): available for deeper wealth screening on highest-priority leads.

**Targeted web research:** researcher runs targeted searches (news archives, company websites, event programmes, alumni records) to add biographical context not present in structured registers. Claude can assist by summarising retrieved pages, but the researcher evaluates relevance and accuracy.

---

## Coverage and Accuracy

| Deliverable | Estimate | Notes |
|---|---|---|
| Job A — donor profile completeness | ~70–80% substantially complete [my estimate] | Highest of all five strategies for priority records. Throughput-constrained; long tail receives no enrichment. |
| Job B — connection recall (co-trusteeship) | ~90–95% [my estimate] | Same CC register as any strategy; researcher augments with biographical inference. |
| Job B — connection recall (corporate) | ~75–85% [my estimate] | Experienced UK researcher is familiar with CH register structure and adds contextual judgement. |
| Job C — £5M+ wealth-tier accuracy | ~85% on records where indicators exist [my estimate] | Highest of all five strategies. Researcher integrates signals across sources more flexibly than a pipeline; structural ceiling from 03_reliability_ceiling.md still applies — "confirmation" means a well-evidenced estimate, not a verified fact. |
| Hallucination rate | 0% in delivered dossiers [my estimate] | Claude errors caught at human review checkpoints before any output is approved. |

---

## Failure Modes

1. **Researcher availability bottleneck.** A single 0.5 FTE researcher can produce approximately 35–52 dossiers per month [my estimate — from 06_cost_models.md]. If the donor list grows or a campaign creates a surge demand, throughput hits a hard ceiling. Mitigation: establish a prioritised shortlist; do not try to enrich every record. See also: "When to choose this" below.

2. **Inconsistent methodology across researchers.** Without defined templates and source-citation standards, dossier quality varies between researchers and degrades over time. Mitigation: define a standard dossier schema, checkpoint protocol, and citation format before the researcher starts work. Claude copilot sessions should always output to the same JSON schema.

3. **Researcher-specific blind spots.** A researcher unfamiliar with a particular sector (tech, property, media) or UK register structure (e.g., OSCR not queried for Scottish trustees) may systematically miss a class of connection. Mitigation: maintain a structured checklist of sources to consult; Claude copilot CLI enforces completeness by running all signals for every record.

4. **No auto-citation generation.** In Strategies 3 and 4, citations are attached to claims at the API layer. Here the researcher must add source citations manually to the dossier. Omission risk is higher. Mitigation: dossier template requires a Sources section; Checkpoint 3 includes explicit citation audit.

5. **Throughput ceiling at scale.** Above ~80 records per month, this strategy requires proportional headcount — it does not scale without hiring. 400 records/month requires ~5 FTE researchers [my estimate — from 06_cost_models.md]. Mitigation: this strategy is not designed for high-volume use; see "When to choose this."

---

## When to Choose This Strategy

**Best fit:**

- Low volume: fewer than 80 records per month. Below this threshold, a 1.0 FTE researcher is near-optimal and the per-dossier cost (~£43) is competitive with outsourced alternatives.
- Highest-stakes major gift research. For a prospective £500k–£2M gift, the marginal value of an experienced researcher's contextual judgement is orders of magnitude higher than the marginal cost. Use this strategy for the top 20–50 prospects regardless of which other strategy handles the broader pipeline.
- Human-review overlay for Strategies 3 and 4. The open-source agentic pipeline produces dossier skeletons at high throughput; a part-time researcher can then do depth research on the 10–20% of records the pipeline has flagged as high-priority. This is explicitly recommended in 07_ranking_and_recommendation.md as a parallel track.
- Organisations with no engineering capacity. Zero build cost, lowest technology overhead, immediate start once a researcher is hired.
- Compliance-sensitive contexts. Easiest strategy to explain to trustees and the ICO — no automated profiling, no algorithmic scoring.

**Poor fit:**

- More than 100 records per month without proportional headcount.
- Situations where throughput matters more than depth.
- Organisations unable to manage employment (prefer outsourced Strategy 1 in that case).

---

## Effectiveness Ranking

From 07_ranking_and_recommendation.md:

| Dimension | Strategy 5 score (1=worst, 5=best) | Notes |
|---|---|---|
| Effectiveness | **5** | Highest — human judgement + Claude copilot produces most defensible, contextually rich dossiers |
| Technical feasibility | **4** | Researcher hired in 2–4 weeks; Claude copilot setup immediate |
| Complexity | **4** | Simple technically; introduces HR and management overhead |
| Efficiency (cost/reliable dossier) | **3** | Competitive for deep research; poor for long-tail records |
| Impact (£5M+ identification) | **4** | Best at catching edge cases through multi-source contextual judgement |

Strategy 5 is ranked **first on effectiveness** across all five strategies and **first for highest-stakes lead identification**. It is also recommended as a **parallel track** to Strategy 3/4 for the top 20–30 prospects.
