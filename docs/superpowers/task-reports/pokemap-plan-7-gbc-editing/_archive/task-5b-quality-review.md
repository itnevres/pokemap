# Task 5b quality review

**Verdict: CHANGES_REQUIRED. Counts: 0 blocker, 3 important, 2 minor.**

## Scope and method

- Frozen range: `9ce8b454708d1ae939954b870750f190393994b5..ede8df3304d2bbc2cfc1ed26858f176354c856d7`. All implementation, dependency, template and test source references below are line numbers at `ede8df3`, read with `git show ede8df3:<path>`. No moving working-tree implementation was reviewed.
- Read the executed `task-5b-spec.md` and `C:/Users/Serve/AppData/Local/Temp/pokemap-plan7-codex/task-5b-initial-review.diff`. The supplied diff equals `git diff --unified=10 9ce8b45 ede8df3`, after newline normalization. Its longer context explains the difference from Git's default three-line-context diff.
- Independently traced the six changed source/design files, the added/changed tests, `useGbcMap`, `useGuardedFetch`, `useGbcEditSession`, `SaveDialog`, `WorldContextMenu`, the GBC render/commit routes and shared CSS. Compared the actual GBA `WorldCanvas`, `MapCanvas`, `App`, `MapEditingWorkspace` and `useMapEditing`; read the archived E4 spec, coordinator, spec-review and quality-review records.
- Used the Superpowers reviewer checklist and the supplied frontend-design guidance as a check against binding `packages/ui/DESIGN.md`; no redesign or subagent dispatch.
- Requested review tier: standard / Sonnet equivalent. This harness identifies the assistant as GPT-6 and exposes no switch for the current model; no claim that an actual Sonnet model was selected.
- Static review only. No tests, mutations, browser probes, commits or subagents. This report is the only file written. Concurrent implementer test work and any changes after `ede8df3` are outside this verdict. All repros below are source-derived, not executed.

## Strengths

- The controlled canvas implementation closely matches the actual GBA E1 seam: current view/callback refs, computation outside React updaters, an uncontrolled fallback and no automatic fit when controlled (`GbcMapCanvas.tsx:325-343,443-455`). Chrome suppression affects JSX rather than the paint chain.
- The world host retains its element type, key and child slots while chrome toggles (`GbcApp.tsx:237-265,317-331`; `GbcMapEditing.tsx:135-187`). It calls the render function as a factory rather than introducing an inline component type. The same-node/no-extra-world-fetch tests assert useful observables.
- Coordinate conversion is parameterized at the shared layer, with the GBA default still 16. GBC consistently supplies 32 and derives its composite origin from the border ring. Snap timing, Escape capture and detached image-entry handling preserve the actual E4 fixes.
- Save cancellation preserves context and unsaved work; discard failures abandon selection changes and show an alert. Successful commit invalidates the server render cache before the client requests its versioned tile.

## Important findings

### I1 — The focused world canvas can drive the overlay to a fractional zoom

**Files/lines:** `packages/ui/src/gbc/GbcWorldCanvas.tsx:1197-1204` (changed keyboard zoom callers), `:1002-1005` (world-to-map view), `:1338-1339` (focusable world canvas); `packages/ui/src/gbc/GbcMapCanvas.tsx:559-561` (stepped wheel); `packages/ui/src/components/WorldContextMenu.tsx:99-101,147-151` (selection closes and refocuses the world canvas).

**Trigger and evidence:** Select a world map, open its keyboard context menu and activate Edit here. The menu closes and explicitly focuses the underlying world canvas. Neither the context snap nor overlay mounting transfers focus into the overlay. Press `+` at the entry zoom of 32 px/block: the world keyboard handler applies `WHEEL_FACTOR=1.2`, giving 38.4 px/block. `mapViewFromWorld` casts `38.4/32=1.2` to the `Zoom` union without changing the value. Pressing `-` from 32 similarly gives an overlay zoom of approximately 0.8333.

**Impact:** The editing view leaves its promised 1×/2×/4× scale. No zoom button is pressed, and the overlay wheel's `ZOOM_LEVELS.indexOf(1.2)` returns -1. Its next wheel-in chooses index 0, changing 1.2× to 1×: zoom-in visibly zooms out. This is a reachable keyboard/accessibility regression, not merely a synthetic wheel on a covered canvas. DESIGN's integer map zoom contract is violated.

