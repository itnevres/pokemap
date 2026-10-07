# Plan 7 Task 4 -- implementer report

**Status: DONE_WITH_CONCERNS** (concerns below; nothing blocking). Branch plan-7-gbc-editing.

## Commits
| sha | what |
|---|---|
| 29edd9e | refactor(core): generic EditCommand/EditCommandStack + snapshotCommand (type-only) |
| 7c44795 | feat(server): store + paint/undo/redo/discard/plan routes, gbcRoutes wiring, corpus helper, tests 1-6, 501-row removal |
| 10ffd22 | feat(server): event move/add/delete + warp renumber warnings, tests 7-8 |
| 6cfba94 | feat(server): commit route, tests 9-13 |
| 196d432 | test(server): 7e (refusal on clean session) -- strengthens S7 |
| (this report) | docs |

## Files
New: `packages/server/src/gbcEditSessions.ts` (store, `GbcSnapshot`, `gbcSnapshotOf`), `packages/server/src/gbcEditRoutes.ts`, `packages/server/test/gbcEditRoutes.test.ts` (34 tests).
Edited: `packages/core/src/edit/commands.ts`, `packages/server/src/editSessions.ts` (type-only), `packages/server/src/gbcRoutes.ts` (wiring, regex+comments), `packages/core/test/gbc/helpers/corpus.ts` (+`copyGbcSubjectToTemp`, `removeTemp`), `packages/server/test/gbcRoutes.test.ts` (1 row removed).

## Name / spec differences
| spec | actual / decision |
|---|---|
| `snapshotCommand<S extends object = EditSession>(label, prev: Partial<S>, next: Partial<S>)` | needed `NoInfer<Partial<S>>` on prev/next: plain `Partial<S>` made TS infer S=Snapshot at GBA call sites (index.ts:213,854 TS2345). With NoInfer, GBA call sites are unchanged (return-type context / default). Still signature-only; no GBA call-site edit. |
| core names | all as spec: `moveGbcEvent/addGbcEvent/deleteGbcEvent/findGbcWarpsRetargetedByDelete(maps,{mapName,mapConst,index})` in `gbc/edit/events.ts`; `changedBlockIndices/planGbcSave/commitGbcSave/openGbcEditSession` from `gbc/write/save.ts`; `paintCells/floodFill/shiftGrid` from `gbc/edit/paint.ts` (shiftGrid re-exported from GBA paint). Bucket takes `metatileId: number` (not a replacement object). No renames found. |
| spec test 9 "world payload `source` coords" | `/api/world` exposes only placements, not warp `source`. Observable via placements: SproutTower1F is placed beside VioletCity warp 6's arrival point; test moves that warp, commits, asserts SproutTower1F placement changed AND whole placements equal a fresh `buildGbcWorldPayload` over the committed files. |
| event op "assign + push" | no-op op (move to same x,y => text unchanged) pushes NO undo step (else dirty session with empty plan). Not in spec; test 7b. |
| rect | corners clamped to the grid before expansion (paintCells already skips OOB; avoids 1e9-corner memory DoS). Outcome identical. |
| store API | exactly `open/has/close/dirty/closeAll`; `openBlocks` uses `has`+`open`. |
| validation order | bodies validated BEFORE opening a session, so a 400 never opens one (GBA opens first). |
| `GET plan` | opens a session implicitly (as GBA); not dirty so no hub 409. |

## Tests (gbcEditRoutes.test.ts, 34 pass)
| spec | test(s) |
|---|---|
| 1 | 1 plan empty |
| 2 | 2 paint begin/apply/end, shape, plan 1 binary, dirtyMaps, render differs during, discard -> nothing-open + render equals pre bytes |
| 3 | 3 rect/bucket/shift vs Task 2 fns |
| 4 | 4: 11 table rows (unknown tool, cells mismatch, zero width, id 1.5, target 0.5, targets non-array, origin, rect corner, bucket repl, bucket x, shift dx), malformed JSON, 404/400/404 name+subroute, rejected apply leaves session unchanged |
| 5 | 5a no-change end => no undo; 5b double begin keeps first snapshot |
| 6 | 6 undo/redo round trip; never-opened => nothing-open shape and does not open a session |
| 7 | 7a move/add(object+const)/delete(coord), plan 1 text, undo x3 => events equal original, plan []; 7b no-op move; 7c refusals (x 999, referenced object 0, bad map const, bad index) 400, snapshot (session+plan) identical; 7d body validation (9 cases + bad JSON); 7e refusal on clean session stays clean |
| 8 | 8a exact list pinned + independent scan; warp 1 delete = ids>=2 subset; 8b unsaved self-targeting warp on deleting map (pre-delete index 4) included; 8c another map's open-session warp used over disk |
| 9 | 9a commit: 200, 1 `.blk` byte differs (index0=24), `.asm` == `moveGbcEvent(orig)`, dirtyMaps [], fresh plan [], render == `encodePng(renderGbcMap(fresh proj))` and != cached pre-commit; 9b world cache invalidation (above) |
| 10 | ElmsLab id 200 => 400 `metatile-out-of-range`, files byte-identical, session still dirty |
| 11 | CeruleanCave2F `layout-not-writable`, commit 400, blk still 400 bytes unchanged |
| 12 | shared House1 user: summary ends ` (shared by 50 maps)` |
| 13 | dispose empties dirtyMaps; later requests 503 |

