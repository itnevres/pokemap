# E4 implementer report: GBA in-context edit mode

**Status: DONE_WITH_CONCERNS** (concerns: 2 deviations, both additive; see Concerns). Base 664189b, branch plan-6c-hub-encounters-world, not pushed. GBC code untouched. Nothing saved to the real decomp (live check was read-only: entered context, 2x, Escape).

## Commits (pathspec, Opus 5.5 trailer)
| sha | what |
|---|---|
| cedccb9 | `world/contextView.ts` + `test/world/contextView.test.ts` |
| 595b054 | MapCanvas `chromeless`, `compositeOrigin` + 5 tests appended to `MapCanvas.test.tsx` |
| 201fce5 | MapEditingWorkspace `active` + `test/MapEditingWorkspaceActive.test.tsx` |
| 6b1e73b | WorldCanvas in-context mode, WorldContextMenu Escape `preventDefault`, `test/WorldCanvasContext.test.tsx` |
| 395d7eb | App wiring + `test/AppContextEdit.test.tsx` |
| bc4562c | CSS, DESIGN.md "In-context editing (GBA)", `test/stylesContext.test.ts` |

## Files changed
src: `world/contextView.ts` (new), `components/MapCanvas.tsx`, `MapEditingWorkspace.tsx`, `WorldCanvas.tsx`, `WorldContextMenu.tsx` (1 line), `App.tsx`, `styles.css`, `DESIGN.md`.
test (all new except the MapCanvas append): `world/contextView.test.ts`, `MapEditingWorkspaceActive.test.tsx`, `WorldCanvasContext.test.tsx`, `AppContextEdit.test.tsx`, `stylesContext.test.ts`; `MapCanvas.test.tsx` (+57 lines).
New tests: 16 + 5 + 3 + 24 + 10 + 4 = 62.

## API additions
- `contextView.ts`: `snapContextZoom(worldZoom): Zoom`; `enterContextView({placement:{x,y,width,height}, pointer, zoom}) -> {zoom, pan}`; `mapViewFromWorld({placement:{x,y}, worldPan, worldZoom, originX, originY}) -> MapView`; `worldViewFromMapView({placement:{x,y}, view, originX, originY}) -> {zoom, pan}`. Exactly as ruled (pan rounded only in `enterContextView`).
- `MapCanvas`: prop `chromeless?: boolean`; export `compositeOrigin(layout) -> {x,y}` (used by MapCanvas itself for originX/Y, and by App).
- `MapEditingWorkspace`: `active?` as a discriminated union. Active (default): unchanged props. `active:false`: `mapName: string|null`, `data: MapLayoutData|null`, `renderCanvas: (p: MapEditingCanvasProps|null) => ReactNode` (required). `canvasProps` keys unchanged (the existing exact-keys test passes).
- `WorldCanvas`: `onEditHere` now also fires on a plain double-click; new `context?: WorldCanvasContext {map, origin:{x,y}|null, renderCanvas(view, onViewChange): ReactNode, onExitRequest()}` and `tileVersions?: Record<string, number>`. Exported type `WorldCanvasContext`.
- `App`: `contextMap`, `tileVersions` state; `enterContext`, `requestExitContext`, `switchMode`, `renderWorld`.

