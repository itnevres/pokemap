# Plan 6 Task 7 implementer report -- GBC map event loader

**Status:** done. `npm test` 1001/1001 green (960 baseline + 41 new). `npm run typecheck` clean. PerfPlus `git status --porcelain` empty before/after. Commit `62b55ba` on `plan-6-gbc-foundation`.

## Files
- `packages/core/src/gbc/load/asm.ts` -- added `labelTail` (exported), the shared "label's section runs to the next label" primitive, extracted from `asmSplice.ts`'s `locateEventCall`.
- `packages/core/src/gbc/write/asmSplice.ts` -- `locateEventCall` refactored to call `labelTail` instead of re-deriving the same regex/bounding logic. Pure extraction; all 32 existing tests pass unchanged (verified before writing any new code).
- `packages/core/src/gbc/model/types.ts` -- added `GbcWarpEvent`, `GbcCoordEvent`, `GbcBgEvent`, `GbcObjectEvent`, `GbcSceneScript`, `GbcCallback`, `GbcMapEvents`.
- `packages/core/src/gbc/load/events.ts` (new) -- `parseMapEvents(text, mapName)` (pure) + `loadGbcMapEvents(root, map)` (reads `maps/<name>.asm`, returns `{ events, defects }`).
- `packages/core/test/gbc/load/events.test.ts` (new) -- 41 tests: unit (inline fixtures via a line-position-tracking `skeleton()` helper, never hand-counted) + corpus (`itWithGbcCorpus`).

