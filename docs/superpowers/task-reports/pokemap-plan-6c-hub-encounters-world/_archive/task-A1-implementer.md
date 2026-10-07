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

## Fix round

Reviews addressed: `task-A1-spec-review.md` (SR-F1..F10) and `task-A1-quality-review.md` (QR-F1..F4). One round, per coordinator. Test-first throughout: for every behavioural fix, the test was added/run against the pre-fix code to confirm red, then the fix applied and re-run green; each mutation-verification below was run, confirmed, then reverted (`git checkout --`) before the real fix landed in its own commit.

| item | status | commit | test name | red-under-mutation evidence |
|---|---|---|---|---|
| SR-F1 | done | `df6de5f` | `SR-F1: an open-but-clean session (begin+end, no apply) does not block a swap` | RED (409→ expected 200) under M8-style mutation (`dirty()` returns `[...sessions.keys()].sort()` instead of filtering `isDirty`); green on real code (code was already correct — this closed a pure test gap) |
| SR-F2 | done | `1cf2dcf` | test 7, added `postRaw("null")`/`postRaw("[1,2,3]")` assertions | RED (500 instead of 400) before the fix; green after adding the `typeof raw !== "object" \|\| raw === null \|\| Array.isArray(raw)` guard |
| SR-F4 / QR-F1 | done | `27c73f7` | `SR-F4/QR-F1: parentOf/safeNorm pin the POSIX-root and drive-root edge cases on every platform`; `SR-F4: browse resolves a relative dir (".") to an absolute path` | RED before the fix (`parentOf` not exported / `dir` echoed back as literal `"."`); green after rewriting `safeNorm`/`parentOf` as pure string functions (no `node:path` `dirname`) plus `resolve()` in the browse route |
| SR-F5 | done | `4206a5f` | `SR-F5: a pushRecent failure after a committed swap logs to stderr but still 200s` | RED (500 instead of 200, `home` is a file so `mkdirSync` throws `EEXIST`) before the fix; green after wrapping `pushRecent` in try/catch |
| SR-F6 | done | `b2f9886` | doc-only, no test | restored the dropped `--gbc` paragraph verbatim from `git show c2dbb62:packages/server/src/serve.ts` |
| SR-F7 | done | `3ebd24c` | doc-only, no test | fixed present-tense stale `createGbcServer` mentions at lines 24/150/196; left line 8's genuinely historical reference ("split this out of a standalone `createGbcServer`") alone — renaming it there would have made the sentence describe the wrong thing |
| SR-F8a | done | `db94185` | test 4, fixture gained `_under`/`Zed`/`alpha`/`Beta` in scrambled creation order | RED under both M11 (sort dropped) and M11b (sort → default `.sort()`) — the old 5-name fixture happened to already be in sorted order on this filesystem, masking both; green on real code |
| SR-F8b | done | `5dd3f98` | `SR-F8b: a single push of a backslash-form path stores it normalised` | RED under M17 (store `entry.path` raw) — the existing dedupe test's second push already looked normalised, masking it; green on real code |
| SR-F8c | done | `3dabddc` | `SR-F8c: GBC as the disposed old handler also 503s "project closed" after a swap away from it` | RED under M19 (gbcRoutes.ts's own `disposed` check forced off — `if (false)`) — 200 instead of 503; green on real code |
| SR-F8d | done | `b3f7268` | test 7, added file→404 assertion | RED under M25 (drop `isDirectory()` check) — 422 instead of 404; green on real code |
| SR-F9 | done | `1303ab6` | `SR-F9: a forged Origin on POST /api/hub/open...`; `...forged Host on GET /api/hub/browse...`; `...an allowed Origin (matching the vite dev proxy) is not refused` | RED (both forged-Origin and forged-Host tests, `if (false)` in place of the real guard) before the fix; green after adding `isCrossOriginRequest` (Origin, when present, and Host must both name localhost/127.0.0.1/`[::1]`, any port), checked first for every path. Node's `fetch` (no Origin, `Host: 127.0.0.1:<port>`) and the Vite dev proxy (`Host: localhost:<port>`, same-site Origin) both still pass — no existing test needed changes |
| SR-F10 | done | `302ca1e` | `SR-F10: an EPERM/EACCES directory listing failure is reported as 403, not 500` | RED (500) before the fix; confirmed this machine genuinely raises `EPERM` for `C:/System Volume Information` (`readdirSync` throws directly, checked before writing the test) so the `it.skipIf` guard is inactive here; green after wrapping `listDir` in `respondWithListing`, mapping `EACCES`/`EPERM` to 403 |
| QR-F3 | done | `bfef0ee` | none (serve.ts is a process entry point; manual transcript, matching this task's existing convention) | manual: scratch port-0 copy, `serve.ts "C:/definitely/not/a/real/pokemap/root"` → stderr `pokemap hub: no such directory ...`, exit code 1, no stack trace, both before-fix-would-crash and after-fix confirmed by inspection of the wrapped `try/catch` |
| item 11 (types→core) | done | `2f71923` | none (types-only file, compile-checked; mirrors `gbc/wire.ts`'s own untested-by-design pattern) | N/A — new `packages/core/src/hub/wire.ts` (`RecentEntry`, `BrowseEntry`, `BrowseResult`, `HubState`, `OpenConflict`); `recent.ts`/`hub.ts` import from there; three JSON responses in `hub.ts` now `satisfies` the core types. Full suite + typecheck unchanged green |
| SR-F3 | **declined (deferred, per coordinator)** | `d004c2b` | — | not fixed: an async POST route's body-handling code, awaited past a swap, can still run against a just-disposed handler's `project`/`editSessions`. Fixing it touches every async route body in `index.ts`, out of scope for this round. Added a `ponytail:`-style comment at the disposed guard naming the gap and the upgrade path (re-check `disposed` after `readBody` resolves) |
| QR-F2 (dedupe startup/POST open logic) | **declined** | — | — | per coordinator instruction; ~4 lines of duplication between `opts.open`'s startup path and the POST route (different error-handling per spec's own design), not worth a `resolveHandler` abstraction for two call sites |
| QR-F4 (symlinked dirs invisible to browse) | **declined** | — | — | per coordinator instruction; not a security issue (nothing is followed/escaped), not required by spec, YAGNI until a real project root reached only via a symlink turns out to matter |

Full gate after all fixes: `npm test` **1,715 pass / 0 fail, 109 files** (1,705 baseline + 10 net new `it` blocks: SR-F1 ×1, SR-F4/QR-F1 ×2, SR-F5 ×1, SR-F8b ×1, SR-F8c ×1, SR-F9 ×3, SR-F10 ×1; SR-F2/SR-F8a/SR-F8d added assertions to existing tests rather than new `it`s); `npm run typecheck` clean; `npx vite build packages/ui` passes (72 modules, unchanged output). `git diff c2dbb62 -- packages/server/test/{api,dungeons,editSessions,eventRoutes,gbcRoutes,paintRoutes,saveRoutes,signRoutes,world}.test.ts` → still **empty**. `git status --porcelain` clean.