**Actual GBA comparison:** `WorldCanvas.tsx:1883-1896` has Escape/menu handling but no continuous +/- keyboard zoom. Copying its context overlay did not account for GBC's extra keyboard path. The frozen GBC test checks `+` only at the already-clamped 128 level (`GbcWorldCanvasContext.test.tsx:304-311`), which misses the fractional result at 32 or 64.

**Smallest fix:** While a context view exists, route +/- through adjacent `ZOOM_LEVELS` and the existing `setContextZoom`; retain continuous world zoom outside context. Prevent continuous keyboard changes while the context payload is pending. No new zoom abstraction is needed. Verify keyboard Edit here -> `+` -> 2× -> `-` -> 1×, then a wheel gesture through the real overlay.

### I2 — Context-map fetch errors are hidden behind a permanent pending overlay

**Files/lines:** `packages/ui/src/gbc/GbcApp.tsx:240-262,317-331,337-338`; `packages/ui/src/gbc/GbcWorldCanvas.tsx:962,1002-1005,1426-1452`.

**Trigger and evidence:** Enter context on a map whose `/api/map/<name>` fetch rejects, returns a non-OK status or fails the payload guard. `useGuardedFetch` stores the failure in `map.error`, with no ready payload. `contextMap` remains set; `context.origin` stays null, so the snap/canvas never materializes. `contextActive` is false. The only rendering of `map.error` is in the Map-mode branch after the World-mode branch, so it cannot appear here.

**Impact:** The user sees a dim world, map name, disabled zoom buttons and Done indefinitely, with no explanation that loading failed. The overlay blocks pointer interaction with the world. Done/Escape can recover, so this is important error handling, not a blocker or a data-loss claim.

**Actual GBA comparison:** The E4 pending-layout overlay has the same omission. It is not among the three expressly accepted deferrals. This port adds a new GBC entry path and should preserve GBC's existing visible guarded-fetch failure convention rather than importing that omission.

**Smallest fix:** Render the selected context map's `map.error` as a `role="alert"` in the World host, keeping the existing world host/canvas in their fixed positions. A loading status while origin is null would distinguish pending from failure. Retain Done so the user can leave; no new modal or retry subsystem is required. Verify a rejected context-map fetch produces the alert without remounting the world canvas.

### I3 — The persistent editing host does not retire old map UI state or old async completions

**Files/lines:** `packages/ui/src/gbc/GbcApp.tsx:317-330` (new persistent host); `packages/ui/src/gbc/GbcMapEditing.tsx:62-77,96-109` (map-tagged state and deferred updates). Supporting boundary: `packages/ui/src/gbc/hooks/useGbcEditSession.ts:121-125,138-140`.

**Trigger A — late completion:** Start Delete/Duplicate on map A and, before its response, leave through the tree for B and enter B's context. This is allowed while A's client dirty flag is still false; if it is already dirty, a confirmed discard followed by a sufficiently delayed response also exercises the completion path. Pick a stamp/event on B. The same `GbcMapEditing` instance remains mounted throughout. The session hook correctly declines to apply an A response to B, but still returns its response to the caller. A's `onDelete().then(...)` subsequently calls A's closed-over `setEvent(null)`. `fresh(p)` sees B's state, replaces it with `{forMap:A,stamp:null,event:null}`, and writes that over B's selection. Duplicate does the same with A's appended index. Unconditional `ok()` can also clear a newer B error.

**Trigger B — stale state returns:** Pick a stamp/event on A, leave via the tree for B, then return to A without making a pick on B. Merely reading `pick.forMap !== key` hides A's state on B; it never retires it. On the return to A, `mine` becomes true and A's old stamp/event/error/warnings reappear. Pencil/rect/bucket can become active again without a fresh pick, contrary to the component's documented map-switch reset behavior.

**Impact:** The new permanent World host turns old per-visit assumptions into observable state bleed. A delayed operation can silently disable B's chosen paint tool or erase its current event selection/error; a later visit can restore stale state. This finding concerns local UI state, not a claim that the hook paints A's blocks into B.

**Actual GBA comparison:** GBA holds this UI state separately and calls `editing.resetForMapChange()` on successful selection changes; that clears stamp/event state. Before Task 5b, GBC did not keep `GbcMapEditing` mounted in World mode and its Map-mode loading branch unmounted it during ordinary map switches. The new host lifetime needs explicit map-visit handling.

