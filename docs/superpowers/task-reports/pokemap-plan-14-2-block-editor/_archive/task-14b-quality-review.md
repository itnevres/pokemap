# Task 14b code-quality review (Plan 14.2, Edit block tool / capability / palette right-click)

Reviewer: Claude Opus (quality pass, read-only). Range `824680f..HEAD` in worktree `wt-t14b` (tests `2183216`,
implementation `f035574`), `packages/ui` only. Vitest was NOT run (test lock held elsewhere; conductor reports
typecheck pass, 137 files / 2,587 pass / 0 fail). All mutation verdicts below come from tracing the code by hand.

## What I checked, independently

- **MapSurface gesture safety** (`src/canvas/MapSurface.tsx:184-250`). Mousedown order is: `button !== 0` return,
  then `placing || sign`, then the new `editBlock` branch (198-202), then event selection, dropper, stroke and pan. The
  editBlock branch always returns, so it never reaches `eventDrag`, `chain.start` or `stage.startPan`.
  - Mouse move with the tool: `placing` false, `eventDrag` null, the pencil/collision trail check fails, and
    `panning.current` is false. Only the status-strip hover readout (`setHover`) updates. No paint preview and no
    stroke.
  - Mouse up: `eventDrag` is null. `finishStroke` returns early because the chain is not open. `endPan` releases
    capture. Nothing is posted.
  - Right-click with the tool: `button !== 0` returns, then the 14a contextmenu opens the map menu, which is correct.
  - Opening the dialog on mousedown: the dialog's backdrop closes on **mousedown** only
    (`shared/BlockEditorDialog.tsx:117`). It mounts after the opening press, so the press cannot close it. The
    `pointerdown` handler already set capture, so the matching mouseup still reaches the canvas.
  - The cell mapping is `paintAt`, the same function the 14a menu gets as `cellAt` (lines 175-177). Not the
    event-step grid.
- **Palette drag-select** (`components/MetatilePalette.tsx:212-220`). A right press no longer sets `dragStart`. On
  right release, `dragStart` is null, so `selectRect` does not run. Browsers send `auxclick` for a right click, not
  `click`, so `selectSingle` does not run either. The GBC palette has no mousedown or drag handler. Correct.
- **React state.** `onPaletteEditBlock` is `useCallback([mapName])` and closes over only the stable `setBlockEdit`,
  so it has no stale closure. The memoised palettes get a stable `onEditBlock` (the gating expression yields the same
  function or `undefined`). The `mapName ?? ""` fallback is unreachable in GBC (the palette only mounts when
  `mapName !== null`). In GBA the prop is gated on `mapName !== null`. Even if reached, `forMap: ""` can never match
  the dialog's `blockEdit.forMap === mapName` with a truthy `mapName`, so it is inert. Map-switch retirement is
  unchanged.
- **Shortcut K.** No other `k` / `KeyK` handler exists under `packages/ui/src` (grep for key literals, `e.code` and
  key tables). The Toolbar handler resolves through `TOOL_KEY`, and `shortcutBlocked` covers modals and text targets.
- **Accessibility.** There is no `TOOL_ACCESSIBLE_NAME` entry, so the accessible name is the visible label "Edit
  block". The icon goes through `svg()`, which carries `aria-hidden="true" focusable="false"`. The path stays inside
  the 16-unit viewBox. A ContextMenu key or Shift+F10 on a focused palette cell fires `contextmenu`, so the keyboard
  can reach the palette entry point too.
- **Types.** No new casts. The `activeTool` unions, `GbcActiveTool` and `ToolKind` widened consistently.
  `Record<ToolKind, ...>` tables (`TOOL_LABEL`, `TOOL_KEY`, `TOOL_ICONS`) would fail typecheck if an entry were
  missing.
- **GBC toolbar width.** `.toolbar__tools` is a non-wrapping flex group (`styles.css:2365-2370`) inside a wrapping
  `.toolbar`. One more button grows the group by one button width. That is linear growth of the known 720 px issue,
  not a new structural cause. No finding.
- **Mutation tracing of the new tests** (by hand):
  - Deleting the editBlock branch kills `MapSurface.test` "a drag with the tool paints nothing" (`beginStroke`).
  - Using `eventAt` instead of `paintAt` kills the GBA test ((3,3) vs (1,1)) and the GBC quadrant test ((3,1) vs
    (1,0)).
  - Dropping `cell &&` kills "outside the interior" (`onEditBlock(null)`).
  - Dropping the disabled-reason check kills "pending mutation".
  - Moving the branch above `placing` kills "event placement takes precedence".
  - Dropping `event.button === 0` in the GBA palette kills "a right press never changes the selection". The existing
    Plan 9F test proves a 0x1 -> 0x9 drag selects.
  - Removing `preventDefault` kills the `fireEvent(...) === false` checks.
  - Dropping the `toolsFor` filter kills `adapter.test` "drops Edit block without blockEditor".
  - Removing `from={blockEdit.from}` kills both workspace palette tests (`request.from === "palette"`).
  - Removing the GbcMapEditing `"editBlock"` mapping kills the GBC workspace tool test, which clicks the real toolbar
    button.

## Findings

### Important

