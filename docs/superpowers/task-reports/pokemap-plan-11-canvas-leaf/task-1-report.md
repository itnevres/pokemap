# Task 1 report: map canvas extractions

Implementer: Codex gpt-5.6-terra in a scratch worktree (Aider skipped: >3 files); diff moved by patch. Fix 1 by the same Codex thread (resumed; it ran in the main checkout, see ledger trap). Fixes 2-3 inline by Claude (small; a brief would cost more). Claude also restored four rationale comments Codex dropped (passive wheel listener, `onViewChange` ref, single write path, fit-once).

## What moved

| Unit | Shared module |
|---|---|
| E1 controlled view, E2 zoom/wheel, E13 auto-fit, E13 fit callback (fix 3) | `shared/useCanvasView.ts`: `useCanvasView`, `useCanvasZoom`, `useCanvasAutoFit`, `useCanvasFit` (binds the F shortcut and the context fit) |
| E3 zoom group | `shared/CanvasZoomBar.tsx` |
| E4 overlay toggles (family passes its list) | `shared/OverlayToggleGroup.tsx` |
| E5 legend frame; E13 Events items and Encounters item (fix 1) | `shared/LegendBar.tsx`: `LegendBar`, `EventsLegendItems`, `EncountersLegendItem` (hint text is an input; GBC keeps its time-of-day suffix) |
| E13 viewport mount (fix 2) | `shared/MapCanvasViewport.tsx` (source image + stage canvas; family passes handlers, sizes and its `EncounterBorder` as children) |

E6 status strip: stays per family; a container-only extraction saves under 3 lines and the readouts are per family.
`git diff --stat -- packages/ui/test` is empty for every commit of this task.

## Measurement (`measure.py`, map pair)

| | code lines GBA / GBC | aligned (runs ≥3) | runs |
|---|---|---|---|
| Before (`fb78949`) | 535 / 545 | 263 | 37 |
| After first commit | 477 / 495 | 216 | 34 |
| After fix 1 | 453 / 469 | 190 | 33 |
| After fix 2 | 445 / 461 | 182 | 33 |
| After fix 3 (final) | 427 / 443 | 167 | 30 |

## E13 rulings: every remaining run (final, `--all`; lines GBA / GBC)

| Run | Lines | Ruling |
|---|---|---|
| `compositeVersion` state and recomposite effect | 361-381 / 338-353, 452-465 / 428-441 | Draw path (P11-2) |
| Blit effect | 507-515 / 476-484 | Draw path (P11-2) |
| Stroke-chain registration effect | 258-261 / 311-314 | Stroke plumbing around `chain` (P11-2) |
| `chain.start` / `chain.queue` / rect stroke / event-drag bodies | 681-696, 710-714, 716-730, 738-760, 771-778, 785-790 / 595-602, 612-617, 619-633, 641-652, 659-666, 669-674 | Stroke handlers (P11-2) |
| `hoverAt`, `blockAt`, `signAnchor`, pencil branch fragments | 580-597, 604-622, 635-640, 658-677 / 519-530, 541-558, 562-567, 580-592 | Hit-test and cell math (P11-2); GBA 16 px metatile vs GBC block geometry |
| Toggle-list literals, toolbar wrapper, `MapCanvasViewport` and `EncounterBorder` call sites, status-strip spans | 803-820, 833-849, 854-865 / 683-699, 712-729, 731-746 | Call-site inputs to the shared components; status strip per E6 |
| Imports, `interface Toggles`, `useState`/`useRef` declarations | 8-14, 170-172, 241-245, 343-352, 553-558 / 9-15, 103-105, 303-307, 327-336, 509-514 | Each canvas's own declarations; nothing further to share |

## Gate

Each commit, main checkout, 4 workers: 3,455 pass / 0 fail / 216 files; typecheck and UI build pass.
