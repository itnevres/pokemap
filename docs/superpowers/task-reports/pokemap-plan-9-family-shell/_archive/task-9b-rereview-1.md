# Task 9b re-review 1 (fix dd1eab7..782cb77)

## Finding Verdicts
- **S-I1 in-context "map on screen" check tautological** - ADDRESSED. AppContextEdit.test.tsx ~387-450 and GbcAppContext.test.tsx ~599-660 now log the overlay stage's drawImage calls and assert dest x/y within 1 px of fitWithBand(...).pan and w/h == pw*zoom, ph*zoom, after both F and the Fit button; fixtures fit above 1x (`expect(expected.zoom).toBeGreaterThan(1)`), and the test first zooms to 400% so F must move it. Mutations RUN (cmd: `npx vitest run packages/ui/test/AppContextEdit.test.tsx packages/ui/test/gbc/GbcAppContext.test.tsx`):
  - Baseline: 2 files, 38/38 pass.
  - (a) wrong zoom: `levels: chromeless ? [1] : ZOOM_LEVELS` in MapCanvas.tsx and GbcMapCanvas.tsx fit(): both R5 tests FAIL (36 pass, 2 fail). Reverted.
  - (b) wrong pan: chromeless fit passes pan {-99999,-99999} (both canvases): both R5 tests FAIL (2 fail). Reverted.
  Checkout restored via `git checkout packages/ui/src`; no tracked changes.
- **Q-I1 fitContext duplicated in WorldCanvas/GbcWorldCanvas** - ADDRESSED. Both fitContext blocks deleted (WorldCanvas.tsx ~1451, GbcWorldCanvas.tsx ~950); both now call `worldContext.fit()` from shared/useWorldContext.ts.
- **Q-I2 composite size re-derived** - ADDRESSED. The re-derivation is gone; in-context Fit is the map canvas's own `fit` (MapCanvas.tsx:~437-452, GbcMapCanvas.tsx:~427-446), using its pixelWidth/pixelHeight and viewport fallback. Tests now derive pw/ph from the ROUTE1/OlivinePort payload layout (border-inclusive) rather than from the placement formula; remaining formula in tests is the map payload dimensions, an independent oracle from the production code path.
- **Q-m5 fitEnabled true while in-context fit is a no-op** - ADDRESSED. `fitEnabled = !!(placement && contextOrigin && hasMapFit)` (useWorldContext.ts:68); `hasMapFit` is state set by registration, so button disabled and F ignored until the chromeless map canvas has mounted and registered.

## R5 re-check (new design)
- Fit/F in-context fit the edited map exactly as Map view's Fit (same function, same fitWithBand inputs; band 0 because chromeless hides encounters). Disabled while context map loads (no registration until MapCanvas mounts; origin null until layout). F: still goes through useFitShortcut/shortcutBlocked (modifiers, text fields, aria-modal unchanged). One listener per view: chromeless map canvas calls `useFitShortcut(fit, !chromeless)` so it never listens; world canvas has the only one.
- Lifecycle: registration is an effect with cleanup `register(null)` keyed on [register, chromeless]; exit unmounts overlay -> null, hasMapFit false (no stale fit). Context-map switch: either remount (null then re-register) or same instance with `latest` ref pointing at current fit. StrictMode double-effect: register, null, register, ends registered. Provider is inside the renderCanvas closure so non-overlay map canvases get a null context (hook no-ops). No new breakage found.

## New Breakage in the Fix Diff
None. (Minor, non-blocking: `fit` in the world canvases and `useWorldContext.fit` are recreated each render instead of useCallback; harmless since useFitShortcut reads via ref and the Fit button handler is not memo-dependent.)

## Out-of-Scope Observations
None.

## Verdict
**Fix round:** All findings addressed, no new Critical/Important breakage.
