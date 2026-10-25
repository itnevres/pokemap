# Task 6 re-review (Claude Opus subagent; Codex usage limit, fallback logged)

# Plan 12a Task 6 re-review (spec and quality combined, after fix round 1)

Scope: the p12wt worktree diff against HEAD, plus the untracked `canvas/events.ts`, `gba/mapSurface.tsx`, `test/gba/GbaMapSurface.test.tsx` and `test/canvas/events.test.ts`. This was a read-only review; I did not run vitest.

## Prior findings

**Quality Important 1 (dangling references): resolved.**
- `canvas/MapSurface.tsx:18` and `:182-184` now state the rationale inline.
- `gbc/mapSurface.tsx:93` and `:151` name the symbols' new homes. The old findEventAt doc was removed when it moved to `canvas/events.ts`.
- `gbc/GbcWorldCanvas.tsx:92` now reads "MapCanvas zoom handler", a historical name with no line number. That is acceptable.
- A grep of `src/` finds no remaining `MapCanvas.tsx:<line>` references. The other "MapCanvas's" mentions in `EventInspector`, `Toolbar`, `WorldCanvas` and `useEditSession` are outside this diff and name the component, not deleted text.

**Quality Important 2 (duplicate comments): resolved.**
- The rect/shift sentence is merged at `MapSurface.tsx:53-55`.
- The pan-fallthrough text appears once, at `:182-184`.
- Preview has one comment, at `:210-211`.
- The mouseup capture rule appears once, at `:230-231`, and the history line is gone.
- `useRasterComposite.ts:93-95` has one overlay-blending comment.

**Quality Minors:**
- Minor 1 (shared lookup): resolved, via `canvas/events.ts`.
- Minor 2 (stale wording): resolved.
- Minor 3 (`METATILE_PX` before `compositeOrigin`): resolved, at `gba/mapSurface.tsx:25-30`.
- Minor 4 (`Pick` parameter type): resolved, at `:44`.
- Minor 5 (P12-4b test name): resolved.
- Minor 6 (formatting): resolved in source. The plan's `.ts` path is a docs item for the coordinator.
- Minor 7 (shared test fixtures): intentionally skipped.

**Spec Minors:**
- Minor 1 (mark leak): resolved. Marks are now `{ name, list }` (`gba/mapSurface.tsx:53,104`) and are read only when `marks.current?.name === map.name` (`:114`). The new test at `GbaMapSurface.test.tsx:244` goes red with the guard removed, which the coordinator confirmed.
- Minor 4 (cosmetic): resolved.
- Minors 2, 3 and 5 are for the coordinator's report and docs.

## Event-lookup extraction: behaviour check

- **Scan order.** Both adapters build object, warp, coord, bg tuples, matching HEAD (`gba/mapSurface.tsx:15-16`, `gbc/mapSurface.tsx:24-25`). `firstEventAt` returns the first `findIndex` hit in tuple order, exactly as both old loops did. `events.test.ts` pins this with an overlap, and a reversed scan goes red.
- **Whole-cell hit.** The check is still exact `x`/`y` equality on the cell that MapSurface passes in. GBC still receives step cells, because MapSurface computes the cell from `geometry.eventCellPx`, which is unchanged. GBA still receives 16 px cells. Only the argument shape changed (`cell` object instead of `cell.x, cell.y`), and the values are the same.
- **Ref resolution.** The old ternary sent any non-object, non-warp, non-coord kind to bg. The new `lists.find(kind)` gives the same result for every member of `EventKind` and `GbcEventKind`, which are the only types allowed. A missing index or a null ref still returns null.
- **Live data.** GBA reads the live `map` (`editSession?.map ?? staticMap`). GBC reads the memoised merged `data.events`. Both are unchanged from before.
- **No family branch.** `canvas/events.ts` is generic over `Kind`. `canvas/` has no new `gba`/`gbc` conditional; the single GBC mention at `MapSurface.tsx:138` is an existing comment.

## Critical
None.

## Important
None.

## Minor
1. `canvas/MapSurface.tsx:140-141`: "No ring when nothing is selected or dragged." sits under the `if (!highlight) return;` it describes, appended to the CSS-token comment for the next line. Optional fix: move that sentence onto line 138, or put it as a trailing comment on the guard. Cosmetic only.

## Regressions
None found. The wrapper keeps the public exports (`EventRef`, `MapCanvasProps`, `compositeOrigin`, `MapCanvas`). The new comments in `useStage.ts`, `useRasterComposite.ts` and `MapSurface.tsx` describe code that is present at the lines they annotate. The coordinator reports that the focused suites pass (717 tests) and that the mutations go red; the full gate is still running.

Re-review: Approved
