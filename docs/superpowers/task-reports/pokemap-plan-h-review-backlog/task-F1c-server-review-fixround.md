# F1c server half: fix-round re-review (spec + adversarial, read-only)

Scope: `git diff 4fa9e99 e6d0b5f` (index.ts gate try/catch, addEventRoutes.ts optionsHandler mapping, brokenPaths.test.ts) plus the doc edits (plan-h-hardening.md F1d/F1e, task-F1c-server.md). No tests run (orchestrator holds the lock). Mutation predictions below are derived by reading the code; the orchestrator's MUTANT_1..5 results are the evidence.

**Verdict: CHANGES NEEDED** (one Important: the M4 test cannot fail in a full-file run.)

## Mutant reachability (derived by hand)

| Mutant | Predicted | Why |
|---|---|---|
| 1. `blockEdits.handle` moved above the gate | killed | Only `/block` is affected (blockEditRoutes matches `block`, `block/preview`, `block/check|apply`, not `plan`/`commit`). Its `fail()` (blockEditRoutes.ts:145-151) never emits `code:"broken-path"`: LAYOUT_MAP reads the sentinel through the unguarded `readFileSync` at blockEditRoutes.ts:257 and answers 200/409-planner/400; TILESET_MAP throws from `project.tileset` and answers 500 `INTERNAL_ERROR`. `expectRefusal` checks status and code, so line 155 goes red. |
| 2. `block` added to the exemption | killed | Same path as 1 for `/block`. |
| 3. gate narrowed to `event/create` | killed (three ways) | `/block` as above; `/plan` (index.ts:983-984) catches the `PathEscapeError` from `editSessions.open` and answers 200 with `signFailure`; `/commit` with body `{}` answers 400 `PLAN_FINGERPRINT_MISSING` (index.ts:1000) before any read. All three assertions are discriminating. |
| 4. gate try/catch removed | **survives in a full-file run** | See Important 1. |
| 5. optionsHandler 409 mapping removed | killed | `mapOptions` (addEventRoutes.ts:259) calls `store.open(name)` for a tile query; the session store throws `PathEscapeError` for both broken maps (the file's own "session store itself refuses" test proves it), so without the mapping the answer is 400 `eventFailure`. CONTROL_MAP 200 assertion guards against an over-broad mapping. |

## Findings

### Important 1: the unparseable-map.json test is vacuous after earlier tests; MUTANT_4 will survive
`brokenPaths.test.ts:169-178`. The gate reads `project.map(gateName)`, and `project.map` is cached (core/src/project.ts:150-162, `mapCache`; only `forgetMap` drops an entry, and only a successful commit calls it). By the time this test runs, CONTROL_MAP is already cached in the handler's project: the preceding test (line 166, `GET /api/event-options/Route101?x=0&y=0`) runs `mapOptions`, which calls `project.layoutForMap(name)` (addEventRoutes.ts:257) and `store.open(name)` (editSessions.ts:44 `project.map(mapName)`). Vitest runs the file's tests in order, so writing `{ not json` to disk changes nothing the gate sees: no throw, the try/catch is never entered, and `/plan` answers 200 from the session left open by that same event-options call. Removing the try/catch leaves the test green. It goes red only when run in isolation (`-t`), where the uncached parse throws `SyntaxError` and the outer catch (index.ts:1404-1408) answers 500.
Failure scenario: someone later deletes the try/catch. The suite stays green, and the first real map.json typo turns every gated edit route for that map into a 500. The report's M4 claim ("the gate's project.map lookup is now in a try/catch", covered by a test) is not backed.
Fix: break a map that no earlier test has touched. In `beforeAll`, pick another healthy map that is not in {LAYOUT_MAP, TILESET_MAP, CONTROL_MAP, primaryMap} and that no other test requests, or move this test before every test that loads CONTROL_MAP and add a comment saying the order matters. Tighten the assertion to the route's own answer rather than "not 409 and not 500" (which a 404 or 400 also passes): with the try/catch, `/plan` reaches `signPlan` → `editEntryFor` → `project.map` throws → index.ts:984 answers `200 {changes:[], refusals:[{code:"sign", message: <JSON parse error>}], fingerprint:null}`. Assert `status === 200`, `fingerprint === null`, and a refusal present. Then rerun MUTANT_4.

### Minor 1: sentinels land outside the temp area; POSIX portability
`brokenPaths.test.ts:73-79`. `root` is `mkdtemp(tmpdir()/pokemap-gba-tileset-*)` (gbaTilesetProject.ts:31), so `resolve(root, "../../outside.bin")` is `C:\Users\Serve\AppData\outside.bin` plus `C:\Users\Serve\AppData\outside\*.bin`, in the user's AppData root rather than in Temp. That is safe as written (the existence check skips any file that is already there, and afterAll removes only the `planted` list). On Linux/macOS with `TMPDIR=/tmp`, though, it resolves to `/outside.bin` and `mkdirSync("/outside")` fails with EACCES, so `beforeAll` throws and the whole suite fails. A cleaner fix: copy the project two levels inside its own mkdtemp dir, so `../../` stays inside the temp tree and `removeGbaTemp` cleans it up.

### Minor 2: afterAll may remove an empty "outside" directory it did not create
`brokenPaths.test.ts:92`. If `AppData\outside\` already existed but was empty, files get planted in it, and afterAll's `rmdirSync` then removes the pre-existing directory. `mkdirSync(..., {recursive:true})` returns the first directory it created (or undefined). Record that value and rmdir only directories the test created.

### Minor 3: cleanup order
`brokenPaths.test.ts:90-92`. If `removeGbaTemp` throws (Windows EBUSY after its 10 retries), the planted files are never removed. Clean up `planted` first, or wrap the temp removal in try/finally. Leftover sentinels do no harm on the next run, which sees that they exist and skips planting.

### Minor 4: the gate's catch is a catch-all
index.ts:375-378. It swallows any error, not just a map.json parse failure. That is acceptable: every swallowed error comes from `project.map`/`layoutById`, the route repeats the same call and throws the same error, and nothing reads a layout path before that. The comment states the intent. No change needed; noted for F1d if `brokenPathOfLayout` ever grows I/O.

## Checked and fine
- The optionsHandler change is correct. `brokenPathBody` recognises only `PathEscapeError`, so other errors keep their 400. The GBC family is unaffected because no GBC path throws `PathEscapeError` today.
- The block/plan/commit test does reach the gate for both broken maps, and its byte-identical snapshot covers layouts.json, metatiles.h and four map.json files. `dirtyMaps()` stays empty. The sentinels make a regression on LAYOUT_MAP visible as a wrong non-409 instead of an ENOENT.
- The sentinel paths match the server's resolution: blockdata uses `${root}/${rel}` (blockEditRoutes.ts:257) and tilesets use `${paths.root}/${rel}` (project.ts:148), the same as `resolve(root, rel)`.
- The M5 comment (line 117) is now accurate.
- Docs: the F1d row is reworded correctly. The gate covers `/api/edit/<map>/block*` for the requested map. `/api/block-sheet/<map>.png` is outside `/api/edit`, so it is not gated, and a broken tileset there answers 500. The healthy-map URL path through `blockEdit/{usage,gbaOps,save}.ts` is a real outside read. The F1e row (UI discards the 409 body) is well scoped as Medium. The report's test count (13) matches the file. The "dead code" paragraph matches the code: event/create's inner try answers 400 before its `.catch` mapping would run.
- Side note, not introduced by this diff: `GET /api/event-options/<map>?x&y` opens an edit session (`store.open`) as a side effect. That is why CONTROL_MAP has a session open by the time Important 1's test runs.

## Left for the orchestrator
Fill in MUTANT_1..5. I predict 1, 2, 3 and 5 killed and 4 surviving until Important 1 is fixed.
