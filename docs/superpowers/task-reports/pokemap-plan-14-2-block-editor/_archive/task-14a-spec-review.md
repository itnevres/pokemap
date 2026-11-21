# Task 14a spec-compliance review (Claude Opus fallback for Codex)

Range `f013b50..7c55aba` in worktree `wt-t14a`. Read-only. I read the full src diff, the test diff, and the code it touches: `WorldContextMenu.tsx`, `MapCanvasViewport.tsx`, `MapSurface.tsx`, `cells.ts`/`view.ts`, the GBA/GBC adapters, `useVisit`, and the styles. I did not run vitest (the conductor did: 137 files / 2,557 pass). I re-derived every numeric fixture by hand.

## Fixture re-derivation (all correct)

Formula: `screenToSource = (p - pan) / zoom`, then `cell = floor((source - origin) / cellPx)`, then bounded to width x height (`cells.ts:10-24`, `view.ts:36`).

- **GBA (origin 16, cell 16, 2x2):**
  - (40,24) at zoom 1 gives (1.5,0.5), so cell (1,0).
  - Zoom 4 with pan (-20,-11) at p (140,85) gives source (40,24), so cell (1,0). Without the zoom the same pan gives source (160,96), which is (9,5) and out of bounds, so dropping zoom would disable the item. The test discriminates.
  - Border point (8,24) gives (-1,0), which returns null and the "Not a map cell" hint.
- **GBC (origin 32, block 32, event step 16, 3x2):**
  - (88,56) gives (1.75,0.75), so block (1,0). The 16 px step would give (3,1), which is the object's event coordinate. The test discriminates.
  - Zoom 4 with pan (-20,-11) at p (300,181) gives source (80,48), so block (1,0). Zoom 1 with the same pan gives (9,5), out of bounds.
  - Workspace point (112,80) gives (2,1). The 16 px step would give (5,3), which is out of bounds.

## Spec items

| Item | Status | Where / test |
|---|---|---|
| N1 hook signature, reuses `WorldContextMenu` unchanged, one item "Edit block" | Met | `shared/MapContextMenu.tsx:13-36`; `MapContextMenu.test.tsx` "right-click opens a one-item menu..." |
| `preventDefault` first, always (N4) | Met | `MapContextMenu.tsx:25`; every surface test asserts `fireEvent.contextMenu(...) === false` (border cell too) |
| Position = client - rect | Met | `MapContextMenu.tsx:27,29`. Only implicitly tested (anchor value not asserted). Acceptable: the clamping is `WorldContextMenu`'s |
| N6 open-time state: null cell gives "Not a map cell"; reason gives that hint; else enabled | Met | `MapContextMenu.tsx:28-30`; hook tests "outside the interior...", "disables the item while a mutation is pending"; GBA surface tests for border cell and reason |
| N6 choose-time re-check | Met | `MapContextMenu.tsx:31-33`; "pending at choose time blocks the edit and closes the menu" |
| `resetKey` closes; a second right-click replaces | Met (replace untested) | `MapContextMenu.tsx:19-23`; "Escape, an outside click and a resetKey change..."; GBA surface "a map switch closes the menu" |
| 2. `MapCanvasViewport.onContextMenu` | Met | `MapCanvasViewport.tsx:15,37` |
| 3. `MapSurface` props; `cellAt = paintAt` (N5); `resetKey = mapName`; `viewport = stage.viewport`; element in viewport children; no handler without `onEditBlock` | Met | `MapSurface.tsx:37-38,182-183,286,288`. The hook is called unconditionally (rules of hooks); the handler and element are gated on `onEditBlock`. Test: "without onEditBlock leaves the browser context menu untouched" (GBA surface plus GBA workspace) |
| GBC block, not quadrant; over an event overlay too | Met | GbcMapSurface "an event-quadrant click maps to its block" and "over an event overlay still edits its block without selecting the event" |
| N4 gesture safety (pointer path untouched) | Met | `MapSurface.tsx:187,284` unchanged. Both families: it.each pencil/select/sign/placing: no beginStroke/applyPaint/POST/select/pick/pan |
| 4. Threading through `MapCanvasProps`, `MapEditingCanvasProps` Pick, `GbcMapCanvasProps`, `GbcMapEditingCanvasProps` Pick | Met | `MapCanvas.tsx:42-43`, `MapEditingWorkspace.tsx:30`, `GbcMapCanvas.tsx:33-34`, `GbcMapEditing.tsx:34`. The world in-context `renderCanvas` spreads `canvasProps`, so in-context editing also gets the menu (`gba/adapter.tsx:100`, `gbc/adapter.tsx:113`) |
| R1 `blockEditorSpec` prop from the adapter; no adapter import in the workspace; no spec means no menu | Met | `gba/adapter.tsx:113,115,136`, `gbc/adapter.tsx:123,143`; the workspaces import only the type from `shell/adapter.js`. GBA test "without blockEditorSpec leaves the browser menu untouched"; **GBC untested** |
| R2 family session; GBA gated on `"blockCheck" in editSession`; no raw fetch | Met | `MapEditingWorkspace.tsx:154,253-255`; `GbcMapEditing.tsx:187,262-264`. K14 (GBA without blockCheck) survives, as the conductor noted |
| State `blockEdit`; onEditBlock/editBlockDisabledReason as specified | Met | `MapEditingWorkspace.tsx:70,154-157`; `GbcMapEditing.tsx:77,187-190`. GBA pending test uses a real `useEditSessionCore` barrier; **GBC pending wiring untested** |
| Dialog props `from="map"`, cell, spec, session, `onApplied` no-op, GBC `time` | Met | GBA "check request names the map source and the cell" (`from: "map"`, cell (1,0)); GBC "...for that block cell" (x=2,y=1) and "passes the current night time" |
| R3 render guard `forMap === mapName && active`; map switch closes | Met | Both families: "a map switch closes the dialog". Also cleared on `visit.changed` (`MapEditingWorkspace.tsx:102`, `GbcMapEditing.tsx:117`) |
| R4 menu or dialog does not clear tool or placement | Met by inspection, Untested | No code path touches `setActiveToolKind`, `setToolKind` or `placement.clear` |
| R5 no change to `shell/adapter.ts` or `Capabilities` | Met | diff --stat empty for `src/shell` |
| R6 no change to `BlockEditorDialog.tsx`, `WorldContextMenu.tsx`, CSS, core or server | Met | diff --stat empty for those paths |
| R7 placing: preventDefault, no menu | Met | `MapSurface.tsx:286,288`; GBA "while placing an event prevents the browser menu but opens no menu (R7)"; it.each "placing" rows in both families |
| Plan list: Escape, a click elsewhere and a map switch close the menu | Met | Hook test (all three) plus GBA surface map switch |
| Plan list: "zoom 3" maps to zoom 4 | Met | Canvas zoom levels are 1/2/4; zoom 4 with a pan in both families |

