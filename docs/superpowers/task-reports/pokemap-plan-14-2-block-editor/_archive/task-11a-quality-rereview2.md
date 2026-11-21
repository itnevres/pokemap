Approved — Critical: 0, Important: 0, Minor: 2.

Reviewer: Claude Opus (fallback; astra out of quota). ROLE quality, fix round 2, static review of
`git diff e2658b1..e28bf13 -- packages/` (tests 603aa2b and 2acdce9, impl e28bf13). No tests run. `git diff --check` is
clean.

## Round-1 findings

- **I1 (an unparseable enum member gave 400 on every GET): closed.** `cPrefixedValues` (`blockEditRoutes.ts:96-122`)
  never throws. An unreadable member sets `skipping` (`:105`), and so does an unsafe or bad-octal literal (`:111`).
  Implicit successors are skipped until the next readable `= n`, which clears `skipping`. `gbaLayerTypes` (`:123-130`)
  falls back to 0/1/2 only when nothing reads. This matches B15a.
- **I2 (no killing test for the parser): closed** for the logic B15a-d names.
  - `:676` (`= 4` carries to SPLIT = 5) kills a revert to the old literals.
  - `:699` (`1 << 1`, then SPLIT, then `TOP = 7`) kills each of the three mutants by hand:
    - an unreadable member that does not skip lets SPLIT appear;
    - successors not skipped would give SPLIT = 1;
    - `skipping` never cleared drops TOP.
  - `:722` kills a removed fallback, and `:741` kills a removed define override.
  - The remaining gap is listed as m2 below.
- **m1 (B14d untested; GBC 500 inside the data): closed.**
  - `:823` truncates GBA to W×H−1 cells and asks for index W×H−1. That kills `index > count`, which would read
    `ids[count]` and give the old 500.
  - GBC uses `requireWholeGrid` (`:88-92`, `:278`) before `resolveGbcEditTarget`. `:847` asks for (0,0) on a
    W×H−1 `.blk`. The old per-cell check passes that cell and then hits the loader's 500. The conductor's red run
    agrees.
  - With a cached GBC layout the old check would answer 200. That still fails the test, so the test kills the
    regression either way.
- **m2b (conditional `nextId`): closed.** `:347` asserts `nextId === count` below the cap. The subject takes the null
  branch (640 ≥ 512). The other branch is now pinned for other fixtures. `newBlockId` for a primary file is its
  local count.

## New code

- **`cPrefixedValues` skip rule.** Traced by hand against B15a for each case below.
  - Non-prefixed members still advance `next`, so they keep later implicit values right.
  - An enum is chosen because it contains the prefix as a substring (`:99`). That is now harmless, because nothing
    throws, and names are filtered by `startsWith` (`:115`).
  - Values are keyed by full name. The define pass (`:118-120`) overrides enum values, then the result is sorted by
    value.
- **Behaviours (B15b).**
  - Upstream pokeemerald and expansion: the `MB_*` enum body has no `=` and no `#` lines, so all 240 members read
    (0..239). `MB_INVALID UCHAR_MAX` stays unresolved and is dropped, as before.
  - Subject: all 256 defines are plain literals in ascending order. The one equal-value neighbour, `MB_UNUSED_A2`,
    keeps its place because `Array.prototype.sort` is stable. So sorting by value gives exactly today's list.
  - A missing header now gives `[]` instead of an ENOENT 500. That is the ruling ("never throwing").
- **GBC whole-grid check.**
  - It runs only for `x/y` selection. `block=` on a short `.blk` still goes through the planner and returns its 409
    refusal (code `BAD_VALUE`, not `BAD_GRID`). B15c talks about cells, so this is consistent.
  - When a map sharing the `.blk` is staged, the staged full-size grid is counted. That is also the grid
    `resolveGbcEditTarget` uses, so the two agree.
- **Test robustness.**
  - Every header and grid rewrite targets the temp copy (`root`). Each snapshot is taken with `restoreBytes` before
    the write, and each restore is in `finally`. `afterAll` also removes the whole temp root.
  - Hop 1's `:636` replaces the whole `global.fieldmap.h`. That is safe: the only per-request reader of that file on
    the GET path is `gbaLayerTypes`, because the profile and constants are loaded when the project opens. Vitest runs
    the file's tests in sequence, so no other test sees the stub.
  - The grid truncations are read straight from disk by the route (`:197`, `:277`) before any planner or cache, and
    they are restored afterwards.
  - The B14b alias test (`:780`) computes caps from `gba.layouts` with the literal role rule, never from the route. It
    kills a route that uses only the symbol's own consumers, because that would answer symbolMin > allMin.

## Findings

**m1 — Minor — Stale workflow comment in the suite.** `blockEditRoutesSuite.ts:632-635` says the rest of the brief
was "unreadable from this worktree: reads of the .superpowers SDD folder are permission-denied". That describes the
implementer's environment, not the test. It will mislead later readers, and `:636` partly duplicates `:699`. Reduce
the comment to the B15a rule it guards.

**m2 — Minor — Enum literal forms other than decimal are untested.** `blockEditRoutes.ts:107-110`: hex (`0x`), octal
(`0` prefix, including the 8/9 rejection), the `u`/`l` suffixes and the sign handling have no test. Concrete case: a
mutant that always uses radix 10 survives every test. It would read `MB_FOO = 0x80` as 0 (`parseInt("0x80", 10)`) and
show the wrong value under that name in the behaviour list. Hex initializers are plausible in fork behaviour enums.
One more case fixes it, using the same rewrite pattern as `:759`: an enum with `= 0x10`, `= 010`, `= 3u`, and `= 09`
(skipped).

## Not checked

- Runtime: vitest, typecheck, build, live UI and the round-3 mutants. The red run (4 failed / 35 passed) is conductor
  evidence.
- The deferred items m2a, m2c and spec m4a, per the fix-2 brief.
- Behaviour value order on pokefirered's defines (the ruling only binds the subject).
