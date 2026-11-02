# Plan 13 ledger

- Tier: High for all tasks (shared shell/canvas core, async ordering, hub I/O, Save path).
- 2026-10-28 spec `a3037cc`, P13-3 `889fdd0`. Builder check: Dots (free), 5 wiring questions, none for the user; folded in.
- Plan review: Codex gpt-6-astra. R1 Needs rework (7 Important, 1 Minor) -> fixed. R2 Needs rework (5 Important, 1 Minor) -> fixed
  (GBC endpoints now resolved from the warp cache; shortcut ownership; pending-open cancel; nested dialog focus). R3 Approved with
  fixes (1 Minor, fixed). Reviews: plan-review.md, plan-rereview.md, plan-rereview2.md.
- Inline doc edits by the conductor (spec/plan wording; reason: tiny, decision-bearing).

## Preflight scan (2026-10-28)
| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T1-T2 | T1 `?scope=dungeon` route; T2 builds that URL | consistent |
| T2-T3 | both edit WorldSurface.tsx (useWorld call vs warp state) | separate regions, sequential, ok |
| T3-T4 | T3 dungeon `tileVersions`; T4 `bumpTile` feeds it | consistent |
| T3-T5 | T3 `failedWarps`/`unresolvedWarp`; T5 clears on resolved double-click | consistent |
| T4-T5 | T4 `ShellSlots.openWarpDestination`; T5 wires surface to it | T4 tests have no UI trigger before T5 |
| T1..T5 self | tests vs code each agree | ok |
Ruling: T4 tests open the popup by capturing `slots` through a test adapter that wraps the real family runtime's renderWorld/renderDungeon — T5 adds the end-to-end double-click tests — cost if wrong: T4 tests miss a wiring bug T5 then catches.

