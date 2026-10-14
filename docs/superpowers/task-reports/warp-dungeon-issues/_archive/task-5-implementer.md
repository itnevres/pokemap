# Task 5 implementer report — editable warp destinations

Status: Implementation ready for final independent rereviews. Final resumed test gate is blocked before collection by EPERM; earlier focused gates passed, but those passes must not be represented as validation of the newest source/tests. No full suite was run by this implementer.

## Scope and implementation

Both App hosts own popup destination selection, reuse their existing edit session and existing map editing workspace, and keep the World/Dungeon canvas mounted. World canvases gained an optional destination callback; standalone preview callers still work. Modal children use App-loaded payloads and do not create another edit session or duplicate destination fetch. GBA has its existing collision/paint/events/sign/undo/save controls; GBC has its supported editor and existing shared Morn/Day/Nite state inside the popup.

Same-map destination opening preserves dirty session/undo state. Different-map dirty opening confirms and awaits server discard before selecting/opening. A failure retains the source session and displays the error. Transition requests are serialized: a blocking waiting dialog prevents further selection/navigation while discard completes. Popup X/Escape opens existing SaveDialog while dirty, and closes directly while clean; pending mutations block close/save/new canvas gestures. Save/Sign modal Escape retains popup ownership. Shared Tab-trap helper confines each active dialog and popup focus restores its captured opener; canceling nested dialogs focuses popup Close.

Pending protection covers paint begin/apply/end and event move/add/delete, undo/redo/discard, and popup post-save reload. Existing canvas events continue to finish their stroke; only new gestures are refused while the popup is busy. Ordinary GBC Map/context paint queue behavior remains unchanged. A busy status explains the waiting state. GBA paint now returns apply promises without overwriting the retained queue, serializes held trail applies, awaits end, and reports rect/shift/first/trail apply failures while still cleaning up the stroke.

Saving refreshes the selected image tile and clears active warp payload caches, including GBC sources with embedded destination coordinates. GBC request identities reject stale success AND failure. GBA popup saves reload its layout baseline before editing resumes; a visit identity prevents stale reloads from overwriting another map. Main GBA save behavior was left as before.

For issue 6, GBA scoped lines fetch all placed dungeon members even offscreen, preserving outside-member exclusion and the existing anchored-first mixed indoor initial fit. Curated Dungeon mode now requests `/api/world?scope=dungeon`, and hides the global auto-layout switch. Server scope override is coordinator-owned. WorldCanvas house mock already accepts world query strings. GBC cache regression additions are verifier-owned.

## Review fixes

Read independent spec and quality reports. Addressed their eight/four overlapping findings: real GBA click/click/dblclick source selection; modal focus escape/restoration; all pending editor mutations; adjacent stroke busy race; stale GBC warp replies and incoming endpoints; GBA saved baseline; stale discard continuation; swallowed GBA paint errors. Follow-up reviewer found raw GBA discard closure and retained-tail overwrite: discard is tracked in useMapEditing input and paintAt now returns its promise. New gestures are explicitly disabled during event/discard/reload operations, beyond native fieldset disabling. Save/Sign use the same focus trap. GBA reload failures are shown inside the popup.

## Checks and exact outcomes

- Initial RED: `npx vitest run packages/ui/test/WarpDestinationModal.test.tsx`: 1 failed / 4 passed, shared child workspace was absent.
- Save focus RED: focused SaveDialog test: 1 failed / 9 passed, Shift+Tab stayed on Cancel rather than trapping to Save.
- Before suspension: UI TypeScript check passed repeatedly, including after final queue/nonpaint/focus changes.
- Before suspension: focused MapCanvas + GbcMapCanvas + two warp integration files: 125 tests passed across 4 files at that snapshot.
- Before suspension: AppContextEdit + GbcAppContext + two warp integration files: 41 tests passed across 4 files at that snapshot.
- Before suspension: SaveDialog + SignComposer + modal + two warp integration files: 33 tests passed across 5 files at that snapshot.
- Latest pre-suspension GBC integration: 6 tests passed, including deferred move/add/delete.
- Latest pre-suspension GBA integration: 9 tests passed, including deferred event/discard; switch cancel/failure/success; dirty same-map opening; held reload/new paint blocking and saved-seed discard.
- After resume, `npx tsc --noEmit -p packages/ui/tsconfig.json` passed after scoped fetch/toggle and after newest tests.
- After resume, focused WorldCanvas attempts and combined MapCanvas/WorldCanvas/warp integration attempt failed BEFORE collection: `EPERM: operation not permitted, realpath C:\Programming Projects\PokeMap\node_modules\vitest\dist\spy.js`. Combined attempt: no tests, four errors. No permissions bypass attempted.

Newly added but not yet runnable after resume: scoped world request/hide-toggle wiring, real click/click/dblclick regression, rect/shift/pencil refusal cleanup, and held three-apply GBA queue ordering. Coordinator owns final serial full gate and reviewers own final rereview decisions.

## Limits and preserved state

No commit/branch/push, corpus write, config change, dependency, server locking, or live browser action by this agent. Preserved pre-existing untracked state. Shared-layout image alias refresh remains the pre-existing limitation approved for deferral; selected-tile invalidation is preserved. Final review/test completion is outstanding; report files must not be archived until all reviews pass.


## Final review fix round — reload failure and asynchronous focus ownership

Final reviewers identified that a failed post-save reload exposed a pre-save discard baseline again and GBC's reload error could be hidden behind the popup. Both hosts now keep a dedicated popup refresh error, show it inside the modal with a Retry reload button outside the disabled editor fieldset, and block new canvas gestures, toolbar mutation and popup close until a reload succeeds. Failed refresh ownership therefore cannot be lost by closing/reopening the same map. Retry uses the existing reload function and existing tracked pending state. Selected-map changes clear the refresh error; selection/navigation guards protect ownership while error or pending state persists. GBA main/context reload behavior remains unchanged; GBC main/context retains its existing reload/error route.

A successful dirty-map transition previously allowed the temporary Switching maps scrim to become the remembered opener. App now captures the original connected opener before awaiting discard and passes it to the modal. Failed discard restores that opener too. Standalone modal callers retain their existing self-captured focus fallback.

Added one failure → blocked edit/close → retry success regression per family, and extended the GBA dirty-switch success/failure test to assert restoration to the original opener after asynchronous discard. These newest tests could not collect: focused two-file attempt again returned EPERM realpath vitest/dist/spy.js, no tests and two errors. A separate `npx tsc --noEmit -p packages/ui/tsconfig.json` completed with exit 0 after the fix round. Production and owned tests are frozen again for final independent rereview/coordinator gates; newest behavioral coverage remains unverified until runtime permissions allow collection.


Final focus follow-up: the popup focus effect now observes refresh-error ownership and focuses Close after successful Retry removes the focused Retry button. It keeps nested Save/Sign ownership guards. Both retry regressions explicitly focus Retry and assert focus returns to popup Close on success. No repeated Vitest attempt was made per coordinator instruction after the confirmed collector EPERM. Source/owned tests frozen after this change.

GBC retry test expectation corrected to the existing fetchGuarded status error (`could not reload…500`), rather than the ignored mocked error-body text. No production fetch behavior changed. Separate UI typecheck after the focus follow-up passed, exit 0.
