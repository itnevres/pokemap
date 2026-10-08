# Task 5b high-risk spec review

**Verdict: CHANGES_REQUIRED. Findings: 0 blocker, 4 important, 1 minor.**

**Test/mutation slot released.** No reviewer test process remains. All four mutated production files were restored byte-for-byte and independently SHA-256 checked. The temporary probe file was removed from the repository after verifying its preserved scratch copy. No implementation fixes, commits, subagents, browser operations, servers, or real-corpus writes were performed.

**Required mutants X1–X8: eight requested, eight independently executed, eight killed, zero survivors, zero missing or duplicate IDs.** Additional mutants surviving the committed App suite: **R1-selection, R2-event-props, R3-paint-units**. Stronger experimental witnesses have limitations recorded below; they do not erase those committed-suite survivors.

## Scope, provenance, and limits

- Reviewed the entire range `9ce8b45..1f37436`: implementation through `ede8df3`, additive alignment test `6c8ccd4`, DESIGN correction `6f71cea`, and implementer report `1f37436`. Production source and tests at `1f37436` are identical to `6f71cea`. All source line references below are at `6f71cea` unless stated otherwise.
- Read the executed Task 5b spec and supplied `C:/Users/Serve/AppData/Local/Temp/pokemap-plan7-codex/task-5b-initial-review.diff`; reviewed the committed source separately rather than treating the diff or implementer narrative as proof. Read Task 5's executed spec, hook/canvas/editing implementation, archived E4 spec/coordinator/spec-review/quality-review, RESUME's Phase E lessons, actual GBA counterparts, shared event/menu/CSS code, and GBC render/commit routes.
- Applied the required frontend-design guidance against binding `packages/ui/DESIGN.md`; no redesign. Review ran on this chat's current GPT-6 Codex reviewer. The harness exposes no operation to select or attest an exact Opus-equivalent tier for the running chat; no claim that an actual Opus model was selected.
- Initially used frozen `git show` reads only. Tests and literal-anchor mutations began only after explicit coordinator clearance. Every test process was serialized. The latest instruction to finish without further tests was honored; the final phase only inspected saved results, verified restoration, removed the temporary test copy, and wrote this report.
- Read `task-5b-quality-review.md` after the independent initial source trace. P1–P3 below then reproduced its I1–I3 concerns against the actual App. These overlapping findings should be combined, not counted as separate bugs in the implementer's fix round. Quality M2 was already resolved by `6f71cea`; it is not an open finding here.
- No full suite, typecheck/build rerun, live pixel check, live save, reverse-paint restoration, or external-corpus cleanliness verification is claimed. Those remain coordinator-owned. The implementer's larger test/build totals are not substituted for this reviewer's executed evidence.

## Important findings

### I1 — Keyboard context entry leaves a reachable continuous zoom path

**Location:** `packages/ui/src/gbc/GbcWorldCanvas.tsx:1197–1204`, with conversion at `:1004`; `packages/ui/src/gbc/GbcMapCanvas.tsx:559–561`. Overlaps quality I1.

**Executed witness P1:** select OlivinePort, open the ContextMenu-key menu, activate Edit here, wait for the real chromeless stage, and assert focus is still on the world canvas. That focus assertion passed. Press `+`. Expected the next editing level, 200%; the actual status was **120%**. This is not a synthetic wheel directed at a covered canvas: menu close explicitly returns keyboard focus to that canvas.

The world handler multiplies 32 px/block by 1.2, producing 38.4; the overlay conversion gives `zoom=38.4/32=1.2`, despite the `Zoom` cast. DESIGN requires integer 1×/2×/4× map zoom. Source-derived consequence: the overlay's next wheel-in uses `ZOOM_LEVELS.indexOf(1.2) === -1`, selects index zero and drops to 1×. The frozen `+` test only exercises the clamped 128 px/block case and misses this reachable failure. GBA has no equivalent continuous +/- keyboard path, so porting its overlay alone does not cover GBC's extra input route.

**Fix/verification:** in context, route +/- through adjacent `ZOOM_LEVELS` and the existing context zoom setter; do not continuously zoom while waiting for the context payload. Preserve continuous keyboard zoom outside context. Pin keyboard Edit here -> + -> 2× -> - -> 1× and a subsequent real overlay wheel gesture. The still-enabled Fit all control also deserves a focused check in this fix: its `fitAll` path can set an arbitrary world zoom while context remains active. That source observation was not separately executed or counted as another finding.

