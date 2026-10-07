# E1 spec-compliance review

**Verdict: PASS.** Range `aa3b338..a8b4971` (a13a308, d8e38f9, dd50d43, e91af35 + report a8b4971). Every spec requirement is met; M1-M4 all RED. No Critical/Important findings. Minor items are test gaps beyond the spec's list plus stale comments; none block E1. Recommend folding F1 into E4's tests.

Own runs: 3 named files 110/110 pass; `npm run typecheck` clean. Build not re-run (CSS/TS only, typecheck + lightningcss strict-parse test cover it). Full suite not run.

## Requirement checklist

| # | req | status | evidence |
|---|---|---|---|
| 1 | `components/mapView.ts`: ZOOM_LEVELS, Zoom, MapView, zoomAboutPivot verbatim | OK | `mapView.ts:2-27`; body byte-identical to old GBC fn, typed on MapView |
| 1 | GBC imports, `export type GbcView = MapView`, re-exports zoomAboutPivot, local ZOOM_LEVELS/Zoom gone | OK | `GbcMapCanvas.tsx:10,69-70`; `git diff --stat aa3b338 a8b4971 -- packages/ui/test/gbc` empty; GBC tests green |
| 1 | MapCanvas drops own copies | OK | `MapCanvas.tsx:14` import; old `:127-128` deleted |
| 2 | one view state | OK | `MapCanvas.tsx:348` `ownView`; `zoom`/`pan` states gone; `:351` `const { zoom, pan } = view` |
| 2 | applyZoom pure updater | OK | `:581` `updateView((v) => zoomAboutPivot(...))` |
| 2 | fit one call | OK | `:447` `updateView({ zoom: z, pan: p })` |
| 2 | drag one updater | OK | `:776` |
| 2 | no setter inside an updater anywhere in MapCanvas | OK | only updaters passed to `setOwnView`: zoomAboutPivot (pure) + drag lambda (pure); `setToggles` updater pre-existing and pure |
| 3 | `view?`/`onViewChange?` with doc comments | OK | `:119-125` |
| 3 | controlled renders props.view, no own state used | OK | `:350` `view = controlledView ?? ownView`; `:358` uncontrolled-only `setOwnView` |
| 3 | every change via onViewChange (zoom btn, wheel, drag, Fit), `next` from current props.view outside updaters | OK | all 4 writers route through `updateView` (`:356-364`); controlled branch calls `next(viewRef.current)` synchronously, not in an updater |
| 3 | no auto-fit on load; Fit reports | OK | `:458` `if (!controlled) fit()`; Fit button `:918` -> `fit` -> `updateView` |
| 3 | one write path, no 2nd state | OK | `updateView` only; `viewRef` is a ref, not state |
| 4 | `.map-canvas { min-width: 0 }`, strip/hover rules moved, `.gbc-map-canvas` rules deleted, comments kept | OK | `styles.css:516`, `:710-715`, `:720-726`; declarations unchanged (diff = selector lines only); comment `:684-701` kept + E1 note. `gbc-map-canvas` now only the className at `GbcMapCanvas.tsx:458` |
| 4 | styles pin, existing parse helpers | OK | `styles.test.ts:33-40`, same `transform({errorRecovery:true})` + regex pattern as the C1 test |
| 5 | docs DONE lines | OK | followups plan `:131` (D1, `a13a308`), `:138` (D2, `dd50d43`), same form as D3 `:144`; status line updated. shas match the commits |
| 6 | WorldCanvas nested-updater check | OK (re-verified) | `grep "setZoom(("` -> 0 hits; multi-line updaters `:1457`,`:1550`,`:1567`,`:1725` contain no setter calls (setters at `:1558`,`:1584`,`:1731` are after the updater closes) |
| U1 | existing tests unchanged | OK | `git diff aa3b338 a8b4971 -- packages/ui/test \| grep -c '^-[^-]'` = **0**; test diff is +90 / +9 additions only |
| race | `pendingPaintRef`/`endActiveStroke`/`paintAt`/`beginStroke` untouched | OK | diff hunks only at old lines 11,115,124,175,337,422,434,557,600,762; none in `:252`,`:664-700`,`:737`,`:813-840`. Call chain intact: onMouseDown paint branch `:731-744` returns before the pan-drag start `:746`; onMouseMove paint-trail branch `:769-772` precedes the drag branch `:774`; onMouseUp `:872`/onMouseLeave `:891` -> endActiveStroke unchanged |

## Re-derived numbers

