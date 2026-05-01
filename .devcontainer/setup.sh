#!/usr/bin/env bash
# .devcontainer/setup.sh — runs once via postCreateCommand.
# Idempotent: safe to re-run (each step checks before installing).
set -euo pipefail

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33m[warn] %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m  ok\033[0m %s\n' "$*"; }

# ---------------------------------------------------------------------------
# 0. Mark workspace as a safe git directory (works when bind-mounted)
# ---------------------------------------------------------------------------
log "Configuring git safe.directory"
git config --global --add safe.directory "${PWD}" || true
ok  "safe.directory = ${PWD}"

# ---------------------------------------------------------------------------
# 1. Upgrade Node to 24 (image ships with 22)
# ---------------------------------------------------------------------------
log "Ensuring Node 24"
if ! node --version | grep -q '^v24\.'; then
  sudo npm install -g n
  sudo n 24
  hash -r
  ok "Node upgraded to $(node --version)"
else
  ok "Node already on $(node --version)"
fi

# ---------------------------------------------------------------------------
# 2. Install global CLIs (Claude Code, Gemini, Codex, Supabase, Vercel)
# ---------------------------------------------------------------------------
install_npm_global() {
  local pkg="$1" bin="$2"
  if command -v "$bin" >/dev/null 2>&1; then
    ok "$bin already installed ($($bin --version 2>/dev/null | head -1 || echo 'present'))"
  else
    log "Installing $pkg"
    sudo npm install -g "$pkg"
    ok "$bin installed"
  fi
}

install_npm_global "@anthropic-ai/claude-code" "claude"
install_npm_global "@google/gemini-cli"        "gemini"
install_npm_global "@openai/codex"             "codex"
install_npm_global "supabase"                  "supabase"
install_npm_global "vercel"                    "vercel"

# ---------------------------------------------------------------------------
# 3. GitHub auth (interactive — user authorizes in browser)
# ---------------------------------------------------------------------------
log "GitHub auth status"
if gh auth status >/dev/null 2>&1; then
  ok "gh already authenticated"
else
  warn "gh is not authenticated. Run \`gh auth login\` in this terminal when ready."
  warn "Skipping interactive login during postCreateCommand so the build does not block."
fi

# ---------------------------------------------------------------------------
# 4. Register MCP servers for Claude (Supabase + Vercel)
#    The host ~/.claude/ is bind-mounted, so these registrations persist
#    back to the host config — register them only if not already present.
# ---------------------------------------------------------------------------
log "Registering Claude MCP servers"

register_mcp() {
  local name="$1"; shift
  if claude mcp list 2>/dev/null | grep -q "^${name}\b"; then
    ok "MCP '$name' already registered"
  else
    if claude mcp add "$name" "$@" >/dev/null 2>&1; then
      ok "MCP '$name' registered"
    else
      warn "Could not auto-register MCP '$name'. Add it manually with: claude mcp add $name $*"
    fi
  fi
}

# Supabase MCP (official). Token can be supplied later via env or `claude mcp` UI.
register_mcp supabase -- npx -y @supabase/mcp-server-supabase@latest
# Vercel MCP (remote HTTP — Claude Code supports `--transport http`)
register_mcp vercel --transport http -- https://mcp.vercel.com

# ---------------------------------------------------------------------------
# 5. Friendly summary
# ---------------------------------------------------------------------------
cat <<EOF

================================================================
  Container setup complete.

  Versions:
    node     $(node --version)
    npm      $(npm --version)
    claude   $(claude --version 2>/dev/null | head -1 || echo 'present')
    gemini   $(gemini --version 2>/dev/null | head -1 || echo 'present')
    codex    $(codex --version 2>/dev/null | head -1 || echo 'present')
    supabase $(supabase --version 2>/dev/null | head -1 || echo 'present')
    vercel   $(vercel --version 2>/dev/null | head -1 || echo 'present')
    gh       $(gh --version 2>/dev/null | head -1 || echo 'present')

  Next steps inside this container:
    1. gh auth login        (GitHub)
    2. supabase login       (Supabase)
    3. vercel login         (Vercel)
    4. claude               (Claude inherits ~/.claude from host)
================================================================

EOF
