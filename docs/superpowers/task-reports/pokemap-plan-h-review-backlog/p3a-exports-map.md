# P3a: `exports` map for @pokemap/core

Tier: Medium (connected components; typecheck/build catch a wrong map). Implemented inline: one JSON edit plus one comment line (delegate §9, under ~10 min, brief costs more than the edit).
Review: combined spec+quality, Sonnet-tier (`quality-reviewer`; opencode not on PATH, so the DeepSeek hop was skipped): APPROVE, report `p3a-review.md`. Its one Important item (worktree resolves core from main) was fixed before the gate by junctioning `packages/{ui,cli,server,mcp}/node_modules/@pokemap/core` to this worktree's core; `tsc --traceResolution` shows `Using 'exports' subpath './src/*.js'` resolving into this worktree.

## Change
`packages/core/package.json` gains
```
"exports": { ".": "./src/index.ts", "./src/*.js": "./src/*.ts", "./test/*.js": "./test/*.ts", "./package.json": "./package.json" }
```
All 554 existing `@pokemap/core/...` specifiers match `./src/*.js` or `./test/*.js`; no import is rewritten (P3b) and no folder moves (P3c). Node's resolver now maps these `.js` specifiers to `.ts`; the `cli` package comment is updated (relative `.js` imports inside core still stop `node packages/cli/src/index.ts`, so no `bin` yet).
`./test/*.js` stays because other packages' tests import core test helpers. `"."` stays but the UI must not use it (ruling 35, node-only barrel).

## Decision (wildcards, not an enumerated list)
**Q:** list the 68 deep paths one by one or use two wildcards? **I picked:** wildcards. **Why:** P3b renames specifiers, so a list would be rewritten at once; the map still blocks anything outside `src/` and `test/`. **To undo:** replace the wildcards by a list.

## Evidence
- Gate at worktree on 365cf76 + this diff: 5622 pass / 2 fail / 303 files (301 pass). Fails: `engine.test` "parses the subject repo's real porymap.project.cfg" (known env fail) and `gbcAddEventRoutes` commit test (known slow; passes alone: 39/39).
- `npm run typecheck` pass; `npm run build -w packages/ui` pass; subjects unchanged.
- `npm run lint`: not run locally (main's node_modules lacks eslint); CI runs it.
- `npm ci`: not run locally (junctioned node_modules); lockfile untouched; CI runs it.
- Caveat: tsc falls back to the next `node_modules` up, so a broken map does not fail typecheck in this worktree (mutation check showed the fallback to main's core). CI (npm workspaces, no fallback) is the real proof.
