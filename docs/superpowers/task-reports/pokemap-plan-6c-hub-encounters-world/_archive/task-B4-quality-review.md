# Task B4 code-quality review

Scope: `git diff 8805d12 cce74dd -- packages/` (cb29a03..1d41aa1). Read-only (git show/diff); nothing run.
**Verdict: CHANGES REQUESTED** (1 Important, 5 Minor, 4 Nit). Core design is sound; the Important is a spec/test gap with a small fix.

## Clean checks
| area | result |
|---|---|
| Paint chain (`pendingPaintRef`/`endActiveStroke`), `applyZoom` | untouched in diff |
| Setter updaters (StrictMode double-invoke) | nothing new inside one; `fit` = plain `setZoom`+`setPan` / `setView`; hook setters run in promise callbacks; `toggle` updater is pre-existing and pure |
| Hook stale/unmount | closure captures the effect's `mapName`, so a late response lands under its own key; hook reads the current map only; React 19 has no setState-after-unmount warning; per-instance `useRef` Map (no module state); StrictMode double effect covered by the sync placeholder |
| Hook cache key | mapName only; `family` is constant per canvas (see QR-9) |
| `fit()` math | left/top offset `bandNative*z` correct, integer pan, right/bottom need none; deps complete (`toggles.encounters`, `side`); `fittedForMapRef` effect still `[imgLoaded, mapName]` (eslint-disabled, as before), and the first fit runs after the per-map toggle reset because image load is async |
| Memo deps | `side` [connections]; `borderEntries` [mapName, pan.x, pan.y, pixelWidth, pixelHeight, zoom, side, encounterSummaries]; `encounterSummaries` is the cached array ref, so stable |
| `WarpDestinationModal` | renders `MapCanvas` read-only; behaviour unchanged besides the extra Encounters button; `?? []` keeps its fixture alive (see QR-4) |
| CSS | none added; reuses `map-canvas__btn`, `map-canvas__legend-item`, `encounter-border*`; no `.btn`; tokens only |
| a11y | `aria-pressed` toggle in the labelled Overlays group; error `role="alert"` is inserted when the error arrives (announced); sprites keep their own labels |
| Test hygiene | no jest-dom matchers; exact-value rect tests with hand-derived comments; viewport `defineProperty` is reset by the files' own `beforeEach` |

## Findings

### QR-1 Important: toggling Encounters still recomposites when any other overlay is on; the "no recomposite" test only covers the all-off state
`MapCanvas.tsx` base-composite effect (deps include the whole `toggles` object, ~L494) and the `GbcMapCanvas.tsx` equivalent. `toggle("encounters")` makes a new `toggles` object, so the effect re-runs. With Grid/Collision/Elevation/Events on, `anyOverlay` is true, so it does `getImageData` + overlay draws + `putImageData` over the full image for a DOM-only change. Spec section 3: "`encounters` does not join `anyOverlay`'s recomposite: the border is DOM, not canvas pixels." Deviation 2 in the implementer report admits the base redraw but not this. The tests (`MapCanvas.test.tsx` "does not recomposite...", GBC twin) run with every overlay off, so `putImageData` is never called by anything; they only kill the "`encounters` in `anyOverlay`" mutant and pass while the behaviour is wrong in the common state.
Fix: depend on the individual flags (`toggles.grid, toggles.elevation, toggles.events` plus `showCollision`; GBC `toggles.grid, toggles.collision, toggles.events`), or memo a canvas-only overlays object. Then add to both tests a second case with Grid on first (reset the `putImageData` mock, click Encounters, expect no new calls).

### QR-2 Minor: sprites steal the canvas `mouseleave`, so a paint stroke or event drag that crosses the band is abandoned (edit view only)
`MapCanvas.tsx` `onMouseLeave` (L863-877) clears `dragRef`/`eventDragRef` and calls `endActiveStroke(null)` while a stroke is open. The border is a sibling above the canvas; its sprite and `+N` buttons are `pointer-events: auto`, and React's `onMouseLeave` fires when the pointer moves from the canvas onto a non-descendant. Scenario: Encounters on, rect/brush tool, drag from the map edge out over the band: the stroke ends the moment the cursor meets a sprite (a rect is dropped). Without the border the pointer stays on the full-viewport canvas and the stroke continues. Niche, but in the race-prone area and untested.
Fix options: accept and note it (report/DESIGN.md); or set sprites `pointer-events: none` while a stroke/drag is open; or ignore the leave when `e.relatedTarget` is inside `.encounter-border`.

