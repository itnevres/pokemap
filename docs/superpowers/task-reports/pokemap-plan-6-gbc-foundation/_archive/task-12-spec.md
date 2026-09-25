# Plan 6 Task 12: encounter atlas (re-granularised 2026-09-24 against real code)

## Binding sources
- The plan's Task 12. Its premise "no day/night variants at the data level" is false; see findings "Consequences → Task 12".
- Decision 5: atlas scope is grass, water, fishing, headbutt and rock smash.
- Findings §Extra "Wild data", "Fishing", "Headbutt and Rock Smash".
- Real code:
  - Task 8's `packages/core/src/gbc/load/encounters.ts` (`loadGbcWildData`, `wildForMap`, types in `gbc/model/types.ts`, all final after 4 fix rounds);
  - GBA `packages/core/src/analyse/coverage.ts` (`whereSpecies`/`coverage` shapes) and GBA `packages/core/src/load/encounters.ts` `speciesChances` (duplicate species inside one table merge into one row, with percents summed and the level range min/max);
  - the CLI `encounters`/`where`/`coverage` in `packages/cli/src/index.ts`, plus Task 10's family branch and `gbcCommands.ts`.

## Engine semantics
**Derive every item from source, cite file:line in doc comments, and never assume.**
1. **Grass/water slot odds.** `probabilities` already holds per-slot percents. Confirm the roll in `engine/overworld/wildmons.asm` `ChooseWildEncounter` (~:252) is 0-99 against the cumulative table, so per-slot % = the diff.
2. **Encounter rate.** Find how the rate byte (the resolved `percent` value) is compared (`TryWildEncounter` or equivalent: `<` or `<=` a `Random` byte, with any PerfPlus modifiers). Report it as `encounterRate` (a per-step chance, in %) alongside, NOT multiplied into, the per-slot conditional percent. This mirrors GBA, where `percent` is conditional on an encounter happening.
3. **Level.**
   - Findings say the engine adds +0..+4 to grass, and PerfPlus also to surf.
   - Verify where and how in `ChooseWildEncounter`/`wildmons.asm`, and whether it also applies to fishing, headbutt or rock.
   - Report `minLevel` = base and `maxLevel` = base + the real maximum buff, per source, from the code.
4. **Fishing** (`engine/events/fish.asm`).
   - Bite chance: `cp [hl] / jr nc, .no_bite`, i.e. a bite iff roll < chance, so P(bite) = chance/256.
   - Rod records are cumulative. Derive the exact per-record probability from the comparison used (the `<=` doc in types.ts is claimed correct; re-verify). Report the percent conditional on a bite, plus `biteChance` %.
   - `time_group n` → `TimeFishGroups[n]`: day species for which clock states and nite for which? Check the `wTimeOfDay` test in fish.asm; MORN is likely day. Emit one hit per time bucket, with an explicit `time`.
   - The Qwilfish/Remoraid swarm variant is a separate conditional source, tagged `conditional: "swarm"`.
5. **Fishing reachability** (new, and required).
   - Every map but 5 has a FISHGROUP, including interiors. `engine/events/overworld.asm` ~:1660 fishes only when the faced tile's `GetTileCollision` == `WATER_TILE`.
   - A map therefore has fishing encounters only if its layout contains at least one metatile with a collision quadrant whose `COLL_*` maps to the `WATER_TILE` category. Find the category table (`TileCollisionTable` or similar, under `data/collision/`) and derive the set of water `COLL_*` values from it; never hand-list them.
   - Use `proj.layout(map)` + `proj.tileset(map.tileset).collision`, reusing Task 9's `GbcProject`.
   - Measure how many maps qualify and pin it.
   - Maps with a FISHGROUP but no water tiles report no fishing, and `coverage` lists them in a `fishGroupWithoutWater` diagnostic (count pinned).
6. **Headbutt.**
   - `common` and `rare` lists are non-cumulative percents, rolled 0-99 by `SelectTreeMon`. Verify in `engine/events/treemons.asm`.
   - Which list applies depends on the tree score (player ID × tree coordinates). It is static-unknowable, so report both as separate sources (`list: "common" | "rare"`).
   - A `yieldsNothing` set (TREEMON_SET_CITY) reports no headbutt source.
7. **Rock smash.** `common` only, never `rare`, per `GbcWildForMap.rock`'s doc. Findings say rock = 40%: verify where that encounter chance lives and report it as `encounterRate`.
8. **Swarm grass/water.** A separate source with `conditional: "swarm"`, never merged.