### I2 — A failed context-map fetch is silently presented as pending

**Location:** `packages/ui/src/gbc/GbcApp.tsx:240–262,317–338`; `packages/ui/src/gbc/GbcWorldCanvas.tsx:962,1002–1005,1426–1452`. Overlaps quality I2.

**Executed witness P2:** reject `/api/map/OlivinePort` with `Error('reviewer payload failure')`, enter its context, and check for an alert. The same-world-node assertion passed; the visible-error assertion failed because **no alert existed**. The failure DOM contained the context bar, dim layer, disabled zoom controls and Done, with no editing stage.

`useGuardedFetch` records the error, but the World branch never renders `map.error`; the only map-error UI is in the mutually exclusive Map branch. `ready` remains null, so origin stays null and the overlay waits forever. This is outside the named blank-image deferral: it is a failed guarded map payload that prevents editing altogether. Done/Escape still recover, so this is not a blocker or a data-loss claim.

**Fix/verification:** expose the context map's load failure in the World host as an alert without changing the world canvas's type, key, or slot. Keep the existing exit. Verify rejection, non-OK/malformed response handling through the existing guarded hook, and stable canvas identity. No new retry subsystem is necessary.

### I3 — The persistent host revives old map picks and permits stale local continuations

**Location:** `packages/ui/src/gbc/GbcApp.tsx:317–330`; `packages/ui/src/gbc/GbcMapEditing.tsx:62–77,96–109`. Supporting response boundary: `packages/ui/src/gbc/hooks/useGbcEditSession.ts:121–125,138–140`. Overlaps quality I3.

**Executed witness P3:** in City context select Pencil and metatile 0x1; use the tree to visit Port context without choosing a stamp there; return via the tree to City context. Port correctly showed no selected stamp. On returning to City, metatile 0x1 again had **`aria-current="true"`**; the assertion that the old pick was retired failed. This was reproduced with coherent 10×10 world/layout/blocks fixtures, not the inherited mismatched fixture.

Tagging state with `forMap` hides it on B but never retires it. Because Task 5b deliberately keeps the World editing host mounted across map selection, A -> B -> A resurrects A's stamp/event/error/warnings. The old Map loading branch normally unmounted this component between maps; the new lifetime makes the assumption visible. This contradicts the shared Task 5 editing-state reset behavior and can reactivate paint without a new pick.

**Independently traced, not separately executed:** after an A delete/duplicate resolves during a later B visit, the session hook rejects applying A's blocks to B but still resolves its return value. A's continuation calls its closed-over `setEvent`; `fresh(p)` then replaces B's state with an A-tagged object. The unconditional `ok()` can also clear B's newer error. This is local UI state bleed, not an assertion that the hook writes A blocks into B. A map-name-only guard would still miss A -> B -> A late completions.

**Fix/verification:** retire pick/error/warning state per map visit while retaining the chosen tool; guard deferred local updates by issuing visit. Keep the host/canvas mounted. Cover A -> B -> A and a held A delete/duplicate response released after B chooses a stamp/event, including A -> B -> A re-entry. Do not solve this by keying the heavy host to the map.

### I4 — The committed App witness misses wrong paint units and dropped event wiring

**Location:** `packages/ui/test/gbc/GbcAppContext.test.tsx:13–39,329–345`; production seams at `packages/ui/src/gbc/GbcApp.tsx:259–260` and `packages/ui/src/gbc/GbcMapCanvas.tsx:584–603`. Extends quality M1 with observed survivors; this is a coverage finding, not a claim that the unmutated code uses wrong coordinates.

Two non-equivalent regressions survived the **entire committed 15-test App context suite**, with green before and after restoration:

- **R2-event-props:** override only the context `GbcMapCanvas` with `onMoveEvent={undefined}`. Event drags can no longer reach the session from this new App seam. All 15 tests still pass.
- **R3-paint-units:** in `rawBlockAt`, divide X by `controlled ? 16 : BLOCK_PX`, preserving normal Map behavior but using event-step width for controlled overlay painting. All 15 tests still pass. The inherited negative-coordinate click falls in block zero for either divisor and the test never checks the apply body.

The fixture gives world placements size 10×10 but payload/layout size 2×1. For City the actual editable area under the computed view is x [-60,4), y [-60,-28), completely outside the viewport vertically. The test clicks (-50,-50), starts already dirty, says it discards without doing so, and checks request names rather than target/origin or clean-to-dirty transition. `6c8ccd4` correctly adds a top-left border translation witness; it does not repair those dimensions or paint/event coverage.

