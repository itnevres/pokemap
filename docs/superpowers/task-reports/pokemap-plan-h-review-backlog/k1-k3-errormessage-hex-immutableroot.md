# Plan H rows K1a, K1b, K1c, K2, K3 (conductor report)

Tier: Low for each (mechanical, any wrong answer fails typecheck or a test). Branch `claude/plan-h-k1` from master `b9cfbc3`, one PR.
Implementation route: a deterministic regex codemod run by the conductor (no model dispatch; a model brief would cost more than the script and
could not be more exact). No review dispatched: Low tier, typecheck and tests cover every edit.

## What changed
- K1a: `packages/core/src/errorMessage.ts` (no imports), core + CLI call sites. The private copy in `write/atomic.ts` and `errorText` in `blockEdit/gbcOps.ts` are gone.
  `packages/cli/test/lazyImports.test.ts` allow-list gained the import-free helper (two assertions).
- K1b: server call sites (36 `x instanceof Error ? x.message : String(x)` sites, 11 files).
- K1c: UI call sites; `canvas/WorldSurface.tsx` local `messageOf` removed; `shared/blockEditor/useBlockEditor.ts` keeps a local `editorErrorMessage` (STALE special case) built on the helper.
  Variants with a fixed fallback string (`e instanceof Error ? e.message : "Failed to save."`, 11 sites) and `new Error(String(e))` are not the same expression and stay.
- K2: `packages/ui/src/shared/format.ts` holds `hex` (upper case) and `isRecord`. Four `hex` copies and three `isRecord` copies removed; importers repointed.
  GBC palette search lower-cases the hex before matching (`hex(id).toLowerCase().includes(q)`), so searching `0x1f` still works.
  Tests that pinned lower case, updated to upper case: `test/gbc/GbcMapCanvas.test.tsx:229` (`BR 0xC8 (wall)`), `test/gbc/GbcMetatilePalette.test.tsx:155,161,167` (`metatile 0xC`, `0xC`, `0x1F`).
- K3: `addEvent/sources.ts` exports `setImmutableRoot(root)`; new `packages/core/test/helpers/immutableRootSetup.ts` calls it from the environment variable the globalSetup sets;
  `vitest.config.ts` `setupFiles` lists it first. Production never calls it, so nothing is cached there.
  Wall time, `vitest run packages/core/test/addEvent` (8 files, 186 tests): 122.0 s before, 124.4 s after (noise). A probe test in the server project confirmed the cache engages (second `textFiles` call 0.0 ms).

## Evidence
- Typecheck pass; UI build pass (`npm run build -w packages/ui`).
- Gate run at `323c13f` (merged result, master unchanged): 5605 pass / 7 fail / 303 files. After the fixes above, the failed files were re-run:
  - `GbcMapCanvas`, `GbcMetatilePalette` (3 tests): the hex case pins, fixed, pass.
  - `core/test/addEvent/gbaCopy.test.ts`: beforeAll hook timeout (10 s) under load; passes on re-run.
  - `server/test/hub.test.ts` "unreadable --port": my worktree's `node_modules` junction was mis-created (bad target), so `tsx/dist/cli.mjs` was missing; junction rebuilt, passes.
  - `server/test/gbcAddEventRoutes.test.ts` (2 tests, 8 s limit): ran 11.6 s and 12.9 s in one re-run, passed in the next; with K3 reverted the file also passed. The tests sit at 6-9 s on this loaded machine, so the 8 s limit is marginal; not a K3 logic fault (probe above shows the cache works).
  - `core/test/config/engine.test.ts` "parses the subject repo's real porymap.project.cfg": the known env failure (RESUME / LESSONS).
- Subjects: porcelain before and after identical (both clean).

## Live check (K2 hex case), servers started from this worktree
Served code verified as mine: `GET :5173/src/shared/format.ts` returned the new `format.ts`. Browser pane, then servers stopped.
- GBC (pokecrystal-PerfPlus, Route39): palette search `0x1f` leaves one cell, label `metatile 0x1F`; search `0xc` leaves `metatile 0xC`; status strip hover reads `id 0x44`, `0x48`, `0x3` (strip ids unchanged in form).
  The `BR 0xC8 (wall)` fallback (name null) did not occur on this map; `formatQuadrant` is covered by the updated `GbcMapCanvas.test.tsx` pin.
- GBA (game, VioletCity): palette has 980 cells with labels `metatile 0xA`..`0xE`; hover strip reads `id 0x35B · collision 1 · elevation 0 · behavior 0x0`.
Production code changed after the gate run at `323c13f`: none (only the two UI test files and this report).
