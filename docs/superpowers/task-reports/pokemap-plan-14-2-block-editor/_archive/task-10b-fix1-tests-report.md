# Task 10b fix-1 tests report

## Scope and route

High risk: request completion can race a project reset. BASE `f6cedebbb5a44cb6fb9da9c40f2ceb2cc2efa3b8`; initial worktree reported clean by conductor. Native Codex high-risk implementer, one writer; multi-file iterative test/oracle work was unsuitable for the mechanical offload chain. Budget 25 minutes, one repair maximum, no Anthropic; usage not reported. No commits. The existing tests were extended and all existing assertions retained. `tilesetVersion.ts` has only the authorized inert API stub: optional generation argument and function returning 0. No implementation fix was made.

Read U1–U5 from `C:/Programming Projects/PokeMap/.superpowers/sdd/2026-11-10-pokemap-plan-14-2-block-editor/task-10-rulings.md`. The requested review files were absent from the worktree; read their copies at `C:/Programming Projects/PokeMap/docs/superpowers/task-reports/pokemap-plan-14-2-block-editor/task-10b-spec-review.md` and `task-10b-quality-review.md`. U6d excludes sign, indicator and event external replies.

## Cases and interpretations

1. `packages/ui/test/shared/tilesetVersion.test.tsx` — **discard announces the reverted version to a mounted URL builder**: the hook and subscribed URL builder stay mounted, start at literal 5, and a mocked discard body with 6 must change the literal URL from `tv=5` to `tv=6`. The existing core discard test separately retains assertions for resetting state and flags without applying the empty grid. Expected red: discard does not read or announce its body today. The probe is the explicitly permitted hook plus URL builder, not the full palette.

2. Same file — **ignores a late post response from before reset**, and **ignores a late discard response from before reset**: deferred fetch starts before reset, resolves with literal 20 afterward, and the mounted version remains 0; a subsequently sent reply with literal 1 sets it to 1. Waiting for the first fetch ensures discard's asynchronous barrier has completed before the reset. Expected red for post: it announces 20 without a generation guard. Discard currently ignores both response bodies, so its final 1 assertion is red; once discard announces, the stale-20 assertion also requires generation protection.

   `packages/ui/test/useMapLayout.test.ts` and `packages/ui/test/gbc/useGbcMap.test.ts` — **ignores a response from before reset and accepts a new-generation response**: each loader remains mounted when reset occurs, so cancellation cannot hide missing generation capture. A deferred old reply supplies 20, then a separately mounted new-generation request supplies 1. Expected red: each current loader announces 20 after reset. `packages/ui/test/useMapLayout.test.ts` — **does not announce a cancelled map response in the same generation** switches Foo to Bar without reset, waits for Bar version 1, then resolves cancelled Foo with 20; expected red because GBA currently notes before checking cancellation. No expected version comes from the implementation under test. The generation unit test captures the pre-reset token only for an identity comparison and to represent the stale request generation; numeric version expectations are literals.

3. `packages/ui/test/shared/tilesetVersion.test.tsx` — **ignores stale generations while unguarded notes retain the max rule**: reset changes the generation, stale guarded 20 is ignored, and unguarded literal 3, 2, 4 demonstrate max behavior. Expected red with the authorized stub because its generation never changes and guarded notes are not filtered. The two properties are asserted separately in sequence; the first failing assertion prevents runtime observation of later assertions until fixed.

4. `packages/ui/test/WorldCanvasSurface.test.tsx` and `packages/ui/test/gbc/GbcWorldCanvasSurface.test.tsx` — **passes a new imageUrl function and requests the bumped version**: a partial mock observes the real `useWorldTiles` call while delegating to the actual hook; it checks function identity after a bump and the literal resulting image request. Existing request assertions remain. Expected red today: both adapters keep stable `imageUrl` callbacks even though current visible-tile requests do include `tv=5` via another dependency. Both test suites reset the store around each test.

## Verification and limitations

- `npm run typecheck` via PowerShell initially failed before execution: `npm.ps1 cannot be loaded because running scripts is disabled on this system` (`PSSecurityException`, exit 1).
- `npm.cmd run typecheck` (fresh final run):

```text
> typecheck
> tsc --noEmit -p tsconfig.base.json && tsc --noEmit -p packages/ui/tsconfig.json
```

  Exit 0, no diagnostics.
- `git diff --check`: exit 0 after the final test edits; no whitespace diagnostics. Git warned it could not access the user's global ignore file.
- Per explicit brief, no Vitest, `npm test`, UI build, mutation, or live UI run. Red outcomes above are reasoned predictions, not observed results; the conductor must run tests serially and verify red then green. Full gate and build are deferred to the conductor's integration hop.
