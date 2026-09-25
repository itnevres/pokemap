# Task 18: CLI write commands -- implementer report

**Status:** DONE

## What I implemented

- `packages/cli/src/writeCommands.ts` (new): `openCliEditSession`, `dryRunOrCommit` (private),
  `runSignSuggest`, `runSignAdd`, `runSignList`, `stampFor`/`targetsFor`/`paintSession` (private),
  `runPaint`, `runDiff`. Thin, directly-testable functions; no logic inline in commander action
  closures.
- `packages/cli/src/index.ts`: wired `sign suggest <map>`, `sign add <map>`, `sign list <map>`,
  `paint <map>`, `diff <map>`.
- `packages/cli/test/writeCommands.test.ts` (new): 10 tests, all against the real subject corpus
  via `itWithCorpus`.

### Two deviations from the task's literal sample code (both necessary; real source/behavior wins per your instructions)

1. **`originalMap: map` -> `originalMap: structuredClone(map)`.** The task's own Step 1 pointed me
   at `EditSession.originalMap`'s doc comment in `save.ts`: "MUST be a deep, independent copy...
   any other constructor -- including the CLI's own equivalent in Task 18 -- must do the same."
   The task's sample `openCliEditSession` code aliased it instead (`originalMap: map`), which is
   exactly the violation that comment warns against. Fixed to match `editSessions.ts`'s own
   `open()` (`originalMap: structuredClone(map)`) exactly, per the task's own stated requirement
   that this function build "the exact same `EditSession` shape."

2. **Commander subcommand nesting.** The task's given wiring (`program.command("sign suggest <map>")`,
   etc.) does not do what it looks like it does in commander 12.1.0 (the version this repo pins).
   `Command.command(nameAndArgs)` splits on the *first* space only
   (`nameAndArgs.match(/([^ ]+) *(.*)/)`), so that string would register a top-level command
   literally named `"sign"` with the leftover text `"suggest <map>"` handed to `.arguments()`,
   which splits on whitespace *again* and defines two positional arguments -- one literally named
   `suggest`, one named `map` -- not a nested `sign suggest` subcommand at all. I verified this by
   reading `node_modules/commander/lib/command.js` directly. Fixed by creating a real parent
   command (`const sign = program.command("sign")`) and attaching `suggest <map>`/`add <map>`/
   `list <map>` as subcommands of it, which is the correct commander idiom for nested subcommands.
   I left an explanatory comment in `index.ts` at the fix site.

3. **`dryRunOrCommit`'s dry-run return string.** The task's own sample test asserts
   `expect(out).toContain("Route29_EventScript_WildSign_Rattata")` on `runSignAdd`'s *dry-run*
   output, but the task's own sample `dryRunOrCommit` never includes the `label` argument anywhere
   in the dry-run branch (only in the "committed: ${label}" branch). I changed
   `dryRunOrCommit` to print `label` at the top of both the dry-run and commit output (so a user
   sees the derived script label before deciding whether to pass `--yes`, which is also better CLI
   UX). This is the minimal fix that makes the task's own literal test pass; I did not invent new
   test assertions to work around it.

## Real map-name verification (required by the task text; not pre-done)

Checked directly against `C:/Programming Projects/Pokemon Game/game` (the subject decomp):

- Route29, Route30, Route31, Route32, Route33, Route34, Route35, CeladonCity, PalletTown: all
  real map directories, each with `map.json` and `scripts.inc`.
- Route29: has a `MAP_ROUTE29` entry in `src/data/wild_encounters.json` (wild table present).
- CeladonCity: `map.json` contains `"graphics_id": "OBJ_EVENT_GFX_SPECIES(POLIWRATH)"` with
  `"script": "CeladonCity_EventScript_Poliwrath"` -- confirmed real wild-sign object event.
- PalletTown: `map.json` contains no `OBJ_EVENT_GFX_SPECIES` object event -- confirmed as the
  "none found" case.
- Route30/31/32/33/34/35: each map's `layout` id (`LAYOUT_ROUTE30`..`LAYOUT_ROUTE35`) resolves in
  `data/layouts/layouts.json`, each a distinct layout (distinct blockdata files).