## Design decisions
- **Numeric-arg measurement** (ran a throwaway script using the project's own `scanCalls` over all 391 real map files, not guessed): `x`, `y` (all 4 event kinds), `destWarp` (warp), `radiusX`/`radiusY`/`sightRange` (object) are 100% clean `parseNum`-parseable across the whole corpus -- parsed as numbers. `hour1` is also 100% numeric (`-1` always) but its pair `hour2` is not (11/1468 are `DAY`/`MORN`/`NITE`), so both are kept as raw strings together, per the prompt's framing of hour1/hour2 as one semantic unit. `palette` (816/1468 are `PAL_NPC_*`) and `eventFlag` (550/1468 are `EVENT_*`) are mixed -- kept raw.
- **Section-bounding reuse**: extracted `labelTail` into `asm.ts` rather than importing `asmSplice.ts` (write module) into `events.ts` (load module) -- keeps the load→write dependency direction the codebase already has (`asmSplice.ts` already imports from `asm.ts`).
- **`object_const_def` defect, not refusal**: `loadGbcMapEvents` returns a `DataDefect` only when `0 < objectConsts.length < objects.length`. Verified over the corpus this fires exactly once, on `MoveDeletersHouse` (1 const, 2 objects). `objectConsts.length === 0` (40 maps, no marker at all) is not a defect. Two maps -- `CeruleanCave1F`/`CeruleanCave2F` -- have the marker present with 0 consts *and* 0 objects (0 === 0); these correctly count as "equal", not "none" and not "fewer". This 0/0 case is real and I initially missed it in a first draft of the corpus test's own classification logic (see Findings below) -- production `loadGbcMapEvents` defect logic was unaffected either way, since its check (`>0 && <`) already excludes 0/0.
- **Section presence + order enforced**: `def_warp_events`/`def_coord_events`/`def_bg_events`/`def_object_events` must all be present and strictly increasing in offset within the `_MapEvents:` tail, or `parseMapEvents` throws naming the map and the missing/misordered marker. This is stricter than the prompt's literal "throw naming map + line" for the missing-marker case (no single line to blame for an absent section), so those two refusals name only the map + marker, not a line number; per-event/script wrong-arg-count refusals do name `map:line`.
- `> 15 object_event`s refuses (NUM_OBJECTS 16, slot 0 is the player).

## Measured pins (differences from the prompt, if any: none found -- every corpus number below matches the prompt/findings doc exactly)
Measured via the implementation itself against `C:\Programming Projects\pokecrystal-PerfPlus` (391 maps):
- Totals: warps 1327, coords 114, bgs 792, objects 1468, sceneScripts 170, callbacks 105.
- Maxima: warps 33 (EcruteakGym), coords 30 (TeamRocketBaseB1F), bgs 38 (CeladonGameCorner), objects 15 (GoldenrodCity).
- BGEVENT types: READ 632, ITEM 85, UP 47, RIGHT 12, LEFT 10, IFNOTSET 4, IFSET 1, DOWN 1 (sums to 792).
- Hour limits: `-1,-1` x1457, `-1,DAY` x5, `-1,MORN` x3, `-1,NITE` x3 (sums to 1468).
- Warp dest `-1`: 6 events across 4 maps (GoldenrodDeptStoreElevator, FastShip1F, Pokecenter2F, CeladonDeptStoreElevator).
- `objectConsts`: equal-including-0/0 350, marker-absent 40, fewer 1 (MoveDeletersHouse) -> exactly 1 `DataDefect`.
- NewBarkTown: full warps/coords/bgs/objects/sceneScripts/callbacks/objectConsts match the real file field-by-field, including `lineIndex` (first warp = 285, cross-checked against `grep -n` on the real file: line 286 1-based = 285 0-based).
- Every warp's `mapConst` resolves to a real `GbcMap.constName` (0 unknown).
- Every event/script's `lineIndex` points at a line whose trimmed text starts with that event's own macro name (checked for all 391 maps x all 6 kinds).

## Mutation checks (all caught, all reverted -- diffed byte-identical against a pre-mutation backup after each revert)
1. Swapped `radiusX`/`radiusY` in `toObject` -> red on "parses all 13 args ... a swapped pair must fail this".
2. Dropped section-bounding (scanned the whole file text instead of the `labelTail`-bounded tail) -> **not initially caught** by the existing unit/corpus tests (single-map fixtures don't exercise cross-map leakage). Added a new test ("stops at the next map's label -- a second map's events are never borrowed into the first's", two concatenated map skeletons) which does catch it; confirmed red with the mutation in place, then green after revert. This test is now permanent in the suite (41st test), closing a real gap analogous to `asmSplice.test.ts`'s existing "stops at the next map's label" coverage for `locateEventCall`.
3. Removed the `checkSectionOrder` call entirely -> red on both "refuses when a def_* section is out of order" and "... is missing entirely".
4. Changed `parseObjectConsts`'s stop condition from `break` to `continue` (never stops) -> red on "stops at the first non-const code line after the block".

## Self-review / concerns
- `labelTail`'s own thrown message text changed from `locateEventCall: no "X:" label found` to `labelTail: no "X:" label found`; verified no existing test asserts that literal prefix (only regex on the label name itself), so this is safe.
- One transient single-test failure appeared in a full-suite run immediately after the last mutation-revert cycle (rapid disk writes to `events.ts` under Windows/git-bash); a `diff` against a saved pre-mutation backup confirmed the file was byte-identical to the correct version, and the very next full run was 1001/1001 green with no changes in between -- treated as an environment flake, not a code issue.
- Did not add a dedicated test for `_MapScripts:` label being absent (the prompt's refusal list only names the `_MapEvents:` label); `labelTail` throws naturally on that path too as a free side effect of reuse, but it's untested here since the real corpus always has both labels (findings §3.1).

## Fix round 1

Spec review (`task-7-spec-review.md`) verdict: code correct (0 mismatches on an independent 391-map re-parse, no mutation residue), but 2 test gaps -- both cases where deleting real behavior from `events.ts` still passed every test:

1. `_MapScripts:` section bounding: the existing two-map "stops at the next map's label" test checked only `warps`; nothing isolated `sceneScripts`/`callbacks` specifically. Added a matching two-map variant asserting each map's scene_script/callback counts and content.
2. The `def_*` order/presence refusal was only exercised via a warp/coord swap; `def_object_events` itself was never the one out of order or missing. Added both: `def_object_events` before `def_bg_events`, and `def_object_events` missing entirely -- both asserting the thrown message names `def_object_events`.

Mutation-checked both before committing: (a) made the `_MapScripts` scan unbounded (`scanCalls(text, ...)` instead of `scanCalls(scriptsTail.text, ...)`) -> the new MapScripts-bounding test went red (expected 1, got 3); (b) dropped `def_object_events` from `SECTION_MARKERS` -> both new order/missing tests went red. Reverted each mutation and `diff`-confirmed `events.ts` byte-identical against a pre-mutation copy before moving to the next check and before committing.

Result: `npm test` 1004/1004 green (44 tests in `events.test.ts`, up from 41). `npm run typecheck` clean. PerfPlus porcelain empty. Commit `1929e4d` on `plan-6-gbc-foundation`.
