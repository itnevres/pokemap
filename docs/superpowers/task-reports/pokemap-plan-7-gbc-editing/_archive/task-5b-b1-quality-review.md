# Task 5b B1 independent quality re-review

Verdict: **B1 addressed in frozen `b0f448a` relative to `83dab23`.** No new Critical, Important, or Minor fix-induced breakage identified in the scoped static review. This is a source/test-design judgment, not fresh runtime acceptance.

## Scope and evidence

Read the B1 finding in `task-final-branch-review.md`, the B1 continuation in `task-5b-fix-spec.md`, `b1-review.diff`, and `task-5b-b1-implementer.md`. Independently inspected the frozen canvas, editing caller, session hook, server paint handlers and request dispatcher, added component witnesses, and App test diff through `git show b0f448a` and the explicit base-to-tip diff. The implementer's execution narrative was not used as proof of correctness. An initial filesystem lookup used the wrong hook directory; the subsequent frozen read used `packages/ui/src/gbc/hooks/useGbcEditSession.ts` successfully.

Only this report was written. No tests, mutations, browser operations, corpus access, server launches, index changes or HEAD changes were performed. Broader findings outside the B1 correction were not reopened.

## Independent completion derivation

`GbcMapCanvas.tsx:619–630` now returns the actual pencil/bucket apply promise. At mousedown, the continuation appended to `pendingPaintRef` awaits begin, marks that particular stroke begun, checks visit ownership again, and returns `paintAt`. Promise assimilation therefore keeps the continuation pending through the first apply. Immediate mouseup appends end to that pending continuation; it cannot observe only begin completion as the old implementation did.

Each different-cell held-pencil move appends a continuation to the same ref rather than invoking apply directly or replacing the ref with an unrelated request. A move before begin completion waits behind begin and the first apply. Three queued cells consequently issue in order, each after its predecessor settles. The mousemove branch additionally requires an open stroke; entering from an off-map mousedown cannot create a paint without begin. Recording the last queued cell suppresses repeated events while that cell is still waiting.

Mouseup synchronously closes the gesture and clears its ref before appending completion. Its captured start cannot be overwritten by the next gesture. Rect and shift await their finishing apply in that completion continuation, then await end. Mouseleave supplies no finishing cell and still closes the begun stroke. Since end itself remains in `pendingPaintRef`, a subsequent same-instance stroke queues its begin after the previous end round trip, including when the user clicks again before end resolves.

This is a real transport completion barrier: the hook's `post` awaits fetch, JSON decoding and response validation before the operation promise resolves. Its callbacks capture `mapName` through `post`. The server applies only after reading its request body, whereas begin/end do not read a body. Waiting for the full apply response removes the specific end-overtakes-apply path described by B1 without changing server locking or response sequencing.

## Ownership, cleanup and failure handling

The layout effect creates a new object identity on every committed map visit and retirement. A→B→A does not recover A's previous token. Queued begin and pencil apply continuations consult that identity; an issued begin also checks again after awaiting its response. Thus a begin already on the wire may finish, but its queued first paint is skipped after retirement. Already-issued apply is allowed to settle.

When mouseup already appended end, `strokeRef` is null and retirement does not append a duplicate. When there was no mouseup, cleanup captures the still-open stroke, appends its saved end callback after the retained chain, and ends only if begin succeeded. The callback still addresses the old map. A new map gesture in this retained component queues after that cleanup. Unmount retains the old promise closures sufficiently to finish an issued stroke; it does not cancel transport.

Begin rejection is caught and displayed for the current visit. `begun` remains false, so queued moves and finishing rect/shift paint are skipped; ordinary completion still attempts end cleanup. Apply rejection is caught, displayed and settled, permitting later queued work and end. Rect/shift catches similarly permit end even after a rejected finishing apply. End rejection is caught at the chain boundary, so a subsequent gesture is not permanently blocked by a rejected promise. Late errors are guarded by visit identity; retirement cleanup deliberately suppresses errors that can no longer be displayed in their issuing visit. The existing editing caller adds its own local visit guard.

## Test validity and minimality

The deferred tests hold begin and apply independently for all four painting tools, hold three drag applies separately, and hold end before a second gesture. Negative assertions occur while the predecessor promise is unresolved, followed by release and positive assertions. These distinguish completion order from mere invocation order. Exact drag targets and a repeated queued-cell event retain useful dedupe evidence. Map/ABA/unmount cases cover both issued begin and issued apply, with and without prior mouseup; failure cases exercise current-visit reporting and retired-visit suppression. The App witness additionally holds the real fetch path's apply response after begin release and checks that end and the dirty indicator remain absent until release.

The alignment fixture change supplies decoded image metadata on the actual image instance before synthetic load. Its 384 pixels follow `(10 + 2) * 32`; the existing body and composite coordinate assertions remain. This correction does not loosen readiness or numeric expectations.

The production change is confined to the responsible producer and reuses its promise ref, adding only visit and captured-stroke ownership state. It introduces no dependency, API, server subsystem or unrelated feature. Tests are larger than the production change because the independent asynchronous boundaries require separate witnesses; they are relevant to the original failure mechanism.

## Limits