Other suites run one at a time: gbcRoutes 86 pass, hub 21, api 30, saveRoutes 9, paintRoutes 14, eventRoutes 7, editSessions 5, signRoutes 4, dungeons 11, core edit/commands 10 -- all pass. **world.test.ts: 2 fail** ("expected 186 to be 1209": GBA subject on this machine has 186 maps) -- pre-existing data mismatch, unrelated (GBA src untouched except type-only generics); not changed.
Typecheck clean at every commit.

## Measured
| item | value |
|---|---|
| `copyGbcSubjectToTemp` (18 MB, .git filtered) | 2571 / 2532 / 2508 ms (< 10 s hook default, < 15 s limit; no timeouts raised). `removeTemp` 441 ms |
| warp-scan delete request (391 map reads, whole request) | 168 ms, 195 ms in two runs |
| NewBarkTown warp 0 renumber list (8) | ElmsLab[0] id1, ElmsLab[1] id1, PlayersHouse1F[0] id2, [1] id2, PlayersNeighborsHouse[0] id3, [1] id3, ElmsHouse[0] id4, [1] id4 (fromMap, warpIndex, destWarp; proj.maps order). Warp 1 delete: the 6 with id>=2. |
NewBarkTown facts: 10x9, TILESET_JOHTO 128 metatiles, block0=5, warps (6,3)(13,5)(3,11)(11,13), 3 objects/consts, 2 coords, 4 bgs.

## Edits to existing test files (U1)
| file | edit | reason |
|---|---|---|
| `packages/server/test/gbcRoutes.test.ts` | removed the `/api/edit/:name/undo (POST)` row from the 501 table | path now served (200 nothing-open); spec-directed. `sign/` and `world/dungeons` rows kept. |
No GBA test changed.

## Mutations (each: edit, run gbcEditRoutes.test.ts, restore from byte copy, `git diff -- file` empty)
| ID | mutation | observed red |
|---|---|---|
| S1 | `if (false && sessionBlocks)` in render route | 2 (only) |
| S2 | session render also `renderCache.set` | 2, 9a |
| S3 | onCommit without `renderCache.clear()` | 9a (only) |
| S4 | onCommit without `warpCache = undefined` | 9b (only) |
| S5 | `dirtyMaps: () => []` | 2, 9a, 10, 13 |
| S6 | `strokeStartBlocks =` (no `??=`) | 5b (only) |
| S7 | `session.isDirty = true` before core op | first run: 7b only (7c's pre-state was already dirty -- weak). Added 7e; rerun: 7b, 7e, 7d |
| S8 | commit does not close session | 9a, 10, 13 (10 and 13 red too: leftover open/dirty sessions) |
| S9 | scan uses disk warps for deleting map (store.has only) | 8b (only) |
| S10 | dispose without `closeAll` | 13 (only) |
All as the spec required (S5 additionally red in 9a/10/13; S7 caught only after strengthening).

## Concerns
1. world.test.ts GBA failures pre-existing (186 vs 1209 maps) -- environmental.
2. Concurrency: accepted readBody gap as GBA; in-flight request after `dispose` can reopen a session in the disposed handler (garbage, not served).
3. Warp scan uncached (~170-200 ms per warp delete); `ponytail:` comment names upgrade (cache invalidated on commit/event ops).
4. Commit with a stroke still open (`strokeStartBlocks` set) commits current blocks; same as GBA.
5. Two sessions on maps sharing a layout (House1.blk) are independent; the second commit is refused by `file-changed-on-disk` (guard), not tested here.
6. `.codex/` and `task-5-spec.md` untracked, not mine, untouched. PerfPlus `git status --porcelain` empty (asserted in afterAll); no leftover temp dirs.
