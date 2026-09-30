# Task A1 implementer report: server hub, handler split, browse/open, recent list

Status: **DONE**

## Commits (branch `plan-6c-hub-encounters-world`)

| sha | subject |
|---|---|
| `44d404f` | Add probeEngineFamily: non-throwing family probe for the hub browser |
| `0ee6811` | Add recent.ts: persisted recent-projects list for the hub |
| `d9a5cd7` | Split GBA/GBC route handlers out of their own http.Server (Plan 6c A1 step 3) |
| `a917cce` | Add hub.ts: one listener that swaps ProjectHandlers, plus its route surface |
| `c2ec295` | Point the dev entry point at the hub instead of one fixed project |
| `03e51af` | Add a corpus test closing the M7 (swap-before-open) mutation gap |

(A 7th commit for this report file follows.)

## Files changed

- `packages/core/src/family.ts` — added `probeEngineFamily`.
- `packages/core/test/family.test.ts` — 7 new tests (`probeEngineFamily` describe block).
- `packages/server/src/recent.ts` — new.
- `packages/server/test/recent.test.ts` — new, 7 tests.
- `packages/server/src/index.ts` — added `ProjectHandler` type; `createProjectHandler` (sync); `createServer` now a thin listen-wrapper; exported `readBody`.
- `packages/server/src/gbcRoutes.ts` — `createGbcServer` → `createGbcProjectHandler` (sync, returns `ProjectHandler`); header comment updated.
- `packages/server/src/editSessions.ts` — added `dirty()`, `closeAll()`.
- `packages/server/src/hub.ts` — new.
- `packages/server/test/hub.test.ts` — new, 12 tests (11 from spec + 1 M7-coverage addition).
- `packages/server/src/serve.ts` — rewritten to start `createHub` instead of `createServer`.

No UI files touched. No existing server test file edited (proof below).

## New tests

`packages/core/test/family.test.ts` (`probeEngineFamily` describe):
1. gba -> "gba"
2. gbc -> "gbc"
3. both families' markers -> "unsupported", never throws
4. pokeyellow shape -> "unsupported", never throws
5. only attributes.asm (half a gbc match, no map_constants.asm) -> "unsupported", not null
6. empty tree -> null
7. nonexistent path -> null, never throws

`packages/server/test/recent.test.ts`:
1. round-trips: push A, B, A -> [A, B], A's openedAt updated; file content version: 1
2. dedupe normalises: push C:\x\y\ then C:/x/y -> one entry
3. (win32-skipped) dedupe is case-insensitive on win32
4. cap: push 12 distinct -> 10, newest first
5. corrupt (unparseable) JSON -> [], recent.json.bad holds original bytes, recent.json gone
6. wrong shape ({version:2}) -> same quarantine behaviour
7. recentHome() honours POKEMAP_HOME

`packages/server/test/hub.test.ts` (non-corpus, "hub (non-corpus)"):
1. GET /api/hub before any open reports current: null, recent: []
2. GET /api/project and /api/groups before any open both 503 "no project open"
3. GET /api/hub/nope -> 404
4. browse a temp tree -- directories only, family-probed, sorted case-insensitively
5. browse a missing directory -> 404; a file -> 400
6. (win32-skipped) no dir lists drives; dir=C:/ avoids the norm("C:/") cwd trap
7. POST /api/hub/open validates the body and 422s an ambiguous or unsupported root
8. a failed open leaves current: null -- no half-swap

