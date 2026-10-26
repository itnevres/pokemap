# Task 1 spec-compliance review (High), Plan 12b

Reviewer: Claude Opus subagent (`high-risk-reviewer` role), 2026-10-26. Scope: uncommitted working tree vs HEAD `f1eec90` (`git diff HEAD`, including the staged rename and delete). vitest not run, per the brief. `npm run typecheck` from the repo root: **pass** (both tsc projects, no output).

## Verdict: Approved with fixes

The code matches Task 1. Every file item is done or justified. The wheel fix, the M4 removal and the moves are correct. The test changes stay inside the authorized list, and no assertion was loosened. Two report-side gaps need fixing before commit. The report says "no comment was lost", but three rationale comments from the deleted `useCanvasView.ts` were dropped (Important). The `mapView` consumer inventory is incomplete (Minor). The gate section is still empty.

## File items, checked against the code

| Item | Status | Evidence |
|---|---|---|
| Delete `shared/useCanvasView.ts` after inventory | Done | `rg useCanvasView` in src/test now finds nothing. The only consumer before was `useStage.test.tsx:5`, `:310-318`. |
| `useStage.test.tsx` `:5`, `:310-315` onto `canvas/useStage.ts` exports | Done | Line 4 now imports `useStageFit, useStageView, useStageZoom` (the old `:4` and `:5` imports were merged). The legacy test calls `useStageView`, `useStageZoom(..., { kind: "stepped", levels: [1,2,4] })`, `useStageFit` and `useStageAutoFit`. The changed lines run to `:318` (the `useCanvasFit` and `useCanvasAutoFit` calls at old `:316` and `:318`). They are the same rename, covered by "the call adapts". All assertions are byte-identical. |
| `:161/:191/:211/:239` `captured` -> `hasCapture()` | Done | Same booleans (true, false, false, false). |
| Continuous wheel from the updater's view (PR12b-I3) | Done | `useStage.ts:50-53`: `zoomBy((view) => view.zoom * f, px, py)`. The factor is chosen per event outside the updater, and the multiplication runs inside it. The clamp goes through `zoomAboutPivot`'s continuous branch (`view.ts:48`). |
| Stepped unchanged | Done | `useStage.ts:54-58` still indexes `policy.levels` from the render-captured `zoom`. `applyZoom` = `zoomBy(() => next)` builds the same updater as before (`zoomAboutPivot(view, next, ...)`, identity kept on no-op). |
| Controlled path unchanged | Done | `useStageView` (`useStage.ts:16-30`) is untouched. Two batched wheel events on a controlled stage both read `latest.current.view`, so they still collapse, as in 12a. The plan allows this (both world views are uncontrolled), and the report says so. |
| `EncounterBorder` move, no re-export | Done | Pure rename (similarity 100%). `src/components/EncounterBorder.tsx` is gone. Importers updated: `MapSurface.tsx:3`, `mapSurfaceAdapter.ts:2`, `WorldCanvas.tsx:6`, `GbcWorldCanvas.tsx:8`. Test updates: `EncounterBorder.test.tsx:11`, `MapSurface.test.tsx:24` (`vi.mock` path, import-path-only). `rg components/EncounterBorder` finds nothing. |
| `ZOOM_LEVELS`/`Zoom`/`MapView` into `canvas/view.ts`, `mapView.ts` re-exports | Done | `view.ts:15-21` has the doc comments. `mapView.ts:1-3` imports them for its `zoomAboutPivot` wrapper and re-exports them. `MapSurface.tsx:2` now imports from `./view.js`. |
| `MapSurface.tsx`, `mapSurfaceAdapter.ts` imports only | Done | Import lines only. |
| M4: drop `captured` `useState`, `hasCapture()` the reader | Done | `useState` and both `setCaptured` calls are removed, and `captured` is gone from the return (`useStage.ts:195-197`). `rg "\.captured"` in src finds only the `capture` ref's own field. No src consumer. `useState` is still imported and used (`viewport`, `ownView`). |
| M3: no `onLoad` size check; comment at the guard; retained-handler test | Done (see M3 judgment) | `useRasterComposite.ts:73-74` comment. No logic change. |
| `GbcWorldCanvas.tsx:93-137` comment rewrite | Done, accurate | The new bullet matches the code: `view` holds `{ zoom, pan, fitted }` (`:177`, `:491`). The wheel runs `setView((v) => zoomWorldAboutPivot(v, factor, x, y, zoomBoundsFor(v.zoom)))` (`:946`). `zoomBoundsFor` uses `worldContext.maxWorldZoom` (`:935`). The dropped lines were history: the GbcMapCanvas first draft and the nested setPan anecdote. The StrictMode reason is kept in the new text and in `useStage.ts:12-13`. |
| Optional GBA fixtures | Not done | Optional. Acceptable. |

## Independent re-derivation

