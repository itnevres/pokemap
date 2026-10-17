# Task 1 report: Save / Discard / Cancel map switch

Status: DONE_WITH_CONCERNS (implementation and UI checks complete; full gate has environment failures outside UI).

## Scope and files

Followed task-1-dispatch.md and task-1-brief.md, with Part 1 of the binding design. No mutation step, commit, delegation, source-decomp edit, or changes outside packages/ui plus this report. Reports remain here for coordinator review; no reviews have been claimed.

- `packages/ui/src/gba/adapter.tsx`
- `packages/ui/src/gbc/adapter.tsx`
- `packages/ui/src/shell/FamilyApp.tsx`
- `packages/ui/src/shell/adapter.ts`
- `packages/ui/test/App.test.tsx`
- `packages/ui/test/AppContextEdit.test.tsx`
- `packages/ui/test/AppContextStroke.test.tsx`
- `packages/ui/test/AppEditingWiring.test.tsx`
- `packages/ui/test/AppWorldContextMenu.test.tsx`
- `packages/ui/test/gbc/GbcAppContext.test.tsx`
- `packages/ui/test/gbc/GbcAppEditing.test.tsx`
- `packages/ui/test/gbc/GbcAppWorldGuard.test.tsx`
- `packages/ui/src/shared/SwitchPromptDialog.tsx` (new)
- `packages/ui/test/shared/SwitchPromptDialog.test.tsx` (new)
- `packages/ui/test/shell/switchPrompt.test.tsx` (new)

## Leave and prompt plumbing

- FamilyApp owns the one `pendingSwitch: { go: () => void } | null`, the busy state, and a `saveAfterSwitch` ref. Synchronous refs reject repeated requests/actions before React renders, including requests during the Save dialog and an in-flight discard.
- RuntimeArgs adds requestPrompt. Both adapters keep leave and now use `if (sameMap || !session.isDirty) go(); else requestPrompt(go)`. FamilyRuntime exposes session.discard and setSwitchError. The shell guards same-map world-open/context shortcuts too while a switch is pending.
- SwitchPromptDialog uses existing modal/panel/button styles, role=dialog, aria-modal=true, the exact map-specific sentence, Save/Discard/Cancel, Cancel autofocus, and Escape cancellation. Busy disables every button and Escape.
- Save opens the existing SaveDialog. Its successful onCommitted first runs the existing context markClean/dialog close/family reload callbacks, then clears pending state and runs the captured target. Cancellation clears that target. Failure/refusal leaves SaveDialog and the current dirty map intact. SaveDialog itself is unchanged.
- Discard waits for the shared stroke registry, calls the originating runtime session.discard, and only then runs the target. Failure clears the pending operation and reports through the family's dismissible switchError banner. GBA now has this banner and performs the server discard; GBC retains its existing banner and error-clearing behavior.
- Existing historical comments were kept per dispatch; small adjacent Plan 10a notes identify superseded switch policies. Other window.confirm flows (toolbar discard, etc.) remain in place.

## New tests and what they prove

SwitchPromptDialog.test.tsx:

- `labels the modal, focuses Cancel, and routes each action`: exact sentence, modal semantics, actual focus, all three callbacks, Escape callback.
- `disables all actions and Escape while busy`: each button disabled; clicks and Escape send no callbacks.

switchPrompt.test.tsx runs each of the following independently with the real GBA adapter and real GBC adapter, real session hooks and real SaveDialog, using fetch responses as the server boundary. A small renderMap wrapper mounts a registered SettledChain without replacing adapter leave/session logic.

- `prompts on dirty switch; Cancel keeps map and sends no request`: exact map name, current selection/dirty work retained, no fetch at all after the switch attempt/Cancel, no discard, and no stroke wait.
- `discard waits for queued stroke link`: deferred registered chain blocks discard; busy actions/Escape and a second target cannot interrupt it; release sends exactly one POST to the old map's discard endpoint; a second deferred server response proves selection stays until discard succeeds; target fetch follows discard.
- `save path switches only after commit`: prompt opens unchanged Save dialog; cancelling preserves current dirty map; retry holds commit response and proves no early switch; a second switch during Save cannot replace the original target; successful commit selects the original target without discard.
- `save commitFails keeps the current dirty map`: commit exception is visible, current map and dirty state remain, cancelling allows another guarded request.
- `save refused keeps the current dirty map`: a refusal is visible and preserves current map/dirty state; cancelling allows another request.
- `discard failure shows switchError and stays`: rejected discard displays the banner, retains current map and dirty work, and Dismiss clears the banner.
- `no prompt when clean or same map`: clean switches and dirty same-map clicks bypass the prompt; no discard.
- `second switch while prompt open is ignored`: a different second target does not replace the first target, and only one discard is sent.

