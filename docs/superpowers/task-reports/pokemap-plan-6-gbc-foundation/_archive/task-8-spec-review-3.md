# Plan 6 Task 8 — spec-compliance re-review, fix round 2 (6c23b23 vs c867934)

Verdict: ❌ ISSUES (2)

Round 2 closes most of review 2. These now refuse correctly and are pinned:
- Issue 2 (`time_group` + extra arg).
- Review 2's 23 mutation survivors.
- The missing prob-label location.
- Blank args at 5 of the 8 call sites (per-line sites).

Two things remain:
- Blank-arg refusals at the three `scanCalls` sites name a **wrong** line or no line.
- 5 mutations against the new prob-table checks survive.

The data parse is unchanged from 16fad97.

## Verification run
- HEAD 6c23b23. `git diff 6c23b23 -- packages/` is empty (only untracked reports and the local `pokemap.config.json` edit remain).
- `npx vitest run packages/core/test/gbc`: 10 files, 387/387 passed, 0 skipped. `npm run typecheck`: exit 0.
- **Regression.** I compared 16fad97's `encounters.ts` against HEAD with `isDeepStrictEqual`. The old copy was re-extracted fresh and is byte-identical to the one used in review 2. **0 mismatches** over:
  - every `loadGbcWildData` field;
  - `wildForMap` for all 391 maps.

  The counts are unchanged: grass 96 (61/33/2), water 62, fish groups 13, TimeFishGroups 22, treemon sets 11, tree/rock rows 66/4, defects = [kanto_grass], probabilities 25,25,20,10,10,5,5 / 45,30,25.