**Independent unmutated probes P4/P5:** with matching 10×10 payload/world sizes, a positive visible click (134,52) painted block (4,3), with the exact pencil target/origin/stamp and a clean-to-dirty transition; a held begin response kept apply/end off the wire until released. A drag at the same point from event step (9,7) to client (150,68) sent step (10,8) through the real App overlay. Both initially passed. These are mock-based UI witnesses, not live corpus writes.

**Strong-mutant caveats:** the P5 R2 run failed before exercising the mutation because its stage lookup raced snap readiness. It is **inconclusive**, not a demonstrated kill. The P4 R3 run reached and failed the exact apply-body assertion, so it did detect the wrong units, but its restored follow-up hit the same null-stage readiness race. That is an observed assertion kill with an **incomplete green/red/green proof**. The source bytes nevertheless restored exactly. No rerun was made after the coordinator asked to finish without more tests. Raw harness outcome labels alone are not sufficient; see the adjudicated table below.

**Fix/verification:** correct the committed fixture, wait explicitly for the overlay stage (palette readiness is earlier than snap), use a positive visible nonzero block, assert the apply body and clean-to-dirty transition, and add one real-App event-step request assertion. Retain the delayed-begin ordering check. Re-prove R2 and R3 using those stable witnesses in the combined fix round. The standalone Task 5 canvas tests pass, but cannot substitute for testing this new controlled App path.

## Minor finding

### M1 — The selected/context safety effect has no independent witness

**Location:** `packages/ui/src/gbc/GbcApp.tsx:220–222`; `packages/ui/test/gbc/GbcAppContext.test.tsx`.

**R1-selection** deletes only `if (contextMap !== null && selected !== contextMap) setContextMap(null);`. All 15 App context tests pass before, during and after. Tested tree and mode handlers clear context themselves, so they do not exercise this fallback. The spec separately requires contextMap to equal selected while set; the GBA port history called out this exact coverage gap.

This is **not a demonstrated reachable production defect**: the active overlay covers ordinary world pointer selection, and normal tree paths explicitly exit. Pin the fallback with an isolated selection-callback witness, or have the coordinator explicitly classify the mutant as equivalent under the intended entry routes. Do not claim it was killed or silently omit it from the ledger.

## Independent geometry and lifecycle derivation

Let p be a placement in blocks, q the world's pan in screen pixels, W its scale in screen pixels/block, o the composite's origin in native pixels, and z the editing zoom.

For GBC, **W = 32z**, **o = BORDER_RINGS × BLOCK_PX = 1 × 32 = 32**. To align the map's first block, its composite pan m must satisfy `m + o*z = p*W + q`, hence **m = p*W + q - o*z**. Block b is then drawn at `m + (o + 32b)*z = (p+b)*W+q`. Event step s instead draws at `m+(o+16s)*z = (p+s/2)*W+q`. Thus event step (9,7) is offset (4.5,3.5) world blocks; dividing paint targets by 16 would be wrong even though events correctly use that divisor.

The inverse is `W=32z`, `q=m+o*z-p*32z`. Substitution cancels both placement and origin terms exactly for the integer/power-of-two fixtures. This is not a blanket promise of exact IEEE floating-point equality for arbitrary fractional inputs.

| Independently derived case | Expected result |
|---|---|
| World zoom 32/64/128, native 32 | Snap editing zoom 1/2/4 |
| Threshold 32√2 ≈45.255 | 45 ->1; 46 ->2 |
| Placement (2,3), size 4×2, pointer (200,150), z=2 | Centre (4,4); W=64; world pan (-56,-106) |
| Placement (0,0), size 3×5, pointer (50,60), z=4 | Centre (1.5,2.5); W=128; world pan (-142,-260) |
| p=(10,20), q=(5,-7), W=64, o=(32,32) | z=2, m=(581,1209); inverse recovers q=(5,-7) |
| p=(-3,2), q=(-10,7), W=128 | z=4, m=(-522,135) |
| App Port p=(10,0), size10×10, pointer(150,100), z=1 | q=(-330,-60); world top-left(-10,-60); composite top-left(-42,-92) |
| Same App view, client(134,52) | Native map offset(144,112); block(4,3), step(9,7) |
| Client drag to(150,68) | Native offset(160,128); event step(10,8) |
| Client pointer(150,158), canvas top changes58 ->116 | Converted pointer(150,42); q=(-330,-118); m=(-42,-150) |
| GBA default W=32,p=(10,20),q=(5,-7),o=(32,32) | Native remains16, z=2, m=(261,569) |

