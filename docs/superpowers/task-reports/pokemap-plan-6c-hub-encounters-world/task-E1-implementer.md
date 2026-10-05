# E1 implementer report

**Status: DONE** (base aa3b338; no existing test edited; `.codex/` untouched)

## Commits
| sha | what |
|---|---|
| a13a308 | D1: `components/mapView.ts` (ZOOM_LEVELS, Zoom, MapView, zoomAboutPivot moved verbatim); GbcMapCanvas imports them, keeps `export type GbcView = MapView` + `export { zoomAboutPivot }`; MapCanvas single `view` state, pure `applyZoom`, `fit()` one call, drag via one updater; StrictMode test |
| d8e38f9 | controlled `view`/`onViewChange` + 5 controlled tests |
| dd50d43 | D2: `min-width:0` on `.map-canvas`; strip/hover rules moved to `.map-canvas .map-canvas__status/__hover`; old `.gbc-map-canvas` rules deleted, comments kept (+ note that the GBA follow-up is done); `styles.test.ts` pin |
| e91af35 | docs: D1 (`a13a308`) / D2 (`dd50d43`) DONE lines + status line in followups plan |
| (this report) | report commit |

## Files changed
- NEW `packages/ui/src/components/mapView.ts`
- `packages/ui/src/components/MapCanvas.tsx`, `packages/ui/src/gbc/GbcMapCanvas.tsx`, `packages/ui/src/styles.css`
- `packages/ui/test/MapCanvas.test.tsx` (+90, additions only; adds `StrictMode` + `mapView` imports), `packages/ui/test/styles.test.ts` (+9)
- `docs/superpowers/plans/2026-09-23-pokemap-followups-remaining.md`

## Design (MapCanvas)
- `ownView` state; `view = controlledView ?? ownView`; `const { zoom, pan } = view` kept for readers.
- `viewRef` (latest view, set each render) + `updateView = useCallback(next | (v)=>next, [controlled, onViewChange])`. Uncontrolled: `setOwnView(next)`. Controlled: `n = next(viewRef.current)` OUTSIDE any updater, `onViewChange?.(n)` unless `n === viewRef.current` (same-zoom `zoomAboutPivot` returns same object, so not reported).
- Writers: `applyZoom` -> `updateView(v => zoomAboutPivot(...))`; `fit()` -> `updateView({zoom,pan})` (deps +updateView); drag -> `updateView(v => ({zoom: v.zoom, pan: from d}))`.
- Wheel effect deps `[zoom, updateView]` (so a changed `onViewChange` never leaves the native listener stale).
- Auto-fit effect: `if (!controlled) fit()`; `fittedForMapRef` still set. `pendingPaintRef`/`endActiveStroke`/`paintAt`/`beginStroke` untouched.

## Red proofs (run before the fix; all for the right reason)
| test | red output |
|---|---|
| StrictMode `fit -> 2x -> 4x` (before a13a308) | `expected [ -96, -96 ] to deeply equal [ -32, -32 ]` at the 2x pan (doubled pan received) ; 47 passed / 1 failed |
| controlled: first draw = props.view | `expected [ +0, +0, 64, 64 ] to deeply equal [ 7, -3, 128, 128 ]` |
| controlled: 4x reports once | `expected "spy" to be called 1 times, but got 0 times` |
| controlled: pan drag reports | `expected "spy" to be called 1 times, but got 0 times` |
| controlled: image load no auto-fit | `expected [ +0, +0, 64, 64 ] to deeply equal [ 7, -3, 128, 128 ]` (prop ignored; the not-called assertion is also guarded, see M4) |
| controlled: Fit reports | `expected "spy" to be called 1 times, but got 0 times` |
| styles pin `.map-canvas` min-width:0 | `expected '\n  flex-direction: column;\n  flex: …' to match /min-width\s*:\s*0(px)?\s*(;\|$)/` |

Expected numbers (fixture 64x64 viewport, pivot (32,32)): fit pan (0,0); 2x pan -32 (doubled -96); 4x pan -96 (doubled -224). Controlled: view {2,(7,-3)}; 4x -> {4,(-18,-38)}; drag (10,10)->(25,4) -> pan (22,-9); Fit -> {1,(0,0)}.

## Mutations E1-M1..M4 (self-run; in-memory mutate, `finally` writes saved bytes back; byte-compare = identical each time; git status clean after)
| id | mutation | killed by |
|---|---|---|
| M1a | nested `setOwnView` inside the zoom updater (original pattern) | StrictMode test (`[-96,-96]` vs `[-32,-32]`) + controlled 4x test; 2 failed |
| M1b | pan transform applied twice in `applyZoom` | StrictMode test + existing wheel test (`[-144,-48]` vs `[-48,-16]`) + controlled 4x; 3 failed |
| M2 | remove `min-width: 0` from `.map-canvas` | styles pin; 1 failed |
| M3 | controlled mode renders `ownView` (`const view = ownView`) | first-draw, 4x-reports, drag, image-load tests; 4 failed |
| M4 | controlled mode auto-fits (`fit()` unconditional) | 4x (called 2x), drag (2x), image-load (`not called at all, but called 1 times`), Fit (2x); 4 failed |

## U1 removed-lines check
`git diff aa3b338 -- packages/ui/test | grep -c '^-[^-]'` -> `0`. Diffstat: MapCanvas.test.tsx +90, styles.test.ts +9, nothing else under test/. `test/gbc/GbcMapCanvas.test.tsx` unchanged and green.

## WorldCanvas nested-updater check
`grep -n "setZoom((" WorldCanvas.tsx` -> no matches. All `set*((` updaters (setCompositeVersion, setRefetchGen, setRevealedMaps, setSelected, setWorld, setEncounter*, setWarpVersion, setWarpsOn, setLinesOn) inspected by line: none calls another setter inside its updater body. Wheel handler calls `setZoom(next); setPan({...})` sequentially in an event handler (not nested). WorldCanvas unchanged.

## Verification
- `node node_modules/vitest/vitest.mjs run packages/ui/test/MapCanvas.test.tsx packages/ui/test/gbc/GbcMapCanvas.test.tsx packages/ui/test/styles.test.ts` -> 3 files, 110 tests pass.
- `npm run typecheck` -> clean.
- `npm run build -w @pokemap/ui` -> built OK (css 41.93 kB, js 325.53 kB).
- Full suite not run (coordinator gate).

## Concerns
- CSS side effect: `.map-canvas .map-canvas__hover { margin-left: 0 }` now overrides `.map-canvas__hover { margin-left: auto }` for GBA too, so GBA's hover text is left-aligned (was right-aligned) and the GBA status strip is a fixed 44 px wrapping strip (was 28 px). Intended by spec (same declarations as GBC), but it is a visible GBA change; no GBA test pins it.
- CRLF: `MapCanvas.tsx`/`GbcMapCanvas.tsx` are CRLF in the working copy; edits preserved CRLF. New `mapView.ts` is LF (git warns it will normalise; no issue).
- Controlled mode computes `next` from `viewRef` (latest rendered view); two gestures before the parent re-renders would both derive from the same base. Fine for React event batching; E4 should apply `onViewChange` synchronously into state.
- Controlled `fit()` uses the canvas's own viewport/encounter-band fit, not the world view's; E4 owns whether to use the Fit button.
