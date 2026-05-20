# 00 — Executive Summary: Bloomsbury Network Mapper

**Date:** 2026-05-05 | **For:** Director of Fundraising, Bloomsbury Football Foundation (charity 1178842)

---

## Problem

Bloomsbury Football Foundation is a £4m-income London youth charity that needs to triple its beneficiary reach to 20,000 young people weekly by 2028 — an ambition that requires significantly more major-gift income than its current donor base delivers. Without a structured pipeline to identify, qualify, and cultivate high-net-worth individuals connected to its existing network, the fundraising team is working from intuition rather than evidence, and the warm connections visible in its trustee board and corporate partner list (Goldman Sachs, CVC, Rothschild & Co, Ed Woodward, Gary Lubner) remain systematically under-exploited.

---

## Recommendation

Prototype **Strategy 3 (open-source agentic pipeline)** as the immediate MVP, built to the architecture and data model that scales directly into **Strategy 4 (hybrid tiered)** — the target steady-state system.

---

## Three Strongest Arguments

- **Network mapping is already near-solved by free data.** The Charity Commission and Companies House registers give ~90–95% recall on shared trusteeships and ~70–80% on corporate directorships. Strategy 3 exploits this with zero licence cost. No commercial tool adds meaningfully to what the open register already provides for Job B — the most immediate intelligence gap Bloomsbury faces.

- **Commercial spend is concentrated where it is weakest without it.** The structural gap — confirmed philanthropic donation history and £5M+ wealth confirmation — is where open-source recall drops to 5–10%. Strategy 4 applies Factary Phi (UK-native, GDPR-compliant, ~£500–2,000/year) only to the shortlisted leads that the open-source pass has already flagged. This is an order of magnitude cheaper than running commercial tools across the entire donor base.

- **Strategy 3 is the prerequisite for Strategy 4, not an alternative.** The build is 4–6 weeks for MVP, produces independently useful sourced dossiers from day one, and creates the shortlisting logic that determines which records receive commercial enrichment. Starting with Strategy 3 means the pipeline is live and generating value while the commercial integration layer is added — there is no wasted build cost.

---

## Cost Headline

| Volume | Strategy 3 (MVP) | Strategy 4 (target state) |
|---|---|---|
| 100 records/month | **£1,530/month** (£15.30/dossier) | **£3,216/month** (£32.16/dossier) |
| 400 records/month | **£1,631/month** (£4.08/dossier) | **£3,249/month** (£8.12/dossier) |

One-off build costs: Strategy 3 = £13,698; Strategy 4 = £17,696 (incremental £4,000 to add commercial enrichment layer).
All figures from `06_cost_models.md`; USD converted at £1 = $1.27.

---

## Next Step

On Monday morning: assemble a **gold set** of 10–20 existing Bloomsbury donors whose identities and giving history are already known to the fundraising team. This is the week-1 blocker — no pipeline can be validated without test records of known quality. Email Anthony Hayman (Director of Fundraising) with a request for this list, specifying that records should include: full name, postcode, approximate donation history, and any known corporate or trustee roles. This gold set is used to calibrate the pipeline and serves as the accuracy benchmark against which Strategy 3 dossiers are scored before going live on the broader database.
