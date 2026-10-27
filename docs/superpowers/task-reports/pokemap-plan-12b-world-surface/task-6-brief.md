# Plan 12b Task 6 brief: `WorldSurface` interaction and commits (High)

You are the implementer. Work only in this worktree. Do not run vitest, npm, or vite: the sandbox cannot (esbuild "Access is denied"). The conductor runs every check. Do not commit.

## Read first (in this order)

1. `docs/superpowers/plans/2026-10-26-pokemap-plan-12b-world-surface.md`: Global Constraints, Review Focus, and **Task 6** (the behaviour paragraph and the Step 1 test list are your spec; Step 3's mutation matrix tells you what each test must catch).
2. `docs/superpowers/specs/2026-10-24-pokemap-plan-12-shared-canvas-core-design.md`: rulings P12-3, P12-4a, c, d, i, n, o, p, q, r, s, t, u, P12-6, P12-7, and "What stays per family".
3. `docs/superpowers/task-reports/pokemap-plan-12b-world-surface/ledger.md` sections 1-2 (where each behaviour lives in both canvases today).
4. The Task 5 code you extend: `packages/ui/src/canvas/WorldSurface.tsx`, `canvas/worldSurfaceAdapter.ts`, `test/canvas/WorldSurface.test.tsx` (fixture and fake adapter style to copy).
5. The hooks you wire: `canvas/useWorldDrag.ts` (Task 4; API at its top, not yet wired), `canvas/useStage.ts` (`startPan/movePan/endPan/hasCapture`, `onCancel`), `canvas/worldView.ts` (`screenToWorld`, `worldToScreen`, `warpPoint`, `warpHit`, `WARP_HIT_RADIUS`, `hitPlacement`, `rectOf`, `zoomWorldAboutPivot`), `shared/placementLedger.ts`.
6. The two sources, at the ledger's line ranges: `components/WorldCanvas.tsx` (GBA) and `gbc/GbcWorldCanvas.tsx` (GBC). Port behaviour from them; do not edit them (Tasks 7-8 do).

## Scope

Modify `packages/ui/src/canvas/WorldSurface.tsx` and `canvas/worldSurfaceAdapter.ts`. Create `packages/ui/test/canvas/WorldSurfaceInteraction.test.tsx` (fake adapter, same style as `WorldSurface.test.tsx`; copy its fixture rather than importing from another test file). `WorldSurface.test.tsx` must pass unchanged; if a Task 5 test genuinely needs a change, stop and say why in your notes instead of changing it.

Implement every item of the plan's Task 6 behaviour paragraph: `useWorldDrag` wired (the `// Task 6:` markers in WorldSurface.tsx show where); selection set, click, Ctrl/Cmd toggle, marquee, Escape; warp-marker click selects nothing (P12-4o, radius `WARP_HIT_RADIUS` screen px); double-click (Edit-here handler when given, else `onOpenMap`, P12-4c; on a warp marker it opens the warp popup); canvas keys (P12-4n, as `GbcWorldCanvas.tsx:1132-1159`, including context-mode zoom stepping); right-click context menu at the pointer; commits through the ledger (one POST per moved map, each outcome caught separately, ONE reload after every POST of the gesture has settled, then `onPlacementsSaved` with the names that succeeded); Unplaced-rail drop onto the canvas through the same path; dungeon toggle POST, reload, `onLayoutChanged`; warp markers and connection lines with the P12-4r fetch scope and P12-4s retry, the warp alert (P12-4d, GBC's DOM), and the adapter-owned request/validation/endpoint resolution; rail hidden in context mode (P12-7); encounter sprite tooltip clamped inside the viewport (P12-7, left and right); hover status (`WorldStatus.hover` widened from `null`).

Adapter widening: add what the plan's adapter field list names for this task (`postPlacement`, `postDungeons`, `warpOffset`, `fetchWarps`, the warp popup content, save-error policy) plus `WorldData.move` use. Keep names close to the plan's. Adapter fields stay typed with the `W` generic (`W extends SurfaceWorld<P, C>`), so a family can reach its own world data without a cast.

### Family differences that stay per family (adapter facts, no `family` branch in `canvas/`)

- Save-error lifecycle: GBA one dismissible `saveError` (`WorldCanvas.tsx:410-418`, `:1469-1503`); GBC per-post guarded errors (`GbcWorldCanvas.tsx:972-1007`). Keep both observable behaviours.
- Filter selection/drop guards (`WorldCanvas.tsx:1831-1848`; `GbcWorldCanvas.tsx:561-565`, `:1283-1295`). Keep both.
- Carry-forwards from the Task 5 spec review, decide a slot for each: GBA wraps its toasts in `div.world-canvas__toasts` (conflict, save, reload toasts stack), GBC has no wrapper; GBC's save/reload error toolbar groups sit AFTER `EncounterFetchAlert` (`GbcWorldCanvas.tsx:1171-1183`), which the single `toolbarExtras` slot (before the alert) cannot express; GBA adds the stage class modifier `--dragging-map` during a map drag (`WorldCanvas.tsx:1811`).
- Filtered jump: the surface reveals only when unfiltered (Task 5 brief rule 8, ruled). Do not change it.
- Any other difference you find: keep each family's behaviour as an adapter fact and list it in your notes. Do not unify it.

## Rules

- No `gba|gbc|family` branch in `canvas/` (`rg -n -i 'gba|gbc|family' packages/ui/src/canvas` must show nothing new outside comments).
- One projection (P12-6): every new overlay (warp markers, connection lines, marquee, tooltips) projects through `worldView.ts`, never its own `x*zoom+pan`.
- Ledger: `ledger.begin`/version before the first optimistic move (`useWorldDrag` already does this for drags; the rail drop must do it too). A POST that resolves after a newer drag of the same map must not roll it back.
- Async tests use deferred promises the test resolves by hand and bounded `act` loops; never a DOM-mutating probe in `waitFor`. "Reload once" is counted through a `vi.mock`-style spy on the fake world hook's `reload`, never by GET counts.
- Every expected number in a test is a hand-derived literal with the derivation in a comment. Production code never supplies an expected value.
- Moved code keeps its rationale comments, shortened if needed, placed above the code they explain (never parked above a short wrapper).
- Style: one statement per line, JSX one element per line, lines ≤ 140 chars, no crammed `a; b; c` lines, no BOM, CRLF line endings. Match the surrounding comment density.
- Never add `key={url}` or any key-based remount for images.
- Do not touch `packages/ui/src/components/WorldCanvas.tsx`, `gbc/GbcWorldCanvas.tsx`, or any existing test file.

## Deliverable

Code plus tests covering every Step 1 item, and `docs/superpowers/task-reports/pokemap-plan-12b-world-surface/task-6-impl-notes.md`: files touched, adapter fields added and why, each family difference kept and how, the four carry-forward slot decisions, each Step 1 test → test name, anything you could not do. Plain sentences.
