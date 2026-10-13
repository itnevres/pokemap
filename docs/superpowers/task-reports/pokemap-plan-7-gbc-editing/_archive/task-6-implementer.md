# Task 6 implementer report: GBC CLI write commands

**Status: DONE** (Concern 1 resolved by coordinator-approved exception, see follow-up).

## Commits
| sha | msg |
|---|---|
| bfc1df7 | feat(cli): GBC paint/diff/event write commands (src + tests, one green step) |
| (this) | docs(plan-7): Task 6 implementer report |

## Files
- `packages/cli/src/gbcCommands.ts`: new block at end (+ 5 import lines near top): `runGbcPaint`, `runGbcDiff`, `runGbcEventMove|Add|Delete`, helpers `intOpt`, `kindOpt`, `dryRunOrCommitGbc`, `gbcPaintSession`, `layoutWarnings`.
- `packages/cli/src/index.ts`: `paint`/`diff` GBC branch (replaces `refuseIfGbc`), new `emit()` helper, `event move|add|delete` group, `gbcOnlyRoot(sub)`; help text now says GBC x/y are blocks (paint) / event steps (event).
- `packages/cli/test/gbcCommands.test.ts`: only additive (8 import lines after line 14 + new `describe` at end). `git diff 0a6d2b0 -- packages/cli/test/ | grep -c '^-[^-]'` = 0.

## Name differences vs spec
None in core: real names = spec names (`openGbcEditSession`, `planGbcSave`, `commitGbcSave`, `paintCells`(GbcStamp), `floodFill`, `moveGbcEvent`, `addGbcEvent`, `deleteGbcEvent`, `findGbcWarpsRetargetedByDelete`, `copyGbcSubjectToTemp`/`removeTemp`). `paintCells` imported as `paintGbcCells` (name clash-avoidance only). `GbcEventEdit` type used for applying edit results.
- Small deviations: (a) all tests incl. dry-run/diff run on ONE temp copy (not real PerfPlus), so mutants C1/C2 can't write the real repo; `afterAll` still asserts PerfPlus `git status --porcelain` empty. (b) Test 4 uses `metatile = tileset cap` (not literal 200) for out-of-range. (c) Refusal on `--yes` throws, so handler can't also return stderr; layout `warning:` is asserted on the dry run (the thrown message itself carries the size-disagreement text). (d) Test 10 is a spawned process (the refusal lives in `index.ts`); GBA root `Route101` used.

## Tests (new describe "GBC write commands (Plan 7 Task 6)", 11 tests, all green)
| # | Result |
|---|---|
| 1 pencil dry run | green: `maps/NewBarkTown.blk -- 1 block changed` + dry-run line, bytes unchanged |
| 2 pencil --yes | green: ends `committed`, exactly index 0 differs |
| 3 rect + bucket | green: counts == Task 2 `paintCells`/`floodFill` run in-test (rect 2x2 origin (1,1) via corners (2,2)/(1,1); bucket seeded at largest-region cell) |
| 4 refusals | green: out-of-range throws `metatile-out-of-range (maps/NewBarkTown.blk): ` + no write + dry-run `REFUSED`; CeruleanCave2F dry run stderr `warning: `, `--yes` throws `layout-not-writable (...)`, blk unchanged |
| 5 diff w/ yes:true | green: no `committed`, bytes unchanged |
| 6 move warp 0 --yes | green: `\twarp_event  12,  4, ELMS_LAB, 1`; == `moveGbcEvent`; exactly 1 line differs |
| 7 add bg | green: dry run `maps/NewBarkTown.asm -- event block edited`, asm unchanged; `--yes` == `addGbcEvent` |
| 8 refusals | green (9 sub-cases): object `--const lower_case`; unknown map const; delete object 0 (const referenced); `--index 1.5`; `--index NaN`; `--kind foo`; `--const` w/ bg; `--x NaN`; `--tool spray`; asm unchanged |
| 9 delete warp dry run | green: stderr warning lines == independent in-test scan, incl `ElmsLab warp[0] -> NEW_BARK_TOWN 1`, plus a self-map hit (a warp added first to NewBarkTown -> `NEW_BARK_TOWN 2`); same on `--yes` |
| 10 GBA root event | green (spawn): `pokemap: event move is not supported for gba projects (GBC-only today)`, exit 1 |
| 11 real process | green: `--yes` paint exit 0, byte 1 changed; `--metatile abc` exit 1, stderr `pokemap: --metatile must be an integer, got NaN` |

writeCommands.test.ts: green, untouched. Typecheck clean. PerfPlus `git status --porcelain`: empty.

## Mutations (each: save bytes, edit, run gbcCommands.test.ts, restore bytes, `git diff -- file` empty; every run also shows the 1 pre-existing stale failure, "every GBA-only command refuses...", excluded below)
| ID | Mutation | Red (new tests) |
|---|---|---|
| C1 | `if (!yes) { commitGbcSave(...); return ... }` | 1, 3, 4, 7, 9 (5 new red; 6 failed total) |
| C2 | `runGbcDiff` uses `dryRunOrCommitGbc(..., opts.yes)` | 5 (only) |
| C3 | drop CLI's own refusal throw, call commit | 4 (only; funnel message `save refused:` lacks `(subject): ` format) |
| C4 | delete scan uses `[]` for the deleting map (drops self-map hits) | 9 (only) |
| C5 | `intOpt` accepts any number (NaN/1.5) | 8, 11 |
| C6 | `gbcOnlyRoot` never refuses | 10 |
| C7 | rect origin ignored | EQUIVALENT (1x1 stamp); not tested |

