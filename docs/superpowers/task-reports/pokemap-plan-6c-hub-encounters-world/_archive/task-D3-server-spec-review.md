# D3 server/core spec review — 90aff21

Status: CHANGES REQUESTED. One checkpoint finding; full D3 wire-contract gap separately recorded.

## Finding SR1 — restore the sidecar even when the first response fails (P2)

Location: `packages/server/test/gbcRoutes.test.ts:888-918`, especially `if (written && existsSync(path))` at line 912.

The test takes its original snapshot before POST, but only assigns `written` after asserting status 200 and parsing the response JSON. A regression that writes successfully and then returns 500, returns an unexpected status, or returns malformed JSON throws before that assignment. The finally block then skips restoration entirely. With an originally absent file, both the newly created dungeon file and its now-nonempty parent remain. With an existing file, changed bytes remain. This violates the explicit checkpoint requirement to preserve PerfPlus state even on test failure, precisely when regression/mutation tests need that protection.

Fix in the same implementer: base finally restoration on the initial snapshot and current file existence/bytes, never on whether the response assertions reached `written`. If the original file existed, restore differing bytes (and recreate it if the tested behavior removed it); if absent, remove only the created dungeon file. Remove a newly created parent only when empty. Add a focused temp-root or in-memory failure-path witness that fails after a simulated successful write but before the first response assertion completes. Do not provoke this failure against the real corpus without an independent outer restoration guard.

## Independently verified behavior

Read both task-D3-server-spec.md and task-D3-spec.md; inspected `git show 90aff21` and current supporting adapter, parser, sidecar helper, and GBA routes. The only concurrent worktree source edits observed were route header comments; reviewed implementation is the committed checkpoint.

Raw PerfPlus asm independently pins BurnedTower1F's third warp to `(10,9), BURNED_TOWER_B1F, 1`; B1F's first entry is `(10,9), BURNED_TOWER_1F, 3` and second is `(17,7)`. The production lookup uses `events.warps[event.destWarp - 1]`, preserving source order via map and raw coordinates via event spread. It therefore resolves the correct first arrival. Elevator asm independently pins the first event to `(1,3), CELADON_DEPT_STORE_1F, -1`. The positive-index condition leaves that destination named but unresolved. Positive out-of-range lookup naturally yields undefined while retaining its target name. Existing adapter fixture also pins CeruleanCave1F's target index 6 to a null arrival.

POST/PATCH JSON parsing catches return 400; null, arrays and primitive bodies are rejected before field access. Name, maps and POST seedMap types are checked. Unknown seed is 400; unknown dungeon PATCH/DELETE is 404. Synchronous GET/DELETE file failures reach the enclosing 500 handler; asynchronous POST/PATCH failures reach their promise catch. Dungeon storage uses the unchanged root-relative helper. No GBA implementation or tests changed. Refusal regex retains world/dungeons, sign and edit.

Directed BFS builds outgoing adjacency, starts with the seed, marks before enqueueing, terminates cycles, and has no visibility or planar filter. Route sorting is explicit. The shared cached GBC normalized links retain named unresolved arrivals as map edges, so seed traversal does not incorrectly require an arrival tile.

## Execution and limits

Command: `npx vitest run packages/server/test/gbcRoutes.test.ts -t 'GBC directed dungeon seed traversal|GET /api/warps/:map|rejects invalid create and patch bodies without writing'`.

Result: 5 passed, 80 skipped; file passed. These are focused reads/invalid requests and create no corpus sidecars. No full suite, production edits, or external corpus writes were performed. No mutation rerun was needed to establish SR1: its failure path follows directly from assignment order and the finally predicate. Implementer mutation evidence was not yet available as a report during this review; coordinator must retain the checkpoint's required red-proof verification before acceptance.

## Full D3 carry-forward gap

`buildGbcWarpsPayload` returns `{ mapName: name, warps }` without a family tag or exported wire guard/type. The narrower server checkpoint explicitly specifies its fields without a tag, so this is recorded separately rather than silently declaring all D3 complete. Full task-D3-spec requires a family-tagged GBC wire payload and guard before UI consumption. Coordinator should either enforce the tag now or explicitly carry it into the UI session. The helper reads only requested source/target events, not another full corpus load; repeated target reads are an optimization concern, not a correctness blocker for this checkpoint.