- Subject `/home/user/pokecrystal-PerfPlus` is at 81ededbe3 with empty porcelain. Probes: `scratchpad/sr3/probe.ts`. Mutations: `sr3/mutate_orig.mjs` (review 2's set, unchanged) and `sr3/mutate3.mjs` (re-expressed plus new).

## Probe results
Line numbers were counted by hand in fixtures that have leading comment and blank lines, and blanks and comments inside bodies. I also used CRLF variants.

| Case | Expected | Got | |
|---|---|---|---|
| grass slot `db 5, , RATTATA` / `db 5, RATTATA,` | g.asm:10 | `g.asm:10: splitArgs: blank argument…` | ✅ |
| grass rate blank arg | g.asm:7 | g.asm:7 | ✅ |
| water slot blank arg | w.asm:11 | w.asm:11 | ✅ |
| grass header `def_grass_wildmons ROUTE_29,` | g.asm:6 | g.asm:6 | ✅ |
| swarm `map_id , ROUTE_35` | s.asm:6 | s.asm:6 | ✅ |
| water header blank arg | w.asm:5 | w.asm:5 | ✅ |
| rod record blank arg (two sites) | f.asm:29 / f.asm:18 | f.asm:29 / f.asm:18 | ✅ |
| TimeFishGroups blank arg | f.asm:35 | f.asm:35 | ✅ |
| treemon record blank arg | t.asm:16 | t.asm:16 | ✅ |
| **mon_prob blank arg, grass** | p.asm:15 | **p.asm:8** (first line of the table tail) | ❌ |
| **mon_prob blank arg, water** | p.asm:22 | **p.asm:19** | ❌ |
| **fishgroup blank arg** (2nd call / 1st call) | f.asm:12 / f.asm:11 | **f.asm:9 / f.asm:9** | ❌ |
| **treemon_map blank arg** (headbutt / rock) | m.asm:5 / m.asm:10 | **`m.asm:` (no line)** | ❌ |
| missing `GrassMonProbTable:` / `WaterMonProbTable:` label | file (whole-file refusal) | `p.asm: no "…:" label found` | ✅ |
| `db 100 percent, time_group 0, 5` | f.asm:18 | `f.asm:18: rod record: … is neither …` | ✅ |
| `time_group 0, 5, 6` / bare `time_group` / `time_group X` | f.asm:18 | f.asm:18 (all three) | ✅ |
| prob count 6 / 8; water count 2 | refuse | `q.asm:2` / `q.asm:2` / `q.asm:11` (first line of the tail) | ✅ (see Minor 2) |
| prob duplicate index / index 7 / index −1 | the offending line | q.asm:5 / :8 / :2 | ✅ |
| prob decreasing / first cumulative −5 | the offending line | q.asm:5 / :2 | ✅ |
| prob ends at 99 / 101 | last line | q.asm:8 / :8 | ✅ |
| prob lines out of index order but valid; equal consecutive values (a 0% slot) | accept | accepted, correct per-slot values | ✅ |
| stacked `TreeMonSet_City:`/`Canyon:` bad record | t.asm:10 | t.asm:10 | ✅ |
| CRLF: rod / treemon / mon_prob arg count | :29 / :16 / :15 | :29 / :16 / :15 | ✅ |
| `time_group 9` when TimeFishGroups has 2 rows | refuse? | **ACCEPTED**, `timeGroupIndex: 9` | ⚠️ Minor 1 |

## Mutation table
Every mutation was an exact single-match replacement on a pristine snapshot. The file was restored after each, and in a `finally`. Final sha256 of `encounters.ts` and `asm.ts` equals the snapshots, `git diff -- packages/` is empty, and the gbc suite is green again (387/387).

**Review 2's set, re-run unchanged** (`mutate_orig.mjs`): 39 applied and **all 39 RED**.
- The 5 BADPATTERN ones (M1, N2b, N12, N16, N19) are re-expressed below.
- N2 now hits the shared `locate`: RED (52).

**Re-expressed and new** (`mutate3.mjs`):

| # | Mutation | Result |
|---|---|---|
| M1' | swarm_grass `{ swarm: false }` | RED (3) |
| N2b' | `at()` location −1 (`fail` untouched) | RED (18) |
| N2c | `fail()` location −1 (`at` untouched) | RED (34) |
| N12' | rod `>= 3` args treated as species | RED (1) |
| N16'a | asm.ts `labelTail` lineIndex +1 (full gbc suite) | RED (24) |
| N16'b | `getLabelTail` shifts lineIndex +1 | RED (10) |
| N19' | `dbLinesIn` line +1 | RED (14) |
| A1-A7 | drop the `at()` around each new splitArgs/matchCall/scanCalls site (7 mutations) | RED (1 each) |
| A8 | `getLabelTail` rethrows the bare error | RED (1) |
| A9 | mon_prob scanCalls anchor → `null` | RED (1). The test pins the wrong line, see ❌1 |
| B1 | drop the `secondArgIsTimeGroup` guard | RED (1) |
| B2 | the guard matches only a bare `time_group` | RED (1) |
| C1 | count check removed | RED (1) |
| C1a | count check allows fewer | RED (1) |
| C1b | count check allows more | GREEN, **equivalent**: 8 calls in 0..6 always trip the uniqueness check, so it is still refused at the correct line |
| C1c | water expected count = 7 | RED (34) |
| C1d | count refusal anchored `null` | RED (1) |
| C2 | index check removed | RED (2) |
| C2a | index **lower bound** (`< 0`) dropped | **GREEN** |
| C2b | index upper bound dropped | RED (1) |
| C2c | index upper bound `>` instead of `>=` | **GREEN** |
| C2d | index uniqueness dropped | RED (1) |
| C2e | index refusal anchored at the table line | RED (2) |
| C3 | monotonic check removed | RED (1) |
| C3a | monotonic made strict (refuses a legal 0% slot) | **GREEN** |
| C3b | monotonic refusal anchored at the table line | RED (1) |
| C4 | ends-at-100 removed | RED (1) |
| C4a | ends-at-100 allows < 100 | RED (1) |
| C4b | ends-at-100 allows **> 100** | **GREEN** |
| C4c | ends-at-100 refusal anchored at the first entry | RED (1) |
| C5 | sort-by-index removed (file order used) | **GREEN** |
| D1 | parseGrassFile ignores `options.swarm` | RED (4) |
| D2 | parseWaterFile ignores `options.swarm` | RED (1) |
| D3 | orderedNames ignores `excludeZero` | RED (33) |
| D4 | swarm_water loaded `{ swarm: false }` | GREEN, **equivalent** on the corpus (0 entries), as accepted in reviews 1 and 2. Covered at parser level by D2/N25 (RED) |
| E1 | `dbLinesIn` stops skipping blank lines | RED (52) |

Survivors (not equivalent): C2a, C2c, C3a, C4b, C5.

## Quality-review items (correctness only)
- **`labelTail` reuse.** Correct.
  - `lineIndex` is the count of `\n` before the tail offset, so it is the tail's first line (checked by N16'a/N16'b going red, and by CRLF probes).
  - One behavioural difference from the old `labelTailText`. `LABEL_LINE_RE` bounds the tail only at a label that is alone on its line (optionally with a comment). The old regex bounded at any `Ident:` prefix. No `Label: code` line exists in the subject's probabilities.asm, and a tail that ran on would now trip the new exact-count check, so this is safe.
  - The missing-label throw goes through `fail(file, null, …)`.
- **`codeLines` in `dbLinesIn`.** Correct.
  - `relIndex` is relative to the body, and the body starts exactly at `bodyLineIndex`; CRLF probes give the correct lines.
  - `codeLines` also skips `MACRO…ENDM` lines inside a body. No rod, time or treemon body has one, and the output is unchanged (regression 0).
- **Options objects.** Correct. Defaults are preserved (`swarm=false`, `excludeZero=false`) and every call site was updated. D1-D3 went red.

## Issues
1. ❌ **Blank-arg refusals at the three `scanCalls` sites name a wrong line or none.** The requirement is a correct 1-based file:line.
   - What happens now:
     - **mon_prob** (encounters.ts:279) is anchored at `tail.lineIndex`, the first line after the label. A blank arg on p.asm:15 reports `p.asm:8`, and one on water line 22 reports `p.asm:19`.
     - **fishgroup** (:417) is anchored at `bodyLineIndex`. Blank args on f.asm:11 and f.asm:12 both report `f.asm:9`.
     - **treemon_map** (:550) is `at(file, null, …)`: no line at all.
   - A wrong line number is worse than none. Also, the test `refuses a blank comma-separated arg in a mon_prob call` pins the wrong line (`probabilities.asm:7`), so the defect is baked into the suite.
   - I accept my share of this: review 2 offered "wrap the whole `scanCalls` call and name the file" as a fallback. That covers treemon_map's file-only form. It does not cover naming a line that isn't the bad one.
   - **Fix.** Give all three sites a per-line location. Iterate `codeLines(text)`, and for each line matching `^\s*<macro>\s`, run `at(file, base + l.lineIndex, () => matchCall(l.text, macro))`. The base is `tail.lineIndex` or `bodyLineIndex`, and 0 for treemon_map. This can replace `scanCalls` or run as a pre-pass before it. Then re-pin the three tests with the exact bad line.
2. ❌ **5 surviving mutations in the new prob-table checks** (`cumulativeToPerSlot`). Each needs one pin:
   - **C2a:** `mon_prob 25, -1` in place of index 0. Without the lower bound, 7 unique in-range-looking indices pass and slot −1 is silently accepted.
   - **C2c:** index exactly `expectedCount` (`mon_prob 100, 7` in grass). The existing test uses 9, so the `>=` boundary is unpinned.
   - **C4b:** a table ending at 101. Only < 100 is pinned; `prev !== 100` can become `prev < 100` with no test failing.
   - **C3a:** a table with equal consecutive cumulative values (a 0% slot) must be **accepted**. Nothing pins that the check is non-decreasing rather than strictly increasing, so it could start refusing legal data.
   - **C5:** a table whose `mon_prob` lines are out of index order must produce the index-ordered per-slot values. Every fixture and the corpus are in order, so dropping the sort is invisible. The sort pre-dates round 1, but the new index checks make ordering load-bearing.

## Minor (non-blocking)
1. **`time_group n` is never checked against `TimeFishGroups`.** `db 100 percent, time_group 9` with 2 rows loads as `timeGroupIndex: 9`, a dangling reference that a consumer would resolve to `undefined`. On the corpus the maximum is 21 with 22 rows. `parseFishGroups` has both lists, so it could refuse `n >= timeFishGroups.length`, naming the rod line. This is consistent with how unknown set consts and fish groups are treated. It is new in this review (I missed it before), so it is non-blocking.
2. **The count-mismatch refusal is anchored at the tail's first line** (`q.asm:2`; the real file's line 7, `table_width`), not the label line. The `FishGroups` count refusal uses the label's own line. Consider `tail.lineIndex - 1` (the label line) or `null` for consistency.