## Measured retarget list, NewBarkTown warp 0 (pristine PerfPlus, 8 hits)
ElmsLab warp[0], warp[1] -> NEW_BARK_TOWN 1; PlayersHouse1F warp[0], warp[1] -> 2; PlayersNeighborsHouse warp[0], warp[1] -> 3; ElmsHouse warp[0], warp[1] -> 4. (No NewBarkTown self hit on pristine data; test 9 adds one.)

## Concerns
1. **Spec contradiction**: existing test "every GBA-only command refuses on the real gbc root..." (gbcCommands.test.ts ~L347) still lists `paint` and `diff` as must-refuse on GBC (exit 1, "paint is not supported for gbc ... yet"). Spec requires they stop refusing, and the "existing tests byte-unchanged" rule forbids editing it. Result: that 1 test fails. Fix needed from caller: delete the two `paint`/`diff` entries from its `cases` array (2 `-` lines; U1 grep check then = 2, expected). I did NOT edit it. Note that test only dry-runs on the real PerfPlus (no `--yes`), so harmless.
2. `--yes` refusal throws, so `index.ts` never prints the layout `warning:` lines for that path (message text covers it).
3. Event scan loads all 391 maps' events (about 1 s); fine for a CLI.
4. Repo files are LF; git emits LF->CRLF warnings on commit, harmless.
5. **Mutation C1 leaked a write to the real PerfPlus**: the pre-existing stale spawned test runs `paint NewBarkTown --metatile 1` (dry run) against the real root; under C1 (dry run commits) it wrote `maps/NewBarkTown.blk` byte 0 (5 -> 1). Detected via `git status --porcelain`, restored from `git show HEAD:maps/NewBarkTown.blk` by file copy; PerfPlus now clean (0 lines). New tests are hermetic; only that old test touches the real root. Removing its paint/diff cases (Concern 1) also removes this hazard.

## Coordinator follow-up
Named U1 exception (approved): removed the `paint` and `diff` entries from the "every GBA-only command refuses" test's `cases` (replaced by one comment line). U1 grep `git diff 0a6d2b0 -- packages/cli/test/ | grep -c '^-[^-]'` = 2, exactly those. Results: gbcCommands.test.ts 41/41 green; typecheck 0 errors; C1 re-run red (5 new tests failed: 1, 3, 4, 7, 9), source restored (diff empty); PerfPlus `git status --porcelain` empty after (leak path gone).

## Fix round 1
Commit 17ffe91 `fix(cli): keep warnings behind --yes refusals, widen GBC write tests...` (src: gbcCommands.ts, index.ts; test: gbcCommands.test.ts). packages/cli 89/89 green, typecheck clean, PerfPlus porcelain empty after every run.

| Finding | Change |
|---|---|
| F1 | new spawned tests 12 (paint/diff/`event add bg` without `--yes`: exit 0, dry-run line, `.blk`/asm unchanged, diff has no `committed`; `--yes` add changes asm) and 13 (`paint CeruleanCave2F` dry run: stderr `warning:`) on the temp copy |
| F2 | test 3: rect `x3 y1 x1 1 y1 0` (3x2, off-diagonal, corners reversed) and bucket seed with x != y; both committed on the copy and changed byte INDICES compared with `paintCells`/`floodFill` (counts too) |
| F3 | `dryRunOrCommitGbc(..., warn)` appends the stderr-bound warning lines (layout defects + retarget lines) to the thrown refusal message; handlers compute stderr before commit (also fixes quality m7). Test 13: `--yes` on CeruleanCave2F exits 1, stderr has `layout-not-writable` and a `warning:` line |
| F4 | `--x1/--y1` help has units; `paint` description mentions bucket; action opts `tool` typed `"pencil"\|"rect"\|"bucket"`; `return void emit` -> block. GBA `paint`/`diff` help text now mentions gbc: accepted. Test-order coupling: one-line comment added |
| I1 | `gbaRoot` read in try/catch returning `""` (test 10 then skips) |
| I2 | comment on `dryRunOrCommitGbc`: mirrors writeCommands.ts dryRunOrCommit, keep in step; GBA files untouched |
| minors | m2 (`return void`), m4 (kind validated first, comment), m7 done. Skipped: m1 rename, m3, m5, m6, m8 (cosmetic/import merge) |

### Mutations (gbcCommands.test.ts, 43 tests; each restored, `git diff` empty, PerfPlus porcelain 0)
| ID | Red tests |
|---|---|
| C1 dry run commits | 1, 3, 4, 7, 9, 12, 13 (7) |
| C2 diff honours yes | 5 |
| C3 skip refusal throw | 4, 13 |
| C4 drop self-map hits | 9 |
| C5 NaN accepted | 8, 11 |
| C6 GBA event not refused | 10 |
| C7 | equivalent (not run) |
| M3 bucket seed x/y swapped | 3 |
| M5 rect target x/y swapped | 3 |
| M10 paint action yes:true | 12, 13 |
| M11 event add action yes:false | 12 |
| M12 diff action -> paint yes:true | 12 |
| M13 emit drops stderr | 13 |
