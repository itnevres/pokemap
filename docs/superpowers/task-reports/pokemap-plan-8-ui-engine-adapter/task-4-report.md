Status: DONE_WITH_CONCERNS.

Implemented Task 4. The focused tests, mutation proof, typecheck and build passed. The full gate failed in existing tests; further code changes stopped as the brief requires. The coordinator must resolve the gate in its normal environment before accepting the task.

Files changed:
- packages/ui/src/hooks/useGuardedFetch.ts: exported stable module-level unguarded<T> guard with the requested trust-the-server doc comment.
- packages/ui/src/hooks/useMapGroups.ts: thin useGuardedFetch<MapGroupsData> wrapper; preserved UseMapGroupsResult and removed React imports.
- packages/ui/src/hooks/useCoverage.ts: thin useGuardedFetch<CoverageResponse> wrapper; preserved both interfaces and the long CoverageResponse comment.
- packages/ui/test/useGuardedFetch.stale.test.ts: four new loading/error/key-change/arbitrary-body cases.
- packages/ui/test/useFetchedFamilyGba.test.tsx: four new StrictMode groups/coverage, malformed-body and exact-404 cases.
- packages/ui/test/gbc/useFetchedFamilyGbc.test.tsx: two new StrictMode witnesses with guard-valid bodies.
- This report and task-4-{red,green,mutation,gate,gate-api,typecheck,build,oracle}.log.

RED evidence:
After the coordinator ruling, reran only the three NEW files against unchanged production source and overwrote task-4-red.log. Exit 1: 2 files passed / 1 failed; 9 tests passed / 1 failed. Only `unguarded accepts an arbitrary server body` failed, at useGuardedFetch.stale.test.ts:54: `expect(result.current.data).toEqual({ weird: 1 })`, received null. The missing export reaches the hook as an undefined guard in this runner; this was an assertion failure rather than a collection failure. All four StrictMode witnesses passed and asserted exactly two fetch calls. Loading, rejection, shared key-change protection, malformed GBA groups data, and coverage error behavior already passed.

GREEN evidence:
The root API equivalent of the seven-file focused command passed: 7 files / 38 tests / 0 failures, exit 0, task-4-green.log.

Mutation proof:
Temporarily replaced `if (!cancelled) setData(d);` with `setData(d);` in useGuardedFetch and ran the three NEW files. Exit 1: 3 files failed; 5 tests failed / 5 passed. The shared `keeps B when the old A response resolves after a URL change` and all four family `keeps the second StrictMode response when the first resolves late` cases failed on final data equality, showing A replacing B. Restored the original implementation in finally; the log confirms `Restored byte-identical: true`. The subsequent full gate passed all new tests on restored source. Evidence: task-4-mutation.log.

Gate results (each requested npm command ran once; suites never overlapped):
- npm.cmd test: exit 1 before collection, esbuild config-loading sandbox ancestor-directory access denial; task-4-gate.log.
- Full-root Vitest API fallback: exit 1; 162 files, 152 passed / 10 failed; 2,573 tests passed / 44 failed / 50 skipped (2,667 total); task-4-gate-api.log. All UI files passed. Existing failures are in CLI/core/server tests, detailed below. They include external fixture EPERM writes, Git ownership/setup errors, spawned CLI failures (including uv_os_get_passwd ENOMEM), and four context tests failing because process.chdir is unsupported by the chosen thread pool. The pool choice is a runner limitation introduced by this fallback, not a product regression. No full-suite rerun or test edits were made after these failures.
- npm.cmd run typecheck: exit 0; task-4-typecheck.log.
- npm.cmd run build -w @pokemap/ui: exit 0, 77 modules built; task-4-build.log.
- Oracle: both `git diff HEAD -- ':(glob)packages/*/test/**'` and `git diff 5302ac1 -- ':(glob)packages/*/test/**'`, piped through PowerShell Select-String '^-[^-]', printed nothing. task-4-oracle.log is empty (0 matching lines). git diff --check passed.

Commands for API runs:
Pipe this module into `node --input-type=module` from the repository ROOT, redirecting stdout/stderr to the stated log. RED and mutation FILTERS were the three new test paths; GREEN FILTERS were the seven paths from the brief; full gate FILTERS were [].

```js
import { startVitest } from "vitest/node";
const ctx = await startVitest("test", FILTERS, {
  config: false, run: true, pool: "threads", maxWorkers: 2, minWorkers: 1,
  globals: false, environment: "node",
  environmentMatchGlobs: [["packages/ui/**", "jsdom"]],
  include: ["packages/*/test/**/*.test.{ts,tsx}"],
  setupFiles: ["packages/ui/test/setup.ts"],
});
await ctx.close();
```

