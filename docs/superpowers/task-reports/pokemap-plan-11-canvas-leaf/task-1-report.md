# Task 1 report: map canvas extractions

Implementer: Codex gpt-5.6-terra in a scratch worktree (Aider skipped: >3 files). Diff moved by patch. Claude restored four rationale comments Codex dropped (passive wheel listener, `onViewChange` ref, single write path, fit-once), now in `shared/useCanvasView.ts`.

- E1+E2 → `shared/useCanvasView.ts` (`useCanvasView`, `useCanvasZoom`). E13 map auto-fit → `useCanvasAutoFit` in the same file (identical modulo `imgLoaded`, `mapName`, `controlled`, `fit`).
- E3 → `shared/CanvasZoomBar.tsx`; E4 → `shared/OverlayToggleGroup.tsx` (family passes its toggle list); E5 → `shared/LegendBar.tsx` (frame only; items per family).
- E6 status strip: left in both canvases; a container-only extraction saves under 3 lines, readouts are per family.
- `git diff --stat -- packages/ui/test` empty.

Measurement (`measure.py`, map pair): before 535 / 545 code lines, 263 aligned, 37 runs (matches spec baseline). After fix round 1: 453 / 469, 190 aligned, 33 runs. After fix 2: 445 / 461, 182 aligned, 33 runs.
Largest runs left: composite-version and redraw effects (15, 13: draw path, P11-2), the toggle list literals (11), and viewport/canvas/EncounterBorder markup (now below the report's 15-line listing threshold; it stays under the E13 ruling below).

## E13 rulings

- Events legend items: extracted to `EventsLegendItems` in `shared/LegendBar.tsx`; they are byte-identical markup in both families.
- Encounters legend item: extracted to `EncountersLegendItem`; error, empty state, and family-specific hint text are inputs, preserving the GBC time-of-day suffix.
- Viewport/canvas markup: extracted (fix 2, re-review) to `shared/MapCanvasViewport.tsx`; the handlers and sizes are inputs, the draw code they call stays in each canvas. Each family passes its own `EncounterBorder` as children (GBA `METATILE_PX`, band gba; GBC `BLOCK_PX`, band gbc, `time`).
- Toggle-list literals: stay per family as the inputs to the shared toggle-group component; GBA alone supplies Elevation.

Gate (main checkout, 4 workers): 3,455 pass / 0 fail / 216 files; typecheck pass (also after the comment edit); UI build pass.
