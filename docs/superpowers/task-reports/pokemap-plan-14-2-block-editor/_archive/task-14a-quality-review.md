# Task 14a code-quality review (Claude Opus fallback for Codex)

Worktree `wt-t14a`, range `f013b50..7c55aba` (4 commits; 9 src files, 5 test files). Read: full src diff,
`WorldContextMenu.tsx`, `AddEventBar.tsx` (`useEventPlacement`), `BlockEditorDialog.tsx` focus/Escape code,
`dialogFocus.ts`, `useWorldContext.ts` Escape exit, `WorldSurface.tsx` menu wiring, both family adapters'
in-context `renderCanvas`, `DESIGN.md` (World context menu, In-context editing), and all new tests.
Vitest not run (per brief; conductor reports 137 files / 2,557 pass, typecheck clean). Fixture arithmetic in the new
tests was re-derived by hand and is correct (GBA (40,24)->(1,0); zoom 4 pan (-20,-11) p=(140,85)->src (40,24)->(1,0);
border (8,24)->(-1,0) bounded null; GBC (88,56)->block (1,0) vs event step (3,1); GBC zoom 4 (300,181)->src (80,48)->(1,0)).

## Important

### I1. Escape with the map menu open during in-context editing exits the context (both families)
- `packages/ui/src/canvas/MapSurface.tsx:286-288` + `packages/ui/src/shared/useWorldContext.ts:119` +
  `packages/ui/src/canvas/WorldSurface.tsx:140`.
- The in-context overlay is `<MapCanvas {...canvasProps} chromeless .../>` (`gba/adapter.tsx:100-101`) and
  `<GbcMapCanvas {...canvasProps} chromeless .../>` (`gbc/adapter.tsx:109-110`). `canvasProps` now carries
  `onEditBlock`, so the map context menu opens on the overlay canvas.
- `useWorldContext` registers a **capture-phase** window `keydown` that calls `onExitRequest()` on Escape unless
  `defaultPrevented`, `isBlocked()` (WorldSurface wires it to `contextMenu.menu !== null`, i.e. only the WORLD
  menu), an `aria-modal` exists, or the target is a text field. `WorldContextMenu`'s Escape handler is a
  bubble-phase window listener, so it runs after.
- Scenario: World view, in-context editing map Foo -> right-click a block on the overlay -> menu opens, focus on
  "Edit block" (a button) -> press Escape. Capture listener: not prevented, world menu null, no modal, target is a
  button -> `requestExitContext()` runs (clean session: leaves context; dirty session: the Save dialog opens). Then
  the bubble listener closes the menu. The user asked to close a menu and got the exit flow instead.
- This breaks DESIGN.md "In-context editing ... Exits": "Escape (a capture-phase window listener) is ignored when
  ... a context menu or a modal dialog is open". Same class of bug R7 was written to avoid for event placement.
- No test covers the in-context path; `MapContextMenu.test.tsx:87-99` only proves ordering against a LATER bubble
  listener, not an earlier capture listener.