**I1. The GBA toolbar-to-canvas mapping for the tool has no test that can fail.**
`src/hooks/useMapEditing.ts:246`: `if (activeToolKind === "editBlock") return { kind: "editBlock" as const };`
- The GBA workspace test "the Edit block tool opens the dialog for the clicked cell"
  (`test/MapEditingWorkspace.test.tsx:437-458`) builds `editing` with
  `makeEditing({ activeTool: { kind: "editBlock" } })`. That injects the canvas `activeTool` directly through the
  mock and bypasses `useMapEditing`. The toolbar click only checks `setActiveToolKind("editBlock")`, a `vi.fn()`.
- `test/useMapEditing.test.tsx`, `App*.test.tsx` and `MapEditingWorkspaceActive.test.tsx` contain no `editBlock`.
- Failure scenario: delete line 246 (or map it to `null`, or reorder it under a stamp check). Every test still
  passes. In production, the GBA user presses K or clicks "Edit block": the button shows pressed, `activeTool` resolves
  to `null`, and a canvas click falls into the no-tool path. That path selects or drags an event, otherwise it pans.
  The dialog never opens. Event selection with this "tool" active is exactly what N10 forbids.
- GBC has the equivalent coverage because its test drives the real `GbcMapEditing` state.
- Fix: add a `useMapEditing.test.tsx` case. Call `setActiveToolKind("editBlock")` and expect
  `activeTool` to equal `{ kind: "editBlock" }`, with and without a `currentStamp`. Alternatively, cover the GBA path
  with the real hook (as `MapEditingWorkspaceActive.test.tsx` does) by selecting the tool through the toolbar and
  clicking the canvas.

### Minor

**M1. DESIGN.md Toolbar and Shortcuts bullets are now stale.** `packages/ui/DESIGN.md:286-287`.
- The Toolbar bullet still lists the labels as `Pencil ... Sign`, and the Shortcuts bullet (R1) still reads
  `P R B I S C G`. The new section at about line 462 states key K, but the canonical R1 list contradicts it.
- Scenario: a later task checks shortcut conflicts against R1, sees K as free, and binds it to something else.
- Fix: add `Edit block` to the label list and `K` to the R1 list.

**M2. The palette entry point ignores the pending-mutation guard that both map entry points apply.**
`src/components/MapEditingWorkspace.tsx:228-231,244` and `src/gbc/GbcMapEditing.tsx:182-185,247`.
- The canvas tool and the 14a menu refuse while `hasPendingSessionMutations(mapName)` ("Wait for the current change to
  finish"). A palette right-click opens the dialog unconditionally.
- Scenario: a pencil stroke or undo is still in flight, and the user right-clicks a palette cell. The dialog loads
  block info with the pre-mutation revision. OK then sends check/apply against a revision about to be superseded. The
  server's revision check should refuse it, so the cost is a confusing error, not corruption.
- The brief's binding spec does not ask for the guard, so this is an inconsistency, not a spec breach.
- Fix (conductor's call): either skip `onEditBlock` while pending, or record in DESIGN.md that the palette is
  deliberately unguarded and the dialog's revision check covers it.

**M3. "Never pans" is only weakly pinned.** `test/gbc/GbcMapSurface.test.tsx` (the zoom-4 case,
`onViewChange).not.toHaveBeenCalled()`).
- That case does mousedown then mouseup with no movement, and no `editSession` is passed. Pan without a move never
  calls `onViewChange`, so the assertion cannot fail.
- Mutation: delete `return;` at `src/canvas/MapSurface.tsx:201`. Both GBC surface tests still pass: they fall through
  to `startPan`, with no move and no POST. The mutation is killed only in the GBA `MapSurface.test` drag case, and
  only because that fixture has an edit session (`beginStroke`).
- A no-session canvas, such as read-only navigation with the tool still selected, is not covered.
- Fix: in the GBC case, add a `mouseMove` with `buttons: 1` between down and up, then assert no `onViewChange` / pan.

**M4. The tool is selectable when the dialog is not wired.** `src/shell/adapter.ts:34` versus the
workspaces' `blockEditorSpec && "blockCheck" in session` gate.
- `availableTools` is driven only by `blockEditor` capability, so without a spec or with a session lacking
  `blockCheck`, "Edit block" is enabled but every click is a silent no-op. That is the "clickable-but-silently-inert"
  pattern `Toolbar.tsx:41-49` warns against.
- It is unreachable today: both adapters always pass `blockEditorSpec`, and both session hooks expose `blockCheck`.
- Fix (optional): remove `editBlock` from `availableTools` when the wiring condition is false.

**M5. Unused destructure.** `test/MapEditingWorkspace.test.tsx:411`: `const { container } = render(...)` is never
read in the palette test. Cosmetic.

## Observation (not a finding)

- macOS Ctrl+click sends mousedown with `button: 0` plus `contextmenu`.
  - Palette: the dialog opens and a zero-length drag starts, which selects nothing on mouseup.
  - Canvas: the tool opens the dialog on mousedown, and the 14a `contextmenu` then fires while the modal is open.
  - Other tools behave the same way (pencil paints, then the menu opens), so this is not new to 14b. Worth one live
    check on a Mac later.

## Verdict

Correctness of the shipped behaviour is sound in both families. The open item is test coverage, not behaviour: I1
leaves the GBA production wiring line for the tool unguarded by any test that can fail.

Verdict: Needs changes
