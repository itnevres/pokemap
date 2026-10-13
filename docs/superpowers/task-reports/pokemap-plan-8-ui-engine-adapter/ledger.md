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
