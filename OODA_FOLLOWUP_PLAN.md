# OODA follow-up plan (v2 — revised after independent review)

Deferred items from the OODA overhaul (commit `191c13c`), revised after an adversarial review
of both the shipped code and the v1 plan. The review found two real bugs in already-committed
code (now fixed, see "Fixed during review" below) and corrected several v1 plan errors.

Effort shown **human / CC**. **[needs approval]** = changes a scoring formula (PRD §15–§18) or
the data model (§11.1).

---

## Fixed during this review pass (not follow-up — already done)

These were caught by the second-pass audit and fixed + verified before writing this plan:

- **CRITICAL — merge collision deleted unique rows (data loss).** The merge route's
  collision fallback ran `delete().eq(col, drop_id)`, which deletes *every* drop row for a
  column when a single one collides with a unique constraint — destroying the non-colliding
  rows that should have moved to keep. Rewritten to repoint row-by-row and delete only the
  individual colliding row. Proven with a forced-collision test (a unique `COMP2` co-director
  edge now survives a merge where `COMP1` collides; the old code lost it).
- **MINOR — evidence drawers lost newest-first ordering.** The `.in()` chunking dropped the
  per-query `.order('created_at', desc)`; the capped `evidence.slice(0, 12)` drawers showed an
  arbitrary subset. Now re-sorted in JS (same as the wealth/connection re-sorts).
- **MINOR — `chunkedIn` swallowed per-chunk errors.** A failed chunk was silently dropped,
  making a partial fetch look complete. Now throws on any chunk error.
- **MINOR — `backfill-seed-rows.ts` not crash-idempotent.** Skip-guard keyed on the import
  header, which is inserted before its rows; a crash between them wedged all future runs. Now
  keyed on row presence, and clears an empty header from a failed run.

---

## P0 — do now (small, real, no decision)

### 1. Gate the three pre-existing ungated read-only routes
`web/src/app/api/crm/{search,stats,augment-queue}/route.ts` use the service-role client with
no `requireAdminOrLocal`. `search` and `augment-queue` expose entity names + wealth.
- **Before gating, check the browser callers** (review correction): gating a route that the UI
  fetches under a non-admin session turns "ungated" into "silently 403 for real users." Verify
  each route's callers; gate only after confirming callers are admin-only or handle 403.
- Add a guard test asserting 403 in production mode.
- **30 min / ~5 min.**

### 2. Fix the export-button 403 regression (NEW — review caught this)
`/api/crm/export/leads.csv` is now admin-gated, but the UI renders the export as a plain
`<a href>` (`lead-generator-table.tsx`, `action-backlog.tsx`). A logged-in **non-admin** user
clicking it downloads a 403 body as a "CSV". Either hide the export control for non-admins, or
have it fetch + surface the 403 as a message. (v1 plan missed this entirely.)
- **30 min / ~5 min.**

### 3. CSV export row cap
`computeScoredLeads` pages all persons per request, uncapped. Fine at ~1,650 leads; add a hard
cap (~50k) + a `log()` on truncation so it can't silently grow into a slow export. *(v1 wrongly
framed this as an auth issue — it's already gated; only the cap is real.)*
- **15 min / ~5 min.**

---

## P1 — correctness + test debt (promoted after review)

### 4. Unit tests for the new hygiene/dedup/scoring modules (NEW — promoted to P1)
The riskiest new logic has **zero tests**: `suppressions.ts` (`pruneIntroPaths`, `SuppressionSet`
pair-key ordering), `donor-dedup.ts` (variant name matching), `lead-score.ts` (composite +
normalisation). The existing suite covers PRD §18 ranking well but none of the OODA additions.
This is the cheapest lake to boil and these are the modules most likely to regress.
- **1 day / ~20 min.** No approval needed.

### 5. Idempotency on the new POST routes (NEW — review caught, CLAUDE.md convention)
`suppress`, `update-action`, `send-to-backlog` ignore the `Idempotency-Key` header the project
convention requires. `suppress` mints a fresh `override_id` per call, so a double-submit creates
duplicate overrides. Honour the header (dedupe on key) on all three.
- **2 h / ~20 min.**

### 6. Concurrent merge guard + `lead_scores` PK collision (revised)
Two real gaps in the merge route:
- No atomicity/serialization across its ~30 sequential mutations: overlapping merges (A→B and
  B→C concurrently) can interleave into dangling refs or a partial-state 500. Reject if `drop_id`
  already appears as an `entity_aliases.alias_entity_id`, and ideally move the whole merge into
  a single Postgres transaction (rpc).
- `lead_scores` PK is `(entity_id, config_version)`; the repoint now handles the collision
  (deletes the colliding drop row), but confirm that's the intended resolution when both entities
  were scored under the same version.
