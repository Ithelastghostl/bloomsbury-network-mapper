# Identity Resolution Strategy — v1

## 1. Challenge

The corpus contains 20,444 Charity Commission filings with ~331 person-name patterns per document (median 265). The same individual frequently appears across multiple filings with name variations (initials vs full names, maiden names, title differences), different roles (trustee in one filing, director in another), and different organisations. Correct identity resolution is critical: under-merging fragments a person's network and weakens candidate scoring; over-merging conflates distinct people and produces false candidates.

## 2. Identity Layers (PRD 15.1)

```
Raw Document -> Extracted Mention -> Candidate Cluster -> Canonical Entity -> Human-Verified Entity
```

Raw mentions are never mutated. Clusters are proposals; canonical entities are the working truth; human decisions are final.

## 3. Matching Signals

Signals and weights per PRD 15.3:

| Signal | Weight | Source |
|---|---:|---|
| Name similarity | 0.30 | `pg_trgm` trigram similarity |
| Embedding similarity | 0.25 | `pgvector` cosine distance on mention context embeddings |
| Shared organisation | 0.20 | Both mentions linked to same charity/company registration number |
| Shared address | 0.15 | Normalised address or postcode match |
| Role overlap | 0.10 | Same role type (trustee, director) at overlapping time periods |

Registration numbers (charity number, company number) are strong anchoring signals for organisations. When two person mentions share the same organisation registration number, shared_organisation_score is high even if name similarity is moderate.

## 4. Decision Bands (PRD 15.2)

| Match Confidence | Behaviour |
|---:|---|
| >= 0.90 | Auto-cluster, high confidence |
| 0.75 - 0.89 | Provisional cluster, visible warning to reviewer |
| 0.55 - 0.74 | Possible duplicate, do not merge — surface for manual review |
| < 0.55 | Keep separate |

## 5. Auto-Merge Blockers (PRD 15.4)

Auto-merge is blocked regardless of score when any of:

- **Incompatible date of birth** — different DOBs extracted from filings.
- **Conflicting registration IDs** — mentions tied to conflicting person-level identifiers.
- **Prior human split** — a reviewer has previously marked these mentions as not-same-person.
- **Incompatible active roles** — mutually exclusive roles in the same time period (e.g., two different people serving as "Chair" of the same charity simultaneously).
- **Common-name-only match** — match relies solely on a common name with no corroborating signal (see below).

## 6. Common Name Handling

Names like "John Smith", "David Jones", "Sarah Williams" occur frequently across UK charity filings. Strategy:

1. Maintain a common-name list seeded from UK census frequency data, calibrated during gold-set labelling.
2. When a match involves a name on the common-name list and the only strong signal is name similarity, block auto-merge regardless of score.
3. Common-name matches require at least one corroborating signal (shared org, shared address, embedding similarity above 0.80) to reach provisional-cluster status.
4. Flag all common-name clusters for reviewer attention with reason code `common_name_review`.

## 7. Corpus-Specific Considerations

- **Multi-board service is a feature.** Many charity trustees legitimately serve on 3-10+ boards. When the same person appears across multiple filings, this strengthens their identity cluster and is a positive signal for candidate discovery (influence indicator).
- **Registration numbers anchor orgs.** Charity numbers (e.g., "1234567") and company numbers (e.g., "SC012345") are unique identifiers. Organisation identity resolution should use exact registration number matching as the primary signal.
- **Filing year as temporal signal.** The corpus spans 2019-2025. Role overlap in the same year increases match confidence; role in a 2019 filing and a 2024 filing with the same name is weaker without corroboration.
- **Title and role context.** Filings often list trustees by name with role (Chair, Treasurer, Secretary). These role labels disambiguate: two "J Smith" entries where one is Chair and the other is Treasurer of the same charity in the same year are likely different people.
- **Address sparsity.** Corpus profiling shows a median of 5 postcode patterns per document — addresses are available but sparse relative to names. Address matching is a supporting signal, not a primary one.

## 8. Human Decision Replay (PRD 15.5)

All human merge/split decisions are stored in `human_identity_decisions` and replayed during every graph rebuild. Human decisions are never overridden by automated logic. If new evidence conflicts with a human decision, the conflict is logged to `quarantine` with reason `identity_conflict` and surfaced as an `identity_warning`. Only a newer human decision from a senior reviewer can override a prior human decision.

## 9. Stable Canonical IDs (PRD 11.3)

Canonical entity IDs persist across runs. The system matches clusters to existing canonical entities using registration number first, then high-confidence embedding similarity plus shared affiliations. New canonical entities are created only when no existing match exceeds the merge threshold.
