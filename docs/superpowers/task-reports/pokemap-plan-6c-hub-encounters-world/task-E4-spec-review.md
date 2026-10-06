# E4 spec-compliance review: GBA in-context edit mode

**Verdict: PASS.** Range `664189b..3492a84` (code `cedccb9 595b054 201fce5 6b1e73b 395d7eb bc4562c`). Every ruling and every listed test is met. The race repro is green and has teeth. E4-M1..M7 all go red. 3 own probes survive; all three are test gaps, not spec violations (F1-F3). Concern 7 conforms to the spec (non-blocking; cheap fix in F4).

Verification (reviewer-run): the spec's vitest list + the 4 new files + `WorldContextMenu.test` → 13 files, 284/284 pass. `npm run typecheck` is clean. No full suite, no live app, no server writes. The temp race file was deleted; `git status` shows only `?? .codex/`.

Line refs are at `3492a84`. WC = `packages/ui/src/components/WorldCanvas.tsx` (grep anchor in quotes); App = `packages/ui/src/App.tsx`.

## Checklist

| # | Requirement | Evidence | OK |
|---|---|---|---|
| 1 | Zoom clamp 64 only in context | WC:34 `CONTEXT_MAX_ZOOM = 64`; WC:1530 `Math.min(inContext ? CONTEXT_MAX_ZOOM : MAX_ZOOM` (deps include `inContext`). `MAX_ZOOM` still 16, so behaviour outside context is unchanged. | ✓ |
| 2a | Workspace `active` keeps the slot | `MapEditingWorkspace.tsx:78,96,101,120,134,154`: each `{active && …}`. Canvas `{canvas}` at :153 sits at a fixed child index in `.app__map-editing-body`. The discriminated union lets inactive take a null `data`/`mapName`. Map-mode call unchanged (diff shows no Map-branch edit). | ✓ |
| 2b | App world branch stable | App:324/332: both ternary arms are `<MapEditingWorkspace key="world-host">` in the same slot, so React reconciles them as one instance. The inner `WorldCanvas key="world"` comes from `renderWorld` at both arms. | ✓ |
| 3 | Overlay contents | WC:2138-2161 `.world-canvas__context`: dim div, then `contextView && context.renderCanvas(...)` (WC:2140), then a bar with name, 1×/2×/4× (`aria-pressed`, disabled until view) and Done. The MapCanvas renders only after layout plus snap (`contextView` needs `snappedFor === contextName && contextOrigin`). | ✓ |
| 4 | `MapCanvas chromeless` | MapCanvas:918 modifier; :919 toolbar, :955 legend (coordinator ruling) and :1022 status all `!chromeless`. CSS `.map-canvas--chromeless .map-canvas__viewport{background:transparent}`. Paint chain untouched: the diff only touches JSX wrappers and `compositeOrigin` (same formula). | ✓ |
| 5 | Pure math = spec formulas | `contextView.ts:9` `clamp(round(log2(z/16)),0,2)` → `2**k`. :15 `enterContextView`: `pan=round(ptr − (p+wh/2)·16z)`, `zoom=16z`. :30 `mapViewFromWorld`: `z=W/16`, `pan=p·W+wpan−origin·z`. :43 `worldViewFromMapView`: `zoom=16·v.z`, `pan=v.pan+origin·v.z−p·16v.z`. Substituting one into the other gives the identity algebraically (`p·W` cancels `p·16z` with W=16z, and `origin·z` cancels), so the two are exact inverses. Floating point is exact for integer inputs (all composite origins are multiples of 16). | ✓ |
| 6 | Controlled loop, sequential setters | WC:1492 `onContextViewChange`: `setZoom(v.zoom); setPan(v.pan);` are two top-level calls, with no updater fn and no nesting. Snap at WC:1462-1464 is the same. Buttons use `zoomAboutPivot(contextView, z, viewport.w/2, viewport.h/2)` (WC:1500), then the same handler. | ✓ |
| 7a | Plain double-click enters; marker first; Ctrl/Shift/drag excluded | WC `onCanvasDoubleClick`: the Shift branch returns first (open map). Then `ctrlKey||metaKey||shiftKey||dragMovedRef` returns. Then `if (warpsOn) {` marker check (WC:1676) returns on a hit. Only after that does `requestEditHere(hit.map, {x:sx,y:sy})` (WC:1686) run. Dungeon `WorldCanvas` has no `onEditHere` (App:336). | ✓ |
| 7b | Menu "Edit here" uses the same entry | `editItem … requestEditHere(map, menuPointRef.current)`. `menuPointRef` is set in the right-click path (WC:1863) and the ContextMenu-key path (map centre, WC:1879). | ✓ |
| 7c | App `enterContext` via `changeSelection` | App:131 `if (name !== selected && !changeSelection(name)) return; setContextMap(name)`. `onEditHere={enterContext}` is on the World `WorldCanvas` only (App:227). | ✓ |
| 7d | Snap: recorded pointer or centre fallback, once | WC:1459 `pointer: snapPointerRef.current ?? {viewport.w/2, viewport.h/2}`, `zoom: snapContextZoom(zoom)`. `snappedForRef` guards against a re-snap, and it resets on exit. | ✓ |
| 7e | Wait for layout | App `contextLayout` requires `layout.data.map.name === contextMap`. `origin` stays null until then, so only dim and bar show. | ✓ |
| 8a | Done / Escape / outside dblclick → `onExitRequest` | Done button calls `context.onExitRequest()`. Escape: the window listener only runs while `inContext` (WC:1480). It skips `defaultPrevented`, and (coordinator ruling) also skips while a menu or an `aria-modal` is open. Outside dblclick: WC:1509, half-open rect in overlay coords; the bar is excluded. The menu's Escape now calls `preventDefault()` (`WorldContextMenu.tsx:57`). | ✓ |
| 8b | Dirty → SaveDialog and stay | App:138 `if (editSession.isDirty) editing.setSaveDialogOpen(true); else setContextMap(null)` uses the existing SaveDialog flow. | ✓ |
| 8c | Mode switch / tree click / `selected` change exit | `switchMode` (App:144) is wired to the Map and Dungeon buttons. `selectMap` calls `setContextMap(null)` (App:108). `openMapFromWorld` does the same (App:124). Effect App:150 handles `selected !== contextMap`. | ✓ |
| 9 | Tile refresh: only that map, `?v=n`, and `?v` kept on later loads | App:369 bumps `tileVersions[contextMap]` in `onCommitted` when `contextMap === selected`. In the WC image effect, only a changed map's entry is deleted (WC:953, `delete(map)`). The src takes `?v=${tileVersions[p.map]}` on every load (WC:976). The effect's deps include `tileVersions`. | ✓ |
| 10 | CSS / DESIGN | `styles.css`: `.world-canvas__context` absolute inset 0 z 11; dim `var(--overlay-spotlight-dim)`; bar `--bg-panel-raised`/`--border-strong`/`4px`, name `min-width:0`; chromeless viewport transparent. `DESIGN.md:426` "In-context editing (GBA, Plan 6c E4)". | ✓ |
| 11 | GBC unchanged | `git diff 664189b 3492a84 -- packages/ui/src/gbc` produces empty output. | ✓ |
| 12 | Existing tests unchanged | `git diff 664189b 3492a84 -- packages/ui/test \| grep '^-[^-]'` produces empty output. The only existing file touched is `MapCanvas.test.tsx`, and that change is an append. | ✓ |
| 13 | Spec test list present | contextView (7 snap + 4 enter + 3 m-from-w + 2 w-from-m/round-trip), MapCanvas chromeless (5), WorldCanvasContext (24), AppContextEdit (10), MapEditingWorkspaceActive (3), stylesContext (4). | ✓ |