## Derived numbers in tests
snapContextZoom: 0.5 -> log2(1/32) = -5 -> clamp 0 -> 1; 16 -> 0 -> 1; 22 -> log2(1.375) = 0.459 -> 1; 23 -> log2(1.4375) = 0.524 -> 2; 45 -> log2(2.8125) = 1.492 -> 2; 46 -> log2(2.875) = 1.524 -> 4; 200 -> log2(12.5) = 3.64 -> clamp 2 -> 4.
enterContextView: p(10,20) 30x20, ptr(200,150), z2 -> centre (25,30)*32 = (800,960) -> pan (-600,-810), zoom 32. p(3,4) 5x7, ptr(100,100), z1 -> (88,120) -> (12,-20). p(0,0) 3x3, ptr(50,60), z4 -> (96,96) -> (-46,-36). Rounding: ptr(100.5,100.5) -> (13,-19) (Math.round .5 up).
mapViewFromWorld: spec example (10,20), origin 32, worldPan (5,-7), zoom 32 -> (261,569); (0,0), origin (16,32), pan (100,50), zoom 16 -> (84,18); (-3,2), origin (48,32), pan (-10,7), zoom 64 -> (-394,7).
worldViewFromMapView: {2,(261,569)} -> zoom 32, pan (5,-7); round-trip both directions on two cases.
WorldCanvasContext fixture (viewport 100x100, A [0,10)^2, B (20,0) 3x3, zoom 1 pan 0): centre fallback snap: B centre (21.5,1.5)*16 = (344,24), pan (50-344,50-24) = (-294,26); MapCanvas view (320-294-16, 26-16) = (10,10); stage draw of B = (26,26,48,48). Double-click pointer (21,1): pan (-323,-23), view (-19,-39). Menu (22,2) and key-menu (21.5,1.5): pan (-322,-22), view (-18,-38). Lock-step: view {2,(-100,40)} -> world zoom 32, pan (-100+32-640, 40+32) = (-708,72), B drawn (-68,72,96,96). 4x about (50,50) from {1,(10,10)} -> (-110,-110). Clamp: 16*1.2^n capped at 64 -> "400%"; outside capped at 16 -> "100%". Outside-double-click: map rect [26,74)^2, edges inclusive/exclusive checked.

## Red proofs
Each test file was written before its implementation and run red (missing module / missing feature) first; contextView, chromeless, active, App and CSS reds recorded then. WorldCanvasContext was implemented before its first run, so its red proofs are in-memory source mutations of the final code (script `mutate.mjs`: edit in memory, run vitest, restore the saved bytes, byte-compare; every run printed "restored byte-identical: true"):
| mutation | test(s) red |
|---|---|
| E4-M1 `mapViewFromWorld` drops `originX*z` | 3 literal mapViewFromWorld tests + the round-trip |
| E4-M2 clamp stays 16 in context | zoom clamp in context |
| (clamp always 64) | clamp outside context |
| E4-M3 exit ignores `isDirty` | App Escape-dirty, Done-dirty, committed-save (3) |
| E4-M4a cache `.clear()` | tileVersions single-request |
| E4-M4b no `?v=` | both tileVersions tests |
| E4-M5 workspace renders differently inactive | MapEditingWorkspaceActive (2) and AppContextEdit (4: same node, Done, save, tree click) |
| (World key changed on inactive branch) | same 4 App tests |
| E4-M6 marker also calls onEditHere | marker test |
| E4-M7 Escape ignores `defaultPrevented` | Escape / prevented test |
| menu `preventDefault` removed | Escape-with-menu test |
| modal guard removed | modal test |
| menuOpen guard removed | Escape-with-menu test |
| snap pointer ignored | snap-at-pointer, menu and key-menu snaps (3) |
| outside-dblclick inverted / bar skip removed | outside-dblclick test (both) |
| snap gating (`snappedFor`) removed | snap test (`views[0]` is already the snapped view) |
| lock-step `setZoom` removed | lock-step + 1x/2x/4x buttons |
| ctrl/meta/shift/drag guard removed | modifier test + end-of-drag test |
| tile bump removed (App) | committed-save |
| tree-click `setContextMap(null)` removed | same-map tree click test |
| cancelled confirm still enters | cancelled test (needs the MutationObserver "overlay never mounted" assertion; the selected-change effect otherwise cleans it up) |
| Map button bypasses `switchMode` | mode-switch test |
| chromeless viewport background | stylesContext |
| legend not hidden in chromeless | MapCanvas legend test |
| `active &&` dropped on Toolbar | MapEditingWorkspaceActive inactive test |

## E4-M1..M7 self-run (final code)
M1 red (4 tests), M2 red (1), M3 red (3), M4 red (1 for `.clear()`, 2 for no-`?v`), M5 red (2 + 4), M6 red (1), M7 red (1). All restored byte-identical.

## Existing-test removed-lines check
`git diff 664189b -- packages/ui/test | grep '^-[^-]'` -> empty output. Existing test files touched: only `MapCanvas.test.tsx` (append).

