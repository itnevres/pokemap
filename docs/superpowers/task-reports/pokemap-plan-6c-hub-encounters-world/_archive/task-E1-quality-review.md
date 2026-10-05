# E1 code-quality review (`git diff aa3b338 a8b4971`, read from committed state)

**Verdict: APPROVED** (0 P1, 2 P2, 5 P3; none blocks; the P2s are doc/test-gap follow-ups the implementer can fold in or defer).

## Checked clean
- Race-safety: the diff touches none of `pendingPaintRef` / `endActiveStroke` / `paintAt` / `beginStroke` (the only grep hit is a pre-existing doc-comment line in hunk context). Minimal-diff discipline held.
- No nested setters: `applyZoom` = `updateView(v => zoomAboutPivot(...))`; `fit()` is one call; drag is one call. `zoomAboutPivot` is pure, returns the same object on no-op, and was moved verbatim.
- The controlled path computes `next` from `viewRef.current` outside any React updater (spec 3); the uncontrolled path passes the updater straight to `setOwnView` (StrictMode-safe).
- `fit()` deps updated (`updateView`). The first-load effect gates `fit()` on `!controlled` but still stamps `fittedForMapRef` (no surprise fit later within the same map). `ZOOM_LEVELS`/`Zoom` duplicates deleted in both canvases; GBC re-exports keep `test/gbc` unchanged.
- Existing tests untouched: `git diff aa3b338 a8b4971 -- packages/ui/test | grep -c '^-[^-]'` = 0.
- Tests assert exact numbers with derivations in comments (StrictMode 2x -> -32, 4x -> -96, each with a doubled-value negation; controlled `zoomAboutPivot` -> (-18,-38); drag -> (22,-9)). They cover M1-M4. M2: the regex needs `.map-canvas\s*{`, so the `.map-canvas .map-canvas__status` rule can't satisfy it.
- Conventions: no jest-dom, no `.btn`, no new tokens or hardcoded colours.

## Findings

### P2-1 DESIGN.md not updated for the visible GBA strip change
- `styles.css:710-725` (`.map-canvas .map-canvas__status` / `__hover`). On GBA the strip goes from 28 px to a fixed 44 px. That costs 16 px of canvas viewport height on every GBA map, including the `WarpDestinationModal` body. The content is now vertically centred in the extra slack, and `__hover` goes from right-aligned (`margin-left:auto`, base rule `styles.css:676`) to flowing left after the split item.
- `DESIGN.md:239` still draws "status strip ... 28px", and `DESIGN.md:258` says nothing about the wrap/ellipsis/left-align behaviour.
- GBA hover text (~90-110 chars plus a mark) fits on one row at normal widths, so the extra 16 px is mostly dead space and the right-aligned readout is lost. The spec accepts this, but it is a user-visible design change with no doc trail.
- Fix: edit `DESIGN.md:239` to "44px, wraps to two rows" and add one sentence at `:258`: the hover readout flows left after the two status items and ellipsises as a last resort; the height is fixed so it can't feed the viewport ResizeObserver. If the 16 px loss on single-line GBA is unwanted, a separate task could keep 28 px and apply 44 px only under `.gbc-map-canvas` (min-width stays shared). Decide with the owner.

### P2-2 No test for the controlled wheel path (native-listener re-bind + `viewRef`)
- Only `MapCanvas.test.tsx:246` (uncontrolled wheel) exists. The wheel effect (`MapCanvas.tsx` ~603-614, deps `[zoom, updateView]`) is the one gesture whose closure (`zoom`, `applyZoom` -> `updateView` -> `controlled`/`onViewChange`) is rebuilt on prop changes.
- Nothing pins that controlled mode routes it to `onViewChange`, or that a rerender with a new `view`/`onViewChange` uses the fresh callback. The mutation "wheel handler still calls an old `onViewChange` or `setOwnView` in controlled mode" survives.
- Fix: add to the controlled describe:
  - mount with `VIEW` (zoom 2) and call `fireEvent.wheel(canvas,{clientX:48,clientY:16,deltaY:-100})`; assert `onViewChange` fired once with `zoomAboutPivot(VIEW,4,48-rect.left,16-rect.top)` (same rect maths as `:246`);
  - then `rerender` with a new `onViewChange` spy and a new `view`, wheel again, and assert only the new spy fired.

