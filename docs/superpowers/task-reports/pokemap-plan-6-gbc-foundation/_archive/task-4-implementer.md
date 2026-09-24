# Plan 6 Task 4 — implementer report

## Status
Done. `npm test`: 844 passed (805 baseline + 39 new: 13 asm.test.ts, 26 asmSplice.test.ts). `npm run typecheck`: clean. Task 3's 53 map.ts tests unchanged and green (regression net for the refactor). PerfPlus (`C:\Programming Projects\pokecrystal-PerfPlus`) porcelain empty before and after — read-only throughout, no fs writes anywhere in the new code or tests.

## Commits
- `b2b716b` refactor(core): extract GBC asm scanner
- `58b4dd4` feat(core): GBC asm argument splicer with corpus round-trip

## Files
- `packages/core/src/gbc/load/asm.ts` (new) — `scanCalls`, plus `stripComment`/`stripMacroDefs`/`splitArgs`/`matchCall`/`escapeRegExp` moved from map.ts.
- `packages/core/src/gbc/load/map.ts` (edited) — deleted its private copies, imports from asm.ts. `parseNum` left in place.
- `packages/core/src/gbc/write/asmSplice.ts` (new) — `spliceArg`, `locateCall`, `locateNthCall`, `locateEventCall`.
- `packages/core/test/gbc/load/asm.test.ts` (new, 13 tests).
- `packages/core/test/gbc/write/asmSplice.test.ts` (new, 26 tests, includes the corpus round-trip).

## Design choices
- **`AsmCall`/`AsmArg` offsets are absolute in whatever text was scanned.** `lineEnd` excludes the `\r`/`\n` terminator (or equals `text.length` for a terminator-less final line). Line splitting is a hand-written offset-preserving scanner (`splitLines`), not `text.split(/\r\n|\n/)` — split loses the exact terminator length needed to keep offsets correct across CRLF/LF/missing-newline files in one pass.
- **`parseNum` stayed in map.ts, not moved to asm.ts.** asm.ts is purely a line/token-position primitive (no notion of what an argument *means*); parseNum interprets an argument's value. Task 3's own map.ts callers are the only ones that need it; asmSplice.ts never parses a value, only replaces raw text.
- **`matchCall` is not derived from `scanCalls`.** It operates on one already-isolated line string with no offset bookkeeping — routing it through the offset machinery would add indirection for zero benefit. Task prompt explicitly allowed this ("don't force it").
- **`escapeRegExp` added and exported**, used for both macro names (in `scanCalls`) and map names (in `locateEventCall`'s label regex). Macro/map names are plain identifiers in this corpus, but the escape is one line and removes a latent hazard for free.
- **`locateEventCall`'s label match is restricted to one line** (`[^\n]*$`, not `\s*$`), so trailing-whitespace tolerance (CeruleanCave1F's `_MapEvents: `) can't accidentally swallow real content on a later line — the earlier `\s*$` draft would have (verified by hand-tracing, not by a failing test, since the corpus test doesn't happen to hit that failure mode; recorded here rather than silently fixed).

## Measured pins (corpus round-trip test)
All measured directly against `pokecrystal-PerfPlus` before writing the pins (bash grep for the macro-count ones, the running test itself for the rest). Everything matched the findings doc except tilecoll, which the doc explicitly left unmeasured:

| Macro | Count | Arg counts | Source |
|---|---|---|---|
| warp_event | 1327 | {4} | findings doc, re-measured, matches |
| coord_event | 114 | {4} | matches |
| bg_event | 792 | {4} | matches |
| object_event | 1468 | {13} | matches |
| scene_script | 170 | {1,2} | matches |
| callback | 105 | {2} | matches |
| map_attributes | 391 | {4} | matches |
| connection | 142 (not 143 — MACRO body excluded) | {4} | matches |
| map | 391 | {8} | matches |
| map_const | 391 | {3} | matches |
| tilecoll | **2368** | {4} | **measured fresh, not in findings doc** |