- Fix (needs a conductor ruling since R6 limits file scope; `WorldContextMenu.tsx` itself need not change):
  extend the world-context block check to any open menu, e.g. in `WorldSurface.tsx:140`
  `isBlocked: () => contextMenu.menu !== null || document.querySelector(".world-context-menu") !== null`
  (or the same DOM check inside `useWorldContext`'s listener). Add a test: in-context host, open the map menu,
  Escape -> menu closed, `onExitRequest` not called.

## Minor

### M1. Conductor's concern confirmed but narrow: a menu hidden by `placing` reappears when placing ends
- `packages/ui/src/canvas/MapSurface.tsx:288` hides `contextMenu.element` while `placing`; the hook's `menu` state
  (`shared/MapContextMenu.tsx:18`) is untouched, and unmounting `WorldContextMenu` also drops its outside/Escape
  listeners.
- Reachability: placing starts only from an `AddEventBar` button. A mouse click there first fires a document
  `pointerdown` outside the menu, which closes it; keyboard focus is in the menu and Tab closes it. So the
  ordinary paths are safe. It IS reachable when the bar button is activated by a `click` with no `pointerdown`
  (screen-reader browse-mode activation, `element.click()`): menu open -> click "Add Object" -> menu hidden, state
  kept -> place the event (pick) or press Esc -> `placing` null -> the stale menu remounts at its old anchor with
  the open-time enabled/hint state, and its mount effect focuses "Edit block", which can pull focus away from the
  `AddEventDialog` that the pick just opened.
- Fix: close rather than hide, e.g. give the hook a `suppressed: boolean` option (or have MapSurface call a
  returned `close()`) and, during render, `if (suppressed && menu) setMenu(null)`; then the `!placing` render gate
  and the separate placing handler become a single rule in the hook.

### M2. The R7 tests cannot fail for the handler-side guard (test gap behind M1)
- `test/gba/GbaMapSurface.test.tsx:379, 411-415` and the GBC `placing` row assert only "preventDefault and no
  `menu` role". Mutant: `MapSurface.tsx:286` -> `onContextMenu={onEditBlock ? contextMenu.onContextMenu : undefined}`
  (drop the placing branch). The handler now sets menu state while placing, but `!placing` at :288 hides it, so
  both assertions still pass (mutant survives by reasoning; not executed). Its user-visible effect is exactly M1:
  the menu appears when placing ends. Add a step: right-click while placing, then rerender with `placing: null`,
  expect no `menu`.

### M3. Focus lands on `<body>` after the menu or the dialog closes
- `shared/MapContextMenu.tsx:36` `onClose={() => setMenu(null)}` does not refocus anything (DESIGN.md World menu:
  "Escape or Tab closes and refocuses the canvas"; `WorldContextMenu`'s doc says the caller's `onClose` refocuses).
  The map stage canvas has no `tabIndex` (`MapCanvasViewport.tsx:29`), so there is no canvas to refocus today.
- Choose "Edit block": `useRestoreFocus` captures `document.activeElement` (the menu button) during the dialog's
  first render; the same commit unmounts the menu, so on dialog close the opener is disconnected, the chain has no
  previous entry, and focus stays on `<body>`. Keyboard users then Tab from the document start.
- Fix (or record as accepted until 14b's K tool gives a keyboard route): make the hook's `onClose` focus a stable
  element (the canvas with `tabIndex={-1}`, or the viewport/section), and focus that same element before calling
  `onEditBlock` so the dialog's opener is connected.

### M4. Vacuous assertion
- `test/MapEditingWorkspace.test.tsx:316`
  `if (requests[0]!.searchParams.has("from")) expect(...).toBe("map");` can never fail when `from` is absent. The
  real `from` check is the next test (`blockCheck` request). Delete the line or assert the intended shape
  unconditionally.

### M5. DESIGN.md not updated for the new menu
- No DESIGN.md entry for the map-canvas "Edit block" menu (single item, disabled hints "Not a map cell" / "Wait for
  the current change to finish", suppressed while placing, browser menu untouched without `onEditBlock`). If the
  plan puts that doc update in 14b, ignore; otherwise add a short section beside "World context menu".

## Checked, no finding
- Hook: `latest` ref avoids stale `cellAt`/`disabledReason`/`onEditBlock`; `onSelect` re-checks `disabledReason()`
  (N6) and `WorldContextMenu` closes after; `resetKey` render-phase reset is the documented "adjust state during
  render" pattern; a second right-click replaces the menu (new `menu` object re-runs position and focus effects).
- Gesture safety (N4): pointer path unchanged (`onPointerDown` forwards button 0 only; `onMouseDown` returns on
  `button !== 0`); `contextmenu` handler never touches stroke/selection/pan state. `paintAt` reused, no new
  formula (N5); GBC answers the 32 px block.
- World host: the world canvas's own `onContextMenu` is on its `<canvas>`, a sibling of the overlay, so a
  right-click on the overlay does not also open the world menu.
- Dialog mount: gated on `forMap === mapName && active && spec && "blockCheck" in session`; `visit.changed` also
  clears `blockEdit` (both families); no adapter import cycle; R5/R6 respected (no `adapter.ts`,
  `WorldContextMenu.tsx`, `BlockEditorDialog.tsx`, CSS changes). Casts `as ... & BlockEditSession` follow the
  existing `createEvent` pattern after the `in` guard. `MapCanvasProps`/`GbcMapCanvasProps extends
  EventPlacementProps` is a type-only correction for props already passed through.
- R4: nothing in the new paths clears the active tool or placement.

Mutation: not executed (sandbox, per brief). M2 names one surviving mutant by reasoning; the other new tests
(zoom/pan cell, border-ring hint, pending hint, choose-time re-check, resetKey close, no-handler-without-onEditBlock)
each pin a distinct branch and would fail if that branch were removed.

Findings: Critical 0, Important 1, Minor 5.

Verdict: Needs changes
