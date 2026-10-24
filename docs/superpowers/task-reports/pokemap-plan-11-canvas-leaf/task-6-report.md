# Task 6 report: dungeon switch generations (F12) and the failed-reload alert (F11)

Tier: High (async ordering in both families; F11 is the one DOM addition). Tests: Claude wrote the oracle first (deferred fetches). Implementer: Codex `gpt-6.1-sol` (Opus-tier chain, Codex hop) in a scratch worktree, from a design brief; passed first try. Its sandbox could not run vitest (EPERM); Claude ran every check. Claude added one doc comment (`dismissError`).

## Changes

- F12, both families: each click takes a toggle generation (ref counter) and sets `dungeonsPending`. A POST outcome for an older generation is ignored entirely (no state, no reload, no error, no `onLayoutChanged`). Latest failure: pending clears, error in the existing slot (GBA `saveError`, GBC `layoutError`). Latest success: a reload whose generation is remembered; pending clears only when a GET of that generation or later lands successfully. A new click forgets the remembered reload. The unconditional clears are gone (GBA world-effect `setDungeonsPending(null)`, GBC `useEffect(..., [world])`).
- GBA reload generations: `reloadWorld()` bumps a ref counter and `refetchGen` state, returning the generation; the world effect runs for `refetchGen`. Placement commits use it too.
- F11, both families: a failed reload with a world shown keeps the world and canvas and shows `role="alert"` "Could not reload the world: …" with a Dismiss button (accessible name "Dismiss error"). GBA: toast markup beside the save-error toast; `setLoadError(null)` moved from the GET's issue to its success. GBC: toolbar group beside the save-error alert, button inside the alert; `useGbcWorld` gains `dismissError()`. The "Could not load the world" placeholder only shows before any world has loaded.

## Tests

`test/world/placementResync.test.tsx`: the deferred server gains held dungeon POSTs (the server applies a toggle when it is received; only the response is held) and a failing first GET. Per family: two successes in order; reversed; older failure with a newer toggle pending (no error); latest failure after an older success (older success makes no reload; pending cleared; error); a failed latest toggle drops its pending value at once (added for M3/M4; passes on old code too); an unrelated GET landing in the same tick as the last success (pending kept); failed reload after the latest success (pending kept, reload alert); failed reload keeps the canvas (no placeholder, hover works, a Shift-drag POSTs) and Dismiss clears the alert; a successful reload clears the alert; a failed first load shows the placeholder and no reload alert.

Red run (HEAD `73ec627`, old code): 12 failed / 6 passed. Failing: older failure, latest failure after older success, unrelated GET, failed reload, keeps canvas, success clears (both families). Passing on old code: in order, reversed, failed first load (both families); mutation coverage below.

Test location ruling: the Task 6 tests share `placementResync.test.tsx`'s deferred server rather than `WorldCanvas.test.tsx` / `GbcWorldCanvas.test.tsx` (the plan's suggestion), so both families run one harness. The parity suite (`test/shell/worldParity.test.tsx`) does not cover the switch; unchanged.

## Mutations (one at a time, byte-restored; harness `mut6.py`)

| Mutation | Result |
|---|---|
| M1 GBA any world response clears pending (plan step 3) | 1 failed (unrelated GET) |
| M2 GBC same | 1 failed (unrelated GET) |
| M3 GBA a failed latest POST keeps pending (plan step 3) | survived first: in the latest-failure test the pending value equalled the loaded one. Added "a failed latest toggle drops its pending value at once" (one click, POST fails); rerun: 1 failed |
| M4 GBC same | as M3: survived, then 1 failed |
| M5 GBA reload error replaces the canvas (plan step 3) | 1 failed (keeps canvas) |
| M6 GBC same | 1 failed (keeps canvas) |

## Rulings

| Item | Ruling | Cost if wrong |
|---|---|---|
| Latest failure after an older success | Superseded in review fix round 1: a latest failure also reloads, so the switch shows the server value (F12 "the switch shows the server value"); pending is already null, so the rule that only a post-success GET clears pending is untouched. | One extra GET per failed toggle |
| Live check | The switch double-toggle and both alerts are checked live in Task 9 (Acceptance 4), with the rest of the plan's UI. | A visual defect found later |
| Toast stacking (GBA) | All world toasts share one absolute spot (`.world-canvas__toast`), so the conflict and save toasts already overlap today; the reload toast joins them. Restacking changes DOM beyond F11 (anti-goal); left. | Overlapping toasts when two errors coincide |

## Gate

3,520 pass / 0 fail / 217 files; typecheck and UI build pass.

## Review fix round 1

Quality (Codex gpt-6-astra, thread in ledger): Approved 0/0/2. Spec: the Codex astra run hit the usage limit (resets 5:44 PM), so it fell to the Anthropic floor, a Claude Opus subagent: ❌ 0/2/3. Each finding verified; all accepted:

- Spec I1: nothing forced an older toggle's reload landing after a newer click (deleting `toggleReloadGeneration.current = null` passed every test; the in-order test resolves no POST before the second click). New test per family: click, POST ok, its reload held, click again, release the reload: the newer pending value stays. Mutations M7/M8.
- Spec I2: after an older success and a newer failure the switch showed the stale loaded value, and the test passed only because the fake server kept failed toggles. Fix: a latest failure also reloads (both families); the fake server's value is now the latest toggle not answered with a failure. The test now releases the failure's reload and expects the server's value (on). Mutations M9/M10.
- Quality minor 1: the reversed test now resolves two opposite toggles in reverse and asserts the older success makes no reload.
- Spec minor M1: the F11 test now pans (a plain drag on empty space moves Neighbour 50 px; the probe would hit Unplaced otherwise).
- Spec minor M2 (GBC Dismiss inside the alert span, borrowed toast class) and the live check: Task 9. Spec minor M3 (test location): already ruled above. Quality minor 2 (snapshot accumulation on failed reloads): accepted in Task 5.

Gate after fix round 1: 3,522 pass / 0 fail / 217 files; typecheck and UI build pass. Mutations rerun (all ten, one at a time, byte-restored): M1 2, M2 2, M3 2, M4 2, M5 1, M6 1, M7 1, M8 1, M9 1, M10 1 failed.