## Verification
- Vitest (spec list + new files + WorldContextMenu.test): 13 files, 284 tests, all pass. Includes `WorldCanvas.test.tsx`, `App.test.tsx`, E2/E3 App files, `styles.test.ts`.
- `npm run typecheck`: clean. `npm run build -w @pokemap/ui`: OK (css 43.32 kB, js 333.84 kB); build output not tracked (git clean except `.codex/`).
- Live read-only check (GBA mirror, 127.0.0.1:5183): tree-click NewBarkTown, double-click its body in World. World canvas rect = overlay rect = overlay MapCanvas stage rect = [280, 179.39, 570.86, 545.61] exactly; Toolbar and EventInspector shown; overlay MapCanvas chromeless (no `.map-canvas__toolbar`); readout 100%; 2x -> 200% with 2x pressed; Escape (clean) removed the overlay and chrome with the world still shown at 200%. No painting, no save.

## Concerns / deviations
1. **Chromeless also hides `.map-canvas__legend`** (spec said toolbar and status). The collision tool forces an overlay, which renders the legend row; that row would shrink the viewport box under the stage and break stage == world rect. Tested ("never shows the overlay legend row").
2. **Context Escape also skips when a context menu or a modal dialog is open** (spec: only `defaultPrevented`; it assumed modals stop propagation). The GBA `SaveDialog`, `WarpDestinationModal` and `SignComposer` do NOT call `stopPropagation` (only GbcWarpDestinationModal and SwitchConfirmDialog do). Without the guard, Escape in the dirty-exit SaveDialog would cancel it and the same event would reach the window listener and reopen it, so the dialog could not be dismissed by Escape (App test pins this). Menu: window listeners run in registration order and the context listener registers first, so `defaultPrevented` alone never helps; a `menuOpenRef` skip makes it order-independent. The menu `preventDefault()` is still added per spec. `defaultPrevented` itself is kept and tested (M7).
3. App's World-mode workspace is `active={false}` until the context map's layout has loaded for THAT map (`layout.data.map.name === contextMap`; `useMapLayout` keeps the previous map's data until its fetch lands). The overlay (dim + bar) shows immediately; the chrome and the overlay MapCanvas appear when the layout arrives.
4. The overlay MapCanvas mounts only after the snap has applied (`snappedFor` state), so it never renders at the pre-snap, non-1/2/4 zoom.
5. After exit the world keeps the 16/32/64 view. Outside context the wheel clamp is 16, so the first wheel-in at zoom > 16 snaps down to 16 and a wheel-out gives zoom/1.2. Behaviour outside context otherwise unchanged; no spec ruling on resetting the view, so left alone.
6. `tileVersions` refresh drops the entry for a map even if it is off-screen; it is re-requested (with `?v`) when next visible. During the reload the single tile is blank under the overlay (no stale-image hold).
7. Snap fallback and double-click pointer are in pre-chrome viewport coordinates; the Toolbar/strip/inspector appear after the layout loads and shrink the world viewport, so the map keeps its viewport-relative position but the viewport box itself becomes smaller (seen live: world rect 603 -> 545 px tall).
8. `Mode`-switch and tree-click both leave context through explicit `setContextMap(null)` plus a `selected !== contextMap` safety effect; the effect alone would not cover a same-map tree click (tested).
9. `onEditHere` is wired to the World-mode `WorldCanvas` only (Dungeon unchanged). Grid/Collision/Events/Encounters toggles remain unreachable in context (accepted limitation); DESIGN entry notes it.
10. Paint race-safety: no change to the paint chain; the chromeless rect-stroke race test (release before `beginStroke` resolves, apply before end) passes. The reviewer should still run the `setTimeout`-delayed repro against the live overlay.
11. A stray shell `cat` I started by mistake blocked in the background (task b28gckl0p); it wrote nothing and is harmless.

---

# Fix round (after the quality + spec reviews)

**Status: DONE.** Base for this round `39edbe2`. Commits: f1068f6 (server), 0206047 (WorldCanvas + test adjustments), bcfb9f7 (App tests), plus this report/DESIGN commit. Tree clean except `.codex/`. No `git checkout/restore/stash`.

## Ruling-by-ruling
| item | change | proof |
|---|---|---|
| 1 P1-1 | `pngCache.clear()` right after `commitSave` succeeds (`packages/server/src/index.ts`), all keys. New test in `saveRoutes.test.ts` (an addition): CianwoodCity (used by no other test against the GBA subject; GBC-only files use the other project): GET render at border 0 and border 1 (cached, a repeat is identical) -> paint pencil (a metatile different from block (0,0)'s) + end + commit (200) -> both renders differ. Read-guarded restore in `finally` (`if (!current.equals(before)) writeFileSync`). Real write, same discipline as the neighbouring tests, so no handler-level stub. | Red before the fix with the real stale bytes (`expected Buffer to not deeply equal Buffer`), and red again with `pngCache.clear()` mutated to `void 0;` (byte-restored). |
| 2 P1-2 | Escape listener now `addEventListener("keydown", fn, true)` / removed with `true`; keeps `defaultPrevented`, menu-open and `[aria-modal]` guards; returns early when `e.target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')`. Comment rewritten (capture runs before every bubble handler, React flush, menu listener). | New test: a `document` bubble listener removes the `[aria-modal]` node on Escape; `onExitRequest` must not be called. Red with the listener added in bubble phase. Text-field guard: 4 tests (input, textarea, select, contenteditable), red when removed. |
| 3 P2-1 / F4 | Snap effect gated on `context.origin != null` (`hasContextOrigin` in the deps). All 3 record sites store CLIENT coordinates (dblclick `e.clientX/Y`; right-click `e.clientX/Y`; ContextMenu key: canvas rect + the centre). At snap: `canvasRef.current.getBoundingClientRect()`, pointer = client - box; fallback centre = `canvas.clientWidth/Height / 2`. | 4 tests with a shifted rect (top 58 at click, 116 at snap, via a moving `getBoundingClientRect` stub): dblclick, right-click, ContextMenu key, plus "waits for origin" (no view while `origin` is null, readout still 6%). Derivations in comments: dblclick pointer (21,59)-(0,116) = (21,-57): pan (-323,-81), view (-19,-97); menu (22,60-116=-56): pan (-322,-80), view (-18,-96); key (21.5,-56.5): pan (-322,-80), view (-18,-96). Red when: conversion dropped (3 tests), origin gate removed (1), dblclick/menu/key records canvas-relative (1 each). |
| 4 P3-1 / F6 | Upper bound `Math.max(MAX_ZOOM, zoom)`; `CONTEXT_MAX_ZOOM` and the `inContext` dep of the wheel effect removed (`inContext` still drives the Escape listener). | My in-context clamp test rewritten: set 64 via an overlay change (4x), wheel-in stays "400%", wheel-out gives "333%" (64/1.2 = 53.33). New: after leaving context the leftover 64 survives a wheel-in. Kept: outside context from zoom <= 16 the cap is still 16 ("100%"). Red with upper bound = `MAX_ZOOM` only (2 tests) -- this is the replacement for E4-M2. |
| 5 P3-2 | `snapPointerRef` cleared right after the snap reads it. | Test: enter via double-click pointer, exit, re-enter with nothing recorded -> centre fallback view (10,10), not the old (-19,-39). Red when the clear is removed. |
| 5 P3-3 | Bar `role="group" aria-label="Editing <map> in place"`; Done `aria-label="Done editing <map>"`; dim `aria-hidden="true"`; leaving context focuses the world canvas (in the snap effect's null branch, only if a context had been snapped). | Tests for each + a no-steal check for a canvas that never had a context. Red when each is removed (bar, Done (3 tests), dim, focus). |
| 6 F1 | App test: enter context on Route1, wait for the overlay stage, click Pencil, pick metatile 0x1, stub the stage rect to left/top 100, mouse down + up at client (44,33) = block (0,0) (derivation in the comment: snap pan (-240,-75), overlay view pan (-80,-91), block (0,0) spans client x [36,52), y [25,41) with the stub box). Asserts the `/api/edit/Route1/paint/begin` -> `/apply` -> `/end` URL order and the apply body (`tool: "pencil"`, `targets [{x:0,y:0}]`). | Red when the overlay MapCanvas gets `editSession={undefined}` and when it gets `activeTool={null}` (both survived before). |
| 7 F2 | WorldCanvas test: enter, press 4x, exit (rerender with no context), re-enter -> view zoom 4, pan (-110,-110) (snap(64) = 4; centre (50,50); B centre (21.5,1.5)*64 = (1376,96); pan (-1326,-46); view (20*64-1326-64, -46-64)). | Red with the snap zoom fixed at 1. |
| 8 F3 | The `selected !== contextMap` effect in `App.tsx` is KEPT. Every user route clears `contextMap` itself (tree click, lens jump, mode switch), and the overlay covers the world canvas, so with a real pointer no route reaches it; it IS reachable by a click dispatched to the canvas itself. Test: world at native zoom (wheel at (0,0) so the pan stays 0), double-click Route1's centre, then a click straight on the world canvas at PalletTown (unhittable under the overlay for a real user) -> context ends, PalletTown selected. Documented in the test as defence in depth. | Red with the effect removed. |

## Adjustments to my own E4 test files (none to files that existed before E4, except the saveRoutes addition)
- `AppContextEdit.test.tsx`: the 3 `getByRole("button", { name: "Done" })` -> `"Done editing Route1"` (the accessible name changed with the aria-label).
- `WorldCanvasContext.test.tsx`: the Done lookup -> `"Done editing B"`; the "Escape calls it once; an Escape another handler already prevented does not" test now registers its preventing listener on window in the capture phase BEFORE mounting (both are window capture listeners, so registration order decides; previously the listener was added after the mount, which only worked because the context listener was in the bubble phase); the old "wheel clamps at 64 in context" test replaced by the two tests described in item 4 (the "outside it" test kept as is).
- `AppContextEdit.test.tsx`: one comment typo fixed in the new test. No other edits.
- Tests added: WorldCanvasContext +12 (37 total), AppContextEdit +2 (12 total), saveRoutes +1 (9 total). `git diff 664189b -- packages/ui/test packages/server/test | grep '^-[^-]'` is empty.

## E4-M1..M7 self-run on the final code (in-memory mutation, bytes restored and compared every time)
| id | mutation | red |
|---|---|---|
| M1 | `mapViewFromWorld` drops `originX*z` | 4 (3 literals + round-trip) |
| M2' | wheel upper bound = `MAX_ZOOM` only | 2 (wheel-in at 64, leftover 64 after exit) |
| M3 | exit request ignores `isDirty` | 3 (Escape-dirty, Done-dirty, committed save) |
| M4a | tile refresh `cache.clear()` | 1 |
| M4b | no `?v=` | 2 |
| M5 | inactive workspace renders a different tree | 8 (2 workspace + 6 App incl. the new paint and selected-change tests) |
| M6 | marker double-click also calls `onEditHere` | 1 |
| M7 | Escape ignores `defaultPrevented` | 1 |
Plus: `pngCache.clear()` removed -> the server test red; and all mutants in the table above (bubble phase, text-field guard, client->canvas conversion, origin gate, 3 record sites, pointer not cleared, snap zoom fixed, a11y x4, refocus, overlay `editSession`/`activeTool`, selected-change effect).

## Verification
- Vitest: the spec list + `MapEditingWorkspaceActive`, `WorldCanvasContext`, `AppContextEdit`, `stylesContext`, `WorldContextMenu`, `packages/server/test/saveRoutes.test.ts`: 14 files, 308 tests, all pass.
- `npm run typecheck` clean. `npm run build -w @pokemap/ui` OK (js 334.37 kB, css 43.32 kB).
- GBA subject (`C:/Programming Projects/Pokemon Game/game`, HEAD 718b89f73) `git status --porcelain`, before my server test runs and after the last one: identical (6 pre-existing modified files `data/layouts/NavelRockZygardeChamber/map.bin`, `data/layouts/NavelRock_Fork/map.bin`, `data/layouts/layouts.json`, `data/maps/NavelRock_Fork/map.json`, `data/maps/NavelRock_ZygardeChamber/map.json`, `include/fieldmap.h`, plus untracked `docs/human-tasks-notes.md`). `git diff | sha1sum` = fcc954b2... before and after; `data/layouts/CianwoodCity/map.bin` SHA-1 = c2caf530... before and after. The server test ran 3 times against it (green, red-before-fix, red-with-mutant); each restored the file.
- DESIGN.md entry updated (capture-phase Escape, text fields, focus return).

## Notes
- The first mutation attempt of the pngCache line failed to apply (a trailing newline in the argument made the anchor not match); redone with a one-line anchor; the "OLD NOT FOUND" run changed nothing.
- Concern 5 (leftover zoom) is now handled by the cap; concern 7 (pre-chrome snap) by the origin gate + client-coordinate pointer. Not done, as ruled: P3-4 (tile reload gap), P3-9 (overlay extraction).
