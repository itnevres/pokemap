# Codex brief: PokeMap Plan 8 Task 7 (reduced: shared beforeunload guard and stroke-chain registry)

You are implementing one task in this repository (a git worktree on branch `plan-8-ui-engine-adapter`). Work only inside this directory.

## Read first (your requirements, exact values verbatim)
1. `docs/superpowers/task-reports/pokemap-plan-8-ui-engine-adapter/task-7-brief.md` (the plan's Task 7 text).
2. `docs/superpowers/task-reports/pokemap-plan-8-ui-engine-adapter/task-7-spec.md` (executed spec: anchors, binding rulings R1-R5, test list, oracle). Where the spec and the brief differ, the spec wins.

Style references: `packages/ui/src/shared/useStrokeChain.ts`, `packages/ui/src/shared/useVisit.ts` and their tests in `packages/ui/test/shared/`.

## Constraints
- Keep existing comments; move them, never drop them. Do not reflow unrelated JSX or lines.
- Spec Tests items 1, 2 and 4 must be RED before your src change: write them first, save the red run, then implement.
- Write tests first (the spec's Tests section), run them, save the output to `docs/superpowers/task-reports/pokemap-plan-8-ui-engine-adapter/task-7-red.log`, and report honestly which were red and why. Then implement until green. If you need StrictMode use `renderHook(..., { reactStrictMode: true })` (a `<StrictMode>` wrapper does not double-invoke effects in this setup).
- Every EXISTING test file stays byte-unchanged. Check: `git diff HEAD -- ':(glob)packages/*/test/**' | grep -E '^-[^-]'` must print nothing. The ONLY authorised exceptions are the R3 edits listed in the spec (useMapEditing.test.tsx, MapEditingWorkspace.test.tsx, MapEditingWorkspaceActive.test.tsx, the AppContextVisit.test.tsx line-2 comment) and the one added `it` in shared/useEditSessionCore.test.tsx. If any other existing test fails after your change, stop and say so in your final message (do not edit the test).
- No new dependencies. No changes under `packages/server`, `packages/core`, `packages/cli`.
- Run vitest from the repository ROOT, never from `packages/ui` (tell: "document is not defined"). Focused run: `npx vitest run packages/ui/test/shared packages/ui/test/useMapEditing.test.tsx packages/ui/test/MapEditingWorkspace.test.tsx packages/ui/test/MapEditingWorkspaceActive.test.tsx packages/ui/test/App.test.tsx packages/ui/test/AppContextStroke.test.tsx packages/ui/test/AppContextEdit.test.tsx packages/ui/test/AppContextVisit.test.tsx packages/ui/test/AppVisitGuard.test.tsx packages/ui/test/gbc/GbcAppEditing.test.tsx packages/ui/test/gbc/GbcAppWorldGuard.test.tsx packages/ui/test/gbc/GbcAppContextStroke.test.tsx packages/ui/test/gbc/GbcAppContext.test.tsx`. If the Vitest CLI cannot load its config in your sandbox, use the Vitest Node API as before and say so.
- Final verification, run once each, output to files: `npm test > docs/superpowers/task-reports/pokemap-plan-8-ui-engine-adapter/task-7-gate.log 2>&1`, `npm run typecheck > .../task-7-typecheck.log 2>&1`, `npm run build -w @pokemap/ui > .../task-7-build.log 2>&1`. Never run two full suites at once. Known load-only flakes (rerun that file alone before calling it a regression): WorldCanvasContext "Escape that closes an open context menu…", gbc/GbcAppEditing "dirty guard…" (EPERM on ElmsHouse.asm), GbcApp "hovering the canvas highlights…" / "palette highlight resets…", gbc/GbcAppWorldGuard "a world click, confirmed: POST /discard…" ("expected N to be less than -1").
- Do NOT run any git command that changes state (no commit, add, checkout, restore, stash, reset). The coordinator commits after verifying your work.
- Do not touch files outside the ones this task needs. Report unrelated bugs instead of fixing them.

## Final message (also write it to `docs/superpowers/task-reports/pokemap-plan-8-ui-engine-adapter/task-7-report.md`)
- Status: DONE | DONE_WITH_CONCERNS | BLOCKED.
- Files changed and what each change does.
- RED evidence (command, the failing test names and the assertion lines) and GREEN evidence (command, pass counts).
- Gate results: test files / tests passed / failed, typecheck and build exit status, and the oracle-check output.
- Any deviation from the spec rulings, with the reason.
