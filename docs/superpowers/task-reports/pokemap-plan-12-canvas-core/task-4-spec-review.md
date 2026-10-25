# Task 4 spec review (Codex gpt-6-astra, read-only)

No Critical findings or adapter-contract omissions found. Two Important test-coverage gaps remain:

- **Important — `packages/ui/test/canvas/MapSurface.test.tsx:130`:** The event-preview test checks callback timing but never asserts the preview is drawn. Removing `setDragPreview(eventAt(event))` would pass. Likewise, all moves use `buttons: 1`, leaving the primary-button guard untested. **Fix:** assert the preview ring’s coordinates after moving, and verify a new-cell move with `buttons: 0` queues no paint during an open stroke.

- **Important — `packages/ui/test/canvas/MapSurface.test.tsx:269`:** Both debounce policies are tested initially, but their reset after a map switch is not. After switching, the test changes blocks and immediately unmounts; removing the policy reset at `MapSurface.tsx:82` would escape these assertions. **Fix:** on map B, assert the first blocks change is skipped only when configured, then assert the next eligible change bumps after 200 ms.

The adapter covers the listed family facts without family branches. Pointer ordering, registration/error routing, reset logic, and carried changes match the specification on inspection. The isolated render-time toggle/hover keying survivors are acceptable redundant protection; the combined reset mutations establish behavioral coverage.

Read-only review; no tests rerun. Full gate/build/live verification remains pending.

Spec compliance: FAIL