## Re-derived literals (all match the tests)

- **snapContextZoom** = log2(z/16) → round → clamp[0,2]:

  | Input | log2(z/16) | Round | Clamp | Result |
  |---|---|---|---|---|
  | 0.5 | −5 | −5 | 0 | 1 |
  | 16 | 0 | 0 | 0 | 1 |
  | 22 | 0.459 | 0 | 0 | 1 |
  | 23 | 0.524 | 1 | 1 | 2 |
  | 45 | 1.492 | 1 | 1 | 2 |
  | 46 | 1.524 | 2 | 2 | 4 |
  | 200 | 3.644 | 4 | 2 | 4 |

- **enterContextView** (pan = pointer − centre·16z):

  | Placement | Pointer | z | Centre (tiles) | Centre (px) | Pan |
  |---|---|---|---|---|---|
  | (10,20) 30×20 | (200,150) | 2 | (25,30) | ×32 = (800,960) | (−600,−810) |
  | (3,4) 5×7 | (100,100) | 1 | (5.5,7.5) | ×16 = (88,120) | (12,−20) |
  | (0,0) 3×3 | (50,60) | 4 | (1.5,1.5) | ×64 = (96,96) | (−46,−36) |
  | (3,4) 5×7 | (100.5,100.5) | 1 | (5.5,7.5) | (88,120) | (12.5,−19.5) → round (13,−19) |