Deviations and coordinator ruling:
- The coordinator explicitly superseded the wrapper-based StrictMode setup: React 19.2 / Testing Library 16.3 requires renderHook's `{ reactStrictMode: true }` option for double effect invocation here. Applied it in all four witnesses and removed both unused wrappers/imports. This resolved the earlier stop; RED evidence was overwritten as requested.
- PowerShell blocks npm/npx .ps1 launchers, so .cmd launchers were used. The Vitest CLI could not load its config in this sandbox; used the brief's permitted Node API fallback with the root test settings. Used a two-worker thread pool, which makes the four existing process.chdir-based CLI tests incompatible; report this limitation explicitly rather than claiming an equivalent clean gate.
- No R1–R5 implementation deviations. Existing tests, GBC hooks, dungeon hooks, map-layout hooks, core/server/CLI source and dependencies remain unchanged. No state-changing git command or commit was run. Preexisting ledger.md changes and task-4-mutations.mjs were untouched.

Stop-rule pair findings retained:
- Dungeons remain separate: GBC parses/guards DELETE bodies while GBA does not, and their PATCH/DELETE error labels use encoded URL versus raw id.
- Map-layout hooks remain separate: GBA retains prior data while loading; GBC resets it, and their loading/reload/forBase semantics differ. The parked #5/#6 branch also edits useMapLayout.