## Findings

### Critical
None.

### Important
None.

### Minor

1. **GBC pending-mutation wiring has no test.** At `gbc/GbcMapEditing.tsx:189` (`editBlockDisabledReason: () => hasPendingSessionMutations(mapName) ? ... : null`), deleting the line or returning `null` breaks no test. The GBC surface tests never pass a reason, and `GbcMapEditing.test.tsx` has no pending case. GBA has the real-barrier test at `MapEditingWorkspace.test.tsx` "disables Edit block while a real session mutation is pending...".
   - **Failure:** a regression lets a GBC user open the block editor mid-stroke. No test catches it.
   - **Fix:** port the GBA pending test to `GbcMapEditing.test.tsx`, using `useGbcEditSession`'s core barrier or the `hasPendingSessionMutations` seam.
2. **GBC "no spec means no menu" (D17) has no test.** The `blockEditorSpec &&` gate at `gbc/GbcMapEditing.tsx:187` is unguarded. If it is mutated to always spread, every GBC test still passes. The GBA counterpart exists.
   - **Fix:** add one "without blockEditorSpec, contextmenu is not prevented and no menu" case to `GbcMapEditing.test.tsx`.
3. **K14 survives.** `MapEditingWorkspace.tsx:154,253`: the `"blockCheck" in editSession` gate has no test. The conductor already noted this; the real session always has `blockCheck`.
   - **Fix (optional):** one test that renders the workspace with the plain `editSession` stub plus a spec and asserts the browser menu is untouched.
4. **R4 is untested.** Opening the menu or the dialog does not clear the tool or the placement. This holds by inspection, but nothing pins it.
   - **Fix:** in one workspace test, after the dialog opens, assert the pencil tool is still `aria-pressed`. Optionally do the same for an armed placement.
5. **A stale menu can reappear after placement.** `MapSurface.tsx:288` hides the element while `placing`, but the hook's `menu` state is not cleared.
   - **Failure:** the menu is open, then placement starts without a document pointerdown (only programmatic or keyboard paths exist; a toolbar click closes the menu first through outside-pointerdown). When placement ends, the old menu re-renders with its open-time cell and enabled state. The choose-time `disabledReason` re-check keeps it safe from mutations, but it is visually stale.
   - **Fix (optional):** make the element `contextMenu.element` unconditionally and have `useMapContextMenu` take a `suspended` flag that closes the menu, or clear the menu when `placing` turns on.
6. **`blockEdit` survives an `active` flip.** At `gbc/GbcMapEditing.tsx:262` and `MapEditingWorkspace.tsx:253` the dialog render is gated on `active`, but `blockEdit` is only cleared on a visit change.
   - **Failure:** if `active` goes false and back to true on the same map while a dialog is open (world-context exit and re-enter; hard to reach while the modal is up), the dialog re-mounts unasked.
   - **Fix (optional):** `if (!active && blockEdit) setBlockEdit(null)` next to the `visit.changed` block. This matches R3 as written, so it is not a spec breach.
7. **Focus is not restored after closing.** The `onClose` at `MapContextMenu.tsx:36` only calls `setMenu(null)`. DESIGN.md's World context menu section says Escape/Tab "closes and refocuses the canvas". The map stage canvas is not focusable (no tabIndex), so after Escape focus falls to `<body>`.
   - **Fix:** none is required by the 14a spec. Note it for the Task 15 DESIGN.md row.
8. **"A second right-click replaces the open menu" is untested.** The behaviour follows from the outside-pointerdown close plus `setMenu`, so this is low value.

## Mutation evidence
I ran no mutants (no vitest in this pass). The conductor reports K1..K23 with all killed except K14. From reading the tests, these pins exist:

| Logic | Pinned by |
|---|---|
| `preventDefault` | every `=== false` assertion |
| `cellAt = paintAt` versus the event grid | GBC quadrant and workspace (2,1) |
| zoom/pan in `cellAt` | the zoom 4 cases |
| null cell disables | border-cell tests |
| choose-time re-check | hook test |
| `resetKey` | hook and GBA surface |
| no handler without `onEditBlock` | GBA surface and workspace |
| R7 | GBA surface, it.each placing |
| GBC `time` | night test |
| `from` / cell | GBA blockCheck test |

Unpinned logic: findings 1-4.

Verdict: Approved