**Found and fixed a real collision the task's own plan text got wrong:** the task's Step 2 sample
test used **Route30** for `runSignAdd`'s "with --yes actually commits" test, with a comment
claiming it is "distinct from the one Task 17's own server test uses." I grepped every test file
in the repo and found `packages/server/test/signRoutes.test.ts` (already merged, Task 17) *also*
does a real `writeFileSync`+restore cycle against `Route30`'s real `scripts.inc` (its
SIGN_LABEL_EXISTS-refusal test). Since our new test does a *real* `commitSave` write (not just a
manual seed-and-restore) to that same file, running both test files under vitest's default
parallel-file execution is a genuine lost-update race on the real repo file. I swapped the target
map for that one test from Route30 to **Route35** -- confirmed real, has `scripts.inc`, and (grepped
across every `packages/*/test/**` file) referenced nowhere else in the repo. Left a comment in the
test explaining why. Every other map choice in the task's test file (Route29 read-only/dry-run
only, Route31 seed-and-restore only -- matches what signRoutes.test.ts's own Route31 usage does,
i.e. no real write there either -- Route32 diff/read-only, Route33/Route34 real blockdata writes
whose paths are never touched by any other test) checked out as genuinely distinct; only Route30
needed to change.

## Testing and results

- `npx vitest run packages/cli/test/writeCommands.test.ts` before implementation: **FAIL** (module
  not found), as expected.
- After implementation: **PASS, 10/10.**
- `npx vitest run packages/cli`: **PASS, 6 files / 40 tests.**
- `npx tsc --noEmit -p tsconfig.base.json`: clean, no errors.
- Full monorepo suite, `npx vitest run` (all packages, including the now-confirmed-non-colliding
  Route30/Route35 split running concurrently with `signRoutes.test.ts`/`paintRoutes.test.ts`/
  `saveRoutes.test.ts`): **PASS, 73 files / 647 tests.**

## Live-verify (Step 7) results

Ran against the real subject decomp (`C:/Programming Projects/Pokemon Game/game`):

1. `git status --porcelain` baseline confirmed: exactly the 6 known pre-existing entries (5
   modified NavelRock/fieldmap.h files + 1 untracked docs file), matching what I was told to
   expect.
2. `pokemap sign suggest Route29 --project ...`: printed real ranked species (Hoothoot 61.0%,
   Pineco 60.0%, Pidgey 50.0%, Rattata 39.0%, Exeggcute 30.0%, Sentret 25.0%, Hoppip 16.0%,
   Spinarak 5.0%, Ledyba 5.0%) and `suggested placement: (5, 0)`.
3. `pokemap sign add Route29 --species RATTATA --dialogue "..." --x 1 --y 1 --project ...` (no
   `--yes`): printed the plan (`Route29_EventScript_WildSign_Rattata`, a json field-edit change, a
   13-line scripts.inc append) and `(dry run -- not written; pass --yes to commit)`. Confirmed
   `git status --porcelain` in the decomp was **still exactly the 6-entry baseline** -- nothing
   written.
4. Same command with `--yes`: printed `committed`. `git status --porcelain` then showed exactly
   the baseline plus `data/maps/Route29/map.json` and `data/maps/Route29/scripts.inc` modified --
   nothing else.
5. `git checkout -- data/maps/Route29/map.json data/maps/Route29/scripts.inc` restored the decomp;
   confirmed `git status --porcelain` matched the original 6-entry baseline exactly again.

## Teeth-proof (Step 8) result

Temporarily removed the `if (!yes) return ...` early-return from `dryRunOrCommit` and re-ran the
"`runSignAdd` without `--yes` prints the plan and writes nothing" test in isolation: it **failed**
(the returned string no longer matched `/dry.?run|not written|--yes/i`, since with the gate
removed the function unconditionally committed). This also, as expected, caused a real write to
Route29's `map.json`/`scripts.inc` in the live subject decomp (a second, real, un-gated commit) --
I caught this via `git status --porcelain` immediately after and reverted with
`git checkout -- data/maps/Route29/map.json data/maps/Route29/scripts.inc` before doing anything
else, restoring the exact 6-entry baseline again. Reverted the code change and re-ran the full
`writeCommands.test.ts` suite: back to 10/10 passing.

## Files changed

- `packages/cli/src/writeCommands.ts` (new)
- `packages/cli/src/index.ts` (modified -- import + 5 new commands wired under a proper `sign`
  parent command, plus `paint`/`diff`)
- `packages/cli/test/writeCommands.test.ts` (new)

Commit: `89d4b84` -- "feat(cli): sign suggest/add/list, paint, diff -- write commands default to
dry-run, require --yes to commit"

## Self-review findings

- Completeness: every command in the task spec is wired and tested; dry-run-by-default and
  explicit `--yes`-to-commit is enforced uniformly through the single shared `dryRunOrCommit`
  helper (matches I6's "no autosave, ever," extended to the CLI, and the task's own explicit
  requirement that no third code path re-implement `planSave`/`commitSave`).
- Quality: `writeCommands.ts` stays a single-responsibility file of thin, exported, testable
  functions plus three small private helpers (`dryRunOrCommit`, `stampFor`/`targetsFor`,
  `paintSession`) -- did not grow beyond what the task's own sample sketched, aside from the three
  fixes documented above.
