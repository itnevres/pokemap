VERDICT: CHANGES REQUESTED

# Plan 14.1 Task 6 code-quality review (High: shared canvas input)

Scope: `git diff 100d295..HEAD` (6f8e85f) in worktree `wt-t6`. I read the diff, `MapSurface.tsx`, `useStage.ts`, `GbcMapEditing.tsx`, `MapEditingWorkspace.tsx`, `useMapEditing.ts`, `AddEventBar.tsx`, the Escape listeners in `useWorldContext.ts`, `WarpPopup.tsx`, `SignEditor.tsx` and `WorldContextMenu.tsx`, both new test files, and the spec and plan for Task 6. I did not run Vitest (that was the conductor's job). Mutation evidence comes from the conductor: origin zeroed made 4 tests fail, and a placement fall-through made 4 tests fail. Both are consistent with the test code. `placement.test.tsx:84-92` derives the click point from `compositeOrigin` / `GBC_COMPOSITE_ORIGIN`, and the strict `fetch` throw at :69 catches any paint call.

Counts: Critical 0, Important 1, Minor 6.

## Important

### I1. The fix-round "guarded event selection" applies to GBA only. It contradicts the documented rule and the GBC behaviour, and no test covers it.
- `packages/ui/src/components/MapEditingWorkspace.tsx:94`: `onSelectEvent: activeToolKind === null ? onSelectEvent : undefined`.
- GBC still passes `onSelectEvent: setEvent` without a condition (`packages/ui/src/gbc/GbcMapEditing.tsx:151`).
- `useMapEditing.ts:236-240` still documents a stamp-less pencil/rect/bucket as "inert (same as no tool selected)". Before this change, MapSurface's own `!activeTool && onSelectEvent` gate (`MapSurface.tsx:193`) carried that meaning.
- The only real behaviour change is for pencil/rect/bucket with no stamp. Every other tool already produces a non-null `activeTool`.
- Failure scenario: a GBA user has Pencil selected and switches maps. `useMapEditing` keeps `activeToolKind` but clears `currentStamp` (useMapEditing.ts:212). The user clicks or drags an NPC. Nothing is selected and the gesture pans the map. The same steps on GBC select the NPC and let the user drag it. Users who pick Pencil before any stamp also lose event select and drag on GBA.
- The two families now disagree on canvas input semantics. That conflicts with the unified-UI rule (DESIGN.md "Shared modules": "Change a row's module, not its two consumers").
- Why it happened: fix-round-1 made this change so a test fixture's exact request count would pass. That fixture now has an object at (0,0), and the click triggered the inspector's Indicator GET. The product behaviour was changed to fit the fixture.
- No test pins the new rule. `MapEditingWorkspace.test.tsx:88` only checks the `activeToolKind === null` case.
- Fix, preferred: revert line 94. Fix the App.test fixture instead: click a cell with no object, or mock `/indicator/at`.
- Fix, if the product really wants "a selected tool disables event selection": implement it once in shared code (MapSurface or a shared prop rule) for both families. Update the useMapEditing.ts:236-240 comment. Add a both-family test.

## Minor

### M1. The placement Escape handler swallows Escape meant for text fields and the World context menu.
- `packages/ui/src/shared/AddEventBar.tsx:447-452` runs in window capture and calls `stopImmediatePropagation()`. It skips only aria-modal dialogs (other than the warp popup).
- It does not apply the text-field exclusion that `useWorldContext.ts:120` uses ("those use Escape locally"). It does not apply the open-context-menu exclusion (`isBlocked`) either.
- Scenario A: placement is on and the user presses Esc in a non-modal text field with its own Escape handling (SpeciesSpotlight dropdown `SpeciesSpotlight.tsx:285`, DungeonSidebar name draft `DungeonSidebar.tsx:198`). Placement cancels, and the field's own Escape never fires because propagation stopped before React's root listener.
- Scenario B: the WorldContextMenu is open over an in-context map while placing. Its bubble-phase window listener (`WorldContextMenu.tsx:57-63`) never sees Esc, so the menu stays open.
- Fix: return early for text targets (`input, textarea, select, [contenteditable]`), the same way useWorldContext does. Consider also yielding when a context menu is open.

### M2. Hover freezes while placing.
- `MapSurface.tsx:218` (`if (placing) return;` in `onMouseMove`) skips `setHover`, so the status strip and the palette follow-hover (`onHoverMetatile`) keep showing the last pre-placement cell. The user needs the cell readout most exactly while choosing where to place.
- While placing, no event drag, stroke or pan can start, because mousedown returns before any of them. Without the guard, the move would only reach `setHover`, so the guard adds nothing.
- Fix: drop the guard, or limit it to the drag/paint branches.

### M3. The `onMouseUp` guard can strand a gesture that was already in progress.
- `MapSurface.tsx:237` returns before finishing `eventDrag` or the stroke chain or `stage.endPan()`.
- Scenario: the user holds the mouse in a pencil stroke or event drag. They activate a focused Add button from the keyboard (Space), then release on the canvas. The stroke never ends (no `chain.finish`) until mouseleave or a map change, and the drag preview stays up.
- Pointer capture is not leaked, because `useStage.ts:188-193` releases it on pointerup.
- Fix: let mouseup run its normal finalisation. Placement mousedown already consumes the click, so nothing paints.

### M4. A kind that becomes disabled during placement does not cancel placement.
- `GbcMapEditing.tsx:195-198` computes `disabled`, but `useEventPlacement` never checks it.
- Scenario: GBC map with 14 objects. The user presses Add Object, then clicks Duplicate on a selected object in the inspector. The count reaches 15 and the button turns disabled but stays `aria-pressed`. The next canvas click still records `pick` for an object the map cannot hold. Task 8's dialog would then open for an impossible kind.
- Fix: clear `placing` when `disabled[placing]` becomes defined. One way is to pass `disabled` into the hook. Another is a render-phase check in the bar's host.

### M5. Magic number duplicates a core constant.
- `GbcMapEditing.tsx:196` hard-codes `15` in both the check and the message.
- Core already defines `MAX_OBJECTS` / `MAX_OBJECT_EVENTS` with the NUM_OBJECTS rationale (`packages/core/src/gbc/edit/events.ts:27`, `packages/core/src/gbc/load/events.ts:23`).
- Fix: export one constant and import it. GBA already does this through `MAX_OBJECT_EVENTS`.

### M6. Test-hygiene gaps.
- No test pins I1's rule in either direction.
- No test covers Escape with a non-popup modal open while placing. This is a real coexistence path: Toolbar `onOpenIndicator` does not clear placement on either family (MapEditingWorkspace.tsx, GbcMapEditing.tsx:171), so the Indicator dialog can sit over an active placement. The existing `:not([data-warp-popup])` branch is untested.
- `placement.test.tsx:96-97` claims to check that an out-of-bounds click does not pick. But `placing` is a fixed prop there, so the test cannot see whether placement ends. The workspace tests do not cover an out-of-bounds click either.
- `AddEventBar.tsx:425`: the disabled reason is only in `title` on a natively disabled button. Keyboard users cannot focus the button, so they cannot discover why it is disabled. This is acceptable for this task and matches the toolbar, but it is worth an `aria-describedby` or `aria-disabled` approach when Task 8 adds the in-flight and read-only reasons.

## Checked, no finding
- Pointer capture during placement: `beginCapture` on pointerdown, released by the pointerup listener (useStage.ts:188-193). No leak.
- Out-of-bounds placement click: `boundedCell` returns null, so placement stays on. Mouseup is guarded and capture is released by pointerup.
- Retirement on map, tool and active changes: render-phase owner compare (AddEventBar.tsx:438-441), the same pattern as `useVisit`. A -> B -> A is covered (placement.test.tsx:147-158).
- Stacked workspaces: the inactive `MapEditingWorkspace` (`active={false}`) renders no bar, and switching `active` clears placement. The warp-popup ownership check (`popup.contains(barRef.current)`) is correct, including when `barRef` is null.
- Listener order against World context: the layout effect registers before useWorldContext's passive effect. Pinned at placement.test.tsx:176.
- SignEditor (aria-modal) blocks placement Esc correctly.
- The old Add path was removed cleanly: no dangling `onAdd` or `onAddEvent` references in src. The CSS tokens used exist. The icons are `aria-hidden`, and the buttons have `aria-label` and `aria-pressed`.