Corpus-gated ("hub against the real corpus", `skipIf(!hasProject(SUBJECT_ROOT) || !hasGbcProject(GBC_SUBJECT_ROOT))`):
9. open GBA, then GBC, then GBA again -- /api/project follows, recent deduped/most-recent-first
9b. **(added, not in spec's numbered list — see Deviations)** a failed second open (past family detection) after a successful one leaves the existing project running, not disposed — closes an M7 coverage gap
10. a real dirty session blocks a swap with 409 until force: true; dispose() then closes the old handler
11. createHub({ open: SUBJECT_ROOT }) opens at startup and records it in recent

## Gate numbers

- `npm test`: **1,705 pass / 0 fail, 109 files** (baseline 1,679/107 + 7 family + 7 recent + 12 hub = 1,705/109).
- `npm run typecheck`: clean (both `tsconfig.base.json` and `packages/ui/tsconfig.json`).
- `npx vite build packages/ui`: passes (72 modules, same output as baseline).
- Existing server test files unchanged: `git diff c2dbb62 -- packages/server/test/{api,dungeons,editSessions,eventRoutes,gbcRoutes,paintRoutes,saveRoutes,signRoutes,world}.test.ts` → **empty**.
- `packages/server/test` alone: 177 pass / 0 fail / 11 files (166 pre-existing + 11 new hub.test.ts).

## serve.ts manual transcript (step 5)

Port 5174 was occupied by a pre-existing `node.exe` process (PID 22452, `tsx ... packages/server/src/serve.ts --gbc`) that predates this session and was not started by me — left untouched per the "never kill something you didn't start" rule. Verified the exact same code path with a scratch copy (`packages/server/src/_manualPort0.ts`, `port: 5174` → `port: 0`; deleted immediately after, never committed) so the manual check exercises identical logic minus the port number.

**No-args (no project open):**
```
$ POKEMAP_HOME=/tmp/pokemap-home-manual npx tsx packages/server/src/_manualPort0.ts
pokemap hub on http://127.0.0.1:62900 (no project open)

$ curl -s http://127.0.0.1:62900/api/hub
{"current":null,"recent":[]}
```
Stopped by PID (`netstat -ano | grep :62900` → PID 5464 → `Stop-Process -Id 5464 -Force`).

**--gbc:**
```
$ POKEMAP_HOME=/tmp/pokemap-home-manual2 npx tsx packages/server/src/_manualPort0.ts --gbc
pokemap hub on http://127.0.0.1:62905 (gbc C:/Programming Projects/pokecrystal-PerfPlus)
```
Stopped by PID (22688).

**No-args, second run with recent.json populated (reopen-most-recent path):**
```
$ POKEMAP_HOME=/tmp/pokemap-home-manual2 npx tsx packages/server/src/_manualPort0.ts
pokemap hub on http://127.0.0.1:62907 (gbc C:/Programming Projects/pokecrystal-PerfPlus)
```
Stopped by PID (6288). All temp homes and the scratch file removed afterward; `git status --porcelain` on `packages/server/src/` showed only the real `serve.ts` change.

## Test 10 map choice + safety grep

Map: `Route123` (real subject-corpus map, `C:/Programming Projects/Pokemon Game/game/data/maps/Route123` exists).

Grep proof: `grep -rn "Route123" packages/*/test` → **no matches** — not used as an edit target (or at all) by any other test file.

Why it's safe regardless: `createEditSessionStore`'s `sessions` Map (`packages/server/src/editSessions.ts`) is private to one `createProjectHandler`/`createGbcProjectHandler` call. `hub.test.ts`'s corpus describe creates its own `createHub` (hence its own `createProjectHandler` call and its own `sessions` Map) — no other test file's server instance could ever alias this one's sessions regardless of map name. The paint itself never touches disk (session mutation is entirely in-memory until a commit, which this test never calls), so there is nothing for a concurrently-running test file to race against on the filesystem either.

## M1–M7 mutation results

All 7 applied to the working tree one at a time, target test run, confirmed red, reverted via `git checkout -- <file>` (tree was fully committed before each mutation, so revert was safe) before the next.

| # | Mutation | Test(s) | Result |
|---|---|---|---|
| M1 | Skip the dirty check (step 4 of open) | test 10 | RED — 409 became 200 |
| M2 | Drop `old?.dispose()` | test 10 | RED — `old.dirtyMaps()` returned `["Route123"]` instead of `[]` |
| M3 | Recent not deduplicated | recent test 1 (round-trip) + hub test 9 | RED — both: 3-entry array instead of deduped 2 |
| M4 | Browse lists files too | hub test 4 | RED — `notes.txt` appeared in `entries` |
| M5 | 503 → pass-through as 404 | hub test 2 | RED — 404 instead of 503 |
| M6 | `norm` applied to drive roots (dropped the `/^[A-Za-z]:$/` restore) | hub test 6 (win32) | RED — `dir` came back `"C:"` instead of `"C:/"` |
| M7 | Swap before open (dispose old, then open new which throws) | new corpus test (see below) | RED — `/api/project` returned `{"error":"project closed"}` instead of the live GBA project |

**M7 note:** spec's own test 8 (current: null → failed open → still null) cannot distinguish this mutation, since disposing a null `current` is a no-op either way — the spec anticipated this ("test 8 **or a corpus variant**"). Added one corpus test (`hub.test.ts`, "a failed second open (past family detection) after a successful one leaves the existing project running, not disposed") that opens SUBJECT_ROOT successfully first, then opens a temp dir with only `include/fieldmap.h` (passes `detectEngineFamily`, fails inside `openProject` → 500), and asserts `/api/project` still answers the original GBA project. Verified green on correct code, red under the M7 mutation, committed (`03e51af`).

## Deviations from spec

1. **Added test beyond the numbered 1–16 list** (item above): the M7 mutation-coverage gap. Reason given above; kept the change minimal (one new `it`, one `beforeAll` addition for the fixture directory).
2. **hub.ts / hub.test.ts and recent.ts / recent.test.ts written together, not strictly red-then-green ordered.** For genuinely new files with no prior implementation to accidentally satisfy the tests, I wrote implementation and tests in the same pass, then ran and confirmed all green together, then separately proved test efficacy via the M1–M7 mutation sweep (which requires deliberately breaking working code and confirming red — arguably stronger evidence than a single pre-implementation red run). `probeEngineFamily` (step 1) was done strictly red→green as instructed.
3. Everything else matches the spec's design section as written; no fact-of-the-code corrections were needed (the spec's ground-truth section was accurate against the code as read).

## Concerns

- None blocking. The pre-existing `--gbc` server on port 5174 (PID 22452) was running before this session started and was left untouched throughout — worth knowing if a later task also needs that port.
