# Task 9b spec-compliance review (R5, Fit to screen)

Range 4c2abe1..dd1eab7 (one commit dd1eab7). Inputs: brief, implementer report, the review diff, spec R5 (lines 21-26, 203-209, 231).

**Verdict: Spec ✅ with one Important test-strength finding.** The code meets R5 in both families. One brief-required assertion ("context map on screen") is tautological, so the in-context pan has no test (mutation-proven below). Counts: Critical 0 / Important 1 / Minor 3.

## Requirement checklist

| Requirement | Status | Evidence |
|---|---|---|
| `useFitShortcut(fit, enabled)` in `shared/`, uses `shortcutBlocked`, ignores Ctrl/Meta/Alt/Shift, preventDefault only when it acts | ✅ | Matches the brief's code exactly. Ctrl+F returns before `preventDefault`, so the browser's find still works. |
| Focus 6: F in the palette search or an inspector field never refits | ✅ | `isTextTarget` (`input, textarea, select, contenteditable`) in `shortcutGuard.ts` covers both. A unit test covers "f in an input". |
| Map canvases listen only when not chromeless | ✅ | `useFitShortcut(fit, !chromeless)` in MapCanvas.tsx:448 and GbcMapCanvas.tsx:438. |
| World canvases: `fit` = world fit outside context, context-map fit inside; `fitEnabled`; button `disabled={!fitEnabled}` | ✅ | WorldCanvas.tsx ~1453-1475, GbcWorldCanvas.tsx ~951-973 |
| Every Fit button labelled `Fit` with title "Fit to screen (F)" | ✅ | 4 buttons. No `"Fit world"` / `"Fit all"` label is left in src; only doc comments changed. |
| Reuse `fitWithBand`, no second fit formula | ✅ | Both world canvases call `fitWithBand` and then `worldViewFromMapView`. |
| Tests: 10 unit + 4 per-canvas + 2 in-context = 16, label retargets, GbcAppContext disabled→false retarget | ✅ | All present. Removed-line accounting in the report matches the diff: 7 removed lines, each with a stated reason. |
| StrictMode witness uses `reactStrictMode: true` | ✅ | useFitShortcut.test.tsx, first test |
| Per-canvas F tests keep the source test's assertions | ✅ | Checked against the source tests: MapCanvas.test.tsx:278, GbcMapCanvas.test.tsx:323, and the WorldCanvas and GbcWorldCanvas Fit tests. Every assertion is copied, plus the title check. |

## Named risks

**1. In-context framing equals Map view's Fit.** Checked outside the diff against MapCanvas.tsx:387-447, GbcMapCanvas.tsx:366-437, `compositeOrigin` (MapCanvas.tsx:145), world/contextView.ts and the adapters' `origin`.
- **pw/ph:** GBA `pixelWidth = (layout.width + 2*BORDER_RINGS*borderWidth)*16`, and `compositeOrigin.x = BORDER_RINGS*borderWidth*16`. So `contextSize.width*16 + 2*origin.x` equals pixelWidth. The same holds for height. GBC: `(width + 2)*32` equals `width*32 + 2*GBC_COMPOSITE_ORIGIN`. ✅
- **vw/vh:** these are the world canvas's viewport, with the same `|| pw` fallback the map canvases use. That is the brief's "viewport of the world canvas's size". ✅
- **Levels:** `ZOOM_LEVELS` [1,2,4]. These are the same steps `useWorldContext.stepZoom` and `snapContextZoom` use, so the overlay stays on a step. ✅
- **Band:** the code passes `bandNative: 0` unconditionally. This is correct today. The encounters toggle exists only in the map canvas toolbar (MapCanvas.tsx:877), which the chromeless overlay does not render, and `encountersFor` resets per map. So the in-context overlay can never show encounters, and Map view's equivalent input is 0. ✅ (see m3)
- **Pan:** derived by hand. The world canvas draws the map's top-left tile at `p.x*scale + worldPan.x`, which equals `view.pan.x + originX*view.zoom`. The composite top-left therefore lands at `view.pan.x`, which is exactly the MapCanvas pan that `fitWithBand` returns. `native` is 16 by default for GBA (= TILE_PX) and BLOCK_PX for GBC. ✅ (0 px error, before rounding of the integer pans that fitWithBand already produces)

