# Task 9 re-review (Plan 12a)

Reviewer: Claude subagent, read only (no vitest or build run; a gate run was in progress). Inputs: `task-9-final-review.md`, `task-9-report.md`, `task-8-shots/outside.mjs`, `gba-outside.json`, `gbc-outside.json`, `git diff` of the working tree.

## Verdict: Approved

## 1. I1 ruling: refuted, accepted

- Measured order, both families, both gestures: `pointerdown/b1 mousedown/b1 pointerup/b0 mouseup/b0 lostpointercapture/b0 mouseleave/b0`. `mouseup` reaches the canvas before `mouseleave`, so `onMouseUp` (`canvas/MapSurface.tsx:228-242`) runs the release before `onMouseLeave` (`:243-248`) can call `abandon()`. The reviewer's predicted `pointerup → mouseleave → mouseup` does not occur. Outcomes: rect 1 apply + 1 end (GBA `(35,15)-(35,9)`, GBC `(15,4)-(15,1)`); event drag 1 `/event/move` in each family; no page errors; changes discarded, no save (guarded).
- Probe soundness: listeners go on `canvas.map-canvas__stage`, which is the stage canvas rendered by `shared/MapCanvasViewport.tsx:30` (the element that carries the MapSurface handlers), with `capture: true`. Capture-phase on the target itself fires in the at-target phase, so all six events on that element are recorded in dispatch order. The release is a real Playwright `mouse.up()` 30 px above the canvas's bounding box, after an 8-step move out, so it is a true outside release with capture held. Sound.
- Test: `packages/ui/test/canvas/MapSurface.test.tsx:179-193` fires the measured order (capture, mousedown, move out, `pointerup`, `mouseup` outside, `lostpointercapture`, `mouseleave`) and asserts rect: exactly one `endStroke` and one `applyPaint` with the raw outside end `{x:4,y:-2}`; event: exactly one `onMoveEvent` at `x:8` (release at x=150 beyond `pixelWidth` 128). The trailing leave is included, so a double-finish or an abandon-after-release would also fail it. The reported mutation (early return in `onMouseUp` without capture) going RED is the right shape. Pins both outcomes.
- Observation (no action): the live data shows the rect applied, but cannot by itself tell a raw end from a clamped one, since the stage is a viewport and y=-30 above it still maps inside the map at these offsets (clamped top row would be the same or one row off). Raw-end behaviour is pinned by the jsdom test and the existing `captured %s keeps a raw outside end` test, so this is covered. Shift was not run live; it shares rect's `finishBody`/`rawPaintAt` path and is covered by the jsdom `it.each`.

## 2. M1: fixed, comment only

`git diff -- packages/ui/src` touches only comments in `components/CollisionPalette.tsx`, `gbc/GbcWorldCanvas.tsx`, `hooks/useEditSession.ts`, `hooks/useMapEditing.ts`. `rg "MapCanvas\.tsx's own|GbcMapCanvas\.tsx's own|endActiveStroke"` leaves one hit, `hooks/useMapEditing.ts:269` ("MapCanvas.tsx's own MapCanvasProps doc comment"), which is correct: `MapCanvasProps` still lives in `components/MapCanvas.tsx:23`.

- Nit (optional, not blocking): `gbc/GbcWorldCanvas.tsx:93-106,137` still describe `GbcMapCanvas`'s own stepped zoom / `useGbcMap` as if they live in that file; the stepped zoom now lives in the shared `canvas/` stage. These are historical-rationale comments outside I1/M1's listed lines and do not point at a deleted symbol name, so they can ride 12b.

## 3. M2-M4 dispositions: acceptable

- M2: recorded in the spec under P12-8 ("Plan 12a implementation notes"), alongside the Task 6 no-bump-without-session note, as the review asked. No code change is correct.
- M3: deferring is fine; behaviour equals the ruled GBC base, and the hardening is listed as a 12b candidate in the roadmap/plan STATUS.
- M4: deferring to 12b is fine; harmless today and the decision depends on WorldSurface.

No findings requiring changes.
