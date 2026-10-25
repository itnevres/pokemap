# Task 9 final whole-branch review (Plan 12a, High, review only)

Reviewer: Claude Opus subagent (read only; no vitest or build run; gate taken from the brief: 3,633 / 0 / 226, typecheck and UI build pass).
Range: `d3bf280..HEAD -- packages` (28 files). Read in full: `canvas/*`, both wrappers and adapters, `shared/MapStatusStrip.tsx`, `shared/useStrokeChain.ts`, the `useCanvasView`/`mapView`/`MapCanvasViewport`/`MapEditingWorkspace` diffs, both changed existing tests, and the base `MapCanvas.tsx` / `GbcMapCanvas.tsx` at `d3bf280` (code lines side by side with the new paths).

## Verdict: Changes requested

One Important finding (the P12-4a release outside the canvas for rect, shift and event drag is not shown to work in a real browser, and the jsdom test models an event order Chromium likely does not produce). The rest are Minor.

## What holds (checked against code)

- Behaviour (focus 1): every difference from base is ruled or ledgered. Pointer flow order, raw vs bounded call sites, dropper, sign, event select/drag, toggles/forced collision, legend DOM, status DOM, encounter border inputs, and the map-switch resets all match base. GBC's `data` is memoised and GBA's `blocks`/`map`/`layout` are state identities, so the adapter being rebuilt every render does not churn any effect: `adapter.blocks` (debounce), the raster layer deps (compared by value through `useStableValues`), `decorateDeps` (values), `encounter.side` (a string; the `entries` memo holds). `useStrokeChain` returns a `useMemo([])` chain and reads `onError` through a ref, so the `onStrokeChain` registration effect runs only on mount/unmount and StrictMode re-runs are idempotent (Set add/delete).
- Ordering (focus 2): the composite waits for `loadedUrl === imageUrl`; cached-complete and error rules match GBC base. The chain keeps begin/apply/end order; map switch retires through `useStrokeChain`'s layout cleanup, which runs before the passive unregister, so a shell discard still awaits the retired end. Same-cell memory resets on stroke end (`finishStroke`) and map switch (layout reset).
- Cell math (focus 3): GBA 16/16; GBC 32 paint, 16 event; sign bounded on the event grid with `width * paint / event` (= GBC's `2 * width`); rect/shift end raw (`rawPaintAt`); event release raw.
- No family branch in `canvas/` (focus 4): agree with Task 7's sweep.
- Tests (focus 5): only `MapCanvas.test.tsx` (P12-4h, values "0" → null, delayed assertion kept) and `MapEditingWorkspace.test.tsx` (P12-4f, strengthened) changed; both cite their ruling. Count 3,533 → 3,633.

## Findings

### I1 (Important): a rect, shift or event drag released outside the canvas likely applies nothing in Chromium

- Where: `packages/ui/src/canvas/MapSurface.tsx:243-248` (`onMouseLeave`), with `packages/ui/src/canvas/useStage.ts:164-172` (native `pointerup` releases capture) and `:190`/`hasCapture`. Test: `packages/ui/test/canvas/MapSurface.test.tsx:172-177`.
- Failure scenario: Rect tool, press inside, drag out of the canvas, release outside. While capture is held, the browser fires no boundary events. On `pointerup` capture is released (explicitly by the stage listener, and implicitly by the browser anyway). Chromium then sends the boundary events right away (`mouseleave` on the canvas) and only after that dispatches the compatibility `mouseup` (to the old capture target). By the time `mouseleave` runs, `hasCapture()` is false, so `abandon()` calls `finishStroke(null)`: no rectangle is applied and the stroke just ends. The `mouseup` that follows finds the chain closed. An event drag released outside is dropped the same way, with no `onMoveEvent`. That breaks P12-4a ("ends on pointer up, wherever it happens") for exactly the tools whose end cell matters.
- Why nothing caught it: the jsdom test fires `mouseleave` while capture is held (a real browser does not), then `pointerup`, then `mouseup`. It never models the leave that comes between `pointerup` and `mouseup`. The Task 8 live check released outside only with the pencil, and pencil gives the same result whether `mouseup` or `mouseleave` ends it (`finish(null)` and `finish(raw)` are identical for pencil), so it cannot tell the two orders apart.
- Confidence: the code path is certain. The Chromium event order comes from the Blink comment in `PointerEventManager::SendMousePointerEvent` that says boundary events are sent "rightaway" when a pointerup releases capture. It needs one live check to confirm.
- Fix: in `onMouseLeave`, treat a leave with `event.buttons === 0` while a stroke or event drag is open as the release, running the `onMouseUp` body with the leave event's coordinates (the following `mouseup` is then a no-op). Keep `abandon()` for a leave with the button still down and no capture (the ruled fallback). Add a jsdom test with the real order: capture, mousedown, pointerup, `mouseleave` with `buttons: 0` at an outside point, then mouseup. Assert that one rect apply is made with the raw outside end cell and that one `onMoveEvent` fires. Add a live row: rect and event drag released outside, in both families.

### M1 (Minor): dangling comment references to deleted map-canvas code, outside the diff

- Where: `packages/ui/src/gbc/GbcWorldCanvas.tsx:43` (cites "`GbcMapCanvas.tsx`'s own header comment", which was deleted); `packages/ui/src/hooks/useMapEditing.ts:44-45` (refers to `MapCanvas.tsx` `.catch` "throughout" and its `endActiveStroke`, both gone), `:18`, `:90` (the "`map` local" now lives in `gba/mapSurface.tsx:50`), `:269`; `packages/ui/src/hooks/useEditSession.ts:108`, `:188`, `:199` ("MapCanvas.tsx's own `blocks` local / doc comment", now `gba/mapSurface.tsx:46-49`); `packages/ui/src/components/CollisionPalette.tsx:20` ("MapCanvas.tsx's own overlay-toggle buttons", now `MapSurface` + `OverlayToggleGroup`).
- Failure scenario: a reader follows the pointer and finds nothing. Focus 6 asks for no dangling references, and Task 6 repointed only the in-diff ones.
- Fix: repoint each one to `gba/mapSurface.tsx` / `canvas/MapSurface.tsx` / `shared/useStrokeChain.ts` (comment-only).

### M2 (Minor): an unledgered nuance in the GBA paint-version skip

- Where: `packages/ui/src/canvas/MapSurface.tsx:87-103`.
- Difference: in base GBA, the `mapName` effect re-armed the skip and a separate `[blocks]` effect consumed it, so a `blocks` change in the same render as the switch used up the skip, and the next (reseed) change bumped. Now the switch render returns early without consuming, so the next change is absorbed. This matches base's stated intent ("absorbs whichever tick reaches first") and the P12-8 oracle. It is reachable only when `blocks` identity changes in the same render as `mapName`, and the cost is at most one image reload more or less. No test covers it.
- Fix: no code change. Record it in the spec's P12-8 review record next to the Task 6 note (no bump without a session), which Task 9 Step 3 must also record.

### M3 (Minor): the P12-4g stale-load guard defends only a retained handler

- Where: `packages/ui/src/canvas/useRasterComposite.ts:72-75`; tests `MapSurface.test.tsx:330`, `GbaMapSurface.test.tsx:191`.
- Detail: React always dispatches a DOM `load` to the current `onLoad` prop, so in a real DOM `imageUrl === currentUrlRef.current` is always true. Protection against an old request's load relies on the browser not firing it after `src` changes. The tests pass by calling a captured old handler. This is the same as GBC base (the ruled target), so it is not a regression.
- Optional hardening: in `onImgLoad`, also require `imgRef.current?.complete && naturalWidth > 0`. A load that is truly stale arrives while the current request is still pending (`complete` false).

### M4 (Minor): `useStage`'s `captured` state re-renders the surface twice per click with no production reader

- Where: `packages/ui/src/canvas/useStage.ts:132`, `:139`, `:155`. `MapSurface` reads only `hasCapture()` (a ref).
- Effect: every primary pointerdown and its release calls `setCaptured`. The result is two extra `MapSurface` renders per click, and each rebuilds the adapter. That is harmless and cheap today. It is only read by `useStage.test.tsx`.
- Fix (optional, or 12b): drop the state and expose `hasCapture()` only, or keep it if WorldSurface will render from it.

### Task 7 items (ruled, no change for 12a)

- `shared/useCanvasView.ts` has no production consumer. The spec (WorldSurface section) keeps the re-exports until 12b, so keep them. The first 12b task should delete the file and repoint `test/canvas/useStage.test.tsx:5`.
- `canvas/MapSurface.tsx:2-3` imports `ZOOM_LEVELS`/`MapView` and `EncounterBorder` from `components/`. This is a layering smell, not a family branch. Both are shared by both families today. Move them under `canvas/` or `shared/` in 12b when WorldSurface also needs them.

## Required before merge

I1 (fix, test with the real event order, live row). M1 and M2 are docs/comment-only and can ride along. M3 and M4 are optional.