## Existing tests migrated (old name -> new name)

No existing tests were deleted. Their selection, event/stamp preservation, request ordering, context-overlay, and beforeunload assertions remain. The old GBA same-map characterization was updated to the explicitly required R2 behavior. Identical names below mean the test body now drives/checks the modal instead of mocking confirm.

### packages/ui/test/App.test.tsx

- `in Map mode with a dirty session, attempting to switch maps shows a confirm() guard instead of switching silently, and does not switch on cancel` -> `in Map mode with a dirty session, attempting to switch maps shows the switch prompt, and does not switch on cancel`
- `does NOT register a beforeunload handler while the session is clean` -> `does NOT register a beforeunload handler while the session is clean`
- `characterisation (Plan 9): re-clicking the selected map in the tree while dirty asks first; GBA never discards on the server` -> `re-clicking the selected map in the tree while dirty neither prompts nor discards`
- `a world click on another map asks to discard first; cancelling leaves the tree on the original map` -> `a world click on another map asks to discard first; cancelling leaves the tree on the original map`
- `confirming the discard switches the tree to the clicked map` -> `choosing Discard switches the tree to the clicked map`
- `re-clicking the already-selected map in the world does not raise the confirm` -> `re-clicking the already-selected map in the world does not raise the prompt`

### packages/ui/test/AppContextEdit.test.tsx

- `a double-click on another map with a dirty session and a cancelled confirm does not enter context` -> `a double-click on another map with a dirty session and a cancelled switch prompt does not enter context`

### packages/ui/test/AppContextStroke.test.tsx

- `dirty Map and Dungeon mode switches leave context without prompting and preserve the session` -> `dirty Map and Dungeon mode switches leave context without prompting and preserve the session`

### packages/ui/test/AppEditingWiring.test.tsx

- `a cancelled map switch (dirty session) keeps the selected event and the chosen stamp` -> `a cancelled map switch (dirty session) keeps the selected event and the chosen stamp`

### packages/ui/test/AppWorldContextMenu.test.tsx

- `a dirty session with a cancelled confirm keeps World mode and the selection` -> `a dirty session with a cancelled switch prompt keeps World mode and the selection`

### packages/ui/test/gbc/GbcAppContext.test.tsx

- `a mode switch leaves context without a prompt; the session persists (still dirty back in Map view)` -> `a mode switch leaves context without a prompt; the session persists (still dirty back in Map view)`
- `a tree click on another map leaves context only after the dirty guard (cancel keeps editing)` -> `a tree click on another map leaves context only after the dirty guard (cancel keeps editing)`
- `a double-click on another map with a dirty session and a cancelled confirm does not enter context` -> `a double-click on another map with a dirty session and a cancelled switch prompt does not enter context`
- `a confirmed discard enters context on the other map, discarding the server session first` -> `choosing Discard enters context on the other map, discarding the server session first`

### packages/ui/test/gbc/GbcAppEditing.test.tsx

- `dirty guard: cancel keeps the map; confirm discards the server session BEFORE switching` -> `dirty guard: cancel keeps the map; Discard discards the server session BEFORE switching`
- `a failed discard keeps the user on the map and says why` -> `a failed discard keeps the user on the map and says why`
- `characterisation (Plan 9): re-clicking the selected map while dirty neither asks nor discards` -> `characterisation (Plan 9): re-clicking the selected map while dirty neither asks nor discards`
- `characterisation (Plan 9): a tree re-click of the selected map clears a failed-discard error` -> `characterisation (Plan 9): a tree re-click of the selected map clears a failed-discard error`
- `a successful toolbar discard on the same map clears a failed-discard error` -> `a successful toolbar discard on the same map clears a failed-discard error`
- `a clean session switches with no confirm` -> `a clean session switches with no prompt`

### packages/ui/test/gbc/GbcAppWorldGuard.test.tsx

