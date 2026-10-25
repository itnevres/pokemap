# Task 4 implementer report

Status: implemented, uncommitted; coordinator runtime verification/reviews pending.
Tier: High (stroke ordering, capture termination and image lifecycle). BASE: f5cb4811eec1bbcd623544b1adeaee72fb7dee5a; initial tree clean.
Execution: direct implementer per explicit brief; delegate routing read, no sub-dispatch, commits or pushes.

## Files touched
- Created `packages/ui/src/canvas/MapSurface.tsx` (247 lines).
- Created `packages/ui/src/canvas/mapSurfaceAdapter.ts` (39 lines).
- Created `packages/ui/src/shared/MapStatusStrip.tsx` (17 lines).
- Created `packages/ui/test/canvas/MapSurface.test.tsx` (344 lines; 33 declared cases after it.each expansion; coordinator runtime results below).
- Modified `packages/ui/src/canvas/useStage.ts`: reuse useStageFit; optional override preserves continuous/custom fit behavior.
- Restored `packages/ui/src/shared/MapCanvasViewport.tsx` exactly to HEAD: no remaining diff; existing onImgError forwarding retained, source img identity persists across URLs.
- Modified `packages/ui/test/canvas/useStage.test.tsx`: unmount cleanup checks the exact current wheel handler after clearing earlier removal calls, then dispatches a wheel and checks no callback/view change.
- Created this report. Both family canvases and every caller are untouched.

## Adapter fields (family needs)
- `className`: preserves GBC's additional root class without a family branch.
- `geometry`: composite width/height/origin, paintCellPx/eventCellPx and layout width/height; GBA border-size/16px cells versus GBC fixed origin/32px paint/16px events.
- `blocks`: identity trigger for both live/static payloads without knowing their block shapes.
- `skipFirstBlocksChange`: GBA reseed suppression versus GBC first real edit (P12-8).
- `imageUrl(mapName, paintVersion)`: GBA border URL versus GBC border/time URL; zero must omit v; no-session calls get zero.
- `overlays`: ordered key/label/legend/deps/draw plus forced visibility; GBA elevation/collision-tool forcing versus GBC quadrant drawers; raster invalidation stays semantic.
- `hoverAt(sourcePoint, enabled)`: GBA metatile versus GBC step resolution; overlay visibility lets GBA suppress disabled marks while GBC retains intrinsic event data.
- `statusItems(hover, enabled)`: GBA split/behavior/mark versus GBC tileset/quadrant/border/event readouts, with existing span classes and rich content.
- `paintBody(tool, cell)`: family-specific paint request/stamp shapes, including GBA collision bodies.
- `finishBody(tool, start, end)`: family rect/shift bodies from raw end cells; surface never calls it on cancel.
- `findEventAt(eventCell)`: family event lists/ref types, raw event-grid selection and outside deselection.
- `eventPosition(selected)`: family lookup for the shared selection ring, using event-grid geometry.
- `dropperStamp(cell)`: full GBA collision/elevation stamp versus GBC id-only stamp.
- `encounters`: family summary key, side/band/unitPx and optional time plus legendHint; GBC time affects presentation only.

## Plan steps and carried items
- Step 1: adapter types and fake-adapter tests preceded MapSurface implementation; attempted red run was blocked before collection, so no observed behavioral red result.
- Step 1 coverage: dispatch priority, bounded starts/sign/dropper, raw event release and rect/shift ends, same-cell/reset, captured/fallback/cancel paths, map retirement, deferred error/settlement/registration, hover id changes, both debounce policies, resets, status/legend and disabled marks.
- Step 2: compose useStage/useRasterComposite/useStrokeChain and existing toolbar/legend/viewport/EncounterBorder; shared MapStatusStrip owns readout spans, existing LegendBar remains the one legend frame. No family equality branch or dependency added.
- Step 2 carried: forward onImgError; one fit implementation in useStageFit; exact wheel cleanup regression; mounted img current-load/error/old-URL/cached/unmount matrix with manually resolved promises and properties defined on real imgs.
- Surface readiness invokes useStageAutoFit with the same stage.fit after raster construction; useStage's internal readiness stays false. Buttons, F, context fit and auto-fit share that fit implementation.
- Time test pans an uncontrolled surface first, asserts preserved view and one fit through spies, and asserts unchanged summary-hook semantic arguments; summary fetching itself remains the existing hook's contract.
- Fix round 1: coordinator reported 84 canvas passes/1 failure; the time test now supplies non-empty summaries so the hint renders, asserts those summaries reach border entries, and retains all prior assertions; no MapSurface behavior changed.
- Fix round 2: coordinator reported 10 oracle failures across 16 existing suites from keyed img remounts; removed the key, restored viewport to HEAD, and changed stale-load coverage to invoke only the captured old-URL handler before loading the current URL on the same img; all other tests retained. UI typecheck/diff check pass; runtime and URL-guard mutation reruns remain with coordinator.
- Fix round 3 / spec preview-button finding: load the image and assert the moved event ring at (49,33,14,14); pencil/collision tests now move to a new cell with buttons=0 before checking paint counts, detecting removed preview updates and primary-button guards.
- Fix round 3 / spec debounce-reset finding: on map B check the first change at 199/200ms skips only under the configured policy, then check the next eligible change bumps at 200ms, detecting a removed policy reset.
- Fix round 3 / quality settlement finding: retain the original settlement promise, flush microtasks with apply deferred, assert pending plus no endStroke, then reject apply, await that promise and assert completion, detecting premature settlement.
- Fix round 3 / quality cached-replay finding: enable mounted cached properties before initial StrictMode mount and assert compositing/readiness; retain the URL-change scenario as a separate test. Source unchanged; UI typecheck/diff check pass, runtime/mutation verification pending coordinator.
- Step 3: mutation-target assertions written for all six requested mutations; mutations, full gate and build are coordinator work and were not run here.

## Evidence, comments and limitations
- PASS `npx.cmd tsc -p packages/ui --noEmit`; PASS final `npm.cmd run typecheck` (repository and UI, exit 0); PASS `git diff --check`.
- BLOCKED `npx.cmd vitest run packages/ui/test/canvas/MapSurface.test.tsx --maxWorkers=4 --minWorkers=1`: esbuild access denied reading ancestor/config path; failed before collection, no test counts. Initial npx.ps1 invocation also hit PowerShell execution policy; .cmd avoids that part only.
- Full gate: NOT RUN (0 files collected in focused attempt); UI build, mutations and real-app live checks NOT RUN, per implementer sandbox/coordinator split. No runtime pass claim.
- Required `git diff --stat -- packages/ui/test`: tracked useStage.test.tsx = 14 lines changed (+12/-2); new untracked MapSurface.test.tsx additionally has 344 lines. Existing fixture/test files otherwise untouched.
- Removed comment-line check (`git diff -U0` filtered for removed // lines): none. Original canvases retain all comments; new surface carries debounce/cache-key, map-scoped encounters, same-cell, raw-vs-bounded, local-preview, deselect/pan and capture-cancel rationales beside the corresponding code.
- New source/test files checked ASCII/no BOM. Paint version deliberately remains monotonic across map visits, preserving both existing canvases' cache-key rationale; map changes clear its pending timer and reset per-map interaction state.
- Open questions: none. Integration onto the real GBC/GBA wrappers, their adapter-specific comment moves and live verification remain Tasks 5-6.
