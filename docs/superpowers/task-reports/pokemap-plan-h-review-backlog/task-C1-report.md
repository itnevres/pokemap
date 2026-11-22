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

## Mutation checks (16 new tests; all green unmutated)

- M1 barrier skips awaiting sources: 10 failed (Discard, undo, Save, real-paint in both families; paint-only and re-check unit tests).
- M2 barrier skips the re-check after creates settle: 3 failed (re-check test, plus two later unit tests polluted by its leftover state).
- M3 drop `registerSettledSource` in `FamilyApp`: 8 failed (Discard, undo, Save, real-paint, both families; unit tests unaffected).
- Each mutant restored with `git checkout`; the committed tree is unmutated.

## Judgment calls

- Trap 6 (stroke in World-view context editing): no new test; registration is by `selected` and `useContextEditing.enter` selects the map first (`shared/useContextEditing.ts:50-55`).
- Redo has no UI test (fixture has canRedo false); it shares the undo barrier line.

## Review round 1 (spec + quality, Opus)

Merged `origin/master` (670a295) into the C1 branch with no conflicts (the merge touched neither `useEditSessionCore.ts` nor `FamilyApp.tsx`).

Findings:

- Spec 1 / quality 1 (BLOCKING, trap-6 test): FIXED. `AppContextStroke.test.tsx` (GBA) and `gbc/GbcAppContextStroke.test.tsx` (GBC) each gain two cases: dirty the session, make a second World-context stroke with `/paint/apply` held, then (a) click the in-context Discard Changes, or (b) click Map and then Discard Changes. Both expect no `/discard` until the apply resolves, then exactly one `/discard` and a closed fake-hub session.
- Spec 2 (IMPORTANT, unmounted chain leaves the barrier): FIXED. `useStrokeChainRegistry` keeps an unmounted chain `tracked` until its `settled()` resolves (deferred delete, guarded by a `live` set so a StrictMode remount keeps it). This also fixes quality 5 (the unmount's end link is now inside the wait). The old unit test "does not wait for a chain after it unmounts" was replaced by three tests: keeps until settled then drops, remount guard, rejecting/throwing chain.
- Spec 3 (redo UI test): left, composition covers it (shares the undo barrier line).
- Spec 4 / quality 3 (stroke started while Discard waits): LEFT, named in the ceiling comment in `useEditSessionCore.ts`. Looping until quiet cannot see a link a promise-only source has not yet issued.
- Spec 5 (try/catch is new code): left, justified (registerSettledSource accepts any source).
- Quality 4 (comment says map switch waits): FIXED in the comment (guardedLeave waits only for a pending create or block apply).
- Quality 6 (no timeout): LEFT, named in the ceiling comment. A timeout would let Discard race a paint that is merely slow.
- Quality 7 (cleanup not in finally): FIXED. `sessionBarrier.test.tsx` registers through a helper and unregisters every source in `afterEach`.
- Quality 8: wrapper-independence test ADDED. The empty-map-entry removal is not observable from outside (an absent and an empty set read the same), so no test.
- Quality 2 (gate evidence) and quality 9 (try/catch mutation): see Verification.

Verification and mutation results: PENDING, see the end of this section.