Fixture: `PIXEL_SIZE = 64` (`(2+2*1)*16`), `HTMLElement.prototype.clientWidth/Height = 64` -> viewport 64x64 -> canvas 64x64 -> pivot (32,32). Encounters off -> band 0. `fitWithBand`: level 1 `64<=64` fits, 2 `128>64` no -> zoom 1, pan `round((64-64)/2)=0` -> (0,0).

StrictMode (single application, `Math.round(pivot - (pivot - pan0)*k)`, k = next/prev):
| step | from | cx | pan | test |
|---|---|---|---|---|
| fit | - | - | (0,0) @1x | matches |
| 2x | (1,0) | 32 | 32-64 = **-32** | matches |
| 4x | (2,-32) | (32+32)/2=32 | 32-128 = **-96** | matches |

Old code (nested `setPan` in `setZoom` updater, `prevZoom` closed over):
- 2x: pass1 -32; pass2 cx=(32+32)/1=64 -> 32-128 = **-96**. Test's `not [-96,-96]` = real old value. OK.
- 4x (old base is -96, not -32): pass1 cx=(32+96)/2=64 -> -224; pass2 cx=(32+224)/2=128 -> 32-512 = **-480**.
- **Empirical probe** (actual `aa3b338` MapCanvas.tsx under the new StrictMode test, assertions swapped for logs): `PROBE 2x [-96,-96,128,128]`, `PROBE 4x [-480,-480,256,256]`. Confirms -96; old code never reaches -224 at 4x (see F3).

Controlled (`VIEW = {2,(7,-3)}`, pivot (32,32)):
- first draw dest `(7,-3)`, size 128 (64x2). OK.
- 4x: cx=(32-7)/2=12.5 -> round(32-50)=**-18**; cy=(32+3)/2=17.5 -> round(32-70)=**-38** -> `{4,(-18,-38)}`. OK.
- drag (no activeTool/onSelectEvent -> pan branch): start pan (7,-3), mouse (10,10)->(25,4): (7+15, -3-6) = **(22,-9)**, zoom 2 kept. OK.
- Fit: `{1,(0,0)}` (as above), differs from VIEW so reported. OK.

## Stale-closure / StrictMode analysis

- `updateView` deps `[controlled, onViewChange]`; controlled branch reads `viewRef.current` (written every render, `:354-355`) -> always the latest rendered `props.view`. Correct.
- Wheel native listener `:600-614`: closes over `zoom` (dep) and `applyZoom` -> `updateView` (dep). Controlled: base view via `viewRef`, `onViewChange` fresh because `updateView` is a dep. Correct. Side effect: an inline `onViewChange` prop re-registers the listener every render (cheap, harmless).
- Drag updater reads `d` (captured const) and `e.clientX` lazily; React 19 has no event pooling -> safe.
- StrictMode: no updater has side effects. Controlled branch invokes the function directly (not via React), so it runs once per gesture. `onViewChange` is never called from render or an updater. Mount effects: the auto-fit effect sees `imgLoaded=false` on mount, so StrictMode's double effect run does nothing.

## Findings

| id | sev | anchor | finding |
|---|---|---|---|
| F1 | Minor (test gap) | `MapCanvas.tsx:359`; tests `MapCanvas.test.tsx:1129-1178` | No controlled test fires a gesture **after** a `view` prop change, so the stale-base mutant X1 (`next(controlledView!)` from the closure instead of `viewRef.current`) survives, and so does X2 (wheel deps drop `updateView`). Code is correct today; E4 relies on this. Suggest: after the 4x rerender, click 2x and assert `zoomAboutPivot(expected, 2, 32, 32)` (= `{2,(7,-3)}`, i.e. back to VIEW: cx=(32+18)/4=12.5 -> 7, cy=(32+38)/4=17.5 -> -3); plus one controlled wheel tick after a rerender with a new `onViewChange`. |
| F2 | Minor (pre-existing test gap) | drag `:776`, wheel deps `:614` | X8 (drag base = current `v.pan`, so deltas accumulate) and X3 (wheel deps `[]`, so zoom goes stale) survive the whole file. Every existing pan test does a single mousemove and every wheel test a single tick. Not introduced by E1. |
| F3 | Nit | `MapCanvas.test.tsx:1124-1125` | -224 is "double application from the correct -32 base" (M1b-style). The real old code yields -480 at 4x (probe), because its 2x was already -96. The assertion is harmless (the test already reds at 2x), but the comment "Doubled: second pass ..." misdescribes old behaviour. |
| F4 | Nit | `GbcMapCanvas.tsx:50-54` | Stale header: says `zoomAboutPivot` is "exported and unit-tested below" (it now lives in `mapView.ts`, re-exported), and that "A GBA follow-up for `MapCanvas.tsx:532-542` is filed separately" (done in E1). |
| F5 | Nit | `mapView.ts:17-21` | Doc says it is "Called from exactly one `setView(v => zoomAboutPivot(v, ...))` site". It now has two call sites (GBC `setView`, MapCanvas `updateView`), and in controlled mode it runs outside a React updater. |
| F6 | Info | `MapCanvas.tsx:354-355` | `viewRef.current = view` is a render-phase ref write. A discarded concurrent render could leave a non-committed view in the ref until the next commit. Negligible here; StrictMode's double render writes the same value. |
| F7 | Info | `:358` | X4 (controlled drag also `setOwnView`) survives, but it is observably equivalent while controlled: the internal state is unread and only surfaces on a controlled->uncontrolled switch. X7 (same-zoom no-op suppression removed) survives; the spec does not require suppression. |
| F8 | Info (spec-intended) | `styles.css:710-726` | GBA now gets the 44 px wrapping strip and `margin-left: 0` hover (left-aligned, was right-aligned via `margin-left:auto` `:677`). This is the spec's "same declarations"; no GBA test pins it. The implementer flagged it. |

