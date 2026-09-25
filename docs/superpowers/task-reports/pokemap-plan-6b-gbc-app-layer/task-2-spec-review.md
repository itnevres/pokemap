# Plan 6b Task 2: spec review

**Reviewed:** `c5b386d` (normalizeGbcSpecies move) and `e7142f4` (the five routes and their tests), diffed against `0227b76`, on `plan-6b-gbc-app-layer`, against `task-2-spec.md` and plan Q2/Q3 and Tasks 5-6.

## Verdict: PASS (spec-compliant). No Critical or Important findings. There are 6 Minor findings, all optional test hardening or doc accuracy.

The measured corpus facts below come from my own Python scripts over the raw asm, not from the code under review. Scripts are in `/tmp/claude-0/-home-user/4cae0c11-1686-58ef-8391-8711e19c1398/scratchpad/t2rev/`.

| Pinned value | Independent derivation | Result |
|---|---|---|
| 326 components; multi-map sizes 35/31/2; 323 singletons | `world.py`: union-find over the 142 `connection` lines in `data/maps/attributes.asm` (391 `map_attributes`) | **confirmed** |
| 2 conflicts, on Route17 and Route18 | `world.py`: BFS positions from `map_const` dims plus connection offsets, then every directed edge re-checked. The only inconsistent edge is Route17<->Route18 (`attributes.asm:278` `west, Route17, -38` vs `:283` `east, Route18, 38`), which disagrees by 1 block in y, once seen from each end. Core output: Route18 via Route17 (40,87) vs FuchsiaCity (40,88); Route17 via Route18 (30,50) vs Route16 (30,49). Same 1-block delta. | **confirmed** |
| NewBarkTown 10x9 | `constants/map_constants.asm` `map_const NEW_BARK_TOWN, 10, 9` | **confirmed** |
| DUNSPARCE: 6 hits, all DarkCaveVioletEntrance | grep of `data/wild/`: 3 in `johto_grass.asm:1189/1197/1205` (DARK_CAVE_VIOLET_ENTRANCE morn/day/nite) and 3 time-blocks in `swarm_grass.asm` (Dunsparce swarm, same map). None in water, fish or treemons. | **confirmed** |
| 251 species | `constants/pokemon_constants.asm`, first `const_def` block: 252 `const` minus NO_MON and EGG. CHIKORITA is present. | **confirmed** |
| coverage 125 / 70 unused | `coverage.py`: grass, water, swarm, treemon and fish from raw asm. The fish-reachability filter is computed independently (TileCollisionTable `WATER_TILE`, then tileset `tilecoll`, then metatile ids used in each `.blk`). My first pass gave 126: I had missed that `GetTreeMons` (`engine/events/treemons.asm:103-104`, `and a / jr z, .quit`) makes TREEMON_SET_CITY (index 0) yield nothing, so MahoganyTown drops out. After applying that engine rule the result is 125 maps and 70 unused species, set-identical to the CLI's `unusedSpecies`. The `fishGroupWithoutWater` set (319) is also identical. | **confirmed** |
| Route29: 5 sources; morn PIDGEY 45% (2-7) | `johto_grass.asm:1237-1263`: morn slots 0 and 2 are PIDGEY, 25% + 20% (`probabilities.asm` GrassMonProbTable) = 45%. Levels are 2 and 3, and the +4 buff gives a max of 7. No ROUTE_29 in `johto_water.asm`. `treemon_maps.asm:10` is TREEMON_SET_ROUTE (common+rare). FISHGROUP_SHORE is filtered because there is no water tile. That makes 3 + 2 = 5 sources. | **confirmed** |

Across all 800 sources in the corpus (grass 288, water 62, fish 340, headbutt 106, rock 4), every source's chance percents sum to 100 ± 0.05 (`sums.ts`).

### Spec checklist

- **Deliverable 1 (normalizeGbcSpecies):**
  - The body is textually identical to the removed `normalizeSpecies`, so CLI behaviour is byte-identical by construction.
  - `packages/cli/test/**` is untouched (`git diff --stat 0227b76 HEAD -- packages/cli/test` is empty) and green in the gate.
  - The 4 core unit tests are present.
