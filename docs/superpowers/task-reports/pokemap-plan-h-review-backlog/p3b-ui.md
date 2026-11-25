# P3b-ui: rewrite ui imports of @pokemap/core

Tier: Low (mechanical, typecheck is the oracle). Implemented inline by one regex script (delegate §9: a one-command rewrite; writing a brief costs more).
Rewrite: `@pokemap/core/src/<path>.js` -> `@pokemap/core/<path>` in 96 files under `packages/ui` (166 specifiers; the 5 inline `import("...")` types included). `@pokemap/core/test/...` untouched (ui has none).
Map: P3a kept only the old forms, so this PR adds `"./*": "./src/*.ts"` to `packages/core/package.json`. Old `./src/*.js` stays for server/cli/tests until their PRs. Decision logged in decisions-h-p3b.md.

## Evidence
- `tsc --traceResolution` (ui tsconfig): `Using 'exports' subpath './*' with target './src/errorMessage.ts'`; every `@pokemap/core` resolution lands in this worktree's core.
- Typecheck pass. UI build pass; bundle is byte-identical in name (`index-DlsQsDJV.js`, 429.12 kB, same as before the change).
- `vitest run --no-file-parallelism packages/ui` (through the lock): 2702 pass / 0 fail / 141 files.
- `npm run lint` and `npm ci`: CI (shared node_modules locally).
- Review: none (Low tier, mechanical, typecheck oracle).
