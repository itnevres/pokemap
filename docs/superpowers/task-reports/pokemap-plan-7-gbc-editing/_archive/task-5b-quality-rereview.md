# Task 5b scoped quality rereview

**Verdict: APPROVED for the scoped frozen fixes. Open findings: 0 blocker, 0 important, 0 minor.** Static review only; this verdict does not attest test execution, mutation results, or the coordinator's live verification.

## Scope and provenance

- Compared `4db3723b76004c874acbdcda2c58991076f5367a..0d5ba4c254ef34d39604ae70b4a8fab243c28db6`. Reviewed source and tests independently with `git show 0d5ba4c:path`, keeping the implementer's concurrently changing working files outside the evidence.
- The range changes seven files: the fix spec, three production components, and three test files; 347 insertions and 35 deletions. Independently inspected the production diff and frozen component implementations, the complete changed tests, supporting map-fetch/session/canvas code, shared view math, and actual GBA WorldCanvas context code.
- Read the frozen executed Task 5b spec, fix spec, original quality report, and `task-5b-spec-review.md`. Scoped this pass to quality I1–I3/M1/M2 and spec-review I1–I4/M1 overlaps. The earlier reports' executions and mutation ledger are historical evidence at their stated revisions, not executions of this fix.
- Standard quality-review scope, equivalent to the requested Sonnet review role. This chat runs the harness-provided GPT-6 reviewer; no tool can switch or attest the running model as an actual Sonnet model. No subagent or alternative reviewer was dispatched.
- Applied the previously loaded frontend-design guidance against binding `packages/ui/DESIGN.md`; no redesign. The user's full factual report requirement takes precedence over further prose compression.
- No tests, mutations, browser operations, servers, commits, implementation edits, report archival, or subagents. The only write is this report. The same implementer retains the execution slot and single fix round.

All source/test locations below are repository-relative and refer to **0d5ba4c**.

## Finding disposition

| Original finding | Overlap | Disposition |
|---|---|---|
| Quality I1: continuous keyboard zoom enters the stepped overlay | Spec I1, including Fit all | Resolved in source; pending and ready context witnesses added. |
| Quality I2: failed context payload has no visible explanation | Spec I2 | Resolved with stable sibling loading/error slots and three failure/recovery witnesses. |
| Quality I3: map state resurfaces and stale local continuations clobber later visits | Spec I3 | Resolved with render-time retirement and committed visit identity, including ABA. |
| Quality M1: incoherent/offscreen/already-dirty paint witness | Spec I4, R2/R3 survivors | Resolved in the committed test design: coherent dimensions, visible nonzero targets, delayed begin, exact paint/event bodies. |
| Quality M2: DESIGN still describes permanently disabled Edit here | Already closed by spec review at 6f71cea | Confirmed resolved at the frozen fix; not attributed to this diff. |
| Spec M1: selected/context fallback unpinned | R1-selection survivor | Isolated actual App selection-callback witness added. |

No actual residual bug or new actionable regression was found in these fixes. No smallest-fix recommendation remains outstanding.

## I1: integer view and fit paths

`packages/ui/src/gbc/GbcWorldCanvas.tsx:1197–1205` intercepts all four zoom keys (`+`, `=`, `-`, `_`) while context exists. It prevents default and returns even before the payload/snap yields a context view. Once ready, it chooses an adjacent bounded `ZOOM_LEVELS` entry and calls the existing `setContextZoom`. The ordinary continuous World keyboard paths at `:1206–1214` remain outside that branch.

The setter at `:1011–1014` preserves the viewport-centre pivot through `zoomAboutPivot`, and the inverse conversion at `:1006–1009` supplies native block scale 32. Thus keyboard context zoom is 32/64/128 world pixels per block and 1/2/4 editing zoom. At the limits the bounded index stays at the current level; it cannot supply the former 1.2 editing value. The precondition for `indexOf` is restored by entry snap and the reachable stepped routes.

Fit all is a native disabled button whenever `inContext` is true (`:1263`), including loading/error context. This closes the visible fit route that could assign an arbitrary fractional world scale while leaving the overlay mounted. Other fit setters were traced: initial fit is once per mounted world (`:574–582`); filter fit applies to the Dungeon-scoped world (`:584–592`), whereas the App context host has no map filter; token-based tree jumps (`:1222–1231`) accompany tree selection, which explicitly clears context in `GbcApp:151–160`. Viewport changes do not reapply an already handled jump token. Context entry itself waits for origin, snaps to the nearest editing level, and gates rendering with `snappedFor` (`GbcWorldCanvas:952–1005`).

The native continuous wheel listener on the world canvas remains at `:1026–1040`. Ordinary pointer wheel input in active context targets the covering overlay stage, whose listener steps editing zoom; deliberately dispatching a wheel at the covered world canvas is not the reachable keyboard-focus failure being fixed. GBA's actual context implementation uses the same snap/gate, controlled conversion, and context zoom setter, but does not supply GBC's extra continuous +/- route. Disabling the GBC Fit all control addresses its additional route without changing shared math.

