# Task 18 spec review: CLI write commands

Base `917e9d5` -> Head `89d4b84`. Verified independently against code, git history, the real
subject decomp (`C:/Programming Projects/Pokemon Game/game`), and live CLI execution — not just
the implementer's report.

## Verdict: mostly compliant, one verification-diligence gap found

## What checks out (independently confirmed, not just re-read from the report)

- **Commit shape**: exactly one commit on top of `917e9d5` (`git rev-list --count` = 1). `git show
  --stat 89d4b84` touches exactly the three named files from Step 9 (`packages/cli/src/index.ts`,
  `packages/cli/src/writeCommands.ts`, `packages/cli/test/writeCommands.test.ts`) — no stray files,
  no `git add -A` residue.
- **`originalMap` deep-copy fix is real**: `writeCommands.ts:28` uses `originalMap:
  structuredClone(map)`, matching `packages/server/src/editSessions.ts`'s real `open()`
  (confirmed by reading that file directly, which uses the identical `structuredClone(map)`
  pattern with the same aliasing-hazard doc comment). The plan's own literal sample code at line
  5613 of the plan doc has `originalMap: map` (aliased) — the fix is a genuine, correct deviation
  from the plan's sample, not an invented problem.
- **Commander nesting bug is real, and the fix works**: read `node_modules/commander/lib/
  command.js:151` directly — `nameAndArgs.match(/([^ ]+) *(.*)/)` splits on the first space only,
  and line 161 (`if (args) cmd.arguments(args)`) would parse `"suggest <map>"` as two positional
  arguments named `suggest` and `map` on a top-level `sign` command, not a nested subcommand.
  Installed commander version is 12.1.0, confirmed via package.json. Verified the fix live: `npx
  tsx packages/cli/src/index.ts sign --help` shows a real parent command with `suggest <map>`, `add
  <map>`, `list <map>` as genuine subcommands (`Usage: pokemap sign [options] [command]`).
- **`dryRunOrCommit` label-print fix**: confirmed the plan's own sample `dryRunOrCommit` omits
  `label` from the dry-run branch while the plan's own sample test (line 5495) asserts
  `out.toContain("Route29_EventScript_WildSign_Rattata")` on the dry-run output — a genuine
  inconsistency in the plan text. The shipped fix (`writeCommands.ts:47`) prints `label` on both
  branches. Confirmed live: `sign add Route29 ... ` (no `--yes`) against the real decomp printed
  `Route29_EventScript_WildSign_Rattata` followed by the dry-run notice.
- **`guardSignWrite` runs before any session is opened**: `writeCommands.ts` — `runSignAdd` calls
  `buildWildSign` (pure, no I/O) then `guardSignWrite(proj.paths.root, args.map,
  built.scriptLabel)` and throws before `openCliEditSession` is ever called. A label collision
  cannot construct or touch a session, even with `--yes`.
- **`runDiff` never commits**: `runDiff` builds its own session via `paintSession(proj, {...args,
  yes: false})` and calls `planSave` + `formatDiffText` directly — it never references
  `commitSave` or `dryRunOrCommit` at all, and its parameter type (`Omit<PaintArgs, "yes">`)
  structurally cannot carry a `yes: true`.
- **Real map-name claims, independently re-verified from the actual decomp, not trusted from the
  report**:
  - `PalletTown/map.json` has zero `OBJ_EVENT_GFX_SPECIES` matches (`grep` exit 1).
  - `CeladonCity/map.json:55` has `"graphics_id": "OBJ_EVENT_GFX_SPECIES(POLIWRATH)"`.
  - `src/data/wild_encounters.json` contains `MAP_ROUTE29`.
  - Route29/30/31/32/33/34/35 all have real `map.json` + `scripts.inc`, and each resolves to a
    **distinct** `LAYOUT_ROUTE29..35` (confirmed by reading each map.json's `layout` field) — so
    Route33/Route34's blockdata binaries are genuinely different files.
- **Live-verify (Step 7), redone independently**: baseline `git status --porcelain` on the decomp
  matched the stated 6-entry baseline (5 NavelRock/fieldmap.h modifications + 1 untracked docs
  file) before I started. Ran `sign suggest Route29` (real ranked species, matches report's
  numbers exactly: Hoothoot 61.0%, Pineco 60.0%, etc.), `sign add Route29 ...` without `--yes`
  (decomp stayed at baseline), then with `--yes` (decomp showed exactly `data/maps/Route29/map.json`
  and `data/maps/Route29/scripts.inc` added to the baseline, nothing else), then restored via `git
  checkout --`. Decomp confirmed back to the exact 6-entry baseline afterward.
- **Teeth-proof (Step 8), redone independently**: removed the `if (!yes) return ...` line from
  `dryRunOrCommit`, ran the "without --yes... writes nothing" test in isolation — it failed as
  expected (`expected '...' to match /dry.?run|not written|--yes/i`), and — as the report
  describes — this also caused a real, un-gated write to the live decomp's Route29 files (verified
  via `git status --porcelain` before restoring with `git checkout --`). Reverted the code change;
  full `writeCommands.test.ts` suite back to 10/10.
