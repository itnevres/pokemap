# D1 quality fix review — commit `79685e0`

**Verdict: approved.** This scoped re-review used committed content only (`git show`/`git diff` from `15b8368` to `79685e0`). I did not run tests because this shared workspace may be concurrently mutated by the other D1 reviewer and the focused server suite writes the external PerfPlus sidecar.

## Prior findings

### P1 — placement-body validation: resolved

`packages/server/src/gbcRoutes.ts` now parses into `unknown`, rejects null, non-objects, and arrays before field access, and requires finite `x` and `y` values. This makes both previously failing cases return the validation 400 rather than a 500 or a corrupting 200.

The new server test sends literal `null` and `1e400`, asserts 400 for each, and snapshots the sidecar so it proves neither request creates or changes it.

### P1 — tree visibility after a successful manual placement: resolved

`GbcApp` maintains a `manualPlacementMaps` set and incorporates it into `worldVisibility`. `GbcWorldCanvas` invokes its new `onPlacementSaved` callback only after `fetchGuarded` accepts a successful `{ ok: true }` response. The successful-drop integration test proves an automatic indoor map's tree row loses its greyed state immediately.

This preserves the correct behavior on a failed save: the tree stays based on the server snapshot, while the canvas retains its intentional optimistic placement and displays the save error.

### P2 — Shift-drag coverage: resolved

The new canvas tests cover a Shift drag's grab offset, exact rounded POST coordinates, one-write behavior, no-op suppression, and the leave-before-mouseup commit path. The drop test now also asserts its exact centered coordinates and rendered position.

### Minor — stale canvas scope comment: resolved

The canvas documentation now states that Shift drags and tree drops persist individual placements. It no longer claims that GBC has no drag-to-place or sidecar POSTs.

## Additional checks

- `fetchGuarded` accepts an optional request init while preserving its existing GET call shape. Its new tests cover POST status, network, JSON, and response-shape errors.
- Placement POSTs now validate the successful response body and clear a prior save alert after a later successful retry; the UI tests cover both paths.
- `git diff --check 15b8368 79685e0` is clean.

No remaining issues found in the scope of the prior review.
