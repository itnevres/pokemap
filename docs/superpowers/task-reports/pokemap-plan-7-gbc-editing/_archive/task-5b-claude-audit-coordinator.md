# Plan 7 Task 5b: Claude audit of Codex's work, and acceptance (2026-10-12)

Claude's last own commit was `9ce8b45`. Task 5b feature commits `d35e6d6..ede8df3` were by a Claude subagent and never Claude-reviewed. Codex continued from `ede8df3` through `ef248a3`. This session audited all of it independently, treating Codex's reports as claims.

## Branch split (user decision, 2026-10-12)

Codex's uncommitted work (19 modified files plus `dialogFocus.ts`, `WarpEditing.test.tsx`, `GbcWarpEditing.test.tsx` and `task-reports/warp-dungeon-issues/`) implements GitHub issues #5/#6 (warp destination popups, dungeon `scope=dungeon`). It is not Plan 7.
- Its own gate collected no tests (152 EPERM).
- It changes existing GBA test bodies and fixtures.

The user chose to move it off Plan 7. The main checkout was switched to the new branch `issues-5-6-warp-popups` at `ef248a3`; the working tree was untouched and no stash, checkout or restore was used. Plan 7 close-out was done from a detached scratch worktree then attached to `plan-7-gbc-editing`. The warp work is unverified and stays uncommitted on its own branch.

## What was verified (executed, not read)

- **External state at start and after every run:**
  - PerfPlus `81ededbe3`: clean, no `.pokemap`, NewBarkTown blk/asm `0b7d45d…`/`56f87ef…`.
  - pret `3bc8daa41`: clean.
  - GBA `718b89f73`: 8 porcelain lines (the 8th is `.claude/skills/delegating-work/SKILL.md`), `world.json` `9c8ab2a…`, `dungeons.json` `f73f9b7…`. Unchanged throughout.
- **Gate at committed `ef248a3`** (scratch worktree, `npm ci`, one serial run): **2,574 pass / 0 fail**, 150 files. Typecheck and UI build exit 0. Codex's claim that `ef248a3` fixes the two known `world.test.ts` failures holds.
  - Cause: the real GBA sidecar has `dungeonAutoLayout: false` (user state).
  - The fixture now pins the flag, adds assertions, and no longer writes the real `world.json`. This is a strengthening, not a weakening.
- **GBA test parity, `9ce8b45..ef248a3`:**
  - Zero removed lines in GBA UI tests. `contextView.test.ts` is byte-unchanged.
  - The only GBA test file touched is `packages/server/test/world.test.ts` (as above).
  - The GBC removals are the old disabled "Edit here" tests and the old plain-double-click-opens-Map test, both expected by the spec and replaced.
  - One `applyPaint` count became `waitFor` because of B1 queueing.
- **Independent reviews** (both read the frozen worktree only):
  - Opus spec review `task-5b-claude-spec-review.md`: **PASS WITH FINDINGS**, 0 Critical, 0 Important, 6 Minor. All Design 1–6 and Tests 1–5 are met. The B1 ordering was re-derived with no breaking interleaving within one canvas.
  - Sonnet quality review `task-5b-claude-quality-review.md`: **APPROVED WITH FINDINGS**, 0 Critical, 0 Important, 9 Minor.
- **Coordinator mutations** (`mut.mjs`, `mut-results.json`, `mut-rerun-results.json`): each mutation used one unique literal anchor, held the original bytes in memory, restored them in `finally`, and confirmed by byte compare plus a green rerun. 13/13 killed:
  - X1–X8;
  - B1 begin-not-awaited, drag-apply-not-chained, end-not-awaited and retired-visit-paints;
  - the cached-image readiness fix.
- **Two harness defects** in these runs:
  - X5 first showed as SURVIVED although 3 tests failed. The harness classifier did not recognise `TestingLibraryElementError` (`Unable to find role="dialog" and name "Save changes"`, the intended assertion). After fixing the classifier, X5 is killed.
  - The spec reviewer accidentally overwrote the mutation worktree with HEAD bytes mid-run. B1-begin and X5 were rerun on a clean worktree: both killed. PerfPlus stayed clean in all runs.
  - That rerun's baseline had one failure: the GbcApp hover-highlight test failed at 1050 ms against the 1 s `waitFor` default, while a reviewer ran tests concurrently. It passed 6/6 in isolation and the gbc dir ran 501/0. This is load-induced timing; it is recorded as a flake risk.