The actual GBC snap, forward and inverse call sites all pass `BLOCK_PX`; the shared default remains 16. GBA callers omit the new optional argument and retain their arithmetic. The ring export is derived and used by both App and MapCanvas, not a free-standing test constant. X7's App draw assertion would fail if the real ring connection were lost.

| Requirement | Actual source/test assessment |
|---|---|
| Controlled drawing, pan, wheel, no auto-fit | `GbcMapCanvas:325–343,443–455,542–571,668–670`: current prop/ref, latest callback, controlled calculations outside an updater, uncontrolled state fallback. All nine controlled/chromeless tests passed. I1 is an external route supplying an invalid stepped zoom. |
| Border and chromeless geometry | `:89,364–365,748,775,845`: constant-derived origin; toolbar/legend/status hidden. Existing CSS absolute inset0 overlay and transparent chromeless viewport are reused. Translation is checked in App; actual browser box/pixel equality remains coordinator-owned. |
| Entry and snap | Client pointer recorded by menu/double-click; origin readiness gates snap until chrome commit; current rect/client dimensions used; consumed pointer and same-tick snapped ref prevent repeated entry snaps. Tests for shifted rect, re-entry at4×, marker precedence, Shift-open, and Dungeon fallback passed. |
| React identity | App always has the keyed world host and one GbcMapEditing slot. Conditional children occupy stable positions; renderWorld is invoked as a factory, not mounted as an inline component type. The canvas/body same-node assertions and world-fetch counts pass. X3 is independently killed. |
| Dirty entry/tree change | Different-map entry uses the same `leave` guard as tree selection; cancel schedules no selection/context change; discard resolves before switching and failures surface at main level. Same-map entry keeps the session. App tests pass. |
| Dirty exit/cancellation | Done/Escape/outside requests call the shared handler. Dirty opens SaveDialog and retains context; Cancel only closes the dialog. Commit marks clean and retains context until a subsequent exit. X5 is killed. Mode switches preserve the App-level session without prompting. |
| Capture Escape | Window capture add/remove both use true; current menu/modal/text-field/defaultPrevented checks happen before React bubble handlers can unmount a modal. X4's document bubble-removal witness fails under bubble-phase mutation. This directly addresses the E4 flush hazard. |
| Outside-map double-click | Uses the current overlay rect, world body origin/size, exclusive right/bottom edges; excludes context bar. Component tests cover inside/outside/bar cases. |
| One-tile freshness | App increments only committed selected context map. The effect deletes only entries whose seen version changed and preserves `&v=n` on future loads/time changes. X6 catches whole-cache invalidation. Equal-valued version objects do not refetch. |
| Late image callbacks | Closures mutate their captured entry; deleting/replacing a map cache entry leaves old callbacks pointing at detached objects. A stale onload only bumps redraw state and cannot overwrite the current cache entry. This is a source derivation, not an independently timed image-race experiment. |
| Server render freshness | `gbcRoutes.ts:323–328` clears renderCache through the commit hook; `:419–433` bypasses disk cache for open sessions, otherwise keys by name/border/time. Commit closes the session after save. The GBA E4 stale-PNG omission is absent in this path. Actual changed image bytes require coordinator live verification. |
| Shared editing props | The builder in GbcMapEditing supplies editSession/tool/event callbacks to both Map and context. Unmutated P4/P5 exercised these correctly. R2/R3 show incomplete committed regression coverage. |

## Independently executed baseline suites

Each row was a separate `node node_modules/vitest/vitest.mjs run <exact-file> --reporter=json` invocation. No concurrent test processes, directory-wide run, or full-suite run.

| File under `packages/ui/test/` | Pass | Fail |
|---|---:|---:|
| world/contextView.test.ts |16|0|
| world/contextViewGbc.test.ts |14|0|
| gbc/GbcMapCanvasView.test.tsx |9|0|
| gbc/GbcWorldCanvasContext.test.tsx |36|0|
| gbc/GbcAppContext.test.tsx |15|0|
| gbc/GbcMapCanvasEdit.test.tsx |21|0|
| gbc/GbcMapEditing.test.tsx |8|0|
| WorldCanvasContext.test.tsx |37|0|
| AppContextEdit.test.tsx |12|0|
| **Total** |**168**|**0**|

