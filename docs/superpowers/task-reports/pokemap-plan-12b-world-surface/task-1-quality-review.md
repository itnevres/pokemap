# Plan 12b Task 1: code-quality review (High: canvas-core wheel and capture)

Reviewer: Opus, 2026-10-26. Scope: the uncommitted working tree against HEAD `f1eec90` (13 files, +90/-105, including the staged rename `components/EncounterBorder.tsx` to `shared/EncounterBorder.tsx` and the deletion of `shared/useCanvasView.ts`). I read the diff and the changed files myself. I did not run vitest, as the brief asked. `npm run typecheck` exits 0.

## Verdict: Approved with fixes

No Critical or Important findings. The behaviour changes are correct and the tests guard them. There are four Minor fixes: one gap in a test, two comments and one stale test title.

## 1. `zoomBy` continuous wheel path (`packages/ui/src/canvas/useStage.ts:33-65`)

- **StrictMode.** In uncontrolled mode the updater handed to `setOwnView` is `view => zoomAboutPivot(view, view.zoom * f, px, py, policy)`. `f`, `px` and `py` are constants bound per event, and `zoomAboutPivot` is pure. A double invocation therefore computes the same value twice and React commits one of them. In controlled mode the updater runs once, outside React (`useStage.ts:26`), so StrictMode cannot double it. Safe.
- **Clamp and identity.** `view.ts:48-49` clamps first and then compares against `view.zoom`. At the max, `min(max, max*f) === max` returns the same `view`. `zoomBy` then returns `view` (`useStage.ts:35`), so `setOwnView` bails out and the controlled path skips `onViewChange` (`:27`). The same holds at the min. Batched events near a bound now clamp in sequence; for example, 90 then 108 clamps to 100, and a second event is then a no-op. That is correct. A batched in-then-out leaves the zoom at `1.2 * (1/1.2)`, which differs from 1 by about one ulp, so the result is a new object rather than the original. This is harmless, and the test uses `toBeCloseTo`.
- **Controlled mode, derived step by step.** The committed view is V (zoom z). Two continuous wheel events arrive before the parent commits:
  - Before this change, the handler closed over the render `zoom`, which equals `V.zoom`. Each event ran `updateView(view => zoomAboutPivot(view, z*f, ...))`. The controlled branch evaluated each against `latest.current.view === V` and reported `V@z*f` twice. The parent ended at `z*f`.
  - After this change, each event runs `updateView(view => zoomAboutPivot(view, view.zoom*f, ...))` against `latest.current.view === V`, which is still V because `latest` only updates in a layout effect after a commit. It reports `V@z*f` twice. The parent ends at `z*f`.
  - Wheel in then out: before, the reports were `z*f` then `z/f` and the parent ended at `z/f`. After, the reports are the same, because both events still read V.
  - So controlled behaviour is **identical** before and after: no compounding, and the last report wins. Each event reports exactly once, so the "never report a gesture twice" contract (Plan 6c E1) holds. This matches the conductor's claim. Today no source file uses a continuous policy (grep: `continuous` appears in source only in `useStage.ts` and `view.ts`), so no live surface is affected.
- **Effect dependencies.** The handler closes over `zoomBy` and `applyZoom` from the render whose effect ran. Their free variables are `updateView`, which is in the dependency list, and `policy`. Of `policy`, every field the handler reads is in the list: `kind`, `levels` or `min`, `max`, `factor`. A policy object that gets a new identity but keeps the same fields leaves an old closure holding equal values, which is harmless. `zoom` is still needed by the stepped branch (`:55-57`). The continuous branch no longer reads it, so a continuous stage now re-binds the listener on every zoom commit for no reason. The old code did the same, so this is not a regression. It is optional to scope the dependency as `policy.kind === "stepped" ? zoom : undefined`. I would not bother unless profiling shows a cost. Nothing is stale.
- **Typing.** `nextOf: (view: T) => T["zoom"]` accepts `view.zoom * f` (a `number`), and tsc passes. For a stepped `T` such as `MapView`, that would admit a non-level zoom, but the `policy.kind` dispatch rules that out. This is acceptable, and the old `next as T["zoom"]` cast was no stricter.

## 2. Removing `captured` state

Grep of `captured` and `hasCapture` across `packages/ui/src` and `packages/ui/test`:
- Source: the only reader is `MapSurface.tsx:247` (`if (!stage.hasCapture())`). It runs in a leave event handler, not during render. `GbcWorldCanvas.tsx` and `WorldCanvas.tsx` do not use `useStage` (`useStage(` appears only in `MapSurface.tsx:126`). No cursor class or other render-time output reads capture state. `leavePan` (`useStage.ts:194`) reads the ref.
- Tests: the four former `stage.captured` assertions now call `hasCapture()` with the same booleans. The remaining `captured` matches are unrelated words in comments and test titles.
- Nothing relied on the re-render after capture or release. The `useState` import is still used (`ownView`, `viewport`).

## 3. New tests, "Plan 12b Task 1 carry-overs" (`packages/ui/test/canvas/useStage.test.tsx:362-400`)

