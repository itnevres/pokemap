# Task 7 conductor report: GBC world canvas onto `WorldSurface` (High)

Tier: High. It replaces a family canvas, and GBC gains multi-select, marquee and group move (P12-3). The existing GBC tests are the oracle.

## Delegation

- Task 7: Codex `gpt-6.1-sol` in scratch worktree `wt-t7` (base `d4a95fe`). It produced the adapter, wrapper, tests and notes in one pass (~372k tokens), then stopped on a surface-contract gap, as the brief told it to. Notes: `task-7-impl-notes.md`.
- Conductor inline fixes (each under 20 lines, 1-2 files; writing a brief would have cost more than the edit). Each fix is listed below.

## Conductor fixes to the shared surface

1. **Border neighbours (Codex stop finding).** Old GBC (`GbcWorldCanvas.tsx:729-745`) picks border sides over every sized, in-scope placement, including hidden indoor and gate maps. GBA (`WorldCanvas.tsx:1023-1028`) and the Task 5 surface pick over drawn maps only. This is an unnamed family difference. Per the user's rule, each family keeps its behaviour, so no user ruling is needed. It is now the adapter fact `borderNeighbours?: "drawn" | "scoped"` (`worldSurfaceAdapter.ts`; surface `sideByMap`), and GBC sets `"scoped"`. Regression test: `GbcWorldCanvasSurface.test.tsx` "a hidden indoor neighbour still blocks a border side". The hand-derived case is in the test comment.
2. **Wheel listener re-bound on every zoom change.** `useStageZoom`'s effect listed `zoom` in its deps, so each wheel re-attached the listener. Old GBC bound once. `GbcWorldCanvas.test.tsx` "the wheel listener is registered with { passive: false }" asserts that and failed. Only the stepped branch reads `zoom`, so the dep is now `policy.kind === "stepped" ? zoom : undefined` (`canvas/useStage.ts`). The 12a map surfaces use the stepped policy, so they still re-bind as before.
3. **Context snap overwritten by the first fit.** When `context` is set at mount, `useWorldContext` snapped before the first fit landed, and the fit then overwrote the snap. The fake-adapter tests never mounted with a context. Four `GbcWorldCanvasContext.test.tsx` tests failed (snap once, 1x/2x/4x, the zoom cap, and exit requests). The surface now passes the context placement only once `view.fitted` is true. This matches old GBC, whose fit effect ran before `useWorldContext`.
4. **Jump waited for a measured viewport.** The Task 5 surface did not stamp a jump until the viewport was measured. Neither source canvas waited. The three `GbcApp.test.tsx` jump/highlight tests run with a 0x0 viewport and failed. The Task 5 tests pin the opposite: a jump before measurement must fit exactly once the viewport is measured. Both are now kept. The highlight and reveal land as soon as the world exists and the filter allows the map, and the 60% fit stays pending (`pendingJumpFit`) until the viewport is measured.

None of these changes any existing test. No `family` branch was added to `canvas/`.

## Existing tests changed (P12-4m only, as the plan allows)

`GbcWorldCanvas.test.tsx`: Fit-all (old `:685`), StrictMode Fit-all (old `:1323`) and the F-shortcut fit (old `:2001-2009`). The new expectation is the cluster fit (0,0)-(20,10) at zoom 10 with pan (0,50), 31%, which excludes the far singleton. The values are hand-derived in comments. No other existing test changed.

## P12-4m first-fit deltas (Task 2 quality review M8)

1. `fitClusters` unions the live member placements, so the fit follows a manually moved cluster member. Old GBC unioned `component.bounds`.
2. `fitFilter` uses the anchored rule. Old GBC fitted every scoped member, shelved members included.

Static inspection (Codex) found no GBC fixture that moves a cluster member or mixes shelved and anchored members in a filter. The dungeon fixtures have `components: []` and fall back to every scoped placement. The run confirms it: no other GBC test failed.

## Deferred M6

`GbcWorldCanvasContext.test.tsx:290` and `:314` drive the real wrapper's stage (native wheel and key). They exercise the surface's in-context cap, so no duplicate test was added. Both failed before conductor fix 3, which shows they reach the surface path, and both pass after it.

## Evidence

- Focused (worktree): `test/gbc`, `test/canvas`, `test/shell/worldParity`, `test/world`: 55 files, 1164/1164 pass after the fixes. Typecheck clean.
- New file `GbcWorldCanvasSurface.test.tsx`: 13/13 after the fix round (10 at first, then the cacheKey test, then the two fix-round tests).
- Mutations and the old-source run: see the "Mutation matrix" section (appended after the run).

## Mutation matrix (conductor, each file restored and hash-checked)

