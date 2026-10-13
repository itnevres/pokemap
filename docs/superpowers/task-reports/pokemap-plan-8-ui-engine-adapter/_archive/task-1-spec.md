# Plan 8 Task 1: executed spec (shared stroke chain)

Plan: `docs/superpowers/plans/2026-10-12-pokemap-plan-8-ui-engine-adapter.md`, section "Task 1". The plan's interface block is binding; this file adds anchors and coordinator rulings. Base: branch `plan-8-ui-engine-adapter` (record BASE in the report).

## Anchors (at master `3f9f8ce`)

- GBC B1 (source of truth, move it, do not reinvent): `packages/ui/src/gbc/GbcMapCanvas.tsx`
  - `:300-319`: `pendingPaintRef`, `strokeOpenRef`, `canvasVisitRef`, `strokeRef`, the `useLayoutEffect([mapName])` retirement, `ownsStroke`.
  - `:617` `fail` → `onEditError`.
  - `:646-666` mousedown chain (begin, `begun=true`, first `paintAt`).
  - `:676-688` held-pencil move queue (with `lastCellRef` dedupe — the dedupe STAYS in the canvas, not in the chain).
  - `:705-725` `endActiveStroke` (rect/shift last apply, then end; a retired-but-begun stroke still ends).
- GBA (to replace): `packages/ui/src/components/MapCanvas.tsx`
  - `:263` `pendingPaintRef`, `:269` `strokeOpenRef`, `:240` `dragStartRef`.
  - `:678-710` `paintAt` (pencil, bucket, collision) assigns `pendingPaintRef`.
  - `:744-758` mousedown `beginStroke().then(...)`.
  - `:790-794` pencil/collision drag (`dragStartRef.current === null && e.buttons === 1`).
  - `:827-857` `endActiveStroke`.
- GBC B1 witnesses to mirror for GBA: `packages/ui/test/gbc/GbcMapCanvasEdit.test.tsx:286-480` (`held()`, describe "stroke completion barrier (B1)").

## Coordinator rulings (binding for the implementer)

R1. **GBA `onError`.** `MapCanvas` has no `onEditError` prop today and shows no paint errors. Pass a no-op `onError` from `MapCanvas` (`() => {}`). Do NOT add a prop or visible error UI: that would be an unnamed behaviour change. The chain still swallows every rejection (no unhandled rejections).

R2. **`queue()` with no open stroke is a no-op.** GBA today paints on a held-button mousemove even when no stroke is open (mousedown off-canvas, dragged in), sending an apply with no begin. Under the chain, the GBA move handler calls `chain.queue(body)` only while `chain.isOpen()`. Matches GBC's `strokeOpenRef` guard. Record this in the report as the one incidental GBA change.

R3. **Begin failure vs apply failure.** Copy GBC exactly: begin rejection → `begun` stays false, queued applies drop, `onError` reported once (if visit owned), `finish` still issues end (GBC `:713` only skips end when the visit is retired AND not begun). Apply rejection → reported; later queued applies still run and end still waits for them (`GbcMapCanvasEdit.test.tsx:450`).

R4. **Lost mouseup (F3/M4).** `start()` while `isOpen()` first performs the equivalent of `finish(null)` for the open stroke (no last apply; end issued, chained), then the new begin. Both families.

R5. **GBA rect/shift start cell** moves from "set in begin's `.then`" to "captured at mousedown" (GBC's shape). `finish(last)` is called by the canvas with the rect/shift body computed from the captured start and the mouseup cell, or `null` for mouseleave/other tools. The chain applies `last` only when the visit is still owned and begun.

R6. **Visit retirement** is driven by `visitKey` (map name) in a `useLayoutEffect` inside the hook, including unmount, exactly as GBC `:307-318`. Retired visit: queued work drops, a begun stroke still ends on its captured session, errors are not reported.

R7. **Terminal catch (M3).** Every assignment to the internal chain ends `.catch(() => {})` after the guarded `onError` call, so a throwing `onError` cannot reject the chain. Test: `onError` that throws, then a later stroke still issues begin/apply/end.

R8. **No dedupe in the chain.** GBC's same-cell dedupe stays in `GbcMapCanvas`; GBA keeps its current no-dedupe behaviour.

R9. **`settled()`** returns a promise for the chain tail as of the call (resolves, never rejects).

## Tests

- `packages/ui/test/shared/useStrokeChain.test.tsx`: the plan's Step 1 case list, driving the hook via `renderHook` with a fake `StrokeSession` whose methods return `held()` promises. Use `await act(async () => {})` before every negative assertion. Record the call order in one array (`"begin"`, `"apply:<n>"`, `"end"`) and assert exact arrays.
- `packages/ui/test/MapCanvasStroke.test.tsx` (new): mirror GBC B1 witnesses at `GbcMapCanvasEdit.test.tsx:286-480` for GBA, using the existing GBA `MapCanvas` test harness patterns from `packages/ui/test/MapCanvas.test.tsx` (reuse its fixture builders by copying the minimum; do not edit that file). Must FAIL on the pre-change GBA code (record the failing run in the report) and pass after. Include a lost-mouseup case (mousedown, mousedown without mouseup → `begin, …, end, begin`) in both GBA and the shared suite. GBC lost-mouseup gets a new case in a NEW file `packages/ui/test/gbc/GbcMapCanvasStroke.test.tsx` (existing GBC test files stay unchanged).
- M3 (throwing onError) case: in the shared suite (and GBC new file, via `onEditError` that throws).

## Test oracle

`git diff <BASE> -- ':(glob)packages/*/test/**' | grep -E '^-[^-]'` must print nothing (no existing test line removed or changed).

## Out of scope for the implementer

Steps 7 (mutation teeth-proof) and 8's live check are run by the coordinator. The implementer runs Steps 1-6 and the gate, then commits.
