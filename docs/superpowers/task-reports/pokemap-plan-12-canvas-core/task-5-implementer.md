# Task 5 implementer report

Status: implemented, uncommitted; fix round 1 ready for coordinator verification.
Tier: High (family canvas replacement and async stroke ownership). BASE: bd4ba9f71753e1c51af94e4c659daa9ec6e1f676; original tree clean.
Execution: direct scratch implementation per explicit no-sub-dispatch brief; delegate routing read. No commits, pushes, dependencies or subject writes.

## Files touched (final)
- `packages/ui/src/gbc/GbcMapCanvas.tsx`: unchanged props/types, thin MapSurface delegation, original-path helper re-exports.
- `packages/ui/src/gbc/mapSurface.tsx`: adapter hook, geometry, live payload merge, raster drawers/colours/deps, rich legends/status, edit/dropper/event bodies and lookups.
- `packages/ui/src/canvas/MapSurface.tsx`: consolidated lifecycle/interaction rationale; sole executable change is restoring map-identity-only encounter enablement.
- `packages/ui/src/canvas/useRasterComposite.ts`: comment-only rationale consolidation (URL readiness, pristine composite, separate blit and viewport clearing).
- `packages/ui/src/canvas/useStage.ts`: comment-only rationale consolidation (pure combined view, non-passive wheel, fit-by-map).
- `packages/ui/test/gbc/GbcMapSurface.test.tsx`: two real-wrapper integration tests; deferred apply and end now independently controlled.
- `packages/ui/test/canvas/MapSurface.test.tsx`: existing chromeless case renamed with assertions preserved; added enabled-encounter/chromeless-transition regression.
- This report: `docs/superpowers/task-reports/pokemap-plan-12-canvas-core/task-5-implementer.md`.

## Plan steps
- Step 1: GBC adapter retains 32px paint blocks, 16px event/sign/hover steps, ring-derived origin/dimensions, grid/collision/events order and colours, full quadrant/border/event hover readout, exact displayed status/legend text and classes, time presentation, paint/finish/dropper bodies and live events.
- URL retains border/time and positive-only v; MapSurface supplies zero without a session. skipFirstBlocksChange=false retains the first real same-map change (P12-8).
- Public exports remain importable from GbcMapCanvas: GBC_COMPOSITE_ORIGIN/clientToStep/formatQuadrant/parseColorToken, zoomAboutPivot, GbcView/GbcActiveTool/GbcEventRef/props.
- Step 2: all existing GBC oracle tests remain unchanged. Coordinator reported 12 GBC files / 233 tests pass unchanged and both mutations RED before this fix round; not independently rerun here.
- Step 3(a): real-wrapper uncontrolled pan/time-image-load test checks complete stage view retained and wrapped fit count stays one. Step 3(b): real-wrapper registry test checks deferred apply and end settlement with bounded microtask flushing and finally cleanup, no mutating waitFor probes.
- Step 4: measurement from packages/ui/src compared components/MapCanvas.tsx against temporary concatenation gbc/GbcMapCanvas.tsx then gbc/mapSurface.tsx, with // FILE headers: 427 / 188 code lines, 4 aligned, one run (clientToStep math, GBA:559-562). Fix-round comment changes do not alter measured code; temp file removed.

## Fix round 1 (one line per finding)
- Finding 1 (spec Important / quality Minor): dissolved wrapper historical block; unique rationale is beside its shared implementation or GBC adapter field, merged with existing comments; obsolete duplication prose, exact duplicates and orphaned eslint directives removed. GbcView now references useStageView; leave comments explicitly describe P12-4a no-capture fallback.
- Finding 2 (adapter comments): geometry describes engine units/border rings, raster deps describe captured inputs/value comparison, clientToStep is documented as compatibility-only, and stale anyOverlay/absent-conversion/ineffective-suppression/below wording is gone.
- Finding 3 (unruled behavior): removed !chromeless from encountersOn; chromeless hides chrome without disabling an enabled border/subscription. Existing Task-4 chromeless test keeps every assertion and is renamed to describe initially-off encounters; new no-remount transition test asserts enabled border and summary subscription plus hidden chrome. This restores prior family behavior; no new ruling required.
- Finding 4 (quality settlement coverage): separately deferred endStroke; after resolving apply, flush 30 microtasks and assert end called once while settlement stays pending, then resolve end and await completion. finally resolves both promises even if an assertion fails.

## Final removed-comment inventory
- Final `git diff -U0` filtered by `^-\s*//`: GbcMapCanvas.tsx 55 removed // lines, MapSurface.tsx 2, useRasterComposite.ts 2; no other tracked file removes // lines. Original GBC source line references below are BASE-relative; shared old comments are consolidated in place.
- BASE GBC 294-295 -> adapter live-payload merge; 360-361 -> adapter encounters.side; 366-367 -> adapter imageUrl; 371-372 -> MapSurface debounce/version plus adapter URL policy; 465-470 -> adapter raster-dependency contract.
- BASE GBC 308-309,316-317,319 -> MapSurface chain/registration/start/finish/eventDrag; 328-330 -> encountersFor; 384 -> debounce trigger; 391,399-403 -> reset/hover notification; 486-487 -> decoration; 502-503 -> entries; 572-573 -> event selection; 583,656 -> dropper/no-chain finish; 606 -> same-cell/queue logic; 647 -> release locals; 668 -> abandon/no-capture leave.
- BASE GBC 333-334,418-420 -> useStageView/useStageAutoFit; 407-409 -> useRasterComposite cached readiness; 427,474-475 -> pristine recomposition/separate blit/viewport-clearing postmortem.
- BASE GBC 385,404,471 orphaned eslint directives dropped; 415 obsolete chromeless-cannot-show-encounters claim removed in favor of explicit preserved transition behavior. Duplicate explanations collapsed into destination comments rather than retained as an archive.
- Long header rationale: geometry/no-elevation -> adapter.geometry; GBC reseed distinction -> skipFirstBlocksChange; overlay-independent step readout -> hoverAt; fast-click/undo-step/end ordering -> MapSurface chain/finish; StrictMode nested-setter postmortem/non-passive wheel/fit-by-map -> useStage; URL readiness/destructive overlay/viewport Task-21 postmortem -> useRasterComposite. Obsolete deliberate-duplication narrative replaced by wrapper's short delegation note; props/type docs retained with corrected GbcView cross-reference.

## Verification and limitations
- PASS fix-round `npm.cmd run typecheck` (repository + UI including tests, exit 0); PASS `git diff --check`.
- Source diff confirms useStage/useRasterComposite are comment-only and MapSurface executable change is only encounter-gate removal; TypeScript print comparison confirms this after comment removal and line-ending normalisation.
- BLOCKED fix-round `npx.cmd vitest run packages/ui/test/canvas/MapSurface.test.tsx packages/ui/test/gbc/GbcMapSurface.test.tsx --maxWorkers=4 --minWorkers=1`: esbuild cannot read ancestor directory (Access is denied) / resolve vitest.config.ts; startup exit 1, zero files/tests collected, no running session remains.
- Full gate/build/live checks and runtime/mutation reruns remain coordinator work; no local pass/fail/file-count result or observed mutation result. Earlier coordinator evidence above predates these fixes.
- `git diff --stat -- packages/ui/test`: tracked MapSurface.test.tsx +15/-1 (new transition test + existing title change); untracked GbcMapSurface.test.tsx contains two cases. Existing GBC tests/fixtures untouched.
- New/moved GBC source/test ASCII/no BOM. No adapter-contract/caller/launch changes. Open questions: none.