- **Test/typecheck counts match**: `npx vitest run packages/cli/test/writeCommands.test.ts` → 10/10;
  `npx vitest run packages/cli` → 6 files/40 tests; `npx vitest run` (full monorepo) → 73 files/647
  tests, all passing; `npx tsc --noEmit -p tsconfig.base.json` clean.
- CLI wiring (`sign suggest/add/list`, `paint`, `diff`) matches the spec's required options exactly
  (`--species/--dialogue/--x/--y/--elevation` default 0/`--yes` on `sign add`; `--tool/--x/--y/
  --x1/--y1/--metatile/--yes` on `paint`; same minus `--yes` on `diff`), and every action handler is
  thin, delegating to the exported functions, matching the file's existing style.
- No scope creep: the only functions added are the 5 required (+3 unexported private helpers that
  were already present in the plan's own sample code, not invented).

## Issue found

**Route33/Route34 collision claim is factually wrong; Route31 has a related, narrower risk.** The
report explicitly states: *"Route33/Route34 real blockdata writes whose paths are never touched by
any other test"* — this is false. `packages/server/test/paintRoutes.test.ts:224` uses Route34 (a
test that fetches real block values via `GET /api/map/Route34`, then does a begin/apply/end/undo
cycle and asserts exact before/after metatile ids) and `packages/server/test/paintRoutes.test.ts:244`
uses Route33 (session-only, status-code assertion only, less exposed). `writeCommands.test.ts`'s own
Route33 test (`runPaint --yes`) and Route34 test (`runPaint` rect `--yes`) do **real** `commitSave`
writes to those same routes' real blockdata binaries on disk, restored via `finally`. Under vitest's
default parallel-file execution (no `fileParallelism`/pool override in `vitest.config.ts`), these
are two independent test files performing real reads/writes against the same real files on disk —
exactly the hazard the task's own text required checking for ("distinct enough across tests that
parallel vitest workers never race on the same file"), and exactly the class of bug the implementer
did correctly catch and fix for the Route30/`signRoutes.test.ts` case. A similar, narrower version
exists for Route31: `writeCommands.test.ts`'s `SIGN_LABEL_EXISTS` test seeds a real
`Route31_EventScript_WildSign_Rattata::` line into Route31's real `scripts.inc` and restores it,
while `signRoutes.test.ts`'s own Route31 test (also species RATTATA, same derived label) does a
real `POST /sign/add` that reads the same file via `guardSignWrite`.

Caveats, in fairness: (1) I ran the full suite once and the cli+server subset five times back to
back during this review and observed zero failures — the actual race window (a synchronous
`readFileSync`/`writeFileSync` pair) appears narrow enough that it does not reproduce reliably, so
this is a real latent flakiness risk rather than a demonstrated, reproducing bug; (2) the Route31
case may not even manifest as a hard test failure given `signRoutes.test.ts`'s assertion there
(`plan.changes` equals `[]`) would pass whether or not the add was itself refused by the race.
Severity: low-to-moderate (latent CI flakiness, not a functional defect in the shipped commands
themselves) — but it does mean the report's specific verification claim for Route33/Route34 is
incorrect, and the task's explicit "verify this was not just asserted" instruction was not fully
carried out for the paint-tool test maps the way it was for the sign-tool ones.

## Not found (checked and ruled out)

- No missing functions, no missing CLI commands, no missing options.
- No extra/unrequested functionality beyond the 3 documented, justified deviations.
- No autosave-by-default anywhere; `--yes` is required uniformly through the one shared
  `dryRunOrCommit` path (`runDiff` is structurally incapable of writing).
- `scriptAppends: []` (vs. editSessions.ts's open() leaving the optional field unset) is present in
  the plan's own literal sample code too, not an implementer-introduced deviation, and is
  behaviourally identical everywhere it's read (`session.scriptAppends ?? []`) — not a real issue.
