# Task 6b implementer report

Status: GBA implementation complete; focused checks pass, broader gate blocked by environment/existing tests. No commits or mutations.

## Changes

- Added GBA `sign/at`, `sign/put`, and `sign/resolve` beside the legacy wild-sign route, mirroring the committed GBC wire shapes and refusal behavior. Placement, updates, refresh, and unlink each stage one snapshot command; failed operations stage nothing.
- Extended the existing `signRefresh.ts` with GBA effective-script computation and pure linked refresh. Plan and commit regenerate from current source data and return `signNotices`; hand-edited linked bodies are skipped with the required notice.
- Updates and refresh fold the effective replacement plus appends into one guarded replacement per path, retaining the original disk baseline and dropping that path's appends (R-e).
- Exported `applyScriptAppend` from core save.ts and used it both in commit and effective-text computation. Its separator respects LF/CRLF. New blocks preserve the target's final-newline state and hash the actual staged body bytes.
- Recorded session-open hashes for editable sign-shaped blocks. New-number allocation also reserves map.json bg-event script names and orphan text labels.
- Reopened GBA editing sessions read map.json afresh through the store's project view. This is needed so a newly committed sign remains available to subsequent sign reads/updates instead of using Project's cached pre-commit map.
- Appending to an unterminated EOF supplies a newline to the previous body. Placement re-hashes a previously clean marked body only when that separator changed its hash; already hand-edited bodies remain protected.
- Added tests only to signRoutes.test.ts; its original tests were preserved verbatim. New tests use fresh copies of real subject files and write only inside those temporary directories.

## Verification

- RED: CLI invocation failed loading vitest.config.ts because esbuild tried to read a protected ancestor directory. Used the dispatch-approved Vitest Node API with config:false and equivalent test settings.
- RED: first new-route run: 11 failed, 1 passed (paint-only existing behavior), 4 legacy tests excluded by the name filter. Missing routes returned 404 as expected.
- Intermediate run caught stale cached map data after commit and EOF hashing assumptions. After fixes: all initial 12 new GBA cases passed.
- Additional EOF regression failed first (`handEdited: true` after placing a second sign), then the placement fix was applied.
- Final focused Node API run: 33 passed, 0 failed across 3 files: 15 new GBA cases, all 12 committed GBC sign-route cases, and all 6 core script-replacement cases. Four legacy sign tests were excluded only by the focused name filter; the full run includes them.
- Final EOF-only recheck after broadening separator repair to orphan script labels: 1 passed, 0 failed.
- Full suite: 2,885 passed, 44 failed, 52 skipped; 181 files passed and 10 failed (191 total). No new GBA sign test failed. The full run started before the final source refinements; the final focused run and EOF recheck cover those refinements.
- `npm.cmd run typecheck`: passed after final production edits.
- `git diff --check`: passed.

## Scope and concerns

Only the five authorized source/test files and this report were changed. GBC implementation and existing tests/fixtures were left unchanged. No mutations or commits were run. No real subject file was intentionally written by new tests. Existing corpus/server tests still attempt writes to protected real project roots; their failures are listed below, without edits to those tests.

Existing GBA plan-shape assertions failing solely because of `signNotices`: none. No existing assertion was edited.

## Reproduction

The focused run used `startVitest('test', ['packages/server/test/signRoutes.test.ts', 'packages/server/test/gbcSignRoutes.test.ts', 'packages/core/test/write/saveScriptReplace.test.ts'], { config: false, watch: false, pool: 'threads', maxWorkers: 2, minWorkers: 1, testNamePattern: 'GBA background sign|GBC sign routes|scriptReplaces' })`, followed by `await ctx.close()`.

The full run uses `startVitest('test', [], { config: false, watch: false, pool: 'threads', maxWorkers: 2, minWorkers: 1, include: ['packages/*/test/**/*.test.{ts,tsx}'], environmentMatchGlobs: [['packages/ui/**', 'jsdom']], setupFiles: ['packages/ui/test/setup.ts'] })`. JSON output is in `task-6b-full.json.log`; focused evidence is in `task-6b-final-focused.json.log`. Logs are ignored workspace artifacts.

A static check also confirmed the original signRoutes.test.ts content is an unchanged prefix of the edited file, only the five authorized source/test files appear in the tracked diff, and all added lines are ASCII.

## Broader gate failures (left unchanged)

- Protected real-root writes: 30 failed tests across existing CLI writes, dungeon API, GBC sidecar routes, GBA save routes, legacy wild-sign tests, and the six GBA identity-corpus write cases. These fail with EPERM directly or a 500 caused by that refusal. New tests never use these source-root write patterns.
- CLI context tests: 4 failures because `process.chdir()` is unsupported in the Node API's thread pool. This is a runner limitation, not a changed production assertion.
- Existing spawned GBC CLI tests: 10 failures; spawned processes produce a `node:os:305` system error before the expected CLI result. No CLI files were changed.
- Suite hooks: GBC edit routes and GBC write gate cannot run their real-root `git status` guards under the sandbox identity (dubious ownership / exit 128). This accounts for the 52 skipped tests; these suites were included, not deliberately filtered out.

Every failed assertion from the full JSON report is named below. The suite-hook failures are named separately because Vitest records their cases as skipped.

### packages/cli/test/context.test.ts

- resolveRoot returns the explicit path verbatim, never reading pokemap.config.json even when the cwd has none
- resolveRoot falls back to pokemap.config.json's projectPath in the cwd when no explicit path is given
- resolveRoot an explicit path wins over an existing, different pokemap.config.json -- never reads the file at all
- resolveRoot refuses, naming the cwd and the --project alternative, when neither an explicit path nor a config file is given

