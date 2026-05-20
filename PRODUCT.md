# Product

## Core Aspiration

The fundraising team has **actionable information about the current donor network**, scraped from open sources or entered manually, so that they can directly target new prospects or ask current donors to make introductions.

Every decision — what to build, what to surface, what to hide — is judged against one test: does this help the fundraising team find the next donor faster and with better-fit leads than they would without it?

## Core Jobs To Be Done (MVP)

These four JTBDs are the load-bearing pillars of the MVP. No feature belongs in v1 unless it serves one of them.

1. **Present current contacts** — A canonical, browsable record of current sponsors and donors: who they are, what we know about them, their capacity, their philanthropic focus, and their relationship to the foundation.

2. **Scrape, index, and map their networks** — A workflow that takes a sponsor name and builds their public network: directorships, trustee roles, board memberships, and named connections. Indexes each contact. Stores source URL and retrieval date per field.

3. **Display network contacts for triage** — A ranked, filterable list of network contacts scored as donor candidates. Each contact shows their connection path back to a current sponsor, their score, and the top three reasons for that score. Provenance on every enriched field.

4. **Recommend actionable intelligence** — For each candidate: who should introduce us (the strongest shared connection), a drafted introduction, and any fresh signals (new trustee role, public donation, sale, press mention) that change their priority. The team acts on this; they do not reverse-engineer it.

---

## Register

product

> Note: register is `product`, but with a small "demo veneer" requirement. Trustees, board members, and external partners (clubs, advisors) will occasionally see polished views. Surfaces that are likely to be shown externally must reach a presentation-grade bar; internal-only views must reach a competent product-tool bar.

## Users

The fundraising team of the Bloomsbury Football Foundation, a UK-based football charity.

- Roughly 2 to 5 people: head of fundraising, fundraising managers, a researcher.
- Skill mix is uneven. One power user who will live in the tool and learn dense interfaces; the rest are competent but want simplicity by default. Default views must be friendly; advanced features must be available without crowding the surface.
- Frequency: daily, one focused session, plus light check-ins throughout the day for triggers and new leads.
- Context: a desk, in front of a real screen. Mobile use is not the primary mode but is not forbidden.

Occasional secondary viewers: trustees, the CEO, external partners during a meeting or a board update. They do not act in the tool; they read.

## Product Purpose

Bloomsbury Network Mapper is a fundraising intelligence platform. It turns the foundation's existing sponsors and donors into a lever for finding the next ones.

The team enters a sponsor or donor name. The platform builds their record from public sources, expands the network around them, filters down to high-net-worth individuals with philanthropic signals, scores each candidate as a possible donor, and recommends which existing sponsor is best placed to make the introduction. A monthly model watches the public web for news (a sale, a new trustee role, a public donation) that should change a lead's priority or unlock a new branch of the network.

The four jobs to be done:

- **A. Sponsor DB.** Canonical record of current sponsors and donors and what we know about them.
- **B. Network DB.** The network of individuals connected to those sponsors and donors who could become donor candidates themselves.
- **C. Lead Surfacing.** A recommender that ranks candidates and suggests which sponsor should introduce us to which lead.
- **D. Trigger Surfacing.** A monthly news and web watcher that surfaces fresh signals that change a lead's likelihood or unlock new branches.

Success is **better-fit leads in pipeline**: the headline metric is donor-fit and quality of surfaced leads, not raw intro volume. The two v1 north stars are **quality** (the recommender's leads are measurably better-fit than the team's manual list) and **speed** (sponsor name to first leads in minutes, not days). Trust and workflow integration are required, not headline.

The daily workflow:

- Open the app to a **prioritised lead pipeline**, ranked by score and recency.
- Triage leads from a **side panel** that opens off the pipeline; review provenance, sources, and the recommender's top three reasons.
- Mark for outreach, assign the introducing sponsor, draft the introduction in-app, track the outreach stage (sent → meeting → donation), or export to `bloomsbury-crm` / email when handing off.
- Check the **trigger feed** (chronological, scored for relevance) for fresh signals that should reorder the day.
- The **graph view** is secondary. It is the visual answer to "who connects to whom?" used to verify a path or show a stakeholder, not the daily canvas.

## Brand Personality

**Discreet, considered, credible.** Quiet authority. The kind of tool a foundation board would trust with sensitive personal and financial data. Editorial restraint over tech-product flash.

Voice: **plain professional, British English.** Direct, neutral, no exclamation marks, no jokes. Button labels and empty states earn every word. "Add sponsor" not "Let's add a sponsor". "No leads match these filters" not "We didn't find anything yet".

Visual reference, dominant: **Attio.** Restrained palette, generous whitespace, sharp grid, monochrome with one accent, fast keyboard navigation. Secondary nudge: **Monday.com**, only as a reminder that simpler views must stay friendly enough for the non-power user. The aesthetic is Attio's; Monday.com is a discipline against accidental intimidation, not a colour direction.

## Anti-references

What this must not look like:

- **AI startup landing-page slop.** No glassmorphism, no gradient meshes, no hero-metric template, no generic SaaS-cream pastels. None of the "AI did this" giveaways.
- **Charity-sector clichés.** No stock smiling-children photography, no ribbon iconography, no donate-button red, no sentimental copy. This is a staff-facing operations tool, not a campaign microsite.
- **Crypto / wealth-flex aesthetic.** No neon-on-black, no gold accents, no "unlock the network of billionaires" energy. Reputationally dangerous for a charity that is profiling real people from public data.

## Design Principles

1. **Provenance is part of the surface.** Every enriched value carries source and confidence inline, not on hover, not in a settings panel. If we cannot show where a fact came from, we do not show the fact. This is what makes the tool defensible to trustees, to ICO, and to the people whose data is in the system.

2. **Quiet authority, not loud capability.** The product handles sensitive financial profiles of real people. Restraint is the brand. Density is allowed when it earns its place; decoration is not.

3. **The pipeline is the front door, the graph is a side door.** Most work is reading and triaging a ranked queue, not staring at nodes. The graph view is reserved for the moments where a connection-shaped question is genuinely better answered visually.

4. **Fast where it matters: name in, leads out.** From entering a sponsor name to the first ranked leads is the load-bearing latency in the product. Async pipelines with visible progress, never "come back tomorrow".

5. **Recommender transparency.** Every score is paired with its top three reasons. The team must always be able to override and explain a decision in plain English. No black box, ever.

6. **Trustee-grade by default.** Every surface should pass the test "would I be comfortable showing this in a board meeting?" Demo-veneer is not a separate skin; the daily product is already presentable.

## Accessibility & Inclusion

No formal WCAG target for v1. Common-sense baseline: keyboard navigation across primary flows, visible focus states, sane colour contrast, reduced-motion respected. No screen-reader certification work in v1; revisit if the user set or governance posture changes.

## Scope notes for v1

Out of scope for v1:

- Public donor portal or any external donor-facing surfaces.
- Payments / donation processing. Money never moves through the mapper.

In scope but constrained:

- Sponsor intake is **manual single-name** for v1. CSV upload and CRM sync deferred.
- Data sources are **public web only**, with source URL and retrieval date stored per field. No paid data providers, no scraped LinkedIn.
- Permissions are **flat**: all team members see everything. Audit log captured behind the scenes.
- Freshness is communicated as **per-record "last updated"**, not per-field staleness.
- Auto-sending introductions is **not built in v1**. The tool drafts and tracks; a human always presses send. (To be revisited only with explicit governance approval.)

Scale to design for: **hundreds of sponsors, 10k+ candidate leads.** Pipeline UX must support heavy filtering, batching, and pagination from the first release.
