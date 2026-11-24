# Plan H task I2a report: `createSessionStore` in place of both stores

Branch `claude/plan-h-server-9-i` (from master `f96e7df`). Tier High (save and discard ownership: the store decides what `dirty()`/`has`/`close` answer for the hub's unsaved-edits guard and for commit/discard).

## What changed
- New `packages/server/src/sessionStore.ts`: `createSessionStore<E>(root, openEntry)` returning `{ open, close, has, dirty, closeAll, entries, root }` (`SessionStore<E>`). `open` caches; an `openEntry` that throws stores nothing.
- `editSessions.ts`: the GBA store body is now `openGbaEntry(project, mapName)` (moved verbatim, rationale comments kept) plus `createEditSessionStore(project) = createSessionStore(project.paths.root, ...)`. `project.map` is still called on every open (trap 24).
- `gbcEditSessions.ts`: same for GBC (`openGbcEntry`, `createGbcEditSessionStore`).
- Kept both factory names, so no consumer changes: `index.ts`, `gbcEditRoutes.ts`, `blockEditOwnership.ts`, `blockEditRoutes.ts` and `addEventRoutes.ts` still type the store as `ReturnType<typeof createXStore>`, which is now `SessionStore<Entry>`. This also keeps the diff off `index.ts` (F4 edits it) and away from F4's `editSessions.ts` changes except the one function.
- No existing test edited. New tests: `sessionStore.test.ts` (unit, family-neutral), `gbcEditSessions.test.ts`, `editSessionsReopenMap.test.ts` (trap 24 + root + sign baselines).

## Mutation checks first round (11, all killed; control passes)
M1 `has` always false (9 failures across both families), M2 open never caches, M3 dirty unfiltered, M4 dirty unsorted, M5 closeAll no-op, M6 close no-op, M7 store root wrong, M8 GBA caches the map (trap 24), M9 GBA root wrong, M10 GBC sign baselines dropped, M11 GBA sign baselines dropped. M9, M10 and M11 first survived (no test on root or on `signBaselines` at open); the two new test files were added and the three re-run.

## Opus reviews (separate spec and quality; Codex out until Nov 25)
- Spec (`task-I2a-review-spec-opus.md`): PASS, 0 Critical / 0 Important / 4 Minor. m1 rationale comments restored in `sessionStore.ts` (I6, Plan 6c A1, `/api/hub/open`, closeAll); the two `index.ts` comments that point at the old `close()` (lines ~932, ~949) are re-pointed when I2b moves those routes (index.ts is held for F4). m2 untouched files justified (factory names kept, `ReturnType` types are structurally the same). m3 the extra commit `34828ee` is H-b's method fall-through test (6 `it.each` rows in `sidecarRoutes.test.ts`, mutants killed: drop placement POST clause, drop PATCH/DELETE clause), not I2a. m4 this section.
- Quality (`task-I2a-review-quality-opus.md`): PASS, 0 Critical / 0 Important / 4 Minor. m1 fixed (new `close and has touch only the named map` test; mutants M12 `close` clears all and M13 `has` is `size > 0` killed). m2 fixed (new test files open the project inside each test, not in the describe body). m3 fixed (I6 tag restored). m4 fixed (`readonly root`).

## Mutation checks (13 killed, control passes)
M1-M11 as above plus M12 `close: () => sessions.clear()`, M13 `has: () => sessions.size > 0`. M1 per family: 9 failures over `sessionStore`, `editSessions` and `gbcEditRoutes` tests (run list: sessionStore, editSessions, editSessionsReopenMap, gbcEditSessions, gbcEditRoutes).

## Gate
Full vitest 5,550 pass / 2 fail / 292 files, typecheck pass, UI build pass. Fails: known `engine.test` env fail, and `gbcAddEventRoutes` "saving the header owner lets another map allocate a new flag" (8 s timeout under load; the file plus the new session tests pass alone, 5 files / 60 tests). The gate ran while review fixes (comments, `readonly root`, tests) landed; the typecheck ran after them, and the 5 affected files were re-run after.
