**Approved with fixes**

Critical: None found.

Important: None found in Task 6’s changed production paths.

Minor:

- `packages/ui/src/canvas/useWorldDrag.ts:276` — The newly wired hook publishes `cancelRef.current` during render. An abandoned concurrent render can replace the cleanup callback with one capturing uncommitted options. Publish it in a layout effect. This is inherited code; Task 6’s own `cancelDrag` and `warpInputs` refs correctly publish at commit.
- `packages/ui/test/canvas/WorldSurfaceInteraction.test.tsx:455` — Warp lifecycle coverage stops at rejection/retry. Removing the request-identity guards or unmount cleanup could allow late results to publish without failing these tests. Add deferred resolution and rejection after unmount, plus StrictMode coverage.
- `packages/ui/test/canvas/WorldSurfaceInteraction.test.tsx:306` — The stale-POST test covers an older success only. Add an older rejection while a newer drag remains pending. Also cover all group members failing: one reload, no saved callback.

The important tests have meaningful mutation targets:

| Test line | Mutation it should catch |
|---|---|
| 264 | Reload per POST or notify before the last settlement. |
| 285 | Reload on first rejection; report failed members as saved. |
| 306 | Resolve the latest ledger version instead of the POST’s version. |
| 322, 365 | Commit on cancellation, omit rollback, or leave versions pending. |
| 340 | Commit on captured leave or commit twice on release. |
| 388 | Begin the drop version after optimistic movement. |
| 401 | Remove marker-click suppression or shrink the hit radius. |
| 422, 503 | Ignore half-unit offsets, guess destination centres, or fetch only visible endpoints. |
| 455 | Retain failed entries or retry on adapter/error renders. |
| 546, 560 | Remove double-click fallback, Enter, or centre-pivot keyboard zoom. |
| 610, 627 | Stop restarting jump expiry or reveal filtered jumps permanently. |
| 637 | Show the rail in context or apply continuous context zoom. |
| 656 | Remove dungeon-generation guards. |
| 719, 742 | Clear dismissible errors on success or clear another map’s error. |
| 795 | Remove either tooltip-edge clamp. |

By inspection, commits catch each member separately and reload once after settlement; ledger versions precede optimistic movement. Warp retries exclude error/cache-version renders. New world-coordinate overlays use the shared projection. Pan avoids rebuilding the world placement list when adapter identity is stable. Rationale comments remain near their logic, and inspected files meet the 140-character limit.

Tests use deferred promises, bounded `act` loops, hand-derived geometry, and a reload spy. Mutation targets above are predictions, not executed results. Conductor reports **226/226 canvas tests and clean typecheck**; I ran no tests/builds and edited no files.