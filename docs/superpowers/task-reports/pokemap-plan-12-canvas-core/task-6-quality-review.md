# Task 6 quality review (Claude Opus subagent; Codex usage limit, fallback logged)

# Plan 12a Task 6: code-quality review (GBA map canvas onto MapSurface)

Scope: uncommitted diff in the p12wt worktree: `components/MapCanvas.tsx`, `components/MapEditingWorkspace.tsx`, new `gba/mapSurface.tsx`, new `test/gba/GbaMapSurface.test.tsx`, test edits in `MapCanvas.test.tsx` / `MapEditingWorkspace.test.tsx`, and comment-only edits in `canvas/MapSurface.tsx`, `canvas/useRasterComposite.ts`, `canvas/useStage.ts`. Read against HEAD's `MapCanvas.tsx`, `gbc/mapSurface.tsx`, `canvas/mapSurfaceAdapter.ts`, and plan Task 6.

## Verified clean

- **Raster deps.** Every draw closure's captured input is declared. grid/collision/elevation capture `withLayout`, which uses layout, the layout-derived origin and blocks, and they declare `[layout, blocks]`. events also captures `map` and declares `[layout, blocks, map]`. `forced` reaches the raster through `enabled` in `layerInputs`. `useStableValues` compares by `Object.is`, so a fresh adapter object or closure on an unrelated re-render does not recomposite: `layout`, `staticBlocks`/`editSession.blocks` and `map` keep their identity across renders. Layer order (grid, collision, elevation, events) matches the old compositing order.
- **Live-blocks merge.** `editSession ? editSession.blocks : staticBlocks` and `editSession?.map ?? staticMap` are copied exactly from old `MapCanvas.tsx:226,239`.
- **Collision forcing.** `forced: activeTool?.kind === "collision"` is OR-ed into `enabled` only, and the toggle's `aria-pressed` stays manual. This matches old `showCollision = toggles.collision || collisionForced`. The legend's `data-visible={true}` is as vestigial as the old `data-visible={showCollision}`, which was only rendered when true. Tests at `MapCanvas.test.tsx:712` pin it, so keeping it is fine.
- **Hover/status purity.** `statusItems` is pure. `hoverAt` reads `marks.current`, which is written only inside the effect-time events draw. The old code cleared `marksRef` on every composite; the new `enabled.events` guard replaces that, so the behaviour is the same. On a map switch the toggles reset, so stale marks from the previous map can't show.
- **Types.** No `any`. The one cast, `(block as { behavior?: number })`, comes from the old code with its rationale.
- **Re-exports.** `EventRef`, `MapCanvasProps`, `compositeOrigin` and `MapCanvas` are all still exported. Importers checked: `gba/adapter.tsx:5`, `hooks/useMapEditing.ts:2`, `WarpDestinationModal`, `MapEditingWorkspace`, and the tests. `onEditError` is wired through the `Pick` and the `canvasProps` object. `gba/adapter.tsx:99` spreads `canvasProps`, so context mode gets it with no extra handler, as the plan expected.
- **Tests.**
  - Deterministic.
  - Deferred promises are used for apply and end.
  - `flush()` is bounded to 30 microtask ticks.
  - The P12-4h test uses fake timers.
  - PR-I3 resolves both deferreds in `finally`, so a failed assertion can't leave a hang.
  - P12-4g counts composites as `drawImage` calls whose first argument is the `<img>`. That separates them from stage blits, which take a canvas.
  - P12-4f fails if `onEditError` is dropped in either host.

## Critical

None.

## Important

1. **Comments point at rationale that this task deleted.** The brief says no comments may describe absent code, and every one of these now sends the reader to text that no longer exists:
   - `canvas/MapSurface.tsx:18` "(MapCanvas's paint postmortem)".
   - `canvas/MapSurface.tsx:183` "(MapCanvas's event-selection rationale)".
   - `gbc/mapSurface.tsx:22` "`MapCanvas.tsx:27-53`". That text now lives in `gba/mapSurface.tsx:12-28`.
   - `gbc/mapSurface.tsx:105` "`MapCanvas.tsx:521`". The selection-colour pattern is now at `canvas/MapSurface.tsx:142`.
   - `gbc/mapSurface.tsx:164` "`MapCanvas.tsx:215-228`". This is now `gba/mapSurface.tsx:78-107`.
   - `gbc/GbcWorldCanvas.tsx:92` "GBA's own `MapCanvas.tsx:532-542`".

   Fix: repoint each one to the symbol's new home by name, not by line number (for example "see `gba/mapSurface.tsx` findEventAt"), or state the rationale inline and drop the pointer.

