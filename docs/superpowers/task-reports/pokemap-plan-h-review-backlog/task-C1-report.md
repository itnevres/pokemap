# Plan H task C1: session barrier awaits stroke sources

Tier: High (async ordering; save/discard ownership).

## Spec

- Race: a paint stroke's `/paint/begin|apply|end` chain is still in flight when the user clicks Discard (toolbar), or the Save dialog plans/commits, or undo/redo. The barrier only awaited event creates and block applies, so the session-closing request could beat the paint. The late paint then reopens a fresh dirty session on the hub.
- Fix: `registerSettledSource(map, settled)` in `shared/useEditSessionCore.ts` (returns the unregister fn). `sessionMutationBarrier(map)` awaits every source of that map unconditionally (a paint-only session has no pending mutation, trap 5), swallowing rejections and sync throws (acceptance 6), then waits for pending creates and loops until a pass finds no mutation pending after the sources settled.
- Registration: `shell/FamilyApp.tsx` registers the shell's `strokeSettled` for `selected` in an effect (both families share the shell; in-context editing selects the map first, trap 6). No call-site changes: Discard, Save plan, both commits, undo, redo and map switch already await the barrier.
- Accepted ceiling (named in the code comment): one tab's own out-of-order chains only, not network reordering.

## Tests

- `packages/ui/test/shared/sessionBarrier.test.tsx`: paint-only wait, per-map scope, re-check after a create settles, rejecting/throwing source, unregister, null map.
- `packages/ui/test/shell/strokeBarrier.test.tsx` (GBA and GBC): Discard, undo, Save plan and commit wait for the link; rejecting link does not block; a real in-flight `/paint/apply` lands before `/discard` and the fake hub holds no session afterwards.
