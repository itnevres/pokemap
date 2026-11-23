# Plan H G1-G3 + B1-B3: spec-compliance review (Opus `high-risk-reviewer`, e835b0b..d9724b5)

Verdict: CHANGES (2 important, 3 minor). Reviewer wrote no file and ran nothing; mutations traced by reading.

1. **Important** `server/src/addEventRoutes.ts:295`: the main GBA add path (`/event/create`) has no test for the B3 index change; every B3 hub test uses `/event/add`. Surviving mutant: revert line 295 to `added.insertOp`. Same gap at sign add (`index.ts:1424`) and Indicator add (`index.ts:1511`). Fix: hub test delete, then `/event/create`, then commit.
2. **Important** G1 lacks `GET /api/defects/<name>` and sign refresh; G2 did not record the answer to "does `signRefresh.ts:77` still need the full re-open".
3. Minor `index.ts:1179`: inventory comment says pngCache is cleared after the finally; only true on success (500 path returns first).
4. Minor `core/src/edit/events.ts` `addEvent` doc: warn that the returned op is in current index space.
5. Minor B2 needs the full I5 corpus gate recorded (`packages/core/test/write/corpus.test.ts`).

Checked and correct: B2 order and comments (both copies); B1 core repro red under old order; B3 scope growth justified (old code: delete 0 then 1 removed B instead of C; delete then add landed mid-array); eventSlot/dropPendingInsert hand traces; undo consistent (snapshots restore insertOps+removeOps together); G2 inventory (`buildWorld` reads layout/connections/ids only; coverage reads ids only); G3 pins map/warps/world; GBC untouched.
Mutants caught by tests: move without translation; `appendIndex` reverted at `/event/add`; Indicator update without translation; no `forgetMap`; no `allMapsCache` reset.