- **3 h / ~30 min** (rpc is the bigger piece). **[needs approval]** if it becomes an rpc/schema change.

### 7. Concurrent action-update race (read-modify-write on `attributes`)
`update-action`/`send-to-backlog` read `attributes`, mutate `action_item`, write it all back —
last-write-wins clobber under concurrent edits.
- **Correction from v1:** the read is *load-bearing* — `update-action` reads `prevStatus` to
  decide whether to write an `intro_outcomes` row, so a "jsonb_set RPC that drops the read"
  (v1's recommendation) is wrong. Use **optimistic concurrency on `updated_at`** (reject if it
  changed since read), or move `action_item` to its own column/table.
- **3 h / ~30 min.** **[needs approval]** if it touches §11.1.

### 8. Defer the suppression prune off the request path
`POST /connections/suppress` does a full scan of persons-with-`intro_paths` + an UPDATE per
changed row (each re-serializing the whole `attributes` jsonb) **inside the request**. Bounded
today (~2.8k persons) but grows with the graph. Move the prune to a `pipeline_jobs` row; write
the override row synchronously, defer only the prune.
- **2 h / ~20 min.**

---

## P2 — the scoring reconciliation (re-scoped after review)

### 9. Wire or retire the `lead_scores` persistence, THEN reconcile
The review found the v1 plan's centerpiece rests on a false premise:
- **`lead_scores` is written by an unwired CLI (`persist-lead-scores.ts`) and read by nothing.**
  Every Decide view recomputes live via `computeScoredLeads`. So the "persistence" is dead,
  write-only data, and the commit's "queryable scores" claim is aspirational.
- **The two scoring systems rank different populations.** PRD §18 priority/confidence are
  written by the *candidate/discovery* pipeline onto `candidate_recommendations`; the CRM
  composite ranks *augmented canonical entities* in the Lead Generator. They are not normally
  two orderings of the same list shown side by side. The "they disagree" framing needs a
  **concrete reproduction** before a multi-day reconciliation is justified.

Revised task, in order:
  1. Decide if persisted scores are even wanted. If yes, wire a reader (Decide reads
     `lead_scores` by config version instead of recomputing) and make `persist-lead-scores`
     transactional (the delete-then-insert currently has an empty-table window). If no, delete
     the script + `lead_scores`/`scoring_configs` write path and keep live computation.
  2. Only if a real cross-system disagreement is reproduced: write a short proposal comparing
     the two formulas on a sample of the real pool, pick the canonical one, version it.
- **Effort:** ~2 h to wire-or-retire (1); the reconciliation (2) is 2 days / ~4 h design **and
  gated on an actual repro**. **[needs approval]** for any formula change.

---

## P3 — note, don't necessarily fix

10. **RLS on the new tables is cosmetic.** Migration 00012 adds full RLS policies on
    `entity_notes`/`connection_overrides`/`lead_scores`, but every route uses the service-role
    client, which **bypasses RLS entirely**. The real authz is `requireAdminOrLocal` in route
    code. The policies are harmless defense-in-depth for direct SQL access but protect nothing
    in the app path — add a comment so nobody trusts them as the enforcement layer. Don't remove.
11. **Rate limiting + failure-rate observability** on the new mutating routes. There's an
    existing `rate-limiter.ts` in the enrichment layer to reuse, and `logAudit` already records
    actions; what's missing is throttling and alerting on POST failure rates. **2 h / ~20 min.**
12. **`pruneIntroPaths` malformed-path guard.** Trusts `best.via_orgs`/`best.path_names` exist; a
    hand-edited/legacy `intro_paths` entry without them would 500 the suppress call *after* the
    override row is written. Add `?.` guards. Low risk (real paths always carry them). **10 min / ~5 min.**
13. **`intro_outcomes.entity_id` delete behavior** — RESTRICT (default). Merge repoints it, so
    merges are fine; a direct entity delete would block. Keeping RESTRICT is arguably correct
    (outcomes are an audit trail). Decide; cascade needs a migration. **[needs approval]** if changed.
14. **Dedup precision / unbounded chunk fan-out / brokerage string keys** — all low-impact polish
    from the review; fold in opportunistically.

---

## Sequencing

1. **P0 (1–3)** — security parity + the export-button regression. ~15 min CC, ship now.
2. **P1 (4 first)** — tests for the new modules are the highest-leverage, no-approval item; then
   idempotency (5), the merge/action races (6, 7), and deferring the prune (8).
3. **P2 (9)** — decide wire-or-retire for `lead_scores` *before* any scoring reconciliation; the
   reconciliation itself is gated on reproducing a real disagreement.
4. **P3** — note #10 and #11 now; the rest opportunistically.

Net: P0 and P1-#4 (tests) are do-now and need no decision. Everything else carries a decision,
a migration, or a dependency and should be confirmed first.