`packages/ui/test/gbc/GbcAppContext.test.tsx:389–409` selects a real world map, enters through the keyboard menu, asserts world-canvas focus, and checks `+` to 200%, `_` to 100%, overlay wheel to 200%, `=` to 400%, and `-` to 200%, plus disabled Fit all. `:411–425` holds the map payload indefinitely, checks the loading status, and verifies each key leaves world status unchanged with Fit all disabled. These are concrete witnesses for both ready and pending paths; their execution was not performed here.

## I2: visible error with a stable host

`packages/ui/src/gbc/GbcApp.tsx:318–335` retains the keyed World host and its single `GbcMapEditing` child. The new conditional slot at `:320–323` is a sibling preceding that child, rather than a replacement branch around it. React's conditional child positions remain stable across loading, failure, and readiness. The canvas factory still renders the same keyed `GbcWorldCanvas` (`:240–265`), and `GbcMapEditing` retains the body/canvas slot at `:173–174` independently of active chrome.

For a pending selected context payload, the slot has `role="status"` and names the map. For an error, it has `role="alert"`, names the map, and includes the guarded-fetch explanation. `useGbcMap` uses the existing shared guarded fetch; rejection, non-OK status and malformed shape become errors there. No duplicate fetch parser or swallowing catch was introduced. `ready` still requires the payload's map name to equal selection (`GbcApp:101`), and no editing canvas is fabricated from a failed payload.

Done remains available on the context bar even without `contextView`; Escape's capture listener is mounted based on context existence, not stage readiness. Clean exit therefore remains possible from pending/error state. The fix does not claim a same-selection retry button: exiting, selecting a different map, and entering that valid payload is the recovery path exercised by the tests.

`GbcAppContext.test.tsx:427–456` independently covers fetch rejection, HTTP503, and wrong-family shape. Each asserts the diagnostic, the original world canvas and editing-body identities, and absence of an editing stage. HTTP failure exits via Escape; the other cases use Done. The alert disappears after exit. Selecting City and entering its loaded context then restores a real stage with the original world/body nodes and no alert. This verifies error presentation and a successful subsequent entry rather than only checking a mock hook in isolation.

## I3: local state retirement, committed guards and ABA

`packages/ui/src/gbc/GbcMapEditing.tsx:64–77` creates a new visit object when `mapName` changes, resets stamp/event/error/warnings during this component's render, and publishes the visit identity in a layout effect. The conditional own-state adjustment terminates after React retries the render with the matching name; children then receive retired state. It does not key or remount the host. `toolKind` at `:58` is outside the reset and intentionally survives.

Identity is the visit object, not the map-name string. A committed A1→B→A2 sequence produces three distinct objects, so callbacks capturing A1 cannot pass the A2 comparison even though both names are A. Publishing in the layout effect avoids invalidating the current committed visit merely because a speculative render began. Cleanup sets the ref to null on visit replacement/unmount; StrictMode's cleanup/setup sequence republishes the same committed object before subsequent user input. There is no impure state updater or effect-based first-render pick window in this change.

All changed local continuation paths were traced. `setStamp`, `setEvent`, `fail`, and `ok` check issuing visit at `:86–89`. Move, undo, redo, and discard route success/failure through those helpers (`:105–106,126–128,158–159`). Delete checks before clearing selection, clearing error, or writing warnings (`:108–114`); duplicate checks before selecting its appended event (`:115–123`). Captured canvas paint errors now route through guarded `fail` (`:144`). Error and warning dismissal also use guarded handlers (`:168,197`). Within one visit, pick updates remain functional, so a delete completion preserves a stamp picked while it was pending.

These guards protect local UI updates; they do not cancel server requests or change the session transport. `useGbcEditSession` remains outside the patch. Its post response filter and sequence handling are separate from the host guard: the old bug existed because a filtered session response could still resolve a local continuation. This fix covers that continuation independently. Broader existing session/SaveDialog races are not credited as repaired by a local visit guard and are outside the agreed scoped fix.

`packages/ui/test/gbc/GbcMapEditing.test.tsx:157–230` uses a persistent host and captured canvas props. It covers reset of stamp/event/error through A→B→A, tool retention and body identity; warning retirement; and deferred move/delete/duplicate/undo/redo/discard across both A→B and A→B→A, on both resolution and rejection. Each later visit establishes its own stamp/event/error before releasing the older callback, then checks those values remain and no stale warning appears. Separate cases exercise the captured canvas error callback across both visit sequences. This matrix has 24 operation/visit/outcome cases, supplemented by reset, warning and captured-error cases. The test session is intentionally stubbed to isolate local guard behavior; it is not represented as a real transport concurrency test.