Full gate failure inventory follows (verbatim failure headings from task-4-gate-api.log; repeated headings deduplicated). The full log contains assertion lines, stack traces and fixture paths.
- FAIL  packages/cli/test/gbcCommands.test.ts > GBC write commands (Plan 7 Task 6)
- FAIL  packages/server/test/gbcEditRoutes.test.ts > gbc edit routes (hermetic temp copy)
- FAIL  packages/core/test/gbc/write/writeGate.test.ts > G5 write gate: subject (C:/Programming Projects/pokecrystal-PerfPlus)
- FAIL  packages/core/test/gbc/write/writeGate.test.ts > G5 write gate: pret (C:/Programming Projects/Pokemon Game/refs/pokecrystal)
- FAIL  packages/cli/test/context.test.ts > resolveRoot > returns the explicit path verbatim, never reading pokemap.config.json even when the cwd has none
- FAIL  packages/cli/test/context.test.ts > resolveRoot > falls back to pokemap.config.json's projectPath in the cwd when no explicit path is given
- FAIL  packages/cli/test/context.test.ts > resolveRoot > an explicit path wins over an existing, different pokemap.config.json -- never reads the file at all
- FAIL  packages/cli/test/context.test.ts > resolveRoot > refuses, naming the cwd and the --project alternative, when neither an explicit path nor a config file is given
- FAIL  packages/cli/test/gbcCommands.test.ts > CLI end-to-end (spawned, generous timeout) > render NewBarkTown against the real subject exits 0 and prints the stdout line
- FAIL  packages/cli/test/gbcCommands.test.ts > CLI end-to-end (spawned, generous timeout) > render CeruleanCave2F against the real subject: the warning lands on stderr, never stdout
- FAIL  packages/cli/test/gbcCommands.test.ts > CLI end-to-end (spawned, generous timeout) > query NoSuchMap against the real subject exits 1 with the loader's unknown-map message
- FAIL  packages/cli/test/gbcCommands.test.ts > CLI end-to-end (spawned, generous timeout) > render-world against the real subject, with no --scale, exits 0 using the GBC default of 8
- FAIL  packages/cli/test/gbcCommands.test.ts > CLI end-to-end (spawned, generous timeout) > every GBA-only command refuses on the real gbc root with its own named message, never touching a GBA loader
- FAIL  packages/cli/test/gbcCommands.test.ts > CLI end-to-end (spawned, generous timeout): Task 12 > where DUNSPARCE against the real subject exits 0 and matches runGbcWhere's own output
- FAIL  packages/cli/test/gbcCommands.test.ts > GBC write commands (Plan 7 Task 6) > 11. real process: --yes paint changes the copy; --metatile abc exits 1 with 'pokemap: '
- FAIL  packages/cli/test/gbcCommands.test.ts > GBC write commands (Plan 7 Task 6) > 12. real process, dry-run defaults: paint/diff/event add without --yes never write; --yes event add does
- FAIL  packages/cli/test/gbcCommands.test.ts > GBC write commands (Plan 7 Task 6) > 13. real process, CeruleanCave2F: dry run warns on stderr; --yes refusal keeps the size warning in stderr
- FAIL  packages/cli/test/gbcCommands.test.ts > GBC write commands (Plan 7 Task 6) > 10. event on a GBA root refuses (GBC-only)
- FAIL  packages/cli/test/writeCommands.test.ts > writeCommands > runSignAdd with --yes actually commits, then restores
- FAIL  packages/cli/test/writeCommands.test.ts > writeCommands > runSignAdd refuses and writes nothing when the derived label already exists, even with --yes
- FAIL  packages/cli/test/writeCommands.test.ts > writeCommands > runPaint with --yes actually paints one block and commits, then restores
- FAIL  packages/cli/test/writeCommands.test.ts > writeCommands > runPaint rect tool paints the whole rectangle
- FAIL  packages/server/test/dungeons.test.ts > dungeons api > lists an empty array when no dungeons exist yet
- FAIL  packages/server/test/dungeons.test.ts > dungeons api > creates a dungeon from an explicit maps list, lists it, then deletes it
- FAIL  packages/server/test/dungeons.test.ts > dungeons api > creates a dungeon from a seedMap, computing its members via the warp BFS
- FAIL  packages/server/test/dungeons.test.ts > dungeons api > 400s a create with an unknown seedMap
- FAIL  packages/server/test/dungeons.test.ts > dungeons api > PATCHes a dungeon's name and maps, reflected in the next GET
- FAIL  packages/server/test/dungeons.test.ts > dungeons api > 400s a PATCH with an empty/whitespace-only name, without persisting it
- FAIL  packages/server/test/dungeons.test.ts > dungeons api > PATCHes only the keys present in the body, leaving the others untouched
- FAIL  packages/server/test/dungeons.test.ts > dungeons api > 404s a PATCH or DELETE for an unknown dungeon id
- FAIL  packages/server/test/dungeons.test.ts > dungeons api > 400s a create with no name
- FAIL  packages/server/test/dungeons.test.ts > dungeons api > 400s a malformed dungeon-create body instead of hanging the request
- FAIL  packages/server/test/dungeons.test.ts > dungeons api > 400s a malformed dungeon-patch body instead of hanging the request
- FAIL  packages/server/test/gbcRoutes.test.ts > gbcRoutes > accepts and un-accepts Route17 without moving maps, with exact PerfPlus sidecar restoration
- FAIL  packages/server/test/gbcRoutes.test.ts > gbcRoutes > POST /api/world/placement > writes a GBC manual placement, surfaces it on GET, and restores PerfPlus's absent sidecar
- FAIL  packages/server/test/gbcRoutes.test.ts > gbcRoutes > GBC dungeon CRUD > roundtrips explicit and seeded dungeons in the root sidecar, then restores exact prior bytes
- FAIL  packages/server/test/saveRoutes.test.ts > save/commit routes > paint, GET /plan shows one binary change, POST /commit actually writes it, then restores
- FAIL  packages/server/test/saveRoutes.test.ts > save/commit routes > commit refuses (400) when the plan contains a refusal, and writes nothing
- FAIL  packages/server/test/saveRoutes.test.ts > save/commit routes > after a successful commit, the session is closed -- a later GET /plan reflects the NEW on-disk state as its own fresh baseline (zero changes again)
- FAIL  packages/server/test/saveRoutes.test.ts > save/commit routes > a render fetched before a commit is not served stale after it, for both border keys
- FAIL  packages/server/test/signRoutes.test.ts > sign routes > POST /sign/add on a route with grass and a real scripts.inc succeeds, GET /plan shows one object-events insert and one text append, then restores
- FAIL  packages/server/test/signRoutes.test.ts > sign routes > POST /sign/add refuses (400) with the real guardSignWrite refusal when the derived label already exists
- FAIL  packages/core/test/write/corpus.test.ts > identity corpus (invariant I5) > paints one real block on one real map, commits through the full save funnel, and restores byte-identical, in C:/Programming Projects/Pokemon Game/game
- FAIL  packages/core/test/write/corpus.test.ts > identity corpus (invariant I5) > paints one real block on one real map, commits through the full save funnel, and restores byte-identical, in C:/Programming Projects/Pokemon Game/refs/pokeemerald
- FAIL  packages/core/test/write/corpus.test.ts > identity corpus (invariant I5) > paints one real block on one real map, commits through the full save funnel, and restores byte-identical, in C:/Programming Projects/Pokemon Game/refs/pokefirered
- FAIL  packages/core/test/write/corpus.test.ts > identity corpus (invariant I5) > paints one real block on one real map, commits through the full save funnel, and restores byte-identical, in C:/Programming Projects/Pokemon Game/refs/pokeemerald-expansion
- FAIL  packages/core/test/write/corpus.test.ts > identity corpus (invariant I5) > paints one real block on one real map, commits through the full save funnel, and restores byte-identical, in C:/Programming Projects/Pokemon Game/refs/modern-emerald
- FAIL  packages/core/test/write/corpus.test.ts > identity corpus (invariant I5) > paints one real block on one real map, commits through the full save funnel, and restores byte-identical, in C:/Programming Projects/Pokemon Game/refs/pokeclassic
