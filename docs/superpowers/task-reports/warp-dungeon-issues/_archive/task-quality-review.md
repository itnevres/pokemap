Current verdict: SOURCE REVIEW PASS; final runtime gate not certified. See final section. Earlier findings below are preserved history.

# Independent quality review — warp/dungeon issues

What this change does: The working diff against ef248a3 hosts existing GBA and GBC editing workspaces in warp destination popups, using App-owned sessions. It refreshes world tiles/warp caches after saving and loads offscreen GBA dungeon members for connection lines.

Review status: CHANGES REQUIRED. This is the initial review of the source snapshot on 2026-10-11, while the implementer is still adding tests. I independently read the diff and connected App, canvas, session, workspace, modal, save-dialog and layout-fetch implementations. Findings below are source-traced failure cases, not claims of live-browser reproduction. Expected load is one local user, with ordinary asynchronous network responses.

## Must fix

1. **P1 — Real GBA marker double-click bypasses the new session guard** (`packages/ui/src/components/WorldCanvas.tsx:1665-1673`, `packages/ui/src/App.tsx:98-116`).
   - What this is: A real double-click delivers two click events before dblclick. GBA's click handler selects the source map under the marker; GBC already skips marker clicks.
   - Problem: With dirty destination A selected, double-click a marker on B that points to A. The first click runs changeSelection(B), which confirms but does not discard A, resetting the client session. The eventual popup open sees B's clean session and returns to A with disk seeds, silently losing the client's dirty/undo view while the server still holds A's edits. It also defeats the intended same-map-open preservation.
   - Fix: Suppress source-map selection for warp-marker clicks before calling onSelectMap, matching GBC, and test the real click/click/dblclick sequence with a dirty destination.
   - If we skip it: Unsaved edits become invisible and later edits can revive unexpected server state.

2. **P1 — Modal focus escapes to selection controls behind the popup** (`packages/ui/src/components/WarpDestinationModal.tsx:36-57`, `packages/ui/src/gbc/GbcWarpDestinationModal.tsx:10-14`).
   - What this is: The shells autofocus Close but contain neither a focus trap nor inert background or focus restoration.
   - Problem: Shift+Tab from Close reaches earlier page controls; Tab eventually reaches controls outside the modal too. A keyboard user can select another map or switch mode while warpPopup still names the old map. In GBC ready is checked against selected, not warpPopup, so the old popup title/mapName can be paired with the newly selected map's data/session. On close, focus is lost rather than returned to the originating canvas.
   - Fix: Confine keyboard focus to the active modal, keep background controls inaccessible while it is open, and restore prior focus on close. Preserve nested Save/Sign dialog focus ownership.
   - If we skip it: Keyboard interaction can desynchronize popup ownership and is inaccessible despite aria-modal=true.

3. **P1 — Pending event/undo operations can outlive a clean popup close or Save** (`packages/ui/src/App.tsx:120-123,373-377`, `packages/ui/src/gbc/GbcApp.tsx:160-163,375-379`).
   - What this is: popupBusy is set only by paint canvases. Event move/add/delete, undo/redo and discard are sent through the shared session without updating it.
   - Problem: On a clean popup, move an event and close before its response arrives: isDirty is still false, so the popup disappears. Select another map while the request is pending and the GBA hook can apply the old map response into the new session. On an already dirty popup, a pending event mutation can race plan/commit because Save remains available.
   - Fix: Track pending mutating operations through the existing App-owned session boundary, and use that state for close/switch/save protection, including the synchronous start of a request.
   - If we skip it: Edits can be hidden, responses can contaminate another map's client state, and saves can omit the last edit.

4. **P1 — Paint busy false does not mean all strokes completed** (`packages/ui/src/components/MapCanvas.tsx:749,833-861`, `packages/ui/src/gbc/GbcMapCanvas.tsx:656,726`).
   - What this is: Each stroke sets one boolean true and independently sets it false when its own end resolves. A disabled fieldset disables form controls, not the canvas mouse handlers.
   - Problem: Perform a second stroke while the first end response is delayed. GBC queues the second stroke correctly, but the first stroke's finally sets popupBusy false while the second is still pending. GBA also accepts new strokes and has no equivalent shared completion queue. Close/Save can then proceed before the latest edit/end finishes.
   - Fix: Keep the busy state true until the entire current paint queue drains, or explicitly refuse a new stroke while finalization is pending. Test two rapid strokes with delayed end responses, not only one pending stroke.
   - If we skip it: The promised pending-edit close/save guard fails during normal rapid painting.

