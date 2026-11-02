# Task 2 report: dungeon surface scope

Status: implementation complete; awaiting the conductor's Vitest, mutation, UI-build, and commit gates.

## Classification and scope

Medium risk: a shared UI/API selection change whose incorrect URL and hidden-control behavior have focused regression tests.
Only the brief's five source files, four test files, and this report were changed.

## Changed production files

- `packages/ui/src/canvas/worldSurfaceAdapter.ts`: exports `WorldScope` and passes it to `useWorld`.
- `packages/ui/src/canvas/WorldSurface.tsx`: selects `"dungeon"` exactly when `mapFilter` is set and hides the switch there.
- `packages/ui/src/gba/worldSurface.tsx`: requests the scoped GBA endpoint.
- `packages/ui/src/gbc/worldSurface.tsx`: forwards the scope to the GBC world hook.
- `packages/ui/src/gbc/hooks/useGbcWorld.ts`: defaults to world scope and requests the scoped GBC endpoint when needed.

## New tests

- `WorldSurface.test.tsx`: `passes the dungeon scope to its adapter and hides dungeon auto-layout there`.
- `WorldCanvasSurface.test.tsx`: `requests dungeon-scoped placements and hides dungeon auto-layout in a filtered GBA surface`.
- `GbcWorldCanvasSurface.test.tsx`: `requests dungeon-scoped placements and hides dungeon auto-layout in a filtered GBC surface`.
- `useGbcWorld.test.ts`: `fetches the dungeon-scoped world when requested`.

## Existing test support updated

No existing test body changed. The exact `/api/world` fetch helpers now also accept
`/api/world?scope=dungeon`, because the following existing dungeon-mode tests now issue the scoped request:

- `WorldCanvasSurface.test.tsx`: `P12-4r: lines fetch an offscreen shelved filter member and resolve its exact destWarpId endpoint`.
- `GbcWorldCanvasSurface.test.tsx`: `a pending jump fit is dropped when a filter excludes the map before the viewport is measured`.

## Verification and limitations

- `npx.cmd tsc --noEmit -p packages/ui`: pass.
- All nine changed source/test files were normalized to CRLF; no bare LF remains. Added lines are at most 140 characters.
- Per the task's sandbox instruction, Vitest was not run (known `node_modules` EPERM) and Git was not invoked.
  The initial PowerShell `npx` form was blocked by execution policy; `npx.cmd` completed the allowed typecheck.
- The required UI live check, full test gate, UI build, and commit remain conductor work.

## Expected mutation result

Hard-coding `"world"` in `WorldSurface` fails its adapter-scope test and both filtered-surface URL assertions.
Those URL assertions expect exactly `/api/world?scope=dungeon`.

## Unrelated bugs

None observed.

## Fix round 1

The conductor's UI Vitest run found 12 existing dungeon tests whose fetch mock only accepted `/api/world`.
Each listed test now reaches its original fixture through a mock that also accepts `/api/world?scope=dungeon`.
No assertion or production code changed.

- `App.test.tsx`: `Plan 10b: a dungeon rename keeps the GBA dungeon canvas pan`.
- `App.test.tsx`: `in Dungeon mode a canvas click on a map does not change the app's selection`.
- `GbcApp.test.tsx`: `preserves dungeon pan on rename and refits after membership changes`.
- `GbcWorldCanvas.test.tsx`: `Shift+double-click on a warp marker opens the map under it instead of the preview`.
- `GbcWorldCanvas.test.tsx`: `does not keyboard-open a selected map removed from the current scope, and clears stale hover`.
- `GbcWorldCanvas.test.tsx`: `never draws an outsider that lies inside the scoped view`.
- `GbcWorldCanvas.test.tsx`: `opens a destination preview before body open and Escape keeps the world view`.
- `GbcWorldCanvas.test.tsx`: `real click, click, dblclick on a warp marker opens preview without changing selection or view`.
- `GbcWorldCanvas.test.tsx`: `renders the exact raw-half marker and both SVG endpoints at zoom 8, pan (3,7)`.
- `GbcWorldCanvas.test.tsx`: `scopes hidden members, excludes outsiders from images, warps, drop and lines`.
- `GbcWorldCanvas.test.tsx`: `shows malformed warp payload errors and permits retry after a later toggle`.
- `placementCommit.test.tsx`: `GBA dungeon-mode placement marks the map, so its World row is not greyed (F9)`.

Static verification: `npx.cmd tsc --noEmit -p packages/ui` passes. Vitest and Git remain unavailable in this sandbox.

## Conductor verification (2026-10-28)

- Focused 4 files: green 53/53. Red with packages/ui/src reverted: the 4 new tests fail, 49 pass. Mutation (WorldSurface passes "world" always): 3 scope tests fail.
- First `npx vitest run packages/ui`: 12 failures, all dungeon-mode fetch mocks answering only "/api/world" (fix round 1, mocks only). After: 123 files, 1996 passed. `npm run typecheck` passes.
