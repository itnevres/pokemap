# Phase D2 executed spec — near-warp auto-layout

## Authority

Plan 6c §D2 is binding. The output replaces GBA's shelf placement only when dungeon auto-layout is enabled, and supplies near-warp layout for GBC. Manual placements are applied after automatic positions. GBA's other behavior stays unchanged. Keep spec review and quality review split; geometry review must hand-compute fixture below.

## Re-measured implementation facts

- `autoLayoutUnplaced(proj, world, opts)` in `packages/core/src/world/warpGraph.ts` takes a GBA `Project`, `World`, and enabled/gap/origin options. It returns placements only for singleton planar components, unioned by warp connectivity and shelf-packed. It uses each source map's forward warp events and resolves destination ids through `idToName`.
- `resolveWorldPlacements` starts from every `buildWorld` placement, replaces singleton positions with auto-layout output when enabled, deletes singleton placements when disabled, then applies sidecar manual placements last.
- `buildGbcWorld` returns placements for all 391 maps. It has exactly three multi-map planar components; singleton component placements start at their component seed positions. GBC warp coords and world placements use blocks.
- GBA `Conflict`: `{map, viaA:{from,x,y}, viaB:{from,x,y}}`; GBC re-exports the same shape. Recheck types before review.
- Subject corpus examples (re-read `map.json`, `layouts.json`, and map ids): `GraniteCave_1F` is 42×15, has warps to Route106, GraniteCave_B1F, GraniteCave_StevensRoom; `MeteorFalls_1F_1R` is 30×42, warps to Route114/115, MeteorFalls_1F_2R, MeteorFalls_B1F_1R and MeteorFalls_StevensCave; `SeafloorCavern_Room1` is 20×21, warps to SeafloorCavern_Entrance, Room5 and Room2. Re-measure these exact facts immediately before pinning corpus assertions.
- GBC gate chain measured in the corpus: `IlexForest` warps via hidden `ILEX_FOREST_AZALEA_GATE` to AzaleaTown; hidden gate warp #3 targets AzaleaTown warp #7 at tile (2,10). Reconfirm when D3 pins the endpoint.

## Behavior

Add a family-agnostic near-warp placement helper operating on map-name keyed placements, shown names, hidden names, warp events, map sizes and gap. Reuse the GBA shelf output as fallback for reachable-failure cases; don't move manual placements until after auto-layout. Keep only shown maps as rendered collision obstacles; hidden maps remain BFS intermediaries, not blockers.

For each shown singleton planar component, search outward from already placed shown multi-map anchors by deterministic BFS over directed source warp events. Traverse hidden maps without placing them. A reached shown singleton is placed once, becomes an anchor for its own warp neighbors, and is processed in BFS order. Sort initial anchors, candidate maps and equal-priority choices by stable map/event keys so input map iteration order cannot change results. Preserve shelf coordinates for maps with no path to a placed shown anchor.

For each anchor warp, convert its map-local tile/block coordinate to world coordinates. Pick the nearest anchor edge by Manhattan distance to the tile rectangle; ties use north, east, south, west. Place the target outside that edge with the configured gap and align its center on the edge with the warp coordinate. Search nearest non-overlapping top-left candidates around that preferred position with a deterministic square spiral (Manhattan distance first; ties north, east, south, west). Never alter a non-singleton anchor. Keep the candidate search unbounded only while all occupied regions are finite; test a blocked preferred location to prove the spiral advances.

If no reachable shown anchor exists, retain the existing shelf position. Existing manual placements apply last and continue to override all automatic placements.

## Hand-computed geometry fixture (Opus-class reviewer must re-derive)

Gap 1. Fixed shown anchor `Anchor`: origin (0,0), size 12×4. Warp from Anchor at (3,0). Target singleton `Target`: size 3×2. No other obstacle. Distance to the top edge is 0; west is 3, east is 8, south is 3, so north wins. Center-align x to the warp: `3 - floor(3/2) = 2`; place above the anchor: `0 - 1 gap - 2 height = -3`. Expected placement `(2,-3)`. A center-quadrant mutant compares offset from anchor center (6,2): horizontal delta 3 exceeds vertical delta 2, so it chooses west and produces different coordinates. Use half-open map rectangles and integer tile/block coordinates consistently in production and test.

## Acceptance tests

- Core synthetic graph covers a shown anchor -> hidden gate -> shown singleton chain; hidden intermediary must not stop BFS.
- Geometry pin uses the exact fixture above and asserts full coordinates.
- Obstacle fixture blocks preferred location and asserts spiral picks the nearest free coordinate; zero overlaps.
- Reversing map input order yields byte-identical placement entries. Include all requested map IDs in test output/report.
- Real corpora: GBC IlexForest near AzaleaTown's warp side, DarkCaveVioletEntrance adjacent to its entrance, BurnedTower1F adjacent to EcruteakCity and BurnedTowerB1F adjacent to 1F. GBA three measured dungeon examples above near their entrance-side anchors. Zero overlaps and identical repeated runs for both families.
- Ensure existing manual placements override calculated positions.
- Before adding any real-corpus read/write test, grep every `packages/*/test/**` for the exact target file. D2 tests must not write either external corpus.

## Mutations — reject equivalent tests before pinning

Each mutation must change output or make a required assertion fail: stop BFS at hidden gate (chain fixture); accept overlap (blocked-preference fixture); choose edge by map center instead of warp tile (geometry fixture); reverse/perturb traversal order (input-order equality fixture). Coordinator re-runs survivors on final fix commit using a node harness, exact-once literal anchors, in-memory restore and byte comparison; verify every requested ID ran.

## Existing test impact

At minimum, inspect and report whether these existing GBA expectations change: `packages/server/test/world.test.ts` → `returns placements, components, conflicts and vertical links`, `respects the dungeonAutoLayout flag`, and all world placement geometry assertions. Name every changed existing test and why. D2 must not change unrelated GBA tests. Re-run named baseline failures alone; do not call them regressions unless output still fails for a code reason after isolating the known sidecar state.

## Review/report constraints

Use separate independent spec and quality reviews. D2 spec reviewer must be GPT-6-Astra (highest available substitute for unavailable Opus), explicitly hand-compute the geometry fixture without trusting this report, verify the corpus facts from source, and reject equivalent mutations. Quality reviewer is read-only and inspects only `git show`/`git diff`. Fix round continues the original implementer. Each agent writes full report under this plan's task-report directory, returns one status line plus path, and commits only explicit task paths.

## Environment caveat

The baseline changed the external GBA subject world sidecar hash from the recorded start. Current bytes are documented in `task-D-preflight.md`; don't claim original-state restoration at close-out. Keep any subsequent writes backed up and read-guarded. The GBA subject is outside the writable workspace, so request escalation before writes there.