### packages/cli/test/gbcCommands.test.ts

- CLI end-to-end (spawned, generous timeout) render NewBarkTown against the real subject exits 0 and prints the stdout line
- CLI end-to-end (spawned, generous timeout) render CeruleanCave2F against the real subject: the warning lands on stderr, never stdout
- CLI end-to-end (spawned, generous timeout) query NoSuchMap against the real subject exits 1 with the loader's unknown-map message
- CLI end-to-end (spawned, generous timeout) render-world against the real subject, with no --scale, exits 0 using the GBC default of 8
- CLI end-to-end (spawned, generous timeout) every GBA-only command refuses on the real gbc root with its own named message, never touching a GBA loader
- CLI end-to-end (spawned, generous timeout): Task 12 where DUNSPARCE against the real subject exits 0 and matches runGbcWhere's own output
- GBC write commands (Plan 7 Task 6) 11. real process: --yes paint changes the copy; --metatile abc exits 1 with 'pokemap: '
- GBC write commands (Plan 7 Task 6) 12. real process, dry-run defaults: paint/diff/event add without --yes never write; --yes event add does
- GBC write commands (Plan 7 Task 6) 13. real process, CeruleanCave2F: dry run warns on stderr; --yes refusal keeps the size warning in stderr
- GBC write commands (Plan 7 Task 6) 10. event on a GBA root refuses (GBC-only)

### packages/cli/test/writeCommands.test.ts

- writeCommands runSignAdd with --yes actually commits, then restores
- writeCommands runSignAdd refuses and writes nothing when the derived label already exists, even with --yes
- writeCommands runPaint with --yes actually paints one block and commits, then restores
- writeCommands runPaint rect tool paints the whole rectangle

### packages/server/test/dungeons.test.ts

- dungeons api lists an empty array when no dungeons exist yet
- dungeons api creates a dungeon from an explicit maps list, lists it, then deletes it
- dungeons api creates a dungeon from a seedMap, computing its members via the warp BFS
- dungeons api 400s a create with an unknown seedMap
- dungeons api PATCHes a dungeon's name and maps, reflected in the next GET
- dungeons api 400s a PATCH with an empty/whitespace-only name, without persisting it
- dungeons api PATCHes only the keys present in the body, leaving the others untouched
- dungeons api 404s a PATCH or DELETE for an unknown dungeon id
- dungeons api 400s a create with no name
- dungeons api 400s a malformed dungeon-create body instead of hanging the request
- dungeons api 400s a malformed dungeon-patch body instead of hanging the request

### packages/server/test/gbcRoutes.test.ts

- gbcRoutes accepts and un-accepts Route17 without moving maps, with exact PerfPlus sidecar restoration
- gbcRoutes POST /api/world/placement writes a GBC manual placement, surfaces it on GET, and restores PerfPlus's absent sidecar
- gbcRoutes GBC dungeon CRUD roundtrips explicit and seeded dungeons in the root sidecar, then restores exact prior bytes

### packages/server/test/saveRoutes.test.ts

- save/commit routes paint, GET /plan shows one binary change, POST /commit actually writes it, then restores
- save/commit routes commit refuses (400) when the plan contains a refusal, and writes nothing
- save/commit routes after a successful commit, the session is closed -- a later GET /plan reflects the NEW on-disk state as its own fresh baseline (zero changes again)
- save/commit routes a render fetched before a commit is not served stale after it, for both border keys

### packages/server/test/signRoutes.test.ts

- sign routes POST /sign/add on a route with grass and a real scripts.inc succeeds, GET /plan shows one object-events insert and one text append, then restores
- sign routes POST /sign/add refuses (400) with the real guardSignWrite refusal when the derived label already exists

### packages/core/test/write/corpus.test.ts

- identity corpus (invariant I5) paints one real block on one real map, commits through the full save funnel, and restores byte-identical, in C:/Programming Projects/Pokemon Game/game
- identity corpus (invariant I5) paints one real block on one real map, commits through the full save funnel, and restores byte-identical, in C:/Programming Projects/Pokemon Game/refs/pokeemerald
- identity corpus (invariant I5) paints one real block on one real map, commits through the full save funnel, and restores byte-identical, in C:/Programming Projects/Pokemon Game/refs/pokefirered
- identity corpus (invariant I5) paints one real block on one real map, commits through the full save funnel, and restores byte-identical, in C:/Programming Projects/Pokemon Game/refs/pokeemerald-expansion
- identity corpus (invariant I5) paints one real block on one real map, commits through the full save funnel, and restores byte-identical, in C:/Programming Projects/Pokemon Game/refs/modern-emerald
- identity corpus (invariant I5) paints one real block on one real map, commits through the full save funnel, and restores byte-identical, in C:/Programming Projects/Pokemon Game/refs/pokeclassic

### Suite-hook failures

- `packages/server/test/gbcEditRoutes.test.ts`: `gbc edit routes (hermetic temp copy)` beforeAll/afterAll git porcelain guards, exit 128.
- `packages/core/test/gbc/write/writeGate.test.ts`: `G5 write gate: subject (C:/Programming Projects/pokecrystal-PerfPlus)` and reference-root hooks, git refuses dubious ownership under CodexSandboxOffline.

No implementation concerns remain from the focused checks. An unrestricted, normally configured gate is still needed for the existing real-root and spawned-process tests; no permission/configuration workaround or out-of-scope test edit was attempted.
