# Changelog — Bloomsbury Network Mapper

All notable changes to this project will be documented here. Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Changed

- **Reframed lead dedup around supporters-as-introducers.** The dedup was labelled "existing donor" but conflated two things: only 88 of the 283 supporters are marked "Current donor" in the source sheet (the rest are key introducers / strategic contacts). The correct model is that *any* supporter is excluded from the lead list because we already have direct access to them — the platform's value is the introductions they can give us to people we don't have access to. Renamed `donor-dedup.ts` → `supporter-dedup.ts` (`matchExistingDonor` → `matchSupporter`), `ScoredLead.existingDonor` → `existingSupporter` (now carries the funder sub-type), and updated the Lead Generator badge ("Our supporter"), the toggle ("Show our supporters"), the expansion copy ("use them as an introducer, not a lead"), and the CSV column ("Existing Supporter Flag"). HNW targets stay rankable — they are exactly who we want to reach (so e.g. James Sainsbury, an HNW target, correctly appears as a top lead).
- **Observe tables show a "Found as" column** — the funder sub-type from the source spreadsheet (Current donor / Key introducer / Strategic contact / Target donor), colour-coded, so the donor status is visible at a glance in the enriched Supporters / HNW / Leads tables (previously only in the expanded row).

- **Reconciled the two scoring systems onto the PRD §18 model.** The CRM Lead Generator previously used an off-PRD composite (connectivity 20 / wealth 30 / paths 30 / affinity 20). It now computes the canonical PRD §18.1 priority score (introability 30% / affinity 25% / capacity 20% / influence 15% / strategic-fit 10%) plus the §18.2 confidence score, reusing the exact formulae in `@/lib/ranking` — the same model the candidate pipeline uses (build rule 6). A new `crm-priority.ts` maps live CRM data (intro-path scores → introability, charity/category/sector → affinity, wealth band + directorships → §18.3 capacity, connections → influence, cause-aligned sector → strategic-fit; identity/relationship/corroboration/freshness → confidence). The Lead Generator, Dimension Matrix, By-X views (now By Introability / By Affinity / By Capacity / By Influence / By Confidence), CSV export, and action snapshots all show §18 dimensions + confidence. `lead-score.ts` keeps the `scoreLead` shaping; `SCORING_CONFIG_VERSION` is now `prd-18.1-v1`. Lead ordering changed accordingly (top leads are well-connected, high-capacity, warmly-introducible HNW individuals). The dormant `candidate_recommendations` §18 pipeline is unchanged; both surfaces now share one formula.

### Added

- OODA presentation overhaul (per `OODA_IMPROVEMENT_PLAN.md`):
  - Observe: source vs augmented column split with provenance chips, evidence drawer, and completeness meters in the entity table; source sheets now read `seed_import_rows` (backfilled via `scripts/backfill-seed-rows.ts`, JSON fallback); pipeline view paginated with tier A/B facet; "What's New" delta feed.
  - Orient: dimension matrix (targets × all scoring dimensions with distribution sparklines), institution brokerage view (supporter↔target bridges), 2-hop reach scorecards on Supporter Reach, node size/colour overlays (wealth, path score, affinity, hops) on the Orbit and Introduction graphs.
  - Decide: the four "By X" ranking tabs are real views with method-specific columns; existing-donor dedup (exact + name-variant match, analyst exclusions persisted in `known_contacts`); introduction paths capped at 10 and grouped by institution with one option per introducer; per-dimension evidence drill-in; CSV export (`/api/crm/export/leads.csv`); scores persisted to `lead_scores` under `scoring_configs` version `crm-composite-v1` (`scripts/persist-lead-scores.ts`).
  - Act: editable action notes and assignee, frozen affinity rationale and route reasoning on every action, persistent entity notes (`entity_notes`), connection removal as replayable suppressions (`connection_overrides` — all graph/path loaders filter them, stored paths pruned on removal), audit logging into `audit_log`, automatic `intro_outcomes` on contacted/won/lost, and an Outcomes conversion report.
  - Identity QA view: same-name and name-variant duplicate detection with one-click entity merge (`/api/crm/identity/merge-entities`, recorded in `entity_aliases`).
  - Migration `00012_analyst_hygiene_and_lead_scores.sql`: `entity_notes`, `connection_overrides`, `lead_scores`; `intro_outcomes` accepts CRM-originated rows via nullable pipeline anchors + `entity_id`.

### Performance

- **~40× faster Observe pages.** `enrichEntities` and the entity-name resolution now chunk every `.in(...)` into 200-id batches run in parallel (`chunkedIn` in `web/src/lib/crm/queries.ts`). A single large `IN (...)` list is an ~80× PostgREST latency cliff (777 ids = 7.5 s; the same in 200-id chunks = 90 ms). `/crm/seeds` dropped 11.5 s → 293 ms and `/crm/hnw-targets` 11.8 s → 281 ms; every CRM page is now sub-600 ms in production.

### Security

- Auth-gated the new sensitive CRM routes that were missing `requireAdminOrLocal`: `export/leads.csv`, `whats-new`, `entities/[id]/history`, and (pre-existing, now consistent) `update-action` and `send-to-backlog`.
- CSV export neutralises spreadsheet formula injection (cells leading with `= + - @` / tab / CR are quote-prefixed).
- `update-action` validates the status against the workflow enum and coerces `notes`/`assignee` to primitives so a malformed body can't store objects in the jsonb.

### Fixed

- Build was failing on pre-existing type errors: CLI scripts excluded from the Next typecheck graph (`tsconfig.json`), d3 cleanup return in `supporter-reach-graph.tsx`, untyped seed JSON imports in the source sheet pages.
- Entity merge now repoints **every** column that FK-references `canonical_entities` (was missing `seeds`, `candidate_recommendations`, `introduction_routes`, `entity_aliases`, and ~15 others) — incomplete repointing would FK-block the final delete and leave a half-merged entity. Verified end-to-end with a synthetic merge.
- `compute-multi-paths` and graph/path loaders apply connection suppressions to derived shared-company (CO_MEMBER) edges, not just direct edges.
- Minor React fixes: stable keys in the What's-New feed, `ActionEditor` re-keyed on save to avoid stale drafts, `reduce` instead of array-spread in the dimension-matrix distribution (avoids call-stack limits at scale).

- Initial repo scaffold: `DESIGN.md`, `PROJECT.md`, `CHANGELOG.md`, `README.md`.
- Dev Container based on tc-production recipe (Node 22 base, postCreateCommand upgrades to Node 24).
- Post-create setup script installs: Claude Code, Gemini CLI, Codex, Supabase CLI, Vercel CLI; runs `gh auth login`; registers Supabase + Vercel MCPs.
- Editor color customization: orange titleBar / statusBar / activityBar.
- Host `~/.claude` bind-mounted into container (read-write) so Claude inherits host configuration.