- **mapViewFromWorld** (pan = p·W + worldPan − origin·z):

  | Case | x | y | Pan |
  |---|---|---|---|
  | Spec example, W=32, z=2, origin 32 | 320+5−64 | 640−7−64 | (261,569) |
  | p (0,0), W=16, origin (16,32), worldPan (100,50) | 100−16 | 50−32 | (84,18) |
  | p (−3,2), W=64, origin (48,32), worldPan (−10,7) | −192−10−192 | 128+7−128 | (−394,7) |

  Inverse: {2,(261,569)} → (261+64−320, 569+64−640) = (5,−7).

- **WorldCanvasContext fixture.** Viewport 100², B at (20,0) 3×3, world zoom 1, origin (16,16). snapContextZoom(1) = 1 (log2 = −4, clamped to 0), so the world zoom becomes 16. B's centre is (21.5,1.5)·16 = (344,24).

  | Case | World pan | MapCanvas view / result |
  |---|---|---|
  | Centre fallback, pointer (50,50) | (−294,26) | view (320−294−16, 26−16) = (10,10); stage draws B at (26,26,48,48) |
  | Double-click (21,1) | (−323,−23) | view (−19,−39) |
  | Menu (22,2) | (−322,−22) | view (−18,−38) |
  | Key-menu (21.5,1.5) | (−322.5,−22.5) → Math.round → (−322,−22) | same view (−18,−38) |
  | Lock-step, view {2,(−100,40)} | (−100+32−640, 40+32) = (−708,72); zoom 32 | B drawn at (20·32−708, 72) = (−68,72), 96×96; back-conversion gives (−100,40) |
  | 4× button | — | zoomAboutPivot({1,(10,10)}, 4, 50, 50): c = 40, so pan = 50−160 = −110 → (−110,−110) |
  | Clamp | — | 16·1.2^7 = 57.3 and 16·1.2^8 = 68.8, so the wheel caps at 64 = "400%". Outside context it caps at 16 = "100%". |

## Paint race repro (Plan 2 Task 11 lesson)

**Call chain.** In the overlay the chain runs from App `renderCanvas` → `<MapCanvas {...canvasProps} chromeless view onViewChange>`. `canvasProps` carries `editSession` and `activeTool` from `MapEditingWorkspace`. MapCanvas `onMouseDown` sets `pendingPaintRef = editSession.beginStroke().then(() => paintAt(cell))`. `onMouseUp` calls `endActiveStroke`, which waits on `pendingPaintRef` before `endStroke`. Chromeless changes only JSX, not this chain.

**Repro.** The temp file was `packages/ui/test/__tmp_e4_race.test.tsx`; it was deleted and never committed. It renders the real `WorldCanvas` with `context.renderCanvas` → the real chromeless `MapCanvas` (Foo 2×2, border 1 → origin (16,16), placement (20,0)). The `editSession.beginStroke` resolves via `setTimeout` at 0 ms and at 30 ms.

