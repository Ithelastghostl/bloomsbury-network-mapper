# Bloomsbury Network Mapper — Project Briefing

> Shared brief for the Bloomsbury Football Foundation fundraising team.
> Version 0.2 · 2026-05-01 · owner: Ignacio Raposo
> Status: confirmed by intake. The full strategic record lives in `PRODUCT.md`.

## What this is

**Bloomsbury Network Mapper** is an internal fundraising intelligence platform for the Bloomsbury Football Foundation charity (UK).

It is not a traditional CRM and not a graph visualization toy. It is a **lead-generation engine for charity fundraising**, where the leads are individuals the foundation should be trying to reach, and the key to reaching them is the existing network of sponsors and donors.

It is staff-facing. Trustees, the CEO, and external partners may see polished views during board meetings or pitches; they read, they do not act in the tool.

## Aspiration

> An internal platform for the fundraising team to map sponsors' and donors' networks of individuals of interest, so we can engage and direct their engagements with potential leads, augmenting our targeted reach of highly likely donors and expanding the network.

## Jobs to be done

- **A. Sponsor DB.** Canonical record of current sponsors and donors and what we know about them.
- **B. Network DB.** The network of individuals connected to those sponsors and donors who could become donor candidates themselves.
- **C. Lead Surfacing.** A recommender that ranks candidates and suggests which sponsor should introduce us to which lead.
- **D. Trigger Surfacing.** A monthly news and web watcher that surfaces fresh signals (a new charity engagement, a new role, the sale of a business, a public donation) that change a lead's likelihood or unlock a new branch of the network.

## Acquisition workflow

1. We receive a sponsor or donor name.
2. Build their record. Fields include, but are not limited to: activity, net worth, entities, location, clubs, trusts, institutions, place of work, college, school, football team.
3. Crawl the public web around those fields to build their network: board co-members, alumni, fellow trustees, business partners, club connections, and similar.
4. Filter that network by conditions that mark "individuals of interest": HNWI and UHNWI signals, philanthropic activity, relevant interests.
5. Re-run the enrichment pass for each individual of interest (net worth, charity engagements, donation history) so they become full lead records.
6. Overlay a recommender that proposes, for each lead, which sponsor or donor is best positioned to make the introduction.
7. A separate monthly model watches the public web for news (philanthropic moves, new appointments, public giving) and generates trigger events that either add new individuals or raise existing ones in the priority list.

Pipeline shape: ingest → enrich → expand → score → recommend → monitor.

## How the team works in the product

- The **front door is the lead pipeline**, a ranked queue. Daily work starts there, not at the graph.
- Leads are reviewed in a **side panel that opens from the pipeline** so the team can triage many in a row.
- Each lead can be **assigned a sponsor for introduction**, the introduction can be **drafted in-app**, the **outreach stage tracked** (sent → meeting → donation), and the lead **exported to `bloomsbury-crm` or email** for the actual send.
- The **trigger feed** is a chronological list scored for relevance, used to reorder the day.
- The **graph view is secondary**. It exists to confirm a connection visually or to show a stakeholder a network, not as the daily canvas.

## Trust and compliance commitments

- **Public web only.** Companies House, Charity Commission, public news, public bios. Each enriched field stores source URL and retrieval date.
- **Conservative GDPR / ICO posture.** Lawful basis recorded, retention rules applied, subject access requests serviceable, one-click delete on a person.
- **Provenance is on-screen, always.** Every enriched value shows source and confidence inline. No hover-only provenance.
- **Recommender transparency.** Every lead score shows its top three reasons. No black box.
- **Flat permissions.** All team members see everything. Audit log captures who viewed what.
- **Human-in-the-loop outreach.** The tool drafts and tracks; a human always presses send.

## Brand and tone

- **Personality:** discreet, considered, credible. Quiet authority. Editorial restraint over tech-product flash.
- **Voice:** plain professional, British English. No exclamation marks, no fluff, no jokes.
- **Visual reference, dominant:** Attio. Restrained palette, generous whitespace, sharp grid, monochrome with one accent, fast keyboard navigation.
- **Visual reference, secondary:** Monday.com, used only as a reminder that simpler views must stay friendly for the non-power user. Not a colour direction.

### Anti-references

What this must not look like:

- **AI startup landing-page slop.** No glassmorphism, gradient meshes, hero-metric templates, SaaS-cream pastels.
- **Charity-sector clichés.** No stock children photography, ribbons, donate-button red, sentimental copy.
- **Crypto / wealth-flex aesthetic.** No neon-on-black, no gold accents, no "unlock the network of billionaires" energy.

## v1 north stars

Two metrics judge v1:

1. **Quality.** The recommender surfaces measurably better-fit leads than the team's manual list.
2. **Speed.** Sponsor name in, first leads out, in minutes, not days.

Trust and workflow integration are required, not headline.

## Scope for v1

Out of v1:

- Public donor portal or any external donor-facing surfaces.
- Payments and donation processing.
- Auto-sending introductions.

In v1, but constrained:

- Sponsor intake is manual single-name. CSV and CRM sync are deferred.
- Permissions are flat across the team.
- Freshness shown as per-record "last updated".
- No formal WCAG target. Common-sense accessibility baseline: keyboard navigation, focus states, sane contrast, reduced-motion respected.

Scale to design for: hundreds of sponsors, 10k+ candidate leads. Heavy filtering, batching, and pagination from the first release.

## Stack note

Stack and graph-library choice are tracked in `PROJECT.md`, not here. Likely candidates remain Cytoscape.js, Sigma.js, or D3.

## Pointers

- `PRODUCT.md` — full strategic record (register, users, principles, anti-references).
- `DESIGN.md` — visual system, currently a stub. Will be filled when the first surfaces are designed.
- `PROJECT.md` — operational context (status, stack, links, open questions).
