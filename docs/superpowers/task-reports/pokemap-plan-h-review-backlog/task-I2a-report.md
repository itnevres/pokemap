# Plan H task I2a report: `createSessionStore` in place of both stores

Branch `claude/plan-h-server-9-i` (from master `f96e7df`). Tier High (save and discard ownership: the store decides what `dirty()`/`has`/`close` answer for the hub's unsaved-edits guard and for commit/discard).

## What changed
- New `packages/server/src/sessionStore.ts`: `createSessionStore<E>(root, openEntry)` returning `{ open, close, has, dirty, closeAll, entries, root }` (`SessionStore<E>`). `open` caches; an `openEntry` that throws stores nothing.
- `editSessions.ts`: the GBA store body is now `openGbaEntry(project, mapName)` (moved verbatim, rationale comments kept) plus `createEditSessionStore(project) = createSessionStore(project.paths.root, ...)`. `project.map` is still called on every open (trap 24).
- `gbcEditSessions.ts`: same for GBC (`openGbcEntry`, `createGbcEditSessionStore`).
- Kept both factory names, so no consumer changes: `index.ts`, `gbcEditRoutes.ts`, `blockEditOwnership.ts`, `blockEditRoutes.ts` and `addEventRoutes.ts` still type the store as `ReturnType<typeof createXStore>`, which is now `SessionStore<Entry>`. This also keeps the diff off `index.ts` (F4 edits it) and away from F4's `editSessions.ts` changes except the one function.
- No existing test edited. New tests: `sessionStore.test.ts` (unit, family-neutral), `gbcEditSessions.test.ts`, `editSessionsReopenMap.test.ts` (trap 24 + root + sign baselines).

## Mutation checks (11, all killed; control passes)
M1 `has` always false (9 failures across both families), M2 open never caches, M3 dirty unfiltered, M4 dirty unsorted, M5 closeAll no-op, M6 close no-op, M7 store root wrong, M8 GBA caches the map (trap 24), M9 GBA root wrong, M10 GBC sign baselines dropped, M11 GBA sign baselines dropped. M9, M10 and M11 first survived (no test on root or on `signBaselines` at open); the two new test files were added and the three re-run.

## Gate
See ledger line below (filled after the full gate).
