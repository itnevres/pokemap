# Plan H F1c, core part: GBA render and defects consume `brokenPaths`

Tier: High (parsing boundary, D25). Scope: `packages/core/src/render/layout.ts` and `packages/core/src/defects/gba.ts` only. The server half (`server/src/index.ts` render and map routes, `editSessions.ts`) is NOT done: C7 owns those files; orchestrator 2 will say when to resume.

## What changed
- `renderLayout` throws `PathEscapeError` (carries the `BrokenPath`) for a layout with `brokenPaths`, right after the lookup, before `splitFor`, tileset loads and every file read (also with `blocksOverride` or `border`). A broken tileset was already refused by `proj.tileset` (a plain `Error`; see follow-ups).
- `checkGbaMapDefects` reports every broken path of the layout and of its own primary and secondary tilesets as a `build` DataDefect (file, message, fix from the `BrokenPath`), first in the list, de-duplicated by message. When anything is broken it skips the blockdata read, the size check and the metatile-range check; the warp, object, connection and symbol checks still run. Nothing broken: output unchanged.

## Process
Tests first (`3b5289f`, my own fixtures; two bugs in them, a duplicate `warp` const and an unescaped backslash, were found when the first chain verify failed; the chain's DeepSeek hop then wrote the implementation, `24a7236` after my fixes). Chain: `chain.py --tier sonnet --no-codex`; every hop failed its verify only because of those test bugs, so I applied the implementation hop's source diff and fixed the tests myself.

Review: Claude Opus (`high-risk-reviewer`; Codex is parked) found production code correct and 1 Important + 4 Minor test/comment findings (`task-F1c-review-core.md`). All fixed here: five new tests (secondary tileset alone; an unused broken tileset is not reported while the size check still runs; one defect when primary equals secondary; path defects first; a wrong-sized sentinel file at the escaping path adds no size defect, i.e. a direct no-outside-read assertion) and the `gba.ts` comment.

## Mutation checks (executed, each run through the lock on the two new test files)
| Mutation | Result |
|---|---|
| render guard removed | 3 tests fail |
| layout `brokenPaths` not reported | 6 fail |
| tileset `brokenPaths` not reported | 2 fail |
| blockdata/range reads still run when broken | 7 fail |
| secondary tileset dropped | 1 fails (new test) |
| every tileset reported | 1 fails (new test) |
| de-dup removed | 1 fails (new test) |
| path defects reported last | 1 fails (new test) |
Unmutated: 15 of 15 pass. Source files restored after each mutation (`git status` shows only the comment edit).

## Follow-ups (not in this diff; from the review)
Other core readers of these paths with no broken-path check: `validate/metatileRange.ts:56-58`, `signs/suggest.ts:79-80`, `write/binary.ts:32,57,76`, `blockEdit/gbaOps.ts`, `blockEdit/usage.ts` (reads the blockdata of every layout sharing an edited tileset), `blockEdit/save.ts`. `project.ts getTilesetPaths` returns broken tilesets unrefused (one refusal there covers most tileset items), and `proj.tileset` throws a plain `Error` where the layout path throws `PathEscapeError`: the server half must handle both, or `project.ts` should throw `PathEscapeError(tp.brokenPaths[0])`. `config/paths.ts:67` `mapJson(name)` has no `insideRoot` check (same class, other component).

## Gate
Gate at fa82caf: 5492 pass / 1 fail / 287 files (286 pass); the 1 failure is the known env fail `engine.test` "parses the subject repo's real porymap.project.cfg"; typecheck pass, UI build pass; subjects unchanged.
