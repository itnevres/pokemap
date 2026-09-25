# Plan 6 Task 8 — code-quality review, fix round 2 (commit `6c23b23` on top of `c867934`)

Scope: `git show 6c23b23` (`packages/core/src/gbc/load/encounters.ts`, `model/types.ts`, `test/gbc/load/encounters.test.ts`), read against the "## Fix round 2" section of `task-8-implementer.md`. This round addresses `task-8-spec-review-2.md` (Opus spec re-review) and my own `task-8-quality-review.md` (Important #1-#3, Minor #4/#6/#7); M5 (unify `parseGrassFile`/`parseWaterFile`) and M8 (drop the redundant explicit `file` arg) were skipped with reasons.

## Verification run
- Reviewed the committed diff via `git show 6c23b23`, not the live working tree (see **Note on environment** below).
- `npx vitest run packages/core/test/gbc/load/encounters.test.ts`: **102/102 passed** (up from 61), 587ms.
- `npm run typecheck`: clean, exit 0.
- Independently re-reproduced both of my round-1 Important findings against the round-2 source to confirm the fix, not just trust the diff:
  ```
  parseWildProbabilities("WaterMonProbTable:\n\tmon_prob 100, 0\n", "data/wild/probabilities.asm")
  // now: "data/wild/probabilities.asm: no \"GrassMonProbTable:\" label found"   (file present, was previously bare)

  // GrassMonProbTable missing one mon_prob line (index 5 dropped)
  parseWildProbabilities(text, "probabilities.asm")
  // now throws: "probabilities.asm:2: expected 7 \"mon_prob\" line(s), found 6"  (was previously a silent 6-element array)
  ```

## Note on environment
Partway through this review, `git status` showed `packages/core/src/gbc/load/encounters.ts` as locally modified with a single-line mutation (`treemon_map`'s `lineIndex: c.lineIndex` → `c.lineIndex + 1`) not present in commit `6c23b23` — consistent with the concurrent Opus mutation-testing reviewer's own in-place probing of the working tree, as flagged in the task brief. I did not touch this file; my `Read` of it (and the test/typecheck run above) both captured the correct, unmutated `6c23b23` content (confirmed by diffing against `git show`). This review's findings are all against the committed state, not this transient local mutation.

## Verdict on each addressed item

### Fixed correctly and idiomatically
- **I1 (missing-label throw had no file/line despite `file` being passed)**: fixed via `getLabelTail` (encounters.ts:250-266), a thin wrapper around `asm.ts`'s `labelTail` that routes its bare `no "X:" label found` throw through `fail(file, null, ...)`. Reproduced above — correct.
- **I2 (`labelTailText` duplicated `asm.ts`'s `labelTail`)**: `labelTailText` is gone; `parseWildProbabilities` now calls the shared `getLabelTail`, which calls `asm.ts`'s exported `labelTail` directly. This is exactly the fix I suggested and verified as a drop-in — confirmed correct.
- **I3 (`cumulativeToPerSlot` had no count/shape check)**: now checks, in order, exact count (`expectedCount`), index uniqueness+range (`0..expectedCount-1`), non-decreasing cumulative values, and a final value of exactly 100 (encounters.ts:278-316). The count-check-plus-uniqueness-in-range combination is mathematically sound: N unique values confined to `[0, N)` must cover the whole range, so a corpus that passes both checks is guaranteed to have indices `{0, ..., N-1}` each exactly once — a correct and reasonably minimal way to enforce "every slot is present, none twice." Reproduced above — correct. The five new failure modes (missing/extra count, duplicate index, out-of-range index, non-monotonic, doesn't end at 100) are each independently pinned in `describe("parseWildProbabilities", ...)`.
- **M4 (`fail`'s doc overclaimed)**: `fail`'s doc (encounters.ts:48-56) now names its one real exception (`evalPercent`'s deliberately bare throw) instead of claiming blanket coverage. Accurate now that I1/I2 are fixed.
- **M6 (`dbLinesIn` hand-split lines)**: now iterates `codeLines(body)` (encounters.ts:388-399) instead of `body.split(/\r\n|\n/)`, matching every other scanner in the file. I checked the line-index arithmetic is unchanged (`bodyLineIndex + relIndex`, same as the old `bodyLineIndex + k`), and this is confirmed behavior-preserving by the still-green line-number-pinning tests (e.g. the stacked-label N20 test, which checks an exact line number computed through this path). Correct, and a genuine improvement — `dbLinesIn` and `makeWildCursor` are now both built on the same shared primitive rather than two independent re-implementations.
- **M7 (positional boolean params)**: `parseGrassFile`/`parseWaterFile`'s `swarm` and `orderedNames`'s `excludeZero` are now options objects (`{ swarm?: boolean }`, `{ excludeZero?: boolean }`). Every call site (source and tests) updated consistently (`{ swarm: true }` in place of a bare `true`). Correct and idiomatic.
- **Spec Issue 2 (`toRodRecord` misreading `time_group N, extra` as a species record)**: the new `secondArgIsTimeGroup` guard (encounters.ts:369) correctly refuses a 3-arg record whose 2nd arg starts with `time_group` rather than reading it as a species named `"time_group 0"`. I checked the `\btime_group\b`-adjacent boundary logic doesn't false-positive on a real species name (Pokémon species constants are uppercase, e.g. `MAGIKARP`, never a lowercase `time_group`-prefixed identifier, so there's no real-corpus collision risk) and doesn't regress the legitimate 2-arg `time_group N` case (still handled by the earlier branch). Correct.
- **`locate(file, lineIndex)` extraction (encounters.ts:44-46)**: a good small refactor beyond what was asked — `fail` and `at` previously each independently formatted `${file}:${lineIndex+1}`, two places that could silently drift on the off-by-one; now there's exactly one. `at()` accepting `lineIndex: null` (for a whole-scan anchor with no single line yet, e.g. `parseTreemonMaps`'s whole-file `scanCalls`) is a sensible generalization matching `fail`'s existing contract. Mutation N2/N2b (an off-by-one in `locate`) is confirmed to hit both `fail`- and `at`-routed refusals at once per the implementer's table — a genuine robustness win from the DRY-up.
- **`GbcWildForMap.rock`/`wildForMap` rock-rare-list documentation** (types.ts, encounters.ts:664-670): accurate and specific — correctly cites `RockMonEncounter` reading only `common`, and correctly frames this as "not refused because sets are shared data," not as an oversight. No code behavior changed here, appropriately doc-only per its own framing.

### Anchor-precision trade-offs (acceptable, already self-documented)
Several `at()` wraps around whole-block `scanCalls`/`matchCall` calls can only anchor to the nearest known boundary (a table's start line, or file-only with no line at all for `parseTreemonMaps`'s whole-file scan) rather than the malformed call's own line, because `scanCalls` returns line-tagged results only for calls it successfully parses — a throw during the scan itself carries no line yet. This is honestly and specifically documented at each site (e.g. encounters.ts:279 doc, and the corresponding test names literally say "anchored at the table start, not the bad line"). Not a defect; it's the correct behavior given `scanCalls`'s contract, and fixing it fully would require changing `asm.ts`'s `scanCalls` itself (out of scope for this file).

## New issues introduced by this round

None Critical or Important. One Minor:

### Minor
1. **`cumulativeToPerSlot`'s combined range/uniqueness message is imprecise for the range-only case.** `encounters.ts:296-298`:
   ```ts
   if (e.index < 0 || e.index >= expectedCount || seenIndices.has(e.index)) {
     fail(file, e.lineIndex, `"mon_prob" index ${e.index} is not a unique value in 0..${expectedCount - 1}`);
   }
   ```
   For a genuinely out-of-range index (e.g. `mon_prob 95, 9` with `expectedCount = 7`), the message says `index 9 is not a unique value in 0..6` — technically true (9 is outside the domain, so trivially "not a value in it" at all) but reads oddly, since "not a unique value" more naturally suggests a duplicate. Confirmed this is the actual current wording via the "refuses an out-of-range mon_prob index" test (encounters.test.ts:336-339), which asserts exactly this message. Purely cosmetic — the file+line still pinpoints the bad line and the number is visible in the message; a future touch could split it into two messages ("index N is out of range 0..M-1" vs "index N is a duplicate") for clarity, but this doesn't block anything.

Everything else I checked for a fresh problem — double-prefixing between nested `at()`/`fail()` calls, a stray `fail()` call inside an `at()`-wrapped callback that would get double-wrapped, `at()`'s generic type inference across the `matchCall(...) ?? matchCall(...)` union, and whether the `getLabelTail`/`toRodRecord` changes could regress a case not covered by the mutation table — turned up nothing. `at()`'s callbacks (`matchCall`, `splitArgs`, `scanCalls`, `evalPercent`, `parseNum`) are all from `asm.ts` or self-contained, and none of them call `fail`/`at` themselves, so there's no double-wrap path anywhere in the file.

## M5/M8 skip reasons: acceptable

- **M5** (unify `parseGrassFile`/`parseWaterFile`'s block-scanning loop into a shared `scanWildBlocks`): I flagged this myself as "Minor... a judgment call, not blocking" in the round-1 review. Leaving the two functions separate for direct readability is a reasonable call to stick with; nothing about round 2's changes made unification any more urgent (if anything, the loop bodies now diverge slightly less, both routing their header-match through the same `at()` pattern, so the case for extraction hasn't strengthened).
- **M8** (drop the explicit `file` arg at `loadGbcWildData`'s I/O call sites that already matches the parameter's default): I flagged this myself as "harmless... low priority." The stated reason for keeping it — `loadGbcWildData` is the one place that should spell out every real file path it reads rather than lean on a default — is a legitimate design preference, not a rationalization; it doesn't cost anything (no duplication risk beyond the two strings already being centralized as the function's own default vs. the call site, which a future rename would catch via a type/test failure either way).

Both skips are consistent with how I originally framed these two items (non-blocking, reviewer's own call), so accepting the skip is correct — nothing here should gate approval.

## Test file growth (61 → 102 tests, 1158 lines total)

- Structure is unchanged from round 1: one `describe` per exported function plus `unknown-const refusals` and `corpus` blocks. Now the largest test file under `packages/core/test/gbc/load/` (next largest: `tileset.test.ts` at 740 lines) — proportionate to `encounters.ts` also being the largest source file (708 lines) in that directory, and every new test traces directly to a named mutation ID (`N1a`-`N25`, `A-*`, `B-*`, `C-*`) in the implementer's own table, so the growth is accounted for, not padding.
- `it.each` use (7 blocks) is well-scoped: each groups only genuinely homogeneous cases that would otherwise be near-identical copy-pasted `it` blocks (e.g. the four `N1*` "drop an `at()` wrap, get a bare `parseNum`/`evalPercent` message" cases in `parseGrassFile`'s and `parseFishGroups`' describes). No block forces together cases that actually differ in shape or need separate narration — this reads well, not opaque.
- Diffed the test file against `c867934` directly (`git diff c867934 6c23b23 -- ...encounters.test.ts`): only 6 lines were *removed*, all mechanical (positional `true` → `{ swarm: true }`, and the `makeWildDataRoot` probabilities fixture's cumulative sequence updated from an old `...,70` ending to a real `...,100` ending, required by the new I3 check). No existing test was weakened, narrowed, or deleted — the growth is purely additive.
- No redundancy worth trimming: I checked for near-duplicate assertions across the new tests (e.g. the several "extra argument" pins for different macros) and each targets a structurally distinct call site (`readSlots`, `mon_prob`, `fishgroup`, `TimeFishGroups`, `treemon` record, `treemon_map`, grass/water headers/rates) that genuinely needed its own pin per the spec re-review's mutation list — collapsing them into one parametrized table across *different* parser entry points would trade real per-function coverage for brevity, not worth it.
- One new test's name is worth a second look but isn't wrong: "refuses a missing GrassMonProbTable/WaterMonProbTable label, naming the file (Issue A...)" (encounters.test.ts:307) only exercises the `GrassMonProbTable` half (the fixture omits `GrassMonProbTable:` entirely but keeps `WaterMonProbTable:`); the title's "/WaterMonProbTable" phrasing could be read as implying both paths are tested by this one case, when only the first (`grassTail`) is. Very minor — the two `getLabelTail` calls are identical in shape and covered by the exact same code path, so a second dedicated case for the water label would be redundant, but the title over-promises slightly.

## Assessment: **Approved**

All three Important items from the round-1 review (I1 missing-label file context, I2 `labelTailText` duplication, I3 no probabilities-table shape validation) are fixed correctly, verified independently (not just by reading the diff), and each is backed by a new, specific test. The three round-1 Minor items addressed (M4 doc overclaim, M6 hand-split duplication, M7 positional booleans) are also fixed cleanly. The two skipped items (M5, M8) were self-flagged as non-blocking judgment calls in the original review and the skip reasoning holds up. This round introduces no new Critical or Important issues; the one new Minor (an imprecise error-message wording for the out-of-range-index case within the new probabilities-table check) is cosmetic and not worth blocking on. Test growth is proportionate, well-organized, and fully traceable to the mutation table with no coverage regressions.
