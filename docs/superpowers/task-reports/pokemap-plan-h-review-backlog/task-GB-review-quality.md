# Plan H G1-G3 + B1-B3: quality/correctness review (Opus `high-risk-reviewer`, e835b0b..d9724b5)

Verdict: CHANGES. Reviewer hand-traced eventSlot/appendIndex/dropPendingInsert (correct), ran `editJson` once to confirm finding 1. No files written.

1. **Important (pre-existing, on the rewritten move line)** `server/src/index.ts` move route: a second move of the same original event appends a second jsonEdit at the same path; `editJson` locates all edits in the original text and applies back to front, so they overlap (`5 -> 12 -> 3` saved `"x": 32`). Fix: filter earlier edits at the same path (as the Indicator route does). FIXED in the fix round with a test.
2. **Important (pre-existing)** deleting a pending add leaves its `scriptAppends`/`newNames`/`scriptReplaces`/flag slot staged: scripts.inc gets an unused block, flags.h loses a slot. Not a regression. FOLLOW-UP (tie appends to the insert, or refuse the delete).
3. Nit: `cli/src/writeCommands.ts:83` stamps `addEvent`'s raw index. Harmless (fresh session per command). Left; note only.
4. **Important (test gaps)** no test fails if `appendIndex`/`eventSlot` is reverted at: event/create after a pending delete (`addEventRoutes.ts:295`); sign add after a pending bg delete; Indicator add after a pending object delete; warp delete after an earlier pending warp delete (warnings use `slot.original`); undo/redo across deleting a pending add while a later add exists. FIX ROUND adds them.
5. Nit: `eventRoutes.test.ts` restores map.json behind the server with `writeFileSync`; correct only while nothing reads `project.map` between commit and restore.
6. Nit: if `commitSave` throws, `forgetMap` still runs but the open session keeps its old `originalMapJson`. Pre-existing; atomic restore normally prevents it.
Verified: eventSlot semantics, undo consistency, warp-renumber now on original index, G2 inventory against code, GBC separation.
