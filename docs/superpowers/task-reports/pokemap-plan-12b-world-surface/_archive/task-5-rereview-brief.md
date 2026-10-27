# Plan 12b Task 5: scoped re-review of the review fixes (High)

You are a read-only reviewer. Do NOT run vitest, npm, or any build: a full gate is running and two vitest runs at once break this machine. Do not edit any file except your report.

Repo: C:\Programming Projects\PokeMap, branch plan-12b-world-surface. Task 5 files are uncommitted:
- packages/ui/src/canvas/WorldSurface.tsx
- packages/ui/src/canvas/worldSurfaceAdapter.ts
- packages/ui/test/canvas/WorldSurface.test.tsx
- packages/ui/src/canvas/useStage.ts (diff vs HEAD; unchanged by this fix round)

Prior reviews (read them first): docs/superpowers/task-reports/pokemap-plan-12b-world-surface/task-5-quality-review.md and task-5-spec-review.md.

## What the fix round changed (verify each, and that nothing else regressed)

1. I1: third generic `W extends SurfaceWorld<P, C> = SurfaceWorld<P, C>` threaded through `WorldData.world`, `WorldStatus.world`, `drawExtraLayers`'s `world`, `useWorld`, `statusItems`, and the `WorldSurface` component/props. Confirm a GBA adapter declaring `W = SurfaceWorld<P,C> & { verticalLinks: ... }` would get typed `verticalLinks` in `drawExtraLayers` and `statusItems` with no cast, and that the default keeps the fake adapter unchanged.
2. M1: `fitRef.current = fit` now published in the same `useLayoutEffect` as `maxZoomRef`.
3. M2 / spec Minor 2: `initialFitDone` is stamped only when a fit lands (inside `fitWorld` on non-null bounds, and in the jump effect), not on the first attempt. Check: no re-fit stomps a user's view (drag frames make `world` a new object each frame: after any successful fit or jump the ref is set, so the initial-fit effect is inert); a world with nothing to fit does not loop (a failed fit changes no state); the jump-wins ordering in one commit still holds. New test "fits the clusters once a filter with nothing to fit clears".
4. M3: badge colours resolved once per draw, above the loop.
5. M4: `hiddenCount` memoised on `[world, adapter, revealed]`; `spotlightEntries` is `[]` when there are no hits.
6. M5: restored comments (badges never behind a toggle; coverage-error lens comment; `encounterVersion` cache-bust dependency).
7. M7: `useState(createPlacementLedger)` lazy ledger; `setRevealed` returns `old` when the map is already revealed; exported `EncounterEntry` type replaces the `Awaited<ReturnType<...>>` alias; projection test renamed.
8. Spec Minor 1: the retention test forces a redraw (wheel) after the version bump and asserts the old image is drawn in that redraw.

Deferred, not fixed (confirm the deferral is reasonable, do not re-raise unless wrong):
- M6 (surface-level in-context zoom cap wiring untested): covered once Task 7 routes GBC through the surface (GbcWorldCanvasContext.test.tsx:290, :314).
- Spec Minors 3-5: carry-forwards to Tasks 6-8 (GBA toasts wrapper, GBC toolbar error order and GBA `--dragging-map` hook, filtered-jump reveal per brief rule 8).

Conductor evidence (not yours to re-run): focused 40/40; typecheck clean; mutations red — (a) stamping `initialFitDone` on the first attempt fails the new filter-clear test; (b) clearing `entry.tile` on URL change in useWorldTiles fails the retention test.

## Report

Write to docs/superpowers/task-reports/pokemap-plan-12b-world-surface/task-5-rereview.md: verdict (PASS / FAIL), each item 1-8 ADDRESSED or NOT with file:line evidence, any new Critical/Important finding with a concrete failure scenario. Keep it short. Plain sentences, no crammed multi-statement lines.
