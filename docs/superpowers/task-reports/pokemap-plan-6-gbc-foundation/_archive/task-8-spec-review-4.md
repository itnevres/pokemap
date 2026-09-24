# Plan 6 Task 8 — spec-compliance re-review 4, fix round 3 (5c564f1 vs 6c23b23)

Verdict: ❌ ISSUES (1)

This is a narrow re-check: review-3 Issues 1 and 2, both review-3 Minors, and any new defect introduced by round 3.
- **Review-3 Issue 1 (scan-call locations):** closed.
- **Review-3 Issue 2 (the 5 prob-table survivors):** closed.
- **Both review-3 Minors:** closed.
- **Regression:** 0 mismatches.
- **One new defect:** the new label-line anchor for the probabilities count-mismatch refusal is off by one when the table's label is the file's last line with no trailing newline.

## Verification run
- HEAD 5c564f1. Before and after all work, `git diff --quiet 5c564f1 -- packages/` held and `git diff --stat -- packages/` was empty.
- `npx vitest run packages/core/test/gbc`: 10 files, 396/396 passed, 0 skipped. `npm run typecheck`: exit 0.
- **Regression.** `sr3/regress.ts` uses the 16fad97 copy, which is byte-identical to `git show 16fad97`. **0 mismatches** over every `loadGbcWildData` field and `wildForMap` for all 391 maps. Counts are unchanged: grass 96, water 62, fish 13, TimeFishGroups 22, sets 11, tree/rock rows 66/4, defects = [kanto_grass], probabilities 25,25,20,10,10,5,5 / 45,30,25.
- Subject `/home/user/pokecrystal-PerfPlus` is at 81ededbe3 with empty porcelain.
- **Mutations.** Per the implementer's warning, I did **not** run `sr3/mutate3.mjs`.
  - The new `sr4/mutate4.mjs` reads its pristine text from `git show 5c564f1:<path>` at start-up. It restores from that text after each mutation and in `finally`.
  - `sr3/mutate_orig.mjs` takes its pristine snapshot as an argument. I passed it `sr4/encounters.pristine.ts`, freshly written from `git show 5c564f1`.
- Probes: `sr4/probe4.ts`. Every expected line below was counted by hand from a numbered fixture. The fixtures have MACRO blocks, comment and blank lines before and between calls, and CRLF variants.

## Re-check table
| Item | | Evidence |
|---|---|---|
| mon_prob blank arg, not the first call | ✅ | 5th grass call → `p.asm:15`. Trailing comma on the last grass call → `p.asm:17`. 2nd water call (after a blank line) → `p.asm:24`. CRLF: `:15` / `:24` |
| fishgroup blank arg, not the first call | ✅ | 2nd call (after a blank line) → `f.asm:11`. Trailing comma on the 3rd → `f.asm:12`. CRLF 3rd → `f.asm:12` |
| treemon_map blank arg, not the first row | ✅ | 3rd headbutt row (after comment and blank) → `m.asm:8`. 3rd rock row → `m.asm:14`. CRLF 2nd rock row → `m.asm:13` |
| `parseTreemonMaps` RockMonMaps split | ✅ | LF and CRLF give headbutt ROUTE_26@4, ROUTE_27@6, ROUTE_29@8 and rock CIANWOOD_CITY@12, ROUTE_40@13, DARK_CAVE@14 (trailing comment). With no `RockMonMaps:` label, all rows are headbutt. With `RockMonMaps:` first, all rows after it are rock, as before. On the corpus: 66/4, unchanged |
| C2a/C2c/C4b/C3a/C5 | ✅ | All RED: a pin for index −1, index 7, a table ending at 101, an equal-consecutive table accepted, and out-of-order lines sorted |
| Dangling `time_group` | ✅ | `time_group 2` with 2 rows → `f.asm:20: rod record: time_group 2 is out of range -- TimeFishGroups has 2 row(s)`. `time_group 1` (boundary) is accepted. 99 → `f.asm:16`. CRLF → `f.asm:16`. With 0 rows, `time_group 0` → `f.asm:16`. `time_group 0, 5` is still refused as the arg-shape error |
| Count mismatch anchored at the label line | ✅ with one exception (❌1) | Grass → `p.asm:7` (`GrassMonProbTable:`). Water → `p.asm:20`. CRLF → `p.asm:20`. `FishGroups` stays at its label (`f.asm:7`). **Exception:** a label on the last line with no final newline reports one line too early (❌1) |

