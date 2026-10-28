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