- **M4 render count (`:363-381`).** `pointer()` goes through `fireEvent`, which wraps the call in `act`, so any re-render triggered by a `setCaptured` would flush before the assertion. With the full mutation (both `setCaptured` calls restored), pointerdown sets the state to `true` and re-renders, so `renders` becomes `before + 1` and the first assertion fails. That is the right reason. The `pointerup` path goes through the native listener at `useStage.ts:169-176`, which is attached because `stage.canvasRef` is on the canvas. Not flaky, since there is no timing or StrictMode involved.
- **Batched compound (`:383-390`).** Dispatching both events with raw `dispatchEvent` inside one `act` is the right construction. The `wheel()` helper would commit between the two events, because `fireEvent` wraps each in its own `act`. Before the fix, both events compute `1*1.2`, the second updater sees zoom 1.2 against a target of 1.2, and the identity check leaves zoom at 1.2, which is not 1.44, so the test fails. Correct.
- **Batched in then out (`:392-399`).** With the mutation the result is 1, then 1.2, then `1/1.2 = 0.833`, so the test fails. It guards the zoom-out factor branch separately from the first test. Correct.
- My derivation of the pan fixture, which the tests do not assert: the mocked rect is (10, 20), so `clientX/Y 0` gives pivot (-10, -20). After the first event, zoom 1.2 and pan (2, 4). After the second, source (-10, -20) is preserved, giving zoom 1.44 and pan (4.4, 8.8). See finding m1.

## 4. Comments

- **`GbcWorldCanvas.tsx:91-97`.** The facts check out against the code:
  - `GbcWorldView` has `{zoom, pan, fitted}` (`:177`).
  - `zoomWorldAboutPivot` multiplies `view.zoom * factor` and clamps to `bounds` (`:199`).
  - It is called from one `setView(v => ...)` updater with `zoomBoundsFor(v.zoom)` (`:946`).
  - `zoomBoundsFor` uses `worldContext.maxWorldZoom(GBC_MAX_ZOOM)` (`:935`).
  - `main.tsx` uses StrictMode.

  One simplification: `zoomBoundsFor`'s max is `Math.max(maxWorldZoom(...), current)`, so the cap never pulls an already-higher zoom down. "Clamped to `zoomBoundsFor`" is still literally true. The last sentence also holds: the map canvases use the stepped `canvas/view.ts` `zoomAboutPivot`, directly through `useStage` in `MapSurface`, or through the `components/mapView.ts` wrapper in `GbcMapCanvas.tsx:11`. Acceptable as written.
- **`useRasterComposite.ts:73-74`.** This is correct. A `load` event in a browser fires after the image is decoded and has intrinsic size, and the tests mock `naturalWidth` as 0 before `load`. The guard on the line below compares the handler's `imageUrl` against `currentUrlRef`, which matches the first sentence.
- **`useStage.ts:51`.** See finding m2.

## 5. Readability and idiom

- `zoomBy` and `applyZoom` follow the existing arrow-closure style. Hoisting `px` and `py` removes the duplicated `event.clientX - rect.left`. The comment cites the review ID, matching the file's style (`Plan 6c E1`).
- The `mapView.ts` re-export is a transitional shim. The plan deletes it in Task 8/9, which is fine.
- The deleted `useCanvasView.ts` comments mostly survive in `useStage.ts`. One rationale was lost: "`onViewChange` goes through a ref so an inline callback never changes `updateView`'s identity". The `useStageView` ref comment (`useStage.ts:21`) explains only the committed-prop reason. See finding m4.

## Findings

**m1 (Minor). The release half of M4 is not independently guarded.** `useStage.test.tsx:378-380`. Scenario: a later edit restores only `setCaptured(false)` in `releaseCapture` and nothing sets it to `true`. That `setState(false)` on a `false` state bails out without rendering, so the test passes, and the M4 mutation as written (both halves) is the only thing that catches it. This is low risk, because a release-only setter is a no-op re-render anyway. Fix (optional): accept this as is. Separately, strengthen the compound test by asserting the derived pan, which also guards that the pivot compounds from the latest pan: after the batch, `expect(host.stage.view.pan.x).toBeCloseTo(4.4); expect(host.stage.view.pan.y).toBeCloseTo(8.8);` (the mutation gives (2, 4)).

**m2 (Minor). The wheel comment overstates its scope.** `useStage.ts:51`: "wheel events batched before a commit must compound". This holds only on the uncontrolled path. Controlled stages still read `latest.current.view` and do not compound (section 1). Scenario: a later task makes a world surface controlled, trusts this comment, and loses fast-wheel compounding without noticing. Fix: `// Read the updater's view so batched wheel events compound when uncontrolled; controlled stages read the last committed prop (useStageView). 12b PR12b-I3.`

**m3 (Minor). A test title is stale.** `useStage.test.tsx:308`: "retains the four legacy hooks and their stepped fit/wheel behavior". The legacy hooks are deleted, and the test now composes `useStageView`, `useStageZoom`, `useStageFit` and `useStageAutoFit` directly. Fix: rename it to "composes the four stage hooks with stepped fit/wheel behavior".

**m4 (Minor). A rationale was lost when `useCanvasView.ts` was deleted.** At `useStage.ts:20-22`, the reason `onViewChange` lives in `latest` (a stable `updateView` identity, so inline callbacks do not re-create `fit` or re-bind the wheel listener) was deleted with `useCanvasView.ts`. Scenario: someone "simplifies" by putting `onViewChange` in `updateView`'s dependencies, and the wheel listener then re-binds on every parent render. Fix: append to the `:21` comment: "`onViewChange` rides this ref so an inline callback never changes `updateView` identity (which would re-create fit and re-bind the wheel listener)."

**Optional, not a finding.** `useStage.ts:64`: the effect depends on `zoom` even for continuous policies. Not a regression; leave it unless re-binding shows up in profiling.

## Mutation evidence

I did not re-run any mutations myself, because vitest is barred while the gate runs. I checked the conductor's two `useStage` mutations by tracing the code paths (section 3). Both make the named tests fail for the stated reason. A release-only capture mutation would survive (m1).
