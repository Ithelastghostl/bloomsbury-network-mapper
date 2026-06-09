# Dossier retry — second-pass augmentation for hard-to-identify people

Some people the pipeline discovers (often **private Bloomsbury Football donors / event
guests**) have no generic web footprint, so the first augmentation pass cannot confirm
who they are. Rather than leaving them as bare names — or, worse, fabricating a profile —
we run a **charity-anchored retry** and **flag them for human review**.

## The flag

When augmentation can't confidently identify someone, these go on
`canonical_entities.attributes`:

| key | meaning |
|---|---|
| `needs_human_review: true` | surfaced with a ⚠ banner in the CRM entity panel |
| `augmentation_quality: "low"` | quality marker for filtering/reporting |
| `identity_confirmed: false` | identity not established |
| `review_reason` | one-line why-it-needs-attention |
| `dossier` | the best-effort basic dossier (see below) |
| `dossier_attempts` | how many retry passes have run |

The CRM entity panel (`web/src/components/crm/entity-panel.tsx`) renders the banner,
the `review_reason`, the dossier summary, the **leads to chase**, and the reviewer notes,
so a fundraiser opening the profile immediately sees it needs care and what to check next.

## The dossier

A best-effort object even when identity isn't confirmed — usable in the main workflow:
`bloomsbury_connection`, `current_role`, `employer`, `location`, `wealth_signal`,
`summary`, `candidate_leads[{lead,url}]`, `sources[]`, `reviewer_notes`, plus
`found`/`identity_confidence`/`method`/`generated_at`.

## Running it (and retrying for future cases)

The web research runs on the **Claude Code subscription** (never a metered API), so the
script is a harness with a list/apply loop:

```bash
cd web
# 1. who needs a (re)try?  (filtered server-side: needs_human_review OR identity unconfirmed)
npx tsx scripts/dossier-retry.ts --list

# 2. Claude Code researches each — anchored on the charity: Bloomsbury Football
#    Foundation (charity no. 1178842), its trustees, Charity Commission + Companies
#    House, donor/gala pages, and LinkedIn co-occurrence — and writes a dossiers JSON
#    (array of DossierResult, see scripts/dossier-retry.ts for the shape).

# 3. persist dossiers + set/clear the review flag (idempotent; bumps dossier_attempts)
npx tsx scripts/dossier-retry.ts --apply path/to/dossiers.json
```

`--apply` clears the flag and sets `identity_confirmed: true` **only** when a dossier
comes back `found` with `identity_confidence: "high"`; otherwise the person stays in the
queue for the next retry. Re-running is safe — `--apply` overwrites the dossier and
increments the attempt count.

> First run (2026-06-09): the 4 unresolved HNW targets (Jo Clerkin, Valetta Williams,
> Alyx Williams, Catherine Scahill) were retried charity-anchored. None could be
> confirmed from public sources (they appear to be private supporters not publicly
> indexed); all 4 were flagged with dossiers + leads for human follow-up. The likely
> resolution is internal: ask the data owner which Bloomsbury artifact (gala guest list,
> Big Give/JustGiving donor record, RSVP) produced each name.