## Mutation table

Harness: `C:/Users/Serve/AppData/Local/Temp/pokemap-e1-review-mutations.mjs`. Each anchor is asserted to occur exactly once; the mutation is applied in memory -> `node node_modules/vitest/vitest.mjs run <file> [-t <pat>]` -> `finally` restores the saved bytes and byte-compares (all identical). `git status` after: only the pre-existing `?? .codex/` and `?? task-E2-spec.md` (neither touched). Baseline MapCanvas.test.tsx 53/53.

| id | anchor -> replacement | run | result |
|---|---|---|---|
| E1-M1a | `const applyZoom = ... updateView((v) => zoomAboutPivot(v, next, pivotX, pivotY));` -> uncontrolled `setOwnView(prev => { setOwnView(p => ({zoom:next, pan: zoomAboutPivot({zoom:prev.zoom,pan:p.pan},...).pan})); return {zoom:next,pan:prev.pan}; })` (old nested pattern) | `MapCanvas.test.tsx -t "under <StrictMode>"` | **RED** (1 failed) |
| E1-M1b | same anchor -> pan transform applied twice per zoom | same | **RED** (1 failed) |
| E1-M2 | `  min-height: 0;⏎  min-width: 0;⏎  display: flex;` -> drop min-width line | `styles.test.ts -t "min-width: 0 on .map-canvas"` | **RED** (1 failed) |
| E1-M3 | `const view = controlledView ?? ownView;` -> `const view = ownView;` | `-t "controlled view"` | **RED** (4 failed: first-draw, 4x, drag, image-load) |
| E1-M4 | `if (!controlled) fit();` -> `fit();` | `-t "image load never reports"` | **RED** (1 failed) |
| X1 | `next(viewRef.current)` -> `next(controlledView!)` (stale closure base) | `-t "controlled view"` | SURVIVED (F1) |
| X2 | `}, [zoom, updateView]);` -> `}, [zoom]);` (stale onViewChange in wheel) | `-t "controlled view\|wheel"` | SURVIVED (F1) |
| X3 | `}, [zoom, updateView]);` -> `}, []);` (stale zoom in wheel) | whole file | SURVIVED (F2, pre-existing) |
| X4 | drag `updateView(...)` -> `setOwnView(f); updateView(f);` | whole file | SURVIVED (F7, equivalent while controlled) |
| X5 | `if (!controlled) fit();` -> `if (controlled) fit();` (uncontrolled auto-fit broken) | whole file | **RED** (5 failed incl. B4 "toggling Encounters on does not re-fit") |
| X6 | `updateView({ zoom: z, pan: p });` -> `setOwnView(...)` (Fit bypasses controlled) | `-t "Fit button reports"` | **RED** |
| X7 | `if (n !== viewRef.current) onViewChange?.(n);` -> `onViewChange?.(n);` | whole file | SURVIVED (F7, not required) |
| X8 | drag `d.panX/d.panY` -> `v.pan.x/v.pan.y` (accumulating base) | whole file | SURVIVED (F2, pre-existing) |
| probe | whole `MapCanvas.tsx` <- `git show aa3b338:...`; StrictMode assertions -> logs | `-t "under <StrictMode>"` | 2x `[-96,-96]`, 4x `[-480,-480]` |
