# Task 4b: shell warp popup implementer report

Status: implementation and tests written; conductor verification required. No commit made.
Tier: High (stroke ordering, dirty/save ownership, shared shell and canvas behavior).
Route: this Codex implementer executes the supplied Task 4b brief in its assigned worktree; no additional delegation.
Baseline: useWarpPopup.ts, shell/warpPopup.test.tsx and this report were absent when work began.
Git was not invoked, per the sandbox note. Existing tests and fixtures were left unchanged.

## Files

- packages/ui/src/shell/useWarpPopup.ts: shell-owned open/close state and post-stroke decision effects.
- packages/ui/src/shell/adapter.ts: required openWarpDestination slot and loaded-payload map.name.
- packages/ui/src/shell/FamilyApp.tsx: hook wiring, popup body, banners, load identity guard and save tile bump.
- packages/ui/src/shared/useContextEditing.ts: bumpTile(map), reused by the existing context save path.
- packages/ui/src/gba/adapter.tsx: map.name comes from layout.data.map.name, independent of selected.
- packages/ui/src/gbc/adapter.tsx: map.name comes from ready.map.name, otherwise null.
- packages/ui/test/shell/warpPopup.test.tsx: new integration cases, real shell and both family runtimes.
- This report.

Strictly needed support files:
- packages/ui/src/canvas/WorldSurface.tsx: block local canvas keys while any aria-modal panel exists.
- packages/ui/src/shared/useWorldContext.ts: context exit must not steal focus from a newly opened modal.
- packages/ui/src/components/WorldContextMenu.tsx: background menu Escape must not refocus the World canvas under a modal.

## Hook behavior

Open and close handlers call strokeSettled once, then publish pending state only for their current request token.
Separate effects decide after React applies stroke replies. They read current selected, mode, popup and leave policy.
An intervening selected/mode change invalidates a pending open; blocked() is checked at request and decision time.
Self-warp uses onOpen without leave; all successful opens end context editing explicitly.
Close uses the existing leave guard, so Cancel leaves the popup and session intact.
Duplicate close requests are blocked while waiting; the existing switch-pending guard owns the prompt interval.
Auto-close clears the popup when selected leaves its destination.
Both families use FamilyApp's synchronous select; select and setPopup run in the same go callback and React batch.
There is no delayed-selection path to justify an extra destinationSeen ref (removed in fix round 1).
If selection leaves the destination during a pending close, it cannot trigger a return-to-source switch.
Unmount invalidates outstanding request tokens.

## Tests written

43 parameter-expanded cases: 21 each for GBA/GBC, plus the GBC-only reload error case.
Fix round 2 adds eight cases to the 35 from fix round 1; the new edits await conductor verification.
Tests capture shell slots through wrappers around the real runtime renderWorld/renderDungeon, per the preflight ruling.
Fetch fixtures and Register follow switchPrompt.test.tsx; deferred responses hold destination loads and paint applies.
The optional Register seam supplies an unsettled chain for pending-open cancellation cases.
Plain DOM assertions only; no jest-dom, existing assertion changes, or dependency changes.

- GBA/GBC: clean open shows workspace and rail; close returns to source and restores the exact opener element.
- GBA/GBC: dirty source open prompts; Cancel preserves selection, dirty state and no popup.
- GBA/GBC: dirty close Cancel keeps the popup and dirty state; prompt cycles Tab and Shift+Tab.
- GBA/GBC: dirty close Discard issues one discard and returns to source.
- GBA/GBC: dirty close Save opens SaveDialog, traps Tab both ways, commits, returns and bumps destination version to 1.
- GBA/GBC: SaveDialog Escape closes only SaveDialog; clean popup Escape returns to source.
- GBA/GBC: palette search Escape leaves popup open; nested sign editor traps Tab and consumes text-field Escape.
- GBA/GBC: close during deferred paint waits, then prompts on fresh dirty state; repeated close requests act once.
- GBA/GBC: opening during deferred source paint waits, then prompts on fresh dirty state.
- GBA/GBC: ordinary self-warp opens and closes without selection changes or discard.
- GBA/GBC: dirty in-context self-warp ends context, leaves one active workspace and maintains popup/opener focus.
- GBA/GBC: deferred destination fetch shows Loading, with no stale source workspace, until the response lands.
- GBA/GBC: pending open is dropped on mode change; Map mode retains one active workspace.
- GBA/GBC: pending open is dropped on tree selection change.
- GBA/GBC, World: one toolbar, one chain registration, one begin/apply/end, one undo/redo; popup Fit owns F.
- GBA/GBC, Dungeon: same key/stroke assertions; tool/history/Fit keys do nothing under SaveDialog.
- GBA/GBC, both modes: background canvas leaves a cancelable minus key unconsumed; World zoom remains unchanged.
- GBA/GBC: popup text-field Escape preserves the background context menu and text-field focus.
- GBA/GBC: prompt Cancel restores popup focus; Escape on the active control raises the dirty-close prompt again.
- GBA/GBC: SaveDialog Escape restores popup focus; active-control Escape still reaches the dirty-close guard.
- GBA/GBC: dirty-open Discard restores the original canvas when the clean destination popup closes.
- GBA/GBC: dirty-open Save/commit restores the original canvas across both intervening dialogs.
- GBC: post-save reload rejection is visible inside the popup, with destination tile version bumped.

