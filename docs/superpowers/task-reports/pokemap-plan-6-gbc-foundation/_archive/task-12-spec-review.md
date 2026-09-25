# Plan 6 Task 12: spec-compliance review (GBC encounter atlas)

- **Commit reviewed:** `7d095b2` (parent `3794891`), branch `plan-6-gbc-foundation`.
- **Subject:** `/home/user/pokecrystal-PerfPlus` @ `81ededbe3`. It was only read; its porcelain was clean throughout.
- **Binding sources:** `task-12-spec.md`; findings §Extra Wild data/Fishing/Headbutt and Decisions 4 and 5.
- **Method:** I re-derived every engine rule from the asm myself, without relying on the implementer's citations.
  - I wrote an independent Python re-implementation of the whole atlas (`indep.py`, scratchpad only). It parses the asm, the `.blk` files and the collision files directly and shares no code with `atlas.ts`.
  - I diffed its output against `gbcEncounterSources` for all 391 maps.
  - Every mutation was applied, run, and then restored from a byte copy. After each one, the harness asserted that `git diff -- <file>` was empty.
  - At the end, `git diff -- packages/` was empty.

## Verdict: ❌ ISSUES (2)

Every engine rule matches the asm. Across all 391 maps, all 800 generated sources match my independent derivation exactly: method, tags, rate, bite chance, every species, percent and level range. The two issues are both in `coverage`'s `unusedSpecies`: one is semantic and one is a missing test.

---

## 1. Engine-rule table (re-derived from asm)