| Mutation | Result |
|---|---|
| P12-4i: `WARP_HIT_RADIUS` 8 → 6 | red: "P12-4i: eight pixels ... nine selects" |
| P12-3: surface posts only the first moved map (the selection in one request) | red: "P12-3: group movement posts one body per map ..." |
| `cacheKey` ignores time (`"day"`) | **survived the first run**. Existing time tests only check `?time=` URLs. Added "a time switch drops the old time's tiles instead of keeping them on screen"; the mutation is now red |
| `borderNeighbours: "scoped"` removed | red: "a hidden indoor neighbour still blocks a border side" |
| Wheel effect deps include `zoom` again | red: "the wheel listener is registered with { passive: false }" |
| Context snap not gated on `view.fitted` | red: 4 `GbcWorldCanvasContext` tests (snap once, 1x/2x/4x, zoom clamp, exit requests) |
| Jump stamp waits for a measured viewport | red: 3 `GbcApp` jump tests |
| Jump fit applied before the viewport is measured | red: 4 `WorldSurface.test.tsx` jump tests |
| P12-4q reveal insertion removed | red: both P12-4q (INDOOR, GATE) tests |

**Old source** (new test file run against `d4a95fe`'s `GbcWorldCanvas.tsx`): 8 failed and 2 passed. Failed: P12-3 Ctrl and Meta toggle, marquee, group move; P12-4a capture and capture loss; P12-4q INDOOR and GATE. These are the feature tests, and each fails for the missing feature. Passed: the two preservation tests (P12-4i radius 8, border neighbours), which old GBC already satisfied. The cacheKey test was added after this run. Old GBC dropped the cache on a time switch too, so it passes there as a preservation test.

Style: every touched file uses CRLF with no BOM. New and changed lines are 140 chars or fewer. The 166-char `useStageZoom` signature line was already there.

## Gate 1 (before the fix round)

Gate: 3,788 pass / 0 fail / 232 files. Typecheck and UI build pass. GBA subject HEAD `26a2e3d1e` with the same 9 porcelain lines. PerfPlus clean, no `.pokemap`.

## Reviews (Codex `gpt-6-astra`; the first launch hit the usage limit, the relaunch at 7:20 PM ran)

- Spec (`task-7-spec-review.md`): Needs rework. 1 Important, 2 Minor.
- Quality (`task-7-quality-review.md`): Approved with fixes. 1 Important (the same one), 1 Minor.

## Fix round (conductor inline; each change is small)

1. **Important, both reviews: the pending jump fit used a captured placement.** `pendingJumpFit` now holds the map name. When the viewport is measured, the surface re-resolves the current placement and re-checks scope. A map that is out of scope or has no size drops the fit, and the filter fit stands. New test: "a pending jump fit is dropped when a filter excludes the map before the viewport is measured" (31% vs. the stale 75%, derived in its comment).
2. **Spec Minor: Shift-click.** Old GBC's `onClick` had no modifier guard, so a stationary Shift-click selected the map, or cleared the selection on empty space. GBA ignores Shift-clicks. This is an unnamed difference, so it is kept per family as the adapter fact `shiftClickSelects` (GBC `true`). New test: "a stationary Shift-click selects a map and clears on empty space".
3. **Spec Minor: evidence count.** Fixed above.
4. **Quality Minor: the F-shortcut test started already fitted.** The test now wheels in to 38% first, then expects F to restore 31%. This is still the P12-4m rebase of the same test, and no other assertion changed.

Mutations, all red: the pending fit ignores scope; `shiftClickSelects` dropped; the F shortcut unbound (`useFitShortcut(fit, false)`).

## measure.py progress note (Task 9 owns the final measurement)

Run from `packages/ui/src` with `--all`:
- `components/WorldCanvas.tsx` (GBA, still the old canvas) vs `gbc/GbcWorldCanvas.tsx` (GBC wrapper): 1094 / 30 code lines, 4 aligned, 1 run (the props-interface `map: string;` lines).
- GBA vs GBC wrapper + adapter (`GbcWorldCanvas.tsx` then `gbc/worldSurface.tsx`, concatenated): 1094 / 250, 8 aligned, 2 runs (the props interface, and one closing `</span>` block in the status items).
- Baseline before 12b: 1113 / 799, 189 aligned, 42 runs. GBA's 1094 (was 1113) reflects Tasks 1-2 rewiring `WorldCanvas.tsx`. Task 7 does not touch GBA.

## Re-review and final gate

- Re-review (Codex `gpt-6-astra`, `task-7-rereview.md`): **PASS**, no remaining findings.
- Gate after the fix round: **3,790 pass / 0 fail / 232 files** (baseline 3,777 / 231: +13 tests in the new file `GbcWorldCanvasSurface.test.tsx`). Typecheck and UI build pass. GBA subject HEAD `26a2e3d1e`, same 9 porcelain lines. PerfPlus `81ededbe3`, clean, no `.pokemap`.
- `git diff --stat -- packages/ui/test`: `GbcWorldCanvas.test.tsx` only, holding the three P12-4m rebases. The new test file is additional.