5. **P2 — Older GBC warp response can replace refreshed saved endpoints** (`packages/ui/src/gbc/GbcWorldCanvas.tsx:623-645`).
   - What this is: Invalidating a map deletes its cache entry, but asynchronous success/failure closures still write/delete by map name.
   - Problem: Request R1 begins before save, save invalidates and starts R2, R2 resolves with new coordinates, then R1 resolves with old coordinates and overwrites the cache. An old rejection can also delete R2's valid entry and show a stale error. Image caches and GBA warp caches use detached entry objects, so those success paths do not have this overwrite bug.
   - Fix: Associate each request with an identity/generation and ignore both stale success and stale failure before changing the current cache/error.
   - If we skip it: Warp lines/markers revert to pre-save positions until another invalidation or remount.

6. **P2 — GBA saved popup still discards to its pre-save layout seed** (`packages/ui/src/App.tsx:394-400`, `packages/ui/src/hooks/useEditSession.ts:334-344`).
   - What this is: Save marks the session clean and refreshes world caches, but useMapLayout(selected) never reloads on save. discard restores that initial blocks/map seed.
   - Problem: Edit and save in popup, edit again, then Discard. The second discard restores the popup's pre-first-save blocks/events instead of the newly saved disk state. Session remains clean while popup pixels/markers lie; GBC explicitly reloads after commit.
   - Fix: Refresh the GBA layout seed after commit (safely against pending/new edits), or update the accepted baseline to the committed snapshot.
   - If we skip it: Users see stale blocks/events after an ordinary save/edit/discard sequence.

7. **P2 — Stale discard completion can open a popup after later navigation** (`packages/ui/src/App.tsx:111-119`, `packages/ui/src/gbc/GbcApp.tsx:132-136,156-159`).
   - What this is: Opening a different destination awaits discard while the background remains usable; its continuation has no request identity or ownership check.
   - Problem: Confirm opening A, leave discard pending, then choose a later destination or navigate elsewhere. The earlier continuation eventually unconditionally sets selected/warpPopup, overriding the later action. GBA's older discard completion can also reset state belonging to the later selection.
   - Fix: Serialize selection transitions or invalidate stale open continuations when a newer selection/navigation request wins; retain visible discard failures for the active request.
   - If we skip it: A delayed response unexpectedly changes the map being edited.

8. **P2 — Some GBA paint failures are still silently swallowed** (`packages/ui/src/components/MapCanvas.tsx:833,842,853`).
   - What this is: The new onEditError catches begin/first apply/end, but rectangle and shift apply use catch(() => {}), as does the pending trail promise at finalization.
   - Problem: A rect/shift apply rejects while endStroke succeeds; the popup clears busy without displaying any error. Pencil trail calls also replace pendingPaintRef without attaching the first-call catch, so a later trail failure is hidden by finalization (or rejects before a catch is attached).
   - Fix: Surface each failed paint apply through onEditError while still attempting endStroke cleanup; preserve sequential ownership of every pending apply.
   - If we skip it: A user's paint action can disappear with no explanation.

## Checked without findings

- App-owned session hooks are not re-keyed merely by popup visibility, so direct same-map callback opening preserves session ownership.
- Popup close opens the existing SaveDialog for dirty state rather than discarding automatically.
- SaveDialog and SignComposer are App siblings, so their Escape does not bubble through the popup React subtree. SaveDialog's own Escape-during-commit behavior predates this diff; it is not independently elevated as a new finding here.
- World/dungeon canvas instance keys and mapFilter identity do not change on popup open/close. The intentional mixed anchored/shelved GBA fit behavior remains unchanged.
- GBA offscreen dungeon members are added to warp fetch candidates only for scoped connection lines; normal image culling remains intact.
- No new dependencies/server locking or external corpus mutations appear in the reviewed diff.

Verdict: Fix findings 1–8 before shipping. Findings identify behavior rather than require a particular abstraction.
Not checked: No full test suite or live browser run by this reviewer; test work was concurrent. GBA canvas has no stroke cleanup on unmount; this remains a risk if popup/background transitions can unmount while requests are pending, and should be covered by the pending-operation ownership fixes rather than treated as a separate broad refactor.

