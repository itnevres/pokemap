# Plan 6 Task 8 — spec-compliance review (commit 16fad97 vs ac3fd3e)

Verdict: ❌ ISSUES (4). Data parse is correct: my independent whole-corpus parser found 0 mismatches. The problems are in refusal behaviour and test strength.

## Verification run
- `npm test`: 84 files / 1042 tests green. `npm run typecheck`: clean. Verbose gbc run: 10 files / 323 tests, all 38 encounters tests green.
- Independent parser (scratchpad `verify8.ts`, own line/`db`/`percent` evaluator; it does not use `asm.ts`). It compared every field of every grass/water/swarm entry (file, mapConst, swarm, lineIndex, raw and resolved rates, all slots), probabilities, all 13 fish groups (bite chance, every rod record raw and resolved, time_group index), 22 TimeFishGroups rows, 11 treemon sets (common/rare), 66 tree and 4 rock map rows. It also ran `wildForMap` on all 391 maps against my own join (grass/water base and swarm, fish group and swarm variant, headbutt set and yieldsNothing, rock). **Result: 0 mismatches.**
- Measured counts: grass 61/33/2, water 38/24/0. Unterminated files: only kanto_grass. Maps with grass 94, water 62, fishing 386, headbutt 66, rock 4, CITY headbutt 13. Fish-group usage: SHORE 315, LAKE 24, POND 15, OCEAN 11, WHIRL 8, DRATINI 7, NONE 5, GYARADOS 2, QWILFISH_NO_SWARM 2, QWILFISH 1, DRATINI_2 1. REMORAID: 0 maps.
- Subject porcelain empty after. PokeMap tree: only untracked reports.

## Probe answers
- **"bare map_id" swarm shape** ✅. swarm_grass.asm uses `map_id MAP` + `db` rate + 21 `db` slots, with no def_/end_ wrapper. `def_grass_wildmons` itself expands to label + `map_id` (macros/asserts.asm:41), so the bytes are identical. The engine's `_SwarmWildmonCheck` does a `LookUpWildmonsForMapDE` on SwarmGrassWildMons at the same stride. Entries: DARK_CAVE_VIOLET_ENTRANCE (Dunsparce) and ROUTE_35 (Yanma). swarm_water.asm is a label, a comment and `db -1`, so it really has 0 entries and nothing is skipped. My parser throws on any unknown line and agrees.
- **`percent`** ✅. `DEF percent EQUS "* $ff / 100"` (macros/data.asm:22). `N percent ± k` → `N*255/100 ± k`, evaluated left to right as integers. Occurring shapes: N ∈ {2,4,6,8,10,35,40,70,100}, `50/70/85/90 percent + 1`. There is no `-` form in the corpus, though the parser supports one. Every occurrence in the grass, water, fish bite and rod files matches my evaluator (e.g. 70p+1=179, 85p+1=217, 90p+1=230, 35p=89, 40p=102, 50p+1=128, 100p=255).
- **Fishing swarm** ✅. QWILFISH→QWILFISH_SWARM and REMORAID→REMORAID_SWARM, matching `GetFishGroupIndex`. QWILFISH_NO_SWARM gets no variant, which is correct. Index = FISHGROUP−1 (NONE excluded), verified for all 13 groups.
- **Johto/Kanto** ⚠️. `wildForMap` searches the concatenated Johto+Kanto list (first match). The engine picks one regional list via `IsInJohto`. Measured on this corpus: 0 map consts appear in both lists, every Johto-list map has a Johto landmark and every Kanto-list map a Kanto landmark, and no LANDMARK_SPECIAL map has wild data. The output is therefore identical here, but it is not engine-faithful by construction and nothing documents it. Mutation M13 (Kanto first) is equivalent on the corpus.
- **Headbutt** ✅. Common and rare are both reported, and the tree score is not needed (findings: static atlas reports both lists). TreeMons is resolved by pointer order (KTOWN/KROUTE correct). The trailing `; unused` dw is excluded. CITY yieldsNothing covers 13 maps. City/Canyon stacked labels share one body.