- **Deliverable 2 (wire.ts):**
  - Types only. Imports go through `./world/connections.js` (which re-exports the GBA `Placement`/`Component`/`Conflict`) and `./analyse/atlas.js`.
  - `satisfies` is used by both builders.
- **Deliverable 3 (routes):**
  - All five routes sit ahead of `GBA_ONLY_ROUTE_RE` and the 404, and exact-match `/api/world` and `/api/species`.
  - The encounters route matches `(.+)`, then `decodeMapName` (400), then `mapNames` (404), then the builder.
  - The where route matches `([^/]+)`, then decodes, then `normalizeGbcSpecies`. It returns a bare array and is not cached.
  - World, coverage and species are cached lazily once (`??=`).
  - No request mutates a cached object. The builder only reads `world`, and `send` only calls `JSON.stringify`. Mutations 13, 14 and 15 below confirm this.
- **Live check** (I started the server, then killed it; port 5174 is confirmed free):

  | Request | Status |
  |---|---|
  | `/api/world?dungeons=0` | 200 |
  | `/api/encounters/%E0%A4%A` | 400 |
  | `/api/encounters/NoSuchMap` | 404 |
  | `/api/where/species_dunsparce` | 200, 6 hits |
  | `/api/where/DUNSPARCE/x` | 404 |
  | `/api/where/NOTAMON` | 200, `[]` |
  | `/api/species/CHIKORITA/icon.png` | 501 |
  | `/api/world/placement` | 501 |

- **Tests:**
  - Every spec bullet is present. The 18 new `it`s plus 4 core tests make +22, which matches the implementer's count.
  - `--reporter=verbose` shows every Task 2 test ran; none were skipped (PerfPlus is present).
- **Gate:**
  - `npm test` gives 6 failed / 1369 passed (1375). `grep -E "^ FAIL " | sort -u` diffed against `baseline-fails.txt` is empty.
  - `npm run typecheck` is clean.
  - Log: `/tmp/claude-0/-home-user/4cae0c11-1686-58ef-8391-8711e19c1398/scratchpad/t2-review.log`.

### The implementer's deviations

1. **`buildGbcWorldPayload(world)` instead of `(proj, world)`: acceptable.** Nothing in it reads `proj`. The spec's signature list was illustrative ("and so on"), and a dead parameter would be worse.
2. **`decodeMapName` on `/api/where`: acceptable, and arguably what the spec meant.** The spec says "Capture with `([^/]+)` ... and decode". Decoding through the file's guarded helper (400 on a malformed escape rather than a bare 500) follows the file's own documented convention for `:name` captures. The error text `malformed species <raw>` is accurate. It is tested and was killed by my mutation 19.

### Downstream consumers (Tasks 5-6): the payloads are sufficient

- **GbcWorldCanvas (Task 5):**
  - `placements[name]` carries `x, y, width, height` (blocks) and `component`.
  - `components[]` carries `index, maps, bounds`, so the "fit to multi-map components only" filter is `maps.length > 1` and can use `bounds` directly.
  - `conflicts[]` carries `map, viaA{from,x,y}, viaB{from,x,y}`. That is exactly what the CLI's `noteLines` wording needs (`gbcCommands.ts:37`: `${viaA.x - viaB.x},${viaA.y - viaB.y}`).
  - `blockPx: 32` is on the wire.
- **GbcEncounterGutter and the method lens (Task 6):**
  - Every source carries `method` plus the optional `time`/`rod`/`list`/`conditional` tags, true `percent` in each chance, and `encounterRate`/`biteChance`.
  - Route32 live output shows the full tag space: grass morn/day/nite; water; fish old (untagged), good/super day/nite; the ×2 swarm variants; headbutt common/rare.
  - Q3 note for Task 6's brief: **old-rod fish sources carry no `time` tag at all.** Only good and super rods are split day/nite. Q3's "untagged sources always show" rule already covers this, but Q3's sentence "Fishing sources carry only `day`/`nite`" is slightly loose.
  - The method lens can reuse the per-map encounters cache as GBA does, since `GbcCoverage` has no per-map methods, only `sourcesByMethod` totals.