**Smallest fix:** Retire map-owned pick/error/warning state on an actual map-name change while preserving the chosen tool. Guard async local-UI continuations with the issuing map visit (a small current-visit ref/counter is sufficient), so an old completion cannot update a later visit, including A -> B -> A. Keep the heavy canvas host stable; keying the whole editing host by map would undo the no-remount requirement. Verify a deferred A completion after a B pick leaves B's state intact, and an A -> B -> A visit starts without the old stamp/event.

## Minor findings

### M1 — The new App paint witness uses an invisible map and never proves clean-to-dirty

**Files/lines:** `packages/ui/test/gbc/GbcAppContext.test.tsx:13-20,24-39,298-310`.

The world fixture describes each map as 10×10 blocks, but the map payload describes 2×1 blocks. In the City context test, the world snaps a 10×10 body to pan (-60,-60), so the actual payload's editable body occupies x [-60,4), y [-60,-28): it is entirely outside the 200×200 viewport. The paint witness dispatches at client (-50,-50), which a user cannot click on that clipped stage. It also starts via `dirtyContextOnCity`; its comment says it discards first, but there is no discard. The assertions check begin/end presence and begin-before-apply, not the requested block coordinates or a clean-to-dirty transition.

**Impact:** This test exercises prop wiring, but it cannot validate the promised visible App-level paint flow or give trustworthy integration evidence for block/ring alignment. Independent pure math tests do not repair the inconsistent integration fixture. Concurrent test improvements may supersede this finding; they were not reviewed.

**Smallest fix:** Make world dimensions and payload/layout/blocks agree; click a visible cell inside the stage with an explicit bounding rect, start clean, assert the apply request's target/origin and the resulting dirty indicator. Keep one integration witness rather than adding duplicate suites.

### M2 — Binding DESIGN still says GBC Edit here is permanently disabled

**File/lines:** `packages/ui/DESIGN.md:411-415`.

The existing World context menu section still mandates a permanently disabled GBC Edit here item and the Plan 7 hint. The new Task 5b section at `:456-458` and actual code say it is enabled in World and absent in Dungeon. This leaves contradictory instructions in the binding design document.

**Smallest fix:** Update the old GBC item sentence to describe enabled World editing and no Edit here in Dungeon. Remove the obsolete hint text there. No implementation change is required.

## Requested flow trace and verification limits

