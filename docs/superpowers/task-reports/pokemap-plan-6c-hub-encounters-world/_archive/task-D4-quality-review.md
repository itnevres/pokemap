# D4 code quality review — 05ef2c6

Read-only review of `git show`/`git diff` for D4. No code edits or tests.

## Findings

1. **P2 — Conflict action can be clipped and impossible to click near viewport edges.** `packages/ui/src/world/ConflictAction.tsx` positions the action with `left: action.x, top: action.y` directly at the pointer. Both canvases create those coordinates from the badge click. `.world-canvas__viewport` has `overflow: hidden`; the new `.world-canvas__conflict-action` only limits its width, and never moves it left or up. A badge right-clicked near the right or bottom of the viewport can put the only `Accept conflict` / `Un-accept conflict` button outside the visible and hit-testable area. Clamp the popup position to the viewport dimensions (or flip it on each edge) and cover a near-edge badge in each canvas.

2. **P2 — GBC corpus write test can leave PerfPlus's sidecar changed if a request fails after writing.** In `packages/server/test/gbcRoutes.test.ts`, the new `accepts and un-accepts Route17...` test assigns `lastWritten` only after each awaited POST resolves. The server writes `world.json` before sending the response. If the awaited request rejects after that write, control enters `finally` with `lastWritten === null` on the first POST, so no restore runs. Capture the post-request file state in a `finally` around each write request, then retain the current byte-match guard in the outer cleanup. The final safeguard must restore exactly the pretest absent state or bytes when this test's write is identifiable.

## Other checks

- Both route branches validate plain request bodies, reject unknown keys, and persist only `acceptedConflicts`; they do not recompute or alter placements on accept.
- `conflictKey` uses the complete ordered geometry tuple; accepted metadata is added to fresh payload objects.
- The GBA/GBC badge state, guarded POST response, visible failure message, and real CSS tokens are wired consistently. No `.btn` or nested React state setter was introduced in this diff.
- Review was static only; runtime verification belongs to the coordinator gate.