## Tasks
- Task 1: tier Opus (hub I/O, server scope). Hop: Codex gpt-6.1-sol direct (skips Aider: >3 files incl. tests and must run the server tests to find subject map names). Worktree <scratchpad>/wt13 branch p13-t1, base 300fdf6.
- Task 1 hops: codex gpt-6.1-sol BLOCKED (sandbox: git index.lock, vitest EPERM; wrote tests only, conductor verified red + committed 0aa4bd4) -> aider nemotron-ultra done (impl; conductor wrapped 3 long lines, CRLF ok). Red 3/3 right reasons; GBC affected. Green 106/106; server suite 385/385 (19 files); mutations 3/3 killed.
- Task 1 reviews (Codex gpt-6-astra, separate): spec PASS; quality Approved with fixes, 2 Minor.
- Task 1: minor (deferred): stale comments gbcRoutes.ts:499 ("query params ignored") and :228 (no dungeon-scope exception).
- Task 1: minor (deferred): gbcRoutes.test.ts:1361 unconditional unlinkSync in finally can mask the original failure (ENOENT).
- Task 1: complete (commits 300fdf6..a38b147, review clean)
- Task 2 hops: codex gpt-5.6-terra done (sandbox cannot run vitest/git: conductor verified + committed). Fix round 1 (same session): 12 other dungeon-mode tests mocked only "/api/world"; mocks widened, assertions unchanged. Focused 53/53; red 4 new fail with src reverted; mutation (always "world") kills 3; UI suite 123 files / 1996 passed; typecheck ok.
- Task 2 reviews (Codex astra): spec FAIL (1 Important: full gate/build/live not yet run; 2 Minor docs CRLF/long lines); quality Approved with fixes (1 Minor).
- Task 2: Ruling: spec "Important" (no full gate/build/live) rejected — plan puts the full gate in Task 5 and live in Task 6; Task 2's steps ask for focused tests + mutation, done — cost if wrong: a build break surfaces at Task 5 instead of now.
- Task 2: minor (deferred): gba/worldSurface.tsx:72-73 comment says the GET reflects the saved layout; dungeon scope forces auto-layout.
- Task 2: minor (deferred): task-2 brief LF / report lines >140 (docs only).
- Task 2: complete (commits 4fd0860..efe87f6, review clean after ruling)
- Task 3: tier Opus (async warp-fetch ordering). Hop: Codex gpt-6.1-sol direct (>3 files). Worktree <scratchpad>/wt3 branch p13-t3, base 3e3d504.
- Task 3 hops: codex gpt-6.1-sol partial (code + tests written, then usage limit until 20:41, no report) -> conductor verified + finished inline (3 GBC fixture fixes found by the UI suite, report; reason: under ~10 min, Codex quota out, free models would re-do working code). Red 17 right reasons; UI suite 123 files / 2,011 passed; typecheck ok; mutations a-e 5/5 killed. Commit a538b15 (ff into plan-13-warp-popups).
- Task 3: Ruling: spec item 10 "Dismiss" trigger has no control to attach to (none exists today); none added — cost if wrong: a later dismiss button must also clear failedWarps.
- Task 3 reviews: Codex quota out -> Claude high-risk-reviewer (Opus) spec + quality, separate (CLAUDE.md High-tier fallback).
- Task 3 reviews R1: spec FAIL (C1 first save never refreshes warps: tileVersions starts {}; M1 dismiss; M2 stale latest); quality Needs rework (same C1; I1 out-of-scope token test; M1-M3).
- Task 3 fix round 1 (conductor inline, reason: ~15 lines, Codex quota out): 4ef4800. Ref seeded at mount; latest derived from failedWarps; +4 tests; mutations f-h killed. Spec item 10 "Dismiss" struck (ruling). Quality M2/M3 accepted as is.
- Task 3 re-reviews: spec PASS (0 open); quality Approved (1 new Minor).
- Task 3: minor (deferred): no test pins the delete-before-set re-insert when an already-failing map fails again (alert names an older message; low impact).
- Task 3: complete (commits 3e3d504..4ef4800, review clean after fix round 1)
- Task 4: tier Opus. Split by the conductor: 4a shared pieces (WarpPopup, dialogFocus, shortcut owner, dialog traps), 4b useWarpPopup + FamilyApp + integration tests. Worktree <scratchpad>/wt4 branch p13-t4, base 6e0bb75. User (2026-10-28 22:04): use the new OpenCode setup in delegate/offload.
- Task 4a hops: OpenCode + Nemotron 3 Ultra (free) done (102 requests, ~30 min; claimed 2,047 pass, conductor re-ran: true). Conductor fixes inline (reason: exact code decided in review, <10 min): ref read during render, unrequested isTextTarget rewrite, global querySelector focus, one-control trap escape, CRLF; new-file tests adjusted to the contract (+1 nested-trap test after a mutation survived). 34/34; UI 124 files / 2,047; typecheck ok; mutations 4/4 killed. Commit f1455e8 (on p13-t4).
- Task 4b hop 1: OpenCode + Nemotron 3 Ultra, same worktree, base f1455e8.
- Task 4b hop 1: OpenCode + Nemotron 3 Ultra FAILED verify (71 requests, 1 upstream idle timeout it retried past; claimed complete; conductor re-run of test/shell: 21 fail + 4 it.todo). Diff on target in shape (useWarpPopup, adapter/map.name, bumpTile, FamilyApp popup render) but useWarpPopup is wrong: close nulls `closeRequest` before its `.then` check so close never fires; close decides on the click-time `popup`/`leave` closure, not a pending-state effect after strokeSettled; FamilyApp passes a no-op onStrokeChain to renderWorld while the popup is open (check). Edited GbaMapSurface.test.tsx only to add `openWarpDestination` to a ShellSlots literal (type-required; acceptable). Stashed: stash@{0} "delegate: nemotron-ultra failed plan-13 task-4b ..." (on p13-t4, -u, includes test + report). JSONL kept at the old conductor's scratchpad oc4b-keep.jsonl.
- Next hop per delegate rule 2: one retry on the same model (OpenCode `run --session ses_e79cbba55ffeANoT3koMLm6BrC`) with the failing output and the two hook bugs above; fails again -> Inkling (OpenCode) -> Codex gpt-6.1-sol.
- Task 4b hop 2 (conductor 3): Nemotron 3 Ultra retry, same OpenCode session (resumed via a junction at the old worktree path;
  the session is bound to its creation path) FAILED verify (claimed done; re-run 18 fail + 5 todo; nested it.todo left in place).
  Stashed "delegate: nemotron-ultra retry failed ..." (-u). Next hop: Inkling (OpenCode), fresh from f1455e8 with the original
  brief plus a pitfalls appendix (scratchpad t4b-inkling-brief.md).
