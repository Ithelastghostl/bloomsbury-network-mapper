# D1 schema port: what moved and what did not

All 43 tables of the Postgres schema `app` now exist in the Cloudflare D1 database `bloomsbury-db`, empty.
Columns, primary keys, foreign keys (with their `ON DELETE` actions), `NOT NULL`, `UNIQUE` and `CHECK`
constraints carry over. What did not carry over is the database logic: row level security, the helper
and matching functions, the views, the trigram and vector indexes and the `embedding` column. Those
have to live in the app (TypeScript) or in another Cloudflare product before the app can run on D1.
No data was copied; the app still runs on Supabase.

Source: `supabase/migrations/00001` to `00016`. Target: `d1/migrations/0001_app_schema.sql`, the final
state of those 16 files in one migration.

## How to apply and check

From this `d1/` folder, with wrangler logged in to the account in `wrangler.jsonc`:

```sh
wrangler d1 migrations apply bloomsbury-db --local    # local copy in d1/.wrangler (git-ignored)
python3 check_schema.py --local
wrangler d1 migrations apply bloomsbury-db --remote
python3 check_schema.py --remote
```

`check_schema.py` parses the Postgres migrations and compares every table, column, type, `NOT NULL`,
primary key and foreign key with D1. It passes when the only differences are the ones listed in its
`DOCUMENTED` table, which mirrors this file.

## How types were translated

| Postgres | D1 (SQLite) |
|---|---|
| `text` | `TEXT` |
| `int`, `integer` | `INTEGER` |
| `numeric` | `REAL` |
| `boolean` | `INTEGER` 0 or 1; `default true` becomes `DEFAULT 1` |
| `jsonb` | `TEXT` holding JSON; `'{}'::jsonb` default becomes `'{}'` |
| `text[]` | `TEXT` holding a JSON array; `default '{}'` becomes `DEFAULT '[]'` |
| `timestamptz` | `TEXT`, ISO 8601 UTC `YYYY-MM-DDTHH:MM:SS.sssZ` |
| `date` | `TEXT`, `YYYY-MM-DD` |
| `default now()` | `DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))` |

Other choices:
- Tables lose the `app.` prefix. SQLite has no schemas.
- Every text primary key is declared `NOT NULL`. SQLite, unlike Postgres, otherwise lets a text
  primary key hold `NULL`.
- Column order matches Postgres: columns added by `ALTER TABLE` sit at the end, in migration order.
  This keeps a later data copy simple.
- Index names follow the names Postgres generated (`<table>_<columns>_idx`). The two expression
  unique indexes get explicit names: `introduction_routes_route_key_uidx` and
  `network_connections_edge_key_uidx`. Both keep their `coalesce(...)` expressions.
- `pipeline_jobs (run_id, phase)` is a plain index. Migration 00005 made it unique and 00006 reverted
  that; the port takes the final state.
- There is no `users` table. The plan expected one to replace `auth.users`, but no `app` table
  references `auth.users`. Actor columns (`decided_by`, `added_by`, `user_id`, `author`) are free text
  holding the Supabase user id, so they port as plain `TEXT`.

## What did not port, and why

| Item | Source | Why it did not port | Where it goes |
|---|---|---|---|
| `entity_mentions.embedding vector(1536)` and its `ivfflat` index | 00001 | D1 has no vector type | A Vectorize index of 1,536 dimensions, keyed by `entity_mention_id`. Not created now |
| 225 row level security policies on 43 tables | 00002, 00007 to 00010, 00012 to 00014, 00016 | D1 has no row level security or database roles | Authorisation checks in the app, by role (`reviewer`, `senior_reviewer`, `lead_owner`, `admin`, `product_owner`, `engineering_admin`) |
| `app.user_role()`, `app.user_id()` | 00002 | Read the Supabase JWT from the session settings; D1 has neither | App code reading the signed-in user |
| `app.bootstrap_name_match()` (called by `web/src/lib/seed-import/bootstrap.ts:30`, `staging.ts:143`) | 00007 | Uses `pg_trgm` `similarity()`; D1 has no trigram matching | Fuzzy matching in the app, or a D1 FTS5 table (not created now) |
| `app.match_entities_by_name()` | 00011 | Same: `pg_trgm` `similarity()` | Same |
| 4 GIN trigram indexes (`entity_mentions.normalised_value`, `canonical_entities.display_name` twice, `staged_entities.display_name`) | 00001, 00007, 00011 | `gin_trgm_ops` is Postgres only; they only served the two functions above | Go with the matching replacement |
| Views `network_net_worth`, `entity_wealth_summary` | 00010 | Out of scope (tables only). They use `DISTINCT ON`, `LATERAL` and `jsonb_agg`. No code queries them (only `web/src/types/database.ts` names their fields) | Rewrite as SQLite views or app queries if needed |
| View `batch_ingest_summary` | 00011 | Out of scope (tables only). No code queries it | Same |
| Extensions `pg_trgm`, `vector`, `pg_cron` | 00001, 00011 | Postgres extensions. `pg_cron` had no scheduled jobs | Nothing to schedule today |
| Grants and PostgREST exposure | 00003 | Supabase roles and PostgREST only | Not needed on D1 |
| RPC `count_distinct_decision_seeds` (called at `web/src/app/api/candidates/[candidate_id]/decision/route.ts:90` and `web/src/app/api/decisions/import/route.ts:127`) | none | Defined in no migration; it exists only in the live database, which is not reachable | Recover its definition from the live project, or rewrite it as an app query |

## Known limits of this port

- The live database may differ from the migrations. The missing `count_distinct_decision_seeds` proves
  at least some drift. The live project was not reachable, so this port follows the repo only.
- `check_schema.py` does not compare `CHECK` and `UNIQUE` constraints, indexes, or defaults. The insert
  test (one row per table on the local copy) and reading the migration cover those.
- JSON columns accept any text. Postgres rejected invalid JSON in `jsonb` columns; D1 will not unless the
  app validates it.
