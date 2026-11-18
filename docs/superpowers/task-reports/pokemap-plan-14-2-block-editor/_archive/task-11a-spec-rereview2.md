Approved — Critical: 0, Important: 0, Minor: 2

Reviewer: Claude Opus (fallback; astra out of quota). ROLE: spec, round 2. Static review of
`git diff e2658b1..e28bf13 -- packages/`: tests `603aa2b` and `2acdce9`, impl `e28bf13`. The checkout `rv-t11` is at
`e28bf13`. Binding: B15a-d in `task-11a-fix2-brief.md`. I read the subject project's headers on disk (read only). I ran
no tests and no mutations.

## Round-1 findings

| # | Status | Evidence |
|---|---|---|
| m1 (layer test cannot tell parser from fallback) | **Closed** | `suite:674` rewrites the enum to `NORMAL, COVERED = 4, SPLIT` and expects 0/4/5. Both the hardcoded literal and the always-fallback mutant give COVERED 1, so the test fails for either. `suite:697` (skip) and `:741` (define override) also exclude the literal. |
| m2 (alias expansion untested) | **Closed** | `suite:790-820`. The test picks a map whose primary symbol's own minimum cap is above the all-symbol minimum for that file. A symbol-only route cap returns exactly that symbol's minimum, so the mutant fails by construction. In the subject this is `primary/building/metatiles.bin` (`gTileset_Building` emerald 512 vs `gTileset_Building_Dome/...` frlg 640), matching my round-1 replay. |
| m3 / E1 | Ruled (B15d) | The route stays file-scoped (`blockEditRoutes.ts:195-198`, unchanged). E1 is a separate core task. No change was expected. |
| m4a | Deferred to Task 16 (ruled) | — |
| m4b (B14d untested) | **Closed** | GBA `suite:823-836`: blockdata truncated to W×H−1 cells, last cell, expects 409 `BAD_GRID` with the B14d message. GBC `suite:847-860`: `.blk` truncated to W×H−1 bytes, cell (0,0), expects 409 `BAD_GRID`. Deleting the `BadGrid` branch (`:128`) gives 500, and deleting `requireGridCell` lets `ids[index]` be undefined. Both fail these tests. |
| m5 (unreadable enum member refuses every GET) | **Closed** | `cPrefixedValues` (`:96-122`) has no `bad()` call left. Unreadable members, and octal-8/9 or unsafe literals, set `skipping` (`:105,111`). `suite:636,697` expect 200. |

## B15a-c conformance (re-derived from the code)

- **B15a: met.**
  - A regex miss, an octal literal with 8/9 (turned into NaN) or an unsafe literal skips the member and sets `skipping`.
  - Implicit successors are skipped while `skipping` holds (`else if (skipping) continue`). The next readable `= n` resets
    it, and members read before or after stay in `values`.
  - `#define`s are applied after the enums, so they override (`:119-121`).
  - The 0/1/2 fallback applies only when no prefixed value was read (`:124-130`).
  - I traced the brief's case 2 by hand: NORMAL → 0. `= 1 << 1` fails the regex and sets skip. SPLIT is implicit and
    skipped. `TOP = 7` resets. Result `[{NORMAL,0},{TOP,7}]`, as expected.
  - A `#if` line inside the enum joins the next member's comma part. That part starts with `#`, so the regex misses and
    the member is skipped. This matches the ruling's own example.
- **B15b: met.**
  - Same reader with the `MB_` prefix, full names kept (`:183`), and no fallback list.
  - A missing file now gives an empty list instead of a 500, which is narrower than before.
  - "The subject's 256 defines give exactly today's list": I checked statically. The old order was define-insertion
    order. The subject's defines are non-decreasing in value, with one tie at 162 (`MB_FALL_WARP`, `MB_UNUSED_A2`, in
    that order). V8's sort is stable, so the sorted output equals the old list exactly. The only other change is that
    `gbaDefineValues` now receives the comment-stripped header. That does not change any `MB_` value in the subject:
    every define value is a plain numeric literal.