- Task 4b hop 3: Inkling (OpenCode) CRASHED (Transport ECONNRESET after 33 tool calls, no final text, hook file only). Stashed
  "delegate: inkling crashed ...". Dots3-note skipped: the conductor brief routed Inkling -> Codex (free hops 2/3 failed on this hook).
- Task 4b hop 4: Codex gpt-6.1-sol done (thread 01a1866c-2847-75d2-8d60-53827fb2ed43, sandbox: no vitest). Conductor: focused 33/33
  first run; added `openWarpDestination` to the GbaMapSurface.test.tsx ShellSlots literal (type-required). Red (src reverted) 33/33
  fail on the missing slot. Mutations 7/10 killed; survivors b (auto-close guard), e (WorldSurface modal guard), g (context-menu
  modal guard) -> fix round 1 (same thread): destinationSeen deleted (both families select in the same batch), e/g tests added.
  After: focused 35/35, mutations 9/9 killed, UI 2,083 / 125 files, typecheck pass. Commit 4e5c80f on p13-t4.
- Task 4b: minor (deferred): "popup text-field Escape leaves the background context menu open" (gba) failed once in one of two
  full UI runs, passes 3/3 alone and in the second full run (timing under load).
- Task 4 reviews (Codex gpt-6-astra, separate, range 6e0bb75..4e5c80f): spec PASS (0 findings); quality Needs rework (I1 dialogs
  never restore focus on unmount -> body after prompt Cancel, popup Escape/Tab trap dead; M1 dirty-open opener captured late).
  Both verified against code. Ruling: one fix, shared restore-focus helper in dialogFocus.ts used by the four dialogs and WarpPopup.
  Fix round 2 -> Codex thread 01a1866c.
- Task 4 fix round 2 (Codex thread): bf9ee64 shared useRestoreFocus (render-time capture, layout cleanup, previous chain) in the four
  dialogs + WarpPopup; conductor inline test fix (context-menu right-click retried until World centres; reason: 4 lines, test-only,
  the Minor flake). Focused 43/43 x3, UI 2,091 / 125, typecheck pass, mutations 4/4 killed.
- Task 4 quality re-review R1: Needs rework, both verified: R1 StrictMode replay (main.tsx uses StrictMode; autoFocus not
  replayed) restores focus behind an open dialog; R2 an older dialog unmounting steals focus from a newer one. Ruling: restore
  only when focus was lost (microtask after cleanup, activeElement body/null), keep render capture + previous chain. Fix round 3.
- Task 4 fix round 3 (Codex thread): restore deferred to a microtask, only when focus fell to body; StrictMode + out-of-order tests,
  new test/shared/dialogFocus.test.tsx. Focused 246/246 x2, UI 2,101 / 126, typecheck pass, mutations 4/4 killed. Re-review 2 next.
- Task 4 quality re-review 2 (Codex astra): Approved, 0 findings. Spec PASS stands (fix rounds changed focus handling only).
- Task 4: complete (4a f1455e8, 4b 4e5c80f, fixes bf9ee64 a3d6c9e on p13-t4; review clean after fix round 3).
