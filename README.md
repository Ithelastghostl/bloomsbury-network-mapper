# Bloomsbury Network Mapper

Visual network mapping tool for Bloomsbury Football — graph relationships between people, clubs, contracts, and opportunities.

## Quick start

This project runs inside a Dev Container. To get going:

1. Open this folder in Antigravity (or any VS Code-family editor).
2. When prompted, **Reopen in Container**. The container will build and the post-create script will install Node 24, Claude Code, Gemini, Codex, Supabase CLI, Vercel CLI, and run `gh auth login`.
3. After the container is ready, run `supabase login` and `vercel login` to wire your accounts.

## Repo layout

| File          | Purpose                                                         |
| ------------- | --------------------------------------------------------------- |
| `DESIGN.md`   | Visual / UI design system. Read before any UI work.             |
| `PROJECT.md`  | Product context, scope, stakeholders, current status.           |
| `CHANGELOG.md`| Notable changes per release.                                    |
| `.devcontainer/` | Dev Container definition + post-create setup script.         |

## Sister projects

- `../bloomsbury-crm` — customer relationship management companion.

Both projects are intentionally siblings under `Bloomsbury-football/` and share the same dev container baseline.