Experimental unmutated probe suite: **P1/P2/P3 failed as described; P4/P5 passed**. These three red probes are regression findings, not hidden within the green baseline total. Expected jsdom unsupported-canvas diagnostics occur where the inherited tests do not install drawing stubs; raw stderr is retained in the results JSON.

## Mutation method and adjudicated outcomes

Harness: `C:/Users/Serve/AppData/Local/Temp/pokemap-plan7-codex/task-5b-spec-review-runner.mjs`.

For every mutation: read original Buffer; verify lossless UTF-8 round trip; normalize the requested literal to the file's actual newline style; require exactly one occurrence of each anchor; run the unmutated witness and require nonzero passing test count; write the mutant; run exactly one file/witness; restore original Buffer in `finally`; compare restored bytes; rerun the witness. Saved all selected tests, failure messages and stderr. Final restoration additionally checked SHA-256 against the initial per-file hashes and a clean scoped Git diff.

`G/R/G` below means green before, assertion-red mutant, green restored. The two experimental strong rows were manually adjudicated from full failure messages rather than accepting the harness's overly broad `KILLED` label for any failing test. Their raw output remains unchanged for auditability.

| ID | Exact unique literal change | Witness | Observed outcome |
|---|---|---|---|
| X1 | `contextView.ts`: `const NATIVE = 16;` ->32 | Entire unchanged GBA contextView suite | **Killed, G/R/G:16/11 failures/16.** Snap23/45/46, four enter cases, three forward fixtures and one inverse fail. Round-trip alone survives mutually consistent wrong scaling; the literal cases supply teeth. |
| X2 | GBC forward `mapViewFromWorld` call's `native: BLOCK_PX` ->16, anchored by the entire call | World context `snaps the world once` | **Killed,1/1/1.** Overlay zoom2 and pan(-124,-124), expected zoom1/pan(-92,-92). |
| X3 | App's unique `key="world"` ->`key={contextMap ?? "world"}` | App `double-clicking a map in World shows` | **Killed,1/1/1.** Captured world node fails identity after entry. |
| X4 | Both unique window add/remove keydown capture arguments true ->false | World `Escape is judged in the capture phase` | **Killed,1/1/1.** Exit called after document listener removes modal. |
| X5 | Exact two-line dirty exit branch ->unconditional `setContextMap(null)` | App `Done opens the SaveDialog` | **Killed,1/1/1.** Expected Save changes dialog absent. |
| X6 | `imageCacheRef.current.delete(map);` ->`imageCacheRef.current.clear();` | World `a bumped version re-requests exactly that map` | **Killed,1/1/1.**4 image requests instead of3. |
| X7 | `export const GBC_COMPOSITE_ORIGIN = BORDER_RINGS * BLOCK_PX;` ->0 | App `the overlay composite lines up under the world tile` | **Killed,1/1/1.** Composite(-10,-60), expected(-42,-92). |
| X8 | Exact Edit here item gains `disabled: true` | World `the context menu's Edit here is enabled` | **Killed,1/1/1.** Disabled true instead of false. |
| R1-selection | Remove only selected/context mismatch guard | Entire committed App context suite | **Survived:15/15/15.** M1; no demonstrated reachable bug. |
| R2-event-props | Context MapCanvas gains `onMoveEvent={undefined}` after spread | Entire committed App context suite | **Survived:15/15/15.** I4. |
| R3-paint-units | rawBlockAt X divisor `BLOCK_PX` ->`(controlled ? 16 : BLOCK_PX)` | Entire committed App context suite | **Survived:15/15/15.** I4. |
| R4-no-tool | Context MapCanvas gains `activeTool={null}` after spread | App `painting through the overlay` | **Killed,1/1/1.** Confirms the existing test does protect basic tool wiring, unlike R2/R3. |
| R2-event-props-strong | Same R2 mutation | Experimental P5 event drag | **Inconclusive.** Before1pass; mutant fails on null stage at probe line492 before event assertion; restored1pass. Not credited as a kill. |
| R3-paint-units-strong | Same R3 mutation | Experimental P4 visible block paint | **Intended assertion failure observed, proof incomplete.** Before1pass; mutant fails exact apply-body equality at line472; bytes restored; restored test fails null stage at line460. Not claimed as clean G/R/G. |

