# Codex brief: PokeMap Plan 8 Task 3 (shared app-level context controller, M5)

You are implementing one task in this repository (a git worktree on branch `plan-8-ui-engine-adapter`). Work only inside this directory.

## Read first (your requirements, exact values verbatim)
1. `docs/superpowers/task-reports/pokemap-plan-8-ui-engine-adapter/task-3-brief.md` (the plan's Task 3 text).
2. `docs/superpowers/task-reports/pokemap-plan-8-ui-engine-adapter/task-3-spec.md` (executed spec: anchors, binding rulings R1-R4, test list, oracle). Where the spec and the brief differ, the spec wins.

Style references: `packages/ui/src/shared/useStrokeChain.ts`, `packages/ui/src/shared/useWorldContext.ts` and their tests in `packages/ui/test/shared/`.

## Constraints
- Write tests first (the spec's Tests section), run them, and save the failing output (RED) to `docs/superpowers/task-reports/pokemap-plan-8-ui-engine-adapter/task-3-red.log`. The two new family M5 witnesses must fail on the pre-change code because Done exits immediately. Then implement until green.
- Every EXISTING test file stays byte-unchanged. Check: `git diff HEAD -- ':(glob)packages/*/test/**' | grep -E '^-[^-]'` must print nothing. If an existing test fails only because a clean exit is no longer synchronous, stop and say so in your final message (do not edit the test).
- No new dependencies. No changes under `packages/server`, `packages/core`, `packages/cli`.
- Run vitest from the repository ROOT, never from `packages/ui` (tell: "document is not defined"). Focused run: `npx vitest run packages/ui/test/shared/useContextEditing.test.tsx packages/ui/test/AppContextStroke.test.tsx packages/ui/test/gbc/GbcAppContextStroke.test.tsx packages/ui/test/AppContextEdit.test.tsx packages/ui/test/gbc/GbcAppContext.test.tsx packages/ui/test/gbc/GbcAppContextSelection.test.tsx`.
- Final verification, run once each, output to files: `npm test > docs/superpowers/task-reports/pokemap-plan-8-ui-engine-adapter/task-3-gate.log 2>&1`, `npm run typecheck > .../task-3-typecheck.log 2>&1`, `npm run build -w @pokemap/ui > .../task-3-build.log 2>&1`. Never run two full suites at once. Known load-only flakes (rerun that file alone before calling it a regression): WorldCanvasContext "Escape that closes an open context menu…", gbc/GbcAppEditing "dirty guard…" (EPERM on ElmsHouse.asm), GbcApp "hovering the canvas highlights…".
- Do NOT run any git command that changes state (no commit, add, checkout, restore, stash, reset). The coordinator commits after verifying your work.
- Do not touch files outside the ones this task needs. Report unrelated bugs instead of fixing them.

## Final message (also write it to `docs/superpowers/task-reports/pokemap-plan-8-ui-engine-adapter/task-3-report.md`)
- Status: DONE | DONE_WITH_CONCERNS | BLOCKED.
- Files changed and what each change does.
- RED evidence (command, the failing test names and the assertion lines) and GREEN evidence (command, pass counts).
- Gate results: test files / tests passed / failed, typecheck and build exit status, and the oracle-check output.
- Any deviation from the spec rulings, with the reason.
