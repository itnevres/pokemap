# Task 5: warp markers open the shell popup; previews removed

Status: implementation and test repairs prepared; runtime verification pending with the conductor.
Tier: High, inherited from Task 5: shared canvas core and shell callback integration.
Route: Codex implementer repair of the existing worktree, using the supplied failing-run evidence.
No additional helper dispatch, commit, dependency, or subject-repository write.

## Source changes retained from the previous implementer

- packages/ui/src/canvas/WorldSurface.tsx: resolved markers clear warp errors and call onOpenWarpDestination(map).
  Local popup state/rendering removed; unresolved alerts and Shift+double-click behavior retained.
- packages/ui/src/canvas/worldSurfaceAdapter.ts: removed renderWarpPopup.
- packages/ui/src/gba/worldSurface.tsx: removed preview renderer and import.
- packages/ui/src/gbc/worldSurface.tsx: removed preview renderer and import.
- packages/ui/src/gba/adapter.tsx: World and Dungeon forward s.openWarpDestination.
- packages/ui/src/gbc/adapter.tsx: World and Dungeon forward s.openWarpDestination.
- packages/ui/src/components/WorldCanvas.tsx: supporting wrapper prop forwards through the existing spread.
- packages/ui/src/gbc/GbcWorldCanvas.tsx: supporting wrapper prop forwards through the existing spread.

## Deleted by the conductor, not recreated

- packages/ui/src/components/WarpDestinationModal.tsx
- packages/ui/src/gbc/GbcWarpDestinationModal.tsx
- packages/ui/test/WarpDestinationModal.test.tsx

CSS unchanged. Task 4 production code unchanged. Comments citing the old preview may remain.

## Tests added

packages/ui/test/shell/warpPopup.test.tsx, describe "$family warp marker double-click opens shell popup":
- GBA World: "double-click a warp marker in World mode opens the shell popup with destination workspace".
- GBA Dungeon: "double-click a warp marker in Dungeon mode opens the shell popup with destination workspace".
- GBC World: "double-click a warp marker in World mode opens the shell popup with destination workspace".
- GBC Dungeon: "double-click a warp marker in Dungeon mode opens the shell popup with destination workspace".

These use the existing FamilyApp setup with an optional source-marker fixture, not captured-slot opening.
The source marker is inside map bounds: GBA (1,1) tiles; GBC (2,1) half-block steps.
Each reads its rendered screen point, double-clicks the world canvas, and checks data-warp-popup and the named
DESTINATION canvas region with its map canvas and Pencil tool. Source workspace must be absent inside the popup.
Close returns selection to the source and focus to the world canvas. No jest-dom matchers.

## Existing tests replaced or adapted for the new contract

Paths below are relative to packages/ui/test. Each retains non-preview behavior assertions.
- WorldCanvas.test.tsx (GBA): "double-clicking a warp marker requests the destination popup without disturbing the canvas".
  Replaces the preview/close test; retains bounded near-miss and off-center hit coverage and unchanged zoom.
- WorldCanvasContext.test.tsx (GBA):
  "warp marker double-click requests the shell popup without Edit here; elsewhere on the map body it edits".
  Replaces preview opening/closing; retains onEditHere exclusion at marker and body edit assertions.
- gbc/GbcWorldCanvasContext.test.tsx (GBC): same renamed test as the GBA context case, destination MapA.
- gbc/GbcWorldCanvas.test.tsx (GBC):
  "requests a destination popup without loading a preview or changing the world view".
  Replaces "opens a destination preview before body open and Escape keeps the world view".
- gbc/GbcWorldCanvas.test.tsx (GBC):
  "real click, click, dblclick on a warp marker opens shell popup without changing selection or view".
  Callback destination Source; selection count, map-open exclusion and outline geometry assertions retained.
- gbc/GbcWorldCanvas.test.tsx (GBC):
  "Shift+double-click on a warp marker opens the map under it instead of the shell popup (Plan 6c E3)".
  Shift opens Source without callback; subsequent plain double-click calls Hidden; no own dialog.
- canvas/WorldSurfaceInteraction.test.tsx (shared core, both family contracts):
  "marker clicks within eight pixels select nothing; nine pixels selects the map; double-click requests the popup".
  Callback B and no own dialog replace preview assertions; selection and map-open checks retained.
- canvas/WorldSurfaceInteraction.test.tsx (shared core, both family contracts):
  "StrictMode fetches warps once per map and discards the previous mount's pending result".
  Callback B and no own dialog replace preview assertions; stale-response and request-count checks retained.
- canvas/WorldSurfaceInteraction.test.tsx (shared core, both family contracts):
  "adapter facts preserve modified double-click and unresolved warp alert behaviour".
  Unresolved marker never invokes the callback; existing modified-click and alert behavior retained.
- canvas/WorldSurfaceInteraction.test.tsx (shared core, both family contracts):
  "an unresolved marker still shows its own alert".
  Repair the second marker fixture with popupMap B. First marker remains unresolved, shows its separate alert and
  keeps the failed-map count without calling the callback. Resolved second marker clears both alerts and calls B.

All direct-canvas replacements assert callback destinations and no locally rendered dialog.
No other existing test cases were intentionally changed. No tests skipped or left as TODO.

## Verification and outstanding evidence

verify: not run (sandbox)

Per the final sandbox instruction, git, vitest and tsc were not attempted in this repair turn.
No fresh passing runtime result, gate, UI build, live check or mutation result is claimed.
Conductor-supplied pre-repair evidence, not a result from this turn:
- Tests 11 failed | 2090 passed (2101), 6 files failed.
- test/shell/warpPopup.test.tsx(558,20): error TS2339: Property 'toHaveTextContent' does not exist.

Static checks in this turn: all 14 source/test paths listed above have CRLF line endings and no BOM.
No import of WarpDestinationModal, renderWarpPopup or setWarpPopup remains under packages.
Added/rewritten lines use ASCII and fit 140 columns; pre-existing longer lines/comments were left intact.
Deleted paths remain absent. Report is ASCII, CRLF, no BOM, at most 140 columns.

Conductor must run sequentially and supply real result lines before acceptance:
- npx vitest run packages/ui/test/shell packages/ui/test/canvas packages/ui/test/WorldCanvas.test.tsx packages/ui/test/gbc
- npx vitest run packages/ui --maxWorkers=4 --minWorkers=1
- npx tsc --noEmit -p packages/ui/tsconfig.json
Plan gates also require full gate, UI build and the callback-removal mutation; live acceptance is Task 6.
No unrelated bug was established by this static repair. Runtime failures, if any, remain unresolved until verification.