## Fix-round source re-review (in progress)

Read the updated production diff independently while regression tests are still being finalized. Original findings remain above as history.

- Finding 1: source fix present. GBA onCanvasClick now checks warpMarkerEntries before selection, matching the GBC guard. Awaiting real-sequence regression evidence.
- Finding 2: opener is captured in a ref during render, before child autoFocus commits; this avoids the common effect-after-autofocus capture bug. Both popup shells wrap Tab/Shift+Tab at enabled endpoints and restore connected opener on unmount. Remaining nested-dialog gap: SaveDialog still has no trap; Shift+Tab from its autofocus Cancel enters the popup below and allows editing while Save is open. Popup onClose guards Save, but does not prevent underlying edits.
- Finding 3: wrappers now count event/undo/redo/discard operations synchronously, preserving original begin/apply/end function identity. However GBA useMapEditing is passed only wrapped event methods; its handleDiscard still calls the original untracked discard. The popupSession.discard wrapper is not used by that handler. A disabled fieldset also does not disable canvas handlers: post-save reload/event/discard busy does not prevent a fresh paint stroke.
- Finding 4: popup canvas instances now refuse new paint starts while finishingStrokeRef is set; this is an acceptable scoped alternative to queuing, and normal GBC main/context queuing remains unchanged. Mousemove and mouseup guards prevent a rejected stroke from accidentally painting/finalizing the old one. Awaiting final regressions.
- Finding 5: GBC request identity is checked before both cache success writes and failure deletions/errors. Clearing all warp caches on any saved-map version also refreshes inbound destination data; only visible/scoped maps refetch. Source fix verified.
- Finding 6: GBA now calls layout.reload after commit and counts it as busy. Remaining issue: fieldset does not block new canvas painting while reload is pending. Additionally this new reload runs for every save, including unguarded main/context workspaces, and useMapLayout.reload unconditionally calls setData on completion. Save A, switch B, resolve A reload replaces B's layout; save A, paint again, resolve A reload resets new dirty/undo state to the disk seed. The new call must respect request ownership and prevent new edits until seed refresh completes (or remain limited to the guarded popup scope).
- Finding 7: opening guard now serializes dirty-popup transitions and displays a focused blocking scrim; map/mode handlers reject further navigation while discard is pending. This addresses the original later-action race under ordinary user interaction.
- Finding 8: GBA begin, trail, rect/shift apply, and end failures route to onEditError; cleanup still attempts end. Source fix verified.

No final approval yet: remaining issues were sent to the coordinator immediately; final production changes/test report are not yet ready. No tests executed by this reviewer during the fix round.

## Final-snapshot re-review (2026-10-11; follow-ups pending)

Independently re-read current App/GbcApp, both popup/canvas implementations, useMapLayout, shared dialogFocus, SaveDialog/SignComposer, both world caches, added warp integration tests, MapCanvas error/queue tests, SaveDialog focus test, GBC cache-coordinate regressions, and coordinator-owned server/frontend dungeon-scope diff. Read task-5-implementer.md only after the source/test pass.

Original findings 1, 3, 4, 5, 7 and 8 are resolved at source level. GBA handleDiscard now uses the tracked hook input; explicit editingDisabled blocks canvas gesture starts while event/discard/reload is busy while existing stroke move/end handlers still complete. The retained GBA promise tail now owns begin, all applies, and end without paintAt overwriting it. Begin/apply/end callbacks in popupSession retain the underlying session identities. Scope remains limited: popup canvases refuse a second start while finishing; ordinary GBC main/context queue behavior is unchanged.

Finding 2 is substantially resolved: shared trapDialogFocus is attached to both popup panels and Save/Sign panels; children are App siblings so nested Escape cannot close the warp popup; App restores popup Close after nested cancel. Remaining case sent to coordinator: a dirty different-map open autofocuses the temporary Switching maps scrim. The popup then captures that temporary element as its opener, so closing cannot restore the original world canvas after the scrim is removed. Capture the originating element before awaiting discard and preserve it for popup restoration.

