# Task 1 report: map canvas extractions

Implementer: Codex gpt-5.6-terra in a scratch worktree (Aider skipped: >3 files). Diff moved by patch. Claude restored four rationale comments Codex dropped (passive wheel listener, `onViewChange` ref, single write path, fit-once), now in `shared/useCanvasView.ts`.

- E1+E2 → `shared/useCanvasView.ts` (`useCanvasView`, `useCanvasZoom`). E13 map auto-fit → `useCanvasAutoFit` in the same file (identical modulo `imgLoaded`, `mapName`, `controlled`, `fit`).
- E3 → `shared/CanvasZoomBar.tsx`; E4 → `shared/OverlayToggleGroup.tsx` (family passes its toggle list); E5 → `shared/LegendBar.tsx` (frame only; items per family).
- E6 status strip: left in both canvases; a container-only extraction saves under 3 lines, readouts are per family.
- `git diff --stat -- packages/ui/test` empty.

Measurement (`measure.py`, map pair): before 535 / 545 code lines, 263 aligned, 37 runs (matches spec baseline). After 477 / 495, 216 aligned, 34 runs.
Largest runs left: legend Events items + Encounters item (24, GBA 849-872 / GBC 729-752), viewport/canvas/EncounterBorder markup (19), composite-version and redraw effects (15, 13: draw path, P11-2), the toggle list literals (11). Review to rule on the legend items and viewport markup.

Gate (main checkout, 4 workers): 3,455 pass / 0 fail / 216 files; typecheck pass (also after the comment edit); UI build pass.
