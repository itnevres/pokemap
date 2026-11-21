# Task 14a code-quality re-review after fix round 1

Range `7c55aba..b69360d` (f68a5ca fix, b69360d drops the redundant inactive clear). Net src change: `MapContextMenu.tsx`,
`MapSurface.tsx`, `WorldSurface.tsx`, plus `DESIGN.md`; tests in 7 files. Vitest not run (conductor: 137 files /
2,567 pass, typecheck clean). Checked against rulings R8 and R9.

## Original findings

- **I1 (Escape in-context exits the context): Resolved.** `packages/ui/src/canvas/WorldSurface.tsx:142`
  `isBlocked` now also returns true while any `.world-context-menu` is in the DOM. The capture-phase exit listener
  (`shared/useWorldContext.ts:119`) runs before the menu's bubble Escape handler removes it, so the map menu on the
  overlay is still present when the check runs: the exit is skipped, then the menu closes. Tests:
  `test/WorldCanvasContext.test.tsx` and `test/gbc/GbcWorldCanvasContext.test.tsx` "Escape on an open map context
  menu ... (F1)" (DOM double for the overlay menu; conductor reports K15, R8 removed, killed). The double has no Escape
  listener of its own, so the test checks only the exit gate, which is the logic being fixed.
- **M1 (hidden menu reappears after placing): Resolved.** `packages/ui/src/shared/MapContextMenu.tsx:27` closes an
  open menu during render while `suppressed`; `:30` opens nothing while suppressed. `MapSurface.tsx:183` passes
  `suppressed: !!placing`; the `!placing` render gate and the separate placing handler are gone (`MapSurface.tsx:286,288`),
  so the rule lives in one place. The render-phase update cannot loop: it fires only while `menu` is non-null and
  sets it null. The WorldContextMenu listeners now unmount only with the menu itself, so no stale state is left.
- **M2 (R7 test could not fail): Resolved.** `test/gba/GbaMapSurface.test.tsx` adds two R9 tests: placing then
  unplacing shows no menu, and a menu opened before placing closes and stays closed. The hook test
  (`test/shared/MapContextMenu.test.tsx`, "while suppressed ...") covers close, stays closed and no open. Conductor:
  K16 (render-phase close removed) killed. K17 (handler early return removed) I agree is equivalent. Without the
  early return, the handler's `setMenu(...)` triggers a re-render with `suppressed` still true, and `:27` retires it
  in the same render before commit, so no menu ever reaches the DOM. The only extra work is pure `cellAt`/
  `disabledReason` calls.
- **M3 (focus falls to body): Deferred by ruling.** Recorded in `packages/ui/DESIGN.md` "Map context menu" last
  bullet (Task 16). Accepted.
- **M4 (vacuous `from` assertion): Resolved.** Removed from `test/MapEditingWorkspace.test.tsx` and the same pattern
  from `test/gbc/GbcMapEditing.test.tsx`. The real `from: "map"` check stays in the blockCheck-request test.
- **M5 (DESIGN.md): Resolved.** New "Map context menu (Plan 14.2 Task 14a)" section, DESIGN.md:450-460. It matches
  the code: browser menu suppressed whenever the block editor is available, nothing opens while placing, both hints
  re-checked at choose time, map switch closes it, Escape never exits the context, and the focus gap is noted.

## New issues introduced by the fix

None at Critical or Important.

- Minor, no action needed: `WorldSurface.tsx:142` uses a document-wide `.world-context-menu` query. It would also
  block the exit for a menu that belongs to another surface. Today only the world menu and the overlay's map menu
  can exist while in context, and both should block, so no failing scenario exists. Not counted.
- Re-derived new fixtures: GBC (112,80) at origin 32, 32 px block, zoom 1 -> (80/32, 48/32) = block (2,1). Correct.
- New workspace tests checked: "active flip does not re-mount the dialog" (visit reset via
  `useVisit(active ? mapName : null)`), "keeps the active tool (R4)" asserts `setActiveToolKind` is not called, and the
  GBC "without blockEditorSpec" and "pending mutation" tests mirror the GBA ones. Each can fail for the logic it names.

Findings: Critical 0, Important 0, Minor 0 open (M3 deferred by ruling).

Verdict: Approved