Finding 6 normal success path is resolved: GBA reload is popup-only, tracked busy, and guarded with per-map-visit identity. Main/context GBA behavior is unchanged. Both popup canvases reject new gesture starts during reload. Added GBA integration test holds reload, tries to paint/close, resolves it, edits again and discards, then checks the saved block id via hover. Remaining failure path: after reload fails, editing resumes on the stale discard baseline. In GBC the reload error originally rendered only behind the modal. Coordinator has assigned visible per-popup error and retry-gated editing until a successful reload; pending re-review of that fix.

Additional dungeon scope check: /api/world?scope=dungeon copies sidecar with dungeonAutoLayout:true solely for resolveWorldPlacements. Response still carries original sidecar, and handler introduces no write. Frontend uses scoped URL only for truthy mapFilter and hides global toggle there; changing membership does not remount/refetch entire world. Server regression runs against fixtureRoot sidecar (source asset directories are read-only junction references), saves/restores its bytes, asserts extra indoor placement and unchanged persisted flag. No source issue found. The exact 1209 expected count matches existing surrounding corpus tests.

Test evidence inspected, not executed by this reviewer: new marker click/click/dblclick test rejects onSelectMap; new held begin/apply/end integration tests retain popup and Save guard; held end rejects second begin; GBC event move/add/delete cases retain ownership; GBA dirty switch cancel/failure/success and same-map tests cover selection; Save focus test wraps both directions; GBA pencil/rect/shift errors end the stroke and surface the same error; three held GBA applies cannot be overtaken by end. Independent arithmetic for GBC cache regression: viewport 200x200, bounds 25x10 => zoom8, pan(0,60); raw source(2,4) => (8,76), destination placement x15 plus raw(10,12) halves => (160,108). Deferred success and rejection cases preserve those current endpoints.

Validation limitation: final runtime attempts were reported blocked before collection by EPERM realpath on node_modules/vitest/dist/spy.js. No runtime pass is claimed for newest snapshot; earlier implementer gates are historical only. No tests, browser, source mutations or corpus operations performed by this reviewer. Final verdict awaits the two narrow follow-ups above.

## Final quality verdict — source review PASS (2026-10-11)

Final freeze independently inspected after coordinator notification. No open concrete quality findings remain in the reviewed task scope. Original findings and intermediate states above are retained as audit history; this section supersedes their interim verdicts.

Both final follow-ups are resolved:

- Post-save refresh failure is now a dedicated popup error in both families. Retry sits outside the disabled editor fieldset. New gestures, toolbar mutation, close and selection transitions remain blocked while the saved baseline is unavailable; successful tracked reload clears the error. GBA normal map/context save behavior remains unchanged, and GBC retains its prior main/context reload path. The current failure regression in each family checks visible error, unavailable editing, blocked canvas start and close, then successful retry. GBC expectation now matches the actual fetchGuarded HTTP-status error rather than the ignored non-OK body.
- App captures the original opener before asynchronous discard and passes it to the modal. Failed discard restores it; successful open/close restores it after the temporary wait scrim has been removed. Successful Retry now triggers the popup focus effect through popupRefreshError, returning focus to Close before keyboard navigation can escape from a removed Retry button. Nested Save/Sign ownership guards remain. Both retry tests explicitly focus Retry and assert Close receives focus afterward.

Final disposition of initial findings: 1 resolved (real marker click sequence); 2 resolved (popup/nested keyboard boundary and opener ownership); 3 resolved (tracked nonpaint operations plus canvas disabled starts); 4 resolved (popup second-stroke refusal until finalization); 5 resolved (GBC current-request checks on success and failure plus inbound refresh); 6 resolved (saved baseline refresh, stale-visit guard, failed-refresh retry gate); 7 resolved (serialized dirty opening); 8 resolved (all GBA paint apply errors surfaced with end cleanup).

The coordinator's additional dungeon scope change has no open quality finding: it selects indoor placements without modifying persisted auto-layout preference, and the frontend does not expose the global toggle in a curated view. Regression source and scratch-sidecar handling were inspected. Intentional anchored-first initial fit and existing shared-layout image alias refresh limitation remain accepted scope decisions.

This is **source-review approval, not a claim that the final test gate passed**. I ran no tests or live browser checks and made no production/test changes. Final new regressions were previously blocked before collection by EPERM realpath on Vitest's spy.js; coordinator is running the final captured gate separately. Historical green runs and reported typecheck success do not establish runtime passage for this frozen snapshot. General page-unload handling and pre-existing non-popup editing lifecycle behavior were not broadened or independently certified by this task review.