- **LensPanel:**
  - `levelByMap: {mapName, averageLevel}[]` is keyed by name, unlike GBA's `mapId`. The GBC canvas must read `mapName`, as the plan says.
  - `mapsWithoutEncounters` (names) and `unusedSpecies` feed `emptyMaps` and `unusedSpecies` directly.
- **SpeciesSpotlight:**
  - Its mount fetch `/api/species` gets a 200 `string[]` of bare names. The current matcher (`SpeciesSpotlight.tsx:108-113`) prefixes the query with `SPECIES_`, so it matches nothing, as the plan says. Once Task 6 strips `SPECIES_` from both sides, the bare list matches.
  - `pick()`'s `replace(/^SPECIES_/i, "")` is a no-op on bare names. `/api/where/${encodeURIComponent(bare)}` then returns a 200 array whose hits carry `mapName`, `percent`, `minLevel` and `maxLevel`, which is everything `mapCount` and a `spotlightByMap`-style dedupe read.
  - Typed partials (`"pid"`) get 200 `[]`, the same as GBA. Both the `!r.ok` gate and the array shape hold.

### Timing: the "gbcCoverage ~100-150 ms" figure is a cold project-load cost, not coverage's cost

My runs (`timing.ts`, 3 fresh projects):

| Call | Time |
|---|---|
| `gbcCoverage`, cold on a fresh `openGbcProject` | 103-150 ms |
| `gbcCoverage`, warm on the same project | 13-19 ms |
| `buildGbcWorld` | 1.4-2.6 ms |
| `gbcWhereSpecies`, warm | 10-14 ms |
| `gbcWhereSpecies`, cold (first call on a fresh project) | **129 ms** |
| `gbcCoverage` right after that cold `where` | 18 ms |

- So the ~100+ ms is the project's own lazy loads (wild data, tilesets, per-map water-tile scans). Whichever of where or coverage runs first pays it.
- The live server shows the same pattern: the first `/api/where` took 145 ms, and the `/api/coverage` after it took 18 ms.
- The plan review's "11 ms" was a warm figure, and warm coverage today is about 13-19 ms, so there is no real discrepancy.
- It does not matter for the design. Coverage is cached once; the cold cost is paid once per process regardless; where stays uncached, as the spec requires.

## Findings

### Minor

**1. The "gbcCoverage is ~100-150 ms" claim misattributes a one-time cold project-load cost.**
- It appears in the `gbcRoutes.ts` comment above `coverageCache` and in the implementer report's Measured numbers and Deviation 3.
- Evidence: see the timing table above.
- Fix: reword the comment to "~15 ms warm; the first where/coverage/encounters request on a fresh project also pays ~100-150 ms of one-time lazy project loading". Also correct the report.

**2. The `/api/world` HTTP test deep-equals only `placements`.**
- `components` is checked only by count and sizes, and `conflicts` only by `.map`.
- The fields Task 5 consumes (`components[].bounds` for the fit, `conflicts[].viaA/viaB` for the badge tooltip) are pinned only by the builder unit test, not end to end. My route-level mutation 22 survives: it zeroes the bounds and overwrites `viaA` with `viaB`.
- Fix: in the first world test, add `expect(body.components).toEqual(world.components); expect(body.conflicts).toEqual(world.conflicts);`. Optionally pin the Route17 conflict literally: `{ map: "Route17", viaA: { from: "Route18", x: 30, y: 50 }, viaB: { from: "Route16", x: 30, y: 49 } }`, re-derived above from `attributes.asm:278/283`.

**3. The spec says `/api/world` ignores query params, but no test pins it.**
- Mutation 18 survives: matching `req.url === "/api/world"` makes `/api/world?dungeons=0` a 404.
- Fix: add `expect(await (await get("/api/world?dungeons=0")).json()).toEqual(await (await get("/api/world")).json())`.

**4. `/api/where`'s one-segment capture `([^/]+)` is not pinned.**
- Mutation 9 survives: widening it to `(.+)` turns `/api/where/DUNSPARCE/x` from a 404 into a 200 `[]`.
- Fix: add a near-miss test `/api/where/DUNSPARCE/x` → 404.

**5. The percent-sum check covers only Route29, so its water branch never runs.**
- Route29 has no water source, so the `s.method === "water"` branch is vacuous.
- Fix: run the same loop over a map with water, e.g. Route32 (grass, water, fish, headbutt), or over every map through `buildGbcEncountersPayload`. All 800 sources pass today.