2. **Comments added in this diff duplicate the comment beside them in `canvas/MapSurface.tsx`.** These read as migrated comment blocks parked next to the existing ones:
   - Lines 182-185 say "a miss falls through to pan" twice (line 183 and line 185).
   - Line 212, "Preview never posts...", repeats the trailing comment on line 213, "Candidate only; never a per-move write."
   - Lines 231-233 state the capture-before-clear rule three times. Line 233 ("previously lost kind/index/start") is history, not current behaviour.
   - Line 55, "Both drag-shaped tools need just start/end", follows a sentence about pencil/collision, so it reads as if it refers to them. It means rect/shift.
   - Lines 140-141, "Highlighting is absent for old callers", is vague. It means: with no `selectedEvent` and no drag there is nothing to draw.

   Fix: merge each group into one comment. Delete line 233 and the duplicate at 185. Move the line 55 text onto line 53's rect/shift sentence. Rewrite line 141 as "No ring when nothing is selected or dragged."

## Minor

1. **Event lookup is duplicated across families.** `gba/mapSurface.tsx:29-48` (`findEventAt`, `eventPositionAt`) and `gbc/mapSurface.tsx:23-37` (`findEventAt`, `eventPosition`) run the same algorithm, differing only in the names of the four list fields. One is also renamed (`eventPositionAt` vs `eventPosition`). Fix: add a helper in `canvas/`, for example `firstEventAt(lists: [Kind, Point[]][], cell)` and `eventAt(lists, ref)`, and have each adapter build only its ordered `[kind, list]` tuples. Smaller repeats are acceptable to leave: `hex`, `BORDER_RINGS`, the Grid legend JSX, the `map-canvas__hover--empty` className expression, and the shift `finishBody` branch.
2. **Stale wording in `gba/mapSurface.tsx`.**
   - The findEventAt doc at lines 25-28 still talks about "MapCanvas's `map` prop" and "no ref extraction needed from drawEvents".
   - Lines 96-106 say "Task 14" and "this task's own findEventAt/eventPositionAt", which is history narrative.
   - Lines 78-94, the 17-line behaviour-fallback essay, repeat the one-line rationale at line 168.

   Fix: cut the doc to the current contract (scan order, object-first rationale, whole-cell hit). Shorten 78-107 to the live/static split and its one behaviour caveat, and keep line 168 as the single note.
3. **`compositeOrigin` hard-codes `16`.** At `gba/mapSurface.tsx:57-58` it uses a literal, while `METATILE_PX = 16` is declared on line 61 right after it and used for geometry on lines 140-142. Fix: declare `METATILE_PX` before `compositeOrigin` and use it there.
4. **`useGbaMapSurface` asks for more props than it reads.** Its signature at `gba/mapSurface.tsx:76` takes all of `MapCanvasProps` but reads only `data`, `editSession` and `activeTool`. Fix: type the parameter as `Pick<MapCanvasProps, "data" | "editSession" | "activeTool">`. That documents the adapter's real inputs and keeps the callbacks out of it.
5. **The P12-4b test name overclaims.** At `GbaMapSurface.test.tsx:143`, "...and resets at stroke end" passes for the wrong reason. The follow-up `gesture` at line 157 would call `applyPaint` a third time even without the reset, because `onMouseDown` always sends the start cell and overwrites `lastCell` (`MapSurface.tsx:203-204`). The `lastCell.current = null` in `finishStroke` can't be observed, which makes it effectively dead. Fix: drop "and resets at stroke end" from the name, or delete the redundant reset in `finishStroke` and keep the test as it is.
6. **Formatting.**
   - `gba/mapSurface.tsx:11-12` has no blank line between the imports and the first doc comment.
   - There are double blank lines at `gba/mapSurface.tsx:74-75` and `GbaMapSurface.test.tsx:102-103`.
   - The plan names the file `gba/mapSurface.ts`; it was created as `.tsx`. That's correct because it contains JSX and matches the GBC file, but update the plan's Files line so the two agree.
7. **Duplicated test fixtures.** `GbaMapSurface.test.tsx:45-101` re-declares the `DATA` fixture and `makeEditSession` that `MapCanvas.test.tsx` already has. Optional fix: move them to a shared test fixture module.

Quality: Changes requested
