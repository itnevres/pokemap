# Plan 6 Task 8 — spec-compliance re-review, fix round 1 (c867934 vs 16fad97)

Verdict: ❌ ISSUES (3)

The data parse is unchanged (0 mismatches against 16fad97 over the whole corpus). All 4 original Issues and both Minors are fixed in behaviour: every refusal listed in the first review now names the file and the correct 1-based line, unknown consts are refused at load time, and `wildForMap` throws on an unresolvable set const.

Three gaps remain:
- A class of refusals still carries no location.
- One arg-count mismatch is still silently accepted.
- 23 of my mutations against the new guards survive, so most of the new behaviour is unpinned.

## Verification run
- `npx vitest run packages/core/test/gbc`: 10 files, 346/346 passed, 0 skipped. `npm run typecheck`: clean.
- Subject `/home/user/pokecrystal-PerfPlus` is at 81ededbe3 with empty porcelain before and after. I never wrote to it; my probes ran on a copy in the scratchpad.
- **Regression.** I extracted 16fad97's `encounters.ts` into the scratchpad (imports rewritten to absolute paths; `asm.ts`/`map.ts` were not changed by c867934). `isDeepStrictEqual` found **0 mismatches** on:
  - every field of old vs new `loadGbcWildData`: grass, water, probabilities, fishGroups, timeFishGroups, treemonSets, treemonMaps, rockMonMaps, defects;
  - `wildForMap` on all 391 maps.

  Counts: grass 96 (61/33/2), water 62, fish groups 13, TimeFishGroups 22, treemon sets 11, tree rows 66, rock rows 4, defects = [kanto_grass]. Probabilities: 25,25,20,10,10,5,5 / 45,30,25.
- **Ad-hoc refusal probes** (scratchpad `sr2/probe.ts`, `sr2/loadprobe.ts`). The fixtures have leading comment and blank lines, comments and blanks inside bodies, and `; nested ; comment` lines. I counted every expected line by hand when building each fixture.

## Measured claims (re-derived against the subject)
| Claim | | Evidence |
|---|---|---|
| YANMA in both Route35 base and swarm grass; NIDORAN_M swarm-only | ✅ | johto_grass.asm:1414/1422/1430 (YANMA in base, no NIDORAN_M). swarm_grass.asm:36 (NIDORAN_M) and 38-39 (YANMA). Loader output: base {YANMA ✓, NIDORAN_M ✗}, swarm {✓, ✓} |
| Route32 is the one FISHGROUP_QWILFISH map | ✅ | maps.asm:258 is the only hit. The loader agrees (`['Route32']`) |
| DIGLETTS_CAVE raw rate text | ✅ | kanto_grass.asm:6 `db 4 percent, 2 percent, 8 percent` → 10/5/20. It is the only unequal-rate grass entry of 96 |
| FISHGROUP_NONE map set | ✅ | maps.asm:218,224,229,429,430 = CeruleanGym, Route4, CeruleanCity, Route17, CeladonCity (5). The loader agrees |

## Per-issue table
| Item | | Evidence |
|---|---|---|
| Issue 1: slot arg count | ✅ | `db 5, RATTATA, 9` → `g.asm:20: ROUTE_29: slot line has 3 argument(s), expected 2`. `db 5` → `g.asm:27: … has 1 …`. Water: `w.asm:10` (extra), `w.asm:11` (missing). All lines are correct |
| Issue 1: 3rd treemon list | ✅ | `t.asm:19: TreeMonSet_City: unexpected data after the rare list ("10, AIPOM, 5")`. A lone extra `db -1` is also refused (`t.asm:19`) |
| Issue 1: arg-count elsewhere | ⚠️ | Refused with the correct line in both directions: mon_prob 3/1 (`p.asm:15`, water `p.asm:22`), fishgroup 3/5 (`f.asm:12`), rod 1/4/2-non-tg (`f.asm:18`/`:29`), TimeFishGroups 5/3 (`f.asm:35`), treemon 4/2 (`t.asm:16`/`:13`), treemon_map 3/1 (`m.asm:5`/`:10`), grass header 2 args (`g.asm:6`), grass rate 4 (`g.asm:7`), water rate 2 (`w.asm:6`). **Exception:** `db 100 percent, time_group 0, 5` is ACCEPTED (see ❌2) |
| Minor 2: mon_prob missing arg | ✅ | `p.asm:15: "mon_prob" has 1 argument(s), expected 2`, no longer a TypeError |
| Issue 2: unknown map consts at load time | ✅ | On a copy of the real corpus, each of these refused with the correct file:line:<br>- swarm grass typo (with 2 prepended lines) → `swarm_grass.asm:36`<br>- kanto water `VERMILLION_PORT` → `kanto_water.asm:12`<br>- rock row `ROUTE_4O` → `treemon_maps.asm:80`<br>- headbutt row → `:21`<br>- a non-map const (`TREEMON_SET_CITY`) as a grass map → `johto_grass.asm:5`<br>- a typo in the last entry of unterminated kanto_grass → `kanto_grass.asm:901` |
| Issue 2: unknown set consts at load time | ✅ | Headbutt `TREEMON_SET_KANT0` → `treemon_maps.asm:74`. Rock `TREEMON_SET_R0CK` → `:82`. A real-but-wrong-family const (`FISHGROUP_SHORE`) → `:74` |
| Issue 2: `wildForMap` throws on an unresolvable set | ✅ | Headbutt and rock rows both give `wildForMap: Mm: unknown treemon set "TREEMON_SET_TYPO"`. No row gives `{set:null, yieldsNothing:false}` and `rock:null` |
| Issue 3: the 7 message classes from review 1 | ✅ | `g.asm:7: evalPercent: "2 * percent" …`, `g.asm:9: parseNum: "FOO" …`, `f.asm:29: rod record: …`, `f.asm:35: TimeFishGroups row 1: …`, `t.asm:13: treemon record: …`, `g.asm:12: ROUTE_29: expected a "db" line …`, `f.asm:11: evalPercent …` (bite chance). All the line numbers match my hand count |
| Issue 3: *all* refusals name file+line | ❌ | See ❌1: `splitArgs` blank-arg refusals and the probabilities missing-label refusal have no location |
| Issue 4: M1/M2/M8/M10/M12 pinned | ✅ | All red (mutation table) |
| Minor 1: biteChance doc | ✅ | types.ts now says strictly less-than. That matches engine/events/fish.asm:28-30 (`cp [hl]` / `jr nc, .no_bite`) |

