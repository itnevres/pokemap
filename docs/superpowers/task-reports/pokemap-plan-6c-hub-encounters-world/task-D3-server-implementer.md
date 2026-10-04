# D3 server/core implementer report

Status: implemented and focused verification passed. Code commit: `90aff21` (documentation follow-up committed separately). Base: `47b95b2`.

## Scope and changed files

- `packages/server/src/gbcRoutes.ts`: GBC warp GET, dungeon GET/POST/PATCH/DELETE, named validation errors, root-relative sidecar calls. The other GBA-only refusal routes remain.
- `packages/core/src/world/nearWarpAdapters.ts`: directed BFS over the same resolved GBC warp-map links already used by world placement. It includes the seed, traverses hidden intermediates and cycles, and never calls the GBA `Project` helper.
- `packages/server/test/gbcRoutes.test.ts`: corpus pins, synthetic BFS, CRUD/validation, and sidecar restoration. No UI or GBA files changed.

## Corpus facts and behavior

- `maps/BurnedTower1F.asm` has array index 2 `warp_event 10, 9, BURNED_TOWER_B1F, 1`. The target's array index 0 is `warp_event 10, 9, BURNED_TOWER_1F, 3`; the HTTP response carries `family: "gbc"`, those raw coordinates, and resolves `destWarp: 1` to target index 0.
- `maps/CeladonDeptStoreElevator.asm` has index 0 `warp_event 1, 3, CELADON_DEPT_STORE_1F, -1`. The route retains `destMapName: "CeladonDeptStore1F"` and has no `destEvent`.
- Source maps with malformed encoding return named 400 errors; unknown names return named 404 errors.
- Explicit and seeded dungeon POSTs return `{id,name,maps}`. PATCH returns the updated dungeon; DELETE returns `{ok:true}`; GET returns the array. Seeded names are sorted.

## Changed tests and reasons

- `GBC directed dungeon seed traversal / follows outgoing edges through hidden maps and cycles, including the seed`: synthetic directed graph with a hidden intermediate, cycle, incoming-only edge and isolated seed. It distinguishes directed traversal from undirected grouping.
- `GET /api/warps/:map / pins BurnedTower1F index 2 to B1F index 0 using raw event coordinates`: pins the real 1-based convention and array/source order.
- `GET /api/warps/:map / keeps a named -1 destination edge without a resolved destination event`: checks unresolved arrival remains a named edge.
- `GET /api/warps/:map / rejects malformed and unknown source maps before looking up events`: pins 400/404 route semantics.
- `GBC dungeon CRUD / roundtrips explicit and seeded dungeons in the root sidecar, then restores exact prior bytes`: exercises all four methods, persistence, sorted seed membership, and restores exact original bytes or absence.
- `GBC dungeon CRUD / rejects invalid create and patch bodies without writing`: covers `null`, arrays, invalid JSON, empty/invalid names, invalid maps and seed types, and confirms unchanged sidecar state.
- Existing 501 assertions for GBC warps/dungeons were removed because those routes now exist. The remaining refusal assertions still pass.

## Write safety

Before adding the PerfPlus dungeons test, scanned all package test trees with `rg -n "writeFile|mkdir|dungeons.json|\\.pokemap" packages -g '*test*'`. Existing PerfPlus world-sidecar writes were in `packages/server/test/gbcRoutes.test.ts`, so the new dungeons write stays in that serial file. The test snapshots `.pokemap` existence and dungeons file bytes. It captures file bytes immediately after each write request, before asserting the response. Its read-guarded `finally` compares the current bytes to the last captured write, then restores changed original bytes, or removes only the created dungeons file and an empty newly-created directory. After the final focused run, both `C:/Programming Projects/pokecrystal-PerfPlus/.pokemap` and its `dungeons.json` were absent (`Test-Path` returned `False`, `False`). The GBA corpus was not written.

## Red proof and green verification

Each mutation was applied to an in-memory source string, written temporarily, tested with `npx vitest run packages/server/test/gbcRoutes.test.ts -t '<title fragment>'`, and restored byte-for-byte in PowerShell `finally` from the captured original byte buffer. All five commands produced `MUTATION_EXIT=1` with the intended assertion, then the final clean run passed:

1. `events.warps[event.destWarp - 1]` → `events.warps[event.destWarp]`; BurnedTower test saw destination `(17,7)` instead of `(10,9)`.
2. Warp route's malformed-name branch returned `{mapName,warps:[]}` with 200; malformed-name test expected 400 and failed.
3. BFS adjacency storage reversed `from→to` to `to→from`; synthetic graph included `ReverseOnly` and failed.
4. Dungeon POST's `writeDungeons(proj.root, dungeons)` was removed; roundtrip failed reading the absent dungeons file.
5. Dungeon POST's explicit `parsed === null` guard was removed; null reached property access and yielded 500 instead of expected 400.

Commands: `npx vitest run packages/server/test/gbcRoutes.test.ts` → 85 passed; `npx tsc --noEmit -p tsconfig.base.json` → exit 0. No full suite was run. Final code file diff after mutation restoration was empty; only the explicit report/comment follow-up remained for its own commit.