- Discipline: no scope beyond the five commands the task asked for; `bucket` intentionally
  refused from the CLI (matches the task's own reasoning, unchanged from the sample).
  `guardSignWrite`'s check happens before any `EditSession` is even opened for `sign add`, so a
  label collision never touches map.json even in memory, matching the "even with --yes" test.
- Testing: all 10 tests run against the real subject corpus (no stubs/mocks), verify real
  string/refusal/write behavior, and I independently re-verified every real map name and the one
  genuine parallel-test collision the task's own plan text missed (Route30), rather than trusting
  the plan's claim that this was already checked.

## Concerns

None blocking. Two items worth flagging for whoever runs Task 19 (the merge gate):

1. The Route30->Route35 swap is a deviation from the plan document's literal test code. I judged
   this correct because the plan's own instructions explicitly required me to verify distinctness
   myself and explicitly said that verification was not done for me -- and the swap is the direct,
   necessary consequence of that verification. Flagging in case a reviewer wants to double-check my
   reasoning against `packages/server/test/signRoutes.test.ts`.
2. `paint`'s CLI-level `--tool` only accepts `pencil`/`rect` (typed as `"pencil" | "rect"` in the
   command's own option type), matching the task's own stated scope (`bucket` refused with a clear
   error at the `writeCommands.ts` level). This is by design per the task text, not an oversight.

## Follow-up: spec-review fix for real map-name races (post-DONE)

A spec-compliance review (`task-18-spec-review.md`) found my original report's claim --
*"Route33/Route34 real blockdata writes whose paths are never touched by any other test"* -- was
factually wrong. Re-verified independently and confirmed the reviewer's finding:

- `packages/server/test/paintRoutes.test.ts:224` opens a real session on **Route34** (a real
  `readFileSync` of its blockdata via `editSessions.ts`'s `open()`, since `EditSessionsStore.open()`
  re-reads `blockdataFilepath`/`borderFilepath`/`mapJson` from disk fresh every call, no caching)
  and asserts *exact* before/after metatile ids on the identical `(0,0)-(1,1)` rectangle my
  `writeCommands.test.ts` Route34 test paints via a real `commitSave` write.
- `packages/server/test/paintRoutes.test.ts:244` similarly opens a real session on **Route33**
  (400-status assertion only, but still a real disk read of the same file my Route33 test
  `commitSave`-writes to).
- Confirmed via `packages/server/src/index.ts`: `commitSave` is only ever invoked from the
  `/commit` route handler (line 785) -- `paint/begin`/`apply`/`end`/`undo`/`redo` never write to
  disk, only read (via session `open()`). So `paintRoutes.test.ts` is a real-read-only file, but a
  real read racing a real write on the same path (vitest's default parallel-file execution, no
  `fileParallelism` override in `vitest.config.ts`) is still the exact hazard the task asked me to
  rule out for every map choice, not just the sign-tool ones.
- A narrower version existed for **Route31**: my `SIGN_LABEL_EXISTS` test does two real
  `writeFileSync` calls (seed the colliding label, then restore) against Route31's real
  `scripts.inc`, while `signRoutes.test.ts`'s own Route31 test does a real `POST /sign/add` that
  reads that same file via `guardSignWrite`, with the same derived label (species RATTATA). A read
  landing between my seed-write and restore would see the seeded label and get refused instead of
  succeeding -- `signRoutes.test.ts`'s own assertion (`plan.changes` equals `[]`) happens to pass
  either way today, but that's a coincidence of what it currently asserts, not a guarantee, so I
  swapped it rather than argue it's safe.
- Checked `paintRoutes.test.ts:195`'s **Route32** usage (the reviewer's specific ask): it does
  `paint/begin` (a real read) then a `shift` apply missing `dx`/`dy` (400, no write, no `/commit`
  call) -- read-only on both sides against my `runDiff` test's own read-only Route32 use, so no
  fix needed there; left unchanged.

**Fix applied**: grepped every `packages/*/test/**/*.ts` file (test files and helpers) for every
map-name reference in use across the whole repo, then picked three replacements confirmed real in
the subject decomp with the same rigor as the original Route35 pick (real `map.json` +
`scripts.inc`, and for the two blockdata tests a distinct `LAYOUT_ROUTE*` resolving to a distinct
`blockdata_filepath` in `data/layouts/layouts.json`), and confirmed zero references anywhere else
in the repo (tests, source, and docs):

- Route33 -> **Route37** (`runPaint` pencil `--yes` test) -- `LAYOUT_ROUTE37` ->
  `data/layouts/Route37/map.bin`.
