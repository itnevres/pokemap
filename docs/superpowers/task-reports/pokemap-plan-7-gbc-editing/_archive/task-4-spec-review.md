# Plan 7 Task 4 -- spec-compliance review (adversarial)

Range `73f9f30..197b8c8`, packages only. Reviewer re-derived every spec row against code; mutations re-run by reviewer.

**Verdict: COMPLIANT** (0 blocking / 0 important / 4 minor). Every spec route, shape, status, cache rule, store API, generic edit and test exists and behaves as specified. The 4 findings are test-coverage gaps + 1 test nit; no behaviour defect.

## Route-by-route verification
| item | code | result |
|---|---|---|
| name: malformed 400 / unknown 404 / bad sub-route 404 | gbcEditRoutes.ts:248-255 | OK (name checked before sub-route, as spec) |
| session shape `{blocks,events,isDirty,canUndo,canRedo}` | :63-66 | OK |
| nothing-open `{blocks:[],events:null,isDirty:false,canUndo:false,canRedo:false}` | :61 | OK, literal match |
| paint/begin re-begin keeps first snapshot (`??=`, copy) | :169 | OK (== GBA index.ts:763) |
| paint/apply pencil/rect/bucket/shift, strict validation | :109-156, :40-55 | OK; all spec'd int/shape checks present; range unchecked as spec |
| paint/end push only if `changedBlockIndices>0`, clear start | :173-184 | OK |
| undo/redo nothing-open, never opens | :185-196 | OK (test 6 asserts no session opened) |
| discard closes, idempotent | :197 | OK |
| GET plan | :241 | OK (opens a clean session, same as GBA) |
| commit: refusal 400 / throw 500 `{error}` / onCommit / close / 200 | :224-240 | OK |
| event move/add/delete; core throw -> 400, session unchanged | :82-89, :198-223 | OK; op runs on current text before any assign |
| add: `mapConsts` = Set(proj.maps constName), `objectConst` | :72, :211 | OK |
| delete `warpRenumberWarnings` always present, `[]` non-warp | :219-222 | OK |
| warp scan: deleting map = PRE-delete session warps; other open sessions' warps; else disk | :99-106, :217 | OK; `ponytail:` cost+upgrade comment present; measured 168-195 ms (reviewer run: 185 ms) |
| concurrency comment (readBody gap) | :148-152 | OK |
| onCommit clears render/warp/coverage, leaves world/metatile | gbcRoutes.ts:322-329 | OK |
| render: `openBlocks` -> `blocksOverride`, no renderCache read/write | gbcRoutes.ts:419-425 | OK (returns before cache key) |
| `edit.handle` before 501 fallback | gbcRoutes.ts:680 | OK |
| `GBA_ONLY_ROUTE_RE` drops `edit\/`, keeps `world\/dungeons$\|sign\/`, comment fixed | gbcRoutes.ts:72 | OK |
| `dirtyMaps: () => edit.dirtyMaps()`; dispose -> `closeAll` | gbcRoutes.ts:699-702 | OK |
| store `open/has/close/dirty(sorted)/closeAll`, entry shape | gbcEditSessions.ts | OK |
| generics type-only | commands.ts, editSessions.ts:121 | OK; `git diff` shows 0 lines in index.ts and every GBA test; typecheck clean |
| U1: only existing-test edit = 501 `/api/edit/:name/undo` row removed | gbcRoutes.test.ts:97 | OK; `sign/`, `world/dungeons` rows kept |
| hermetic: `copyGbcSubjectToTemp`/`removeTemp` in corpus.ts, `.git` filtered, hooks inside describe, PerfPlus `git status --porcelain` asserted in afterAll | corpus.ts, test:33-52 | OK. Reviewer: PerfPlus porcelain empty after all runs; no `pokemap-gbc-XXXXXX` copy left in %TEMP% |
| hub 409 on dirty GBC | hub.ts:244-246 reads `current.dirtyMaps()` | OK by reviewer probe (below); not covered by a committed test |

Adjacent suites re-run by reviewer, one at a time: gbcEditRoutes 34/34, gbcRoutes 86, editSessions 5, paintRoutes 14, eventRoutes 7, saveRoutes 9 -- all pass. `npm run typecheck` clean.

## Findings
1. **Minor -- coverageCache clear untested (survivor R1).** gbcRoutes.ts:327. Removing `coverageCache = undefined` keeps 34/34 green. Not cosmetic: `gbcCoverage` (atlas.ts:596) calls `gbcMapHasWaterTile` -> `proj.layout(map)` (uncached, reads `.blk`), so a committed paint that adds/removes water changes `fishGroupWithoutWater`/water sources. Spec mandates the clear but its teeth table omitted it. Fix: test -- GET `/api/coverage` (populate), commit a paint that flips a map's water-ness (e.g. a map in `fishGroupWithoutWater` gets a water metatile), assert `/api/coverage` equals `gbcCoverage(openGbcProject(tmp))` and differs from the cached one.
2. **Minor -- paint/end not clearing `strokeStartBlocks` untested (survivor R13).** gbcEditRoutes.ts:181. Deleting the clear keeps 34/34 green. Regression effect: next stroke's begin keeps the stale start, so its undo step reverts both strokes (merged), and a stray 2nd end pushes a duplicate step. Fix: test begin/pencil/end, begin/pencil/end, undo -> blocks equal post-first-stroke, `canUndo` true.
3. **Minor -- no committed test for the hub 409 with a dirty GBC session.** hub.test.ts test 10 uses a dirty GBA session only. Reviewer probe (temp file `packages/server/test/zzProbeHubGbc.test.ts`, deleted after): hub opens a temp GBC copy, paint NewBarkTown -> `/api/hub/open` same path = 409 `dirtyMaps:["NewBarkTown"]`; `force:true` = 200 and old handler `dirtyMaps()` = `[]`. Passes; S5 and S10 both kill it. Fix: keep the probe as a test (gbcEditRoutes.test.ts or hub.test.ts); spec didn't require it.
4. **Minor (nit) -- test 12 guard is dead logic.** gbcEditRoutes.test.ts:476-477: `cur` is read AFTER painting id 1, so it's always 1 and the test always repaints id 2. Not silent (if block0 were originally 2 the plan would be empty and the test fails loudly). Fix: read `blocks[0]` from the `paint/begin` response and pick an id != it.

