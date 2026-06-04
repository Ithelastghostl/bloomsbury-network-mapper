# Pipeline augmentation plan — the 1,131 discovered-no-data people

## What this is

The CRM holds 1,131 "pipeline" people: discovered through seed research (as co-directors, fellow trustees, or company colleagues) but carrying no wealth read and no profile. They are bare names on the All/Pipeline views. This plan gets them to a useful "general level" so a fundraiser can triage them, and so a future deep-augmentation pass has a head start.

Two tiers, by what each person's data supports:

- **Tier A — derivable now (747 people).** They already have a company/org and a named connection in the graph (e.g. "Mark Finlay Brown → Shore Capital Markets" via a seed). We can stamp general-level fields straight from stored relationships, no web research, no cost.
- **Tier B — needs research (384 people).** Bare names with no derivable company or link. These wait for a future research pass; we flag them so they're not mistaken for "assessed and empty."

## Tier A: derive general-level data now (no web research)

For each of the 747, compute and store on `attributes`:

| field | source | example |
|---|---|---|
| `org_general` | the company/org they're a director of or share a board with (from `network_connections` DIRECTOR_OF / `via_organisation` / `co_director_edges.company_name`) | "Shore Capital Stockbrokers Ltd" |
| `connected_seed` | the seed(s) they share that org/board with — the route into our network | "Howard Shore" |
| `sector_general` | a coarse sector inferred from the org name keywords (finance, property, charity, sport, media, tech, legal, other) | "finance" |
| `pipeline_tier` | `"A-derivable"` | — |
| `next_action` | "Profile via `<org>` (shared with `<seed>`)" if no warm path exists yet | — |

Sector inference is keyword-only and coarse (capital/partners/LLP/asset → finance; properties/estates/homes → property; foundation/trust/charity → charity; FC/football/sport → sport; media/publishing → media; ventures/tech/software/labs → tech; law/legal/solicitors → legal; else other). It is a *hint* for triage, explicitly not a verified classification.

This makes 747 people instantly triable: "show me everyone in our orbit at hedge funds we haven't profiled," etc. None of it is fabricated — every value traces to an existing edge.

## Tier B: flag for future research (384 people)

Stamp `attributes.pipeline_tier = "B-needs-research"` and `next_action = "Research identity (bare co-director name)"`. No other change. These are the genuine long tail — single-link co-directors with no company context — where per-person web research is the only way forward and the yield is low. Surfacing the flag stops them reading as "assessed, nothing found."

## Future deep-augmentation (when/if resourced)

When ready to research pipeline people, prioritise in this order — highest yield first:

1. **Tier-A people at wealthy seeds' companies.** A co-director who shares a board with a £1bn+ seed (Platt, Rausing, Lubner, Bamford, Ross, Desmond, Henkel) is far likelier to be a real prospect than a random co-director. Rank Tier A by the *wealth band of the seed they connect to*, research the top slice.
2. **Tier-A people at finance/PE/property orgs** (the `sector_general` filter) — the sectors where co-directors are most often wealthy.
3. Everyone else / Tier B only on request.

Reuse the existing pipeline: research agent (anchored by `org_general` + `connected_seed`) → transcript → `batch-ingest.ts --batch-id pipeline-batch-NNN` → `merge-duplicate-entities.ts --all-types` → refresh (`score-network-position --mark-unknown-seeds`, `compute-warm-paths`, `classify-orgs`, `promote-contact-fields`). The evidence-first rule holds: store a £ figure only with a real source.

## Execution

`web/scripts/derive-pipeline-context.ts` does Tier A + Tier B in one pass (dry-run supported). Idempotent; re-run after any new ingest to pick up newly-discovered pipeline people.

Stamped 2026-06-04. Counts: 1,131 pipeline (747 Tier A, 384 Tier B) at time of writing.