File-set sizes also pinned: 391 `maps/*.asm` (via `INCLUDE` lines in `data/maps/scripts.asm`), 32 collision files (via `INCLUDE` lines in `gfx/tilesets.asm` — 5 on-disk `*_collision.asm` orphans correctly excluded since they're never `INCLUDE`d). No count differed from the findings doc/prompt, so no stop-and-report was triggered.

## Mutation checks (all verified red, then reverted — diff clean before each commit)
1. Arg span padding not trimmed → red: asm.test.ts's padding-span unit test, *and* the corpus test (via spliceArg's own leading/trailing-whitespace refusal on padded no-op values — an emergent catch, not by design).
2. Comment inclusion in last arg → red: asm.test.ts's comment unit test + corpus test (spliceArg's structural-char refusal fires on comment text bleeding into a value).
3. MACRO...ENDM skip removed → red: asm.test.ts's MACRO-skip unit test + corpus count pin (`connection` measured 143, not 142 — exactly the finding the doc called out).
4. Keyword prefix-match (`map` matching `map_const`) → red: caught by asm.test.ts's whole-token unit test. Did *not* trip the corpus count pins (no macro pair in the real corpus collides this way at the files scanned), so this one relies on the direct unit test alone.
5. Stale-call guard removed from `spliceArg` → red: asmSplice.test.ts's stale-call unit test.

## Self-review / concerns
- `scanCalls`'s MACRO/ENDM state machine and `stripMacroDefs`'s are independently maintained (same regex, two functions) rather than one sharing the other, because `stripMacroDefs` drops lines (no offsets) and `scanCalls` needs offsets preserved — a shared low-level "is this line in a macro body" predicate would be a one-line dedup but I judged the duplication (two 3-line `if` blocks) not worth an extra abstraction (ponytail rung 1: not clearly needed yet, revisit only if a third caller appears).
- The `locateEventCall` "restrict label match to one line" decision (see Design choices) was reasoned through, not test-proven — flagging this explicitly since the task otherwise required every claim to be test-backed.
- No `object_const_def` handling here — correctly out of scope per the findings doc ("Task 4/5 should splice... No Plan 6 action" on the positional hazard) and the roadmap G4 entry, which assigns it to Plan 7.

## Fix round 1

Spec review (`task-4-spec-review.md`): ❌2 + ⚠️6. Commit `6e6cdc3`.

- **Issue 1** (two MACRO state machines + two comment strippers): extracted `codeLines(text)` in asm.ts, the one shared MACRO...ENDM skipper with absolute offsets; `stripMacroDefs` and `scanCalls` are now thin wrappers over it. Fixed the reviewer-found divergence (lone trailing `\r`, no `\n`: `scanCalls` found it, `stripMacroDefs`/`matchCall` didn't) — regression test added (`asm.test.ts`).
- **Issue 2** (`locateEventCall`'s `lineIndex` was tail-relative, wrong on 3,701/3,701 real event calls): rebased by counting `\n`s before the tail offset; added an assertion to the existing "returns absolute offsets" test (now also named for `lineIndex`) plus a dedicated fixture with the expected absolute value.
- **W1**: added tests for ordinal `-1` on both `locateNthCall` and `locateEventCall` (code already refused correctly — pure test-gap), a tab-prefixed splice value (`"\t9"`, code already correct via `.trim()`), and a double-`;` comment (`; a ; b`, code already correct via `indexOf` not `lastIndexOf`).
- **W2**: added a label-immediately-followed-by-first-call fixture (LF and CRLF) — confirms the one-line label match doesn't need a gap before the first real event line.
- **W3**: `locateEventCall` now bounds its scan at the next bare-label line, if any, instead of running to EOF. Added a two-label fixture: ordinal 1 on the first map now correctly refuses (would previously have silently returned the second map's call).
- **W4**: `splitArgsWithOffsets` (now shared by `splitArgs` and `scanCalls`) refuses a blank comma-separated slot (`foo 1,,3`, trailing `foo 1,2,`) instead of silently dropping it and renumbering later args. 0 real occurrences (confirmed by the full corpus test staying green).
- **W5**: added a non-circular corpus check — recomputes each call's arg list straight from the raw line text (comment-stripped, keyword removed via regex, comma-split, trimmed), never touching `call.args`' own offsets, and compares to what `scanCalls` found.
- **W6**: removed asmSplice.test.ts's unused `GBC_SUBJECT_ROOT`/`hasGbcProject` imports.

Mutation-tested the three new guards (blank-arg refusal, `lineIndex` rebase, label-boundary bound) individually: reverted each, confirmed the relevant test(s) went red, restored. All three caught cleanly.

Verification: `npm test` 856/856 (805 baseline + 39 Task 4 + 12 this round), `npm run typecheck` clean, PerfPlus porcelain empty before/after.
