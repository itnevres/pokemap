# Task 5b — combined fix implementer report

**Status: READY for coordinator re-review and full gate.** The authorized single combined round is implemented on the same resumed implementer handle. **293 focused tests pass, typecheck passes, UI build passes; five mutations executed here, five killed, zero survivors.** No full-suite or live-browser claim.

## Scope, provenance and commits

- Original implementation `9ce8b45..ede8df3` preserved. Alignment test `6c8ccd4`, DESIGN correction `6f71cea`, and original verification report `1f37436` preserved. Coordinator committed reviews/resumption evidence in docs-only `4db3723` during resumption; no production drift occurred.
- Read Task 5b spec first in the original continuation, archived Task 5 reports, binding `packages/ui/DESIGN.md`, actual touched GBC implementation/hooks/callers, and actual required GBA E4 template code/reports and Phase E lessons. For this round read both completed reviews, affected callers again, preserved reviewer probe source, and compact parsed scratch JSON. Completed `task-5b-spec-review.md` supersedes the earlier coordinator recovery note.
- Wrote `task-5b-fix-spec.md` before code edits. Its starting revision reflects the then-current `1f37436`; the later `4db3723` only preserves coordinator-owned docs. No fresh feature scope, no subagents/model dispatch, no separate fix round. The running Codex handle was retained as the requested standard-equivalent continuation; no claim that Sonnet was selected or available.
- **`0d5ba4c fix(ui): enforce GBC context zoom and map visit boundaries`**: all production fixes, regression tests and fix spec, committed only after green focused checks, typecheck/build and R1/R2/R3 proof. Explicit `git add -- <paths>` and `git commit ... -- <paths>` covered only the three edited GBC source files, three test files, and fix spec.
- This report is a separate docs-only pathspec commit (identified in Git history by `docs(plan-7): report Task 5b combined fix evidence`). The original implementer/reviewer/coordinator reports are unchanged.

## Result by finding

### I1 — stepped context zoom, pending keys and Fit all

`GbcWorldCanvas` consumes `+`, `=`, `-`, `_` while context exists. Once its controlled map view is ready, it selects the adjacent existing `ZOOM_LEVELS` value and calls `setContextZoom`. Pending payloads return without reaching continuous World zoom. Ordinary World zoom remains unchanged. Fit all is disabled while context exists because its existing fit writes arbitrary scale; no new fit behavior was introduced.

Real App witness enters via the keyboard context menu, verifies focus remains on the same World canvas, and exercises `+` -> 2×, `_` -> 1×, real overlay wheel -> 2×, `=` -> 4×, `-` -> 2×, with disabled Fit all. Pending witness checks each alias separately (rather than allowing plus/minus changes to cancel), visible loading status and disabled Fit all. Existing World regression tests retain ordinary fit/continuous-zoom behavior.

### I2 — visible guarded payload failure in stable World host

The World host has a fixed sibling expression for context loading/error above its existing `GbcMapEditing` slot. The existing guarded fetch error is rendered as `role=alert`; pending payloads have a loading status. The canvas type/key and host/body remain stable. Done/Escape retain the existing recovery path; no retry subsystem or new transport handling.

Three real App cases cover rejected fetch, HTTP503 and malformed guarded payload. They verify the specific visible error, absence of the editing stage, exact same World canvas/body node, exit without a lingering alert, then successful context entry on another map with the same nodes. HTTP uses Escape; the other cases use Done.

### I3 — retirement and stale local continuations, including ABA

`GbcMapEditing` owns a fresh visit object on each actual `mapName` change. It adjusts only its own local pick/error/warning state during render, so React retries before rendering children; the chosen tool and canvas slot are retained. A layout effect publishes the committed visit object and clears it on cleanup. Guards compare object identity, which distinguishes A -> B -> A and also rejects callbacks after unmount; map-name equality would be insufficient.

Guarded local updates cover stamp/event selection, operation success clearing errors, failure banners, delete selection/warnings, duplicate selection, canvas paint-error callbacks, dismiss callbacks, and the move/undo/redo/discard promise continuations using the shared success/failure functions. Existing functional pick updaters still preserve a same-visit stamp when an event operation resolves. Hook transport/server state ownership was not changed.

Real App test visits Port -> City -> Port via tree/context, checks exits, stamp retirement on return, retained Pencil, and exact host/canvas identity. Local component witnesses cover retirement of stamp/event/error without any intervening pick, and warning retirement. The deferred matrix holds each of move/delete/duplicate/undo/redo/discard, then visits B or A -> B -> A, selects a current stamp/event and installs a current error before resolving/rejecting the old operation. All 24 combinations preserve the current state; stale delete warnings do not appear. Two captured canvas-error cases cover B and ABA. These local-state tests use the public `renderCanvas` seam with the real editing toolbar/palette/inspector; they are not claimed as additional full-App transport tests.

### Quality M1 / spec I4 — consistent visible paint and event App witnesses

The App payload/layout/world now consistently use 10×10 blocks, with 100 initially-zero cells. The edit mock returns clean on begin, changes target cells on apply, and returns resulting state on end. Removed the impossible negative/offscreen, already-dirty paint witness and its false discard comment. The inherited alignment test remains intact.

