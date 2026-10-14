# Issue 6 acceptance verification

Scope: inspected GBA and GBC grouping and connection lines on the shared working tree based on ef248a3, plan-7-gbc-editing. Production popup/App/World work is concurrently owned by the implementer. No browser control, Git mutation, issue comments, or external corpus writes performed. Coordinator explicitly authorized focused TEST edits only.

## Requirement mapping

- Selecting a dungeon/city: `DungeonSidebar.tsx` opens saved user-curated membership and creates by explicit maps or seed. GBA `App.tsx:174-175,336` supplies membership as `mapFilter`; GBC `GbcApp.tsx:133-143,337` does likewise, preserving filter identity across rename. GBA `WorldCanvas.tsx:851-905` takes every existing member placement as candidate, bypassing default map-type visibility. GBC `GbcWorldCanvas.tsx:603-618` includes scoped INDOOR/GATE maps. Existing mocked UI tests prove outsider exclusion, opening, editing membership, fit, rename/delete, and errors.
- Floors/rooms and warp endpoints: GBA `WorldCanvas.tsx:1274-1343` uses destination map and zero-based destination warp array entry, then projects both raw coordinates with each map placement. GBC `gbcRoutes.ts:258-269` resolves the one-based destination ordinal to `destEvent`; `GbcWorldCanvas.tsx:647-668` projects raw 16px event coordinates to 32px world blocks using `projectGbcWarpPoint`. Missing destinations are omitted. Both scope-check destination membership, sort source names, and cycle eight connection colors. Tests assert endpoint coordinates, omitted invalid/outside targets, independent toggles, membership narrowing, and color stability for equivalent filter order.
- Issue 5 relation markers/destination popup: existing GBA marker double-click test exercises preview and close; GBC dungeon tests exercise preview, Escape preserving view, real click/click/double-click sequence, and Shift double-click. These are mocked component interaction checks, not live acceptance of the concurrently evolving popup.
- Persistence/traversal: `core/world/dungeons.ts` uses the root sidecar; both server implementations use shared reads/writes. GBA `warpGraph.ts:131` and GBC `nearWarpAdapters.ts:56` traverse outgoing reachable warp maps, including cycles, retaining the seed. Server tests were inspected but not run because selected route tests write external corpus sidecars.

## Independently proven pre-existing gap

GBA warp fetching only iterated viewport-visible placements (`WorldCanvas.tsx:1027`), while lines require both member caches. Newly added regression `WorldCanvas.test.tsx:1999`, "loads offscreen dungeon members for connection lines without fetching outsiders", uses an anchored room and indoor shelved room at x=10000/component99. Connection toggle must draw two reciprocal lines without fetching Outside. Before the fix, it deterministically fails: expected 2, received 0. Implementer fixed this with the union of visible maps and all placed mapFilter members while linesOn (`WorldCanvas.tsx:1036-1039`); this agent did not edit production. Final focused rerun passes the regression and existing scope/line checks.

The existing GBA mixed anchored/shelved fit heuristic deliberately fits anchored members only (`WorldCanvas.tsx:652-686`; existing test ~1869). All members remain candidates but may initially be offscreen. Coordinator explicitly chose to preserve this existing usability tradeoff rather than fit all distant shelf positions into unreadable fractions of pixels. Thus "all maps together" means the same scoped canvas, not an assurance every member fits the initial viewport.

## Executed checks

All commands ran serially with `--maxWorkers 1 --minWorkers 1`.

