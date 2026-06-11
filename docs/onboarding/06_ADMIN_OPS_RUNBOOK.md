# Admin and operations runbook

For the person who keeps the system running, not the analyst who uses it. Covers database migrations, the data-processing scripts, re-scoring, the development flags, and deployment. Assumes you have the setup from `01_USER_GUIDE.md` working, the Supabase CLI linked, and `web/.env.local` populated.

A few standing rules for this project, from `CLAUDE.md`:

- The **PRD is the source of truth** for the data model (section 11.1), the API contracts (section 20), and the scoring formulas (sections 15 to 18 and Appendix A). Do not change a column, a route, or a weight without tracing it to the PRD and getting approval.
- The **database is the source of truth** for data; any spreadsheet is a handoff surface only.
- **Human decisions always win** and must survive re-processing. Any script that rebuilds data must replay the human overrides (suppressions, identity confirmations, wealth overrides), never wipe them.

---

## The stack at a glance

| Layer | What | Where |
| --- | --- | --- |
| Database | Supabase Postgres, schema `app` | Supabase project (linked via CLI) |
| App | Next.js (App Router), runs the CRM under `/crm` | `web/` |
| Migrations | SQL files, applied in order | `supabase/migrations/` |
| Scripts | One-off and batch maintenance jobs (tsx) | `web/scripts/` |
| Deploy | Vercel | connected to the GitHub repo |

The app reads the database through two clients: a public one (anon key, restricted by row-level security) and a service-role one (full access, server-side only). The service-role key must never reach the browser.

---

## Database migrations

Schema changes live as numbered SQL files in `supabase/migrations/` (for example `00016_human_overrides.sql`). They are applied in order and tracked, so the local set and the remote set stay in sync.

### Check what is applied

```bash
supabase migration list --linked
```

This prints local vs remote. Files present locally but not remotely are pending.

### Apply pending migrations

```bash
supabase db push --linked
```

This applies every pending migration to the linked project. Before running it:

- Read each pending migration. Confirm it is additive (new tables, nullable columns, new policies) or that you understand any change to existing structures.
- Confirm the local and remote histories agree up to the pending files (no drift). `migration list` shows this.
- Migrations are forward-only here. There is no down-migration. To reverse one, write a new migration.

### Writing a new migration

- Name it with the next free number and a short description: `00017_my_change.sql`.
- Match the house style of the existing files: explain *why* at the top, enable row-level security on any new table, and add the same admin-CRUD plus authenticated-select policies the other tables use (`app.user_role()`).
- Never rename or drop a column the app reads without updating the app in the same change.
- Place migrations in `supabase/migrations/`, not `web/supabase/`. The latter is a mistake that has happened before; the CLI reads the top-level folder.

---

## The data-processing scripts

These live in `web/scripts/` and run with `npx tsx scripts/<name>.ts`. They read `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` from `web/.env.local`. Most support `--dry-run`. **Always dry-run first.**

They fall into a rough pipeline order: ingest data, enrich it, deduplicate, score, then compute routes.

### Ingest

| Script | What it does |
| --- | --- |
| `batch-ingest.ts` | Parses enrichment transcript files and persists the entities, connections, and evidence to the database. The main way discovered people enter the system. |
| `ingest-donations.ts` | Scans the evidence for clear, citable giving language and records donation events. Evidence-first: it parses an amount or year only when explicitly present, never fabricates a figure, and skips claims with no citable source. Run after evidence is ingested. |

### Enrich

| Script | What it does |
| --- | --- |
| `wealth-augment.ts` | Wealth augmentation. Run with `--select` to pick who to research (writes a target list), do the research through the Claude Code agents, then run with `--import` to store the results. The research uses web search on the local session, not an API key. |
| `score-network-position.ts` | Estimates wealth for people who have no wealth estimate yet, from their network position and evidence alone (directorships, co-director degree). Reads the database only, no web research, no fabrication. |
| `classify-orgs.ts` | Classifies organisations as charity or company and flags confirmed BFF funders/partners. |
| `promote-supporter-fields.ts`, `promote-contact-fields.ts`, `backfill-seed-rows.ts`, `derive-pipeline-context.ts` | Backfill and promote specific fields onto entities. Targeted maintenance jobs. |

### Deduplicate

| Script | What it does |
| --- | --- |
| `merge-duplicate-entities.ts` | Batch ingest can create the same person twice across runs. This finds exact-name duplicate people, keeps the richest record, repoints all connections, evidence, and wealth onto it, and deletes the empties, recording the merged aliases for provenance. Run after a batch ingest. Use `--dry-run` and `--persons-only` to scope it. |

### Score and route

| Script | What it does |
| --- | --- |
| `compute-multi-paths.ts` | Computes up to 10 distinct introduction paths from supporters to every reachable high-value person, scored by hops, shared organisations, introducer reach, and supporter tier. This populates the introduction paths the Lead Generator shows. |
| `compute-warm-paths.ts` | Computes the single shortest route back to a supporter for each lead (the "who can introduce us" path). |
| `compute-introductions.ts`, `introduced-by-edges.ts` | Build and store introduction edges and the introduced-by relationships. |
| `dossier-retry.ts` | Re-runs dossier assembly for entities that need it. |

