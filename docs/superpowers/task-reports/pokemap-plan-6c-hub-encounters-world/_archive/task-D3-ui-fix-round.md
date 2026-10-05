# D3 GBC UI fix round

Status: all five integrated UI review findings fixed. Base `f5556b9`; no server or GBA files changed.

## Changes

- `GbcWorldCanvas.tsx`: a scope change clears stale selection, hover, and tooltip. Enter checks the current scope at the action boundary, so a removed member cannot open. A click on a drawn warp marker now takes precedence over map-body selection; the browser's click/click/dblclick sequence opens the destination without selecting the map under the marker. The warp error group uses the existing shrinkable `world-canvas__toolbar-group--save-error` class, whose stylesheet rule gives `min-width: 0` and ellipsis to the error text.
- `GbcApp.tsx`: the dungeon filter retains its Set identity across a rename when the same dungeon has the same sorted members. A dungeon switch or membership edit creates a new filter and triggers the scoped fit.
- `GbcWorldCanvas.test.tsx`: added tests for stale selection/hover after a scope switch, marker click precedence with real event ordering and preserved selection geometry, and exact rendered marker/SVG endpoints at zoom 8 and pan (3,7). The existing test `shows malformed warp payload errors and permits retry after a later toggle` now uses a long malformed response and checks the shrinkable toolbar class at the test's 200px viewport.
- `GbcApp.test.tsx`: added `preserves dungeon pan on rename and refits after membership changes`, exercising a real guarded PATCH/reload and a later member edit.

## Red proof

Each mutation was written temporarily from an in-memory byte snapshot and restored in `finally`; after the proof, focused tests/typecheck/build ran against the original source. Commands used `npx vitest run <file> -t <title fragment>` and every listed mutant exited 1 with the intended assertion:

1. Removed the scope-selection clear and replaced `if (selectedMap && (!mapFilter || mapFilter.has(selectedMap)))` with `if (selectedMap)`; the excluded Enter test saw `onOpenMap` called once.
2. Replaced the marker click guard with `if (false) return`; the real click/click/dblclick test saw three selection callbacks instead of one.
3. Replaced marker `sx`'s `w` with `{ ...w, x: w.x * 2 }`; rendered marker test got `163px` instead of `123px`.
4. Replaced line `x2`'s destination placement with source placement; rendered endpoint test got `123` instead of `283`.
5. Forced the cached-filter ID comparison false; rename test found the outline reset to `(0px,0px)` instead of preserving `(20px,10px)`.
6. Removed the shrinkable modifier from the warp error group; the long error test failed its class assertion.

## Green verification

`npx vitest run packages/ui/test/gbc/GbcWorldCanvas.test.tsx packages/ui/test/gbc/GbcApp.test.tsx`: 134/134 passed. `npm run typecheck`: passed both base and UI projects. `npm run build -w @pokemap/ui`: passed. No full suite or external sidecar write was run. The jsdom canvas `getContext` warnings in the GbcApp test file remain non-failing environment messages.

## Final test isolation follow-up

The new `preserves dungeon pan on rename and refits after membership changes` test now deletes its temporary own `HTMLElement.prototype.clientWidth` and `clientHeight` properties when those descriptors were absent before the test. It still restores the exact original descriptor when one existed, and checks both descriptors after `finally`. This closes the quality re-review's test-isolation finding without changing production code. In-memory red proof removed the `clientWidth` delete branch, then `npx vitest run packages/ui/test/gbc/GbcApp.test.tsx -t 'preserves dungeon pan'` exited 1: the leaked `{ value: 100, ... }` descriptor differed from the expected `undefined`. Source bytes were restored in `finally` and compared. The complete `GbcApp.test.tsx` file then passed 33/33 tests on a focused rerun. One preceding run had an intermittent failure in the existing hover/highlight test; that test passed alone and the complete file passed on rerun.

## Final M6 guard witness

The existing test `shows malformed warp payload errors and permits retry after a later toggle` now returns a syntactically valid warp payload with `mapName: "Source"` and `warps: []`, but the wrong `family: "gba"`. Previously it omitted `mapName`, so bypassing the family check still failed for that independent reason. The coordinator's exact M6 bypass of `x.family === "gbc" &&` to `true &&` was applied in memory and `npx vitest run packages/ui/test/gbc/GbcWorldCanvas.test.tsx -t 'shows malformed warp payload errors'` exited 1 because no visible unexpected-shape alert appeared. The guard source was restored byte-for-byte in `finally` and compared. The focused `GbcWorldCanvas.test.tsx` file passed 101/101 after restoration.
