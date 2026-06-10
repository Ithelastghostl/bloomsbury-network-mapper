# OODA improvement plan

Plan for improving how data is presented and acted on in the CRM, stage by stage.
Based on a code review of `web/src/app/crm/*`, `web/src/components/crm/*`, `web/src/lib/crm/*`,
`web/scripts/*`, and the Supabase schema (`supabase/migrations/`), 2026-06-10.

Items marked **[needs approval]** add columns/tables beyond PRD §11.1 or touch scoring
formulas (§15–§18), which CLAUDE.md build rules require sign-off for.

---

## Current state, summarised

| Stage | What exists | Main gaps |
|---|---|---|
| Observe | 7 views. Source sheets render static `seed-people.json`; all enriched views reuse one `EntityTable` (name, wealth band, score, links, evidence count, state). | Raw vs augmented data not separated; no per-field provenance; Pipeline truncated at 200 rows; DB `seeds` table not the source the UI reads. |
| Orient | 5 graph views (Orbit, Reach, Institutions, Charities, Introduction Graph) + Intro Routes table. | Graphs encode connectivity only (size = degree). No view shows scoring dimensions or compares them. Reach not quantified per supporter. No institution brokerage view. |
| Decide | Lead Generator with client-side composite (connectivity 20 / wealth 30 / paths 30 / affinity 20, `lead-score.ts`), expandable rows with path breakdowns. | The four "By X" method tabs are redirects to the same page. No dedup against current donors. Paths via the same institution not differentiated. Scores computed client-side, not persisted, and disagree with the PRD §18 priority/confidence scores already stored on `candidate_recommendations`. |
| Act | Action Backlog with status workflow persisting via `update-action`. | Notes are read-only in the UI (API already accepts them). No assignee picker. No way to remove/suppress a connection. Affinity rationale not carried onto the action. |

Schema that exists but is unused by the UI: `known_contacts.exclude_as_candidate`,
`donation_events`, `audit_log` (no writers anywhere), `intro_outcomes`,
`introduction_routes.warmth_tier`, `human_decisions.cold_start_decision`.

---

## Stage 1 — Observe: raw data and augmented base data

Goal: every record shows what we ingested (raw) versus what augmentation added, with provenance.

1. **Split the entity table into Source and Augmented column groups.**
   Source group: name, tier, affiliation, account owner, introduced-by (from
   `seed_import_rows` / `seed-people.json`). Augmented group: wealth band + estimate,
   role/employer/location/sector, connections found, evidence count, last augmented date
   (`attributes.wealth_augmented_at`). File: `web/src/components/crm/entity-table.tsx`.
2. **Per-field provenance chips.** Tag augmented fields with their origin: corpus /
   web / companies-house / spreadsheet (from `enrichment_evidence.source_layer` and
   `wealth_estimates.evidence[].scoring_method`). Clicking a chip opens an evidence
   drawer listing the underlying `enrichment_evidence` rows with source URLs.
   This implements "evidence first" (build rule 7) at the presentation layer.
3. **Completeness meter.** Per person, show which augmentation fields are populated
   (wealth / role / sector / paths / evidence). Aggregate coverage bar in each Observe
   view header so the team can see how much of the pool is actually enriched.
4. **Make the DB the source the UI reads.** Source sheets currently render the static
   JSON. Load from `seed_import_rows` (fallback to JSON), per build rule 9
   (database is source of truth).
5. **Fix Pipeline pagination.** Replace the 200-row cap with server-side pagination and
   add a `pipeline_tier` facet (A-derivable vs B-needs-research) so the unenriched
   backlog is navigable.

## Stage 2 — Orient: relationships and dimensions, visual and tabular

Goal: show the relationship structure visually AND in tables that make clear which
dimensions matter for getting 1-hop or 2-hop introductions.

