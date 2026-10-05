# D3 predispatch independent spec review

**Verdict: pass after corrections through `e4a0283`.** This is a predispatch review, not the required review of D3 implementation. Independently inspected the real PerfPlus warp records, GBA/GBC routes, root-relative sidecar helpers, dungeon hook/sidebar, modal/canvas seams, governing dungeon design, and existing test names. No mutations, tests, external writes, or implementation edits ran.

## Independent endpoint and screen derivation

In `maps/BurnedTower1F.asm`, the third `warp_event` is `(10,9), BURNED_TOWER_B1F, 1`: source array index **2**, destination array index **0** after subtracting one. B1F's first event is `(10,9), BURNED_TOWER_1F, 3`, so the reciprocal link resolves to 1F index **2**. B1F index **1** instead has `(17,7)`, making the direct-index mutant observable.

Both correct raw step endpoints divide by two to `(5,4.5)` blocks. With source origin `(10,20)`, destination origin `(30,40)`, zoom 8 pixels/block, and pan `(3,7)`:

- Source: `((10+5)×8+3, (20+4.5)×8+7) = (123,203)`.
- Destination: `((30+5)×8+3, (40+4.5)×8+7) = (283,363)`.

These coordinates match the executed spec, including no center offset. D3-M1's incorrect destination index 1 instead yields `((30+8.5)×8+3, (40+3.5)×8+7) = (311,355)`. D3-M2 omitting the step-to-block conversion yields source `(163,239)` and destination `(323,399)`. Both requested mutations can therefore change exact observed line geometry. The pure fixture must use these explicit origins rather than assume D2's evolving corpus auto-layout positions.

## Corrections found and verified

1. **Outside-scope destination preview:** the first draft said outside `mapFilter` names were never drawn/fetched anywhere. Governing design §5.4 expressly allows a scoped marker to open a destination outside the dungeon. Commit `67876a2` limits the prohibition to world-scene and connection-line data and explicitly exempts the modal. This removes the contradiction. D3 tests should prove an outside destination has no line yet can load in a marker preview.
2. **GBA validation parity:** dungeon validators in `packages/server/src/index.ts` are inline. There is no reusable dungeon body-validation helper to import. Existing GBA null bodies reach an error path, and an array PATCH can pass the optional-field checks; blindly mirroring those behaviors conflicts with the new GBC plain-object requirement. Commit `67876a2` accurately distinguishes reuse of `readBody`/sidecar operations and matching field/response shapes from the added GBC body guard. U1 leaves GBA untouched.
3. **Existing-test grounding:** there is no GbcApp test asserting two View buttons. Its `toBe(2)` occurrence counts metatile palette cells. Commit `e4a0283` removes that invented expected edit and makes the three-mode assertion a new test. The actual removed/refashioned 501 cases are precisely `/api/warps/:name`, `/api/dungeons (bare)`, and `/api/dungeons/:id (PATCH)` under `GBA-only routes are refused with 501, naming the path, for every method`. Other refusal/near-miss tests remain meaningful and should stay. The revision requires every additional existing test edit to be named with its reason.

## Confirmed implementation seams

- `projectPaths(root)` computes `.pokemap/world.json` and `.pokemap/dungeons.json` by normalized root without reading GBA project metadata. `readDungeons` returns `{version:1,dungeons:[]}` when absent; `writeDungeons` creates the parent directory and writes only that file. `readSidecar`/`writeSidecar` have the same root-only dependency. Static compatibility with GBC is sound; the requested actual GBC write/read/finally roundtrip remains to be executed during D3.
- GBA GET returns the dungeon array; POST/PATCH return a dungeon; DELETE returns `{ok:true}`; successful writes use status 200. POST validates the seed name exists and gives it precedence over explicit maps, returns sorted forward warp reachability, and rejects unknown seed with 400. PATCH/DELETE return 404 for unknown IDs. Preserve these cases in the GBC mirror. Invalid JSON should remain 400 and file failures 500.
- `DungeonSidebar` already accepts promise-returning CRUD handlers and displays action rejections; a structurally compatible GBC guarded hook can reuse it unchanged. `GbcMapCanvas` requires `{mapName,data,time}`; a GBC destination modal can use existing guarded `useGbcMap` and pass the app time, with loading/error states and the established top-level modal shell/focus behavior.
- The current D2 working adapter normalizes both source and arrival to blocks. D3's declared wire contract uses raw steps and divides once at projection. Reuse immutable event/cache data carefully: exposing an already-normalized D2 endpoint as a raw destination tile would double-scale it. Pin both raw route endpoint and screen endpoint independently. Recheck the final D2 adapter after its fix commit before coding this integration.
- GBC's measured LOD threshold is 8 pixels/block; zoom 8 in the fixture is at the visible-marker boundary. Lines remain independent of marker LOD. Scoped refit must wait for world data, preserve one view state, and gate outside tree/drop/jump paths while allowing hidden members.
- The required write scan and serial colocated PerfPlus tests are appropriate. Restoration must retain initial bytes/file existence/parent existence, read before writing, and remove only a newly created empty parent. No actual sidecar restoration claim is made by this read-only preflight.

No open predispatch findings after the two coordinator corrections. Subsequent implementation review must still exercise route guards, scope and modal exceptions, exact endpoints, real write restoration, and every requested non-equivalent mutation; this report does not replace that gate.
