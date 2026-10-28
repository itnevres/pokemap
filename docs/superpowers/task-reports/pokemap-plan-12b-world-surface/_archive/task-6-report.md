# Plan 12b Task 6 report: `WorldSurface` interaction and commits (High)

## Files

- Modified: `packages/ui/src/canvas/WorldSurface.tsx` (drag dispatcher wired, selection set, keys, context menu, commits through the ledger, rail drop, dungeon toggle, warp markers/lines/popup/alert with the P12-4r scope and P12-4s retry, hover status, context-mode rail hide, tooltip clamp), `canvas/worldSurfaceAdapter.ts` (adapter widened: placement and dungeon POSTs, warp offset/fetch/popup, save-error and toolbar/toast slot facts, `WorldStatus.hover`), `canvas/useWorldDrag.ts` (`cancelRef` published at commit; quality review minor).
- New: `packages/ui/test/canvas/WorldSurfaceInteraction.test.tsx`.
- Details per item, adapter fields, family differences kept and carry-forward slot decisions: `task-6-impl-notes.md` (Codex) — the implementer's account, checked by the reviews below.

`git diff --stat -- packages/ui/test`: empty. No existing test changed (`WorldSurface.test.tsx`, `useWorldDrag.test.tsx` unchanged). Removed comment lines (`git diff -U0 | grep '^-\s*//'` and block comments): only Task 5's "Task 6" placeholder comments (the `badgesRef` note, the handler and overlay markers) and the `/** Task 6 widens this. */` field note, all superseded by the implementation; the P12-4p token-key comment moved with its JSX into the overlay map.

## Hop log

1. Codex `gpt-6.1-sol` (scratch worktree wt-t6 at `3d6ff3f`): implementation, 32 cases. Aider hops skipped: the task spans three files and needs wide reading of both family canvases (delegate §2, "go straight to Codex").
2. Verify: 3 failures (two rail drops NaN, one endpoint test). Same-model retry (delegate §4.2): Codex fix round 1 — test helper did not carry drop coordinates through jsdom; `Far` shelved so it is truly offscreen (spec review judged the role kept). 226/226.
3. Reviews, Codex `gpt-6-astra`: spec Needs rework (1 Important: group drag dropped out-of-filter selected maps, GBA keeps them, `WorldCanvas.tsx:1499-1507`; 1 Minor: marquee gained `aria-hidden`); quality Approved with fixes (3 Minor: `cancelRef` render publication in `useWorldDrag.ts`; warp lifecycle after unmount/StrictMode tests; older-POST rejection and all-members-fail tests). Conductor confirmed each against the code.
4. Codex fix round 2 (worktree wt-t6b): all five fixed, with tests. Conductor inline fix (one line, logged): the new suspended-render test passed `toolbarExtras` as a surface prop instead of an adapter field (typecheck error; esbuild had ignored it).
5. Scoped re-review: Codex `gpt-6-astra`, `task-6-rereview.md`.

Worktrees removed with the junction-first rule; main `node_modules/@pokemap` verified (cli, core, server, ui) and `git ls-files -d` = 0 each time.

## Evidence

- Canvas tests 233/233; typecheck clean.
- Gate (final tree): **3,777 pass / 0 fail / 231 files**; typecheck pass; UI build pass; subjects unchanged (GBA HEAD `26a2e3d1e`, 9 porcelain lines; PerfPlus clean).
- Re-review `task-6-rereview.md`: PASS, no open findings.

## Conductor mutations (each red, file restored)

| Ruling | Mutation | Failing test |
|---|---|---|
| P12-3 (GBA group, filter) | `inScope` guard back on group membership | moves every retained selected map when a filter leaves only the grabbed group member visible |
| P12-3 | reload after each successful POST | posts three group members and reloads once only after the last deferred outcome (+3 more) |
| P12-4s | failed warp cache entry kept | warp fetch rejection alerts, never loops on alert renders, and retries exactly once after a pan |
| P12-4o | marker click suppression removed | marker clicks within eight screen pixels select nothing; nine pixels selects the map and double-click previews (+2) |
| P12-4c | double-click fallback removed | double-click edits here when supplied, otherwise opens Map view; Shift always opens Map view (+1) |
| commit-time refs | `cancelRef` published at render | unmount cancels with committed drag options after a later render suspends |

The implementer's full ruling → test → mutation matrix (plan Step 3) is in `task-6-impl-notes.md`; the quality review's predicted mutation table is in `task-6-quality-review.md`.