| # | Rule | Asm (quoted) | Exact probability formula | Atlas | Match |
|---|---|---|---|---|---|
| 1 | `Random` range | `home/random.asm` `Random::` returns a full byte built by `adc`/`sbc` from `rDIV`. `RandomRange::` (same file) computes `b = $100 % c`, rejects draws where `hRandomAdd + b` carries, then `SimpleDivide` returns the remainder. | Byte rolls are uniform on 0..255, so the denominator is **256**. `RandomRange n` is a rejection-sampled uniform on 0..n−1, so the denominator is **n**. Only headbutt/rock use `RandomRange` (`ld a,10`, `ld a,100`), and those denominators are 10 and 100. Grass slots use a reroll (`cp 100 / jr nc,.randomloop`), which is uniform on 1..100. | `RANDOM_RANGE=256` for rate and bite. Grass and water use plain `/100` percents. Headbutt and rock use raw percents. | ✅ |
| 2 | Encounter rate | `wildmons.asm:178-179`: `call .EncounterRate / jr nc,.no_battle`. `:195-201`: `call GetMapEncounterRate / call ApplyMusicEffectOnEncounterRate / call ApplyCleanseTagEffectOnEncounterRate / call Random / cp b / ret`. `GetMapEncounterRate` (`:203-214`) uses `wWaterEncounterRate` on water and `wMornEncounterRate + wTimeOfDay` otherwise. | Carry is set iff `Random < b`, so **P(attempt) = b/256**. There are runtime modifiers: Pokémon March and Ruins radio apply `sla b` (×2); Lullaby applies `srl b` (÷2); a Cleanse Tag anywhere in the party applies `srl b` (÷2); Repel (`CheckRepelEffect`, `:182`) rejects after the slot is chosen; and `CheckWildEncounterCooldown` sits in `events.asm:1131`. There is no bike modifier in PerfPlus. A static atlas should report **base b/256** and never fold it into the slot %. | `encounterRate = resolved/256*100` for grass, per time, and for water. It is not multiplied into `chances`. For Route29, `10 percent` gives 25, and 25/256 = **9.765625%**. | ✅ |
| 3 | Grass/water slot roll | `:274-288`: `.randomloop: call Random / cp 100 / jr nc,.randomloop / inc a ; 1 <= a <= 100 / ld b,a … .prob_bracket_loop: ld a,[hli] / cp b / jr nc,.got_it`. `probabilities.asm` has `mon_prob 25,0 / 50 / 70 / 80 / 90 / 95 / 100` (grass) and `45 / 75 / 100` (water). `mon_prob` emits `db \1` with the **raw** percent, not `percent`-scaled. | The roll is uniform on 1..100. The first cumulative `c_i ≥ a` wins, so slot *i* gets `c_i − c_(i−1)` out of 100. Grass is 25/25/20/10/10/5/5 and water is 45/30/25. **0-99 (+1), not 0-255.** | `probabilities` is already per-slot; `mergeSlots` sums them per species. | ✅ |
| 4 | Level buff | `:297-314`: `ld a,[wBattleType] / cp BATTLETYPE_SUICUNE / jr z,.ok / call Random / cp 35 percent / jr c,.ok / inc b / cp 65 percent / jr c,.ok / inc b / cp 85 percent / jr c,.ok / inc b / cp 95 percent / jr c,.ok / inc b`. `percent` is `* $ff / 100`, so the thresholds are 89/165/216/242. | P(+0)=89/256=**34.77%**, P(+1)=76/256=**29.69%**, P(+2)=51/256=**19.92%**, P(+3)=26/256=**10.16%**, P(+4)=14/256=**5.47%**. Max is +4. **Water:** `:261-263` reads `call CheckOnWater / ld de,WaterMonProbTable / jr z,.watermon`. Water jumps to `.watermon`, grass falls through into it, and both reach the buff at `:302`. So surf is buffed; I verified this in the control flow. **Fishing:** `FishFunction.goodtofish` (`overworld.asm`) does `ld a,e / ld [wCurPartyLevel],a` straight from `Fish`'s record, so fishing gets no buff. **Headbutt/rock:** `SelectTreeMon` does `ld a,[hl] / ld [wCurPartyLevel],a`, so there is no buff there either. | min = base and max = base+4 for grass and water only. Fish, headbutt and rock report the raw level. | ✅ (the doc's "35/30/20/10/5%" is approximate; see Minor 1) |
| 5 | Fishing bite | `fish.asm:28-30`: `call Random / cp [hl] / jr nc,.no_bite` | A bite happens iff `Random < c`, so **P = c/256**. `50 percent + 1` gives 128, so the bite chance is **50.000%**. | `biteChance = resolved/256*100` | ✅ |
| 6 | Rod record walk | `fish.asm:46-54`: `call Random / .loop: cp [hl] / jr z,.ok / jr c,.ok / inc hl ×3 / jr .loop`. It rolls once and then walks. | It stops at the first record with `Random ≤ c_i`. Record *i* covers `(c_(i−1), c_i]`, which is `c_i − c_(i−1)` values, with **c_(−1) = −1**. The first record therefore gets `(c_0+1)/256`. Every real rod list ends in `100 percent` = 255, which I asserted for all lists, so the percents sum to 256/256. **Example (Qwilfish Good):** 89/178/230/255 gives 90/89/52/25, i.e. 35.15625 / 34.765625 / 20.3125 / 9.765625, which sums to **100%**. All 800 atlas sources sum to 100% (checked programmatically). | `fishRecordPercents`, with `prev = -1` | ✅ |
| 7 | `time_group` day/nite | `fish.asm:80-85`: `ld a,[wTimeOfDay] / maskbits NUM_DAYTIMES / cp NITE_F / jr c,.time_species / inc hl / inc hl`. From `wram_constants.asm:118-121`: MORN_F=0, DAY_F=1, NITE_F=2, DARKNESS_F=3. | `a < 2` (MORN, DAY) selects the **day** pair; `a ≥ 2` (NITE, DARKNESS) selects the **nite** pair. **MORN falls into day.** | Two sources per rod when it holds a time_group record, `time:"day"` and `time:"nite"`. Only the time_group row is substituted. | ✅ |
| 8 | Fish swarm | `fish.asm:92-125` `GetFishGroupIndex`: `bit DAILYFLAGS1_FISH_SWARM_F` and `cp FISHGROUP_QWILFISH / REMORAID`, then `wFishingSwarmFlag` swaps in the `_SWARM` group. | This is runtime state. It becomes a separate `conditional:"swarm"` source. | Yes (through Task 8's `swarmVariant`). | ✅ |
| 9 | `SelectTreeMon` | `treemons.asm:170-183`: `ld a,100 / call RandomRange / .loop: sub [hl] / jr c,.ok / inc hl ×3 / jr .loop / .ok: ld a,[hli] / cp -1 / jr z,NoTreeMon` | The roll is uniform on 0..99. A running-remainder walk over **non-cumulative** percents gives P(record *i*) = p_i/100. If a list summed to less than 100, the remainder would reach the `$ff` terminator (`sub $ff` always carries) and give no encounter. I summed every list in `treemons.asm`: all 19 distinct lists sum to **exactly 100**. That is 9 common/rare pairs, with City and Canyon sharing one pair, plus Rock's single list. The percent therefore maps directly to the probability. | Raw percents, merged per species | ✅ |
| 10 | Headbutt list selection | `GetTreeMon` (`:125-165`): score BAD gives `RandomRange 10 / and a` (10%, common list); GOOD gives `cp 5` (50%, common); RARE gives `cp 8` (80%), then `.skip` walks bytes to the first `$ff` (past the common list) and reads the rare list. | Which list applies, and the headbutt encounter odds of 10/50/80%, depend on tree score. That can't be known statically, so the atlas should report both lists separately and give no rate. | `list:"common"` and `list:"rare"`, no `encounterRate` | ✅ (see Minor 7) |
| 11 | CITY yields nothing | `GetTreeMons` (`:100-104`): `cp NUM_TREEMON_SETS / jr nc,.quit / and a / jr z,.quit`. TREEMON_SET_CITY is const 0. | Index 0 quits, so there is **no headbutt source**. The table data under `TreeMonSet_City` is dead. | Returns `[]` when `yieldsNothing` | ✅ |
| 12 | Rock | `RockMonEncounter` (`:29-50`): `call GetTreeMons / … ld a,10 / call RandomRange / cp 4 / jr nc,.no_battle / call SelectTreeMon`. `hl` is still the start of the set, i.e. the first (common) list, and nothing in the function skips to a rare list. | **P = 4/10 = 40%**, read from the common list only. `TreeMonSet_Rock` has one list anyway: 90 KRABBY / 10 SHUCKLE. | `encounterRate:40`, common list only | ✅ |
| 13a | `GetTileCollision` mask | `home/map_objects.asm:94-108`: `ld hl,TileCollisionTable / … add hl,de / … ld e,[hl] / … ld a,e / and $f ; lo nybble only` | The category is `TileCollisionTable[coll] & $0f`. | `(v & 0xf) === bits.water` | ✅ |
| 13b | WATER_TILE set | `data/collision/collision_permissions.asm` has 256 rows. `WATER_TILE`=$01 and `TALK`=$10. | I re-derived the set with my own parser: **44 values**. They are `$20-22, $24-26, $28-2a, $2c-2e, $30-3f, $c0-cf`. An exact compare (no mask) would find only 40, losing the four `WATER_TILE \| TALK` rows `$22, $24 (COLL_WHIRLPOOL), $2a, $2c`. | `loadGbcWaterCollisionValues` gives 44 (pinned). | ✅ |
| 13c | Fishing reachability | `overworld.asm` `FishFunction.TryFish`: `ld a,[wPlayerState] / cp PLAYER_SURF / jr z,.fail / cp PLAYER_SURF_PIKA / jr z,.fail / call GetFacingTileCoord / call GetTileCollision / cp WATER_TILE / jr nz,.fail / farcall CheckFacingObject`. `.facingwater` then does `call GetFishingGroup / and a / jr nz,.goodtofish`, which fails for FISHGROUP_NONE. | The **real** requirement is: not surfing, **facing** a water-category tile, no NPC on it, and a FISHGROUP other than NONE. The player must therefore stand on a non-water tile next to water. The spec's rule, "the layout contains any water-category quadrant", is an over-approximation of this. I measured the stricter version: 67 maps have a FISHGROUP plus water, and 65 of them have a water quadrant orthogonally adjacent to a LAND quadrant. On **Route16** and **Route18** every water quadrant is walled off by WALL or HEADBUTT_TREE. Route18's west-edge water might still be facing-reachable across the Route17 connection. Route16's west edge has no connection. | Any water quadrant in the in-map layout. This is exactly the spec's rule. | ✅ per spec (see Minor 6) |

Two measurements back this up. `fishGroupWithoutWater` = **319** (independent). An exact compare instead of the mask also gives 319 on this corpus: no map depends only on TALK-water tiles, so the mask is pinned only by the 44-count unit test.

---

## 2. Pin re-derivations (independent script, not atlas code)

| Pin | Hand/independent derivation | Atlas | ✓ |
|---|---|---|---|
| **Route29 grass, morn** | `johto_grass.asm:1237-1263`. Morn slots are PIDGEY 2, SENTRET 2, PIDGEY 3, SENTRET 3, RATTATA 2, HOPPIP 3, HOPPIP 3. That gives **PIDGEY 25+20 = 45%, Lv 2-7**; **SENTRET 25+10 = 35%, Lv 2-7**; RATTATA 10%, Lv 2-6; HOPPIP 5+5 = 10%, Lv 3-7. The rate is `10 percent` = 25, so 9.765625%. | identical (CLI prints `grass (morn, rate 9.8%)` / `45.0%  Lv 2-7  PIDGEY`) | ✅ |
| **Route29 grass, nite** | HOOTHOOT is slots 0, 2, 5, 6: 25+20+5+5 = **55%, Lv 2-7**. RATTATA is slots 1, 3, 4: 25+10+10 = **45%, Lv 2-7**. | identical | ✅ |
| **Route32 fishing** | The map header is `FISHGROUP_QWILFISH`. The bite is `50 percent + 1` = 128, so **50%**. **Base old rod** (`.Qwilfish_Old`: 179/217/255): MAGIKARP 180+38 = 218/256 = **85.15625%**, TENTACOOL 38/256 = **14.84375%**. **Base good rod** (89/178/230/255, tg20 = TENTACOOL both times): TENTACOOL 166/256 = 64.84375%, MAGIKARP 35.15625%. **Base super rod**: TENTACOOL 179/256 = 69.921875%, MAGIKARP 20.3125%, QWILFISH 9.765625%. **Swarm old rod** (`.Qwilfish_Swarm_Old`, Lv 5): MAGIKARP **85.15625%**, QWILFISH **14.84375%**. Swarm good rod: QWILFISH 64.84375%. Swarm super rod: QWILFISH 100%. | identical, all 10 fish sources | ✅ |
| **Headbutt, Route29** (TREEMON_SET_ROUTE) | **Common:** HOOTHOOT 50, EXEGGCUTE 10+5+5 = 20, SPINARAK 15, LEDYBA 15. **Rare:** HOOTHOOT 50, PINECO 15+15 = 30, EXEGGCUTE 20. All Lv 10. | identical | ✅ |
| **Headbutt, Route32** (TREEMON_SET_KANTO, a PerfPlus mapping) | **Common:** HOOTHOOT 65, EXEGGCUTE 20, EKANS 15. **Rare:** HOOTHOOT 50, PINECO 30, EXEGGCUTE 20. | identical | ✅ |
| **CianwoodCity rock** | `RockMonMaps` maps CIANWOOD_CITY to TREEMON_SET_ROCK: KRABBY **90%**, SHUCKLE **10%**, Lv 15, rate **40%**. | identical (`rock (rate 40.0%)`) | ✅ |
| **`where DUNSPARCE`** | `swarm_grass.asm`, DarkCaveVioletEntrance: slots 1, 4, 5, 6 give 25+10+5+5 = **45%**, Lv 2-8 (base levels 3/2/4/4, +4), in 3 sources (morn/day/nite). The base `johto_grass.asm:1189/1197/1205` has `db 4, DUNSPARCE ;ZUBAT` in slot 5, which gives **5%, Lv 4-8** in 3 sources. That is 6 hits, all on DarkCaveVioletEntrance. | identical, 6 hits | ✅ |
| **`where HOUNDOUR`** (nite-only) | Route37 nite 30%, Lv 15-20. Route7 nite 20%, Lv 18-22. Route36 nite 15%, Lv 5-9. There are no morn or day hits. I independently measured the full set of nite-only species: ARIADOS, DELIBIRD, DROWZEE, GLOOM, HAUNTER, HITMONLEE, HOUNDOUR, HYPNO, KABUTO, MEOWTH, MISDREAVUS, MURKROW, ODDISH, OMANYTE, PERSIAN, SNEASEL, STANTLER, STARYU, UMBREON and WOBBUFFET. | identical | ✅ |
| **`where CHIKORITA`** | Route31, 5% in morn, day and nite, Lv 5-9 (a PerfPlus edit) | identical | ✅ |
| **`mapsWithEncounters`** | **125**, with 266 without | 125 / 266 | ✅ |
| **`sourcesByMethod`** | grass **288**, water **62**, fish **340**, headbutt **106**, rock **4** | identical | ✅ |
| **`fishGroupWithoutWater`** | **319**. That is 386 maps with a FISHGROUP (5 are NONE: CeruleanGym, Route4, CeruleanCity, Route17, CeladonCity) minus the 67 that have water. | 319 | ✅ |
| **`unusedSpecies`** | `pokemon_constants.asm`'s first `const_def 1` block has 252 `const` lines; excluding EGG leaves 251 species. `JOHTO_POKEMON` and `NUM_POKEMON` are `DEF` lines and `const_skip` is not a `const X` line, so none of them reach `parseConstDefs`. NO_MON is never named. The second `const_def` (UNOWN_A..Z) is sliced off. Counting raw data presence gives **69**. Counting against generated sources gives **70**: the extra species is **REMORAID**, which appears only in the unreachable REMORAID and REMORAID_SWARM groups and TimeFishGroups 12-13, and no map has FISHGROUP_REMORAID. | 69 | ⚠ see Issue 1 |
| **`defects`** | 1, for `data/wild/kanto_grass.asm` (no `db -1` terminator) | 1 | ✅ |
| **Whole corpus** | All 391 maps, 800 sources: method, time, rod, list, conditional, rate, bite and chances (species, percent to 1e-9, levels) | **0 diffs** | ✅ |

---

## 3. Deliverables table

| Deliverable | Status | Notes |
|---|---|---|
| `GbcProject.wild()`, lazy and cached, with an identity test | ✅ | `project.ts`. `project.test.ts` asserts `toBe` identity for `wild()` and for `waterCollisionValues()`. |
| `gbcEncounterSources` source shape and field names | ✅ | `method`, `time?`, `rod?`, `list?`, `conditional?:"swarm"`, `encounterRate?`, `biteChance?`, `chances[{species,percent,minLevel,maxLevel}]`, exactly as specified. |
| Merge per species within a source; sort percent descending | ✅ | `mergeSlots`, `resolveFishChances` and `mergeTreemonRecords` all do this. The sort is stable. Nothing is merged across time, rod, list or conditional. |
| `gbcWhereSpecies` hit shape; sorted; matched on the constant | ✅ | `{mapName,mapConst,method,time?,rod?,list?,conditional?,percent,minLevel,maxLevel}` |
| `gbcCoverage` fields | ✅ (Issue 1 on semantics) | `mapsWithEncounters`, `mapsWithoutEncounters`, `sourcesByMethod`, `levelByMap` (the choice is documented), `unusedSpecies`, `fishGroupWithoutWater`, `defects` |
| Excluded pseudo-constants measured and documented | ⚠ Minor 4 | EGG, NO_MON and the UNOWN block are documented. `NUM_POKEMON`, `JOHTO_POKEMON` and `const_skip` are not. |
| Map→source index | ✅ | Per-map `wildForMap` linear finds, which the spec explicitly allows. |
| CLI `encounters` | ✅ | `grass (morn, rate 9.8%)` then `   45.0%  Lv 2-7  PIDGEY`. `--json` prints the sources. |
| CLI `where` | ✅ | `mapName(pad32) pct%  Lv a-b  method[/time][/rod][/list][ swarm]`. The empty case prints `<species> appears in no encounter table`. `--json` works. The CLI uppercases input (but see Minor 2). |
| CLI `coverage` with `--empty`, `--unused`, `--json` | ✅ | The summary line and flags match GBA semantics exactly. `--json` gives the full `GbcCoverage`. |
| Defects on stderr | ✅ | All three handlers print `warning: data/wild/kanto_grass.asm: …` on stderr. The spawned e2e test pins it. |
| The three commands leave the GBC refusal list | ✅ | `refuseIfGbc(family,"encounters"/"where"/"coverage")` is replaced by a `gbc` branch. The e2e refusal list drops them. The other 8 refusals are unchanged. |
| GBA handlers unchanged apart from the guard | ✅ | The diff touches only the guard lines. The GBA bodies are byte-identical. |
| `tileset.ts` additions | ✅ | These are `parseCollisionCategoryBits`, `parseTileCollisionCategoryTable` and `loadGbcWaterCollisionValues`. **What:** a parser for the global 256-row `TileCollisionTable` (category bits come from `findDefEqu`, not hard-coded), plus the `& 0xf` water set. **Why:** fishing reachability needs the category of each raw `COLL_*` byte, and the existing `parseCollision` only resolves a tileset's `COLL_*` tokens to raw bytes. It is placed alongside the collision loaders, which is sensible. The table-length check refuses anything other than 256 rows. |
| Unit tests (stub project, no unchecked casts) | ✅ | Covered: grass merge, water, fish bite and cumulative rods, time_group split, swarm (grass and fish), headbutt common/rare, rock common-only, CITY yields nothing, and no-water fish suppression. |
| Corpus tests | ⚠ Issue 2 | Pinned: Route29 (2 species), Route32 (swarm, bite, old-rod exact), Route29 headbutt, Cianwood rock, DUNSPARCE, HOUNDOUR, CHIKORITA, and coverage (125/319/69/1 defect). **Missing: named `unusedSpecies` members.** |
| CLI tests, including the spawned `where` exit-0 test | ✅ | `runGbcEncounters`, `runGbcWhere` and `runGbcCoverage` have handler tests, plus a spawned `where DUNSPARCE` test. |
| Mutation check (9 spec items) | ✅ | All 9 reproduced as caught (below). |
| Gates | ✅ | `npx vitest run packages/core/test/gbc packages/cli/test/gbcCommands.test.ts packages/cli/test/context.test.ts` passes: **16 files, 524 tests, 0 failed, 0 skipped**. `npm run typecheck` is clean. |

---

## 4. Mutation table

Each mutation was applied to the source file and run against `atlas.test.ts`, `tileset.test.ts`, `gbcCommands.test.ts` and `project.test.ts` (117 tests). The file was then restored from a byte copy, and the harness asserted an empty `git diff` for it.

| # | Mutation | Result | Caught by |
|---|---|---|---|
| S1 | Rod boundary: `prev = -1` → `0` | **caught** (4) | fish `<=` unit, time_group unit, and others |
| S2 | Bite `/256` → `/255` | **caught** (2) | fish unit bite test, Route32 corpus |
| S3 | time_group day/nite swapped | **caught** (2) | time_group units |
| S4a | Grass swarm tag dropped (merged into base) | **caught** (3) | swarm unit, DUNSPARCE corpus, CLI where |
| S4b | Fish swarm tag dropped | **caught** (2) | fish swarm unit, Route32 corpus |
| S5 | Headbutt `rare` dropped | **caught** (3) | headbutt unit, coverage unit, Route29 headbutt corpus |
| S6 | Rock includes `rare` | **caught** (2) | rock unit, coverage unit |
| S7 | Water-collision filter dropped | **caught** (4) | suppression unit, corpus 125/319, CLI coverage |
| S8a | Level buff dropped (`4` → `0`) | **caught** (5) | Route29 corpus, DUNSPARCE, coverage unit, and CLI tests. The unit tests alone would **not** catch it, because they compute expectations from `GRASS_WATER_LEVEL_BUFF_MAX`; the corpus tests use literals. |
| S8b | Buff dropped on water only | **caught** (2) | water unit, coverage unit |
| S9 | Duplicate species not merged | **caught** (7) | grass and water units, Route29, DUNSPARCE, CLI tests |
| M1 | Grass `encounterRate` /255 | **caught** (2) | grass unit, Route29 corpus |
| M1b | Water `encounterRate` /255 | **caught** (1) | water unit |
| M2 | Slot % multiplied by the encounter rate | **caught** (5) | grass unit, Route29, DUNSPARCE, CLI tests |
| M3 | MORN fishing roll in the nite bucket (3-way split, morn uses the nite pair) | **caught** (2) | time_group unit, coverage unit |
| M4 | WATER_TILE mask dropped (exact compare, loses $22/$24/$2a/$2c) | **caught** (1) | Only `loadGbcWaterCollisionValues` corpus (size 44 and `has(0x24)`). The atlas pins are unaffected (still 319/125). |
| M5 | CITY headbutt not suppressed | **caught** (4) | CityMap unit, coverage unit, corpus 125, CLI coverage |
| M6 | Rock rate 40 → 4 | **caught** (1) | Cianwood corpus only (the unit test compares against the constant) |
| M7 | `where` case-sensitive (CLI `toUpperCase` removed) | **SURVIVED** | No test passes lower-case input (Minor 2). |
| M8 | `coverage` excludes swarm-only maps from `mapsWithEncounters` | **SURVIVED (equivalent)** | Neither the corpus nor the fixture has a swarm-only map: DarkCaveVioletEntrance and Route35 both have a base table. On current data this is an equivalent mutant (Minor 5). |
| M9 | +4 buff applied to fishing | **caught** (2) | fish swarm unit, Route32 corpus |
| M10 | Grass uses morn slots for every time | **caught** (1) | HOUNDOUR nite-only corpus (the unit fixture uses identical slots for all 3 times) |
| M11 | Headbutt percents treated as cumulative | **caught** (4) | headbutt and rock units, Route29 and Cianwood corpus |
| M12 | `where` sorted ascending | **caught** (2) | where unit, CLI where |
| M13 | `fishGroupWithoutWater` includes FISHGROUP_NONE maps | **caught** (1) | Coverage unit only. It is equivalent on the corpus, because all 5 NONE maps have water. |
| M14 | `unusedSpecies` from generated sources | "caught" (3) | The 69 pins. This is the fix for Issue 1, which the current pins reject. |
| M15 | `where` defects not written to stderr | **caught** (1) | spawned e2e |
| M16 | Nite source uses the day pair | **caught** (1) | time_group unit |
| M17 | EGG not excluded | **caught** (4) | species unit, corpus 69, CLI |

---

## 5. Issues

### Issue 1: `unusedSpecies` counts raw-data presence, not "appearing in no source", so REMORAID is misreported

- **Spec, Deliverable 2:** "`unusedSpecies`: species constants … appearing in **no source**". In the spec, a *source* is a `GbcEncounterSource`.
- **What the code does:** `collectUsedSpecies` walks the raw `GbcWildData`: every grass and water entry, **every** fish group, **every** TimeFishGroups row and **every** treemon set. Its doc says this matches "appearing in no source", which it does not.
- **Where the difference shows up:** REMORAID is only in `.Remoraid_*`, `.Remoraid_Swarm_*` and TimeFishGroups 12/13. No map header uses `FISHGROUP_REMORAID`, so no source ever yields it.
- **Result:**
  - `where REMORAID` prints `REMORAID appears in no encounter table`.
  - `coverage --unused` does **not** list REMORAID.
  - The two commands disagree. The pin should be **70**, not 69.
- **The GBA sibling agrees with the spec reading:** `analyse/coverage.ts` builds `seen` from the per-map computed `speciesChances`, the same data `whereSpecies` walks, not from the raw JSON.
- **Dead data would be missed the same way:** CITY-set headbutt data, or a fish group reachable only on no-water maps, would be treated as "used" under the current code.
- **Fix:** build `usedSpecies` from the generated sources, e.g. `new Set(maps.flatMap(m => gbcEncounterSources(proj, m.name).flatMap(s => s.chances.map(c => c.species))))`. This is exactly mutation M14. Then re-pin 70 in `atlas.test.ts` and in `gbcCommands.test.ts` (`1 + 70`), and update the doc comment and the report.

### Issue 2: the corpus `gbcCoverage` test doesn't pin named `unusedSpecies` members

- **Spec, Deliverable 4 Corpus:** "`gbcCoverage`: pinned … `unusedSpecies` count **plus a couple of named members**".
- **What the test does:** `atlas.test.ts` "gbcCoverage over the whole corpus" asserts only `toHaveLength(69)`. The report names members (AMPHAROS, CELEBI, …) but no test does.
- **Fix:** add `toContain` for REMORAID (after Issue 1) and, for example, CELEBI and CHARIZARD. Optionally add `not.toContain("EGG")`.

---

## 6. Minors (non-blocking)

1. **The level-buff distribution is quoted as 35/30/20/10/5%** in the `atlas.ts` comment item 3 and in the report. The engine thresholds are `35/65/85/95 percent` = 89/165/216/242 of 256, so the exact distribution is 34.77 / 29.69 / 19.92 / 10.16 / 5.47%. This contradicts the file's own item 1 ("a fraction of 256, NOT a percent"). The findings doc (line 425) carries the same approximation. It only affects documentation, since the atlas reports max = +4 and never the distribution.
2. **The CLI `where` input handling is untested, and one comment overstates it.**
   - Mutation M7 survives: no test runs `where` with lower-case input.
   - `runGbcWhere`'s doc says the input is "prefix-stripped by the caller", but `index.ts` only uppercases it.
   - As a result, `where SPECIES_DUNSPARCE` returns "appears in no encounter table", whereas the GBA command accepts `SPECIES_x`. Either strip the prefix or fix the comment, and add one lower-case case to the spawned test or a handler test.
3. **A stale test comment.** `gbcCommands.test.ts:249` says "see gbcAtlas.test.ts's own end-to-end coverage", but no such file exists (it is `atlas.test.ts` plus this file's Task 12 block). The "empty map" test also carries a rambling Route26 comment that doesn't match what the code does.
4. **Excluded pseudo-constants aren't fully documented.** The spec asks to "measure and document which". `NUM_POKEMON` (line 274) and `JOHTO_POKEMON` (line 173) are `DEF` lines, and `const_skip` (line 275) is not a `const X` line, so they are excluded implicitly. Neither the doc nor the report names them.
5. **M8 is an equivalent mutant.** No swarm-only map exists in the corpus or the fixture, so nothing pins that a swarm-only map counts toward `mapsWithEncounters`. A fixture map with only a swarm entry would pin it.
6. **Fishing reachability over-approximates on 2 maps**, which the spec rule allows. `TryFish` also refuses while surfing, so the player must stand on land facing water. Route16 has no water quadrant adjacent to a LAND quadrant, and its west-edge water has no connection. Route18's water is walled in-map, but it might be faceable from Route17 across the west connection. Both still report fishing. This is compliant with the spec's "any water quadrant" rule, but worth one line in the doc (the `PLAYER_SURF` refusal isn't mentioned) and a possible follow-up.
7. **Headbutt's score-dependent encounter odds aren't documented.** They are BAD 10% common, GOOD 50% common, and RARE 80% rare (`GetTreeMon`). Omitting `encounterRate` on headbutt sources is correct. But a sentence in the item 9 doc would stop readers assuming a headbutt always yields an encounter.
8. **The findings doc and the binding spec disagree on rates.** Findings line 640 says "grass per time slot (slot % × rate)", while the binding spec says the rate goes "alongside, NOT multiplied into" the slot %. The implementation follows the spec, which is correct. This is noted only so the findings doc can be reconciled.

## 7. Housekeeping

- The subject decomp was only read.
- `pokemap.config.json` has the local-only GBC path and was not committed.
- The Task 11 worktree was untouched.
- The mutation harness and the independent derivation live in the scratchpad only.
- `git diff -- packages/` is **empty**.
- Nothing is committed.
