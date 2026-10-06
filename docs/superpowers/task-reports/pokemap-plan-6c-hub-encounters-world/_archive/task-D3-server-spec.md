# D3 server/core checkpoint — GBC warp and dungeon APIs

This checkpoint implements only D3’s server/core contract. It deliberately excludes `GbcWorldCanvas` warp markers, destination preview, `mapFilter`, Dungeon mode, and all UI hooks/components. Those remain for the next D3 session; no live verification applies to this checkpoint.

## Contract

- GBC `GET /api/warps/:map` returns raw GBC event coordinates in array/source order, `mapConst`, 1-based `destWarp`, resolved `destMapName`, and a resolved destination event when the positive 1-based index is in range. It 400s malformed names and 404s unknown maps. A `destWarp` of `-1` or out-of-range target remains a named map edge with no destination event.
- GBC `GET/POST/PATCH/DELETE /api/dungeons` mirror the GBA response shapes. Body validation explicitly rejects null, arrays, invalid JSON, invalid field types, and empty names. It writes only root-relative `.pokemap/dungeons.json`.
- GBC seed-map creation uses a directed BFS over the same resolved GBC warp-map edges, includes the seed, traverses hidden maps/cycles, and returns sorted map names. It never uses GBA’s `Project` helper or planar connections.
- Preserve the remaining GBA-only refusal routes. No GBA route or test changes.

## Tests and state

Scan all `packages/*/test/**` file writes before adding a PerfPlus write test. The existing PerfPlus world-sidecar tests are in `packages/server/test/gbcRoutes.test.ts`; use that same file so the dungeons roundtrip is serial. Snapshot dungeons file bytes and `.pokemap` directory existence. In `finally`, restore only changed bytes; when originally absent, remove only the created dungeons file and an empty created `.pokemap` directory. Do not touch the GBA subject. Add read-only corpus pins for BurnedTower1F array index 2 → B1F destination index 0 and for an unresolved destination. Add synthetic directed cycle/BFS tests.

## Required proof

Red-prove each new test with a non-equivalent in-memory mutation before green: omit `destWarp - 1`; return target map even when source is malformed; traverse reverse rather than forward seed edges; bypass the dungeon write; accept null body. The report records commands and literal anchors. Run focused GBC route/core tests and typecheck, never a full suite. Full report is `task-D3-server-implementer.md`; return one status line plus its path. Commit only explicit task files.
