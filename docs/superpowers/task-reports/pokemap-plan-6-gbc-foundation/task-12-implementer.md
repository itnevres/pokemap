# Plan 6 Task 12 — implementer report: the GBC encounter atlas

Branch `plan-6-gbc-foundation`, built on HEAD `3794891`. Subject
`/home/user/pokecrystal-PerfPlus` (read-only, untouched — porcelain empty
throughout and at the end).

## Files

- `packages/core/src/gbc/analyse/atlas.ts` (new) — `gbcEncounterSources`,
  `gbcWhereSpecies`, `gbcCoverage`, `gbcMapHasWaterTile`,
  `loadGbcSpeciesConstants`, plus the exported constants `RANDOM_RANGE`,
  `GRASS_WATER_LEVEL_BUFF_MAX`, `ROCK_ENCOUNTER_RATE_PERCENT`.
- `packages/core/src/gbc/load/tileset.ts` — added `parseCollisionCategoryBits`,
  `parseTileCollisionCategoryTable`, `loadGbcWaterCollisionValues` (the global
  `TileCollisionTable` → `WATER_TILE` derivation, a separate concern from the
  existing per-tileset `parseCollisionConstants`/`parseCollision`).
- `packages/core/src/gbc/project.ts` — added `GbcProject.wild()` (lazy/cached
  `loadGbcWildData`) and `GbcProject.waterCollisionValues()` (lazy/cached
  `loadGbcWaterCollisionValues`), following the existing `roofs()`/
  `paddingWidth()` pattern.
- `packages/cli/src/gbcCommands.ts` — added `runGbcEncounters`, `runGbcWhere`,
  `runGbcCoverage` in a clearly separated block below the Task 10 handlers
  (merge with the parallel Task 11 worktree should be mechanical).
- `packages/cli/src/index.ts` — wired the three commands' `gbc` branch
  (mirroring the existing `render`/`query` branch shape); did not touch
  `render-world`/`runGbaOnly` per the environment note.
- Tests: `packages/core/test/gbc/analyse/atlas.test.ts` (new, 27 tests),
  additions to `packages/core/test/gbc/load/tileset.test.ts` (+6),
  `packages/core/test/gbc/project.test.ts` (+1),
  `packages/cli/test/gbcCommands.test.ts` (+9, plus removing
  `encounters`/`where`/`coverage` from the GBA-only refusal list per the
  deliverable), and a required 2-line stub fix in
  `packages/core/test/gbc/render/map.test.ts` (its hand-built `GbcProject`
  stub needed `wild`/`waterCollisionValues` added, since the interface grew).

## Design

`gbcEncounterSources(proj, mapName)` builds a flat `GbcEncounterSource[]` by
running Task 8's `wildForMap` once, then a builder per method (grass/water/
fish/headbutt/rock). Each source keeps `chances` merged per species *within
that one source* (never across time/rod/list/conditional), mirroring the GBA
`speciesChances`/`coverage.ts` "duplicate species inside one table merge"
convention one level up. `gbcWhereSpecies` and `gbcCoverage` both build on top
of this one function, so there is exactly one place that resolves the engine
semantics.

I did not build a separate map-const→source index (the spec explicitly says
either is fine perf-wise); `gbcCoverage` calls `gbcEncounterSources` once per
map (391 calls), each of which runs `wildForMap`'s existing linear finds over
a few-hundred-entry array — ~10⁵ comparisons total, matching what the Task 8
review already accepted.

## Engine rules, with citation and formula

All citations are against `/home/user/pokecrystal-PerfPlus`.

1. **Random() range.** `home/random.asm:1-21` — one hardware-seeded byte,
   uniform over 0-255. Every roll comparison below is a fraction of **256**
   possible outcomes, not 255 (255/100 is only the "percent" macro's byte
   *encoding*, not the probability).