The real App test at `GbcAppContext.test.tsx:508–531` complements that isolation: tree visits retire Port's pick in City and after returning to Port, retain Pencil, and retain both original world canvas and editing body. The host is not keyed by map to obtain those results.

## M1/spec I4: corrected real App geometry and requests

`packages/ui/test/gbc/GbcAppContext.test.tsx:13–43` now gives both placements and map/layout payloads 10×10 dimensions, with 100 blocks. The mocked session starts clean; paint begin/end return its current state, and only apply changes blocks and dirty/undo flags (`:46–69`). The test no longer obtains a nominal dirty result merely by starting dirty. The fetch double is sufficient for these request/dirty assertions; it is not a server persistence or saved-image-byte proof.

`overlayStage` at `:105–109` explicitly waits for the actual overlay canvas and then assigns its measured rectangle. Palette or context-bar presence is no longer substituted for snap readiness. This repairs the null-stage hazard documented in the previous spec review's supplementary probes.

Independent calculation for Port: placement (10,0), dimensions10×10, entry pointer(150,100), and snapped editing zoom1 give world scale32 and pan(-330,-60). The map body starts at(-10,-60); the one-block border-ring composite starts at(-42,-92). Client(134,52) is inside the 200×200 viewport and lies at native map offset(144,112). Dividing by32 yields paint block(4,3); dividing by16 yields event step(9,7). Client(150,68) yields offset(160,128), event step(10,8). Both steps fit the 20×20 event grid. These values follow the real controlled transforms and origin32, not a separate test-only conversion.

`GbcAppContext.test.tsx:458–488` enters the real App overlay, chooses Pencil/metatile1, checks it is clean, holds begin, and sends mousedown/mouseup at(134,52). Before release it permits only begin and remains clean. After release it requires exact begin→apply→end order, the full pencil body with target/origin(4,3) and a 1×1 metatile1 stamp, then a dirty indicator. The formerly surviving X-divisor mutation would produce x9 instead of4 and fail this body comparison; this is a source-derived sensitivity assessment, not a claimed executed mutation kill.

`GbcAppContext.test.tsx:490–506` supplies a warp at step(9,7), drags from(134,52) to(150,68) on the actual App stage, and requires `/event/move` with `{kind:"warp",index:0,x:10,y:8}`. Removing `onMoveEvent` from the App spread would prevent that request, so the assertion targets the prior R2 wiring gap. The inherited default cursor is used, allowing the event hit test rather than an active paint tool. The mock's response semantics are not a claim about persisted event contents; the request body is the intended witness.

The existing translation/draw witness remains alongside these tests. It addresses composite alignment; the new tests separately address positive visible coordinates, block/step distinction, clean-to-dirty behavior, and delayed begin ordering.

## Spec M1 and quality M2

`packages/ui/test/gbc/GbcAppContextSelection.test.tsx:1–33` renders the actual App with an isolated WorldCanvas callback harness and pending payload hooks. EnterA establishes context A. SelectB invokes the real `onSelectMap` prop, which changes selection without explicitly clearing context in that handler (`GbcApp:169–170`). The test then waits for no context, verifies B's selected tree row, and verifies World remains active. Removing the mismatch effect at `GbcApp:220–222` would leave context A and fail this witness. The test explicitly isolates the callback invariant; it does not claim a pointer can bypass the covering overlay in production.

`packages/ui/DESIGN.md:412–415` now says GBC Edit here is enabled when supplied in World and omitted in Dungeon. This resolves quality M2; the correction already predates the requested diff. The dedicated GBC context section also documents native scale32, derived ring origin, controlled/chromeless host, and per-map time/version render URLs.

## Retained contracts and limits

The patch leaves the App-level session and dirty enter/exit/save flow intact: a dirty exit opens SaveDialog, Cancel closes only the dialog, commit marks clean and keeps context until a later exit, and mode changes preserve the session. The stable world/body positions remain intact through active chrome and new error slots. The captured Escape listener still checks modal/menu/text-field state before React bubble handlers can unmount a dialog. One-map tileVersions invalidation and detached old image-entry callbacks are unchanged by this fix. Shared view math still defaults to native16 for GBA; this diff changes no GBA production or test files.

Accepted E4/GBC deferrals remain: toolbar crowding at1024px, unavailable overlay toggles in context, and blank tiles until images load. No scope expansion or fix is requested.

Execution evidence for **0d5ba4c** is pending from the implementer/coordinator: test/build results, restored mutation proofs for R1/R2/R3 and the fix-specific regressions, and the required live pixel/save/reverse-paint checks. The old reports' 168 passing baseline tests and mutation results do not certify this revision. This reviewer independently inspected the committed assertions and source, performed no executions, and found no scoped blocker, important issue, or minor issue to send back for another code round.