## Review Focus 1 findings

The persistent inactive World workspace builds canvas props but its renderCanvas slot renders WorldCanvas alone.
It mounts a map canvas only during context editing. onOpen ends context before mounting the popup's map workspace.
Thus the inactive host adds neither a Toolbar nor a MapSurface stroke chain while the popup is open.
No no-op onStrokeChain and no special host slots object are needed; no new unstable registration callback was added.
The new tests observe actual onStrokeChain registrations through a stable test callback shared by the render slots.
They count actual begin/apply/end and undo/redo requests too.

4a already makes Toolbar tools/history and useFitShortcut owner-aware, with refs read at key time.
useStage passes its container ref to Fit; WorldSurface passes its container ref for its own Fit.
useWorldContext's Escape capture listener already defers to any modal.
Remaining local WorldSurface keys (+/-/Enter/Escape/menu-key) lacked a modal guard; now they defer to any modal.
WorldContextMenu's window Escape listener also lacked a modal guard and could refocus its canvas; now it defers.
Fix round 1 tests dispatch a real bubbling canvas key and check defaultPrevented as well as visible zoom state.
GBC zoom is read from its status; its fitFirst adapter does not render the toolbar zoom readout used by GBA.
A cancelable minus key detects consumption even at a zoom bound, where the old plus-key assertion could pass silently.
The context-menu case opens the real menu over the centred source map before invoking the captured shell open slot.
It then sends Escape from the popup palette input, exercising the menu's window listener while the popup stays open.
The assertions require the same menu to remain connected and focus to remain on that input, away from the World canvas.
Context exit's passive focus effect could steal focus after WarpPopup's layout focus effect; now it defers to a modal.
The 4a popup, focus trap and shortcut helper were reused without rewrites.

## Verification

verify: not run (sandbox)

The one allowed attempt, before implementation:
Command: npx vitest run packages/ui/test/shell/warpPopup.test.tsx
Exit code: 1, before Vitest started. PowerShell rejected C:\Program Files\nodejs\npx.ps1:
"cannot be loaded because running scripts is disabled on this system."
CategoryInfo: SecurityError; FullyQualifiedErrorId: UnauthorizedAccess.
This is infrastructure failure, not observed red-test evidence. No retry or execution-policy workaround attempted.

- Focused shell suite: not run (sandbox).
- Full UI suite: not run (sandbox); no passing count claimed.
- UI typecheck: not run (sandbox).
- Full repository gate, UI build, mutations and live app: not run; conductor must supply this evidence.
- Static format inspection: new hook/test lines checked against 140 characters; edited files normalized to CRLF/no BOM.

## Todos and unresolved

No it.todo cases: the requested behaviors could all be expressed with the existing fixture pattern and deferred fetches.
Run the revised tests, shell suite, UI suite and typecheck, and return failures to this implementer session.
Then perform the plan's mutations and independent reviews; no acceptance or passing-test claim is made here.

The conductor added openWarpDestination: () => {} to the GbaMapSurface.test.tsx ShellSlots fixture and verified tsc.
That conductor change was preserved untouched in fix round 1.

No writes to subject repos, git commands, commits, launches, dependency changes, or existing-test edits.

## Fix round 1

Scope: useWarpPopup.ts, shell/warpPopup.test.tsx and this report only. No other edits this round.
Tier remains High; same assigned implementer, no helper dispatch. Delegate/review guidance applied to the supplied findings.

Conductor-supplied evidence before this round:
- shell/warpPopup.test.tsx: 33/33 pass.
- Full UI suite: 2,081 pass / 125 files.
- UI tsc: pass after the conductor's fixture adjustment.
- Red with packages/ui/src reverted: 33/33 fail.
- Mutations: 7/10 killed; b (destinationSeen), e (WorldSurface guard), g (WorldContextMenu guard) survived.

