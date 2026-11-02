# Plan 13 Task 5 brief: warp markers open the shell popup; previews removed (implementer)

Repo: PokeMap, React 19 + TypeScript map editor; GBA and GBC families share one shell (`shell/FamilyApp.tsx`) and one
world canvas core (`canvas/WorldSurface.tsx`). You work in this git worktree only. Binding docs (read these sections):
- Plan `docs/superpowers/plans/2026-10-28-pokemap-plan-13-warp-popups.md`: "Global Constraints", "Review Focus", "Task 5"
  (Files, Interfaces, Step 1 are the contract).
- Spec `docs/superpowers/specs/2026-10-28-pokemap-plan-13-warp-popups-design.md`: items 1-2 and 10.
Task 4 already built the popup: `ShellSlots.openWarpDestination(name)` (shell/adapter.ts), `useWarpPopup`, `WarpPopup`,
and `packages/ui/test/shell/warpPopup.test.tsx` (it opens the popup by calling captured `slots.openWarpDestination`;
read its setup helpers and reuse them for the end-to-end tests). Do not change Task 4 code.

## Build
1. `canvas/WorldSurface.tsx`: add `onOpenWarpDestination?(map: string): void` to the props. In the double-click handler
   (find `setWarpPopup`), a resolved marker with a destination map: clear `failedWarps` (as today) and call
   `onOpenWarpDestination(map)` instead of `setWarpPopup`. Unresolved marker: unchanged (`adapter.unresolvedWarpError`).
   Shift+double-click: unchanged. Delete the `warpPopup` state and its render line (`adapter.renderWarpPopup?.(...)`).
2. `canvas/worldSurfaceAdapter.ts`: delete `renderWarpPopup` from the adapter interface. `gba/worldSurface.tsx` and
   `gbc/worldSurface.tsx`: delete their `renderWarpPopup` entries and the now-unused imports.
3. `gba/adapter.tsx`, `gbc/adapter.tsx`: in `renderWorld` and `renderDungeon`, pass
   `onOpenWarpDestination={s.openWarpDestination}` to the world surface (follow how other slot callbacks are passed;
   the prop may need threading through the family world component's props - keep it minimal).
4. Delete `gbc/GbcWarpDestinationModal.tsx`, `components/WarpDestinationModal.tsx` and
   `test/WarpDestinationModal.test.tsx` once nothing imports them (`grep -rn "import.*WarpDestinationModal" packages`).
   Keep the CSS classes in styles.css (other dialogs reuse `warp-modal__*`). Comments elsewhere that mention
   WarpDestinationModal as a precedent may stay.

## Tests (write first, see them fail, then implement)
- Surface: double-click on a resolved marker calls `onOpenWarpDestination(map)` and renders no dialog of its own;
  unresolved marker still shows its alert.
- End-to-end per family (GBA and GBC) through the real FamilyApp, in World mode AND Dungeon mode: double-click a warp
  marker on the world canvas -> the popup (`[data-warp-popup]`) opens with the destination's workspace. Put these in
  `test/shell/warpPopup.test.tsx` (new describe) or a new `test/shell/warpMarker.test.tsx`.
- Replace the existing tests that pinned the old preview modal (search `warp-modal`, `WarpDestinationModal`,
  `renderWarpPopup`, `Warp destination` in `test/WorldCanvas.test.tsx`, `test/gbc/GbcWorldCanvas.test.tsx`,
  `test/gbc/GbcWorldCanvasContext.test.tsx`, `test/canvas/WorldSurfaceInteraction.test.tsx`) with the new behaviour
  (assert `onOpenWarpDestination` was called with the map, no own dialog). Name each replaced test in the report.
  Do not edit any other existing test, and never weaken an assertion that is not about the preview modal.
- The repo has NO jest-dom: plain DOM reads only. Build every case; no `it.todo`, no `it.skip`.

## Verify (allowed commands; run from the worktree root, one at a time)
- `npx vitest run packages/ui/test/shell packages/ui/test/canvas packages/ui/test/WorldCanvas.test.tsx packages/ui/test/gbc`
  -> 0 failed.
- `npx vitest run packages/ui --maxWorkers=4 --minWorkers=1` -> 0 failed (baseline: 2,101 passed in 126 files, minus the
  deleted WarpDestinationModal test file, plus your new tests).
- `npx tsc --noEmit -p packages/ui/tsconfig.json` -> no errors.
Paste the real result lines into the report. If anything fails, keep working; never claim done on a red run.

## Rules
- CRLF line endings in every file you edit or create (check: the existing files are CRLF); added lines <= 140 chars;
  ASCII only; no BOM. Prefer small edits over whole-file rewrites. Match surrounding style and comment density; never
  delete unrelated comments.
- Touch only the files named here plus strictly needed support files (list them). No new dependencies. You cannot commit.
- Report unrelated failing tests or bugs; do not fix them.

## Report
Write `docs/superpowers/task-reports/pokemap-plan-13-warp-popups/task-5-report.md` (CRLF, lines <= 140): files changed and
deleted, tests added and replaced (one line each with family coverage), verify output lines, anything unresolved.
