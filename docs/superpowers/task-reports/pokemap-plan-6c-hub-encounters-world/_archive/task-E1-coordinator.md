# E1 coordinator record

E1 ran under the Claude Code coordinator, 2026-10-05. The executed spec is `task-E1-spec.md` (`aa3b338`). The final code is at `ab4a96b`, and the final report at `f91d771`.

## Rounds

- **Implementer (Sonnet):**
  - `a13a308` (one view state + the shared `components/mapView.ts`);
  - `d8e38f9` (controlled `view`/`onViewChange`);
  - `dd50d43` (CSS);
  - `e91af35` (follow-ups D1/D2 marked DONE).
- **Reviews:** the spec review (Opus) **PASSED**, with F1–F8 as minor or info. The quality review (Sonnet) **APPROVED**, with 2 P2s and 5 P3s.
- **Fix round, same implementer.** Coordinator rulings:
  - P2-1: GBA keeps its 28 px single-row, right-aligned status strip. Only `min-width: 0` and the hover ellipsis are shared; the 44 px wrapping strip is GBC-only. `DESIGN.md` was updated.
  - P2-2 / F1 / F2: tests for the controlled stale base, the controlled wheel, the multi-step drag and two wheel ticks.
  - P3-1: `onViewChange` goes through a ref.
  - P3s and F3–F5: docs and comments.
  - Fix commits: `a1a59e0`, `8cbb716`, `ab4a96b`.
- **U1:** `git diff aa3b338 HEAD -- packages/ui/test | grep -c '^-[^-]'` = 0. The fix round only removed lines from E1's own new tests: a comment and the restructured CSS pin.

## Coordinator mutation rerun on `f91d771`

Harness: `C:/Users/Serve/AppData/Local/Temp/pokemap-phase-d-coordinator/e1-mutations.mjs`. Same method as before:
- an unmutated green baseline for every witness;
- each anchor asserted exactly once;
- in-memory restore, then a byte compare;
- the requested IDs cross-checked against the reported IDs.

| ID | Mutation | Witness | Result |
|---|---|---|---|
| E1-M1 | `applyZoom` → the old nested `setOwnView` inside the updater | StrictMode `fit -> 2x -> 4x…` | RED |
| E1-M2 | `.map-canvas` `min-width: 0` removed | styles `declares min-width: 0 on .map-canvas` | RED |
| E1-M3 | `view = ownView` (controlled prop ignored) | `renders props.view…` | RED |
| E1-M4 | auto-fit also in controlled mode | `an image load never reports a view` | RED |
| E1-X1 | controlled base taken from the closure `controlledView!` | `a gesture after the parent applied a new view…` | RED |
| E1-X-ref | `onViewChangeRef` never refreshed | `wheel reports through onViewChange, and after a rerender…` | RED |
| E1-X8 | drag base = the live pan (deltas accumulate) | `two mousemoves in one drag…` | RED |
| E1-X3 | wheel effect deps `[]` | `two wheel ticks go 1x -> 2x -> 4x…` | RED |

8 requested, 8 reported, none missing. The tree was clean afterwards.

## Live verification

Setup: the Vite dev server (StrictMode on) at 5183 → hub at 5184, with the GBA scratch mirror. Browser: the Playwright MCP, with `visibilityState` confirmed `visible`.

- **LittlerootTown zoom.** `drawImage` was instrumented through an init script. The canvas was 740×647, so the pivot was (370, 323.5).
  - Fit: dest (178,132), 384 px.
  - 2×: (−14,−59). Expected single application: (−14,−59).
  - 4×: (−398,−441). Expected single application: (−398,−441).
  - The 4× screenshot shows the map rendered, not blank.
- **Hover sweep.** 77 points at 1280×800 and again at 1024×768. In both, the worst `scrollWidth − clientWidth` was **0**.
- **Status strip.** 28 px tall, with the hover `text-overflow: ellipsis` (screenshot inspected).
- **Phase D nit `31f297f`.** The world legend reads "Conflict · Accepted · Dive · Emerge", and the Accepted swatch is `rgb(100,116,139)` = `--text-muted`.

Screenshots (scratch, outside the repo): `e1-gba-4x.png`, `e1-gba-hover.png`, `e1-legend.png`.
