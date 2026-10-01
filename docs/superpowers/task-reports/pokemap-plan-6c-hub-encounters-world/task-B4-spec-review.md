# Task B4 spec-compliance review

**Verdict: ✅ PASS.** No blocking findings. 1 minor finding needs a fix-round decision (SR-F1); the rest are informational.
Range reviewed: `8805d12..cce74dd` (code `cb29a03..1d41aa1`). Every hunk of `EncounterBorder.tsx`, `MapCanvas.tsx`, `GbcMapCanvas.tsx` and the new hook read in full.

## Gate (reviewer-run)
- Touched + deviation-affected files (`MapCanvas`, `GbcMapCanvas`, `EncounterBorder`, `useMapEncounterSummaries`, `WarpDestinationModal`, `WorldCanvas` tests): 6 files, 220/220 green.
- `npm run typecheck` clean. `npx vite build packages/ui` ok (313.74 kB JS).
- **U1:** `git diff 8805d12 cce74dd --numstat -- packages/ui/test` = `169 0`, `37 0`, `124 0`, `174 0`. Zero `-` lines, so additions only. The claim "zero existing tests edited" holds.

## Spec checklist
| item | status | evidence |
|---|---|---|
| EB controlled mode: `enabled` defined → no toggle/legend | ✅ | `EncounterBorder.tsx` `{controlled === undefined && (…control…)}`; `enabled = controlled ?? ownEnabled` |
| tooltip clear keyed on effective value | ✅ | layout-effect deps `[enabled, …]` where `enabled` is the effective value; M10 killed |
| EB tests (3 spec'd + resurrect) | ✅ | 4 tests in `EncounterBorder.test.tsx` |
| hook per-instance cache, not module-level | ✅ | `useRef(new Map())`; M8 (module-level) killed by 11 tests (hook + both canvases) |
| sync placeholder, fetch only when enabled, guarded, error cached | ✅ (see SR-F1) | `cache.set(mapName, undefined)` before `fetchGuarded(url, guard, url)`; `.catch` caches `{error}`; M1/M2/M14 killed |
| time-independent | ✅ | hook has no time param; GBC "time switch" test asserts 1 fetch |
| late response for old map doesn't change display | ✅ | return reads `cacheRef.current.get(mapName)` (the current map); dedicated hook test |
| summaries = `summarise*` | ✅ | `summariseGba(d.methods)` / `summariseGbc(d.sources)`; 2 equality tests |
| `encounters` toggle resets per map | ✅ | `NO_TOGGLES` gains `encounters: false`, reset by the existing `setToggles(NO_TOGGLES)`; test in both families |
| button last in Overlays, `aria-pressed` | ✅ | order asserted `[…, "Events", "Encounters"]` in both |
| not in recomposite; legend row on `anyOverlay \|\| encounters` | ✅ | GBA effect-local `anyOverlay` (MapCanvas.tsx:470) unchanged; GBC :336 unchanged; legend `(anyOverlay \|\| toggles.encounters)`; M6a/M6b/M11 killed |
| exact legend texts; alert on error | ✅ | GBA `Encounters: hover a sprite`; GBC `Encounters: dimmed = not at {time}, + = level can roll up to 4 higher`; `role="alert"` span; M15 killed |
| side from connections (GBA via `gbaDirToCompass`), memoised | ✅ | `useMemo(…, [connections])` both; M3a/M3b/M4 killed |
| mount in `.map-canvas__viewport`, after stage, `zoom*16`/`zoom*32`, `lodZoom 0`, band per family, `time` GBC only | ✅ | diff hunks @979/@560; M9 (GBC `time` dropped) killed |
| rect = drawn image incl. border ring | ✅ | `{x: pan.x, y: pan.y, width: pixelWidth*zoom, height: pixelHeight*zoom}`, where `pixelWidth`/`pixelHeight` include `BORDER_RINGS`; M13/M17 killed |
| `fit()` band margin + left/top offset `bandNative*z` | ✅ | both canvases; numbers re-derived below; M5a/M5b/M12 killed |
| toggling on doesn't refit | ✅ | first-fit effect still keyed `[imgLoaded, mapName]` behind `fittedForMapRef`; `fit` runs only from it and the `Fit` button. Test pins the draw rect unchanged after the toggle (both families) |
| no setter inside an updater; `applyZoom`/paint untouched | ✅ | the `MapCanvas.tsx` diff touches only imports, consts, `Toggles`, the side/hook block, `fit` body+deps, `borderEntries`, the button, the legend and the mount. `applyZoom`/`setZoom`-in-wheel/paint chain have no hunks. `fit` is plain `setZoom`+`setPan` / `setView` |
| DESIGN.md line | ✅ | added under "Encounter border"; accurate (a 6-line paragraph rather than "one line", which is fine) |

## Re-derived exact-rect numbers (by hand, from fixtures)
Fixture sizes are confirmed from the test files: GBA `DATA.layout` 2x2 with borderWidth/Height 1, so (2+2)*16 = **64x64**. GBC `layout` 2x1 + ring, so (2+2)*32 x (1+2)*32 = **128x96**. Band: GBA 4*16 = 64 native; GBC 2*32 = 64 native. Viewport comes from the `clientWidth/Height` prototype stub, and `beforeEach` restores it per test.

| case | content | z (candidates) | centred x0,y0 | pan (offset) | draw (dx,dy,dw,dh) | strip (bandPx) |
|---|---|---|---|---|---|---|
| GBA vp400 left (up+down) | 128x64 | z2: 256x128 ok; z4: 512>400 → **2** | (400-256)/2=72, (400-128)/2=136 | x 72+64*2=**200**, y 136 | **200,136,128,128** ✓ | bandPx 4*32=128 → **72,136,128,128** ✓ |
| GBA vp200 top (left+right = W,E blocked) | 64x128 | z1 ok; z2: 256>200 → **1** | (200-64)/2=68, (200-128)/2=36 | y 36+64=**100** | **68,100,64,64** ✓ | bandPx 64 → **68,36,64,64** ✓ |
| GBC vp400 left (N+S) | 192x96 | z2: 384x192 ok; z4: 768 → **2** | (400-384)/2=8, (400-192)/2=104 | x 8+128=**136** | **136,104,256,192** ✓ | bandPx 2*64=128 → **8,104,128,192** ✓ |
| GBC vp200 top (W+E) | 128x160 | z1 ok; z2: 256>200 → **1** | (200-128)/2=36, (200-160)/2=20 | y 20+64=**84** | **36,84,128,96** ✓ | bandPx 64 → **36,20,128,64** ✓ |
| no-refit GBA vp400 | 64x64 (toggle off at fit) | z4: 256 ok → 4 | 72,72 | — | **72,72,256,256** ✓ | — |
| no-refit GBC vp400 | 128x96 | z2: 256x192 ok; z4: 512>400 → 2 | 72,104 | — | **72,104,256,192** ✓ | — |

All of the implementer's numbers match. Every divisor is even, so `Math.round` never fires.

## Findings
- **SR-F1 (minor, spec "fetch only when enabled"): a map switch with Encounters on fetches the NEW map although its toggle resets off.** `MapCanvas.tsx:374` / `GbcMapCanvas.tsx:268`: the hook is called with `toggles.encounters`. On the first render after a `mapName` change, `toggles` is still the old map's (the reset is a passive `useEffect`, MapCanvas.tsx:388 / GbcMapCanvas.tsx:277). So the hook's effect sees `enabled=true` with the new `mapName` and fetches. **Probe** (temp test appended to `MapCanvas.test.tsx`, then restored byte-identical): mount Foo, click Encounters, `rerender(mapName="Bar")`, wait for `aria-pressed=false`. Fetch URLs were `["/api/encounters/Foo","/api/encounters/Bar"]`. Impact: one unrequested, cached fetch per map visited with the toggle on. `EncounterBorder` also gets `enabled=true` with the new map's entry for that one render, but `summaries` is undefined, so it shows an empty strip. Not data-corrupting. No existing test covers it; the "resets to off" tests don't count fetches. Fix options:
  - (a) reset toggles during render on a map change (React "adjust state when a prop changes": `prevMap` state + `if (prevMap !== mapName) { setPrevMap(mapName); setToggles(NO_TOGGLES); }`), which also kills the one-render flash;
  - (b) gate `enabled` on a `togglesForMap === mapName` key.

  Add a test in each family asserting the fetch count stays 1 after the switch.
- **SR-F2 (minor, test naming):** `GbcMapCanvas.test.tsx` "a time switch neither refetches nor re-fits" asserts no refetch and the dimmed label, but nothing about fit. Either add a `lastDraw()` rect assertion or drop "nor re-fits" from the name.
- **SR-F3 (info, declared deviation `connections ?? []`, GBA only): accepted.** `MapData.connections` is non-optional and the loader always normalises it (`core/src/load/maps.ts:106`). Only two hand-made fixtures omit it (`WarpDestinationModal.test.tsx`, `WorldCanvas.test.tsx` warp popup). M16 (guard removed) turns exactly those 2 red. Editing those fixtures would break B4's "zero existing-test edits" expectation, so the guard is the right choice. It is commented, scoped to the one read site and harmless. GBC fixtures all carry `connections`, so no guard is needed there.
- **SR-F4 (info):** deviation 2 (the toggle re-runs the base-composite effect: clear + drawImage, no `putImageData`) is consistent with the spec's `Toggles` design and its stated "no recomposite = `putImageData` count" criterion. Accepted. `WarpDestinationModal`'s read-only `MapCanvas` now also shows the Encounters toggle. The spec doesn't exclude it, and it is harmless.

## Mutation table
Script: in-memory bytes read at start, literal anchor asserted to match exactly once, narrowest test files run, restored from those bytes and byte-compared (no mismatch). All 20 IDs printed a result. Working-tree files are CRLF except the new hook (LF); the M9 anchor was rerun with `\r\n` after a first anchor-count-0 abort, and nothing was written on that abort. `git status` was clean after every run.

| ID | anchor (file) | result | red test(s) |
|---|---|---|---|
| M1 hook ignores `enabled` | `if (!enabled \|\| cache.has(mapName)) return;` → drop `!enabled` (hook) | KILLED | hook "does not fetch while enabled is false"; GBA+GBC "fetches … only after the click"; GBA existing "mouse-down still pans…" |
| M2 placeholder removed | `cache.set(mapName, undefined);` deleted (hook) | KILLED | hook "re-toggle while … in flight … (the placeholder)" |
| M3a GBA side always left | `() => borderSideFromConnections(…` → `"left" \|\| …` (MapCanvas) | KILLED | GBA "left + up … strip is on the right"; Fit "top, viewport 200" |
| M3b GBC side always left | same (GbcMapCanvas) | KILLED | GBC "west + north … right"; Fit "top, viewport 200" |
| M4 `gbaDirToCompass` bypassed | `.map((c) => gbaDirToCompass(c.direction))` → `.map((c) => c.direction)` | KILLED | GBA "right" fixture; Fit "top, viewport 200" |
| M5a GBA fit ignores band | `const bandNative = toggles.encounters ? … : 0;` → `= 0;` | KILLED | GBA Fit left-400 + top-200 |
| M5b GBC fit ignores band | same (GBC) | KILLED | GBC Fit left-400 + top-200 |
| M6a GBA `encounters` joins recomposite `anyOverlay` | effect-local `const anyOverlay = …events;` + `\|\| toggles.encounters` | KILLED | GBA "does not recomposite" |
| M6b GBC `encounters` joins `anyOverlay` | GBC `const anyOverlay = …` + `\|\| toggles.encounters` | KILLED | GBC "does not recomposite" |
| M7 controlled mode still renders toggle | `{controlled === undefined && (` → `{true && (` (EB) | KILLED | 2 EB controlled tests + 24 canvas tests (26 red) |
| M8 cache module-level | `useRef(new Map…)` → module `MODULE_CACHE` (hook, 2 anchors) | KILLED | 11 red: hook placeholder/switch-back/late-response + GBC fetch-once/time-switch/alert, and others |
| M9 GBC `time` not passed | `band={BORDER_BAND.gbc}\r\n time={time}` → drop `time` | KILLED | GBC "time switch…" + "morn: nite-only species is dimmed" |
| M10 tooltip clear keyed on `ownEnabled` | layout-effect deps `[enabled,` → `[ownEnabled,` (EB) | KILLED | EB "tooltip is not resurrected when enabled flips back on" |
| M11 GBA legend row only on `anyOverlay` | `{(anyOverlay \|\| toggles.encounters) && (` → `{anyOverlay && (` | KILLED | GBA legend-text test; GBA alert test |
| M12 GBA left pan offset dropped | `(side === "left" ? bandNative * z : 0)` → `0` | KILLED | GBA Fit left-400 |
| M13 GBA rect excludes border ring | rect inset by one 16 px ring | KILLED | 8 GBA border tests incl. Fit left-400 |
| M14 hook error not cached | `.catch(… cache.set(mapName, {error}))` → `cache.delete` | KILLED | hook "GBC-shaped … not retried", non-OK, GBC-wrong-shape; GBA+GBC alert tests |
| M15 GBC alert role dropped | `…legend-item" role="alert">` → no role | KILLED | GBC "failed fetch shows the error as an alert" |
| M16 deviation guard removed | `(connections ?? [])` → `connections` | KILLED | `WarpDestinationModal` "shows a loading state…"; `WorldCanvas` "double-clicking a warp marker…" (confirms the deviation's stated cause) |
| M17 GBC rect width without zoom | `width: pixelWidth * zoom, height: pixelHeight * zoom }` → unzoomed | KILLED | GBC Fit left-400 |

Spec-listed mutations: all 7 run (M1, M2, M3a/b, M4, M5a/b, M6a/b, M7), all killed. Extras: M8 to M17, all killed.