- Route34 -> **Route38** (`runPaint` rect `--yes` test) -- `LAYOUT_ROUTE38` ->
  `data/layouts/Route38/map.bin`.
- Route31 -> **Route40** (`SIGN_LABEL_EXISTS` test) -- has a real `scripts.inc`.

Left explanatory comments in `writeCommands.test.ts` at each swap site, matching the existing
Route30->Route35 comment style.

### Re-verification results

- `npx vitest run packages/cli/test/writeCommands.test.ts`: **PASS, 10/10.**
- `npx vitest run packages/cli/test/writeCommands.test.ts packages/server/test/paintRoutes.test.ts
  packages/server/test/signRoutes.test.ts`, run **5 times back-to-back**: **PASS, 28/28 every
  time**, zero flakes.
- Full monorepo `npx vitest run`: **PASS, 73 files / 647 tests.**
- Subject decomp (`C:/Programming Projects/Pokemon Game/game`) `git status --porcelain` checked
  specifically for every route touched by `writeCommands.test.ts` (old and new: Route29, Route35,
  Route33, Route34, Route37, Route38, Route40) after the full run: **zero residual diffs** -- all
  `try`/`finally` restores landed cleanly. (The repo's pre-existing, unrelated 6-modified-file +
  1-untracked-file baseline from NavelRock/`fieldmap.h`/`layouts.json` and a docs file was already
  present before this session started and is out of this fix's scope.)

Commit: `5de00c0` -- "fix(cli): use map names in writeCommands.test.ts that don't race real
test-file writes elsewhere" (test file only staged; the pre-existing modified plan doc in this
working tree was left untouched).

## Follow-up: code-quality-review fix -- dry-run refusal asymmetry (post-DONE)

A code-quality review (`task-18-code-quality-review.md`) found `dryRunOrCommit`
(`writeCommands.ts:41-50`) threw immediately whenever `planSave(...).refusals` was non-empty --
even on the plain dry-run path (no `--yes`), before ever calling `formatDiffText(plan)`. Since
`formatDiffText` (`write/diff.ts:4-10`) already renders refusals inline (`REFUSED [code] subject:
message -- fix`) alongside any changes, and `runDiff` (used by the `diff` command) calls it
directly and never throws, the same guard failure rendered completely differently depending on
which command hit it: `pokemap diff` printed a clean preview including the refusal line, but
`pokemap paint`/`sign add` with the identical args (no `--yes`) crashed to stderr with only the
refusal message. Confirmed this was inherited verbatim from the plan's own literal sample code (a
4th plan-text defect in this same function, on top of the 3 already found and fixed).

**Fix**: reordered `dryRunOrCommit` (`writeCommands.ts:41-49`) so `diffText` is always computed
via `formatDiffText(plan)` first; the refusal check now only runs (and only throws) inside the
`yes` branch, immediately before `commitSave` -- a refusal still always blocks an actual write,
it just no longer blocks the dry-run *preview*. The dry-run branch returns unconditionally, same
as before, now always including any `REFUSED` lines `formatDiffText` renders.

Checked `writeCommands.test.ts` for any test asserting a throw on the dry-run/no-`--yes` path:
none exists -- the one existing throw test (`SIGN_LABEL_EXISTS`) fires from `guardSignWrite`
inside `runSignAdd` itself, before `dryRunOrCommit` is ever called, so it's unaffected.

Added two new tests against a real guard refusal (not a stub): `guardLayoutSave`'s
`metatile-out-of-range` on Route32, using metatileId `1000` -- confirmed against Route32's real
tileset split (primary 640 + secondary 340 metatiles, ceiling `min(980, 1024)` = 980) so `1000`
trips the range check while still fitting `encodeBlocks`'s own 10-bit block mask (0-1023), unlike
an arbitrarily large id which would throw earlier in `planBlockdataWrite` for an unrelated reason:

- `runPaint` without `--yes` on that input now returns a string containing `REFUSED` and
  `metatile-out-of-range` (not a throw), and writes nothing.
- `runPaint` with `--yes` on the identical input still throws (`/metatile-out-of-range/`) and
  writes nothing -- confirming the `--yes` gate did not regress.

### Verification

- `npx vitest run packages/cli/test/writeCommands.test.ts`: **PASS, 12/12** (10 existing + 2 new).
- `npx vitest run packages/cli`: **PASS, 6 files / 42 tests.**
- Full monorepo `npx vitest run`: **PASS, 73 files / 649 tests.**

Commit: `ead9a6c` -- "fix(cli): dry-run preview renders refusals instead of throwing, matching
diff's behavior" (`writeCommands.ts` + `writeCommands.test.ts` only; the pre-existing modified
plan doc in this working tree was left untouched).
