# Changelog — Bloomsbury Network Mapper

All notable changes to this project will be documented here. Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

- Initial repo scaffold: `DESIGN.md`, `PROJECT.md`, `CHANGELOG.md`, `README.md`.
- Dev Container based on tc-production recipe (Node 22 base, postCreateCommand upgrades to Node 24).
- Post-create setup script installs: Claude Code, Gemini CLI, Codex, Supabase CLI, Vercel CLI; runs `gh auth login`; registers Supabase + Vercel MCPs.
- Editor color customization: orange titleBar / statusBar / activityBar.
- Host `~/.claude` bind-mounted into container (read-write) so Claude inherits host configuration.