### P3-1 `updateView` identity churn re-binds the wheel listener and `fit`
- `MapCanvas.tsx` ~356-362: the `useCallback` deps are `[controlled, onViewChange]`. A parent passing an inline `onViewChange={v => ...}` (E4 likely will) gets a new `updateView` on every parent render, so the wheel listener is removed and re-added and `fit` is re-created on every render.
- Functionally safe (sync in commit); just wasteful, and it couples perf to caller memoisation.
- Fix: `const onViewChangeRef = useRef(onViewChange); onViewChangeRef.current = onViewChange;`, call it through the ref, deps `[controlled]`. Or document "memoise onViewChange" on the prop. The ref is preferable.

### P3-2 Controlled <-> uncontrolled switch mid-life is undefined
- `ownView` is never written in controlled mode, and `fittedForMapRef` is stamped without fitting. Flipping `view` from defined to `undefined` therefore snaps to the stale initial `{zoom:1,pan:{0,0}}` with no fit; flipping back resumes an old `ownView`.
- The React rule is "don't switch", but the prop doc doesn't say so.
- Fix: add "Do not switch between controlled and uncontrolled during a mount" to the `view` doc (`MapCanvas.tsx:119-123`). No code change needed.

### P3-3 `viewRef.current = view` written during render
- `MapCanvas.tsx` ~355. It is fine under StrictMode (idempotent), but render-phase ref writes trip the `react-hooks/refs` lint rule (v6+) and can observe an uncommitted render under concurrent features.
- Cure: assign in a `useLayoutEffect`, or compute `next` from the `view` closed over by `updateView` (add `view` to deps) and drop the ref.
- Related: in controlled mode, two gestures before the parent re-renders both compute from the same stale view (the second wins). This is inherent to controlled design; add one line to the prop doc.

### P3-4 Stale doc comments after the move
- `components/mapView.ts`, the `zoomAboutPivot` header: "Called from exactly one `setView(v => zoomAboutPivot(...))` site" is now false in the shared module (GbcMapCanvas `setView` plus MapCanvas `updateView`). Fix: "Call it from a single updater/`updateView` site per canvas, so ...".
- `gbc/GbcMapCanvas.tsx` ~44-57, header: still says `MapCanvas.tsx:532-542`'s `applyZoom` nests setPan, that "a GBA follow-up ... is filed separately", and that `zoomAboutPivot` is "exported and unit-tested below". All stale (fixed in E1; now defined in `mapView.ts`). Fix: reword to "GBA had the same bug, fixed in Plan 6c E1; both canvases share `components/mapView.ts`".
- `GbcMapCanvas.tsx` ~66-69: the blank line between `BLOCK_PX` and the `GbcView` doc comment was lost in the diff. Restore it.
- `styles.css` ~680-701: the long `min-width: 0` rationale comment now sits ~150 lines below the rule it explains (`.map-canvas` at `:513`) and directly above the strip rules, which it doesn't describe. Fix: move it to `.map-canvas` (`:513`); keep the strip comments where they are.

### P3-5 CSS pin covers only `min-width: 0`
- The new `styles.test.ts` test does not pin the strip (`height:44px`, `flex-wrap`) or the hover ellipsis, which are the other half of the D2 fix and the visible GBA change. Deleting them stays green. The spec only required the min-width pin, so this is optional: add asserts on `.map-canvas .map-canvas__status` (`height:44px`) and `.map-canvas .map-canvas__hover` (`text-overflow:ellipsis`).
- Also tighten the first regex to `(^|\})\s*\.map-canvas\s*\{` so a descendant selector ending in `.map-canvas{` can't satisfy it.

## Notes (no action)
- Controlled drag and Fit report even when the result equals the current view (always a fresh object); harmless, since the parent's setState bails out.
- `updateView` returns `setOwnView(...)` (void) in one branch and nothing in the other; fine.
