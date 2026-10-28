# Plan 12b Task 8 brief: GBA world canvas onto `WorldSurface` (High)

You are the implementer. Work only in this worktree. Do not run vitest, npm, or vite: the sandbox cannot (esbuild "Access is denied"). The conductor runs every check. Do not commit.

## Read first (in this order)

1. `docs/superpowers/plans/2026-10-26-pokemap-plan-12b-world-surface.md`: Global Constraints, Review Focus, and **Task 8** (your spec). Tasks 5-7 explain the surface you plug into.
2. `docs/superpowers/specs/2026-10-24-pokemap-plan-12-shared-canvas-core-design.md`: rulings P12-4a, c, d, e, i, j, m, n, o, p, q, r, s, t, u, P12-5, P12-6, P12-7, and "What stays per family".
3. `docs/superpowers/task-reports/pokemap-plan-12b-world-surface/_archive/task-6-impl-notes.md` (every adapter field; GBA defaults) and `_archive/task-7-impl-notes.md` plus `_archive/task-7-report.md` (how GBC was moved; the new facts `borderNeighbours` and `shiftClickSelects`).
4. `packages/ui/src/canvas/WorldSurface.tsx`, `canvas/worldSurfaceAdapter.ts` (the contract), `test/canvas/WorldSurface*.test.tsx`.
5. `packages/ui/src/gbc/worldSurface.tsx` and `gbc/GbcWorldCanvas.tsx`: the finished GBC adapter and wrapper. Copy their shape.
6. `packages/ui/src/components/WorldCanvas.tsx` (the code you move) and `gba/mapSurface.tsx` (12a's GBA map adapter: style for a GBA adapter file).

## Scope

- Create `packages/ui/src/gba/worldSurface.tsx`: the GBA `WorldSurfaceAdapter`. 16 px tile `nativePx`, GBA render URLs, `useWorld` wrapping a new `useGbaWorld` hook that holds today's fetch and reconciliation (`WorldCanvas.tsx` around lines 509-567) **with the ledger snapshot taken before any React state updater** (today's `:535-539`), placement POST, dungeon POST, `drawnByDefault` (today's `:243`), warp offset `w.x` tiles (factor 1), `fetchWarps` with `destWarpId` endpoint resolution, the vertical-link triangle layer (`drawTriangle`) as `drawExtraLayers`, the GBA conflict tooltip, encounter fetch with `summariseGba` and level colours, status items exactly as today (placed/hidden/unplaced/conflicts/accepted counts; hover map, component size or "manual placement (unknown component)", the "Shift+drag to move" hint; the "Hover the world…" placeholder), toolbar extras exactly as today's DOM.
- GBA keeps every adapter default named in Tasks 6-7: `saveErrorPolicy: "dismissible"`, `wrapToasts` (div.world-canvas__toasts), `draggingMapClass` (`--dragging-map`), default `overlayOrder`, default `dropSize` (no filter guard), no `pruneSelectionOnFilter`, no `modifiedDoubleClick`, `borderNeighbours` default ("drawn"), `shiftClickSelects` default (false). Group-drag membership has no filter guard.
- Rewrite `packages/ui/src/components/WorldCanvas.tsx` as a thin wrapper: **same export name, same props type (`WorldCanvasProps`, `WorldCanvasContext` stay exported)**, renders `WorldSurface` with the adapter. Props-dependent pieces are built in the wrapper with `useMemo` or passed as surface props; engine facts belong on the adapter, never on surface props.
- `drawDiamond`, `levelColorMap`, `themedLevelColorMap` move to a new `packages/ui/src/canvas/worldColours.ts` (no family branch; keep their comments). `canvas/WorldSurface.tsx` changes only its import line to the new file. `components/WorldCanvas.tsx` re-exports all three, plus `computeFit` (test `WorldCanvas.test.tsx:4` imports `computeFit` and `levelColorMap` from it; if `computeFit` already lives in `canvas/worldView.ts` re-export it from there, else move it there).
- Rewrite the GBA warp-fetch comment (today `WorldCanvas.tsx` near `:1032-1036`, "fetch every visible map so turning Warps on shows markers at once") for the P12-4r scope where it lands.
- Create `packages/ui/test/WorldCanvasSurface.test.tsx` with new tests through the real `WorldCanvas` wrapper (copy fetch-stubbing helpers and fixtures from `test/WorldCanvas.test.tsx` into the new file rather than importing from it):
  - P12-4c: with no `onEditHere` handler, double-click on a map opens Map view (`onOpenMap` called with that map).
  - P12-4d: a rejected warp fetch shows the warp alert.
  - P12-4e: first load fits the clusters (hand-derived expected zoom/pan); no tile image request before the fit.
  - P12-4m: jump fits the map at 60% (hand-derived rect).
  - P12-4n: Enter and `+`/`-` on the canvas (as GBC does; read the spec ruling for exact behaviour).
  - P12-4o: a click on a warp marker selects nothing.
  - P12-4p: re-jump to the same map restarts the highlight fade (fresh node / restarted animation).
  - P12-4r: a connection line to an offscreen filter member draws; warps are fetched only while Warps is on at or above the LOD threshold, plus filter maps while lines are on.
  - P12-4s: a failed warp fetch retries on the next view change.
  - P12-4j: in context, a wheel-in at 16 px per tile gives 19.2 px per tile.
  - These must fail on the old `WorldCanvas.tsx` for the right reason (the missing feature). The conductor checks that.
- **Do not edit any existing test file.** The conductor runs the existing GBA tests against your wrapper first and rules every failure (P12-4c/e/j/m rebases come in a second pass). In your notes, list the existing tests you expect to fail and why, with the ruling ID, especially those in the plan's P12-4e/j/m/c list.

## If the surface lacks something GBA needs

Do not add a `gba|gbc|family` branch to `packages/ui/src/canvas/`. Apart from the import line in `WorldSurface.tsx` and the new `worldColours.ts`, do not edit `canvas/` files. If GBA needs a behaviour the surface does not offer (an unnamed family difference), describe it precisely in your notes (old GBA lines, surface lines, proposed adapter fact) and continue with everything else; do not stop the whole task for it.

## Rules

- Moved code keeps its rationale comments, shortened if needed, placed above the code they explain (never parked above a short wrapper). List removed comment lines and where each went.
- Every expected number in a new test is a hand-derived literal with its derivation in an adjacent comment; production code never supplies an expected value.
- Async tests use deferred promises resolved by hand and bounded `act` loops; never a DOM-mutating probe inside `waitFor`. "Once" claims are counted through a `vi.mock` wrapper of the hook, never by GET counts.
- Style: one statement per line, JSX one element per line, lines ≤ 140 chars, no crammed `a; b; c` lines, UTF-8 no BOM, CRLF line endings. Match the surrounding comment density.
- Never add `key={url}` or any key-based remount.
- Keep DOM unchanged (class names, `role`, `aria-*`, `data-testid`, text, element order) except where a ruling names a change.

## Deliverable

Code plus tests, and `docs/superpowers/task-reports/pokemap-plan-12b-world-surface/task-8-impl-notes.md`: files touched; each adapter field and the old GBA line it came from; a line-by-line comparison of `useGbaWorld`'s reconciliation with old `WorldCanvas.tsx:509-567` (same snapshot point, same keep rule); existing tests you expect to fail, with ruling; any surface gap; removed comments and where they went; anything you could not do. Plain sentences.