## Deliverables
1. **`GbcProject.wild()`.** Lazy and cached `loadGbcWildData(root)`, added to `packages/core/src/gbc/project.ts` with an identity test.
2. **`packages/core/src/gbc/analyse/atlas.ts`.**
   - `gbcEncounterSources(proj, mapName): GbcEncounterSource[]`, pure over `proj`. Each source has:
     - `method: "grass" | "water" | "fish" | "headbutt" | "rock"`;
     - optional `time?: "morn" | "day" | "nite"`, `rod?: "old" | "good" | "super"`, `list?: "common" | "rare"` and `conditional?: "swarm"`;
     - optional `encounterRate?: number` (%) and `biteChance?: number` (%);
     - `chances: { species, percent, minLevel, maxLevel }[]`, merged per species within the source and sorted by percent descending.
   - `gbcWhereSpecies(proj, species): GbcSpeciesHit[]`. A hit is `{ mapName, mapConst, method, time?, rod?, list?, conditional?, percent, minLevel, maxLevel }`, sorted by percent descending. Species is matched on the constant name (e.g. `CHIKORITA`). The CLI uppercases input.
   - `gbcCoverage(proj): GbcCoverage`, containing:
     - `mapsWithEncounters` (distinct);
     - `mapsWithoutEncounters` (names);
     - `sourcesByMethod` counts;
     - `levelByMap` (per map, percent-weighted average over all its sources, weighted equally per source; document the choice);
     - `unusedSpecies`: species constants from `constants/pokemon_constants.asm` appearing in no source. Exclude non-species pseudo-constants (NO_MON, EGG, and any count/limit consts); measure and document which;
     - `fishGroupWithoutWater`;
     - `defects`: `wild().defects`, i.e. the kanto_grass terminator.
   - Build any map-const→source index once per call rather than running `wildForMap`'s linear finds for all 391 maps. Either is acceptable perf-wise per the Task 8 quality review; just don't do worse.
3. **CLI** (`gbcCommands.ts`).
   - `encounters <map>`: a human listing grouped by source, e.g. `grass (morn, rate 10%)` then rows of `  25.0%  Lv 3-7  RATTATA`. `--json` prints the sources.
   - `where <species>`: rows `mapName percent Lv method[/time][/rod][/list][ swarm]`. Empty result: `<species> appears in no encounter table`. `--json`.
   - `coverage`: a summary line, plus `--empty` / `--unused` / `--json`, mirroring GBA flag semantics.
   - Data-defect warnings go to stderr (kanto_grass).
   - Remove these three commands from the GBC refusal list.
4. **Tests.**
   - **Unit.** Hand-derived stub `GbcProject` + `GbcWildData` with exact per-source percents:
     - grass (duplicate species merged), water, fish with bite and cumulative rods, a `time_group` split into day/nite, the swarm variant, headbutt common/rare, rock common only, and a `yieldsNothing` set with no source;
     - fishing suppressed on a no-water map.
     - Build stubs from the interfaces with no unchecked partial casts.
   - **Corpus.**
     - Route29 grass per time: pin the exact percents and levels of at least 2 species, hand-derived from `johto_grass.asm` + `probabilities.asm` + the buff rule.
     - Route32 fishing: Qwilfish swarm variant present; bite chance and at least one rod's exact percents.
     - A headbutt map's common/rare lists.
     - CianwoodCity's rock source.
     - `gbcWhereSpecies("DUNSPARCE")` includes DarkCaveVioletEntrance grass swarm.
     - `gbcWhereSpecies` for a nite-only species (measure one) returns only nite hits.
     - `gbcCoverage`: pinned `mapsWithEncounters`, `fishGroupWithoutWater` count, `unusedSpecies` count plus a couple of named members, and exactly 1 defect.
     - **Success criterion 5.** `where CHIKORITA` (or a real wild species; measure) reports real Crystal locations.
   - **CLI.** `runGbc*` handler tests, plus one spawned `--project <gbc> where <species>` exit-0 test.
   - Grep `packages/*/test/**` for map names first. Everything is read-only.
5. **Mutation-check.** At minimum:
   - rod per-record probability off by one (the `<` vs `<=` boundary);
   - bite chance /255 instead of /256;
   - `time_group` day/nite swapped;
   - swarm merged into base;
   - headbutt `rare` dropped;
   - rock including `rare`;
   - the water-collision filter dropped;
   - the level buff dropped;
   - duplicate species not merged.

## Out of scope
- UI.
- Runtime-state resolution (swarm flags, tree score, time-of-day beyond buckets).