## Spec items
| Item | | Evidence |
|---|---|---|
| Types + pure per-file parsers | ✅ | parseGrassFile/WaterFile/WildProbabilities/FishGroups/TreemonSets/TreemonMaps |
| `loadGbcWildData` reads each file once | ✅ | 8 wild files + 2 const files, one read each |
| Grass 3 rates + 3×7 slots in morn/day/nite order | ✅ | 0 mismatches. DIGLETTS_CAVE 4/2/8 percent (the only unequal-rate entry) resolved as morn 10 / day 5 / nite 20 |
| Water 1 rate + 3 slots | ✅ | 0 mismatches |
| Swarm tagged, never merged | ✅ (impl) / ❌ (tests, see #4) | `swarm` flag; `wildForMap` returns base and swarm separately |
| kanto_grass EOF + exactly 1 DataDefect | ✅ | defects = [kanto_grass] |
| Probabilities parsed, cumulative → per-slot | ✅ | 25,25,20,10,10,5,5 / 45,30,25 |
| `percent` real definition, refuse other shapes, raw kept | ✅ | refusal names the text only (see #3) |
| Fish `FishGroups[x−1]`, bite, cumulative rods, last = 100% | ✅ | all 39 rod tables end at 255 |
| `time_group n` → TimeFishGroups[n] | ✅ | max index 21, 22 rows |
| Treemon/Rock maps `db -1`, pointer-table sets, non-cumulative lists | ✅ | 66/4, 11 sets |
| CITY yields nothing (13) | ✅ | |
| Rock single list | ✅ | 90 KRABBY 15 / 10 SHUCKLE 15, rare null |
| Paths via real INCLUDE sites where practical (I4) | ⚠️ | All 10 paths are hardcoded literals. The INCLUDE sites exist (wildmons.asm:350,1064-1069; fish.asm:127; treemons.asm:94,123). The report says nothing about it. Low risk: the literals equal the INCLUDE strings verbatim (no name-mangling), and a moved file fails loudly with ENOENT |
| Refuse unknown map consts / unparsable args / arg-count mismatch, naming file+line | ❌ | #1, #2, #3 |
| Test pins (defect 1, probs, SproutTower2F, 13 groups, 22 rows, .Shore_Good, last rod 100%, 66/4, 11 sets, 13 CITY, rock set, map consts real, NewBarkTown, Route29, vacuous guard) | ✅ | all present and green |
| Mutation testing | ⚠️ | the implementer's 5 mutations are valid, but my 7 survivors show gaps (#4) |

## Issues
1. ❌ **Arg-count mismatch silently accepted.**
   - `readSlots` checks only `level/species === undefined`. `db 3, RATTATA, 9` is accepted and the 3rd arg is dropped (probed: ACCEPT).
   - `parseTreemonSets` reads at most 2 `db -1` lists, and any further lists in a set body are silently dropped (probed: ACCEPT).
2. ❌ **Unknown consts not refused.**
   - The loader never validates map consts. `def_grass_wildmons NOT_A_MAP` parses fine (probed). Only a corpus *test* checks for real maps.
   - `wildForMap` resolves `treemon_map`'s set const with `find(...) ?? null`. An unknown `TREEMON_SET_TYPO` silently yields `headbutt {set:null, yieldsNothing:false}` and `rock: null`, indistinguishable from "no headbutt" (probed). This is inconsistent with the unknown-fishgroup path, which throws.
3. ❌ **Refusals don't name file+line.** Only `parseTreemonMaps` ("treemon_maps.asm:2: …") and the rate-count checks (file, no line) name a location. Probed messages:
   - `evalPercent: "2 * percent" is not…` (no file or line).
   - `ROUTE_29: slot line has fewer than 2 arguments` (no file or line).
   - `parseNum: "FOO"…` (no context at all).
   - `rod record: "…"`, `TimeFishGroups row 1: …`, `treemon record: "50, SPEAROW"…`, and `readDb` "expected a db line" (file, no line).
   - `lineIndex` is available from `codeLines` but isn't used in the errors.
4. ❌ **Mutations surviving (38/38 green), all reverted.**
   - M1: swarm_grass loaded with `swarm=false`.
   - M12: `wildForMap` grass lookup ignores the swarm tag, so Route35 `grass.swarm` returns the Johto base entry. This defeats "tagged never merged".
   - M9: swarm_water untagged (equivalent: 0 entries).
   - M2: fish swarm map crossed (QWILFISH→REMORAID_SWARM). `swarmVariant` is never asserted non-null; the only map with a variant is the one QWILFISH map.
   - M8: FISHGROUP_NONE branch removed, so `wildForMap` would throw on the 5 NONE maps. The test titled "13 fish groups + NONE handled by wildForMap" never calls `wildForMap`.
   - M10: grass morn/nite rates swapped. DIGLETTS_CAVE 4/2/8 is not pinned, and the unit fixture uses equal rates.

   Mutations that went red: M3 fishgroup const offset (1), M4 CITY index→1 (5), M5 time_group+1 (2), M6 water rate+1 (1), M7 yieldsNothing forced false (1), M11 rock lookup via treemonMaps (1).
   - Suggested pins: Route35 or DarkCaveVioletEntrance `wildForMap` (swarm is the swarm_grass entry, base is the johto entry, and they differ); the QWILFISH map's `swarmVariant` = QWILFISH_SWARM and a SHORE map's = null; one FISHGROUP_NONE map → `fishing.group` null; DIGLETTS_CAVE rates 10/5/20.

## Minor (non-blocking)
- `types.ts` GbcFishGroup doc says the bite roll "must be `<=`". The engine does `cp [hl] / jr nc, .no_bite`, so it bites only when roll < chance. The rod-record `<=` doc is correct.
- `cumulativeToPerSlot`: a `mon_prob` with a missing arg crashes with a TypeError instead of a named refusal.
