# Task 1 spec-compliance review (Plan 10a, D1 switch prompt), ea3693c..b92088e

### Spec Compliance

- ✅ Spec compliant (R1-R7, A1-A5 at unit level; A7 confirmed by the coordinator's mutation evidence). A6 is a live check and is not in this unit-level scope. It is still open for the coordinator.

### Requirement trace

- R1: `packages/ui/src/shared/SwitchPromptDialog.tsx:14-20` has `role="dialog"`, `aria-modal="true"`, the exact sentence, Save/Discard/Cancel, Cancel `autoFocus`, and Escape -> onCancel on the backdrop. Both `GUARD_TEXT`/`window.confirm` switch guards are gone (gba/adapter.tsx, gbc/adapter.tsx). Shortcut suppression comes from the existing `shared/shortcutGuard.ts:7` and `useWorldContext.ts:119` `[aria-modal="true"]` checks.
- R2: both adapters' `leave` is `if (sameMap || !isDirty) go(); else requestPrompt(go)`. Every switch path goes through `guardedLeave`: tree (FamilyApp.tsx:91), world click (:106), open map (:112), and context entry (ctx -> `leave`, :76). The GBA same-map re-click no longer prompts. The old characterisation test was updated to R2.
- R3: Save sets `saveAfterSwitch` and opens the unchanged SaveDialog. `onCommitted` runs the existing callbacks, then `go`. Cancel calls `clearSwitch()`. SaveDialog calls `onCommitted` only when `r.ok && refusals.length === 0` (SaveDialog.tsx:94), so a failure or refusal leaves the dialog open and the map dirty. Tests cover cancel, commitFails and refused, each followed by a fresh guarded request.
- R4: `strokeSettled().then(() => runtime.session.discard()).then(go, setSwitchError)` (FamilyApp.tsx:281) is shared by both families. GBA now discards on the server through the shared `useEditSessionCore.discard`, which throws on a non-OK response before clearing state, so a failure stays dirty. Both families register their canvas chain (`MapCanvas.tsx:255`, `GbcMapCanvas.tsx:309`), so the wait is real in the app as well as in the test harness.
- R5: Cancel only calls `clearSwitch()`. The test asserts zero new fetches and that `settled` is never called.
- R6: the `switchPending` and `switchInFlight` refs block a second request synchronously. Busy disables all three buttons and Escape. The A2 test also clicks a third map and presses Escape mid-discard.
- R7: the shell owns the prompt. Families supply `session.discard` and `setSwitchError` (adapter.ts:67-68), which matches the brief's "GBA gains setSwitchError + banner".
- Brief test list: all six named tests exist for both families (switchPrompt.test.tsx). The extra commitFails/refused cases strengthen A3. The tests that stubbed `window.confirm` were migrated with equal `it` counts in all 8 files. The confirm stubs that remain belong to the separate toolbar "Discard Changes" flow, which is out of scope.

### Adversarial async checks

- Commit fails or is refused during a Save-driven switch: no switch, dialog stays open, map stays dirty. Cancelling clears the busy state and a new prompt can open (verified by the existing tests).
- Save-dialog cancel: `clearSwitch()` resets `pendingSwitch`, both refs, `saveAfterSwitch` and busy. `saveDialog.setOpen` has no other caller that could close the dialog behind the shell's back (grep: only FamilyApp, MapEditingWorkspace:89 open, and gbc adapter:81 open). So the hidden-busy-prompt stuck state cannot occur.
- Discard failure: the prompt closes, the banner shows, the map stays dirty, and Dismiss clears it. A retry goes through a fresh prompt. Matches R4/A4.
- Unmount or map change mid-discard: every `selected` change is guarded while pending, and the fixed full-screen backdrop (styles.css:1869) covers the header and project switcher. An unmount before the promise resolves only ends in setState calls on an unmounted component, which are no-ops, and the discard has already closed the old session. No finding.

### Findings

- **Minor (probe-confirmed): a commit that lands after its Save dialog was cancelled still triggers a later switch.** SaveDialog's Cancel stays enabled while `saving` (SaveDialog.tsx:167). This is pre-existing behaviour. FamilyApp.tsx:259-264 now reads the shared `saveAfterSwitch` ref and calls `clearSwitch()` from whichever dialog's `onCommitted` fires. That includes a dialog that was cancelled while its commit was in flight.
  - Probe, run on both families as a temporary test and then reverted: Save, press commit (held), Cancel, click a third map, choose Save again so the second Save dialog opens, then release the first commit. Result: the second dialog closes without the user confirming it, and the app switches to the third map (status=Route2, 0 dialogs).
  - Data is safe: the first commit did succeed, and the modal blocks painting in between. The anti-goal "switch when the commit failed" is not hit.
  - The behaviour still bends R3. The switch happens off a dialog the user cancelled, and the diff the user was confirming in the second dialog is skipped.
  - Other variants clear an open prompt or a busy discard silently.
  - Suggested fix: ignore `onCommitted` from a dialog instance that was already cancelled (for example a per-open token), or disable SaveDialog's Cancel while saving.
- **Info:** A6 (live hash check, both families) was not done by the implementer and is outside this review's unit scope. The coordinator must do it before the task is closed.

### Checks run

- Focused probe test, appended to `packages/ui/test/shell/switchPrompt.test.tsx`, run with `node node_modules/vitest/vitest.mjs run <file> -t PROBE`: 2 passed, logging status=Route2 and dialogs=0 for both families. Restored with `git checkout`.
- `git status --short` afterwards shows only the quality reviewer's untracked report. No tracked file is modified.