Independent geometry: Port placement (10,0), size10×10, double-click (150,100), scale32 gives world pan=(-330,-60), body=(-10,-60), border-ring composite=(-42,-92). Client (134,52) is native offset(144,112): **block(4,3)** at32px, **event step(9,7)** at16px. Client (150,68) gives offset(160,128), **step(10,8)**. Coordinates are positive and inside the200×200 viewport and10×10 map.

The real overlay-stage helper waits explicitly for the stage after snap, then installs its deterministic rect. Paint starts clean, holds begin, asserts only begin is sent and no dirty indicator, releases it, checks exact begin/apply/end order, full pencil request (target and origin(4,3),1×1 stamp id1) and clean -> dirty. Event drag uses payload warp step(9,7), then checks exact App request `{kind:"warp",index:0,x:10,y:8}`. No production coordinate or callback-wiring change was needed.

### Spec M1 / R1-selection — isolated fallback proof

`GbcAppContextSelection.test.tsx` isolates the public World callbacks, invoking `onEditHere("A")` then `onSelectMap("B")` in the actual App without tree/mode handlers. It checks context exits, sidebar B selection and retained World mode. Removing only the existing selected/context mismatch guard leaves context A and fails the assertion. This is a callback-invariant witness, not a claim that a browser pointer can penetrate the editing overlay. The real App tree-exit witness is separately retained.

**Quality M2** was already resolved by `6f71cea`; no further DESIGN change was needed.

## Tests-first evidence

Every invocation selected exactly one test file. No concurrent Vitest processes and no directory-wide/full suite.

1. Before production changes, expanded App context suite: **16 pass / 6 fail**. Failures: keyboard/Fit all contract, pending/Fit all contract, three missing payload alerts, and returned A stamp. The new coherent paint and event witnesses passed unmutated.
2. Refined zoom assertions before fixing production: targeted two tests **0 pass / 2 fail**. Keyboard entry showed **120% instead of200%**; pending `+` changed **31% to38%**. Fit-all checks were moved after zoom behavior so they no longer mask the keyboard failure, and pending keys were checked individually.
3. Before production changes, expanded editing suite: **8 pass / 28 fail**. Two retirement cases, all24 late-operation cases and both stale canvas-error cases failed on old state resurrecting, current errors disappearing/being replaced, current selected event clearing/replacing, or warning resurrection. These were assertion failures after operations/callbacks executed, not stage lookup failures.
4. After the minimal fixes: App context **22/0** and editing **36/0**. Following deferred fixture typing/loading-status refinement, reran both: **22/0**, **36/0**. The isolated selection test passed **1/0**, then its exact fallback mutation failed **0/1**, then restored **1/0**.

Final green focused file totals (repeated witness invocations are not added to this total):

| File under `packages/ui/test/gbc/` | Passed | Failed |
|---|---:|---:|
| GbcAppContext.test.tsx |22|0|
| GbcAppContextSelection.test.tsx |1|0|
| GbcMapEditing.test.tsx |36|0|
| GbcWorldCanvasContext.test.tsx |36|0|
| GbcMapCanvasEdit.test.tsx |21|0|
| GbcMapCanvasView.test.tsx |9|0|
| GbcAppEditing.test.tsx |7|0|
| GbcAppWorldGuard.test.tsx |7|0|
| GbcWorldCanvas.test.tsx |121|0|
| GbcApp.test.tsx |33|0|
| **Total** |**293**|**0**|

Commands: `node node_modules/vitest/vitest.mjs run <exact-file> --reporter=json`, adding `-t <witness>` for mutations. JSON parsed for exit/counts/failed assertions; unsupported jsdom canvas diagnostics in inherited unstubbed suites were not treated as behavioral proof.

`npm run typecheck`: **exit0**, both root and UI TypeScript projects, including tests. Executed twice, with the final run after test fixture refinement. `npm run build -w @pokemap/ui`: **exit0**, Vite73 transformed modules. `git diff --check`: **exit0**. These ran before the green implementation commit; subsequent experiments restored those exact source bytes and made no code changes.

## Mutation proof — executed in this fix round

Inline Node harness read an original Buffer, verified UTF-8 round trip, required exactly one occurrence of every literal anchor, and held bytes in memory. Baseline required nonzero passing tests and zero failures. Mutation ran serially against one suite; `finally` wrote the original Buffer and compared bytes. Restored witness had to pass the same nonzero count. No checkout/restore/stash or file-copy undo. An initial harness syntax error occurred before parsing/executing any filesystem write or test; corrected it, then executed the five rows below.

**G/R/G** counts below are baseline passes / mutant assertion failures / restored passes. All restored=true; all underlying Vitest exits0/1/0. IDs checked against exact reviewer R IDs, then reconciled with this round's five expected distinct IDs (five present, zero missing/duplicates).

