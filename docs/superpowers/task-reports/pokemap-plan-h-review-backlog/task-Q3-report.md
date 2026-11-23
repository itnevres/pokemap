# Task Q3: a missing metatiles file answers 409 (both families)

Tier High [hub I/O error boundary]. Branch `claude/plan-h-server-q3`. Brief: overnight notes `brief-q3.md`.

**Change.** `savedMetatileCount(root, metatilesPath)` in `packages/server/src/blockEditOwnership.ts` replaces the bare `statSync` in the GBA paint guard (`index.ts`, `guardIds`) and the GBC paint (`gbcEditRoutes.ts`). ENOENT, ENOTDIR and a directory at the path throw `BlockEditRefusal("BAD_VALUE", "<path>: ...")`, which both handlers already answer as 409 `{ error: "<map>: <message>", code }`. Any other fs error rethrows (500). Shift and id-less stamps never stat.

**Tests first.** Commit `2a0dc4b` (Sonnet subagent) ran red for the right reasons: 6 failed (500 where 409 expected; the missing export). Implementation by the conductor (about 20 lines). Added after review: a directory at the path is refused.

**Reviews (Opus, separate).** Spec: pass, 2 Minor (`task-Q3-review-spec.md`). Quality: approve, 5 Minor, one applied (directory), comment reworded (`task-Q3-review-quality.md`).

**Mutation checks** (`-t "Q3|metatiles file|savedMetatileCount"`, baseline 7 pass): helper never maps to BAD_VALUE: 5 fail; helper maps every error: 1 fail; GBA call site throws a plain error: 2 fail; GBC call site throws a plain error: 1 fail. All four red, restored, baseline green.

**Gate** (combined for A1, A2, H-a, Q3, at `02865b3`): 5,382 pass / 1 fail / 281 files (the one fail is the known `engine.test` "parses the subject repo's real porymap.project.cfg"); typecheck pass, UI build pass; subjects unchanged. After merging `origin/master` again (UI-only changes), typecheck and the six touched server test files were re-run: see the PR body.
