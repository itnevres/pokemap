# SDD ledger — plan: docs/superpowers/plans/2026-10-12-pokemap-plan-8-ui-engine-adapter.md

Worktree: scratchpad `p8` (session 74282ac3), branch `plan-8-ui-engine-adapter` from master `3f9f8ce`. Main checkout stays on `issues-5-6-warp-popups` with its uncommitted work untouched.
Spec: none separate (plan says so); design rationale = Plan 7 audit `_archive/task-5b-claude-audit-coordinator.md`. Rulings are provisional against the plan text.

User decisions (2026-10-12): #5/#6 ordering = **Plan 8 first**, then rebase #5/#6 onto the shared modules. Checkout = **scratch worktree** (no WIP commit).

Ruling: ledger and reports live in `docs/superpowers/task-reports/pokemap-plan-8-ui-engine-adapter/`, not `.superpowers/sdd/` — the user's CLAUDE.md item 7 names that path — cost if wrong: none (location only).
Ruling: the delegate skill's "git stash the failed attempt" step is replaced by saving `git diff` to `<report-dir>/failed-<model>-task-N.patch` and resetting with `git apply -R` — the user forbids stash/checkout/restore — cost if wrong: none.

## Pre-flight conflict scan

| Pair / task | Produces → consumes | Finding |
|---|---|---|
| T1 → T3 | `StrokeChain.settled()` → `useContextEditing.strokeSettled` | consistent |
| T1 ↔ T6 | T1 edits both map canvases; T6 wraps them via `buildCanvasProps`; T3 adds `onStrokeChain` to canvas props | T6 must keep T3's `onStrokeChain` in `buildCanvasProps`. Carry into T6 dispatch. |
| T2 ↔ T3 | T2 world canvases; T3 App/GbcApp | disjoint files |
| T3 ↔ T6 ↔ T7 | App shells edited by T3, T7; workspace by T6 | sequential, consistent |
| T5 ↔ T7 | `useSession` returns both result types unchanged | consistent |
| T6 → T7 | `WorkspaceSlots` → `EngineAdapter.slots` | consistent |
| T2 → T7 | `native` = `geometry.nativePx` | consistent (16/32) |
| T1 self | Step 7 "each mutant kills in both families" vs GBA having no visible error path | Ruling below |
| T2 self | tests list matches interface | consistent |
| T3 self | Step 4 says "no new context provider" + optional `onStrokeChain` | consistent |
| T4 self | stop rule may leave pairs unmerged | consistent |
| T5 self | consistent |
| T6 self | consistent |
| T7 self | stop rule | consistent |
| T8 | decision gate only; stops for user before push/PR | consistent |