- `a world click on another map: GBA confirm; cancel keeps the selection and discards nothing` -> `a world click on another map: switch prompt; Cancel keeps the selection and discards nothing`
- `a world click, confirmed: POST /discard goes out BEFORE the new map is fetched` -> `a world click, Discard: POST /discard goes out BEFORE the new map is fetched`
- `a world double-click (open): cancel stays in World; confirm discards then opens Map on the new map` -> `a world double-click (open): cancel stays in World; Discard discards then opens Map on the new map`
- `the dirty session and its beforeunload handler are held while in World` -> `the dirty session and its beforeunload handler are held while in World`
- `beforeunload is removed after a discard` -> `beforeunload is removed after a discard`
- `a failed discard from World is shown in World and keeps the selection` -> `a failed discard from World is shown in World and keeps the selection`
- `characterisation (Plan 9): Edit here on the selected map clears a discard error shown in World` -> `characterisation (Plan 9): Edit here on the selected map clears a discard error shown in World`

## Commands and observed results

All Vitest invocations ran from the repository root.

1. `node node_modules/vitest/vitest.mjs run packages/ui/test/shared/SwitchPromptDialog.test.tsx packages/ui/test/shell/switchPrompt.test.tsx`: configuration startup failed because esbuild cannot read the ancestor directory in this sandbox. Used the dispatch-authorized Vitest Node API fallback thereafter. One initial inline `node -e` attempt failed because Windows shell quoting stripped string quotes; stdin avoids that issue.
2. RED, before implementation, Node API with the two new file filters: `Test Files 2 failed (2)`; `Tests 14 failed | 2 passed (16)`. Shared dialog import could not resolve (module missing); dirty-switch integration tests failed because window.confirm still ran and modal actions/text were absent. The two existing clean-path behaviors already passed.
3. GREEN, same two Node API filters after implementation: `Test Files 2 passed (2)`; `Tests 18 passed (18)`. An intermediate implementation run caught the pre-existing GBA leave wrapper dropping opts; fixed that wrapper to expose leave directly. Initial typecheck caught unsupported Testing Library `exact` options in the new tests; removed those options (role name strings already match exactly).
4. Node API focused regression filters `packages/ui/test/App`, `packages/ui/test/gbc/GbcApp`, plus both new files: `Test Files 15 passed (15)`; `Tests 157 passed (157)`.
5. Node API full gate (empty filters): `Test Files 9 failed | 174 passed (183)`; `Tests 40 failed | 2765 passed | 50 skipped (2855)`; duration 76.65s. No UI failures. The failures occur in CLI/server/core suites requiring external subject writes/git or spawned CLI access (see concerns).
6. Final Node API UI-only gate (`['packages/ui']`): `Test Files 99 passed (99)`; `Tests 1475 passed (1475)`; duration 27.48s. This final run includes the strengthened Cancel no-request/no-stroke-wait assertions and repeated-target/Escape checks while Discard waits. Final `npm.cmd run typecheck`: exit 0, both root and UI TypeScript checks pass.
7. `git diff --check`: exit 0, no whitespace errors.

Node API fallback command structure (PowerShell here-string piped to `node --input-type=module`):

```js
import { startVitest } from 'vitest/node';
const ctx = await startVitest('test', FILTERS, {
  config: false, watch: false, environment: 'node',
  environmentMatchGlobs: [['packages/ui/**', 'jsdom']],
  include: ['packages/*/test/**/*.test.{ts,tsx}'],
  setupFiles: ['packages/ui/test/setup.ts']
});
await ctx.close();
```

The final UI-only FILTERS is `['packages/ui']`; full gate uses `[]`. This mirrors root vitest.config.ts without invoking the sandbox-blocked config bundler. DEBUG_PRINT_LIMIT=300 limits DOM dump noise; it does not change assertions or execution.

## Concerns / coordinator follow-up

- Full gate cannot be reported passing in this sandbox. Failing files: CLI gbcCommands and writeCommands; server gbcEditRoutes, dungeons, gbcRoutes, saveRoutes, signRoutes; core gbc/write/writeGate and write/corpus. Evidence includes EPERM opening external map.bin/scripts.inc/dungeons.json or creating external .pokemap, external git status exit 128, server 500 responses on restricted writes, and spawned CLI node:os system errors. No assertions were loosened and no out-of-scope fixes attempted.
- Existing jsdom HTMLCanvasElement.getContext warnings appear in regression runs; those UI tests pass.
- Mutation A7 and commit intentionally not performed: dispatch reserves both for the coordinator. Live decomp/hash acceptance (A6) was not attempted by this implementer.
