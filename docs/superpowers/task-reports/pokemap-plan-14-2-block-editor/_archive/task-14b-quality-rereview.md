# Task 14b code-quality re-review: fix round 1 (`f035574..161c219`)

Reviewer: Claude Opus (quality pass, read-only). Single commit `161c219`, 10 files, +101/-10. I did not run Vitest. I
traced every mutation by hand. The conductor's run: typecheck pass, packages/ui 137 files, 2,595 passed, 0 failed.
Reference: fix brief `t14b-fix1-brief.md` (items F1-F8), ruling S5, and M4 deferred to Task 16.

## Prior findings

| Finding | Fix | Status | Evidence |
|---|---|---|---|
| I1: the GBA tool mapping was untested | F1 | Resolved | `test/useMapEditing.test.tsx:19-23` renders the real hook, selects `"editBlock"` with no stamp, and expects `{ kind: "editBlock" }`. If `src/hooks/useMapEditing.ts:246` is deleted, `activeTool` falls through to `null` (no stamp), so the test fails. That mutation is killed. Running it with no stamp also kills a reorder under the stamp guard. |
| M1: DESIGN.md toolbar and shortcut lists were stale | F6 | Resolved | `DESIGN.md:286-287` now lists `Edit block` and `P R B I S C G K`. |
| M2: the palette ignored pending mutations | F2, ruling S5 | Resolved | Details below. |
| M3: "never pans" was weakly pinned | F7 | Resolved | Details below. |
| M4: the tool can be selected when unwired | none | Deferred to Task 16 by ruling | Unreachable today; not re-raised. |
| M5: unused `container` | F8 | Resolved | `test/MapEditingWorkspace.test.tsx` 14b palette case. |

### M2 details (palette gated on pending mutations)

- Both `onPaletteEditBlock` callbacks now check `mapName !== null && !hasPendingSessionMutations(mapName)` before
  `setBlockEdit` (`src/components/MapEditingWorkspace.tsx:228-233`, `src/gbc/GbcMapEditing.tsx:182-187`).
- `hasPendingSessionMutations` is a module function read at call time, so `[mapName]` deps cannot go stale.
- The handler is still passed, so `preventDefault` still runs and no browser menu appears.
- The `mapName ?? ""` fallback I noted is gone.
- Tests (one per workspace) build a real pending `/block/apply` the same way the 14a case does. They assert the
  mutation is pending, then that the right-click returns `false` (default prevented) and that no `.block-editor`
  exists. The mutation is drained in a `finally` block, and the tests confirm it is no longer pending, so nothing
  leaks.
- Mutation check: drop the pending check. `setBlockEdit` then runs inside `fireEvent`'s `act`. The dialog panel
  (`.block-editor`, rendered from mount, including while loading) appears synchronously, so the test fails.
- DESIGN.md:471-473 states the rule for the map and the palette.

### M3 details (GBC drag never pans)

- The new GBC case (`test/gbc/GbcMapSurface.test.tsx:277-289`) runs mousedown, then mousemove with `buttons: 1` to
  (150,120), then mouseup. It uses no edit session.
- Mutation check: delete the `return;` at `src/canvas/MapSurface.tsx:201`. The press then reaches `stage.startPan`
  (no session), and the move calls `movePan`. `movePan` calls `updateView` (`src/canvas/useStage.ts:205-209`), which
  calls the controlled `onViewChange` (`useStage.ts:29`). The test fails, so the mutation is killed.
- The block (1,0) arithmetic checks out: floor((88-32)/32) = 1 and floor((56-32)/32) = 0.

## New code and tests

- **F5, `src/components/MetatilePalette.tsx:215-219`.** A non-primary release now returns before touching
  `dragStart`.
  - The new test leaves a left press on 0x1 stale, then sends a right release and a contextmenu on 0x9.
  - If the guard is removed, `dragStart` is 1 and 0x1 and 0x9 sit in the same folded column (rows 0 and 1, fold 2,
    proven by the existing Plan 9F case). `selectRect` then calls `onSelect`, so the test fails.
  - Side effect: a right release no longer clears a stale `dragStart`. That is harmless. The next primary mousedown
    overwrites it, and a primary release still finishes or clears it, as before.
- **F3.** The no-spec workspace cases in both families assert that `contextMenu` returns `true` and that no dialog
  opens. If `onEditBlock` were passed unconditionally, `preventDefault` would run and the call would return `false`,
  so that mutation is killed.
- **F4.** `ToolbarGbc` K test: `GBC_TOOLS` includes `editBlock` and is passed as available. If `TOOL_KEY.editBlock`
  were changed, or `editBlock` dropped from `toolsFor`, the test would fail.
- **Conductor change.** `findByRole("button", { name: "OK" })` in both palette cases is sound. The OK button exists
  only in the loaded (`info && draft`) branch, so waiting for it removes the load race without weakening the
  `request.from === "palette"` check.
- Nothing else changed: no casts, no new handlers, and no changes outside the brief's file list.

## Findings

None (no Critical, Important or Minor).

Verdict: Approved
