# PROJECT.md — Bloomsbury Network Mapper

> Product context. Read this at session start. Keep it current.

## Purpose

Visual network mapping for Bloomsbury Football — explore relationships between people (players, agents, scouts), clubs, contracts, and opportunities as an interactive graph.

## Status

- **Phase**: bootstrapping (no application code yet — only the dev container + docs)
- **Owner**: Ignacio Raposo
- **Started**: 2026-05-01

## Stack

_TBD — pick during first planning session. Container ships with Node 24 and Python 3.12. Likely candidates for graph viz: Cytoscape.js, Sigma.js, D3._

## Stakeholders

- Product / engineering: Ignacio Raposo

## Open questions

- What entity types and edge types matter most? (people / clubs / contracts / opportunities / something else?)
- Is data sourced from `bloomsbury-crm`, or does the mapper have its own ingestion pipeline?
- Is this primarily exploratory (read-only graph viewer) or editable?

## Links

_TBD — Supabase project, Vercel project, GitHub repo once created._