**2. `fitEnabled` while loading.** `inContext = context !== null`, and the canvases pass `context ?? null`. When `context` is null or undefined, `inContext` is false and Fit is enabled (world fit). When in context, `context` is non-null, so `context?.origin !== null` is false exactly while the origin is null. The GBA adapter sets the origin to `contextLayout ? compositeOrigin(...) : null` and the GBC adapter to `ready ? ... : null`. ✅ The GBC pending test asserts the button is disabled. GBA has no equivalent test (m2).

**3. Hook order and listener count.** An awk scan from each component's start to its `useFitShortcut` call found no top-level `return` in any of the four canvases. ✅ FamilyApp.tsx:212 renders exactly one of map/world/dungeon, so there is never a hidden second canvas. In context, only the world canvas listens, because the overlay MapCanvas/GbcMapCanvas is chromeless (gba/adapter.tsx:87, gbc/adapter.tsx:109). One exception is noted as m1.

**4. Do the in-context tests pin the framing?** Partly. Two temporary mutations were run, with focused vitest on both in-context tests (`-t "Plan 9 R5"`), and the files were restored afterwards.
- **M1:** in-context Fit does the whole-world fit (`if (false) fitContext()` in both canvases). Both tests **fail**. ✅ The zoom assertion catches it.
- **M2:** zoom left correct, pan forced to (-99999, -99999), which puts the map entirely off screen, in both canvases. Both tests **pass**. ❌ See I1.

## Findings

### Important

**I1. The "context map is on screen" assertion is tautological, so the in-context pan (the "top-left at the same screen offset within 1 px" requirement) has no test.** Files: AppContextEdit.test.tsx (new test, ~lines 393-405) and gbc/GbcAppContext.test.tsx (new test, ~lines 605-613).
- In both files the world canvas's and the overlay stage's `getBoundingClientRect` are stubbed to the **same** `RECT` (AppContextEdit.test.tsx:101 and :393; GbcAppContext.test.tsx:111 and :126). The "stage rect inside world rect" checks therefore compare RECT with itself.
- The check also cannot detect the bug even in principle. The chromeless stage box equals the overlay box whatever the view is, and the map's position lives in the controlled MapCanvas `view.pan`, not in the element rect.
- M2 above proves the tests pass with the map sent off screen.
- The zoom check is also weak. In both fixtures `fitWithBand` returns the floor level (GBA: ph=192 > vh=100; GBC: pw=384 > vw=200), so any fit that lands on 1x passes.
- The code is correct by hand derivation (risk 1). This is a test-strength gap against the brief's own Review Focus, not a behaviour bug. The brief prescribed this assertion's form, so the implementer followed it literally.
- **Fix:**
  - Assert the overlay map canvas's actual placement after F and after the Fit click. For example, check the overlay stage's last `drawImage` destination x/y, or the map's selection or context rect, against `fitWithBand(...).pan` with `toBeCloseTo(…, 0)` / ±1.
  - Optionally use a viewport or fixture where the fit lands above the floor step (e.g. stub `clientWidth`/`clientHeight` large enough for 2x), so the zoom check discriminates too.

### Minor

**m1. Two F listeners can be registered while the warp-destination modal is open.** WarpDestinationModal.tsx:61 and GbcWarpDestinationModal.tsx:16 mount a non-chromeless MapCanvas/GbcMapCanvas inside World view. Both it and the world canvas listen. Neither fires, because the modal is `aria-modal="true"` and `shortcutBlocked` stops both, so there is no behavioural violation of "at most one effective listener". Noted for the record only.

**m2. No GBA test that in-context Fit is disabled while the context map loads.** GBC has one (the pending-context test). GBA's `fitEnabled` logic is identical and the brief did not require a GBA test.

**m3. `bandNative: 0` is hard-wired.** It is correct only because the chromeless overlay cannot turn encounters on. If a later plan exposes the encounter overlay in context, this fit silently diverges from Map view's. A one-line comment at the call site would record that assumption. The brief's "same encounter band when the overlay shows encounters" is satisfied today because it never does.

## Not re-run
I did not re-run the full gate. The implementer reports 2,761 pass, 175 files, typecheck 0 and build 0, which is consistent with the +16 tests counted in the diff. My only runs were the two focused mutation runs above.

## Checkout state
Mutations were applied to WorldCanvas.tsx and GbcWorldCanvas.tsx and then restored from backups. `git status` afterwards shows no tracked changes. The untracked files are the pre-existing reports plus `task-9b-quality-review.md`, which the parallel quality reviewer wrote, not me.
