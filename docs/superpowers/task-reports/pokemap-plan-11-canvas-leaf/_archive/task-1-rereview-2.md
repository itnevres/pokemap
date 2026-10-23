Spec: ❌  
Quality: Changes requested

- Important — [task-1-report.md:11](C:\Programming Projects\PokeMap/docs/superpowers/task-reports/pokemap-plan-11-canvas-leaf/task-1-report.md:11): inaccurate: viewport/canvas/`EncounterBorder` markup is now extracted, not a remaining run.
- Important — [task-1-report.md:6](C:\Programming Projects\PokeMap/docs/superpowers/task-reports/pokemap-plan-11-canvas-leaf/task-1-report.md:6): inaccurate: `LegendBar.tsx` now owns Events and Encounters items, not its frame only.
- Important — [task-1-report.md:13](C:\Programming Projects\PokeMap/docs/superpowers/task-reports/pokemap-plan-11-canvas-leaf/task-1-report.md:13): remaining 3+ aligned non-draw runs are not all ruled/listed, e.g. refs/state/effects at [MapCanvas.tsx:244](C:\Programming Projects\PokeMap/packages/ui/src/components/MapCanvas.tsx:244), [MapCanvas.tsx:261](C:\Programming Projects\PokeMap/packages/ui/src/components/MapCanvas.tsx:261), and [MapCanvas.tsx:527](C:\Programming Projects\PokeMap/packages/ui/src/components/MapCanvas.tsx:527).

Prior finding is resolved: `MapCanvasViewport` preserves element order, classes, refs, handlers, and dimensions; `EncounterBorder` remains last with family-specific props. `DESIGN.md` is accurate.