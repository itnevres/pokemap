# Plan 6b Task 1a: implementer report

Executed against `docs/superpowers/task-reports/pokemap-plan-6b-gbc-app-layer/task-1a-spec.md`, on branch `plan-6b-gbc-app-layer`, working directly in the repo (no worktree).

## What was built

**Core (additive only):**
- `packages/core/src/family.ts`: `ProjectInfo` (`{ family: EngineFamily; root: string }`), next to `EngineFamily` (Q1/finding 10).
- `packages/core/src/gbc/wire.ts` (new, types only): `GbcCollisionCategory`, `GbcCollisionInfoEntry`, `GbcMapPayload`. `loadGbcCollisionInfo`'s value type is `GbcCollisionInfoEntry`, declared once.
- `packages/core/src/gbc/load/map.ts`: `parseMapGroupNames(text, source)` and `loadGbcGroupNames(root)` -- index `i` holds group `i+1`'s `newgroup` name. Skips the `MACRO newgroup...ENDM` definition via the existing `stripMacroDefs`/`matchCall` pattern; throws (naming `source`) on a `newgroup` with no argument.
- `packages/core/src/gbc/load/tileset.ts`: `loadGbcCollisionInfo(root)`, covering all 256 raw collision values (name/category/talk). Factored the shared `constants/collision_constants.asm` + `data/collision/collision_permissions.asm` reads into a new internal `loadCollisionTables` helper, used by both `loadGbcCollisionInfo` and the existing `loadGbcWaterCollisionValues` (whose own signature/behaviour/tests are unchanged).
- `packages/core/src/gbc/load/events.ts`: `outOfBoundsEventDefects(map, events)` -- pure, walks warps/coords/bgs/objects against the `2w x 2h` step grid.
- `packages/core/src/gbc/project.ts`: lazily cached `groupNames()`/`collisionInfo()`, following the `paddingWidth`/`waterCollisionValues` pattern.
- `packages/core/src/gbc/render/map.ts`: `renderGbcMapMetatile(proj, mapName, metatileId, { time })` -- same `resolveFromTables`/`roofSwappedTiles` pipeline as `renderGbcMap`, no block-0 substitution, out-of-range id returns the existing placeholder raster.
- Existing `GbcProject` test stubs in `atlas.test.ts`, `render/map.test.ts`, `world/connections.test.ts` gained the two new interface methods (structural typing requires it; each throws `unused` if a test path reaches it by mistake, matching those files' existing convention).

**Server:**
- `packages/server/src/index.ts`: `PokemapServer` is now `{ ...; family: "gba"; project: Project } | { ...; family: "gbc"; project: GbcProject }`. `createServer`'s first statement branches to `createGbcServer` for a `gbc` root. The GBA body is otherwise byte-for-byte unchanged except: the new `GET /api/project` route (added first, before `/api/groups`) and `family: "gba"` on the return value. `readBody` was already unexported; no change needed there (finding 8).
- `packages/server/src/gbcRoutes.ts` (new): `createGbcServer` -- `GET /api/project`, a single anchored regex refusing every GBA-only route family (`warps/*`, `dungeons(/*|$)`, `world/placement$`, `world/dungeons$`, `sign/*`, `edit/*`, `species/:s/icon.png$`) with 501 and a named message, everything else 404. Own 4-line `send` closure, same try/catch/500 discipline as the GBA handler. Header comment names it as the server counterpart of `cli/src/gbcCommands.ts` and what Tasks 1b/2/Plan 7 add.
- `packages/server/src/serve.ts`: `--gbc` reads `cfg.gbc.projectPath`, refusing by name (stderr line, `process.exitCode = 1`, no thrown stack trace) when that block is missing. Otherwise the root is the first `argv` entry after the script that doesn't start with `--`, falling back to `cfg.projectPath`. The startup line now names the family from the server's own return value: `pokemap server (<family>) on http://... for <root>`.
- `packages/cli/src/context.ts`: `resolveRoot`'s doc comment now notes `serve.ts --gbc` as the one sanctioned non-test reader of `gbc.projectPath`, and why it differs from the CLI's own "never a CLI fallback" posture.
- `.claude/launch.json`: added `server` (`npx tsx packages/server/src/serve.ts`) and `server-gbc` (same, `--gbc` appended), both port 5174.

**Tests:**
- `packages/core/test/gbc/load/map.test.ts`: `parseMapGroupNames` (3 tests: order/naming, macro-skip with a discriminating fixture, no-argument throw) and `loadGbcGroupNames` (2 corpus tests: 26 groups / `names[0] === "OLIVINE"` / cross-checked against `max(GbcMap.group)`; NewBarkTown's group name).
- `packages/core/test/gbc/load/tileset.test.ts`: `loadGbcCollisionInfo` (3 corpus tests: land/water/wall pins, `COLL_WHIRLPOOL` water+talk, an unnamed value; 1 unit test: duplicate-value fixture throws naming both names).
- `packages/core/test/gbc/load/events.test.ts`: `outOfBoundsEventDefects` (5 unit tests: empty/in-bounds, one out-of-bounds per axis and per kind, boundary exactness, per-kind independent indexing; 1 corpus test: all 7 real events, pinned by map/kind/index/message).
- `packages/core/test/gbc/render/map.test.ts`: `renderGbcMapMetatile` (5 corpus tests: VioletCity byte-equality against `renderGbcMap`, VioletCity-vs-AzaleaTown difference with both discriminating facts asserted, nite byte-equality + nite-vs-day difference, no block-0 substitution, out-of-range placeholder).
- `packages/core/test/gbc/project.test.ts`: `groupNames()`/`collisionInfo()` caching (1 corpus test).
- `packages/server/test/api.test.ts`: `GET /api/project` pins `{ family: "gba", root: norm(SUBJECT_ROOT) }`.
- `packages/server/test/gbcRoutes.test.ts` (new, 16 tests): `/api/project`, `PokemapServer.family === "gbc"`, all 8 GBA-only-route 501 branches with exact messages, plain 404, 3 near-miss regex-anchor proofs (`/api/worldx`, `/api/world/placementx`, `/api/species`), `/api/map/NewBarkTown` 404 (proves the GBC handler answered), `/api/groups` 404 (GBA-only route not served by GBA code).

## Commit SHAs

- `d6532ac` -- `feat(core): add GBC group names, collision info, out-of-bounds event defects, and map-keyed metatile render`
- `b9aff64` -- `feat(server): branch createServer by engine family, add /api/project and gbcRoutes.ts`

## Test counts

- Before: `npm test` = 1271 passing, 6 known failures (baseline).
- After: 1309 passing, same 6 known failures. **+38 new tests**, all passing:
  - `map.test.ts` +5, `tileset.test.ts` +4, `events.test.ts` +6, `render/map.test.ts` +5, `project.test.ts` +1 (core, 21 total)
  - `api.test.ts` +1, `gbcRoutes.test.ts` +16 (server, 17 total)

## Gate result

```
npm test 2>&1 | tee .../t1a-test-final.log
grep -E "^ FAIL " t1a-test-final.log | sort -u
```
matches `docs/superpowers/task-reports/pokemap-plan-6b-gbc-app-layer/baseline-fails.txt` **exactly** (verified with `diff`, no output):
```
 FAIL  packages/core/test/config/engine.test.ts > engineProfile > parses pokefirered's real porymap.project.cfg
 FAIL  packages/core/test/config/engine.test.ts > engineProfile > parses the subject repo's real porymap.project.cfg
 FAIL  packages/core/test/load/blocks.test.ts > parseBlocks > encodeBlocks is the exact inverse of parseBlocks, every layout, both files
 FAIL  packages/core/test/load/blocks.test.ts > parseBlocks > the three fields are independent -- a wrong shift moves them together
 FAIL  packages/core/test/render/layout.test.ts > renderLayout > supportsLayoutVersion survives a Porymap save that deletes layout_version keys
 FAIL  packages/server/test/world.test.ts > world api > manual is true iff the map name is a key in sidecar.manualPlacements, for every placement (Feature A)
```
Pass count: `Tests 6 failed | 1309 passed (1315)` -- 1271 + 38 = 1309. ✓

`npm run typecheck` (`tsc --noEmit` on both `tsconfig.base.json` and `packages/ui/tsconfig.json`): clean, no output.

## Mutation table

Every mutation below was applied to the real source, confirmed red with the targeted test file, then restored from the in-memory original (re-typed by hand back to the exact original text) and re-verified green; `git diff <file>` was empty (core files, already committed at that point) or the file was re-read in full (`gbcRoutes.ts`, not yet committed) to confirm exact restoration before continuing.

| # | Mutation | File | Test(s) that caught it |
|---|---|---|---|
| 1 | Drop the GBC branch in `createServer` | `server/src/index.ts` | `gbcRoutes.test.ts` -- entire suite fails in `beforeAll` (`openProject` throws "does not look like a decomp project root") |
| 2 | Serve the 501s as 404 | `server/src/gbcRoutes.ts` | `gbcRoutes.test.ts` -- all 8 GBA-only-route cases (`expected 404 to be 501`) |
| 3 | Remove the `$` anchor in `world/placement$` | `server/src/gbcRoutes.ts` | `gbcRoutes.test.ts` -- "`/api/world/placementx` is a 404" (near-miss test) |
| 4 | Make `parseMapGroupNames` count the `MACRO newgroup` line | `core/src/gbc/load/map.ts` | `map.test.ts` -- "skips a MACRO newgroup...ENDM definition, even one whose body itself contains a newgroup-shaped line" (`["BOGUS","FOO","BAR"]` vs `["FOO","BAR"]`) |
| 5 | Swap `water` and `wall` in the category mapping | `core/src/gbc/load/tileset.ts` | `tileset.test.ts` -- `loadGbcCollisionInfo`'s land/water/wall pin test and the `COLL_WHIRLPOOL` test (2 failures) |
| 6 | Make `talk` always `false` | `core/src/gbc/load/tileset.ts` | `tileset.test.ts` -- `COLL_WHIRLPOOL` water+talk test |
| 7 | Change `>=` to `>` in the out-of-bounds check | `core/src/gbc/load/events.ts` | `events.test.ts` -- the boundary test (`y === 2*height` no longer flagged) and the 7-event corpus count test (2 failures) |
| 8 | Drop the roof swap in `renderGbcMapMetatile` | `core/src/gbc/render/map.ts` | `render/map.test.ts` -- VioletCity byte-equality (day) and nite byte-equality tests (2 failures) |
| 9 | Apply the block-0 -> border substitution in `renderGbcMapMetatile` | `core/src/gbc/render/map.ts` | `render/map.test.ts` -- "does NOT substitute block id 0..." test |
| 10 | Return the GBA family string from the GBC `/api/project` | `server/src/gbcRoutes.ts` | `gbcRoutes.test.ts` -- "GET /api/project reports the gbc family..." |

Note on #4 and #9: the plan review (finding 6) and the spec both flag that a naive test fixture can fail to discriminate a real bug (NewBarkTown's roof swap is a measured no-op; a plain "skip the macro" fixture with no real `newgroup`-shaped call inside the macro body would pass even with the macro-skip removed). Both fixtures above were deliberately built to discriminate: the macro-skip test's fake `MACRO newgroup...ENDM` body contains a real `newgroup BOGUS` line, and the block-0 test picks VioletCity (`border: 5`) specifically because metatile 0 and metatile 5 are pixel-distinct there. Mutation #9 in particular has no corresponding line item under the spec's own "Tests" bullets for `renderGbcMapMetatile` -- it was added because the spec's mutation-check list requires it to be caught by *something*.

## `serve.ts` run outputs

**`--gbc`** (reads `pokemap.config.json`'s `gbc.projectPath`, `/root/pokemap-corpus/pokecrystal-PerfPlus`):
```
$ npx tsx packages/server/src/serve.ts --gbc
pokemap server (gbc) on http://127.0.0.1:5174 for /root/pokemap-corpus/pokecrystal-PerfPlus
$ curl -s http://127.0.0.1:5174/api/project
{"family":"gbc","root":"/root/pokemap-corpus/pokecrystal-PerfPlus"}
```

**Positional path** (`/home/user/pokemon-three-region`, the GBA subject):
```
$ npx tsx packages/server/src/serve.ts /home/user/pokemon-three-region
pokemap server (gba) on http://127.0.0.1:5174 for /home/user/pokemon-three-region
$ curl -s http://127.0.0.1:5174/api/project
{"family":"gba","root":"/home/user/pokemon-three-region"}
```

**Missing `gbc` block** (temp cwd with a stub `pokemap.config.json` containing only `{ "projectPath": "/home/user/pokemon-three-region" }`):
```
$ cd <temp-cwd> && npx tsx .../packages/server/src/serve.ts --gbc
pokemap.config.json has no "gbc.projectPath"
$ echo $?
1
```
No stack trace in any of the three runs.

## Deviations from the spec, and why

1. **`serve.ts`'s "then return."** The spec's Ground rules say to write the stderr line, set `process.exitCode = 1`, "then return." `serve.ts` is an ES module (`"type": "module"`, top-level `await`), and a bare top-level `return` is a `SyntaxError` outside a function in ESM (unlike a CommonJS file, which is wrapped in one). I wrapped the whole script body in an `async function main()` and call `await main()` at the bottom, so the early `return` in the missing-`gbc`-block branch is a real, literal `return` from a function -- same observable behaviour (named stderr message, `exitCode = 1`, no thrown stack trace, process exits naturally once `main()` resolves), just restructured to make "return" syntactically valid.
2. **`outOfBoundsEventDefects`'s exact message wording.** The spec specifies *what* the message must name (kind, 0-based index, `(x,y)`, grid size) but not the exact string. I used `"<file>: <kind>[<index>] at (<x>,<y>) is outside the <w>x<h> step grid"` (singular kind names: `warp`/`coord`/`bg`/`object`, derived from the plural key via `.slice(0, -1)`). Not a deviation in substance, just a wording choice, recorded here since the spec left it open.
3. **CeruleanCave2F's third out-of-bounds warp is index 3, not 2.** The plan review's finding 1 lists CeruleanCave2F's three off-map warps by coordinate only, without indices; a naive reading of "3 warps" might suggest indices 0/1/2. Re-measuring directly against the real corpus (as the spec instructs -- "Re-measure the 7 yourself") shows the map has 4 warps total, with the 3rd one (index 2) in-bounds and the 4th (index 3) out-of-bounds. This is reflected correctly in both the implementation's behaviour and the pinned test.
4. **`GbcProject` test-stub churn.** Adding `groupNames()`/`collisionInfo()` to the `GbcProject` interface (additive, as the spec asks) required adding two `unused(...)`-throwing entries to three existing synthetic `GbcProject` stubs in `atlas.test.ts`, `render/map.test.ts`, and `world/connections.test.ts` so the structural-typing check still passes -- these are one-line additions each, not test-behaviour changes, and every affected file's full suite was re-run green.

No part of the spec was found to be wrong against the real code; the plan review's own pre-measured facts (26 groups, group 24 = NEW_BARK, 109/109 distinct `COLL_*` values, the 7 out-of-bounds events' maps/kinds, VioletCity roof 1 vs AzaleaTown roof 2, `border: 5` for both) all held up on direct re-measurement.

**Correction (Fix round 1, spec review finding 1):** the closing sentence above is wrong. The task spec's own premise for the AzaleaTown roof-test pair -- "same tileset [as VioletCity], different roof" -- is false: AzaleaTown is `TILESET_JOHTO_MODERN`, not `TILESET_JOHTO` (`data/maps/maps.asm`). See Fix round 1 below.

---

## Fix round 1

Addressing `task-1a-spec-review.md` (Opus, verdict **compliant-with-fixes**) and `task-1a-quality-review.md` (Sonnet, verdict **approve-with-fixes**).

### Commit SHAs

- `77407e1` -- `fix(core-test): factor a shared stubGbcProject helper (quality review finding 2)`
- `3b4cd75` -- `fix(core): correct doc comments (quality review 1, spec review 6/8)`
- `1b4dad4` -- `fix(server): add near-miss and root-normalisation tests (spec review 2, 5), --gbc comment (quality 3)`
- `a2a7f44` -- `fix(core-test): close talk/nybble/negative-y/block-id test gaps (spec review 3, 4, 7)`
- `2dfe386` -- `fix(core-test): add a true same-tileset/different-roof roof-key test (spec review 1)`
- (this commit) -- `docs: Plan 6b Task 1a fix round 1 report`

### What was fixed, by finding

**Spec review:**
1. **(Important) AzaleaTown roof test rests on a false spec premise; mutation E12 survived.** Added a byte-equality test (`renderGbcMapMetatile` vs the matching `renderGbcMap` region) on **MahoganyTown** -- `TILESET_JOHTO`, the same tileset as VioletCity, roof index 2 vs VioletCity's roof 1, block (5,2), metatile id 24. This is the true same-tileset/different-roof pair, and it isolates the per-map roof key directly: manually confirmed red under a hand-applied `roofSwappedTiles(proj, ts, map.tileset, 10)` mutation (VioletCity's group hardcoded), then confirmed the fix restores it green with `git status` clean before moving on. The AzaleaTown test itself was reworded to assert the real facts (`azalea.tileset === "TILESET_JOHTO_MODERN"`, `!== violet.tileset`) instead of assuming "same tileset", and its comment now says plainly that its own "differs" assertion doesn't by itself isolate the roof key -- that's what the new MahoganyTown test is for.
2. **(Minor) Only one 501-regex anchor was proven by a near-miss.** Added 5 more near-miss 404s to `gbcRoutes.test.ts`, each isolating one specific alternative/anchor the spec's own 3 near-misses never touched: `/api/dungeonsx` (the `dungeons(\/|$)` group), `/api/world/dungeonsx` (the `world\/dungeons$` anchor), `/api/species/CHIKORITA/icon.pngx` (the `icon\.png$` anchor), `/api/species/A/B/icon.png` (the `species/[^/]+` character class), `/x/api/warps/y` (the leading `^`).
3. **(Minor) talk-on-wall and the unknown-nybble refusal were untested.** Pinned `info.get(0x12)` (`COLL_CUT_TREE`, `WALL_TILE | TALK`) as `{ name: "COLL_CUT_TREE", category: "wall", talk: true }` -- closes the gap where the only prior `talk: true` pin (`COLL_WHIRLPOOL`) was also a water value. Added a tmp-dir fixture (bits `LAND $00 / WATER $01 / WALL $0e / TALK $10`, one row `db WATER_TILE | WALL_TILE` whose low nybble is `$0f`, plus 255 `db LAND_TILE` rows) asserting `loadGbcCollisionInfo` throws, matching `/value 0\b/` and `/\$f/`.
4. **(Minor) The negative-y branch was untested; mutation-7 attribution was wrong.** Added a negative-y-only case (an object at `(0,-1)`, x otherwise in-bounds). **Correction:** mutation 7 (`>=`→`>`) is caught by the two **unit** tests (`flags a warp at x >= 2*width...` and `flags a coord event at y >= 2*height...`), not by the 7-event corpus test -- no corpus event sits exactly on `x == 2w` or `y == 2h`, so the corpus test stays green under this mutation. The original mutation table's row 7 was wrong to credit the corpus test; the mutation table below is corrected.
5. **(Minor) Root-normalisation was untested.** Added a test to both `gbcRoutes.test.ts` and `api.test.ts`: a second server opened with a trailing slash appended to the root (`GBC_SUBJECT_ROOT + "/"` / `SUBJECT_ROOT + "/"`) still answers `/api/project` with the normalised root (no trailing slash), proving the route uses `proj.root`/`project.paths.root`, not the raw `opts.projectPath`.
6. **(Minor) `loadGbcMapEvents`'s doc comment had come unmoored.** Moved `POSITIONED_KINDS` and `outOfBoundsEventDefects` above `loadGbcMapEvents`'s own doc block (which had been left dangling above `POSITIONED_KINDS` instead), and reworded `POSITIONED_KINDS`'s own comment to describe what it actually is ("the four positioned `GbcMapEvents` kinds, walked in this order").
7. **(Minor) VioletCity block (4,7)'s raw id wasn't asserted directly.** Added `expect(proj.layout(map).layout.blocks[7 * map.width + 4]!.metatileId).toBe(24)` to the VioletCity byte-equality test.
8. **(Minor) `loadCollisionTables`'s doc comment overclaimed.** Reworded: it no longer claims to be "the one place a caller-added third reader" would hook into -- `loadGbcTileset` still reads `constants/collision_constants.asm` separately, and the spec only asked to de-duplicate the water/info pair.
9. **(Minor) Report omissions.** This section corrects them: `.claude/launch.json`'s `server`/`server-gbc` entries are alternatives, not simultaneous (both bind port 5174; running one and then the other requires stopping the first) -- the original report's deliverables list mentioned "both port 5174" but not the mutual-exclusivity consequence. The AzaleaTown deviation (finding 1) and the mutation-7 misattribution (finding 4) are recorded above and in the corrected mutation table below.

**Quality review:**
1. **(Important) Inaccurate `parseMapAttributes` citation.** `parseMapGroupNames`'s doc comment no longer claims to match "`parseMapAttributes`'s own 'never guess a group's name' posture" -- that posture doesn't exist anywhere in the file. It now cites `loadGbcMaps`'s own join-miss refusals, an accurate parallel.
2. **(Important) Three duplicated `GbcProject` test stubs.** Factored `packages/core/test/gbc/helpers/stubGbcProject.ts` (mirrors `packages/core/test/helpers/stubProject.ts`'s own GBA-side shape and stated reason for existing). `atlas.test.ts`'s `stubProject(root)`, `render/map.test.ts`'s `stubProject(overrides)` and `world/connections.test.ts`'s `stubGbcProject(maps)` each now call the shared helper (the last one imports it aliased as `stubGbcProjectBase` to avoid shadowing its own same-named local wrapper) and keep only their own per-test overrides.
3. **(Minor) `--gbc` silently wins over a positional path.** Added a one-line comment above the `if (process.argv.includes("--gbc"))` branch noting this, matching the `else` branch's own comment style. Behaviour unchanged, as the finding itself recommended.
4. **(Nit) `listen`/`address`/`close` boilerplate duplication between `index.ts` and `gbcRoutes.ts`.** Left as-is, per the review's own "not worth changing" recommendation.

### Test counts

- Before this fix round: 1309 passing (task 1a's original commit).
- After: **1320 passing**, same 6 known baseline failures. **+11 new tests**: 2 root-normalisation (`gbcRoutes.test.ts` + `api.test.ts`), 5 near-miss 404s (`gbcRoutes.test.ts`), 1 `COLL_CUT_TREE` pin + 1 unknown-nybble fixture (`tileset.test.ts`), 1 negative-y case (`events.test.ts`), 1 MahoganyTown byte-equality (`render/map.test.ts`).

### Gate result

```
npm test 2>&1 | tee t1a-fix1-test.log
diff <(grep -E "^ FAIL " t1a-fix1-test.log | sort -u) baseline-fails.txt
```
Clean diff (matches exactly): the same 6 known failures as before. `Tests 6 failed | 1320 passed (1326)`. `npm run typecheck` clean.

### Mutation results (this fix round)

Re-ran the reviewer's harness (`/tmp/.../scratchpad/mut.py`, which mutates `git show HEAD:<path>`, runs the targeted test file(s), and restores from `HEAD`) for the original 10 spec mutations plus every mutation the spec review reported surviving:

| # | Mutation | Verdict | Killed by |
|---|---|---|---|
| 1 | drop the GBC branch | KILLED | `gbcRoutes.test` `beforeAll` throws |
| 2 | 501→404 | KILLED | all 8 refusal cases |
| 3 | drop `$` on `world/placement` | KILLED | `/api/world/placementx is a 404` |
| 4 | macro-skip removed | KILLED | `skips a MACRO newgroup...ENDM definition...` |
| 5 | swap water/wall | KILLED | land/water/wall pin + WHIRLPOOL + CUT_TREE |
| 6 | talk always false | KILLED | WHIRLPOOL + CUT_TREE |
| 7 | `>=`→`>` | KILLED | warp `x >= 2*width` unit + coord boundary unit (corrected attribution: **not** the corpus test) |
| 8 | drop the roof swap | KILLED | VioletCity + MahoganyTown byte-equality + nite byte-equality |
| 9 | block-0→border substitution | KILLED | `does NOT substitute block id 0...` |
| 10 | GBC `/api/project` says gba | KILLED | `GET /api/project reports the gbc family...` |
| E1 | unanchor `dungeons(\/\|$)` | KILLED | `/api/dungeonsx is a 404` |
| E2 | drop `$` on `world/dungeons` | KILLED | `/api/world/dungeonsx is a 404` |
| E3 | drop `$` on `icon.png` | KILLED | `/api/species/CHIKORITA/icon.pngx is a 404` |
| E4 | `species/[^/]+` → `species/.+` | KILLED | `/api/species/A/B/icon.png is a 404` |
| E5 | drop the leading `^` | KILLED | `/x/api/warps/y is a 404` |
| E6 | talk only on water | KILLED | `COLL_CUT_TREE ... wall with talk: true` |
| E7 | unknown nybble → wall, no throw | KILLED | the new unknown-nybble fixture test |
| E8 | drop `e.y < 0` | KILLED | `flags a negative y on an object event...` |
| E9 | GBC root = `opts.projectPath` | KILLED | the trailing-slash root test (`gbcRoutes.test.ts`) |
| E10 | GBA root = `opts.projectPath` | KILLED | the trailing-slash root test (`api.test.ts`) |
| E12 | roof uses fixed group 10 | KILLED | the new MahoganyTown byte-equality test |

`git status --short` was empty after every mutation in both runs (the harness's own `STATUS:` print, plus a manual `git status --short` after).

No new deviations from the spec were introduced in this fix round; all changes are additive tests, doc-comment corrections, and one test-only refactor (the shared stub).
