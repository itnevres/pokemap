# D4 implementation spec review

**Verdict: changes required on implementation `05ef2c6`.** Independent read-only review used `git show` and `git diff` material only. No test suite, mutation, or subject-sidecar write ran. Reviewed the committed executed spec and predispatch spec review, complete production diff, new/changed tests, and surrounding fetch, mouse, sidecar, and render paths.

## Blocking findings

### F1 — P1: unknown-key regression can leave PerfPlus modified

`packages/server/test/gbcRoutes.test.ts`, test `accepts and un-accepts Route17 without moving maps, with exact PerfPlus sidecar restoration`, anchors `let lastWritten: Buffer | null = null`, the direct `expect((await post(... { key: "unknown", accepted: true })).status).toBe(404)`, and `if (lastWritten && existsSync(path) ... )`.

The invalid-JSON/invalid-shape/unknown-key requests all precede the first capture of `lastWritten`. In required mutation D4-M5, bypassing unknown-key validation writes `.pokemap/world.json`, returns 200, and fails the 404 assertion. `finally` sees null and does nothing. This violates the explicit read-guarded restoration requirement precisely when its mutation proof fails. Capture the current write result before asserting after **every** potentially writing request, including rejection cases; use a helper/finally around the request so its rejection cannot bypass bookkeeping. Preserve the initial bytes/absence and refuse to overwrite unrelated changes. Red-prove the cleanup path without endangering real PerfPlus.

### F2 — P2: same-count acceptance changes leave wrong badge actions

`packages/ui/src/components/WorldCanvas.tsx` and `packages/ui/src/gbc/GbcWorldCanvas.tsx`, draw-effect dependency anchor `conflictAcceptance.acceptedCount`; `packages/ui/src/world/useConflictAcceptance.ts`, anchors `setAcceptedKeys(response.acceptedConflicts)` and `acceptedKeys.includes(conflict.key)`.

The effect consumes membership but depends only on its count. Suppose this canvas loaded B accepted (count 1). Another client accepts A; this canvas unaccepts B. The valid response contains only A, still count 1. The status stays correctly at 1, but neither effect redraws: B remains muted with its check, A remains red, and `conflictBadgesRef` retains B's `accepted:true`. Right-clicking B offers Un-accept again despite the successful unaccept. Depend on the actual membership state or an acceptance revision; pin a same-count key replacement witness in both canvases. The response list is authoritative under the executed spec.

### F3 — P2: required interaction and rejection evidence is incomplete

`packages/ui/test/gbc/GbcWorldCanvas.test.tsx`, `accepts a Route17 badge, persists on remount, and closes the action with Escape`, never unaccepts; its remount is separately fed manually accepted fixture data. Its `shows a rejected POST response...` actually returns HTTP 200 with malformed JSON shape. The GBA malformed-response test covers the same shape-failure path. Neither family proves HTTP/network rejection retains acknowledgement. Both success tests directly fire `contextMenu` without the right-button down/up path or selection/view/placement observations; GBA's placement assertion examines untouched `initial.placements`, not current canvas or outgoing placement calls.

Complete the mandated evidence with GBC accept/reload/unaccept, actual rejected POSTs, accepted tooltip, and real right-button event ordering with no selection/view/placement change. Use observable current output or forbidden-request assertions; preserve existing test expectations. These are explicit executed-spec/predispatch requirements, not requests for wider UI coverage.

## Verified contract and hand checks

The full tuple key includes all seven fields in the required order; JSON escaping prevents delimiter collisions. Route17 serializes to `["Route17","Route18",30,50,"Route16",30,49]`. Shifting both x coordinates to 31 preserves delta `(0,1)` but changes the tuple, so displacement-only M1 is non-equivalent. Same-map keys sort deterministically; radius 10 gives step 22, so fixture badge centers `(40,10)` and `(18,10)` have disjoint radius-10 hit disks. Both draw and hit records use those computed coordinates.

Both routes parse JSON, reject null/array/field types, check current conflict membership before persistence, and update only the sidecar acceptance list. Placement computation and cached conflict geometry are untouched. `wireConflicts` creates new top-level metadata objects without mutating originals. Sidecar defaulting and string-member validation are correct; guards validate consumed conflict fields and POST lists. Shared hook errors are visible; Escape closes the minimal action. Existing mouse-down handlers reject non-left buttons. GBA new API coverage uses a scratch sidecar; the real-corpus restoration issue is F1 above.

Fix review must inspect F1–F3 on the final commit; coordinator must replay all D4-M1–M8 after fixes and verify byte restoration. No approval of live criteria 6/7 or final corpus integrity is implied by this source review.