| Area | Frozen-source result |
|---|---|
| Controlled drawing | `GbcMapCanvas.tsx:325-343` uses the prop as the drawing view and reports gestures through the latest callback. `:443-455` skips its fit in controlled mode. Pan at `:668-670` preserves the current zoom. No nested React setters were found in these paths. I1 covers the external keyboard input that can violate the view's stepped zoom invariant. |
| Chromeless geometry | Toolbar/legend/status are gated at `:748,775,845`. The existing chromeless CSS makes the viewport transparent; the overlay is absolute inset 0 and its map canvas flexes into the same box. The ring is `BORDER_RINGS * BLOCK_PX` at `:84-89`, used by the canvas at `:364-365` and App at `:258`. No new ring literal or CSS layer was invented. DOM/pixel equality remains a live verification item, not a result from this static review. |
| Unit math | For placement p, world scale W=32z, origin o=32, the map pan is `p*W + worldPan - o*z`. A map block b draws at that pan plus `(o+32b)*z`, which simplifies to `(p+b)*W+worldPan`. The inverse adds `o*z-p*32z`, recovering world pan. Event steps remain 16 px: world marker math uses event/2 (`GbcWorldCanvas.tsx:145-146`), and the editing canvas divides native composite coordinates by 16 (`GbcMapCanvas.tsx:207-223`). GBC literal/inverse cases were read; GBA default 16 and existing GBA tests are unchanged in the range. |
| Entry/snap | Menu and double-click record client coordinates, not pre-chrome canvas coordinates (`GbcWorldCanvas.tsx:512-519,1157-1165,1187-1190`). Snap waits for origin, reads the current DOM box/client size, consumes the pointer, and uses a same-tick ref guard before setting one world-view value (`:955-978`). The overlay waits for `snappedFor`. It does not fit/remount the world. |
| World DOM identity | App always renders the same keyed world host and `GbcMapEditing`; false chrome placeholders retain child positions, and `.app__map-editing-body` always contains the same `GbcWorldCanvas key="world"`. `useGbcWorld()` has a fixed URL and does not depend on context. App also has its pre-existing separate visibility-world hook; entry does not add another call to either hook. Distinct Dungeon/World branches still separate mode state. |
| Dirty entry/tree exits | `enterContext` and tree selection share `leave` when the map changes (`GbcApp.tsx:128-132,151-161,197-205`). Cancelled confirm schedules neither selection nor context; discard failure is caught at main level. Same-map entry bypasses discard as required. Same-map tree click clears context while preserving session. |
| Dirty exit/Save Cancel | Done, Escape and outside double-click request the same exit handler. Dirty opens SaveDialog without clearing context; clean clears it (`GbcApp.tsx:209-212`). `onCancel` only closes the dialog (`:370`). A successful commit marks clean, closes the dialog, bumps the selected context map's tile version and reloads the map (`:361-368`); reload failure becomes a visible main-level error. Context intentionally stays after commit until another clean exit. Mode switching clears context without discard/prompt; the session hook remains mounted in App. |
| Escape capture | The listener attaches/removes on window with `true`, only in context (`GbcWorldCanvas.tsx:989-998`). It checks default prevention, current menu state, modal DOM and text/contenteditable targets before calling the latest exit callback. Capture observes SaveDialog's modal before its React Escape handler can remove it. The frozen test at `GbcWorldCanvasContext.test.tsx:362-374` simulates that removal with a document bubble listener; it has useful ordering sensitivity. |
| Outside double-click | The overlay handler uses client minus current overlay rect and the world's placement/body rect, with exclusive right/bottom edges (`GbcWorldCanvas.tsx:1017-1023`). Bar clicks are excluded. Body entry keeps Shift-open and warp-marker priority; Ctrl/Meta do not enter context. Dungeon has no onEditHere. |
| Tile freshness | `GbcApp.tsx:365-366` increments only the context map. The load effect deletes only changed-version entries, retains each seen version and includes it on initial/later/time-switch loads (`GbcWorldCanvas.tsx:690-719`). Old onloads mutate their captured detached entry rather than replacing the new cache entry. A time change clears the time-dependent image cache separately. Server `gbcRoutes.ts:323-328` clears renderCache on successful commit, and `:419-433` renders live sessions or current disk cache with no-cache headers. The E4 stale-server-PNG failure is therefore not present. |
| UI state/races | World and session identities remain stable; the ready payload checks map name before use. Session responses check current map, seed and ordering. Those checks do not protect the persistent editing host's local continuations: I3. Paint begin/apply/end machinery is unchanged by this diff; this review did not execute delayed-stroke checks. |
| Accessibility/errors | Context groups, zoom pressed/disabled states, named Done and decorative dim aria-hidden are present; successful normal exit refocuses the world canvas. Menu keyboard activation remains available. I1 is the reachable keyboard zoom failure; I2 is the hidden fetch failure. Paint/edit/discard/post-save-reload failures route to existing alerts on the active editing/main surface. |

## Declined to judge / accepted deferrals

- World toolbar crowding at 1024 px: explicitly deferred by Task 5b; no layout redesign requested.
- Grid/Collision/Events/Encounters toggles unreachable in chromeless context: inherited and expressly accepted. No new overlay controls requested.
- A world tile blank until loading completes, including the existing lack of image-load error recovery: explicitly accepted blank-tile behavior and the actual E4 best-effort loader; no separate finding. Successful versioned-load cache identity was reviewed.
- Client warp-marker/coverage/encounter cache invalidation after event edits: the specified save freshness contract here is the one map's raster URL. These caches and the GBA template have broader pre-existing freshness limitations; no additional cache-invalidation task is proposed. The coordinator should decide separately if their freshness is intended to be part of acceptance.
- Baseline session/SaveDialog races involving editing again during post-save reload or cancelling an in-flight commit: these mechanisms predate the range. No new finding against Task 5b without an introduced change demonstrated; no assertion that those broader mechanisms are race-free.
- Full keyboard paint/event authoring: the underlying map canvas's pointer-only editor predates this port. Existing bar/menu/exit accessibility was assessed; a new keyboard editor is outside this task.
- Test pass counts, mutation proofs, live alignment, reverse-paint byte restoration and scratch-server/corpus cleanliness: not judged by execution because the request explicitly forbids tests and mutation. Reports from E4 are historical evidence, not verification of this revision.

## Assessment

The main port uses the correct shared math, stable canvas seam, dirty-exit flow, capture-phase Escape and one-tile cache refresh. Fix I1-I3 before quality approval. M1-M2 are small verification/documentation corrections. Re-review the fixes and final tests at a new frozen revision; this report neither reviews nor rejects the implementer's concurrent uncommitted test work.
