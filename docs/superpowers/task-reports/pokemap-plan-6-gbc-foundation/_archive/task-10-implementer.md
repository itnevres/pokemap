# Plan 6 Task 10: GBC CLI read commands -- implementer report

Repo: `/home/user/pokemap`, branch `plan-6-gbc-foundation` (already checked out, no worktree juggling needed this time).

## Files changed

New:
- `packages/cli/src/gbcCommands.ts` -- `runGbcRender`, `runGbcQuery` (thin, testable handlers).
- `packages/cli/test/gbcCommands.test.ts` (13 tests: 8 corpus-gated unit tests + 3 spawned end-to-end tests, all under `itWithGbcCorpus`, plus the connections/events-only variants).

Modified:
- `packages/cli/src/context.ts` -- factored `resolveRoot(explicit?)` out of `resolveProject`; `resolveProject` is now `openProject(resolveRoot(explicit))`, byte-identical behaviour/messages for every existing GBA caller.
- `packages/cli/src/args.ts` -- added `parseTime` (`--time morn|day|nite`, named refusal on anything else), following `parseBorder`/`parseScale`'s own shape.
- `packages/cli/src/index.ts` -- added `resolveRootAndFamily` (resolve root once, probe family once) and `runGbaOnly` (the one shared refusal wrapper), wired every command through them; `render`/`query` branch on family and dispatch to `gbcCommands.ts` for GBC; `render-world`, `validate`, `encounters`, `where`, `coverage`, `sign suggest`, `sign add`, `sign list`, `paint`, `diff` all go through `runGbaOnly` and refuse on a GBC root before any GBA loader runs.
- `packages/cli/test/context.test.ts` -- added a `describe("resolveRoot")` block (3 unit tests: explicit path verbatim / config fallback / missing-config refusal), no corpus needed.

Not committed (per instructions): `pokemap.config.json` (local-only `gbc.projectPath`), the task report itself, `package-lock.json`.

## Design choices

- **`resolveRootAndFamily`/`runGbaOnly` in `index.ts`, not `context.ts`.** These
  are CLI-dispatch concerns (they read `program.opts()` and decide which
  command handler runs), not root-resolution concerns, so they stay next to
  the command wiring they serve. `resolveRoot` (root resolution only, no
  family probe) is the one piece that belongs in `context.ts`, since
  `resolveProject` needs it too and both GBA and GBC callers share it.