**6. Stale or wrong comments.**
- (a) `packages/cli/src/index.ts:251` still says "runGbcWhere's own normalizeSpecies". It should say `normalizeGbcSpecies` (in core).
- (b) The Route29 test comment in `gbcRoutes.test.ts` says `db 2, PIDGEY` is "weight 2 of the section's 7-slot total". The 2 is the **level**. The 45% comes from slots 0 and 2 (25% + 20%, GrassMonProbTable), and the max level 7 is 3 plus the +4 buff.
- Fix: correct both comments. Neither changes behaviour.

## Mutation results

**Harness:** `/tmp/claude-0/-home-user/4cae0c11-1686-58ef-8391-8711e19c1398/scratchpad/t2rev/mutate.py`.
- It applies each mutation as an exact string replacement, runs `gbcRoutes.test.ts`, `atlas.test.ts` and `gbcCommands.test.ts` with `--reporter=verbose` (0 skipped in every run), then restores the file from `git show HEAD:<path>` and asserts `git status --short -- <path>` is empty.
- Re-run with `cd /home/user/pokemap && python3 /tmp/claude-0/-home-user/4cae0c11-1686-58ef-8391-8711e19c1398/scratchpad/t2rev/mutate.py [ids...]`.
- Log: `.../t2rev/mutations.log`.

**The implementer's 8, re-run: all KILLED.**

| # | Mutation | Killed by |
|---|---|---|
| 1 | Where without normalisation | the DUNSPARCE/dunsparce/SPECIES_ test |
| 2 | Prefix-check before uppercasing | the core `species_dunsparce` test only (no HTTP test sends lower-case `species_`; acceptable, one implementation) |
| 3 | `placements: []` | the world deep-equal test and the builder unit test |
| 3b | Raw `Map` | the world deep-equal test and the builder unit test |
| 4 | `conflicts: []` | the conflicts test and the builder unit test |
| 5 | `name.toLowerCase()` | 4 encounters tests (a 500) |
| 6 | Unknown map returns 200 `[]` | the 404 test |
| 7 | EGG not excluded | the core tests and the server species and coverage tests |
| 8 | `startsWith("/api/species")` | the icon 501 test and the 2 near-miss tests |

**Extra mutations: KILLED.**

| # | Mutation | Killed by |
|---|---|---|
| 13 | Pop the coverage cache after each send | the coverage second-request test |
| 14 | Push onto the species cache after each send | the species length test |
| 15 | Pop world conflicts after each send | the conflicts test |
| 16 | `defects: []` | the defects test and the builder unit test |
| 17 | `/api/world` as a prefix | the 501 and near-miss tests |
| 19 | No decode on where | the where 400 test |
| 20 | `toUpperCase()` only | the SPECIES_DUNSPARCE test |
| 21 | Builder zeroes component bounds | the builder unit test |
| 23 | Species list reversed | the sorted test |
| 25 | Coverage `fishGroupWithoutWater: []` | the coverage deep-equal test |

**Surviving mutations:**

| # | Mutation (file) | Why it survives | Disposition |
|---|---|---|---|
| 9 | where regex `([^/]+)` → `(.+)` (gbcRoutes.ts) | no multi-segment near-miss test | Minor 4, add the test |
| 10 | world cache removed (`??=` → `=`) | caching is not observable over HTTP; results are identical | accept (performance only; ~2 ms) |
| 11 | coverage cache removed | same as 10 | accept (costs ~15 ms warm per request); a spy test is possible but not worth it |
| 12 | species cache removed | same as 10 | accept (costs one file read) |
| 18 | `/api/world` matched on `req.url` (query string breaks it) | query-param tolerance is untested | Minor 3, add the test |
| 22 | route tampers `components[].bounds` and `conflicts[].viaA` after the builder | the HTTP test doesn't deep-equal components or conflicts | Minor 2, add the deep-equals |
| 24 | `normalizeGbcSpecies` strips `SPECIES_` anywhere (`replace`) | equivalent on the real input space: no species constant contains `SPECIES_` | accept (equivalent mutant) |

At the end, `git status --short` was clean except for this report.
