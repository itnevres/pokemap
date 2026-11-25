# P3a review (combined spec + quality, Medium)

Verdict: APPROVE the diff itself. One Important evidence gap in how it was verified (below).

## Spec checklist
- exports map added, no import rewrites, no folder moves: MET (packages/core/package.json:5-10; diff touches only the two package.json files).
- Existing `@pokemap/core/src/*.js` specifiers keep resolving: MET. I grepped every `@pokemap/core/...` specifier in packages/** (excluding node_modules). There are 554 occurrences. All of them are `@pokemap/core/src/<path>.js` or `@pokemap/core/test/<path>.js`. None has a `..` segment, a `${}` interpolation, an explicit `.ts`/`.tsx`/`.json` extension, or a non-.js ending. Every unique `src/*.js` target maps to an existing `packages/core/<path>.ts` (checked by script; the only "miss" was the literal `src/*.js` inside the cli comment text).
- Test helpers used by other packages: MET. The `@pokemap/core/test/...` forms are `helpers/corpus`, `helpers/gbaTempProject`, `helpers/gbaTilesetProject`, `helpers/testRoots`, `gbc/helpers/corpus`, `gbc/helpers/stubGbcProject`. All match `./test/*.js` -> `./test/*.ts`, including the nested gbc paths, because `*` spans `/` in Node and TS exports patterns.
- Ruling 35 (UI must not use the root): MET. No bare `@pokemap/core` import exists in any .ts/.tsx under packages/**. The only bare `@pokemap/core` strings are the `dependencies` entries in cli, server and ui package.json and core's own `name`. The `"."` entry only serves `main`'s consumers (none today). Core's src/index.ts has no re-exports that matter to the UI because the UI never imports it.
- Relative `../../core/test/...` imports (mcp tests, cli tests) bypass the package and are unaffected.
- No alias, resolve or conditions config in vite.config.ts or vitest.config.ts that would conflict. tsconfig.base.json uses `moduleResolution: Bundler`, which supports exports patterns with extension substitution (.js -> .ts).
- cli package.json comment: ACCURATE. Core files use relative `./x.js` imports (e.g. packages/core/src/project.ts:2-4), which Node 24 type stripping does not rewrite. Those are the remaining reason `node packages/cli/src/index.ts` cannot run. The old stated cause (missing exports map) is now only half true, so the edit is correct. packages/cli/package.json:5 (the comment line) has one wording nit (Minor): "core's exports map only covers the package-level `@pokemap/core/src/*.js` imports" reads awkwardly. Suggest "core's exports map fixes the package-level `@pokemap/core/src/*.js` specifiers but not the relative ones inside core".

## Findings
Important (evidence, not code): the worktree's `node_modules` is a junction to the MAIN checkout's `node_modules`, and `node_modules/@pokemap/core` links to `C:\Programming Projects\PokeMap\packages\core`. That copy has NO exports map (verified: main's package.json is the old 4-line file). So a vitest/typecheck/Vite run from this worktree resolves every `@pokemap/core/...` specifier through main's package.json and never exercises the new map. A green gate here proves nothing about the exports patterns. Failure scenario: a pattern typo (e.g. `./test/*.js` mapped wrongly) passes the worktree gate, then breaks every cross-package import after merge. Fix: re-run the gate after merge, or relink `node_modules/@pokemap/core` to the worktree's packages/core (unlink the junction, never delete through it, per the worktree-junction memory) before the gate.

Minor: `./test/*.js` publicly exposes core's test helpers through the package. This is intended (other packages' tests need it) and the package is private/workspace-only, so no action.
Minor: explicit `.ts` specifiers (`@pokemap/core/src/x.ts`) would now fail, where they previously resolved via filesystem. None exist today. Consider a guard or a note for P3b.
Minor: `"./package.json"` export is harmless and conventional.

No Critical issues. No test changes were needed or made, which fits a config-only change. The real check is resolution under TS, Vite and vitest, which is the evidence gap above.
