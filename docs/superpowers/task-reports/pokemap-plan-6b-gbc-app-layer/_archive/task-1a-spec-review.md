# Plan 6b Task 1a: spec review

Reviewed: `d6532ac` + `b9aff64` (diff vs `32928b2`), branch `plan-6b-gbc-app-layer`, against `task-1a-spec.md`. I re-measured every corpus number from the raw asm/bin files with independent Python probes, not from the code under review. I re-ran all 10 spec mutations plus 21 extra ones on the current commit, ran the four `serve.ts` modes by hand, and ran the full gate.

## Verdict: **compliant-with-fixes**

Every deliverable exists and behaves as specified. All 10 spec mutations are killed, the gate matches the baseline and typecheck is clean.

One Important issue remains: the AzaleaTown half of the roof test rests on a false spec premise ("same tileset"). The implementer changed what the test asserts without recording the change. As written, the test cannot detect a roof swap keyed to the wrong group (mutation E12 survives).

The Minor findings are anchors, branches and normalisation that no test exercises, plus a doc comment that moved to the wrong place.

## What was independently confirmed

| Claim pinned by tests | Raw-file measurement | OK |
|---|---|---|
| 26 groups, `names[0] === "OLIVINE"` | `constants/map_constants.asm`: 26 `newgroup <NAME>` call lines (line 1 is `MACRO newgroup`, line 26 is a comment); first is `OLIVINE` (l.38), last `CHERRYGROVE` | yes |
| NewBarkTown is group 24, `NEW_BARK` | `NEW_BARK_TOWN` follows the 24th `newgroup NEW_BARK` (l.459) | yes |
| 7 out-of-bounds events, by map/kind/index | Independent parse of all 391 `maps/*.asm` (3,701 events) against `map_const` dims ×2: CeruleanCave1F warp 0/1/2 (25,15)/(23,9)/(27,1) in 18×30; CeruleanCave2F warp 0/1/**3** (23,7)/(29,1)/(19,7) in 18×30; GoldenrodPokecenter1F object 1 (16,8) in 10×8. Exactly what the test pins | yes |
| `$00` FLOOR land, `$07` WALL wall, `$29` WATER water, `$24` WHIRLPOOL water+talk, `$02` unnamed land | `collision_constants.asm` + `collision_permissions.asm` rows (`db WATER_TILE \| TALK ; COLL_WHIRLPOOL`, `db LAND_TILE ; 02`) | yes |
| 109 names / 109 distinct values / 256 rows | `grep '^DEF COLL_'` = 109, `sort -u` on values = 109, 256 `db` rows | yes |
| VioletCity block (4,7) = id 24, id 24 contains a `$0A-$12` tile | `maps/VioletCity.blk[7*20+4] = 24`; `johto_metatiles.bin` entry 24 = `10 11 11 11 0d 0e 0e 0e 0d 0e 0e 0e 0a 0b 0b 0b` (all in range); no id-0 blocks in the map | yes |
| VioletCity roof 1, AzaleaTown roof 2, both border 5 | `data/maps/roofs.asm` `MapGroupRoofs[10] = ROOF_VIOLET`, `[8] = ROOF_AZALEA` | yes |
| **AzaleaTown "same tileset"** (spec) | `data/maps/maps.asm:243`: `map AzaleaTown, TILESET_JOHTO_MODERN, …`; VioletCity is `TILESET_JOHTO` | **no, see finding 1** |

Other checks:
- **GBA body.** The `createServer` diff contains only: four import lines, the `PokemapServer` union, the first-statement family branch, the `/api/project` route placed first in the `try`, and `family: "gba"` on the return. There is no reformatting or re-indentation, and `readBody` is still unexported. `gbcRoutes.ts` imports `PokemapServer` with `import type`, so the modules have no runtime cycle.
- **Family isolation.** `detectEngineFamily` throws when both families' markers are present. So a GBA root always reaches the GBA body, and a GBC root always takes the early `return`.
  - `api.test` pins `family: "gba"`.
  - `gbcRoutes.test` pins `s.family === "gbc"` and 404s on `/api/groups` and `/api/map/NewBarkTown`.
  - One side effect: a root that matches neither family now fails with `detectEngineFamily`'s message instead of `openProject`'s. This is implied by the spec, and no test depends on the old wording.
- **The 501 regex** is character-for-character the spec's. Walked branch by branch against every GBA route in `index.ts`: every GBA-only route is covered, and no GBC-bound route (groups, map, render, metatile, encounters, coverage, species, where, world) is refused.
- **`loadGbcCollisionInfo`** follows the spec: category comes from the low nybble, `talk` from `& bits.talk`, a value with no name gives `null`, and a duplicate value throws naming both names. `loadGbcWaterCollisionValues` behaves as before; the water test still passes, and mutation E21 is killed by it.
- **`renderGbcMapMetatile`** makes the same `resolveFromTables(…, { time })` and `roofSwappedTiles(proj, ts, map.tileset, map.group)` calls as `renderGbcMap`, and does no block-0 substitution.
  - `flash` isn't exposed. That matches the spec's signature, and both functions default it identically.
- **`serve.ts`**, run by hand. Each server was killed afterwards, and nothing is left listening on 5174.
  ```
  $ npx tsx packages/server/src/serve.ts --gbc
  pokemap server (gbc) on http://127.0.0.1:5174 for /root/pokemap-corpus/pokecrystal-PerfPlus
  /api/project -> {"family":"gbc","root":"/root/pokemap-corpus/pokecrystal-PerfPlus"}; /api/warps/X -> 501; /api/groups -> 404
  $ npx tsx packages/server/src/serve.ts /home/user/pokemon-three-region
  pokemap server (gba) on http://127.0.0.1:5174 for /home/user/pokemon-three-region
  /api/project -> {"family":"gba","root":"/home/user/pokemon-three-region"}
  $ npx tsx packages/server/src/serve.ts --foo /home/user/pokemon-three-region
  pokemap server (gba) on http://127.0.0.1:5174 for /home/user/pokemon-three-region
  $ npx tsx packages/server/src/serve.ts /root/pokemap-corpus/pokecrystal-PerfPlus    # gbc root, positional
  pokemap server (gbc) on http://127.0.0.1:5174 for /root/pokemap-corpus/pokecrystal-PerfPlus
  $ (tmp cwd, config without "gbc") npx tsx …/serve.ts --gbc
  pokemap.config.json has no "gbc.projectPath"
  exit=1                                   # no stack trace
  ```
- **Verbose run.** All 38 new tests are listed as passed (✓), and none were skipped. PerfPlus is present.
- **Gate.** `npm test` gives `Tests 6 failed | 1309 passed (1315)`. The sorted `^ FAIL ` lines `diff` clean against `baseline-fails.txt`, and `npm run typecheck` is clean.
- **Clean tree.** `git status --short` was clean after every mutation was restored with `git show HEAD:<path>`. The only untracked file is this report.

## Findings

### 1. Important: the AzaleaTown test rests on a false spec premise, the change is unreported, and the test doesn't isolate the group key

**Evidence.**
- The spec says: "The same id on **AzaleaTown** (same tileset, different roof; assert both facts)". But AzaleaTown is `TILESET_JOHTO_MODERN` (`data/maps/maps.asm:243`), while VioletCity is `TILESET_JOHTO`. The two tilesets differ in graphics, metatiles and palette map (`gfx/tilesets.asm:227-235`).
- The test asserts something else instead: that `metatiles[24]` is equal across the two tilesets. That is true; both `.bin` entries for id 24 are identical.
- The implementer's "Deviations" section doesn't mention this. The report also says "No part of the spec was found to be wrong against the real code".
- Because the two maps differ in tileset graphics and in roof palette (`resolveFromTables`: `roofPals[input.group]`), the "differs" assertion is over-determined.
- Mutation **E12** makes `renderGbcMapMetatile` use `roofSwappedTiles(…, 10)` (VioletCity's group) for every map. It **survives**.
- I confirmed that a byte-equality check on a second map would kill E12. With E12 applied, `renderGbcMapMetatile(AzaleaTown, 24)` ≠ the `renderGbcMap(AzaleaTown)` region at block (10,1), and `renderGbcMapMetatile(MahoganyTown, 24)` ≠ the region at block (5,2). Without the mutation both are equal.

**Fix.**
- (a) Add a byte-equality test on a second, different-roof map. Two candidates, both measured:
  - AzaleaTown: block (10,1), id 24, group 8, roof 2;
  - MahoganyTown: `TILESET_JOHTO`, `TOWN`, group 2, roof 2, block (5,2), id 24.
- (b) Make the "differ" pair honest, in one of two ways:
  - assert the true facts (`violet.tileset === "TILESET_JOHTO"`, `azalea.tileset === "TILESET_JOHTO_MODERN"`, roofs 1 ≠ 2), and reword the test title and comment;
  - or switch the pair to MahoganyTown, where "same tileset, different roof" really holds, and assert `violet.tileset === mahogany.tileset`.
- (c) Record the deviation in the implementer report.

### 2. Minor: only one of the 501 regex's anchors is proven

**Evidence.** The spec's three near-misses test `world/placement$` and nothing else anchored: `/api/worldx` can't match any alternative, whatever the anchors. The following mutations all **survive**:
- E1: `dungeons(\/|$)` → `dungeons`;
- E2: drop the `$` on `world/dungeons`;
- E3: drop the `$` on `icon\.png`;
- E4: `[^/]+` → `.+`;
- E5: drop the leading `^`.

**Fix.** Add 404 near-misses:
- `/api/dungeonsx`;
- `/api/world/dungeonsx`;
- `/api/species/CHIKORITA/icon.pngx`;
- `/api/species/A/B/icon.png`;
- `/x/api/warps/y`.

### 3. Minor: `loadGbcCollisionInfo`'s talk-on-wall case and the unknown-nybble refusal are untested

**Evidence.**
- E6 changes `talk` to `category === "water" && …` (talk only on water). It **survives**: the only `talk: true` pin is WHIRLPOOL, a water value.
- E7 replaces the unknown-nybble `throw` with a silent `"wall"`. It **survives**. The spec says "Any other low nybble throws, naming the value".

**Fix.**
- Pin `info.get(0x12)` to `{ name: "COLL_CUT_TREE", category: "wall", talk: true }`. The raw row is `db WALL_TILE | TALK ; COLL_CUT_TREE`.
- Add a tmp-dir fixture test like the duplicate-value one:
  - bits `LAND $00 / WATER $01 / WALL $0e / TALK $10`;
  - one row `db WATER_TILE | WALL_TILE`, whose low nybble is `$0f`, and 255 `db LAND_TILE` rows;
  - expect a throw matching `/value 0\b/` and `/\$f/`.

### 4. Minor: the negative-y branch of `outOfBoundsEventDefects` is untested, and the mutation table misattributes #7

**Evidence.**
- E8 drops `e.y < 0`. It **survives**: the only negative case is `x: -1`.
- The implementer's table says mutation 7 (`>=`→`>`) was caught by "the boundary test and the 7-event corpus count test". In my run the corpus test stays green under #7, because no corpus event sits exactly on `x == 2w` or `y == 2h`. The two failures were the unit tests:
  - `flags a warp at x >= 2*width…`;
  - `flags a coord event at y >= 2*height…`.

**Fix.**
- Add a negative-y case, e.g. an object at `(0,-1)`, asserting the pinned message.
- Correct the table row.

### 5. Minor: the root-normalisation tests can't tell `proj.root` from the raw input

**Evidence.**
- `GBC_SUBJECT_ROOT` and `SUBJECT_ROOT` have no trailing slash and no backslashes, so `norm(x) === x`.
- E9 makes the GBC `/api/project` return `opts.projectPath`. It **survives**.
- E10 does the same on the GBA side. It **survives**.
- The spec asked to "Check what `project.paths.root` actually holds". It holds `norm(root)`, but no test proves the route uses it.

**Fix.**
- In `gbcRoutes.test.ts`, create a second server with `projectPath: GBC_SUBJECT_ROOT + "/"` on port 0, close it in the same test, and assert `root === openGbcProject(GBC_SUBJECT_ROOT).root` (no trailing slash).
- Optionally do the same for GBA in `api.test.ts`. That costs one extra `openProject`.

### 6. Minor: `loadGbcMapEvents` lost its JSDoc

**Evidence.**
- In `packages/core/src/gbc/load/events.ts` (~l.186-199), the new code was inserted between `loadGbcMapEvents`'s existing doc block ("Reads and parses a map's `maps/<map.name>.asm` … 40 maps … normal.") and the function. That block now dangles above `POSITIONED_KINDS`, which also has its own second JSDoc.
- That second JSDoc ("One `(kind, index)` pair alongside its event") doesn't describe a list of kind keys.

**Fix.**
- Move `POSITIONED_KINDS` and `outOfBoundsEventDefects` above the `loadGbcMapEvents` doc block, so each doc block sits directly on its own declaration.
- Reword the constant's comment to "the four positioned `GbcMapEvents` kinds, walked in this order".

### 7. Minor: VioletCity block (4,7)'s raw id isn't asserted directly

**Evidence.**
- The spec says to pick a non-ring block with a non-zero raw id whose metatile contains a `$0A-$12` tile, and "Assert that in the test".
- The test asserts the tile containment (`metatiles[24].tiles` contains `0x10`). It hard-codes id 24 for (4,7) and relies on byte-equality to catch a mismatch implicitly.

**Fix.** Add `expect(proj.layout(map).layout.blocks[7 * map.width + 4]!.metatileId).toBe(24)`. This is non-zero and pins the choice of block.

### 8. Minor: `loadCollisionTables`'s doc comment overclaims

**Evidence.**
- The comment says both files are "read and parsed exactly once each", and that this is "the one place a caller-added third reader of these files would have to hook into".
- But `loadGbcTileset` (`tileset.ts` ~l.426) still reads `constants/collision_constants.asm` itself. The spec only asked to share the water/info pair, so this is compliant; only the comment is wrong.
- A related side effect: `loadGbcWaterCollisionValues` now also runs `parseCollisionConstants`. A malformed `COLL_*` value (`parseNum` throw) would now break it where it didn't before. This is theoretical; `loadGbcTileset` would already throw on the same file.

**Fix.** Reword the comment to "shared by `loadGbcWaterCollisionValues` and `loadGbcCollisionInfo`; `loadGbcTileset` still reads the constants file separately".

### 9. Minor: implementer report omissions

**Evidence.**
- The spec says "JSON has no comments, so record that in the report": the `server` and `server-gbc` launch configs are alternatives on port 5174 and can't run at once. The report only says "both port 5174".
- The finding 1 deviation and the finding 4 misattribution are also missing from the report.

**Fix.** Add a line on launch.json mutual exclusivity, plus the two corrections.

Not a finding: `serve.ts` has no automated test (the spec made one optional). Any `serve.ts` mutation survives by construction, and the manual runs above stand in for it.

## Mutation results (current commit, re-run by this reviewer)

Spec mutations 1-10: **all killed**.

| # | Mutation | Killed by |
|---|---|---|
| 1 | drop the GBC branch | `gbcRoutes.test` `beforeAll` throws (suite errors) |
| 2 | 501→404 | `gbcRoutes.test`, all 8 refusal cases |
| 3 | drop `$` on `world/placement` | `/api/world/placementx is a 404` |
| 4 | macro-skip removed (`text.split`) | `skips a MACRO newgroup…ENDM definition…` |
| 5 | swap water/wall | land/water/wall pin + WHIRLPOOL |
| 6 | talk always false | WHIRLPOOL |
| 7 | `>=`→`>` | warp `x >= 2*width` unit + coord boundary unit (**not** the corpus test) |
| 8 | drop the roof swap | VioletCity byte-equality + nite byte-equality |
| 9 | block-0→border substitution | `does NOT substitute block id 0…` |
| 10 | GBC `/api/project` says gba | `GET /api/project reports the gbc family…` |

Extra mutations killed (for the record): E11 (metatile ignores `time`), E13 (duplicate name, last one wins), E14 (mask `0x1f`), E15 (empty `newgroup` pushed), E16 (drop the `coords` kind), E17 (no `groupNames` cache), E18 (GBA `/api/project` says gbc), E19 (`PokemapServer.family` gba on the GBC branch), E20 (`renderGbcMapMetatile` ignores `mapName`), E21 (the water-values mask selects wall).

### Surviving mutations (re-run after fixes)

| ID | File | Mutation | Fix that should kill it |
|---|---|---|---|
| E1 | `server/src/gbcRoutes.ts` | `dungeons(\/\|$)` → `dungeons` | F2: `/api/dungeonsx` → 404 |
| E2 | `server/src/gbcRoutes.ts` | `world\/dungeons$` → `world\/dungeons` | F2: `/api/world/dungeonsx` → 404 |
| E3 | `server/src/gbcRoutes.ts` | `icon\.png$` → `icon\.png` | F2: `/api/species/CHIKORITA/icon.pngx` → 404 |
| E4 | `server/src/gbcRoutes.ts` | `species\/[^/]+` → `species\/.+` | F2: `/api/species/A/B/icon.png` → 404 |
| E5 | `server/src/gbcRoutes.ts` | drop the leading `^` | F2: `/x/api/warps/y` → 404 |
| E6 | `core/src/gbc/load/tileset.ts` | `talk: category === "water" && (v & bits.talk) !== 0` | F3: `$12` COLL_CUT_TREE wall+talk pin |
| E7 | `core/src/gbc/load/tileset.ts` | unknown nybble → `category = "wall"`, no throw | F3: unknown-nybble fixture throws |
| E8 | `core/src/gbc/load/events.ts` | drop `e.y < 0` | F4: negative-y case |
| E9 | `server/src/gbcRoutes.ts` | `root: proj.root` → `root: opts.projectPath` | F5: trailing-slash root test |
| E10 | `server/src/index.ts` | `root: project.paths.root` → `root: opts.projectPath` | F5 (GBA half, optional) |
| E12 | `core/src/gbc/render/map.ts` (`renderGbcMapMetatile`) | `roofSwappedTiles(proj, ts, map.tileset, 10)` | F1: second-map byte-equality (AzaleaTown (10,1) or MahoganyTown (5,2)) |

Harness: `/tmp/claude-0/-home-user/4cae0c11-1686-58ef-8391-8711e19c1398/scratchpad/mut.py`. It applies each mutation to `git show HEAD:<path>`, runs the targeted test file(s) with `--reporter=verbose`, and restores from `HEAD`. Log: `…/scratchpad/mut.log`. Pass mutation IDs as arguments to re-run a subset, e.g. `python3 mut.py E1 E2 E12`.