b: removed destinationSeen and all its writes. FamilyApp select calls setSelected synchronously for both families.
The go callback calls select and setPopup in one batch, including after the existing Save/Discard prompt continuation.
Neither family adapter delays setSelected; no fake delayed-select adapter was introduced to retain speculative logic.

e: tightened the existing World/Dungeon key test for both families. Dispatch minus directly on the World canvas.
Assert it is not defaultPrevented and visible World zoom is unchanged; require the zoom/status readout to exist.
Without the WorldSurface guard, its minus branch calls preventDefault even when zoom is clamped, failing this assertion.
GBC now uses its real status text instead of comparing two undefined toolbar readouts.

g: added a real-family integration test per family. Open the real context menu at viewport centre (100, 100),
where the shell's source-map jump centres the source, then open the popup through the captured slot.
Escape from the popup's palette search must preserve the same menu and input focus.
Without the menu guard, its window Escape handler closes that menu and refocuses the World canvas.
Both event paths are mounted real handlers, so both modal guards were retained.

Expected revised count: 35 cases. Mutation e should fail the four World/Dungeon key cases; g should fail the two new cases.
b is eliminated by removing the unnecessary branch, rather than inventing a runtime that delays selection.
These are source-based expectations, not observed run results.

verify: not run (sandbox)
No vitest, tsc, git, mutation, build or live-app commands attempted in this round, as instructed.
Conductor must rerun verification and the surviving e/g mutations against these exact edits.

## Fix round 2

Quality findings I1 and M1 share missing focus restoration in secondary dialogs and capture timing on replacement.
Tier remains High (shared modal focus ownership and commit ordering); same implementer, no helper dispatch.
No verification commands attempted, per the sandbox instruction. No changes to other existing tests or fixtures.

Files this round:
- shared/dialogFocus.ts: useRestoreFocus, shared by all five modal components.
- shared/WarpPopup.tsx: replace inline restoration with the helper; keep its close-button mount focus.
- shared/SwitchPromptDialog.tsx: call the helper before rendering the autofocus control.
- components/SaveDialog.tsx: same helper, before rendering its autofocus control.
- components/PokemonIndicatorDialog.tsx: same helper, before rendering its autofocus control.
- shared/SignEditor.tsx: same helper, before rendering its autofocus control.
- test/shell/warpPopup.test.tsx: eight new family-expanded cases and a sign-editor return-focus assertion.
- This report. All source/test paths above are relative to packages/ui/.

Ordering checked in code:
- SaveDialog, SwitchPromptDialog, SignEditor and PokemonIndicatorDialog use React autoFocus on child controls.
- WarpPopup focuses closeRef in its own layout effect. Capturing only in a parent layout effect is too late for children.
- useRestoreFocus captures document.activeElement with a useState initializer, before commit/autofocus.
- Restoration runs in layout-effect cleanup, before replacement dialogs' mount layout effects.
- A replacement dialog renders before the old dialog's cleanup: its render-time opener may be the old Cancel control.
- The helper retains a link to the previously mounted dialog's return target, alongside the exact captured opener.
- On cleanup it restores that exact opener if connected; if removed, it follows the retained return chain.
- This covers prompt -> popup and prompt -> SaveDialog -> popup without capturing the replacement's autofocus target.
- Mounted entries are removed during cleanup; previous entries remain reachable only through still-live dialog entries.
- No event listener, timer, manual refocus in tests, additional dependency or per-family focus implementation was added.

Regression cases, each GBA and GBC:
- Dirty popup Close -> prompt Cancel restores focus inside popup; Escape on document.activeElement prompts again.
- SaveDialog Escape dispatched on its focused control restores popup focus; another active-control Escape prompts.
- Dirty open -> Discard -> popup -> active-control Escape closes the clean destination and focuses the original canvas.
- Dirty open -> Save -> commit -> popup -> active-control Escape also returns focus to that canvas.
The source-canvas focus in dirty-open tests is established by the real clean context-exit behavior, not focus().
The existing sign-editor Escape test additionally checks focus returns inside the popup after the editor unmounts.
The original clean-popup Escape/focus tests remain unchanged, covering clean close alongside the new dirty prompt path.

Expected total: 43 cases (35 + 8). Runtime and mutation results for this round remain unverified.
Suggested focused mutations: omit SwitchPromptDialog restoration; omit SaveDialog restoration; capture after autofocus;
drop the return-chain fallback for a removed prompt control. The new cases are intended to expose these regressions.

verify: not run (sandbox)
Conductor must run the revised popup tests, existing suites, typecheck and focus mutations against these edits.
