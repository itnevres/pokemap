# Plan H G1-G3 + B1-B3 report (stream C, sixth conductor)

Tier: all six **High** (save ownership; core write path). Process: tests first (Sonnet writers, no running), red run under the lock, implementation, two separate Opus reviews (`high-risk-reviewer`), review-fix round, mutation checks, gate.

## What changed
- **B2 (D30)** `core/src/write/save.ts` `applyJsonOps`: inserts, then edits, then removes; comment and `EditSession.insertOps/removeOps` docs updated; preview copy in `server/src/addEventRoutes.ts` reordered too (trap 4).
- **B3 (grew beyond its row)** all staged ops live in ORIGINAL index space. New `eventSlot` / `appendIndex` / `dropPendingInsert` in `core/src/edit/events.ts`. Move, add, delete, Indicator add and update, sign add and the add-event preview use them. Deleting a pending add drops its insert; warp-renumber warnings use the original index; the Indicator "pending deletion" refusal is gone; a second move of one original event replaces the first jsonEdit (it used to overlap and write `32` for `5 -> 12 -> 3`).
  Why it grew: `addEvent` stamped `insertOp.index` = current list length (mid-array after a pending delete) and `removeOps` held current indices, so "delete 0 then 1" removed B instead of C and the D30 reorder made "delete, add, move" hit the new element.
- **G1** `server/test/mapCacheAfterSave.test.ts` (GBA temp copy; map, warps, world, warp-renumber scan, reopened session, defects). Red before G2: 4 of 6 failed (map, warps, scan, world guard).
- **G2** `Project.forgetMap(name)` (`core/src/project.ts`); the commit route's `finally` calls it and resets `allMapsCache`. Inventory comment in `index.ts`. Kept on purpose: `worldCache` (layouts, connections, ids only), coverage/species/encounters caches (files a commit never writes), `signRefresh.ts` full re-open (comment added; no longer a cache workaround).
- **G3** one case in `server/test/gbcRoutes.test.ts` (GBC map, warps, world read back after a save) with the trap-18 limit recorded in a comment.
- **B1** repros: core `save.test.ts` (4), hub `eventRoutes.test.ts` (2). Red before B2/B3: 3 of 6 for the right reasons ("index 0 is not present"; delete-then-move writes the wrong event).

## Evidence
- Reviews: `task-GB-review-spec.md`, `task-GB-review-quality.md` (both CHANGES; findings fixed except follow-ups below).
- Mutation checks (`task-GB-mutation.log`): 15 of 16 killed. Survivor **M16** (preview copy order reverted) is unreachable through the routes: a move of a pending add folds into its insert, so no jsonEdit ever targets a pending index; the copy is defensive and kept in step with core.
- Gate: see the line at the end of this file.

## Follow-ups (not done)
1. Deleting a pending add leaves its `scriptAppends`, `newNames`, `scriptReplaces` and flag slot staged (unused script block in scripts.inc, lost flags.h slot). Pre-existing. Needs design: tie appends to the insert, or refuse the delete.
2. `cli/src/writeCommands.ts:83` stamps `addEvent`'s raw index (harmless: fresh session per command; breaks the new doc rule if a session is ever reused).
3. `eventRoutes.test.ts` restores map.json behind the running server; safe only while nothing reads `project.map` between commit and restore.