> The headline priority and confidence scores are computed **at request time** in the app (`web/src/lib/crm/lead-score.ts` and `crm-priority.ts`), not by a batch script. The scripts above produce the *inputs* (wealth, paths, connections); the app blends them into scores live. The Orient analytics (connectors, communities, suggested ties, coverage) are also computed live from the graph when you open the page. There is nothing to "re-run" to refresh scores; they reflect the current database on every load.

### Typical sequence after new data arrives

1. `batch-ingest.ts <dir>` — bring the new entities in.
2. `merge-duplicate-entities.ts` — clean cross-run duplicates.
3. `wealth-augment.ts` / `score-network-position.ts` — attach wealth.
4. `classify-orgs.ts` — classify the new organisations.
5. `ingest-donations.ts` — capture any citable giving.
6. `compute-multi-paths.ts` and `compute-warm-paths.ts` — refresh the routes.

Dry-run each step, then run for real. The scores in the app update on their own once the inputs change.

### Larger orchestrations

Two multi-step enrichment flows live in `.claude/workflows/` (`augment-people.js`, `characterize-connections.js`). These coordinate per-person enrichment through the agents. They are heavier runs; understand what they touch before launching.

---

## Development flags

### `CRM_LOCAL_MODE`

Set `CRM_LOCAL_MODE=true` in `web/.env.local` to let the analyst action buttons work without a logged-in admin session, which is convenient for local development. It is **ignored when `NODE_ENV=production`**, so it cannot weaken the deployed app. Do not rely on it in any deployed environment; real authorisation there comes from Supabase Auth and row-level security.

---

## Authorisation model

- The app uses Supabase Auth (email link and Google SSO).
- Row-level security on the `app` schema restricts what the public (anon) key can read, by role (`app.user_role()`).
- Mutating API routes check `requireAdminOrLocal` before acting, write to an audit log, and return errors in the shape `{ error: { code, message, details } }`.
- The service-role client bypasses row-level security and is used only in server-side code (page loads and scripts). It must never be exposed to the client.

When you add a table, add its row-level-security policies in the same migration. When you add a mutating route, gate it and audit it like the existing ones.

---

## Quality gates and CI

Before committing, from `web/`:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint, runs over the WHOLE project including scripts/
npm test            # vitest
```

CI runs the same three gates on every push. One thing to know: `npm run lint` is bare `eslint` and lints `web/scripts/` too. A targeted local lint (for example, only `src/`) can pass while CI fails on a scripts file. Run the bare `npm run lint` before declaring a change clean. The convention for the unavoidable loose Supabase client type in scripts is a single `// eslint-disable-next-line @typescript-eslint/no-explicit-any` above the type alias; the existing scripts show the pattern.

---

## Deployment

The app deploys to Vercel from the GitHub repository.

- Pushing to the `main` branch triggers a build and deploy.
- The same three environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) must be set in the Vercel project settings, not in a committed file.
- Do **not** set `CRM_LOCAL_MODE` in production; it is ignored there anyway, but do not rely on it.
- Apply database migrations (`supabase db push --linked`) as a separate, deliberate step. A deploy does not run them. Coordinate schema changes with the code that depends on them so the app is never live against a schema it does not expect.

### Running it yourself (without Vercel)

```bash
cd web
npm run build
npm run start            # serves on port 3000
```

Inside a container, bind to all interfaces and publish the port so a host browser can reach it:

```bash
npx next start -H 0.0.0.0 -p 3000
```

If the page loads via `curl` inside the container but not in your browser, the issue is the container's port publishing, not the app. Make sure the container was started with the port mapped (for example `-p 3000:3000`).

---

## Backups and safety

- Supabase provides managed backups at the project level; configure and verify them in the Supabase dashboard. The database is the source of truth, so its backup is the one that matters.
- This project's working convention is to **avoid destructive shell commands in the repo**. When a file needs removing during development, move it to a `Bin/` folder rather than deleting it, and clear `Bin/` only after review. (`Bin/` is git-ignored.)
- Before any irreversible action (dropping a table, force-pushing, deleting a branch, bulk-deleting rows), stop and confirm. Human overrides and audited decisions are not recoverable if you wipe them.

---

## Where the source of truth lives

- Product requirements, data model, API contracts, scoring formulas: `PRD.md`.
- Build order and progress: `BACKLOG_PHASE_1.md`.
- These onboarding documents: `docs/onboarding/`.
- The scoring code that this runbook refers to: `web/src/lib/ranking/` and `web/src/lib/crm/`.

If this runbook and the code ever disagree, the code is what runs, but the PRD is what was agreed. Reconcile deliberately, do not silently drift.