No fresh runtime or mutation results are claimed; the implementer's 135 focused passes and build/typecheck claims remain attributed evidence. Coordinator mutation, live and full-gate acceptance remain outstanding from this review's perspective. The barrier belongs to this mounted canvas instance; it does not claim to serialize independent edit operations or a newly mounted canvas against requests from an older instance. Already-issued requests and ambiguous transport failures remain subject to the existing session/server lifecycle limits. No additional B1 defect was established from those broader limits.

## Frozen `1eb8f81` test-only follow-up

Verdict: **PASS for the scoped witness correction; no new Critical, Important or Minor breakage identified.** Inspected only the committed diff, its implementer appendix, and the frozen adjacent-stroke test. Production is unchanged from the prior reviewed revision. Did not inspect the temporarily mutated working source or run any tests or mutations.

The coordinator reports that `B1-end-chain`, replacing the unique `await editSession.endStroke();` anchor with `void editSession.endStroke();`, survived the original witness with baseline/mutant/restored all passing. This corrects the earlier report's test-validity assessment for adjacent strokes: although its first end was held independently, the original negative assertion was synchronous immediately after the second mouseup. It could pass before the second begin's promise continuation received any execution opportunity. The source-level derivation of production end retention remains valid; the original witness alone did not demonstrate sensitivity to its removal.

The committed one-line `await act(async () => {})` is positioned after the second mouseup and before the one-begin assertion, while the first end promise remains unresolved. This yields to queued promise continuations without releasing the boundary under test. Correct production must therefore retain one begin at that observation. With end no longer awaited, the previous completion chain can settle and let the second begin run during that asynchronous observation window. The later explicit end release and two-end/two-begin assertions remain, ensuring the queued gesture eventually proceeds. No timeout inflation, weaker count, changed mock resolution or production modification accompanies the correction.

This is the smallest appropriate repair to the demonstrated scheduling gap. The original mutant outcome remains a survivor until the coordinator records the strengthened mutant and restored runs; this static follow-up does not claim a kill. The implementer appendix discloses possible overlap with coordinator mutations during its targeted green run, so that run cannot establish isolated validation of this frozen commit. Coordinator evidence is still required for final runtime closure.

## Final scoped B1 disposition — 2026-10-10

**B1 CLOSED for production `b0f448a` with final tests `1eb8f81`.** This append-only disposition supersedes the original B1 CHANGES_REQUIRED finding for that candidate; the original finding and its historical evidence remain intact. It is a scoped closure, not a repeated broad review or a claim that the full repository suite is all-green.

The independent source review in `task-5b-b1-quality-review.md` established that first apply, queued drag applies, finishing rect/shift and end remain in the completion chain, with captured visit ownership and cleanup. The one-line test follow-up was separately reviewed. I now reconciled that judgment against `task-5b-b1-coordinator.md`, the final and initial mutation JSON, the final npm/typecheck/build logs, and both external-state JSON snapshots. No executable checks were rerun for this disposition.

The final ledger contains exactly R1-selection, R2-event-props, R3-paint-units, X7, B1-first-apply, B1-drag-queue, B1-end-chain, B1-visit and B1-retire-cleanup. Baseline passes / mutant assertion failures / restored passes are respectively 1/1/1, 1/1/1, 1/1/1, 1/1/1, 2/2/2, 2/2/2, 1/1/1, 7/5/7 and 6/6/6. Every restored flag is true and every restored run has zero failures. The visit mutant retains two passing cases; it is killed by five other cases, not represented as seven failing cases. Assertion messages match the intended lost guarantees: early apply/end, second begin before prior end, extra retired paint, missing cleanup, incorrect selection/event/body/origin. These are assertion failures rather than empty runs or infrastructure failures.

The initial B1-end-chain 1 baseline pass / 1 mutant pass / 1 restored pass remains a genuine historical survivor. The final one-begin assertion now fails with two begins under that mutant after the asynchronous observation correction, and restored production passes. The final kill does not rewrite the earlier ledger or retroactively validate the original synchronous witness.

Coordinator live evidence records real PerfPlus handler responses gated independently at begin and first apply, with rapid click and three-cell drag request/response ordering, dirty/undo transitions and no alerts. It also records the explicit save changing only block offset45 from1 to7, World pixel refresh, then reverse UI save and cmp0 for both original blk and asm. This corroborates the reviewed completion contract and preserves explicit-write behavior. Live observations are attributed to the coordinator; this reviewer did not repeat browser actions.

The full test log establishes 2,572 passes and exactly two failures in 150 files: the known GBA world placement count (186 versus1209) and dungeonAutoLayout comparison (186 versus186). There is no additional App readiness failure in that run. Typecheck capture has no diagnostics and coordinator records exit0; build capture completes with73 modules and coordinator records exit0. Thus acceptance returns to the documented two-failure local baseline, not an all-green full suite.

The before/after external JSON independently agrees on all three heads and exact porcelain entries: seven existing GBA entries, clean PerfPlus and clean pret. Those JSON files contain heads and porcelain, not file hashes. Preservation of the newer GBA world hash9c8ab2a86d8fad7ac534629a138be0a87df30cea, dungeons hash and original PerfPlus blk/asm bytes is therefore supported by the coordinator's recorded hash/cmp evidence, not falsely attributed to fields in those JSON files.

No new Critical, Important or Minor B1 fix-induced finding remains. Existing limits on already-issued requests, independent operations and cross-instance session lifecycles remain as previously documented. This closure authorizes no push or PR and makes no new claim about unrelated broad-review areas.