## Mutation table
Each mutation was a single exact-match replacement on a pristine snapshot, followed by a run of `encounters.test.ts` (61 tests). The file was restored after each, and in a `finally`. Final sha256 equals the pristine snapshot. `git diff -- packages/` is empty afterwards and the gbc suite is green again (346/346).

| # | Mutation | Result |
|---|---|---|
| M1 | swarm_grass loaded `swarm=false` | RED (3) |
| M2 | QWILFISH → REMORAID_SWARM | RED (1) |
| M8 | FISHGROUP_NONE branch removed | RED (5) |
| M10 | grass morn/nite rate swap | RED (2) |
| M12 | `findGrass` ignores the swarm tag | RED (1) |
| N1a | drop `at()`: readSlots level parseNum | **GREEN** |
| N1b | drop `at()`: grass **morn** rate evalPercent | **GREEN** |
| N1c | drop `at()`: grass day rate evalPercent | RED (1) |
| N1d | drop `at()`: water rate evalPercent | **GREEN** |
| N1e | drop `at()`: mon_prob parseNums | **GREEN** |
| N1f | drop `at()`: rod chance evalPercent | **GREEN** |
| N1g | drop `at()`: rod species level parseNum | **GREEN** |
| N1h | drop `at()`: fishgroup biteChance | RED (1) |
| N1i | drop `at()`: TimeFishGroups levels | **GREEN** |
| N1j | drop `at()`: treemon record parseNums | **GREEN** |
| N2 | `fail` prints lineIndex (not +1) | RED (11) |
| N2b | `at` prints lineIndex (not +1) | RED (2) |
| N3a | skip map-const validation for swarm grass only | **GREEN** |
| N3b | skip map-const validation for all water | **GREEN** |
| N3c | skip map-const validation for kanto grass only | **GREEN** |
| N3d | skip map-const validation for rock rows only | **GREEN** |
| N4a | skip set-const validation for rock rows only | RED (1) |
| N4b | skip set-const validation for headbutt rows only | RED (1) |
| N4c | `wildForMap` rock path back to `?? null` | RED (1) |
| N5 | allow a 3rd treemon list | RED (1) |
| N6a | readSlots allows extra args (`< 2`) | RED (1) |
| N6b | readSlots allows **missing** args (`> 2`) → species `undefined` silently | **GREEN** |
| N7a | mon_prob allows extra args | **GREEN** |
| N7b | mon_prob allows missing args | RED (1) |
| N8 | treemon record allows extra args | **GREEN** |
| N9 | treemon_map arg-count check removed | **GREEN** |
| N10 | TimeFishGroups allows extra args | **GREEN** |
| N11 | fishgroup allows extra args | **GREEN** |
| N12 | rod record ≥3 args treated as species | RED (1) |
| N13 | grass header arg-count check removed | **GREEN** |
| N14 | water rate arg-count check removed | **GREEN** |
| N15 | water header arg-count check removed | **GREEN** |
| N16 | `labelTailText` lineIndex −1 | RED (1) |
| N17 | mon_prob lineIndex drops the tail offset | RED (1) |
| N18 | fishgroup lineIndex from the label line, not the body | RED (1) |
| N19 | `dbLinesIn` line +1 | RED (4) |
| N20 | `labelSections` bodyLineIndex from the FIRST stacked label | **GREEN** |
| N21 | treemon_map row lineIndex +1 | RED (4) |
| N22 | grass entry lineIndex = rate line | RED (1) |
| N23 | `readDb` reports the next line | RED (3) |
| N24 | grass map-const validation vacuous | RED (1) |
| N25 | parseWaterFile ignores `swarm` (M9 parser-level) | RED (1) |

