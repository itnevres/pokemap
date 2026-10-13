# Codex brief: PokeMap Plan 8 Task 5 (shared edit-session core)

You are implementing one task in this repository (a git worktree on branch `plan-8-ui-engine-adapter`). Work only inside this directory.

## Read first (your requirements, exact values verbatim)
1. `docs/superpowers/task-reports/pokemap-plan-8-ui-engine-adapter/task-5-brief.md` (the plan's Task 3 text).
2. `docs/superpowers/task-reports/pokemap-plan-8-ui-engine-adapter/task-5-spec.md` (executed spec: anchors, binding rulings R1-R7, test list, oracle). Where the spec and the brief differ, the spec wins.

Style references: `packages/ui/src/shared/useStrokeChain.ts`, `packages/ui/src/shared/useContextEditing.ts` and their tests in `packages/ui/test/shared/`; the `Host` pattern in `packages/ui/test/useEditSession.test.tsx`.

## Constraints
- Write tests first (the spec's Tests section), run them, save the output to `docs/superpowers/task-reports/pokemap-plan-8-ui-engine-adapter/task-5-red.log`, and report honestly which were red and why. Then implement until green. If you need StrictMode use `renderHook(..., { reactStrictMode: true })` (a `<StrictMode>` wrapper does not double-invoke effects in this setup).
- Every EXISTING test file stays byte-unchanged. Check: `git diff HEAD -- ':(glob)packages/*/test/**' | grep -E '^-[^-]'` must print nothing. If an existing test fails after your change, stop and say so in your final message (do not edit the test).
- No new dependencies. No changes under `packages/server`, `packages/core`, `packages/cli`.
- Run vitest from the repository ROOT, never from `packages/ui` (tell: "document is not defined"). Focused run: `npx vitest run packages/ui/test/shared/useEditSessionCore.test.tsx packages/ui/test/useEditSessionShared.test.tsx packages/ui/test/gbc/useGbcEditSessionShared.test.tsx packages/ui/test/useEditSession.test.tsx packages/ui/test/useEditSessionGuard.test.tsx packages/ui/test/gbc/useGbcEditSession.test.tsx`, then every other test file that imports either hook. If the Vitest CLI cannot load its config in your sandbox, use the Vitest Node API as before and say so.
- Final verification, run once each, output to files: `npm test > docs/superpowers/task-reports/pokemap-plan-8-ui-engine-adapter/task-5-gate.log 2>&1`, `npm run typecheck > .../task-5-typecheck.log 2>&1`, `npm run build -w @pokemap/ui > .../task-5-build.log 2>&1`. Never run two full suites at once. Known load-only flakes (rerun that file alone before calling it a regression): WorldCanvasContext "Escape that closes an open context menu…", gbc/GbcAppEditing "dirty guard…" (EPERM on ElmsHouse.asm), GbcApp "hovering the canvas highlights…".
- Do NOT run any git command that changes state (no commit, add, checkout, restore, stash, reset). The coordinator commits after verifying your work.
- Do not touch files outside the ones this task needs. Report unrelated bugs instead of fixing them.

## Final message (also write it to `docs/superpowers/task-reports/pokemap-plan-8-ui-engine-adapter/task-5-report.md`)
- Status: DONE | DONE_WITH_CONCERNS | BLOCKED.
- Files changed and what each change does.
- RED evidence (command, the failing test names and the assertion lines) and GREEN evidence (command, pass counts).
- Gate results: test files / tests passed / failed, typecheck and build exit status, and the oracle-check output.
- Any deviation from the spec rulings, with the reason.
