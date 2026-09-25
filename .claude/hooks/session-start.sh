#!/bin/bash
# SessionStart hook for Claude Code on the web (claude.ai/code) sessions.
# The Windows machine is unaffected: it only runs when CLAUDE_CODE_REMOTE=true.
#
# It makes the full test suite runnable in a cloud container:
#   1. `npm install`. The package-lock "peer": true churn is reverted on startup.
#   2. Clones the GBA reference engines and the GBC subject at the exact commits
#      the suite was verified against on 2026-09-25 (1271 pass, 6 known deltas;
#      see docs/superpowers/RESUME.md "Environments").
#   3. Finds the GBA subject (itnevres/pokemon-three-region, a PRIVATE repo). The
#      session must have that repo attached: select it when starting the session,
#      or attach it later and re-run this script.
#   4. Writes pokemap.config.json with the cloud paths and marks it
#      `git update-index --skip-worktree`, so the local-only config never shows as
#      modified and can never be committed. The committed file keeps the Windows
#      paths. To undo: `git update-index --no-skip-worktree pokemap.config.json &&
#      git checkout -- pokemap.config.json`.
#
# Idempotent: re-running it skips clones that are already at their pinned commit.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

INPUT="$(cat 2>/dev/null || true)"
SOURCE="$(printf '%s' "$INPUT" | sed -n 's/.*"source"[[:space:]]*:[[:space:]]*"\([a-z]*\)".*/\1/p')"
REPO="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
CORPUS="${POKEMAP_CORPUS_DIR:-$HOME/pokemap-corpus}"
cd "$REPO"

log() { echo "[pokemap session-start] $*" >&2; }

# --- 1. dependencies ---------------------------------------------------------
lock_was_clean=true
git diff --quiet -- package-lock.json || lock_was_clean=false
npm install --no-audit --no-fund >/dev/null 2>&1 || npm install --no-audit --no-fund
# Revert only churn this install introduced, never a lockfile edit already in progress.
if $lock_was_clean && ! git diff --quiet -- package-lock.json; then
  git checkout -- package-lock.json
  log "reverted npm's package-lock.json churn"
fi

# --- 2. pinned corpora -------------------------------------------------------
# name|url|commit (a full or abbreviated SHA the remote can serve)
PINNED=(
  "refs/pokeemerald|https://github.com/pret/pokeemerald|5eff78649e7170a877b961ef0b3da13b81a16038"
  "refs/pokefirered|https://github.com/pret/pokefirered|c75f352304d529f6ba92d4f74b9cf8b5c3810788"
  "refs/pokeemerald-expansion|https://github.com/rh-hideout/pokeemerald-expansion|0a9c697c769753aef4db82b0da87f0c904399bac"
  "refs/modern-emerald|https://github.com/resetes12/pokeemerald|67f2cc43d2a5e6112e6cfc477e7ef75d78e2a46b"
  "refs/pokeclassic|https://github.com/danenders/pokeclassic|9c3a49affcb9b9f5e67dd9ae6a5e079af3bf26b5"
  "pokecrystal-PerfPlus|https://github.com/itnevres/pokecrystal-PerfPlus|81ededbe311267c774b5540d8c8b381a314dc6d6"
)

fetch_pinned() {
  local dir="$1" url="$2" sha="$3"
  if [ -d "$dir/.git" ] && [ "$(git -C "$dir" rev-parse HEAD 2>/dev/null)" = "$sha" ]; then
    return 0
  fi
  rm -rf "$dir"
  mkdir -p "$dir"
  git -C "$dir" init -q
  git -C "$dir" remote add origin "$url"
  git -C "$dir" fetch -q --depth 1 origin "$sha"
  git -C "$dir" -c advice.detachedHead=false checkout -q FETCH_HEAD
  log "fetched $(basename "$dir") @ ${sha:0:9}"
}

for entry in "${PINNED[@]}"; do
  IFS='|' read -r name url sha <<<"$entry"
  if ! fetch_pinned "$CORPUS/$name" "$url" "$sha"; then
    log "WARNING: could not fetch $name ($url @ ${sha:0:9}); tests needing it will fail or skip"
  fi
done

# --- 3. GBA subject (private; not pinned; it tracks the game's default branch) -----
SUBJECT=""
for cand in "${POKEMAP_SUBJECT_DIR:-}" "$HOME/pokemon-three-region" "$(dirname "$REPO")/pokemon-three-region" "$CORPUS/pokemon-three-region"; do
  if [ -n "$cand" ] && [ -f "$cand/data/layouts/layouts.json" ]; then SUBJECT="$cand"; break; fi
done
if [ -z "$SUBJECT" ]; then
  if git clone -q --depth 1 https://github.com/itnevres/pokemon-three-region "$CORPUS/pokemon-three-region" 2>/dev/null; then
    SUBJECT="$CORPUS/pokemon-three-region"
    log "cloned pokemon-three-region"
  else
    rm -rf "$CORPUS/pokemon-three-region"
    SUBJECT="$CORPUS/pokemon-three-region"
    log "WARNING: GBA subject itnevres/pokemon-three-region is not reachable. Attach it to this"
    log "session (it is private), then re-run: CLAUDE_CODE_REMOTE=true .claude/hooks/session-start.sh"
    log "Until then, GBA corpus test files fail at collection (the GBC suite is unaffected)."
  fi
fi

# --- 4. local-only config ----------------------------------------------------
cat > pokemap.config.json <<EOF
{
  "projectPath": "$SUBJECT",
  "referenceProjects": [
    "$CORPUS/refs/pokeemerald",
    "$CORPUS/refs/pokefirered",
    "$CORPUS/refs/pokeemerald-expansion",
    "$CORPUS/refs/modern-emerald",
    "$CORPUS/refs/pokeclassic"
  ],
  "gbc": {
    "projectPath": "$CORPUS/pokecrystal-PerfPlus",
    "referenceProjects": []
  }
}
EOF
git update-index --skip-worktree pokemap.config.json
log "pokemap.config.json -> cloud paths (skip-worktree; never commit it)"
log "subject: $SUBJECT @ $(git -C "$SUBJECT" rev-parse --short HEAD 2>/dev/null || echo 'MISSING')"
log "ready (source=${SOURCE:-unknown}). Expected cloud baseline: all pass except 6 known local-state deltas (RESUME.md)."