- **`runGbaOnly(root, family, command, run)`** is a small pure function, not a
  loop over a command-name array. Each of the 10 GBA-only commands calls it
  explicitly with its own literal command name; there's no shared list a
  mutation could quietly shrink without touching call sites. The refusal
  message is exactly `<command> is not supported for gbc (pokecrystal-family)
  projects yet` for every one of them (verified live and in the "every
  GBA-only command refuses" spawn test below).
- **`detectEngineFamily` runs before `openProject`/`openGbcProject`.** For a
  bogus root this changes the exact error text from `openProject`'s own
  fieldmap.h message to `detectEngineFamily`'s combined gba-or-gbc message --
  the spec calls this out as acceptable, and I re-grepped `packages/cli/test`
  and `packages/server/test` for the old message text (0 hits, confirming the
  coordinator's own grep). For a genuine GBA root, `detectEngineFamily`
  returns `"gba"` without throwing and `openProject` runs exactly as before --
  no behaviour change for the real corpus.
- **`runGbcRender`/`runGbcQuery` return `{ stdout, stderr }` strings, never
  write to the real streams themselves** -- mirrors `writeCommands.ts`'s own
  shape so they're testable without spawning. `index.ts`'s action wiring
  writes `stderr` (only if non-empty) then `stdout`, and never sets
  `process.exitCode` for a defect-only warning (only a thrown refusal or
  loader error exits non-zero, matching the plan-wide "defects are warnings,
  not failures" rule).
- **`runGbcQuery`'s header shape**: per the spec's literal wording ("header =
  the GbcMap fields minus connections, **plus** layout: {...}"), `layout` is
  nested *inside* `header`, not a sibling top-level key the way GBA's `query`
  puts its own `layout`/`split`. `--header` alone therefore loads only
  `proj.layout(map)` (never `loadGbcMapEvents`); `--events`/no-flags load only
  events. This means a defect from the loader NOT selected by the current
  flags never leaks into `stderr` -- verified by the "`--header` on
  CeruleanCave2F surfaces the layout defect" test (layout defect present) and
  the "NewBarkTown: ... with no flags" test (`stderr` is `""`, since NewBarkTown
  has no defect on either loader).
- **`runGbcRender`'s own `time` default (`opts.time ?? "day"`)** exists
  independently of commander's own `("day")` default on the `--time` option,
  so the thin handler behaves identically whether called from `index.ts` or
  directly from a test with no `time` given at all.
- **`--border`**: reused `parseBorder` unchanged (GBA's 0-1000 cap). GBC's own
  ceiling (`proj.paddingWidth()`, 3 in the real corpus) is enforced inside
  `renderGbcMap` itself (Task 9), which already refuses with its own message
  naming the actual cap -- no new GBC-specific arg parser needed.
- **Spawned e2e test count**: the spec caps this at "3 tests only" for the
  Tests deliverable, and I kept exactly 3 `it()` blocks that spawn (render
  NewBarkTown, query NoSuchMap, and one combined "every GBA-only command
  refuses" test that loops 10 spawns for the 10 refused commands). That last
  one is a deliberate deviation from "sign list only" -- see the mutation-check
  below for why: proving "remove one GBA-only refusal, e.g. paint" is caught
  requires actually spawning the paint command against a GBC root (importing
  `index.ts` directly is unsafe -- it calls `main()`/`program.parseAsync()` as
  a side effect of module load, using the test runner's own `process.argv`).
  I judged one test with 10 spawns (~8s total) preferable to 10 separate
  `it()` blocks, keeping the "3 tests" count literal while still closing the
  gap the mutation-check surfaced.

## Measured values (NewBarkTown, real subject)

From `data/maps/attributes.asm`, `data/maps/maps.asm`, `constants/map_constants.asm`, `maps/NewBarkTown.asm`:
- header: `tileset TILESET_JOHTO`, `environment TOWN`, `palette PALETTE_AUTO`, `fishGroup FISHGROUP_OCEAN`, `border 5` ($05), `group 24` (`newgroup NEW_BARK` is the 24th `newgroup`), `layout { blkPath: "maps/NewBarkTown.blk", width: 10, height: 9, writable: true }` (10x9=90 bytes, file is exactly 90 bytes).
- connections: 2 (`west -> Route29`, `east -> Route27`).
- events: 4 warps, 2 coords, 4 bgs, 3 objects (cross-checked against `packages/core/test/gbc/load/events.test.ts`'s own pinned NewBarkTown fixture -- same counts).
- `CeruleanCave2F` defect (pre-existing, from Task 9's own corpus test): `maps/CeruleanCave2F.blk: actual size 400 bytes, declared 9x15=135 -- loaded first 135 bytes, not writable`.

## Mutation-check

| # | Mutation | Test that went red | Reverted, confirmed green |
|---|---|---|---|
| 1 | Drop the defect->stderr loop (`warningLines` returns `""` unconditionally) | 3 tests: "CeruleanCave2F: stderr carries exactly one warning: line...", "dropping the defect-to-stderr loop would surface no warning at all...", "`--header` on CeruleanCave2F surfaces the layout defect as a warning" | yes |
| 2 | Swap the family branch in `render` (`if (family === "gba")` instead of `"gbc"`) | "render NewBarkTown against the real subject exits 0 and prints the stdout line" (got the GBA-root fieldmap.h error instead) | yes |
| 3 | Remove one GBA-only refusal (`paint`'s action calls `resolveProject`/`runPaint` directly, skipping `runGbaOnly`) | "every GBA-only command refuses on the real gbc root..." -- failed specifically on `paint`, with the GBA loader's fieldmap.h error instead of the refusal | yes |
| 4 | `--header` also sets `out.events` (`if (all \|\| opts.events \|\| opts.header)`) | "`--header` includes no connections or events key (also kills the '--header including events' mutation)" | yes |
| 5 | Default time flipped to `"nite"` (`opts.time ?? "nite"`) | "omitting `--time` defaults to day, not nite" | yes |
| 6 | Render writes a non-deterministic field (appended `Date.now()` bytes after the PNG) | "NewBarkTown: ... two runs are byte-identical..." | yes |

Every mutation was caught by an existing or newly-added test; none survived. `git diff`/`npm run typecheck` confirmed clean after each revert, and the full `packages/cli/test/gbcCommands.test.ts` suite was re-run green after all six reverts.

## Live-verify (real subject, `/home/user/pokecrystal-PerfPlus`)

All run via `npx tsx packages/cli/src/index.ts --project /home/user/pokecrystal-PerfPlus ...` from the repo root:

- `render NewBarkTown -o nbt.png` -> exit 0, stdout `... 320x288 outOfRange=0 unmapped=0`. **Image**: New Bark Town in daytime colors -- sandy dirt path, bright green grass/trees ringing the map, four green-roofed houses (Elm's Lab top-left, two houses top-right/right, one house bottom-middle), a small blue pond on the right edge, and a patch of pink flowers bottom-left. Matches the real town layout.
- `render NewBarkTown --border 3 --time nite -o nbt_nite.png` -> exit 0, stdout `... 512x480 outOfRange=0 unmapped=0` (matches `(10+6)*32=512`, `(9+6)*32=480`). **Image**: same layout, now in cool blue/purple night palette, with a visible 3-block padding ring of trees/grass drawn around the whole map (the image is visibly larger with an extra dark-tree border compared to the un-bordered day render).
- `render CeruleanCave2F -o cc.png` -> printed `warning: maps/CeruleanCave2F.blk: actual size 400 bytes, declared 9x15=135 -- loaded first 135 bytes, not writable` on stderr, then exit 0 with stdout `... 288x480 outOfRange=0 unmapped=0`. **Image**: a purple-toned cave floor made of rounded boulder/rock metatiles, with a few distinct dark tile clusters scattered through it (real block data, not a rendering artifact).
- `query NewBarkTown` -> exit 0, full JSON with `header`/`connections`/`events`, matching the measured values above exactly (group 24, border 5, 2 connections, 4/2/4/3 events).
- `sign list NewBarkTown` -> exit 1, stderr `pokemap: sign list is not supported for gbc (pokecrystal-family) projects yet`, as expected.
- Also rendered `ElmsLab` for a second interior sanity check: exit 0, `160x192 outOfRange=0 unmapped=0`. **Image**: a lab interior with a control desk/monitor top-left, a PC, bookshelves along both walls, an incubator-like machine top-right, and a red door mat at the bottom -- reads correctly as Elm's Lab.

## Test counts / gates

- `npx vitest run packages/core/test/gbc`: 13 files / 462 tests, all green, 0 skipped -- unchanged from baseline.
- `npx vitest run packages/cli/test/gbcCommands.test.ts`: 13 tests, all green, 0 skipped.
- `npx vitest run packages/cli/test/context.test.ts`: 4 tests, all green (1 pre-existing + 3 new `resolveRoot` unit tests).
- `npm run typecheck`: clean.
- Full `npm test`: 925 passed, 136 skipped, 17 failed test files / 1 failed test -- exactly the pre-existing baseline (17 GBA-collection failures + `write/corpus.test.ts`'s "has every reference engine available", both from the missing GBA decomp on this machine, per the task instructions) plus my own 16 new passing tests (13 in `gbcCommands.test.ts` + 3 in `context.test.ts`) on top of the stated 909-passed baseline. **No new failures.**

## Concerns / deviations

- **Spawned e2e test count**: as noted above, I used one `it()` with 10 spawns
  to cover every GBA-only command's refusal, instead of only the "sign list"
  case the deliverables list names. This was necessary to close a real gap the
  mutation-check surfaced (mutation #3) and there was no way to catch it
  without spawning (index.ts cannot be safely imported for unit testing --
  it runs `main()`/`program.parseAsync()` at module load as a side effect).
  I kept the *test-case* count at 3, per the letter of "3 tests only", while
  giving it more spawns internally.
- **`detectEngineFamily` changes the CLI's bogus-root error message** (from
  `openProject`'s fieldmap.h-specific text to the combined gba-or-gbc probe
  message) for any GBA-side bogus-root case reached through the CLI. Confirmed
  via grep (0 hits in `packages/cli/test`/`packages/server/test`) that nothing
  asserts the old text; this is the spec's own documented, accepted tradeoff.
- No other deviations from the spec. GBA render/query/validate/encounters/
  where/coverage/sign/paint/diff logic bodies are byte-for-byte the same code
  that existed before this task, just re-indented one level inside
  `runGbaOnly`'s callback.

## Fix round 1

Quality review (`task-10-quality-review.md`, verdict: Approved with 3
Important + 3 Minor) and spec review (`task-10-spec-review.md`, verdict:
Issues -- 2 surviving mutations) both reviewed commit `9192a69`. This round
addresses every REQUIRED item from the coordinator's fix-round message.

### Spec issue 1 -- `resolveRoot` precedence untested against an existing config

Every prior `resolveRoot` test that passed an explicit path first `chdir`ed
into a directory with **no** `pokemap.config.json` at all, so `if (explicit)
return explicit;`'s actual precedence over the config file was never
exercised. Added
`context.test.ts`: "an explicit path wins over an existing, different
pokemap.config.json -- never reads the file at all" -- writes a
`pokemap.config.json` with a different `projectPath` into the fresh cwd, then
asserts the explicit path still wins. Confirmed this kills the mutation
("check config first, fall back to explicit only when the file is absent")
that survived in the spec review.

### Spec issue 2 -- `index.ts`'s stdout/stderr wiring never spawned against a defect-bearing map

Added a 4th spawned test: `render CeruleanCave2F` against the real subject,
asserting `status === 0`, `stderr` is exactly one `warning:` line naming
`maps/CeruleanCave2F.blk`, and `stdout` contains no `warning:` text at all
(only the `<out> <w>x<h> ...` line). While writing it I found the actual
production bug the review's own hunch anticipated -- not in `index.ts`, but
in `gbcCommands.test.ts`'s own `spawnCli` helper: it used `execFileSync`,
whose return value on a **zero exit** carries only `stdout` -- `stderr` is
discarded entirely (it's attached to the thrown error object only on a
non-zero exit). The helper's success path hardcoded `stderr: ""`, which
happened to be correct for every existing exit-0 test (their real stderr
genuinely was empty) but meant no exit-0 spawn test could ever have caught a
real `stdout`/`stderr` swap -- exactly the coverage gap the review named.
Fixed by switching `spawnCli` to `spawnSync`, which reports both streams and
the exit code unconditionally regardless of success/failure. Confirmed the
new test goes red against the "index.ts writes stderr to stdout" mutation
(see the mutation table below) with the fixed helper, and would NOT have gone
red with the old `execFileSync`-based one (verified by reasoning through the
old code path, not by re-introducing the bug -- the fix and the test were
written together).

This pushes the spawned e2e test count in this file to 4 `it()` blocks (one
of which internally loops 10 sub-spawns for the GBA-only refusal coverage
from the original round). The original spec's "3 tests only" budget no
longer holds literally; the coordinator's fix-round message explicitly asked
for this 4th test, so I added it rather than folding it into an existing one
that would have obscured its own failure message.

### Quality Important #1/#3 -- guard-clause refusals, no more shadowed `root`

Replaced `runGbaOnly(root, family, "<cmd>", (root) => { ...body... })` with a
plain guard-clause statement, `refuseIfGbc(family, "<cmd>")`, at the top of
each action, immediately followed by the original body at its **original**
indentation, for: `validate`, `encounters`, `where`, `coverage`, `sign
suggest`, `sign add`, `sign list`, `paint`, `diff`. This removes the
shadowed inner `root` parameter the callback shape introduced (the outer
`root` from `resolveRootAndFamily`'s destructure was already in scope).

`render-world` was deliberately left untouched, per the coordinator's
instruction: a parallel Task 11 worktree is rewriting that exact handler, and
touching it here would cause a cherry-pick conflict. `runGbaOnly` itself is
kept, but re-implemented as a one-line wrapper around the new `refuseIfGbc`
(`refuseIfGbc(family, command); run(root);`) so the two never drift, with a
doc comment explaining it's `render-world`'s last caller and that Task 11
removes both the wrapper's call site and the function itself.

Verified with `git diff 9192a69^ -- packages/cli/src/index.ts`: every
converted GBA-only command's diff hunk shows exactly two added lines (the
`refuseIfGbc(...)` guard and the `resolveProject(root)` line using the
now-destructured `root`) with **no other body changes** -- confirmed by
reading each hunk directly, not just trusting the diff stat. `render-world`'s
hunk is unchanged apart from the `runGbaOnly` definition itself moving above
it.

### Quality Important #2 -- leaked `mkdtempSync` dirs

`gbcCommands.test.ts`'s `tmpFile` helper now pushes every directory it
creates onto a module-level `tmpDirs` array, and a top-level `afterAll`
`rmSync`s each one (`{ recursive: true, force: true }`), mirroring
`packages/core/test/family.test.ts`'s and this same file's sibling
`context.test.ts`'s own convention. Verified empty-`/tmp`-after-run
repeatedly, including once deliberately with 4 of the file's own tests
failing (to confirm `afterAll` still fires on a test failure, not just on an
all-green run) -- 0 leftover `pokemap-gbc-cli-*` dirs either way. Also
removed the ~173 `pokemap-gbc-cli-*` directories my own earlier (pre-fix)
runs had left in `/tmp`.

### Minors 4 and 5

- Reworded `gbcCommands.ts`'s doc comments: they previously claimed to mirror
  `writeCommands.ts`'s own return *shape*; reworded to say they mirror its
  *principle* (return instead of write) and spelled out that
  `writeCommands.ts`'s own handlers return a plain `string`, not a `{
  stdout, stderr }` pair.
- Collapsed `RunGbcRenderResult`/`RunGbcQueryResult` (two identical `{
  stdout: string; stderr: string }` interfaces) into one shared
  `GbcCommandResult`, used as both handlers' return type. Minor 6 (the
  10-spawn test bundling all assertions behind the first failure) was
  explicitly out of scope for this round per the coordinator's message and
  was left as is.

### Mutation-check, fix round 1

All 6 original mutations plus the reviewer's 2 survivors, re-run against the
fixed code, each confirmed red then reverted and confirmed green:

| # | Mutation | Test that went red |
|---|---|---|
| 1 | Drop the defect->stderr loop (`warningLines` returns `""`) | 4 tests red: the two `CeruleanCave2F` `warning:`-pin tests, the `--header` layout-defect test, and (new in this round) the "render CeruleanCave2F ... the warning lands on stderr" spawn test |
| 2 | Swap the family branch in `render` (`family === "gba"` instead of `"gbc"`) | "render NewBarkTown against the real subject exits 0..." |
| 3 | Remove `paint`'s refusal (now: delete the `refuseIfGbc(family, "paint");` guard line) | "every GBA-only command refuses..." fails specifically on `paint` |
| 4 | `--header` also sets `out.events` | "`--header` includes no connections or events key..." |
| 5 | Default time flipped to `"nite"` | "omitting `--time` defaults to day, not nite" |
| 6 | Render writes a non-deterministic field (appended `Date.now()` bytes) | "NewBarkTown: ... two runs are byte-identical..." |
| 7 (reviewer) | `resolveRoot` checks `pokemap.config.json` first, falls back to explicit only if absent | (new test) "an explicit path wins over an existing, different pokemap.config.json..." |
| 8 (reviewer) | `index.ts`'s render wiring writes `stderr` to `process.stdout` instead of `process.stderr` | (new test) "render CeruleanCave2F against the real subject: the warning lands on stderr, never stdout" |

All 8 confirmed red, then reverted; `npm run typecheck` and the full
`packages/cli/test`/`packages/core/test/gbc` suite reconfirmed green after
every revert.

### Gates (fix round 1)

- `npx vitest run packages/core/test/gbc packages/cli/test/gbcCommands.test.ts packages/cli/test/context.test.ts`:
  **15 files / 481 tests, all green, 0 skipped** (462 unchanged GBC-core +
  14 in `gbcCommands.test.ts`, up from 13 + the new spawn test + 5 in
  `context.test.ts`, up from 4 + the new precedence test).
- `npm run typecheck`: clean.
- Full `npm test`: **927 passed, 136 skipped, 17 failed test files / 1 failed
  test** -- exactly the pre-existing baseline (missing GBA decomp on this
  machine), same as before this round plus the 2 new tests (925 -> 927). No
  new failures.
- `git -C /home/user/pokecrystal-PerfPlus status --porcelain`: empty.
- `/tmp`: 0 leftover `pokemap-gbc-cli-*`/`pokemap-resolveRoot-*` directories
  after repeated full and partial runs.

### A note on process

Mid-fix-round, while chasing down an unrelated question about whether
`afterAll` still fires on a failing test (it does), I ran `git checkout --
packages/cli/src/gbcCommands.ts` to "reset" a scratch mutation I'd applied
with `sed`, and it silently discarded this round's already-applied Minor 4/5
changes (the file reverted to commit `9192a69`'s version, since that's what
was on disk at HEAD) instead of just undoing the `sed` edit. Caught it
immediately via the tool's own change notification, diffed it against the
intended content, and reapplied Minor 4/5 by hand -- verified afterward with
`diff <(git show 9192a69:...) gbcCommands.ts` that the file matched exactly
what it should (original logic + only the two Minor fixes) before moving on.
Flagging this plainly since it was a real (if quickly caught) mistake, not
because it changed the outcome.
