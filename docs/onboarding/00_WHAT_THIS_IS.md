# What this is

The Bloomsbury Network Mapper is an intelligence lead generator for fundraising. It takes the people Bloomsbury Football already knows (its supporters), maps who *they* know, and surfaces the most promising people to approach for support, along with a warm route to reach each one.

It does not decide who to contact. It does not send anything. It is a tool for a human analyst, who reads what it surfaces, judges it, and decides what to act on. The system finds and ranks; the person decides.

## The problem it solves

Bloomsbury Football has a set of supporters: people who already give, introduce, or advise. Each of those people has their own network of board seats, co-directorships, charity trusteeships, and professional ties. Buried in those second-degree networks are people worth approaching for major support, who happen to be reachable through someone we already know.

Finding those people by hand is slow. You would have to take each supporter, list everyone they sit on a board with, work out which of those people have giving capacity and an affinity for the cause, and then figure out the warmest path to each one. Across hundreds of supporters and thousands of connections, that is not feasible manually.

This system does that legwork. It reads public filings, builds the connection graph, scores every candidate, and hands the analyst a ranked, evidence-backed shortlist with a suggested introduction route for each name.

## What it produces

A **lead** is a person who is not already one of our supporters, who has some combination of giving capacity, affinity for the cause, and a reachable introduction path from someone we know. Each lead comes with:

- A **priority score** (how worth pursuing they are) and a **confidence score** (how much we trust the data behind that judgement).
- The **introduction path**: which supporter can reach them, through which shared institution, in how many hops.
- The **evidence**: the filings, directorships, and signals that the scores are built from, each with a source.
- A **suggested action**: a plain next step, such as which supporter to ask for a warm introduction.

The analyst reads these, confirms or rejects them, leaves notes, and moves the good ones into an action list.

## Why OODA

The platform is organised around the OODA loop: Observe, Orient, Decide, Act. It is a decision-making framework from military strategy, and it maps cleanly onto what a fundraising analyst actually does. The left-hand navigation is built in these four stages, in order.

**Observe** is the raw and enriched data. The supporters we started from, the people we discovered, the wealth and biography we attached to them. This stage answers "what do we have?"

**Orient** is the relationships between that data. Who connects to whom, which people are the key connectors in the network, which institutions act as bridges, who probably knows whom. This stage answers "how does it fit together?"

**Decide** is the ranked leads. The same pool of people, sorted by different scoring methods, so the analyst can choose who to pursue and see the strongest introduction routes to each. This stage answers "who is worth approaching, and how?"

**Act** is the chosen actions and their outcomes. The shortlist the analyst committed to, the introductions in flight, and which routes actually converted. This stage answers "what did we do, and did it work?"

The loop is a loop on purpose. Outcomes in Act feed back into how the analyst reads the next batch of leads in Decide. A route that keeps converting is one to trust; a supporter whose introductions never land is one to rethink.

## The human is required, not optional

This is the most important thing to understand about the platform, and it is built into how it works.

The system surfaces and ranks. It never decides identity, never overrides a human judgement, and never contacts anyone. Every score is a starting point for a person to examine, not a verdict. The reasons:

- **The data is public-record and inferred.** It comes from Charity Commission filings and web research. It is good enough to surface candidates and rank them, but it contains gaps, stale records, and same-name ambiguity. A person has to confirm that the "John Smith" in two filings is actually the same John Smith before the lead is trustworthy.

- **Fundraising is relationship work.** Whether an introduction is appropriate, whether the timing is right, whether a supporter is willing to make the ask, are all judgement calls the data cannot make. The system can tell you a path exists. It cannot tell you it should be used.

- **The cost of a wrong approach is real.** Approaching the wrong person, or the right person the wrong way, can damage a relationship the charity depends on. The system is deliberately built so that no outward action happens without a person choosing it.

The platform therefore gives the analyst tools to *correct* it: confirm or reject an identity, remove a connection that is wrong, downweight one that is weak, override a wealth band, dismiss a suggested tie, leave notes for the next person. These human decisions always win over the automated logic, permanently, and survive any later re-processing.

The right mental model is an analyst with a very fast research assistant. The assistant reads everything, does the maths, and brings you a ranked stack of dossiers with its reasoning shown. You are still the one who reads the room and makes the call.

## What success looks like

The platform is doing its job when an analyst can sit down, open the ranked leads, and within a few minutes have a short list of people worth approaching, each with a warm route and the evidence to back the approach, that they would not have found on their own. The value is in surfacing real, reachable, well-evidenced opportunities from a pool too large to search by hand, and in keeping a human firmly in control of every decision that leaves the building.

## Where to go next

- New analyst, want to use it: read `01_USER_GUIDE.md` then `03_ANALYST_PLAYBOOK.md`.
- Want to understand the scores and every tab: `02_SCORING_AND_TABS.md`.
- Confused by a term: `04_GLOSSARY.md`.
- Need to trust the data: `05_DATA_AND_PROVENANCE.md`.
- Running or maintaining the system: `06_ADMIN_OPS_RUNBOOK.md`.