1. **Dimension overlays on graphs.** On Orbit and Introduction Graph, add a node-encoding
   toggle: size by degree (today's default), wealth score, best path score, or affinity;
   color by hops-from-supporter. Edge width by confidence (`co_director_edges` 0.95 vs
   `network_connections.priority`). Files: `orbit-graph.tsx`, `introduction-graph.tsx`.
2. **Dimension matrix view (new).** Rows = candidate targets; columns = every dimension we
   hold: connection count, wealth score, wealth band, path count, best path score, hops,
   shared orgs, introducer reach, supporter tier, affinity signals, capacity, influence,
   freshness, source corroboration. Sortable, filterable, with a small distribution
   sparkline in each column header so analysts can see which dimensions actually
   discriminate across the pool (low-variance columns don't help ranking).
3. **Per-supporter reach scorecards.** Extend Supporter Reach table: 1-hop count, 2-hop
   count, HNW targets reachable, network worth reachable (the `network_net_worth` view
   already computes this), top reachable targets. Answers "who are our most leveraged
   introducers".
4. **Institution brokerage view.** Per organisation: how many supporters and how many
   targets it connects (bridge score). Table plus a badge on the Institutions graph.
   This is the foundation for differentiating same-institution paths in Decide.
5. **Split all Orient stats by hop depth.** 1-hop and 2-hop counts and dimension
   distributions reported separately, so the warmth-vs-reach trade-off is explicit.

## Stage 3 — Decide: ranked leads, drill-in introductions, dedup, explainability

1. **Make the four ranking methods real.** `decide/by-connectivity`, `by-wealth`,
   `by-paths`, `by-affinity` currently re-export the main page. Each becomes the lead
   table ranked by that dimension, with that dimension's sub-signals as visible columns
   (e.g. By Donor Affinity shows charity overlaps, sector, matched affinity keywords).
   Composite stays as the fifth/default. Method choice lives in the URL.
2. **Persist scores server-side. [needs approval]** `scoreLead()` runs in the browser on
   every page load; ranks are not stored anywhere. Move scoring to a script/API writing
   per-dimension scores keyed by entity and scoring-config version. This also forces the
   open question: the client composite (20/30/30/20) and the PRD §18 priority/confidence
   scores on `candidate_recommendations` are two different systems that disagree. One of
   them should become canonical, versioned in `scoring_configs`. Decision needed before
   building.
3. **Row click opens the introduction panel.** Keep the expansion pattern but make paths
   the centerpiece: raise the stored-paths cap in `compute-multi-paths.ts` from 3 to ~10
   per target, show all of them ranked, each with the full breakdown (hops / shared orgs /
   introducer reach / supporter tier), the reason line, and evidence links.
4. **Deduplicate current donors.** A generated lead that is already a giving supporter in
   the original list must be flagged, not ranked as a fresh lead. Implementation:
   - match generated leads against `seeds` + `seed_import_rows` (exact id, then
     name+affiliation fuzzy match), and against `entity_aliases` for already-merged ids;
   - matched leads get an "existing donor" badge and drop out of the default ranking
     (a "show existing donors" toggle keeps them inspectable);
   - persist the exclusion in `known_contacts.exclude_as_candidate` (table already
     exists for exactly this) so it survives recomputes;
   - run `merge-duplicate-entities.ts` as a standing pre-step before ranking.
5. **Differentiate paths through a shared institution.** Path identity becomes
   (supporter, intermediate people, via-institution). When one institution connects
   several supporters to the same target (e.g. four supporters co-direct the same
   company), present it as one institution group containing distinct introduction
   options, one per introducer, each scored on its own merits (tier, reach, relationship
   recency). Identical people-chains are deduped; different introducers never collapse
   into one row. The analyst picks the best introducer, not just the best institution.
6. **"Why this lead" explainability.** In the expansion: per-dimension contribution with
   weights (exists), plus the top evidence items behind each dimension (which
   directorships drove the wealth score, which charity links drove affinity), and a
   per-path "because" line citing the connecting organisation and roles, linking to
   `enrichment_evidence`.

## Stage 4 — Act: actions with affinity rationale, persistent notes, connection hygiene

1. **Affinity explainability on every action.** The action card shows the specific
   affinity rationale: matched affinity signals (sport / education / mental health /
   community), the charity overlaps that drove the affinity bonus, and the generated
   introduction angle (`web/src/lib/dossier/assemble.ts` already produces `introAngle`;
   surface it on the action). The score-breakdown snapshot taken at send-to-backlog time
   stays attached so the action's reasoning is frozen even if scores move later.
2. **Persistent notes.**
   - Action notes: make the existing read-only notes field editable
     (`action-backlog.tsx`; the `update-action` endpoint already accepts `notes`).
   - Entity-level notes **[needs approval]**: a small `entity_notes` table
     (note_id, entity_id, author, body, pinned, created_at) so analyst intel survives
     across action items and re-scores. Shown in entity detail and in the Decide
     expansion.
3. **Connection removal by analysts. [needs approval]** "Remove connection" affordance on
   entity detail and on path cards. Implemented as a suppression record
   (connection id, action: remove/downweight, reason, author, created_at) rather than a
   hard delete, mirroring `human_identity_decisions.replay_on_future_runs`: path
   computation, graphs, and reach views must respect suppressions, and re-augmentation
   must never resurrect a suppressed edge (build rule 8: human decisions always win).
   Removing a connection triggers a recompute of `intro_paths` for affected targets.
4. **Complete the action workflow.** Assignee picker (field exists, never rendered);
   status history written to `audit_log` (schema exists, has no writers); when an action
   reaches contacted/won/lost, write an `intro_outcomes` row so conversion is tracked.

## Sequencing and dependencies

1. **Act first**: editable notes + connection suppression. Smallest changes, immediately
   unblock analyst data hygiene, and suppression semantics are a dependency of every
   downstream path recompute.
2. **Dedup** (Decide item 4) next, so rankings stop being polluted by existing donors
   before more ranking UI is built on top.
3. **Decide ranking methods + server-side score persistence** (needs the scoring-system
   decision).
4. **Orient dimension matrix + overlays + reach scorecards.**
5. **Observe provenance split** last; it is presentation-only and benefits from the
   provenance plumbing built for Decide explainability.

---

## Ten further recommendations

1. **Score giving history.** `donation_events` (corpus-extracted donations) is never used
   in any score. Match donor ids to leads and seeds: a discovered person who already
   gives to similar charities is the strongest affinity signal available.
2. **Unify the two scoring systems.** PRD §18 priority/confidence (server, on
   `candidate_recommendations`) and `lead-score.ts` (client) rank differently. Pick one
   canonical formula, version it in `scoring_configs`, and display the config version in
   the UI so ranked lists are reproducible.
3. **Staged-entity triage queue.** 1,131 discovered people sit in `staged_entities`
   awaiting promotion; 2-hop coverage is capped until they're processed. Add a bulk
   review queue (approve / merge / reject) with name-match suggestions.
4. **Surface evidence freshness, decay stale paths.** `relationships.freshness_multiplier`
   and `co_director_edges` resignation dates exist but are ignored. Show evidence age on
   paths; downweight or flag paths through resigned directorships (a 2019 co-directorship
   is a colder introduction than a 2025 one).
5. **Write the audit log.** `audit_log` has a schema and no writers. Log merges,
   exclusions, suppressions, status changes, and scoring-config changes. The hygiene
   loop (notes, removals) is only trustworthy if changes are attributable.
6. **Global search.** One search box across entities, institutions, notes, actions, and
   evidence text with type-ahead. Analysts currently navigate tab by tab.
7. **Export for handoff.** CSV/sheet export of ranked leads with chosen path, scores,
   and action status. The PRD treats the spreadsheet as a handoff surface; today there
   is no export at all.
8. **"What's new" feed.** After each augmentation run, surface deltas: new 1-hop paths to
   high-scoring targets, new wealth signals on existing leads, newly promoted entities.
   A daily-digest dashboard panel beats re-scanning tables.
9. **Close the outcome loop.** `intro_outcomes` is unused. Record meeting/converted per
   action and report conversion rates by ranking method, dimension, supporter, and path
   type. This is the only way to tune scoring weights on evidence rather than intuition.
10. **Identity QA dashboard.** Same-name clusters, alias chains, and cross-source name
    variants with one-click merge/split (the `/api/identity/merge` and `/api/identity/split`
    endpoints exist). Bad identity data silently corrupts every downstream score, dedup
    check, and path.