### QR-3 Minor: spurious fetch for the new map on a prop-only map switch
The hook effect (`useMapEncounterSummaries.ts` L29-33) is declared before the per-map reset effect (`MapCanvas.tsx` ~L387, `GbcMapCanvas.tsx` ~L276). On `mapName` change with Encounters on, the first commit has the new `mapName` with the old `toggles.encounters === true`, so the hook fetches the new map, and only then does `setToggles(NO_TOGGLES)` run. Spec: "Fetch only when `enabled`". Masked in the real apps (`App.tsx` goes through "Loading..." and `GbcApp` through `ready` null, so the canvas remounts and the cache dies; I did not trace every path) but real for a prop-only switch; the transient render also draws the border for the new name with the old pan. The "resets to off when the map changes" tests do not assert the fetch count, so the leak is unobserved.
Fix: add `expect(f).toHaveBeenCalledTimes(1)` after the rerender (should go red), then gate the hook's `enabled` on a per-map toggle (e.g. store `encountersFor: mapName` in the toggle state) or document it.

### QR-4 Minor: production code tolerates test fixtures that violate the type (`connections ?? []`)
`MapCanvas.tsx` ~L367-373. `MapData.connections` is non-optional; the guard exists for two hand-built fixtures (`WarpDestinationModal.test.tsx`, `WorldCanvas.test.tsx`) and the comment names tests from inside `src`. It also makes GBA and GBC inconsistent (GBC has no guard). The deviation is acceptable, but not the better trade. Preferred: add `connections: []` to those two fixtures (two named one-line test edits) and drop `?? []` and its comment.

### QR-5 Minor: legend error text can overflow the legend row
`.map-canvas__legend-item` is `inline-flex` with no `min-width: 0`/wrap. The `fetchGuarded` message embeds up to 200 chars of `JSON.stringify` output (no spaces), so one unbreakable token wider than the panel overflows the flex-wrap row (`.map-canvas__legend` is not clipped). Binding rule: long text in flex needs `min-width: 0`.
Fix: CSS only, e.g. `.map-canvas__legend-item[role="alert"] { min-width: 0; overflow-wrap: anywhere; }`.

### QR-6 Minor: duplication across the two canvases
About 15 lines of fit math (`extraW/extraH`, candidate loop, pan offset), the `borderEntries` memo and the legend/toggle JSX are copy-pasted, differing only in `UNIT`/`BORDER_BAND`/setter. Acceptable for B4 (spec says plain setters), but the exact-value math is only tested through two heavy component harnesses. A pure `fitWithBand({pw, ph, vw, vh, bandNative, side}) -> {zoom, pan}` in `encounters/borderSide.ts` keeps each `fit` as `setZoom`+`setPan`/`setView` of its result, and gives one unit-testable function. Not blocking.

### QR-7 Nit: legend reads "Encounters: hover a sprite" while loading and for a map with no wild encounters
The hook returns `undefined` (loading) or `[]`; `EncounterBorder` renders nothing for both, so the line promises sprites that are absent. It also says "hover" only; sprites are focusable (the world legend says "Hover or focus"). Suggest "hover or focus" and, if cheap, a loading/none variant.

### QR-8 Nit: comment/doc accuracy
- The `EncounterBorder.tsx` component JSDoc ("Off by default behind one toggle; the legend only exists while it is on") still describes only the uncontrolled mode; point it at `enabled`.
- `DESIGN.md` new paragraph has an odd line break after "Overlays group", and the preceding "Off by default behind one `Encounters` toggle" sentence is now true only for the world views.

### QR-9 Nit: hook minutiae
`useRef(new Map())` allocates a Map every render. The cache is keyed by `mapName` only, so a changed `family` prop would serve the other family's entry (constant per canvas today; key `${family}:${map}` is free). A cached error is never retried until remount (as specced).

### QR-10 Nit: test quality
- Hook test "a late response..." uses a real `setTimeout(r, 10)` before its negative assertion; the positive evidence (Foo cached via `rerender Foo -> []`) only follows. It fails safely if the 10 ms was too short, but the sleep is decorative; prefer a `waitFor` on Foo's cached answer first.
- "true -> false clears an open tooltip" alone does not kill the `ownEnabled` deps mutant (implementer noted); the resurrect test does. Both kept, fine.
- Deviation 4 (hook and `EncounterBorder` tests written after the code) accepted: the mutation table shows the tests bite.

## Over-built?
No. The version counter, placeholder and memoised entries are all needed. Nothing to delete.