Survivors: 23. The implementer's own mutation 7 ("drop the `at()` on the grass rate-line evalPercent calls") went red only because it dropped all 3 wrappers and the test uses the day slot. Dropping the morn wrapper alone survives.

## Issues
1. ❌ **Some refusals still don't name file+line** (original Issue 3, not fully closed; the commit message's "every refusal now goes through `fail`" is not true).
   - `splitArgs`/`splitArgsWithOffsets` throws a location-free `splitArgs: blank argument in "…"` for a blank or trailing-comma arg. Probed:
     - `db 5, , RATTATA` in a grass slot;
     - `db 5, RATTATA,`;
     - `mon_prob 95, , 5`;
     - `db 100 percent, , 40` in a rod table.

     All four messages lack file and line. The call sites are:
     - `readDb` → `splitArgs` at encounters.ts:115;
     - `dbLinesIn` at :332;
     - `matchCall` at :156/:202;
     - `scanCalls` at :254 (mon_prob), :353 (fishgroup) and :486 (treemon_map).

     Wrap each through `at(file, lineIndex, …)`. `scanCalls` throws before any per-call lineIndex exists, so those three sites need a fallback: wrap the whole `scanCalls` call and name the file, or pre-split per line.
   - `labelTailText` (:243) throws a bare `no "GrassMonProbTable:" label found` with no file. Every sibling missing-label refusal (`FishGroups`, `TreeMons`, `TimeFishGroups`) uses `fail(file, null, …)`. Pass `file` in and route this one through `fail` too.
   - Pin one blank-arg case and the missing-label case with exact `^file:line:` regexes.
2. ❌ **A rod-record arg-count mismatch is still silently accepted.**
   - `db 100 percent, time_group 0, 5` is 3 args, so `toRodRecord` (:318) takes it as a species record with `species: "time_group 0", level: 5`. Probed: ACCEPT.
   - `time_group` is `EQUS "0,"` (fish.asm:1), so this is a time_group reference plus an extra arg: 4 bytes where the engine reads 3.
   - Fix: refuse a 3-arg record whose species arg starts with `time_group` (or more generally isn't a bare identifier), naming file:line. Pin it.
3. ❌ **23 mutation survivors against the new guards.** The behaviour is correct (my probes above all refuse), but these guards are unpinned. Each of the following needs a test with an exact `^file:line:` message:
   - **Map-const validation.** It is pinned only for johto grass and headbutt rows. Water validation can be deleted outright (N3b), and so can the swarm-grass (N3a), kanto-grass (N3c) and rock-row (N3d) validation.
     - Add loader fixtures for an unknown map const in: a water file, `swarm_grass.asm` (a `map_id` header), `kanto_grass.asm` (unterminated, so the file still loads to the validation step) and a `RockMonMaps` row.
     - Alternatively, one parametrised test over all four.
   - **`at()` wrappers.** Only 2 of 10 are pinned: grass day rate and fishgroup bite chance. Pin a bad value for each of:
     - readSlots level (N1a);
     - grass morn rate (N1b); the nite rate is pinned by neither test, so make the fixture or test cover all 3 rate args;
     - water rate (N1d);
     - mon_prob index/cumulative (N1e);
     - rod chance (N1f);
     - rod level (N1g);
     - TimeFishGroups level (N1i);
     - treemon percent/level (N1j).
   - **Arg-count, the other direction.** Each of these checks can be loosened or removed with no test going red:
     - readSlots *missing* arg (N6b; mutated, `db 5` silently yields `species: undefined`);
     - mon_prob *extra* (N7a);
     - treemon record *extra* (N8);
     - treemon_map both directions (N9);
     - TimeFishGroups *extra* (N10);
     - fishgroup *extra* (N11);
     - grass header (N13);
     - water rate (N14);
     - water header (N15).

     The brief requires "extra AND missing refused everywhere". Add the missing direction to each existing pin, and new pins for treemon_map, grass/water header and water rate.
   - **Stacked-label line numbers (N20).** `bodyLineIndex` taken from the first label of a stacked run survives. Add a treemons fixture error inside a stacked `TreeMonSet_City:`/`TreeMonSet_Canyon:` body (the real corpus shape) and pin its line.

## Minor (non-blocking)
- A second `db -1` list in a set used only by `RockMonMaps` is reported as `rare`. The engine's rock path never reads a rare list: `RockMonEncounter` (engine/events/treemons.asm:29-50) calls `GetTreeMons` then `SelectTreeMon`, with no tree-score or rare branch. Probed: ACCEPT. There is no such shape in the corpus (TreeMonSet_Rock has one list, `rare: null`, pinned). Consider documenting this, or refusing a rare list on a set referenced only by rock rows.
- Loader-level M9 (swarm_water tagged `false`) is still equivalent on the corpus, since swarm_water.asm has 0 entries. It is covered at parser level by N25 (red), which is acceptable.