| ID | Exact literal anchor -> mutant | Witness and observed outcome |
|---|---|---|
| R1-selection | App: `if (contextMap !== null && selected !== contextMap) setContextMap(null);` -> `/* reviewer mutation: omit selected/context invariant */` | Isolated `World selection callback`: **killed1/1/1**; expected context `none`, got `A`. |
| R2-event-props | App: `<GbcMapCanvas {...canvasProps} chromeless view={view} onViewChange={onViewChange} />` -> same element with `onMoveEvent={undefined}` immediately after spread | `overlay event drag uses`: **killed1/1/1**; expected calls to include `POST /api/edit/OlivinePort/event/move`, absent. Stage was ready and drag executed. |
| R3-paint-units | MapCanvas: `x: Math.floor(((e.clientX - rect.left - pan.x) / zoom - originX) / BLOCK_PX),` -> same expression dividing by `(controlled ? 16 : BLOCK_PX)` | `visible clean overlay paint`: **killed1/1/1**; full apply-body equality failed at the exact request assertion, after begin/apply/end. Wrong X is source-derived floor144/16=9 rather than4; Y retains floor112/32=3. Restored body assertion passed. |
| F1-context-keys | WorldCanvas: `if (inContext && ["+", "=", "-", "_"].includes(e.key)) {` -> `if (false && inContext && ["+", "=", "-", "_"].includes(e.key)) {` | `keyboard Edit here\|pending context`: **killed2/2/2**;120% instead of200%, pending31% ->38%. |
| F2-visit-identity | MapEditing: `const isCurrent = () => currentVisit.current === visit;` -> `const isCurrent = () => currentVisit.current?.mapName === mapName;` | `after A to B to A\|ABA=true`: **killed13/13/13**. Late success clears current alert; delete clears current selected warp; duplicate replaces it with object index1; all six rejections replace current error with `stale error`; captured canvas failure replaces it with `stale canvas error`. |

**Executed here:3 exact reviewer R IDs plus2 additional fix guards,5 executed/5 killed/0 survived/0 inconclusive.** No independent additional fix round was taken.

### Preserved independent review outcomes (not rerun here)

The completed reviewer report and compact parsed scratch JSON contain required X1–X8 exactly once, all killed with restored byte checks: X1 native GBA default32 (16baseline/11failures/16restored); X2 GBC native16; X3 map-keyed World remount; X4 bubble Escape; X5 unguarded dirty exit; X6 whole-cache clear; X7 zero composite origin; X8 disabled Edit here. X2–X8 each1/1/1. These are retained historical evidence, not newly executed results in this fix round.

Original committed-suite **R1-selection/R2-event-props/R3-paint-units survived15/15/15**. They are now each independently killed above by stronger committed witnesses; the old survivor record is not rewritten. R4-no-tool was independently killed1/1/1. The reviewer `R2-event-props-strong` result was **inconclusive on stage readiness**, despite the JSON's raw KILLED label; `R3-paint-units-strong` observed a request assertion failure but **lacked restored green**, also despite its raw label. Neither was credited as clean proof. This round supplies fresh complete G/R/G for the original R2/R3 IDs.

## Restoration and scope audit

Post-mutation `git diff --exit-code 0d5ba4c -- packages/ui/src packages/ui/test` returned0. SHA-256 after restoration:

| `packages/ui/src/gbc/` file | SHA-256 |
|---|---|
| GbcApp.tsx |`f1fd67cfae70afcbc74e110d9dfbbb9c71a077beeb599889f6ecb352c6dcdeea`|
| GbcMapEditing.tsx |`80a145b0344551683d460137ad4820552fb356c79d89bc8acf2b8a508a174207`|
| GbcWorldCanvas.tsx |`2eb79a07f00400b5188029613673575334cf7148a64f47b7bcdd0e892e8d28d7`|
| GbcMapCanvas.tsx |`5823ba0f56812be2f9a67d4a91029802746f21418d2961216576cee9a7e99766`|

Scope from `4db3723` is only the three GBC source files, three GBC test files, fix spec and this report. GbcMapCanvas has no permanent edit. No GBA/shared math edit, no real corpus or `.codex` write, no server launch, no external scratch/corpus write, no live save. Existing `.codex/` remains untouched/untracked. Coordinator-owned resumption/review docs were left intact when committed by the coordinator. No report deletion/archive was performed while findings await re-review.

## Concerns and remaining coordinator checks

- No known unaddressed finding from the consolidated request. Await independent re-review of `0d5ba4c` and this evidence, on the same implementer context if further authorized feedback arrives.
- The callback-isolation selection proof pins the required App invariant but does not establish a new reachable browser input path. Deferred local-state tests pin the component seam; the server/session hook's separate ownership and pre-existing transport/save races are unchanged.
- Same-visit out-of-order operations and edit-session transport sequencing are not expanded into a new subsystem. This fix specifically retires actual visits and prevents old-visit local UI writes, including ABA.
- Coordinator retains full suite, live geometry/pixels/error recovery, and any save/real-corpus verification. No browser was opened or live save executed here. Existing accepted control/layout/image deferrals remain accepted; no new feature or redesign.
- Test slot released after the final serial App regression. No Vitest process remains from this round; mutations are restored, committed implementation is reviewable, and report is ready.
