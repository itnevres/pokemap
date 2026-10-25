# Task 7 review (combined spec + quality, read only)

Verdict: Approved (0 Important, 3 Minor). Nothing re-run; DESIGN.md, task-7-report.md, the Task 1-6 reports, the spec and the source were read.

## 1. DESIGN.md diff

- Consumers verified by import grep. `MapSurface.tsx` is the only importer of `CanvasZoomBar`, `OverlayToggleGroup`, `MapCanvasViewport` and `MapStatusStrip`. `LegendBar` is also imported by `gba/mapSurface.tsx:11` and `gbc/mapSurface.tsx:13` (`EventsLegendItems`), and the row says so. `canvas/events` is imported by both adapters. `mapSurfaceAdapter` types are imported by both adapters. `MapCanvas.tsx:8-9` and `GbcMapCanvas.tsx:8-9` import `MapSurface` and their adapter hook. `shared/useCanvasView.ts` is imported only by `test/canvas/useStage.test.tsx:5`, and it delegates to `canvas/useStage`, so the "no production consumer" row is accurate.
- Ruling citations match the spec: P12-4a (pointer capture, spec line 15), 4b (same-cell skip), 4g (image tracked by URL), 4h (`v=` only after the first bump), 4k (one status strip and legend frame), 4l (hover notification on id change), P12-8 (`skipFirstBlocksChange`). The adapter facts (16/16 GBA cells, 32 px paint and 16 px event step for GBC, `className`, `forced`, `time`, `legendHint`) match `gba/mapSurface.tsx:86` and `gbc/mapSurface.tsx:167-171`.
- The Plan 11 rows are correctly repointed, and the closing "Still per family" sentence is consistent with the spec (world canvases are 12b).
- Minor 1 (DESIGN.md, `canvas/view.ts` row): `canvas/MapSurface.tsx:12` imports `screenToSource` from `./view.js`, so MapSurface is a consumer in both columns. The row lists only `components/mapView` and `canvas/useStage` (GBA) and `canvas/useStage` (GBC). Fix: add `canvas/MapSurface` to both consumer cells.
- Minor 2 (DESIGN.md, `canvas/cells.ts` row, no defect): the row is correct, since `./cells.js` is imported only by `MapSurface.tsx:11`. It is mentioned only because a non-relative import grep misses it.

## 2. task-7-report.md

- The mutation table matches the Task 1-6 reports. Per-task rows: T1 6, T2 9, T3 6 (5 RED plus the `startPan` survivor), T4 21 (20 RED plus the render-time keying survivor), T5 4, T6 10. That is 56 total, 54 RED and 2 SURVIVED, and the report's totals are right. Nothing is dropped. Nothing is invented, and the file attributions are sound or labelled "Task 6 focused set".
- The family-branch analysis is complete and the indirect-branch read of `MapSurface.tsx` finds nothing the report missed. The family-specific inputs are `skipFirstBlocksChange`, `className`, `overlays[].forced`, `encounters.time` and `legendHint`, `encounter.family` (passed through, never compared) and `geometry`. The tool-kind checks (`sign`, `dropper`, `pencil`, `collision`) use the shared tool vocabulary. GBC has no collision button (`GbcMapEditing.tsx:17`), which supports "GBC never issues collision".
- Minor 3 (report Step 3): it says "7 matches", but `grep -i 'gba|gbc|family' canvas` gives 8 lines, because `events.ts:1`, `MapSurface.tsx:55/71/138/193` and `mapSurfaceAdapter.ts:17/19/37` are the eight lines the report itself lists. The classification is right; only the count is off. Fix: write 8.
- Observation, not a defect: `MapSurface.tsx:2-3` imports `ZOOM_LEVELS`/`MapView` from `components/mapView` and `EncounterBorder` from `components`, while `components/mapView.ts:1` imports `canvas/view`. This is a canvas to components dependency, not a family branch. Plan 12b or the Task 9 whole-branch review may want to move these shared pieces under `canvas/` or `shared/`.
- The side-by-side adapter findings are plausible and the rulings are reasonable. I found no other duplication worth lifting. The `finishBody` pencil, rect and shift lines are shape-similar but differ in types (GBC's `tool.stamp` guard), consistent with the report's ruling.

## 3. Measurement

143/180 code lines, 3 aligned, 1 run against the baseline 167 aligned / 30 runs is plausible. The file sizes (72 + 145 for GBA, 61 + 244 for GBC) are consistent with those code-line counts. The one run being the `MapSurfaceAdapter` import is plausible: `gba/mapSurface.tsx:9` and `gbc/mapSurface.tsx:11` are identical import lines. The target of at most 30 aligned is met. Not re-run.