- **B15c: met for cells.** `requireWholeGrid` (`:88-92`) checks `count < W*H` before `resolveGbcEditTarget`
  (`:278`), with the B14d message. GBA keeps the per-cell rule (`:196`).
  - Note, not a finding: a GBC `?block=<id>` GET on a short `.blk` map never reaches this check. It goes through the
    planner, whose loader error is wrapped as `BAD_VALUE`, and answers 409 `BAD_VALUE`, not `BAD_GRID`. B15c only
    covers cells.

## Findings

**m1 Minor: two B15a branches and the B15b equality are not guarded by any test.** `blockEditRoutes.ts:110-111` and
`suite:759-768`. No test has an octal literal with 8/9 (`= 09`) or an unsafe literal. A mutant that turns
`parsed = NaN` back into `return bad(...)`, or that drops the `isSafeInteger` skip, survives. Scenario: a project with
`METATILE_LAYER_TYPE_X = 09` would get 400 on every GET again, and no test would notice. B15b also says the subject's
defines must give "exactly today's list". The suite checks only that the list is non-empty and every name starts with
`MB_` (`:765-768`). A mutant that drops the included-header defines or reorders equal values survives. My static replay
above says the implementation is correct today. Cheap fix: a literal case with `= 09` and `= 0x20000000000000`, and an
exact comparison against a list the test parses from the untouched `metatile_behaviors.h` itself.

**m2 Minor: a stale, misleading comment in committed test code.** `suite:632-635` says the rest of the brief "is
unreadable from this worktree: reads of the .superpowers SDD folder are permission-denied". That was an artefact of the
first tests hop. The test below it (`:636`) duplicates what `:697` covers. It also overwrites the whole header with a
9-line file, not just the enum as the brief asks ("keep the rest of the file"). Its expectations still hold under B15a
(`NORMAL = 0, COVERED, SPLIT = 1 << 3` → `[{NORMAL,0},{COVERED,1}]`). Scenario: a future reader trusts the comment and
thinks the B15 cases were written without the rulings. Drop the comment, or drop the test as redundant with `:697`.

## Do the new tests pin what they name? Any expectation taken from the code under test?

- Layer offset, skip, fallback and define override (`:674,697,720,741`): yes. Each expectation is a literal from a header
  the test writes. The fallback test strips every `METATILE_LAYER_TYPE_` substring, so the enum loses all prefixed
  members and only the fallback can produce the 0/1/2 list. The override test appends `#define ..._SPLIT 9` after the
  subject's enum. NORMAL 0 and COVERED 1 come from the subject's enum (`global.fieldmap.h:23-27`, verified on disk).
- Behaviors from an enum (`:759`): pins enum reading, the implicit successor after `= 2`, define merging and the sort
  by value. See m1 for the equality the suite does not pin.
- Alias cap (`:790`): pins B14b's alias step. Caps are computed from `gba.layouts` with the literal role rule, never by
  the route.
- Short grids (`:823,847`): pin status, code and message shape. The GBC case uses a cell inside the data, as B15c asks.
  The route reads the `.blk` from disk on each request (`:277`), so no hub cache can hide the truncation.
- Case 5 tidy (`:347`): the `else` branch is dead in the subject (`general/metatiles.bin` = 512 ≥ 512). It is harmless
  and correct for other subjects.
- No expectation is computed by `blockEditRoutes.ts`. Every one is a literal, a file the test wrote, or a disk scan
  through the shared loaders.

## Not checked

- No vitest, typecheck or mutation runs. The conductor's round-3 mutants are the dynamic evidence.
- Whether every test restores its files on failure. All use `restoreBytes` in `finally`; a write error before the `try`
  was not considered.
- Quality-role items: cost of re-reading the header on each request, and regex robustness beyond the B15a examples.
- The `ts.metatileCount >= cap` guard (`:220`) is still not killable in the subject, because the alias file has 128
  metatiles, far below its cap. That mutant is equivalent here. Noted only.