## Mutation table
**Review-3 survivors and this round's new guards** (`mutate4.mjs`):

| # | Mutation | Result |
|---|---|---|
| C2a | index lower bound dropped | RED |
| C2c | index upper bound `>` instead of `>=` | RED |
| C4b | ends-at-100 allows > 100 | RED |
| C3a | monotonic made strict | RED |
| C5 | sort by index removed | RED |
| S1 | `scanCallLines` drops its `at()` | RED (5) |
| S2 | `scanCallLines` ignores `base` | RED (16) |
| S3 | `scanCallLines` anchors at `base` (the old whole-scan bug) | RED (5) |
| S4 | mon_prob base 0 | RED (12) |
| S5 | fishgroup base = label line | RED (4) |
| S6 | treemon_map base 1 | RED (9) |
| S7 | `lineStart` = `line.end` | GREEN, **equivalent**: a row line never spans the `RockMonMaps:` label, so start and end classify identically |
| S8 | split uses `<=` | GREEN, **equivalent**: the only line that starts at the label offset is the label line, which is never a `treemon_map` call |
| S9 | split ignores the offset | RED (3) |
| T1 | dangling check removed | RED |
| T2 | dangling bound `>` instead of `>=` | RED |
| T3 | dangling refusal anchored `null` | RED |
| K1 | count anchor back to the tail line | RED |
| K2 | count anchor `null` | RED |
| X1 | duplicate-index check removed | RED |

**Review-2 set** (`mutate_orig.mjs`, pristine = 5c564f1):
- 34 patterns applied and all 34 went RED.
- 13 no longer match the refactored code. I re-expressed 11 of them in `mutate4.mjs` (M1r, N1e-r, N1h-r, N2b-r, N7a-r, N7b-r, N11-r, N12-r, N16-r, N19-r, N21-r). All 11 went RED.
- The other 2, N17 and N18 (the mon_prob and fishgroup line offsets), were superseded by `scanCallLines`'s `base`. They are covered by S4 and S5 above (RED).
- **New direction I added, N11m-r** (fishgroup allows *missing* args): GREEN. See Minor 1.

## Issues
1. ❌ **The count-mismatch anchor is off by one when the table label is the file's final line with no trailing newline** (new in round 3, encounters.ts:316).
   - Cause: `fail(file, tail.lineIndex - 1, …)` assumes the tail starts one line after the label. `labelTail` sets `tailOffset = text.length` when no newline follows the label, so `tail.lineIndex` is the label's own line and `- 1` names the line before it.
   - Probe: `WaterMonProbTable:` + 3 calls + `GrassMonProbTable:` as line 5 with no final newline gives `p.asm:4: expected 7 "mon_prob" line(s), found 0`. The same text with a final `\n` gives `p.asm:5`.
   - The plan-wide rule says every line parser must accept a final line with no `\n` (findings, "Consequences… Plan-wide").
   - **Fix:** derive the label line directly instead of subtracting 1. One option: have `getLabelTail` also return `labelLineIndex`, the number of `\n` before the label match. Another: `text.slice(0, tail.offset).replace(/\r?\n$/, "")` newline count.
   - Pin: an empty table on a label that is the file's last line, with no final newline.

## Minor (non-blocking)
1. **A fishgroup call with a *missing* argument is not pinned in that direction** (N11m-r survives).
   - Behaviour today is correct: `fishgroup 40 percent, .O_Old, .O_Good` → `f.asm:N: "fishgroup" has 3 argument(s), expected 4` at the call's line.
   - With the check loosened to `> 4`, it is still refused, but through the rod-label lookup: `no "undefined:" label found`, at the `FishGroups:` label line.
   - This pre-dates round 3 and is outside this re-check's scope. Earlier reviews tested only the extra direction here. It is a one-line pin.
2. **A bare `treemon_map` with no arguments and no trailing whitespace is silently skipped.** Probed: a 3-row RockMonMaps loads as 2 rows. `treemon_map ` with a trailing space is refused (`has 0 argument(s)`).
   - The cause is the shared `^\s*<macro>\s+` call regex, identical in `scanCalls`/`matchCall`, so this pre-dates round 3.
   - mon_prob and fishgroup are covered by their count checks; treemon_map has none.
   - RGBDS would reject a bare macro call that uses `\1`, so the risk is low. Consider matching `^\s*<macro>(\s|$)`.