**Coordinates.** The snap (centre) gives world pan (−286,34), so the MapCanvas pan is (18,18). Block (1,1) therefore covers screen [50,66)². The test sends a pencil mousedown, mouseup and click at (55,55) in one tick, against the overlay stage.

**Result.** Both cases GREEN. Synchronously after mouseup, neither `applyPaint` nor `endStroke` has been called. The final log is exactly `[begin, apply:{pencil, targets [{1,1}], origin {1,1}}, end]`, so nothing is dropped and the order holds. This also confirms that the overlay hit-math lands on the right block.

**Teeth.** Mutation R6 (`endActiveStroke` no longer waits on `pendingPaintRef`) turns both cases RED.

## Concern 7 (snap before the chrome mounts)

**What happens.** App sets `contextMap` at once, so WC snaps on the next commit using the pre-chrome canvas box. The Toolbar, strip and EventInspector mount only when `contextLayout` lands. The canvas box then shrinks: it moves down by the toolbar/strip height and narrows by the inspector width (the report saw 603→545 px tall). Pan is canvas-relative, so on screen the map shifts down by the toolbar height. The centre fallback ends up about half the inspector width right of the new centre and about the strip height below it. With a double-click, the map no longer sits under the cursor.

**Against criterion 8.** Criterion 8 needs the tools shown with the world visible around the map. That still holds, and the spec ruling ("when WorldCanvas sees the context map become set, it applies enterContextView once") is followed literally. **Correct enough; not blocking.**

**Cheap fix (~6 lines, WC only).** See F4.

## Findings

| ID | Sev | Finding | Fix |
|---|---|---|---|
| F1 | Important (test gap; non-blocking for spec) | **Painting through the App overlay is unpinned.** R5 (overlay `MapCanvas` gets `editSession={undefined}`) and R5b (`activeTool={null}`) both survive `AppContextEdit`. Its dirty path goes through EventInspector "Add Event", not the canvas. This is criterion 8's core action. The reviewer race repro shows MapCanvas paints when given the props, but nothing pins App passing them. The coordinator's live criterion-8 run would catch it. | Add one App test: enter context on Route1, wait for the overlay stage, pick Pencil, stub the stage rect, then mousedown/up on a map cell. Assert `/api/edit/Route1/paint/begin` → `apply` (`tool:"pencil"`) → `end` fetches in order. |
| F2 | Minor (test gap) | **Snap zoom is only tested at 1×.** R11 (`zoom: snapContextZoom(zoom)` → constant 1) survives all WC and App tests, because every test enters from world zoom 1. Outside context the wheel caps at 16, so a first entry always snaps to 1×. Only a re-entry after a 2×/4× session (the world keeps zoom 32/64 after exit, per concern 5) snaps higher. | WC test: enter, press 4×, exit (rerender with no context), re-enter. Expect view zoom 4 and pan from `enterContextView` at z=4. |
| F3 | Minor (test gap) | **The `selected !== contextMap` safety effect (App:150) is unpinned.** R9 (effect removed) survives, because every tested route clears `contextMap` explicitly. The one untested route, a single world click (`selectMapFromWorld` App:117), is covered by the overlay in context, so no live bug follows. | Either drop the effect as dead (YAGNI), or add a test that changes `selected` via a route that does not clear `contextMap`. The spec lists "`selected` changing" as an exit, so prefer the test. |
| F4 | Minor (UX, concern 7) | **Snap uses the pre-chrome canvas box,** so the map shifts when the chrome mounts. | Gate the snap on `context.origin !== null`: add `!context?.origin` to the WC:1447 effect guard and `context?.origin` to its deps. `origin` turns non-null in the same App render that flips the workspace `active`, so the effect sees the post-chrome layout. Record the pointer in client coords (`e.clientX/Y`; the menu point as `sx + rect.left`). Convert at snap time with `canvasRef.current.getBoundingClientRect()`, and use `canvas.clientWidth/Height` for the centre (the `viewport` state lags until ResizeObserver fires). The overlay already waits for `snappedFor`, so no extra flash. Existing tests keep their numbers (stub rect at 0,0). |
| F5 | Info | **The 64 clamp is effectively unreachable live.** In context `.world-canvas__context` (inset 0, z 11) covers the stage, so real wheels hit the overlay MapCanvas (1/2/4 steps) or the dim layer (no-op before layout). The 64 clamp is spec-mandated and tested via synthetic wheels on the canvas. | None. |
| F6 | Info | **Report concern 5 is inaccurate.** After exit at zoom 64, a wheel-out gives `min(16, 64/1.2 = 53.3)` = 16, not zoom/1.2. Both directions jump to 16. No spec ruling covers this; cosmetic. | Optional: on exit, clamp the world zoom to ≤16 about the viewport centre. |