- **Fix round** (coordinator, test-only, 4 added lines):
  - F1/M1: added `await act(async () => {})` before the drag-dedupe negative counts. Mutation check: deleting the dedupe guard turns the test red with `expected "spy" to be called 1 times, but got 3 times`; bytes restored, green again.
  - M7: added a positive `aria-current` control in the A→B→A context stamp test.
  - M8b: added the fixture precondition `dungeonAutoLayout === true` in `world.test.ts`. This is an added assertion only.
- **Live verification** on the final code: scratch hub 5184 with `preload.mjs` and scratch `POKEMAP_HOME`; Vite 5183 serving the worktree; Playwright MCP `browser_run_code_unsafe`; `visibilityState` was `visible` before each step.
  - The NewBarkTown World hover reads `10×9 blocks`. A double-click opens the context overlay with the `NewBarkTown 1× 2× 4× Done` bar.
  - The overlay draws 135,168 opaque px from a 384×352 one-ring image. The World canvas keeps the same DOM node, and `/api/world` is not refetched.
  - Map body 320×288: World vs overlay compare 368,640 RGBA bytes with **0 mismatches**.
  - Pencil 0x7 at block (5,4) sends `begin → apply → end` in order. A dirty Done opens SaveDialog showing "1 block changed"; Cancel stays in context. Save commits, World refetches only `NewBarkTown.png?time=day&v=1` (200), the World body pixels change on the same node, Save goes disabled, and a clean Done exits.
  - On disk only blk offset 45 changed, 1→7; the asm is identical.
  - Re-entry derived the point from the live overlay bbox, then painted 0x1 and saved (`&v=2`). Literal `cmp` returns exit 0 for both blk and asm against the pre-write snapshots. PerfPlus porcelain is empty and there is no `.pokemap`. No alerts.
- **Final gate** at the fix-round tree: **2,574 pass / 0 fail**, 150 files (65.8 s). Typecheck and UI build exit 0.

## Deferred follow-ups (Minor, recorded, not fixed here)

- **F2:** `pendingPaintRef` is per canvas instance. A context-overlay stroke's queued end can race a new stroke begun at once in the Map view, which shares the server session. It is rare, and GBA has the same scope.
- **F3/M4:** a stroke whose mouseup is lost (tool cleared mid-drag, window blur) is never ended. The next begin then merges undo steps. This predates B1 and GBA matches it. `strokeRef` makes a cheap fix possible.
- **F6:** GBC stroke serialization is now stronger than GBA `MapCanvas`, which keeps parallel trail applies and an end that races the last apply. Port B1 to GBA as a follow-up.
- **M2:** a failed begin still sends end (harmless no-op server-side).
- **M3:** a throwing `onEditError` would poison the chain. Not possible today.
- **M5:** pressing Done or Escape within one round trip of the first paint exits without SaveDialog, because `isDirty` isn't set yet. The edit is kept, and the map-switch and `beforeunload` guards still fire.
- **M6:** `ZOOM_LEVELS.indexOf` returns -1 for a non-level context zoom; it is unreachable from the UI.
- **M8c:** other server suites (`dungeons.test.ts`, saveRoutes, paintRoutes, eventRoutes, signRoutes, api) still open the real GBA corpus, and `dungeons.test.ts` rewrites and restores `.pokemap/dungeons.json`. That explains its fresh mtime with an unchanged hash. Port the `world.test.ts` scratch-root fixture to those suites.
- **M9:** about 80 lines of context logic are duplicated between GBA and GBC (a candidate `useWorldContext` hook).
- **F4/F5:** spec bookkeeping. The X2 kill comes from group 3/4, not group 1, and the `world.test.ts` change is named here.
- **Flake risk:** `GbcApp.test.tsx` "hovering the canvas highlights…" can exceed the 1 s `waitFor` under parallel load.
