# Task 14b spec re-review, fix round 1 (Opus, read-only)

Range: `f035574..161c219` (one commit, `fix(plan-14.2): Task 14b fix round 1 (review findings)`), worktree `wt-t14b`.
I read the full diff and the fix brief (F1-F8), and checked the code each new test depends on (`BlockEditorDialog.tsx`
render path, `useStage.ts` pan path). I did not run vitest. The conductor reports typecheck pass and 137 files /
2,595 pass / 0 fail. As in the first review, mutation results are static: I traced each mutant by hand.

The changes stay inside the brief's allowed file list. Nothing forbidden was touched.

## Prior findings

| Finding | Fix | Status | Evidence |
|---|---|---|---|
| I1: GBA `useMapEditing` editBlock mapping was unpinned | F1 | **Resolved** | `test/useMapEditing.test.tsx` "maps the Edit block tool without a stamp (Task 14b)". It sets no stamp and expects `{ kind: "editBlock" }`. If `src/hooks/useMapEditing.ts:246` is deleted, the memo falls through to `return null`, so the test fails. Killed. |
| M1: the workspace no-spec palette branch was untested | F3 | **Resolved** | "leaves the palette browser menu untouched without a block editor spec", in both `MapEditingWorkspace.test.tsx` and `gbc/GbcMapEditing.test.tsx`. If `onPaletteEditBlock` is passed unconditionally, the cell gets an `onContextMenu` that calls `preventDefault`, so `fireEvent.contextMenu` returns `false` instead of `true`. Killed in both families. |
| M2: palette pending-mutation behaviour (now ruling S5, which replaces S3's "not gated") | F2 | **Resolved, matches S5** | Code: `MapEditingWorkspace.tsx:228-233` and `GbcMapEditing.tsx:182-187` now open nothing while `hasPendingSessionMutations(mapName)` is true. The handler is still passed, so `preventDefault` still runs and no browser menu appears. Test: "suppresses the palette menu while a session mutation is pending", in both workspace files. It builds a real pending mutation through `useEditSessionCore().post("/block/apply")`, asserts the registry flag, right-clicks, and expects `contextMenu` to return `false` and no `.block-editor`. Cleanup in `finally` resolves the reply, awaits `sessionMutationBarrier`, and asserts the flag is clear, so nothing leaks into other tests. Mutant: drop the `!hasPendingSessionMutations` check. `BlockEditorDialog` renders `.warp-modal__panel.block-editor` on its first render (`shared/BlockEditorDialog.tsx:120`, no early return), and `fireEvent` flushes the state update inside `act`, so the synchronous `toBeNull` check fails. Killed. |
| M3: K for GBC was untested | F4 | **Resolved** | `gbc/ToolbarGbc.test.tsx` "selects Edit block with K" (`GBC_TOOLS`, `keyDown "k"`, expects `"editBlock"`). |
| M4: the outside-interior test is weak | none | Accepted (no fix needed) | n/a |
| M5: a stale `dragStart` let a right release change the GBA selection | F5 | **Resolved** | Code: `MetatilePalette.tsx:215-219`, where `onMouseUp` returns unless `event.button === 0`. Test: "a right release after a stale drag never changes the selection". Hand trace: 32 ids, 8 columns, 4 rows, fold 2. 0x1 (index 1, row 0) and 0x9 (index 9, row 1) both sit before the fold, so `sameColumn` is true. Without the guard, `dragStart=1`, and mouseUp(0x9, button 2) calls `selectRect(1,9)`, which calls `onSelect`. Killed. |
| M6: the tool can be selected while unwired | none | Deferred to Task 16 by ruling | n/a |

## Other fix items
- **F6 (DESIGN.md)**: the Toolbar (D5) label list now ends with `Edit block`, and the Shortcuts (R1) bullet reads `P R B I S C G K` (`DESIGN.md:286-287`). The 14b section now says nothing opens from the map or the palette while a mutation is pending, and the interior rule applies to the map tool only (`DESIGN.md:471-473`). Accurate.
- **F7 (GBC drag never pans)**: `gbc/GbcMapSurface.test.tsx` "does not pan when dragging with the Edit block tool".
  - Fixture: (88,56) maps to block (floor(56/32), floor(24/32)) = (1,0). Correct.
  - Mutant: drop the `return` in `MapSurface.tsx`'s editBlock branch. With no edit session, `onMouseDown` falls through to `stage.startPan`. The `buttons: 1` move then reaches `stage.movePan` (`useStage.ts:205-209`), which calls `updateView`, then the controlled `onViewChange`, so the test fails. Killed.
  - It also pins a single `onEditBlock({x:1,y:0})` across the drag.
- **F8**: the unused `const { container } =` is removed. Done.
- **Unrequested but harmless**: in both workspace palette tests, `fireEvent.click(screen.getByRole("button", { name: "OK" }))` became `fireEvent.click(await screen.findByRole(...))`. This waits for the button rather than loosening any assertion. It is outside the "change existing cases only where named" rule, but it is a de-flake, not a weakening. Noted, no action.

## Correctness of the new code
- The GBA callback's `mapName !== null` check repeats the prop gate (`MapEditingWorkspace.tsx:246`). That is harmless and removes the old `mapName ?? ""` placeholder.
- `hasPendingSessionMutations` is a module-level registry read at click time, so the `[mapName]` deps are correct and no stale closure is possible.
- The GBC callback reads the same way. The palette only renders with a map, so `mapName !== null` always holds there.
- The S5 behaviour now matches the canvas tool and the 14a map menu: the user gets no feedback, nothing opens, and no browser menu appears. That matches the ruling's wording.

## Findings
- Critical: none.
- Important: none.
- Minor: none new. (The `findByRole` change noted above is acceptable.)

Verdict: Approved
