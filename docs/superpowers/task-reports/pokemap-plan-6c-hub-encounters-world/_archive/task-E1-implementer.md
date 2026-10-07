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

# Fix round (coordinator rulings; base 6468896, tree was clean bar `.codex/`)

**Status: DONE.** Existing tests unedited: `git diff aa3b338 -- packages/ui/test | grep -c '^-[^-]'` -> 0.

## Commits
| sha | what |
|---|---|
| a1a59e0 | CSS ruling: GBA keeps 28px single row, right-aligned hover. Shared `.map-canvas`: `min-width:0` (+ long rationale comment moved onto it) and base `.map-canvas__hover { margin-left:auto; min-width:0; overflow:hidden; text-overflow:ellipsis }`. 44px wrapping strip + `margin-left:0; max-width:100%` hover override back under `.gbc-map-canvas`. styles pins (regex `(^|\})\s*sel\s*\{`): `.map-canvas` min-width:0; shared hover ellipsis + margin-left:auto + no max-width; `.gbc-map-canvas .map-canvas__status` 44px and base `.map-canvas__status` 28px. `packages/ui/DESIGN.md` (lines ~239, ~258) updated: GBA 28px single row, ellipsising right-aligned hover; GBC 44px two rows |
| 8cbb716 | tests (a)-(d) + F3 comment fix (additions only) |
| ab4a96b | `onViewChangeRef`, `updateView` deps `[controlled]`; prop doc (no controlled/uncontrolled switching; two gestures before parent re-render derive from last rendered view); `mapView.ts` doc no longer "exactly one site"; `GbcMapCanvas.tsx` header (GBA fixed in 6c E1, shared `mapView.ts`, past tense) + blank line before `GbcView` doc restored |
| (this report) | report commit |

## Red proofs (in-memory mutation, saved bytes restored, byte-compare identical every time; git status clean after)
Run on pre-refactor code (8cbb716 parent state) so the wheel-deps mutant is still meaningful; then rerun post-refactor.
| test | mutant | result |
|---|---|---|
| (a) controlled gesture after parent applied new view | X1 `next(viewRef.current)` -> `next(controlledView!)` | RED `expected last "spy" call to have been called with [...]`; post-refactor also RED (+ the wheel test: `{4,(-28,4)}` missing) |
| (b) controlled wheel + rerender with new spy, same zoom | X2 wheel deps `[zoom, updateView]` -> `[zoom]` | RED `expected "spy" to be called 1 times, but got 2 times` (old spy fired) |
| (c) 2 mousemoves in one drag -> (20,-10) | X8 `d.panX` -> `v.pan.x` | RED `expected [ 35, -16 ] to deeply equal [ 20, -10 ]` (also post-refactor) |
| (d) 2 wheel ticks 1x->2x(-48,-16)->4x(-144,-48) | X3 wheel deps `[]` | RED `expected [ 128, 128 ] to deeply equal [ 256, 256 ]`; (b) also red (`called 2 times`); also post-refactor |
| ref | `onViewChangeRef.current` frozen at first value (stale callback) | RED (b) `called 1 times, but got 2 times` |
| CSS C1 | base hover `margin-left: auto` -> `0` | RED (hover pin) |
| CSS C2 | drop shared hover `text-overflow` | RED (hover pin) |
| CSS C3 | GBC strip height 44 -> 28 | RED (strip pin) |
| CSS C4 | base `.map-canvas__status` height 28 -> 44 | RED `expected ... to match /height\s*:\s*28px/` |
| CSS C5 | drop `.map-canvas` `min-width: 0` | RED `.map-canvas` pin |

## Deviations / notes
- **(a) as specified (rerender at 4x, click 2x -> `{2,(7,-3)}`) did NOT kill X1**: zooming back through the same pivot lands on VIEW itself, so a base frozen at VIEW coincides (survived 57/57). Kept that step, and added a second step: parent jumps to an unrelated `{2,(-5,9)}` (same zoom as VIEW), click 4x -> `{4,(-42,-14)}` (frozen base would give `(-18,-38)`). That kills X1.
- After the ref refactor, X2 (wheel deps `[zoom]`) is **equivalent** (the ref carries the fresh callback, `updateView` identity is stable), so (b) is red-proved on pre-refactor code and kept as a behaviour pin (the frozen-ref mutant above is its post-refactor killer).
- F3: StrictMode test comment now says old code reached -480 at 4x (probe from spec review); kept the -224 assertion and added `not -480`.
- Existing GBA hover is no longer left-aligned (reverted); GBA strip is back to 28px.

## Verification
- `vitest run MapCanvas.test.tsx gbc/GbcMapCanvas.test.tsx styles.test.ts` -> 3 files, 116 tests pass.
- `npm run typecheck` clean; `npm run build -w @pokemap/ui` built OK (css 41.94 kB, js 325.60 kB).
- Full suite not run.
