# P3b-server: rewrite server imports of @pokemap/core

Tier: Low (mechanical, typecheck is the oracle). Inline regex script, same as p3b-ui.
Rewrite: `@pokemap/core/src/<path>.js` -> `@pokemap/core/<path>` in 47 files under `packages/server` (279 specifiers). `@pokemap/core/test/...` (43) unchanged. No map change (the `./*` pattern came with #79).

## Evidence
- Typecheck pass. `tsc --traceResolution`: `./*` exports pattern used, zero core resolutions outside this worktree.
- `vitest run --no-file-parallelism packages/server` (through the lock): 829 pass / 0 fail / 34 files.
- `npm run lint`, `npm ci`: CI. Review: none (Low tier).