1. `npx vitest run packages/ui/test/WorldCanvas.test.tsx packages/ui/test/gbc/GbcWorldCanvas.test.tsx -t "dungeon|mapFilter|Feature C" --maxWorkers 1 --minWorkers 1`: PASS, 23 tests; 200 skipped. Run before added regression.
2. `npx vitest run packages/ui/test/WorldCanvas.test.tsx -t "loads offscreen dungeon members" --maxWorkers 1 --minWorkers 1`: RED, 1 failed; 102 skipped; expected two SVG lines, observed zero.
3. `npx vitest run packages/core/test/world/dungeons.test.ts packages/ui/test/DungeonSidebar.test.tsx packages/ui/test/useDungeons.test.tsx packages/ui/test/App.test.tsx packages/ui/test/gbc/GbcApp.test.tsx -t "dungeon|Dungeon" --maxWorkers 1 --minWorkers 1`: PASS, 30 tests; 51 skipped. App tests emit jsdom canvas getContext warnings; these checks assert DOM/wiring rather than raster output.
4. `npx vitest run packages/ui/test/WorldCanvas.test.tsx -t "double-clicking a warp marker|loads offscreen dungeon members" --maxWorkers 1 --minWorkers 1`: existing marker popup test PASS; new regression still RED (1 passed, 1 failed, 101 skipped).
5. `npx vitest run packages/core/test/world/nearWarp.test.ts --maxWorkers 1 --minWorkers 1`: PASS, 11 tests, including actual read-only GBA Granite Cave/Meteor Falls/Seafloor Cavern arrivals and GBC half-block/null-arrival adapter checks. This validates relation coordinates against available corpora but does not validate live dungeon display.
6. After implementer fix: `npx vitest run packages/ui/test/WorldCanvas.test.tsx packages/ui/test/gbc/GbcWorldCanvas.test.tsx -t "dungeon|mapFilter|Feature C|double-clicking a warp marker" --maxWorkers 1 --minWorkers 1`: PASS, 25 tests; 199 skipped. Includes new formerly-red offscreen regression and strengthened indoor member image coverage.

Test-only changes: the offscreen regression above and existing mapFilter fixture `InDungeon2` at ~1806 now sets actual `MAP_TYPE_INDOOR`, `manual:false`, strengthening hidden-member art coverage. Final status: PASS for executed scoped grouping, exact valid endpoints, outsiders exclusion, independent toggles, and marker preview interactions. No full suite or live rendering checked by this agent; coordinator owns scratch-project live acceptance. Initial anchored-only fit limitation remains as explicitly approved. Reports remain unarchived pending coordinator live acceptance and review completion.

## Additive GBC save/cache regression verification

Coordinator subsequently assigned this agent exclusive additive ownership of `packages/ui/test/gbc/GbcWorldCanvas.test.tsx`. Implementer was notified; no production file was edited. Added three cases at ~220-265 against the already implemented cache-generation guards:

- "saving a destination refreshes incoming cached warp endpoints": Source's response embeds Hidden's arrival event. Only Hidden's `tileVersions` changes; Source must be fetched again, and its cached incoming line endpoint must move. The test asserts exactly two Source requests, so refreshing only the saved map cannot pass.
- Parameterized older deferred success/failure cases hold the first Source request unresolved, then save Hidden and wait for the second fresh response. The obsolete success carries deliberately different source and arrival coordinates; the obsolete rejection contains a specific error message. Both settle inside awaited `act` before checking that the fresh marker and line still exist with literal coordinates, that no obsolete error appears, and that exactly two Source requests occurred. This catches overwriting fresh payloads, deleting fresh caches, displaying obsolete failures, or silently requesting a replacement third payload.

Independent coordinate derivation: the existing fake viewport is 200x200 (`VIEWPORT_SIZE`), unlike GBA's 100x100 fixture. Scoped Source occupies blocks (0,0)-(10,10), Hidden occupies (15,0)-(25,10), giving bounds 25x10, zoom 8 and pan (0,60). Source raw event (2,4) halves into block (1,2), then projects to (8,76). Hidden old raw arrival (6,8) projects to ((15+3)*8, 4*8+60)=(144,92). Fresh raw arrival (10,12) projects to ((15+5)*8, 6*8+60)=(160,108). Assertions use these literal values, never the production projection helper. The obsolete source raw (8,10) would produce (32,100), ensuring an overwrite changes the asserted marker as well as endpoint.

Executed checks, serial workers:

- Initial new-test run used incorrectly assumed 100x100 fixture coordinates and failed all three with observed doubled values; inspecting `VIEWPORT_SIZE=200` corrected the fixture expectations above. This was a test derivation error, not a product defect.
- `npx vitest run packages/ui/test/gbc/GbcWorldCanvas.test.tsx -t "saving a destination|older deferred" --maxWorkers 1 --minWorkers 1`: PASS, 3 tests, 121 skipped.
- `npx vitest run packages/ui/test/gbc/GbcWorldCanvas.test.tsx -t "GBC dungeon warps" --maxWorkers 1 --minWorkers 1`: PASS, 12 tests, 112 skipped, covering the three additions alongside existing exact endpoints, scope, marker actions and preview checks.

No production mutation proof, full suite, live browser, or external corpus write was performed for these additions. This append preserves the original GBA offscreen red-to-green trail above.
