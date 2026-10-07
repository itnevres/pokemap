# Task 6 spec-compliance review (Opus, adversarial)

Range `0a6d2b0..8215119`, `packages/cli` only: bfc1df7 (feat), 0bc8961 (U1 exception). Files: `src/gbcCommands.ts` (+139), `src/index.ts` (+68/-11), `test/gbcCommands.test.ts` (+195/-2).

**Verdict: ISSUES**: 0 blocking, 1 important, 3 minor. The source matches the spec. The gaps are test teeth at the `index.ts` layer, plus one spec-test deviation.

## Verified (re-derived from spec + code)
| Item | Result |
|---|---|
| GBA `paint`/`diff` byte-unchanged | OK. The only action change: `refuseIfGbc(family,"paint"/"diff")` became `if (family==="gbc") return void emit(runGbc…)`. The GBA lines are untouched. `writeCommands.test.ts` is untouched (not in the diff stat) and green 12/12. Help strings are shared, so GBA `--help` text changed (see F4) |
| pencil/rect/bucket | OK. pencil: 1 target. rect: min..max inclusive in both axes, origin `(x,y)` passed to `paintCells`. bucket: `floodFill(blocks,w,h,x,y,id)` |
| rect origin | Equivalent with the 1×1 stamp (`paint.ts:30-31`: `(t.x-originX) mod 1 = 0`). C7 run: survives, as expected |
| diff always dry | OK. `runGbcDiff` never calls `dryRunOrCommitGbc` or commit, and its type omits `yes` |
| `event` group + GBA refusal | OK. `program.command("event")` with move/add/delete. `gbcOnlyRoot` throws `event <sub> is not supported for gba projects (GBC-only today)`. Test 10 checks exact stderr + exit 1 (GBA subject present, test ran) |
| Refusal format | OK. `${code} (${subject}): ${message} -- ${fix}` joined by `\n` is identical to `writeCommands.ts:46` |
| Integer validation | OK. `intOpt` covers x, y, x1, y1, metatile (paint/diff) and index, x, y (move), index (delete). Rejects NaN and 1.5, naming the option. `kindOpt` covers 4 kinds; tool covers 3 |
| `--const` on non-object | OK. Throws `--const only applies to --kind object` |
| Warp-retarget warnings | OK. `maps` = every map's `loadGbcMapEvents(root,m).events.warps`; the deleting map uses `session.events.warps` (pre-delete). Computed before `applyEdit(delete)` and returned in `stderr` on both paths. `emit` writes stderr. Line format matches the spec |
| Data-defect warnings | OK. `layoutWarnings` → `warningLines(proj.layout(...).defects)` on paint, diff and all 3 event commands. Only on non-throwing paths (F3) |
| Help units | OK. paint/diff: `tile x (gbc: block x)`. event: `event x (16 px steps)` plus the description "in event steps". Nits in F4 |
| Separate block at file end | OK. Plus 5 import lines at the top |
| Test 11 Windows | OK. `spawnSync(process.execPath, ["--import","tsx",CLI_ENTRY,…])` (test L83), no npx. Green on win32 |
| Baseline | gbcCommands 41/41 + writeCommands 12/12 green |

## Hermeticity
- Every new Task 6 test (1-9, 11) passes `copy` (`copyGbcSubjectToTemp()` in `beforeAll`). There is no `runGbc{Paint,Diff,Event*}` call or write-command spawn with `GBC_SUBJECT_ROOT`. Test 10 runs a dry run against the GBA subject: under C6 it reaches `openGbcProject(gbaRoot)`, which throws, and never writes. `afterAll` asserts PerfPlus porcelain is empty.
- C1 leak path is gone: 0bc8961 removed the spawned `paint`/`diff` cases against the real root. Other real-root spawns: render/render-world (`-o` into mkdtemp), query, where, and `sign suggest|add|list`. The `sign` ones refuse via the pre-Task-6 `refuseIfGbc`. No Task 6 mutation can make any of these write. Residual risk outside Task 6: `sign add` against the real root relies on `refuseIfGbc` at `index.ts:331`.
- U1: `git diff 0a6d2b0..8215119 -- packages/cli/test | grep -c '^-[^-]'` = **2**. These are exactly the `{ name: "paint", … }` and `{ name: "diff", … }` case lines, the approved exception.
- Mutation C1 (mine) went red and PerfPlus stayed clean, which confirms the leak path is gone.