Ruling: T1 "no terminal catch" and "throwing onError" mutants must kill in the shared suite and the GBC suite; GBA passes a no-op `onError` (no error UI today), so a GBA kill is not required for those two — adding GBA error UI would be an unnamed behaviour change — cost if wrong: GBA lacks a family-level M3 witness (shared suite still covers the code path both use).
Ruling: T1 executed spec rulings R1-R9 are in `task-1-spec.md` (notably R2: GBA `queue` with no open stroke is a no-op, removing GBA's begin-less drag-in paint) — cost if wrong: a held-button drag entering the GBA canvas from outside no longer paints (it previously painted without a stroke/undo step).

## Progress

Task 0: complete (preflight.md; baseline 2,572/2 load-only flakes, both pass isolated 44/44; typecheck+build pass; external state unchanged)
Ruling: Task 1 implementer = Claude Sonnet (delegate §1: the task builds its own oracle and is concurrency, so no offload hop), not Opus — the logic is a move of already-reviewed GBC B1 code, and the GBA witnesses mirror existing GBC tests; Opus does the split spec review — cost if wrong: an extra fix round.
Task 1: BASE f05ff8b; implementer dispatched (sonnet)
Task 1: implementer DONE f05ff8b..cfa6bdd (2,616 pass /153 files; oracle diff 0 lines). Incidental GBA changes: R2, R5, plus mouseup/mouseleave with no open stroke now sends no endStroke (matches GBC).
Ruling: accept "no endStroke without an open stroke" in GBA — an end with no begin is a no-op server call; GBC already pins it — cost if wrong: none user-visible.
Task 1: quality review (sonnet) Approved, 0C/0I/5 Minor (task-1-quality-review.md).
Task 1: minor (deferred): stale pendingPaintRef/dragStartRef comments MapCanvas.tsx:108/255/785, GbcMapCanvas.tsx:64; garbled endActiveStroke doc in GbcMapCanvas.
Task 1: minor (deferred): render-phase onErrorRef write; settled()/redundant .then; test hygiene (double flush, one weak negative, real 40 ms timer).
Task 1: coordinator mutations M1-M6 all killed (task-1-mutations.log; M0 baseline green; restore byte-identical). M6 kills shared+GBC only, per ruling. M2/M4 not killed by gbcNew alone but killed by gbcEdit.
Task 1: spec review (opus) Spec ❌, 0C/2I/4M (task-1-spec-review.md).
Ruling: I1 (M3 incomplete on finish path: throwing onError inside the last-apply catch skips endStroke) is real — fix in the hook so report never throws, plus a shared test — cost if wrong: none.
Ruling: I2 (retired GBA stroke's end response clobbers the new map's state) — fix now with a map-only response guard in GBA `useEditSession.call` (a `latestMapRef`, apply only if still the same map), mirroring GBC's `latest.current.mapName === mapName`; tested in a NEW file. Outside Task 1's file list; named reason: the chain must end a retired begun stroke (R6) and that end's response must not paint the new map. Task 5's shared core subsumes it — cost if wrong: Task 5 merges one extra line.
Ruling: spec Minor 1 (GBA no end without open stroke) — already ruled above. Minor 2 (GBC stroke now uses session captured at mousedown; mid-stroke same-map seed change drops later responses from the view) — accept; narrow edge, Task 5's core revisits the seed guard — cost if wrong: a stale view after a mid-stroke refetch until the next edit.
Task 1: minor (deferred): spec-review Minors 3-4 (see task-1-spec-review.md; retire-before-begin untested, etc.).
Task 1: fix round 1/5 (4 addressed, 0 open — I1 M3 finish path, I2 GBA map guard, Minor 3 test gaps, Minor 4 act flushes; commits cfa6bdd..e3d66b9). Re-review (sonnet) all ADDRESSED, 0 new breakage. Gate 2,624/0, 154 files.
Task 1: coordinator mutations r1 (task-1-mutations-r1.log): M1-M5, M7, M8, M9 killed; M0 green; restore byte-identical.
Ruling: M6 (terminal catch removed) now survives as an EQUIVALENT mutant — after the I1 fix `report` cannot throw, so the terminal `.catch(() => {})` is unreachable; M8 (report unguarded) is the live M3 witness and is killed in shared+GBC — cost if wrong: none (the catch stays as defence in depth).
Task 1: live check both families PASS (task-1-coordinator.md). Task 1: complete (commits f05ff8b..e3d66b9, review clean after 1 fix round)

Task 2: BASE dc33490. External baselines re-measured at session start: all match (PerfPlus 81ededbe3 clean, no .pokemap, blk 0b7d45d/asm 56f87ef; pret 3bc8daa41 clean; GBA 718b89f73 8 lines, world 9c8ab2a, dungeons f73f9b7).
Ruling: T2 executed spec rulings R1-R11 in `task-2-spec.md` — notably R1 (hook interface adapted to real field names: `onExitRequest`, `context.origin`, plus `canvasRef`/`snapPointerRef`/`viewport`/`overlayRef`), R3 (`maxWorldZoom` consumed by GBC only; GBA keeps its no-context-cap wheel bound), R4 (M6 = step to the next level strictly beyond the current zoom; witnessed in shared + GBC only, GBA has no step UI), R6 (zero-size GBA placement → null: an outside double-click there no longer exits) — cost if wrong: R3/R4 leave GBA without the context cap/step-zoom GBC has (unchanged from today); R6 only affects an un-enterable zero-size map.
Ruling: T2 implementer = Claude Sonnet, no offload hop — delegate §1: the task builds part of its own oracle (hook suite, M6 witness), spans 5+ files and is high-risk view math; Opus does the split spec review — cost if wrong: an extra fix round.
Task 2: implementer dispatched (sonnet)

## Routing for Tasks 2-8 (user direction 2026-10-12: prioritise offloading)

Ruling: implementers for Tasks 2-8 go to Codex first (`codex exec -s workspace-write`, it writes BOTH code and tests), Sonnet subagent only as fallback per the delegate skill's failure rules. This overrides the delegate skill's "building the oracle → Anthropic" row for this plan, because: (1) the coordinator's task-N-spec.md lists the exact test cases and assertions, so tests are transcription, not design; (2) Codex's report must show red-before-green; (3) Opus spec review stays independent; (4) coordinator mutations check test teeth regardless of author. Task 1 data: implementer ~340k Anthropic tokens vs reviews ~330k, so this roughly halves Anthropic spend per task. Splitting "Codex writes code, Anthropic writes tests" was rejected: the test writer must read nearly the same context as the implementer, giving back most of the saving; running tests needs no model — cost if wrong: an extra fix round or a Sonnet fallback per task.
Ruling: reviews stay on Anthropic. Tasks 2-3: split Opus spec + Sonnet quality. Task 5: split Sonnet+Sonnet (async state). Tasks 4, 6, 7: one merged Sonnet review. Fix rounds 1-3: `codex exec resume <id>` with findings; rounds 4-5: Sonnet. Scoped re-reviews: Sonnet — cost if wrong: a weaker review misses a defect that the final Opus whole-branch review must catch.
Note (coordinator, 21:55): Task 2 was already implemented by a Sonnet subagent in another session (de33885..862a77c, 18:41-18:45) before the routing ruling above; its 4 uncommitted ledger lines were swept into commit 86cf880 unchanged. The Codex-first routing therefore applies to Task 2's fix rounds and Tasks 3-8. Task 2's reviews have not run yet.
Task 2: implementer DONE dc33490..862a77c (de33885 hook+tests, 88340ad GBC, 3b7051f GBA, 862a77c report). Gate 2,644 pass/0, 156 files; typecheck+build pass; oracle empty. Reviews dispatched: spec (opus), quality (sonnet).
Task 2: quality review (sonnet) Approved, 0C/0I/4M (task-2-quality-review.md).
Task 2: minor (deferred): GbcWorldCanvas.tsx:948 dead `contextView` destructure; stepZoom `[...].reverse()` + inconsistent `!`; useWorldContext.test no-op wrapper + misleading "capture-phase" title; no hook test for overlay double-click with `placement: null` (R6).
Task 2: spec review (opus) Spec ✅, 0C/0I/3M + 2 ⚠️ (task-2-spec-review.md). ⚠️1 (a hook-only `native` default is unkillable since both callers pass it) and ⚠️2 (no `indexOf` site left) resolved by the coordinator mutation design: M1a/M1b force the hook's native to 16/32 (= a family's native ignored), M5 reinstates the pre-fix indexOf body in stepZoom.
Task 2: minor (deferred): spec m1 = quality m1 (dead GBC `contextView`); m2 merged hook comment lost GBA's "separate sequential setters" wording; m3 no test that the Escape listener is removed on leaving context.
Task 2: coordinator mutations (task-2-mutations.log): M1a, M1b, M2, M3a, M3b, M4, M5, M6, M7 killed as designed (M5 shared+GBC only per R4; M1a kills GBC side, M1b GBA side); M0 green; restore byte-identical.
Task 2: live check both families PASS (task-2-coordinator.md): GBC 368,640 / GBA 358,400 body bytes, 0 mismatches; dirty Escape → SaveDialog, dialog Escape closes only it; undo + Done exits on the same canvas node; all external bytes unchanged.
Task 2: complete (commits dc33490..862a77c, review clean)
