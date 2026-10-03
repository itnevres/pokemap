# D1 spec fix review — `79685e0`

**Verdict: approved by scoped inspection; no remaining spec findings.** Reviewed the final fix diff against `15b8368`, the executed D1 spec, the prior six spec findings, the quality review, and U1–U4. All six prior findings are addressed. This report covers the committed D1 fix; it does not approve future D2 work.

## Prior findings

| Finding | Final implementation and evidence | Result |
| --- | --- | --- |
| SR-F1: unguarded placement response | `GbcWorldCanvas` calls `fetchGuarded` with POST options and an `isPlacementSaved` guard requiring a record with `ok === true`. HTTP, network, JSON, and shape failures reach the visible save alert. `fetchGuarded` accepts optional `RequestInit` while retaining the original single-argument `fetch(url)` for existing GET callers. The canvas failure-class test and shared helper test exercise all four failure classes. | Resolved |
| SR-F2: weakened pre-fit regression | F5's `NearInterior` is now `TOWN`, so it is drawable and distinguishes pre-fit culling from the real fitted viewport. The original expected two render URLs remain intact. This restores the exact witness established by SR-W1 in the original review. | Resolved |
| SR-F3: removed placement guarantees | The GET-world test again compares every placement against the independently built world plus expected environment/manual metadata. The named direct builder test actually calls `buildGbcWorldPayload`, supplies an explicit sidecar, and checks the complete payload, including a moved NewBarkTown and a zero-size added map. | Resolved |
| SR-F4: unpinned drop/Shift behavior | The hidden-drop test uses an event with explicitly defined coordinates, asserts the exact `(8,3)` POST and `(80,80,50,50)` draw rectangle. New Shift tests pin grab offset, `(8,5)` mouseup placement, one POST, a no-op, and `(7,4)` leave commit. The former surviving coordinate and missing-commit mutations now have direct assertions to fail. | Resolved |
| SR-F5: restoration after failed response assertions | The PerfPlus round-trip captures post-operation bytes before checking status/body. Its `finally` compares current bytes with the captured write, restores prior bytes or removes the newly created file, and only attempts directory removal when that directory was absent initially. The malformed-input test uses the same guarded restoration discipline. | Resolved |
| SR-F6: permanent save alert | A guarded successful placement clears `saveError`. A failed-then-successful retry test asserts the alert appears and disappears. This supplies the recovery behavior requested by the finding. | Resolved |

The changed existing tests are now named and reasoned in the updated implementer report and the fix report. The fixture field additions preserve the required world wire contract, the F5 fixture is expressly kept drawable, and both server regression checks are restored rather than removed.

## Additional boundary and parity checks

The GBC POST now checks that parsed JSON is a non-null, non-array object before reading fields, and rejects non-finite x/y before sidecar reads or mutation. Thus the quality review's `null`/`1e400` paths no longer reach the unsafe behavior. The test sends raw `1e400` instead of using `JSON.stringify(Infinity)`, which would have tested null instead of the actual number edge case.

A successful guarded save calls `onPlacementSaved`, and GbcApp merges that map's manual status into its tree visibility data. The new integration test verifies immediate ungreying after a successful hidden-map drop. This also resolves the quality review's tree-freshness concern; it leaves GBA's existing behavior untouched. Failed saves remain visibly marked and do not invoke that callback.

The canvas still has one view state containing zoom, pan, and fitted status. No nested state-setter updater was introduced. The new app state stores manual map names, not another canvas view. The successful-save callback and visibility updater are pure. Placement writes still go through `writeSidecar` to `.pokemap/world.json`; no decomp data-file write was added.

U1 remains satisfied: the diff from `15b8368^` to `79685e0` is empty for `packages/server/test/world.test.ts`, `packages/ui/test/App.test.tsx`, `packages/ui/test/WorldCanvas.test.tsx`, `packages/ui/test/world/visibility.test.ts`, and `packages/ui/test/MapTree.test.tsx`. The shared fetch helper preserves GET invocation and error-label behavior for existing callers. The new save-error CSS selector is used by the GBC error group and gives both the flex group and text child `min-width: 0`; no dependencies, jest-dom, or `.btn` styles were added. U2's GBC double-click behavior, U3's future conflict acceptance, and U4's border ordering are unchanged.

## Verification scope and subject state

At the coordinator's explicit request, this reviewer ran **no tests and no mutations during the fix review**, because the coordinator was preparing its own source-mutation harness. Conclusions above come from the committed diff and independently read code/tests. The implementer's recorded 8 focused server passes, 195 UI passes, typecheck, and mutation results are historical evidence, not reviewer reruns. The coordinator must use its own final mutation/test results for execution-based completion claims.

The collision scan still finds the two GBC placement tests in `gbcRoutes.test.ts` and the existing GBA writer in `world.test.ts`; the latter was not executed here. Before the coordinator's mutation work, PerfPlus `.pokemap` was absent and GBA world-sidecar SHA-1 was `b285bbf74a86b9d2fbfbeb7df6aed9624300ac3f`. This does not erase the earlier preflight hash discrepancy. This reviewer edited only this report and preserved other agents' D2 work and existing untracked files.