## Findings
1. **Important: the CLI-layer dry-run default and wiring are untested.** `index.ts:358,374,401,412,422` and `emit` at `:48-51`.
   - Evidence: M10 (GBC `paint` action passes `yes: true` always, so the real binary commits without `--yes`) survives. So do M11 (`event add` drops `--yes`), M12 (`diff` routed to `runGbcPaint` with `yes:true`, so the CLI's diff commits) and M13 (`emit` drops stderr, so every `warning:` vanishes from the binary).
   - The only GBC spawn tests are test 11 (paint `--yes` and `abc`) and test 10 (GBA). The code is correct by reading, but the binding "dry run by default" contract and "warnings to stderr" have no teeth where the user actually runs them.
   - Fix: add spawned tests on `copy`. (a) `paint` without `--yes`: exit 0, dry-run line, `.blk` bytes unchanged. (b) `diff` on copy: bytes unchanged, no `committed`. (c) `event add … bg` without `--yes`: asm unchanged; with `--yes`: changed. (d) `paint CeruleanCave2F` dry run: stderr starts `warning: `.
2. **Minor: an x/y swap in bucket or rect survives.**
   - Evidence: test 3 at `gbcCommands.test.ts` ~L555-571. The bucket seed picked by "largest region" on pristine NewBarkTown is (2,2) (probe: w=10, h=9, region 33, swapped seed also 33). The rect corners (1,1)/(2,2) form a square on the diagonal.
   - M3 (`floodFill(…, y, x, …)`) survives, and so does M5 (rect `targets.push({x:ty,y:tx})`). Pencil swap (M6) is caught only by test 11 (x=1, y=0).
   - Fix: rect off-diagonal and non-square (e.g. `x 1 y 0 x1 3 y1 1`). Bucket: require `sx !== sy`, or assert the changed byte indices rather than the count.
3. **Minor: spec test 4 deviation; `--yes` refusal drops stderr warnings.** `gbcCommands.ts:301-303` throws before the handler returns `stderr`.
   - The spec says `paint CeruleanCave2F … --yes` "throws `layout-not-writable` **and** prints the size defect `warning:`". The test asserts the warning on the dry run only (implementer deviation c).
   - Via the binary, `--yes` prints only `pokemap: layout-not-writable (maps/CeruleanCave2F.blk): …size on disk disagrees with 9x15…`. The `warning: …actual size 400 bytes, declared 9x15=135…` line is lost.
   - Same for `event delete --kind warp --yes` hitting a refusal: the retarget warnings are lost. On a successful commit they do print (test 9).
   - Fix: write `layoutWarnings` and retarget lines to `process.stderr` in `index.ts` before calling the handler, or append them to the thrown message. Alternatively, accept and amend the spec.
4. **Minor (nits).**
   - `index.ts:352-353,369-370`: `--x1/--y1` help lacks a unit ("rect's second corner x"). The `paint` description doesn't mention bucket.
   - The GBA `--help` text for paint/diff changed (`(gbc: block x)`, `(gbc also: bucket)`). GBA behaviour is unchanged, but its help output is not byte-identical.
   - Action opts type `tool: "pencil" | "rect"` is stale for GBC.
   - Tests 1-11 share one mutable copy, so test 9's expectations depend on 6/7 having run first. That's acceptable but order-coupled.

## Mutation table
Harness: save the bytes, do one exact single-match replace, run `node node_modules/vitest/vitest.mjs run packages/cli/test/gbcCommands.test.ts`, write the bytes back, check `git diff -- <file>` is empty, then check PerfPlus `status --porcelain`.

| ID | File | Mutation | Red | diff empty | PerfPlus porcelain |
|---|---|---|---|---|---|
| C1 | gbcCommands | dry run commits (when no refusals) | 1, 3, 7, 9 | yes | "" |
| C2 | gbcCommands | `runGbcDiff` → `dryRunOrCommitGbc(…, opts.yes)` | 5 | yes | "" |
| C3 | gbcCommands | `if (false)` replaces the refusal throw, so commit is called | 4 | yes | "" |
| C4a | gbcCommands | deleting map's warps = `[]` (drops self hits) | 9 | yes | "" |
| C4b | gbcCommands | deleting map uses **post**-delete warps | 9 | yes | "" |
| C5 | gbcCommands | `intOpt` accepts any number | 8, 11 | yes | "" |
| C6 | index | `gbcOnlyRoot` never refuses | 10 | yes | "" |
| C7 | gbcCommands | rect origin 0,0 | none (EQUIVALENT, per spec) | yes | "" |
| M1 | gbcCommands | `objectConst: undefined` (`--const` ignored) | 8 | yes | "" |
| M2 | gbcCommands | delete warnings to stdout | 9 | yes | "" |
| M3 | gbcCommands | bucket seed x/y swapped | **SURVIVES** | yes | "" |
| M4 | gbcCommands | paint `stderr: ""` (`layoutWarnings` dropped) | 4 | yes | "" |
| M5 | gbcCommands | rect target x/y swapped | **SURVIVES** | yes | "" |
| M6 | gbcCommands | pencil target x/y swapped | 11 | yes | "" |
| M7 | gbcCommands | rect `tx < max` (off by one) | 3 | yes | "" |
| M8 | gbcCommands | delete warnings only when `!yes` | 9 | yes | "" |
| M9 | gbcCommands | refusal format drops `(subject)` | 4 | yes | "" |
| M10 | index | GBC paint action `yes: true` always | **SURVIVES** | yes | "" |
| M11 | index | event add action `yes: false` | **SURVIVES** | yes | "" |
| M12 | index | GBC diff action → `runGbcPaint({yes:true,…})` | **SURVIVES** | yes | "" |
| M13 | index | `emit` drops stderr | **SURVIVES** | yes | "" |

Survivors: M3, M5 (F2); M10-M13 (F1). The implementer's C1-C6 claims reproduce. C1 red set is 1/3/7/9 here vs. the implementer's 1/3/4/7/9: my C1 variant guards on no refusals, so test 4 stays green. That doesn't contradict the claim. PerfPlus porcelain was empty after every run (21 runs plus 1 read-only probe). The PokeMap tree is clean except the pre-existing `.codex/`, with no code changes left behind.

## Spec facts found wrong
- "Existing CLI tests stay byte-unchanged / U1 = 0" contradicts the spec's own paint/diff un-refusal. The stale "GBA-only command refuses" test had to lose 2 lines (approved exception; U1 = 2).
- "Dry-run tests may read the real PerfPlus": unsafe. Under C1 a dry run commits, and that is exactly how the leak happened. The implementer correctly moved all tests to the temp copy.
- C4's first variant, "uses disk warps for the deleting map (after a prior in-session warp edit)", is **equivalent at the CLI layer**: each command opens a fresh session, so session warps equal disk warps. The meaningful variants are C4a (drop self) and C4b (post-delete); both are killed.
- Test 4, "throws … and prints the size defect `warning:` to stderr", is unachievable with the binding shape (a handler that throws returns no `stderr`) unless the warnings are emitted before the throw (F3).
- C3, "the funnel still throws": consistent with the implementer's observation (`save refused:` lacks the `(subject): ` format). Not independently re-run.
