# Task 5b B1 completion barrier — replacement implementer

Status: READY for coordinator review/mutations/live/full gate. Started from HEAD `83dab236269b44a9973590c32f1bba4acd90879a`, branch `plan-7-gbc-editing`. The previous implementer handle was unavailable; coordinator explicitly authorized this replacement. No subagents dispatched. Inspected the existing uncommitted canvas/tests/spec repair before editing; preserved completed Task5b fixes and all unrelated untracked files.

Independently read B1 in task-5b-fix-spec.md, task-final-branch-review.md and the preceding task-5b-fix.md evidence. Read canvas producer and reset/image/view effects, useGbcEditSession post/response sequence handling, server paint begin/apply/end handlers, and GbcMapEditing/GbcApp canvas/error callers. Session responses resolve only after fetch JSON/state handling; server apply awaits a body while end does not, so invocation order alone is insufficient. Scope reaches the canvas producer and its editing/App witnesses; no API/export/config/server changes are needed.

## Final behavior

`paintAt` returns the actual apply promise. One retained promise chain contains the previous end, next begin, first apply, every different-cell held-pencil move, finishing rect/shift apply and end. Moves require an open stroke, dedupe queued cells, and skip paint after failed begin. Settled failures remain visible on the issuing visit and allow end cleanup. Each stroke captures its visit, start cell and end callback; rect start no longer lives in a shared ref.

Layout cleanup retires queued ownership on map/ABA/unmount. If a stroke has no mouseup, cleanup appends end behind its existing chain, only if begin actually succeeded. Already-issued requests still settle on their captured session; queued old-visit paint is skipped. Late begin/apply/end errors cannot update a new visit. Removed the obsolete passive dragStart reset and updated the header comment. No event/dropper/view/cache behavior changed.

App alignment fixture now sets its actual image instance complete=true and naturalWidth/naturalHeight=384 before load. Exact World/body/origin numeric assertions and default timeouts remain. App fast-click witness independently holds apply after releasing begin, asserts no end/dirty marker while held, then verifies exact body and ordered begin/apply/end.

## Deterministic checks and provenance

Existing uncommitted deferred tests were inspected rather than represented as newly authored red evidence. They cover held begin/move; pencil/bucket/rect/shift first apply barrier; three independently held applies/end; adjacent stroke waiting for old end; map/ABA ownership; failures; off-map no-begin; same-cell dedupe. Added map/ABA/unmount retirement without mouseup for both held begin and held apply, plus retired begin/apply/end failure callbacks.

The first no-mouseup run was launched before production cleanup changes but its slow startup overlapped an edit; it ultimately reported three ReferenceErrors from an obsolete dragStart reset. This is **not valid semantic red evidence**. Removed that stale reference and the 39-case suite passed. The later retired-failure witness was run before its correction: 2 pass/1 fail, specifically rect apply called onEditError with `retired failure`. Guarded rect/shift failure continuations by the captured visit. An initial patch placed that helper in the wrong reset scope; the next edit suite reported 36 pass/6 fail, then correcting helper placement restored 42/42. No timeouts were inflated or assertions weakened.

One initial canvas command returned a running session and I accidentally started App before collecting completion. This violated the requested serial discipline; those runs are disclosed, not labeled serial. Subsequent final runs were serial and completed before starting the next. After expanding held-apply no-mouseup coverage, final CanvasEdit was rerun and typecheck rerun.

| Fresh final file | Pass | Fail |
|---|---:|---:|
| GbcMapCanvasEdit.test.tsx |45|0|
| GbcAppContext.test.tsx |23|0|
| GbcMapCanvasView.test.tsx |14|0|
| GbcMapCanvas.test.tsx |53|0|
| Total distinct focused tests |135|0|

Commands: `npm test -- <one-file-path>`; App final run used JSON reporter/output `b1-app.json`, inspected as23/0/23, success=true. `npm run typecheck`: exit0 after final test expansion. `npm run build -w @pokemap/ui`: exit0,73 modules after final production changes (subsequent changes tests only). `git diff --check`: exit0 before report append; repeated before commit.

## Limits and handoff

No new mutations executed: the replacement dispatch explicitly assigns mutations to the coordinator, overriding the earlier spec's implementer mutation instruction. Exact B1 completion/queue/ownership mutation proof and X7 repro remain coordinator-owned; no prior mutant ledger is reclassified. No full suite, browser, servers, live saves, corpus writes, server locks, dependencies or new subsystem. Already-issued requests cannot be canceled; cleanup failures on a retired visit are intentionally not shown in a different visit. Transport hook ownership and other independent session operations remain unchanged.

Commit uses explicit pathspecs for canvas, two tests, spec, this report and appended task-5b-fix.md evidence. Coordinator-owned reports, .codex/.claude and JSON scratch are preserved and excluded. No checkout/restore/stash/clean. Test processes have completed; serial slot is released.
