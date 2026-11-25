# P3b-cli: rewrite cli imports of @pokemap/core, close the old map entry

Tier: Low (mechanical, typecheck is the oracle). Inline regex script, as p3b-ui and p3b-server. `packages/mcp` had no `@pokemap/core/src` import: nothing to rewrite (grep: 0 files).
Rewrite: 66 specifiers in 12 `packages/cli` files, `@pokemap/core/src/<path>.js` -> `@pokemap/core/<path>`.
Close-out: after this, `grep -r "@pokemap/core/src"` over the repo (minus docs and node_modules) finds nothing, so the `./src/*.js` map entry is removed from core's `package.json`. `./*` (src), `./test/*.js`, `.` and `./package.json` remain. Stale `cli` package comment reworded.

## Evidence
- Typecheck pass; UI build pass (`index-DlsQsDJV.js`, 429.12 kB, unchanged).
- `tsc --traceResolution`: zero core resolutions outside this worktree; zero uses of a `./src/` pattern.
- `vitest run --no-file-parallelism packages/cli packages/mcp` (lock): 141 pass / 0 fail / 12 files.
- `npx tsx packages/cli/src/index.ts --help` runs.
- Lint, `npm ci`: CI. Review: none (Low tier).
