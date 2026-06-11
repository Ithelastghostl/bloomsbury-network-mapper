# Data and provenance

This document is about trust. What data the platform holds, where it comes from, and the distinction that matters most for an intelligence tool: what is *evidenced*, what is *inferred*, and what is *estimated*. Read it before you put weight on any figure.

The governing principle is **evidence-first**: every entity, connection, score, and recommendation has provenance. Nothing exists without a recorded source. There is no orphan data. When you see a claim, you can trace it back.

---

## What is in the system

As a rough sense of scale (live counts move as processing runs):

- About **1,700 people** and **1,100 organisations**.
- About **3,700 connections** between them.
- About **530 wealth estimates** and **2,800 evidence items**.
- A small number of **recorded donations** (this set is deliberately thin; see [Giving data](#giving-data-is-thin-on-purpose)).

These come from two original input lists (the supporters spreadsheet and the high-net-worth target spreadsheet) plus everything discovered by reading the corpus and researching the people in it.

---

## Where the data comes from

There are exactly two external sources. Knowing which source a fact came from tells you how much to trust it.

### 1. Charity Commission filings (the corpus)

The backbone. About 20,000 public filings (trustee reports and financial statements) from the UK Charity Commission, covering 2019 to 2025, converted to text. These are official, public-record documents.

What they give us:
- Who sits on which charity boards (trustees).
- Co-trusteeships and co-directorships (people who serve together).
- The organisations themselves.

This is the strongest source. A trusteeship recorded in a filing is a matter of public record. It can still be out of date (someone may have since resigned), but it is not a guess.

### 2. Web research

To fill in what the filings do not cover (wealth, biography, current role, press), the system does web research on named individuals. This is how most wealth bands, net-worth figures, and biographical details are attached.

This source is weaker than the filings. It is useful and often accurate, but it is research from public web sources, not official records. It is more prone to same-name confusion, staleness, and imprecision. Treat web-sourced wealth figures as informed estimates, not facts.

> **What "Companies House" means here.** Some signals are labelled as coming from company-directorship records. In this build those come from the corpus and research, not from a live Companies House API. The label describes the *kind* of fact (a directorship), not a live external feed.

---

## Evidenced vs inferred vs estimated

This is the distinction to internalise. The platform mixes three grades of data, and they do not deserve equal trust.

### Evidenced

A fact with a specific source you can open: a named filing, a directorship record, a research finding with a link. Example: "Trustee of [charity], per their 2023 annual report." You can verify it.

Most connections derived from the filings are evidenced. The evidence is attached and viewable on the dossier.

**Trust it, but check the date.** Evidence is real but can be stale. A directorship from 2020 may have ended.

### Inferred

A relationship the system deduced rather than read directly. Example: two people who appear together in several filings are inferred to know each other (a "corpus mention" connection), even though no document states it outright.

Inference is reasonable but it is a judgement the machine made, not a recorded fact. A shared board seat is evidenced; "they probably know each other because they keep appearing together" is inferred. The platform marks inferred connections with weaker edge types and lower tie strength precisely so you can tell them apart.

**Verify before you rely on it.** This is exactly what the Suggested Ties tab is for: predicted connections that a human confirms or dismisses.

### Estimated

A modelled value, most often wealth. Example: a £5m–25m wealth band. Estimates are expressed as bands rather than precise numbers because the underlying data supports a range more honestly than a point figure.

An estimate is the softest grade. It is a useful signal for ranking, but it is not a statement of fact about someone's finances.

**Never present an estimate as a known figure.** Internally the capacity score is built from *observable* signals (the band, plus a researched figure, plus directorships) rather than a bare estimate alone, specifically to avoid over-trusting a guessed number. Carry that same caution into any conversation.

---

## The scores are summaries of evidence, not new facts

The priority and confidence scores (see `02_SCORING_AND_TABS.md`) are computed from the data above. They do not add information; they compress it. A high capacity score is a compression of "this person has a high wealth band and several directorships". If the underlying evidence is an estimate, the score inherits that softness.

This is why the confidence score exists and sits next to priority: it tells you how solid the evidence behind the priority is. A high priority built on a single, stale, web-sourced estimate will carry a low confidence, and that low confidence is the system telling you to check before you act.

---

## Why a human has to verify

Three failure modes are inherent to public-record and researched data, and none of them can be fully fixed by the machine:

1. **Same-name ambiguity.** "James Wright" in two filings may or may not be the same James Wright. The system makes a best guess at matching identities, but it cannot be certain. A human confirming the identity is the single most valuable check, which is why it is the heaviest input to the confidence score.

2. **Staleness.** Filings and research are snapshots. Roles change, boards turn over, fortunes move. The freshness score discounts old evidence, but only a person knows whether a three-year-old directorship still holds.

3. **Inference error.** A "probably knows" link can be wrong. Two people appearing in the same documents is suggestive, not conclusive.

The platform's answer to all three is the human in the loop, with tools to correct the data permanently. See the next section.

---

## How humans correct the data

Every correction an analyst makes wins over the automated logic, is recorded, and survives later re-processing. Human decisions always win. The tools:

- **Confirm or reject identity** (Identity QA): settles the same-name question and lifts confidence.
- **Remove a connection** (suppress): deletes a wrong edge from every view, permanently. It never resurfaces, even after the data is re-augmented.
- **Downweight a connection**: keeps a real-but-weak tie at reduced strength rather than deleting it.
- **Override a wealth band**: replaces an estimate with a human-corrected band when the analyst knows better.
- **Resolve a data conflict**: when two sources disagree, records which value to trust.
- **Dismiss a suggested tie**: tells the system a predicted connection is wrong; it does not come back.
- **Leave notes**: records judgement that no score can capture.

These are not edits to the source data (the filings are what they are). They are a layer of human decisions on top, applied every time the data is loaded. The source stays auditable; the human overlay governs what the analyst sees.

---

## Giving data is thin on purpose

The recorded-donations set is small, and that is honest, not broken. The system only records a donation when it finds clear, citable evidence of one (specific giving language with a source). It does not infer donations from someone being described as a philanthropist, because "is a philanthropist" is a wealth/affinity signal, not evidence of a specific gift.

So the donation records you see are real and cited. There are just not many of them in the current corpus, because the corpus is mostly board-membership filings rather than gift records. The plumbing to capture giving is in place and will fill in as richer giving data is ingested. The point is the discipline: a thin set of real records beats a thick set of fabricated ones. The platform never invents a financial figure to fill a gap.

---

## The bottom line for an analyst

- Open the evidence. The scores summarise it; the evidence is the truth.
- Know the grade. Evidenced beats inferred beats estimated. The dossier shows you which is which.
- Check the date on anything evidenced; verify anything inferred; never quote an estimate as a fact.
- Confirm identity before you trust a lead.
- When you find a mistake, correct it. Your correction is permanent and worth more than the automation.
