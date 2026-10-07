# Phase D review (D1–D4): Claude Code coordinator, 2026-10-04

Scope: the Phase D code diff `e34629a..1c49c53` (35 files under `packages/`, +2,367/−142), read by the coordinator, plus the live run and gate in `task-D4-coordinator.md`. ChatGPT/Codex coordinated and implemented D1–D4. This review re-checks that work independently. It does not replay the earlier per-task reviews.

## Verdict

Phase D meets criteria 6 and 7 live in both families. The final gate is green apart from the known environment pair, after one stale-test fix (`1b558b0`). The per-task review loop mostly held: specs were grounded, U3 (acknowledge only) is respected, and the 13 D4 mutation cases all went red on the final commit.

This session found three gaps:
- **R2:** a stale test that broke the gate. Fixed in `1b558b0`.
- **R3:** the missing D3 coordinator mutation run, which revealed one surviving mutant. Fixed in `9400241`.
- **R1:** a low-severity D2 overlap between near-warp placement and manual placement. **Fixed in `6aa47ae` at the user's request.**

There are also a few UX nits. None blocks Phase E.

## Findings

### R1. A near-warp map can overlap a manually placed map (D2, low, confirmed; fixed in `6aa47ae`)

**Fixed, 2026-10-04.** `placeNearWarps` now takes `manualPlacements`. Those maps are fixed anchors and obstacles at their manual positions, and they are never moved as singletons. Both callers pass the sidecar's list, and `applySidecar` still runs last. New witnesses:
- a core unit fixture;
- GBA: Route101 placed by hand on GraniteCave_1F's auto spot (18,366);
- GBC: AzaleaTown placed by hand on IlexForest's auto spot.

The mutation harness `r1-mutations.mjs` covers both core sites (the singleton exclusion and the manual position) and both caller wirings. All 4 cases go RED. The first singleton mutant survived because it was equivalent in the first fixture: the pin equalled the preferred spot. Moving the pin killed it. Full gate on `6aa47ae`: **2,042 pass / 2 known fail**; typecheck and build clean.

Original finding:

`resolve.ts` (GBA) and `buildGbcWorldPayload` (GBC) both call `placeNearWarps` with the *automatic* positions and apply `applySidecar` afterwards. `placeNearWarps` builds its obstacle set from those pre-manual positions, so it avoids where a manually placed map *would have been*, not where it is drawn.

Repro (scratch `manual-overlap.mts`, real `placeNearWarps` + `applySidecar`):
- anchor `A` at (0,0), 10×10;
- singleton `S` warps into A's east edge and is placed at (14,0);
- map `M` was manually placed at (14,0);
- the final placements are `S (14,0)` and `M (14,0)`: an exact overlap.

D2's "zero overlaps" corpus tests run without manual placements, so they miss this. It only shows once a user has dragged maps and auto-layout is on. That is not today's GBA subject (`dungeonAutoLayout:false`), but it is reachable on GBC, which has no toggle.

**Fix:** treat manually placed names as fixed obstacles at their manual positions inside `placeNearWarps`. The simplest way is to pass `applySidecar(base, sidecar)` positions for obstacles and exclude manual names from the singleton set. Keep `applySidecar` last. Add a fixture test with this repro. It is one change in core, shared by both callers.

### R2. A stale D3 discriminator broke `Root.test.tsx` (D3, fixed here)

See `task-D4-coordinator.md` § Phase D gate. D3 gave GBC a Dungeon button, and the existing test relied on there being none. It failed only in the full gate: no D3 dispatch ran that file. Lesson: when a task adds UI to a shell, grep the tests for assertions that the element is *absent* (`queryBy…).toBeNull()`) on that text.

### R3. The D3 coordinator mutation run was missing, and one mutant survived (D3, fixed here)

The D3 spec requires the coordinator to rerun D3-M1–M6, but no committed record of that run existed. The rerun is in `task-D3-coordinator.md`. D3-M3 at the `visible`-memo site survived, because the scoped fixture's outsider lay beyond the fit and culling hid it. The new test `9400241` kills it. All 7 cases are RED on `9400241`.

### Nits (no action required now; E3 may absorb the UI ones)

- **The conflict action popup is screen-anchored.** It stays open at its pointer position while the canvas pans, a left click elsewhere doesn't close it, and only Escape or another right-click does. E3's `WorldContextMenu` should own dismissal.
- **The conflict error toast** has no dismiss button. It clears only on the next save attempt.
- **The accepted-badge fallback colour** `#6b7280` differs from the real `--text-muted` `#64748b`. The fallback only applies when the variable is missing, so this is cosmetic.
- **The legend row** still shows only "Conflict". There is no "Accepted" entry.
- **Duplicate GBC world fetches.** In World mode, `GbcApp` (tree visibility) and `GbcWorldCanvas` each `GET /api/world`, and each request re-runs `placeNearWarps`. That is about 80 ms warm on PerfPlus, so it is fine today.
- **Warp fetch retries.** `GbcWorldCanvas` retries a failing `/api/warps/:map` on every pan frame (the cache entry is deleted on error). This only matters when warps are persistently unavailable.
- **Seeded dungeons grow large.** A dungeon seeded from `BurnedTower1F` pulls in 35 maps, because the outgoing-warp BFS crosses EcruteakCity into Pokecenter2F and the Colosseum. This matches GBA's `warpConnectedMapsFrom` exactly, so it is parity, not a D3 defect. It may deserve a "stop at outdoor maps" option later.
- **Unknown map names are accepted.** `POST /api/world/placement` and the dungeon `maps` field accept names that aren't in the project, which is GBA parity. An unknown placement produces a phantom `applySidecar` placement with `mapType: ""`.

## Checked and fine

- **D1.** GBC shows 158 maps drawn and 233 greyed (live). Drag-to-place uses one `view` state and posts on mouseup/mouseleave only when the map moved. The GBC placement route validates finite numbers, which is stricter than GBA's.
- **D2.** The BFS is directed and stays deterministic: edges are sorted by a padded key, and candidates are ordered by (distance, anchor, path). It only travels through hidden maps. The spiral search is a Manhattan ring and always terminates, because the obstacle set is finite. Live placements:
  - DarkCaveVioletEntrance touches Route31;
  - BurnedTower1F sits 4 blocks north of Ecruteak, and B1F 4 blocks north of 1F;
  - IlexForest sits 15 blocks west of Route34.
- **D3.**
  - `destWarp` is 1-based and converted with `−1`, and GBC event coordinates are halved into block units.
  - The GBA-only route regex narrowed correctly; `world/dungeons` stays GBA-only.
  - The dungeon CRUD validates its inputs like GBA's, and `useGbcDungeons` guards every response.
  - The warp modal moves focus inside through `autoFocus` (not a full focus trap), and Escape closes it. Both were verified live.
- **D4.**
  - The key is the full 7-tuple, JSON-escaped.
  - Both routes check the body shape and unknown keys before writing, and write only `world.json`.
  - Placements were byte-identical across accept and un-accept, both live and in tests.
  - Badge offsets are shared by drawing and hit-testing.
  - A project switch remounts the shell (`Root.tsx`'s `key`), so session acceptance state can't leak across projects.
- **U1 removed-line check.** The removed lines in existing tests are imports, the `conflicts` fixture field and a `placements` fixture extended with `mapType`/`manual`. The only GBA test change in Phase D adds the D4 scratch-root test plus its imports.