## Mutation table

The harness is `scratchpad/e4mut/mut.mjs`, outside the repo:
- each anchor must match exactly once;
- the mutation is written in memory;
- the narrowest vitest file is run, with `-t` where useful;
- the bytes are restored in `finally` and byte-compared afterwards.

Every row reported `restored: true`.

| ID | Mutation | Test | Result |
|---|---|---|---|
| E4-M1 | `mapViewFromWorld` drops `−origin·z` | contextView | RED 4 (3 literal + round-trip) |
| E4-M2 | Context clamp stays 16 | WCContext -t "zoom clamp" | RED 1 |
| E4-M3 | Exit ignores `isDirty` | AppContextEdit | RED 3 (Escape-dirty, Done-dirty, save) |
| E4-M4a | Tile refresh `cache.clear()` | WCContext -t tileVersions | RED 1 |
| E4-M4b | No `?v=` | WCContext + App | RED 3 |
| E4-M5 | Inactive workspace wraps the canvas differently | App + MEWActive | RED 6 |
| E4-M6 | Marker hit falls through to `onEditHere` | WCContext -t "warp marker" | RED 1 |
| E4-M7 | Escape ignores `defaultPrevented` | WCContext -t Escape | RED 1 |
| R1 | `worldViewFromMapView` sign error (`−origin·z`) | contextView + WCContext | RED 4 |
| R2 | `snapContextZoom` uses `floor` | contextView | RED 2 (23, 46) |
| R3 | `?v` only on the bump-time load (later/mount loads plain) | WCContext + App | RED 1 (mount keeps `?v`) |
| R4 | Tree click doesn't `setContextMap(null)` | AppContextEdit | RED 1 (same-map tree click) |
| R5 | Overlay MapCanvas `editSession={undefined}` | AppContextEdit | **GREEN (survived)** → F1 |
| R5b | Overlay MapCanvas `activeTool={null}` | AppContextEdit | **GREEN (survived)** → F1 |
| R6 | `endActiveStroke` doesn't await `pendingPaintRef` | temp race repro | RED 2 |
| R7 | `enterContext` ignores a cancelled confirm | AppContextEdit | RED 1 |
| R8 | Snap ignores the recorded pointer | WCContext | RED 3 |
| R9 | `selected !== contextMap` effect removed | AppContextEdit | **GREEN (survived)** → F3 |
| R10 | Map button bypasses `switchMode` | AppContextEdit | RED 1 |
| R11 | Snap zoom fixed at 1× | WCContext + App | **GREEN (survived)** → F2 |
| R12 | Chromeless keeps the toolbar | MapCanvas -t chromeless | RED 1 |
| R13 | `aria-modal` Escape guard removed | WCContext + App | RED 2 |
| R14 | Double-click ignores Ctrl | WCContext -t Ctrl | RED 1 |
| R15 | Lock-step drops `setPan` | WCContext | RED 2 |
| R16 | Body hit checked before the warp marker | WCContext + WC -t warp | RED 1 |