**ID reconciliation:** required X1–X8 appear exactly once, all with nonzero baseline/witness/restored runs and byte restoration. Four additional original R IDs also appear exactly once. Two `-strong` rows are supplementary witness attempts for R2/R3, not extra required IDs or replacements for the surviving committed-suite results. Thus required survivors=0; additional committed-suite survivors=`R1-selection,R2-event-props,R3-paint-units`; one supplementary attempt inconclusive and one supplementary proof incomplete.

## GBA/test-change audit and design reconciliation

Independently inspected `git diff --numstat 9ce8b45 1f37436 -- packages/ui/test/` and the actual changed legacy tests. Excluding `test/gbc/` and the newly added `world/contextViewGbc.test.ts`, the test diff has **no paths**. Existing GBA test files, including contextView, are unchanged.

The 13 removed lines in the all-test diff are entirely GBC and have explicit behavioral reasons: two in GbcApp.test switch the obsolete plain-double-click Map expectation to Shift+double-click; eleven in GbcWorldCanvas.test replace disabled/hinted Edit here with enabled callbacks and supply onEditHere for the relevant menus. These are not removed GBA checks or unexplained test weakening. New test files are additive; `6c8ccd4` adds the ring integration assertion.

`6f71cea` repairs the old DESIGN menu paragraph: enabled GBC Edit here when supported in World, omitted in Dungeon. Quality M2 was based on the earlier frozen revision and is resolved in this reviewed range. The GBA section's broad sentence about selection changes leaving without prompt must be read with the existing dirty-selection guard; it is not authority to discard GBC changes silently. The implementation correctly retains that guard.

Accepted deferrals stay accepted: cramped world toolbar at1024px; unavailable Grid/Collision/Events/Encounters controls in context; a blank tile until its image loads. No new control/layout project or image-loader redesign is requested. Broader client warp/coverage cache freshness and pre-existing SaveDialog/session races are not added to this task's raster-refresh contract.

## Restoration, artifacts, and handoff

Final verified hashes match both the reviewer's initial Buffer hashes and the implementer's published values:

| File under `packages/ui/` | SHA-256 |
|---|---|
| src/gbc/GbcApp.tsx |`d61493c1328fcb540c39b914c3c1b3524900bbeac1eb58b596a6a758a30aef58`|
| src/gbc/GbcMapCanvas.tsx |`5823ba0f56812be2f9a67d4a91029802746f21418d2961216576cee9a7e99766`|
| src/gbc/GbcWorldCanvas.tsx |`95ab2171e65e9d555c3e50ae9a8e9b15caf7b052dd3622cbe0e67a03849f6599`|
| src/world/contextView.ts |`c8e7c81ecd6530747304c990a03248ca1a6af8fe1a01796901bce5475628929f`|

`git diff --exit-code 6f71cea -- packages/ui/src packages/ui/test packages/ui/DESIGN.md` returned0 after cleanup. No implementation or tracked-test changes remain. Before writing this report, status contained only pre-existing `.codex/`, coordinator `codex-resumption.md`, and the new quality report. They were left untouched. A process inventory found no node command matching this reviewer runner or Vitest.

Scratch artifacts preserved outside the repository:

- `C:/Users/Serve/AppData/Local/Temp/pokemap-plan7-codex/task-5b-spec-review-results.json`: full structured baseline/mutation/probe results, full assertion messages and stderr; consult this report's adjudication for the two strong rows.
- `C:/Users/Serve/AppData/Local/Temp/pokemap-plan7-codex/task-5b-spec-review-runner.mjs`: unique-anchor, serial execution and Buffer-restoration harness.
- `C:/Users/Serve/AppData/Local/Temp/pokemap-plan7-codex/task-5b-reviewer-probes.fragment.txt`: five independently authored probes.
- `C:/Users/Serve/AppData/Local/Temp/pokemap-plan7-codex/task-5b-reviewer-probes.test.tsx`: full preserved temporary fixture/test source. Its SHA-256 was `d55fa07a305e5b7eba1ef23ee1c54635814a883aa7c436321507cba4189cdd98`, identical to the repository temporary copy before removal. Its imports are relative to the original `packages/ui/test/gbc/` location. Fix the explicit stage-readiness wait before adopting P4/P5 as stable witnesses.

The temporary `packages/ui/test/gbc/__task5b_spec_review_probe.test.tsx` is gone; it cannot accidentally enter the coordinator's full gate. This report remains active because findings are open. No report files were deleted or archived. **Safe for the coordinator to schedule the single combined implementer fix round and its tests; this reviewer will perform no further tests or mutations unless asked.**