2. **Encounter rate.** `engine/overworld/wildmons.asm:176-201`
   (`TryWildEncounter`/`.EncounterRate`): `call GetMapEncounterRate / call
   ApplyMusicEffect... / call ApplyCleanseTagEffect... / call Random / cp b /
   ret`, then `jr nc, .no_battle` at the call site. `cp b` sets carry iff
   `Random() < b`; `jr nc` means the attempt proceeds iff carry is set. So
   `P(attempt) = rate / 256`. Reported as `encounterRate` (%), **not**
   multiplied into the per-slot conditional percent. Music/Cleanse Tag
   modifiers are runtime state — out of scope, base rate only.
3. **Level buff.** `engine/overworld/wildmons.asm:252-320`
   (`ChooseWildEncounter`). Lines 261-263 show grass and water/surf **share**
   the same code path (both fall through the `.watermon` label with no
   separate water branch) — this directly confirms PerfPlus's "surf gets the
   buff too" claim in the actual control flow, not just a comment. Lines
   301-315: `call Random / cp 35 percent / jr c,.ok / inc b / cp 65 percent /
   jr c,.ok / inc b / cp 85 percent / jr c,.ok / inc b / cp 95 percent / jr
   c,.ok / inc b`. P(+0)=35%, P(+1)=30%, P(+2)=20%, P(+3)=10%, P(+4)=5%. Max
   buff = **+4**. Reported as `minLevel` = base, `maxLevel` = base + 4.
   Reached only from `ChooseWildEncounter` — fishing (`fish.asm`'s `.Fish`/
   `.TimeEncounter`) and headbutt/rock (`treemons.asm`'s `SelectTreeMon`) set
   the level directly from their own record byte with **no** `Random` call in
   between, so none of them get this buff.
4. **Fishing bite.** `engine/events/fish.asm:24-30` (`.Fish`): `call Random /
   cp [hl] / jr nc, .no_bite`. Bite iff `Random() < biteChance`.
   `P(bite) = biteChance / 256`.
5. **Fishing rod record selection.** `engine/events/fish.asm:46-53` (`.loop`):
   `call Random / cp [hl] / jr z,.ok / jr c,.ok / inc hl×3 / jr .loop`. `jr z`
   OR `jr c` together mean "stop at the first record with `chance >=
   Random()`", i.e. the engine picks the first record with `Random() <=
   chance` — re-verified directly (the `<=` doc already on `GbcFishRodRecord`
   in `model/types.ts` was correct). For ascending cumulative bytes
   `c_0<c_1<...<c_n=255` (`c_-1 := -1`): `percent_i (%) = (c_i - c_(i-1)) /
   256 * 100`.
6. **time_group day/nite.** `engine/events/fish.asm:71-86` (`.TimeEncounter`):
   `ld a,[wTimeOfDay] / maskbits NUM_DAYTIMES / cp NITE_F / jr c,.time_species
   / inc hl / inc hl`. DAY pair used when `wTimeOfDay < NITE_F` (morn counts
   as day), NITE pair only when `>= NITE_F`. A `time_group` record therefore
   expands each rod into two atlas sources (`time:"day"`/`time:"nite"`),
   substituting only that one record; every other species record in the same
   rod list is identical in both variants.
7. **Qwilfish/Remoraid swarm.** `engine/events/fish.asm:92-123`
   (`GetFishGroupIndex`) — `wDailyFlags1`/`wFishingSwarmFlag`, runtime state.
   Tagged `conditional:"swarm"`, never merged (already handled by Task 8's
   `wildForMap`; this file just reports it as its own source).
8. **Grass/water slot odds.** `data/wild/probabilities.asm`'s
   `GrassMonProbTable`/`WaterMonProbTable`, walked by `ChooseWildEncounter`'s
   `.prob_bracket_loop` (lines 263-289: `call Random / cp 100 / jr nc,
   .randomloop / inc a` re-rolls to 1-100, then the first cumulative entry
   `>= a` wins) — already parsed as plain percents, conditional on the
   encounter roll succeeding, never multiplied by `encounterRate`.
9. **Headbutt.** `engine/events/treemons.asm:167-183` (`SelectTreeMon`):
   `ld a,100 / call RandomRange / .loop: sub [hl] / jr c,.ok / inc hl×3 / jr
   .loop` — a running-remainder walk over **non-cumulative** percents
   (`GbcTreemonRecord.percent` is already the real per-record %). Which list
   (common/rare) is read depends on `GetTreeScore` (tree-coordinate × trainer
   ID) — static-unknowable, so both are reported as separate `list:"common"`/
   `list:"rare"` sources, never resolved.
10. **TREEMON_SET_CITY yields nothing.** `engine/events/treemons.asm:96-99`
    (`GetTreeMons`): `cp NUM_TREEMON_SETS / jr nc,.quit / and a / jr z,.quit`
    — index 0 (CITY) makes `and a` set Z, so it quits before reading the
    table at all. No headbutt source is emitted for such a map.
11. **Rock Smash rate and scope.** `engine/events/treemons.asm:29-45`
    (`RockMonEncounter`): `ld a,10 / call RandomRange / cp 4 / jr nc,
    .no_battle` → `RandomRange 10` gives 0-9 uniform, proceeds iff `< 4`, so
    **P = 4/10 = 40% flat** (re-derived from the comparison, not merely
    trusted from the findings doc). The function then calls `GetTreeMons`
    then `SelectTreeMon` over `common` **only** — reading the whole function
    body confirms there is no rare-list branch anywhere in it, matching
    `GbcWildForMap.rock`'s own doc comment.
12. **Fishing reachability.** `engine/events/overworld.asm:1663-1664`
    (`FishFunction.TryFish`): `call GetFacingTileCoord / call GetTileCollision
    / cp WATER_TILE / jr nz,.fail`. `GetTileCollision`
    (`home/map_objects.asm:88-112`) indexes `TileCollisionTable`
    (`data/collision/collision_permissions.asm`) by the tile's raw `COLL_*`
    byte, then masks `and $f` (line 108, "lo nybble only") before returning
    — so `WATER_TILE | TALK` (e.g. `COLL_WHIRLPOOL`, $24) still reads as
    water. `loadGbcWaterCollisionValues` derives the exact 44-value set from
    the real table (never hand-listed); `gbcMapHasWaterTile` checks every
    metatile quadrant in the map's layout against it.

## Measured corpus values

- Total maps: **391**. `mapsWithEncounters` (after the fishing-reachability
  filter): **125**; `mapsWithoutEncounters`: **266**.
- `sourcesByMethod`: `{ grass: 288, water: 62, fish: 340, headbutt: 106, rock:
  4 }` (counts every generated `GbcEncounterSource`, e.g. one grass entry
  contributes 3 morn/day/nite sources, 6 with a swarm variant).
- `fishGroupWithoutWater`: **319** maps (a `FISHGROUP_*` on the header with no
  reachable water tile — most interiors and many towns/routes whose
  FISHGROUP is inherited/default but whose visible layout has no water).
- `unusedSpecies`: **69** of 251 real species (from
  `constants/pokemon_constants.asm`, excluding `EGG`; `NO_MON` is never
  actually named in that file since its `const_def 1` starts the counter at
  1). Lower than a stock-Crystal count would be: PerfPlus has added several
  normally wild-unobtainable species directly into `data/wild/johto_grass.asm`
  (e.g. `CHIKORITA` at Route 31, `SQUIRTLE` at Route 32 — both replacing a
  commented-out original species in the same slot) — a real, deliberate fork
  deviation, not a bug in this atlas.
- `defects`: exactly **1** (`data/wild/kanto_grass.asm`'s missing `db -1`
  terminator, Decision 4).
- `loadGbcWaterCollisionValues` size: **44** raw `COLL_*` values (0x20-0x22,
  0x24-0x26, 0x28-0x2a, 0x2c-0x2e, 0x30-0x3f, 0xc0-0xcf).

## Mutation-check table

Every mutation below was applied by hand to `atlas.ts`, run against
`packages/core/test/gbc/analyse/atlas.test.ts`, then reverted with a byte
diff against a saved original to confirm a clean revert before moving on. All
9 survived detection — no missing test was needed.

| # | Mutation | Result | Test(s) that went red |
|---|---|---|---|
| 1 | Rod cumulative boundary off-by-one (`prev = -1` → `prev = 0`) | caught | 4 (`fish` unit percent test + 3 corpus tests referencing exact fish percents) |
| 2 | Bite chance `/255` instead of `/256` | caught | 2 (`fish` unit bite-chance test, Route32 corpus bite-chance test) |
| 3 | `time_group` day/nite swapped | caught | 2 (`time_group` cumulative-boundary test + day/nite-split test) |
| 4 | Swarm merged into base (dropped the `"swarm"` tag on grass) | caught | 2 (swarm-tagging unit test, DUNSPARCE corpus test) |
| 5 | Headbutt `rare` dropped | caught | 3 (`sourcesByMethod` coverage pin, Route29 headbutt corpus test, headbutt unit test) |
| 6 | Rock including `rare` | caught | 2 (rock "never reads rare" unit test, `levelByMap` coverage pin) |
| 7 | Water-collision filter dropped (fishing never suppressed) | caught | 3 (fish-suppression unit test, `mapsWithEncounters`/`fishGroupWithoutWater` corpus pins) |
| 8 | Level buff dropped (`GRASS_WATER_LEVEL_BUFF_MAX` → 0) | caught | 3 (Route29 grass corpus pin, DUNSPARCE corpus pin) |
| 9 | Duplicate species not merged (unique key per slot) | caught | 4 (grass-merge unit test, DUNSPARCE corpus pin, coverage pins) |

## Live-verify (real CLI, real subject)

```
npx tsx packages/cli/src/index.ts --project /home/user/pokecrystal-PerfPlus encounters Route29
npx tsx packages/cli/src/index.ts --project /home/user/pokecrystal-PerfPlus encounters Route32
npx tsx packages/cli/src/index.ts --project /home/user/pokecrystal-PerfPlus encounters CianwoodCity
npx tsx packages/cli/src/index.ts --project /home/user/pokecrystal-PerfPlus where DUNSPARCE
npx tsx packages/cli/src/index.ts --project /home/user/pokecrystal-PerfPlus where HOUNDOUR
npx tsx packages/cli/src/index.ts --project /home/user/pokecrystal-PerfPlus coverage --unused
```

- **`encounters Route29`**: grass morn/day/nite (PIDGEY/SENTRET/RATTATA/HOPPIP
  by day, HOOTHOOT/RATTATA by night) plus headbutt common/rare
  (HOOTHOOT/SPINARAK/LEDYBA/EXEGGCUTE, HOOTHOOT/PINECO/EXEGGCUTE). Matches
  real Crystal Route 29 (the first route out of New Bark Town).
- **`encounters Route32`**: grass (Mareep/Ekans/Bellsprout/Hoppip/Pidgey/
  Wooper/Zubat/Hoothoot/Gastly/Rattata across times — matches real Route 32,
  the Union Cave approach route), water (Tentacool/Quagsire/Tentacruel),
  fishing base group giving Magikarp/**Tentacool** and a separate
  `conditional:"swarm"` set of sources giving Magikarp/**Qwilfish** — this
  matches real Crystal exactly: Route 32's water is normally Tentacool, and
  only turns up Qwilfish during the Qwilfish swarm event. Confirms the
  base/swarm fish-group split resolves correctly end to end.
- **`encounters CianwoodCity`**: water (Tentacool/Tentacruel), fishing
  (Magikarp/Krabby/Corsola/Staryu/Kingler), and `rock (rate 40.0%)`:
  KRABBY 90% / SHUCKLE 10% — matches real Crystal (Shuckle is the
  Cianwood-area Rock Smash reward).
- **`where DUNSPARCE`**: only `DarkCaveVioletEntrance`, 3 `swarm`-tagged
  sources at 45% (Lv 2-8) plus 3 non-swarm sources at 5% (Lv 4-8, a PerfPlus
  addition — see "concerns" below). Matches real Crystal: Dunsparce is
  swarm-only at Dark Cave in vanilla.
- **`where HOUNDOUR`** (nite-only species): only Route36/Route37/Route7, all
  `grass/nite`. Matches real Crystal (Houndour is a night-only Route 36/37
  encounter); Route 7 is additional Kanto-side data in this fork.
- **`coverage --unused`**: `125 maps with encounters, 266 without`, then 69
  named species (AMPHAROS, ARCANINE, CELEBI, CHARIZARD, … — mostly fully-
  evolved/legendary/trade-only Pokémon not obtainable via any of the 5
  in-scope methods). Sanity-checks against real-game expectations.

## Test counts and typecheck

- `npx vitest run packages/core/test/gbc packages/cli/test/gbcCommands.test.ts packages/cli/test/context.test.ts`:
  **16 files, 524 tests, 0 failed, 0 skipped** (baseline was 15 files / 481
  tests; this task added 1 new file (27 tests) and 16 tests to existing
  files: tileset.test.ts +6, project.test.ts +1, gbcCommands.test.ts +9).
- Full repo `npx vitest run`: **17 files / 1 test failed** — unchanged from
  the documented pre-existing baseline (missing local GBA decomp checkout;
  none of the failures are in GBC/CLI code).
- `npm run typecheck`: clean.
- Subject porcelain (`git -C /home/user/pokecrystal-PerfPlus status
  --porcelain`): empty, before and after.

## Concerns and deviations

- **PerfPlus adds normally-unobtainable species to wild grass tables.**
  `data/wild/johto_grass.asm` has several `db N, CHIKORITA ;GASTLY`/
  `db N, SQUIRTLE ;GASTLY`/`db N, HOUNDOUR ;HOOTHOOT` style edits — real,
  intentional fork data changes (comments preserve the original species),
  not defects. This explains why `unusedSpecies` (69) is noticeably lower
  than a stock-Crystal count would be, and why Route 31/Route 32 report
  starter Pokémon. Flagged here per "sanity-check against real-game
  knowledge", since anyone expecting vanilla Crystal's wild tables would be
  surprised by it.
- **`DarkCaveVioletEntrance` has a *non*-swarm Dunsparce entry too.** Its base
  (non-swarm) `johto_grass.asm` entry was also edited in this fork
  (`db 4, DUNSPARCE ;ZUBAT` / `db 5, CYNDAQUIL ;DUNSPARCE`), so Dunsparce is
  no longer strictly swarm-exclusive in this corpus, and Cyndaquil (a starter)
  is now a 5% base-rate wild encounter there too. Reported faithfully by the
  atlas; noted here so it isn't mistaken for a merge bug.
- **`levelByMap`'s per-source-then-per-map averaging is a judgment call**,
  not dictated by the engine (there is no in-game "average level" concept).
  I weighted every source equally regardless of its own `encounterRate`/
  `biteChance` or species count — documented on `GbcCoverage.levelByMap`'s
  own doc comment. A different, defensible choice (e.g. weighting by
  `encounterRate`) would change these numbers; I did not attempt to model
  which is more "correct" since the spec only asks that the choice be stated.
- **`gbcCoverage`'s fishing-reachability check runs twice per map** (once
  inside `gbcEncounterSources`, once again for `fishGroupWithoutWater`) —
  both are cheap (one small `.blk` read plus an in-memory collision-array
  scan), so I left this rather than restructuring the return shape of
  `gbcEncounterSources` to also report reachability, which the spec doesn't
  ask for.
- I did not resolve `time_group`'s day-vs-nite species merge across the
  *whole* fish group (only per rod, as the spec's "emit one hit per time
  bucket" asks) — a rod with no `time_group` record produces one source with
  no `time` field at all, which reads a little differently in `where`'s
  output (`fish/old` vs `fish/old/day`) than a casual reader might expect;
  documented in `buildFishSources`'s own comment.

## Interruption note

This session was cut off by a usage limit partway through the mutation-check,
immediately after applying mutation 4 (dropping the grass swarm tag) and
before reverting it. On resume I diffed the working file against a
pre-saved original, found the mutation still applied on disk, restored it
byte-for-byte, re-ran the full GBC+CLI suite to confirm green (524/524), and
then re-ran mutation 4 through 9 from scratch to complete the table above
cleanly.