Notes (no action): `GET plan` on a map opens a clean session, after which that map's render bypasses `renderCache` (re-renders every request) until discard/commit -- same as GBA's implicit open, harmless. Commit's 500 branch is untested (needs fs fault injection); code matches spec.

## Mutation table (reviewer-run; byte-copy restore; `git diff -- <file>` clean after every one)
Target file `packages/server/test/gbcEditRoutes.test.ts` unless noted.
| ID | mutation | result (red tests) |
|---|---|---|
| S1 | render `if (false && sessionBlocks)` | KILLED (2) |
| S2 | session render also `renderCache.set` | KILLED (2, 9a) |
| S3 | onCommit no `renderCache.clear()` | KILLED (9a) |
| S4 | onCommit no `warpCache = undefined` | KILLED (9b) |
| S5 | `dirtyMaps: () => []` | KILLED (2, 9a, 10, 13); also kills hub probe |
| S6 | begin `=` not `??=` | KILLED (5b) |
| S7 | `isDirty = true` before core op | KILLED (7b, 7e, 7d) |
| S8 | commit doesn't close | KILLED (9a, 10, 13) |
| S9 | deleting map uses disk/`store.has` warps, not preDelete | KILLED (8b) |
| S10 | dispose no `closeAll` | KILLED (13); also kills hub probe |
| R1 | onCommit no `coverageCache = undefined` | **SURVIVED** |
| R2 | discard doesn't close | KILLED (14 tests) |
| R3 | undo on never-opened map opens a session | KILLED (6) |
| R4 | malformed name not 400 (falls to 404) | KILLED (4) |
| R5 | eventOp rethrows core error raw (-> 500) | KILLED (7c, 7e) |
| R6 | rect `y <` instead of `y <=` (off-by-one) | KILLED (3) |
| R7 | paint/end pushes unconditionally | KILLED (4, 5a, 7e, 7d) |
| R8 | commit refusal 200 not 400 | KILLED (10, 11, 13) |
| R9 | non-warp delete `warpRenumberWarnings` undefined | KILLED (7a) |
| R10 | scan ignores other maps' open sessions (disk only) | KILLED (8c, 9a, 10, 13) |
| R11 | commit skips `hooks.onCommit()` | KILLED (9a, 9b) |
| R12 | `edit.handle` not wired | KILLED (34/34) |
| R13 | paint/end doesn't clear `strokeStartBlocks` | **SURVIVED** |
| R14 | no-op event op pushes an undo step | KILLED (7b) |
| R15 | preDelete read from disk instead of session | KILLED (8b) |

Survivors: R1, R13 (findings 1, 2). Implementer's S1-S10 claims reproduced exactly.

## Deviation verdicts
| deviation | verdict |
|---|---|
| `NoInfer<Partial<S>>` on `snapshotCommand` | ACCEPT. Signature-only; plain `Partial<S>` mis-infers S at GBA sites; index.ts has 0 diff lines, typecheck clean, GBA suites green. Spec's own "stop if GBA call sites need change" not triggered. |
| no-op event op pushes no undo step | ACCEPT. Prevents dirty-with-empty-plan (would also trip the hub 409 for nothing); mirrors paint/end's push-on-change rule. Pinned by 7b (R14 killed). |
| rect corners clamped before expansion | ACCEPT. Outcome identical: `paintCells` (paint.ts:29) skips OOB targets and stamp offset uses absolute `t.x - originX`, so dropping OOB targets changes nothing; removes a 1e9-corner memory DoS. Off-by-one guarded (R6 killed). |
| validation before session open | ACCEPT. Stricter than GBA; a 400 never opens/dirties a session (test 4 "rejected apply", 7d dirtyMaps []). |
| 9b: world placements instead of warp `source` coords | ACCEPT. `/api/world` (`buildGbcWorldPayload`, gbcRoutes.ts:209-230) exposes no warp source; spec fact wrong. Substitute is stronger: SproutTower1F placement changes AND full placements equal a fresh build over committed files; S4 killed only by 9b. |

## Spec facts found wrong
- Test 9: "assert the moved warp's `source` coordinates in the world payload" -- the GBC `/api/world` payload has no warp `source`; only `placements` (+ metadata). Implementer's substitute is valid.
- Teeth table omits coverage-cache invalidation although Shape mandates it (-> survivor R1); and omits the paint/end clear (-> R13).
- Spec says bucket body is `replacement: { metatileId }` -> route matches; core `floodFill` takes a bare `metatileId: number` (route unwraps). Not a defect.
