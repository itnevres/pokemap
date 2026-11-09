# Plan 14.1 Task 8 - fix round 1

Status: requested UI fixes and regression tests written; conductor verification and independent re-review pending. No tests, typecheck, build, live checks, mutation commands, git commands, or commits were run by this implementation session.

Tier: High, because the changes touch visit-scoped asynchronous requests, modal keyboard ownership, and deferred session operations. Execution used the same Codex implementation handle and native gpt-6.1-sol route. No further helpers were dispatched. The user authorized two additive EngineAdapter methods in the existing createEvent test literal; every existing assertion in that file remains unchanged.

## Files changed in this fix round

- packages/ui/src/shared/AddEventDialog.tsx
- packages/ui/src/gba/addEventFields.ts
- packages/ui/src/gbc/addEventFields.ts
- packages/ui/src/components/MapEditingWorkspace.tsx
- packages/ui/src/gbc/GbcMapEditing.tsx
- packages/ui/src/shell/adapter.ts
- packages/ui/test/shared/AddEventDialog.test.tsx
- packages/ui/test/gba/addEventFields.test.ts
- packages/ui/test/gbc/addEventFields.test.ts
- packages/ui/test/shared/createEvent.test.tsx (only two additive adapter-literal methods)
- This required task report.

No core/server changes, shared-fixture changes, or existing assertion changes were made. Existing concrete engine adapters already implement both field methods and retain their satisfies EngineAdapter declarations.

## Finding -> fix -> regression test

### Important 1: generated-name reuse

Both family defaults now build their occupied-name set from every exposed entry point, local script, local text, flag, and var. They also consume a structural all-labels extension if a caller supplies one. Candidate checks include the names that the current kind/object type can generate: the main script/data label; NPC/script text; the GBC BG wrapper; exact trainer companion labels; a generated flag when that form supports flags; and a generated var for GBA Coord. Trainer-only companions do not unnecessarily advance an NPC's suffix. A form's flag candidates include its available New flag mode, even when the initial NPC mode is Existing.

Exact companion derivation from the real builders:

- GBC trainer: <Label>SeenText, <Label>BeatenText, <Label>After, <Label>AfterText.
- GBA trainer: <TextLabel>Intro, <TextLabel>Defeated, <TextLabel>PostBattle, where TextLabel replaces _EventScript_ with _Text_.
- GBC BG: <Label>Wrapper is distinct from the script label.

New tests in both family addEventFields.test.ts files:

- defaults skip a generated name exposed in %s, including data/companion labels and flags
- repeated item ball defaults advance from the staged generated flag even when its data label is unexposed
- trainer defaults avoid generated companion %s (each exact companion is a separate parameterized case)
- NPC defaults keep the lowest suffix when only a trainer-only name is occupied
- uses an all-labels extension if a caller can supply one

Additional GBC test:

- BG defaults skip an occupied generated hidden-item wrapper and flag

Limitation required by the user: the real MapEventOptions API has no complete all-labels list and no object-constant list. Its localScripts/entryPoints deliberately exclude data labels. Therefore an arbitrary existing or staged itemball/hidden-item data label, or object constant, that has no exposed companion text/flag cannot be discovered by this UI alone. Repeated default New-flag creations are covered by the staged generated flag, but an arbitrary label with an Existing flag can remain invisible. The optional structural labels extension is not supplied by today's hub. Complete lowest-unused selection across those undisclosed namespaces requires a future options API change; no such core/server change was made under this UI-only task. Server collision validation still refuses safely and keeps the form intact.

### Important 2 / duplicate quality finding: request locks beyond paint/create

Both workspaces now route their session operations through counted request wrappers. These cover paint begin/apply/end, move, duplicate/add, delete, undo, redo, discard, and create. Counters retire with the visit, and all Add buttons display the existing in-flight reason while any tracked request remains outstanding.

GBA's editing-hook move callbacks return void and capture the original session, so they cannot be awaited by a wrapper. For real create-capable sessions, the workspace uses tracked direct moves and reconciles the selected event from the current live map after success. It leaves a newer selection alone, reports current-visit failures, and does not move focus after a move. The existing pending-selection effect handles fresh-map resolution. Legacy fixture sessions without createEvent retain the original canvas-session and onMoveEvent identities, preserving their existing identity assertions. Delete retains the original promise-based hook handler and its warp-renumber warnings. GBA discard retains the inspected hook's confirmation, error handling, and selection behavior.

New test, parameterized over move/delete/duplicate/undo/redo and both families:

- real workspace pending %s disables all Add buttons until its POST settles

The test primes real session history flags using a deferred undo, selects a real event, invokes the actual workspace canvas/inspector/toolbar action, verifies its POST and disabled reasons before release, and verifies re-enabling after release. The local workspace network stub deliberately defers every POST; unrelated GETs retain strict routing. Existing paint and create lock tests remain in place.

### Important 3: empty Existing sources accepted invalid names