**Batched wheel (jsdom, React 18 `createRoot` via RTL, inside one `act`).** Both native `wheel` handlers run before any re-render, so the handler closure's `zoom` is 1 for both.
- New code: the two queued updaters chain, 1 -> 1.2 -> 1.44. Wheel-in then wheel-out gives 1 -> 1.2 -> 1.2/1.2 = 1 (`toBeCloseTo`).
- Mutation (step from the closure's `zoom`): both updaters return zoom 1.2, so test 1 sees 1.2. Test 2 gets 1.2 then 1/1.2 = 0.8333, and the last updater wins, so it sees 0.8333.

Both tests discriminate, which agrees with the report's mutation table. min 0.01 and max 100 never clamp. The pivot is clientX 0 - rect.left 10 = -10. That only moves pan, which is not asserted.

On the plan's wording "z * 1.2 * 1.2 (sequential, not 1.44)": with z = 1, `toBeCloseTo(1.44)` tolerates the rounding of 1.2*1.2, so it is equivalent. No finding.

**M4 render-count test.** `pointer(canvas, "pointerdown")` goes through `fireEvent` (inside `act`) to React `onPointerDown` = `beginCapture`. `captureCanvas` makes `hasPointerCapture` return true, so `held` is true. `pointerup` reaches the native listener at `useStage.ts:169-176`, which calls `releaseCapture`.
- New code: no state is set, so the render count stays at `before` at both points. `hasCapture()` reads true, then false.
- Mutation (put back `setCaptured` in `beginCapture`/`releaseCapture`): each event re-renders, so `renders` becomes `before + 1`, then `+ 2`, and the test fails.

The plan asked for "the measured count before and after". The test pins the after count at the before count, with 0 extra renders. That is the measured result, so it meets the step.

**M3 judgment (the claim that the existing test covers it): holds.** `useRasterComposite.test.tsx:176-191` does exactly what Plan Step 3 describes:
1. It captures the `/a.png` `onImgLoad` and fires it, so there is one composite.
2. It changes the URL to `/b.png`.
3. It fires the retained old handler. Then it asserts `imgLoaded` false, `drawImage` still called once and `compositeVersion` 1, so the new URL is not unlocked and nothing is composited.
4. Only the new handler's own load unlocks it (`imgLoaded` true, two draws).

This is the "retained-old-handler test" that ruling N1 (spec line 194) names as M3's closure. The guard-drop mutation (unconditional `setLoadedUrl(currentUrlRef.current)`) makes step 3 stamp `/b.png`, so the test fails. The report swapped the plan's `img.src` mutation for this one, and the swap is sound. In `renderHook` the stub image has no `src`, and the guard-drop variant models the same real-browser failure: a stale handler stamping the current URL. So no new M3 test is needed.

## Findings

### I1 (Important): three rationale comments from `useCanvasView.ts` were dropped; the report says none were lost

`packages/ui/src/canvas/useStage.ts:16-23`, `:61`, `:83-94`. Global Constraint: "Moved code keeps its rationale comments. Each task report lists removed comment lines … and where each went." The report says the deleted file's rationale "already lives in `canvas/useStage.ts`". For the auto-fit comment (now `useStage.ts:76-78`) and the controlled/uncontrolled doc (now `:12-15`) that is true. These three are absent:

1. "`onViewChange` goes through a ref so an inline callback never changes `updateView`'s identity (which would re-create `fit` and re-bind the wheel listener on every parent render)." `useStageView` still works this way (`latest` ref, `updateView` deps `[controlled]`), but its only comment (`:21`) is about committed props.
2. "confirmed in the real app; jsdom does not enforce passive semantics, so no test catches a regression." `useStage.ts:61` keeps only the first half. The jsdom warning also sits at `WorldCanvas.tsx:1438`, but Task 8 removes the GBA wheel. After that, the shared listener carries no note that tests cannot catch a `{ passive: false }` regression.
3. The fit doc: "Fit-to-screen … bound to the F shortcut (chrome on) or the world's context fit (chromeless). `bandNative` is the encounter band in native pixels on the border's `side` (0 when encounters are off or the canvas is chromeless), so the sprites fit too." `useStageFit` (`:83-103`) has no doc. The "before measurement, native size" sentence does survive, on `fitView` (`view.ts:57`).

Failure scenario: someone in a later task "simplifies" `updateView` to depend on `onViewChange`, or drops `{ passive: false }`. No test goes red: the jsdom suite cannot see passive listeners, and an identity churn re-binds the wheel listener without failing any assertion. The rationale was the only guard.

Fix: put the three comments on `useStageView` (the ref sentence next to `latest`), on the wheel listener at `:61` (add the jsdom clause), and as a short doc on `useStageFit`. Then correct the report's "Changes" bullet and list the removed comment lines with where each went. That includes the 37 `-` comment lines from `git diff HEAD -U0`, most of them the deleted file and the GBC header.

### M1 (Minor): the `mapView` inventory misses consumers

Report "Inventories". Step 1 asks for every consumer to be listed. The report leaves out:
- src: `shared/useWorldContext.ts:3` (`ZOOM_LEVELS, zoomAboutPivot, MapView, Zoom`), `shared/WorldContextOverlay.tsx:2`.
- tests: `test/gbc/GbcWorldCanvasContext.test.tsx:5`, `test/gbc/GbcWorldCanvasContextZoom.test.tsx:5`, `test/shared/useWorldContext.test.tsx:4`, `test/WorldCanvasContext.test.tsx:4`.

Spec line 146 names `useWorldContext.ts` explicitly as a known consumer. Nothing breaks now because the re-export stays. The risk is the Task 8/9 deletion: if it relies on this list, these six imports break. Fix: add them to the report.

### M2 (Minor): the gate section is empty

Report "Gate: (see below)" has no content. Global Constraints and the Evidence rule need pass/fail/file count (baseline 3,634 / 0 / 226 plus the 3 new tests, so 3,637 expected) and typecheck and UI build before the commit. Fix: fill it in from the running gate. Typecheck already passes, per this review.

### Notes (no action)
- The `useStage.test.tsx` legacy-hook edits reach old `:316` and `:318`, just past the cited `:310-315`. They are the same hook rename the plan allows ("the call adapts"), and no assertion changed.
- The wheel effect still lists `zoom` in its deps, so the continuous handler re-binds on every zoom commit. This is harmless and the same as before. Mentioned for the quality pass only.
- The report says `git diff --stat -- packages/ui/test` is 3 files, +52/-13. Confirmed: 1/1, 50/11, 1/1.
- No `family ===` branch was added in `canvas/`.