Empty Existing script/var/name option sets still render text inputs, but their nonempty values must match the identifier regex. Nonempty option sets continue to require actual membership, preserving offered sentinel values without making numeric strings generic identifiers.

New shared dialog tests, both families where applicable:

- empty existing script options validate identifier-shaped fallback text
- empty existing var options validate identifier-shaped fallback text (GBA only)

These reject 1bad, embedded whitespace, and whitespace-only values before accepting a valid identifier.

### Minor 4: EngineAdapter contract

EngineAdapter.addEventFields and addEventDefaults are required. The sole legacy literal in createEvent.test.tsx received exactly two additive no-op methods. No assertion was changed.

New GBA field test:

- EngineAdapter requires both event field methods

This uses expectTypeOf<EngineAdapter>().toMatchTypeOf<AddEventFieldAdapter>(). Its regression protection is compiler-enforced: the conductor must run typecheck. A plain Vitest runtime pass alone is not evidence that this type contract holds.

### Minor 5: New source mode must start empty

Selecting New for trainer text clears copied/previous text and provenance. Selecting New for a script clears the prior script draft/body and copy state while retaining its generated default label. New flag/var modes retain their generated default names. Preview sequence retirement still prevents late copied content/errors from overwriting the new mode.

New shared tests in both families:

- switching trainer Copy to New empties its text box and requires new content
- switching back to a New NPC script empties the previous draft text

The first test proves Add was valid before the mode change, becomes invalid with the empty New text, and becomes valid after new typing.

### Minor 6: BGEVENT_COPY exclusion witness was vacuous

The local GBC field-spec fixture now explicitly contains BGEVENT_COPY in its input bgTypes. The existing assertion in bg visibility follows each supported type and never offers quantity or copy flags therefore detects removal of the production exclusion. No shared fixture was changed.

### Synchronous latch witness

The existing synchronous busyRef latch remains. The added witness bypasses disabled-button rendering and dispatches two form submit events inside a single outer act/batch against one deferred create.

New shared test in both families:

- two form submits in one batch synchronously latch a single deferred create

Removing the busyRef guard lets both same-render handlers invoke create. Sequential clicks are no longer the only witness.

### Quality Important 7: keyboard focus escaped non-object dialogs

The dialog focuses the first enabled control both in its initial loading shell and when the form becomes ready. It defers focus when another modal is above it. A focused-panel fallback also consumes Tab and chooses the first/last enabled control locally, without changing the shared dialogFocus helper outside scope.

New shared test, parameterized over warp/coord/bg and both families:

- %s traps keyboard traversal while options load and from the first enabled form control

It holds option responses, checks actual document.activeElement in the loading shell, sends Shift+Tab from that focused control, releases options, checks actual first-control focus, and verifies Shift+Tab and Tab wrapping using both default prevention and activeElement. No user-event dependency or timers were introduced.

### Quality Important 8: filtered selection differed from submitted value

Typing a search that excludes the selected option clears the field's model value as well as the native select. The user must choose a visible result before Add validates. This also invalidates an excluded copied-source selection through the same onChange path.

New shared test in both families:

- filtering out the selected sprite clears its model value before Add can submit it

It first proves the form is valid, filters out the selected sprite, asserts the empty selection and disabled Add, submits the form directly and proves create was not called, then selects the visible result and verifies that exact sprite in AddEventForm.fields.

## Static audit and preserved evidence

A byte audit of all ten touched code/test files found CRLF on every newline, zero bare LF, and no UTF-8 BOM. The new dialog, family field files, shell adapter, and new tests are ASCII. The two pre-existing workspace files retain their original non-ASCII dismissal glyphs; the fix added no non-ASCII text.

The conductor's strict fetch routing line was explicitly inspected and preserved:

    if (url.includes("/indicator/at?")) return Promise.resolve(response({ indicator: null }));

Fixture types and signatures were read directly from core addEvent types, GBA MapData/ObjectEvent, GBC event/wire types, session hooks, and workspace/inspector interfaces. No type-correctness claim is made without the conductor's compiler run.

## Verification result lines

- NOT RUN (user/conductor boundary): npx vitest run packages/ui/test/shared/AddEventDialog.test.tsx packages/ui/test/gba/addEventFields.test.ts packages/ui/test/gbc/addEventFields.test.ts
- NOT RUN (user/conductor boundary): npx vitest run packages/ui --maxWorkers=4 --minWorkers=1
- NOT RUN (user/conductor boundary): npm run typecheck
- NOT RUN (user/conductor boundary): npm run build -w packages/ui
- NOT RUN (user/conductor boundary): full gate, live UI checks, and conductor mutation checks.
- PASS, static bytes only: ten touched code/test files CRLF, no bare LF, no BOM; new files ASCII; indicator/at mock preserved.

Remaining work: conductor commands and independent re-review; mutation evidence for the new regression witnesses; the explicitly reported missing all-labels/object-constant options API. No commits were created.
