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

## Second and third Opus reviews (orchestrator request: High tier needs separate spec and quality/adversarial passes)
- `task-F1c-review-core-spec.md`: independent spec-compliance pass, APPROVED, 0 Important, 3 Minor.
- `task-F1c-review-core-adversarial.md`: independent path-escape re-derivation (`..`, absolute, drive, UNC, case, trailing dots, NUL, ADS, symlink/junction), CHANGES NEEDED, 2 Important, 3 Minor.

Fixes in this PR:
- **Adversarial Important 1 (real escape, fixed).** `load/tilesets.ts` `dirOf` used `p.slice(0, p.lastIndexOf("/"))`; with no `/` it dropped the last character, so a `.metatiles` INCBIN of `"..a"` and no `.tiles` field derived `tilesPng = "../tiles.png"`, which was never checked and was read by `loadTileset`. `dirOf` now folds `\` to `/` and returns `"."` when there is no separator. Test first (`test/load/tilesetsSlashless.test.ts`, red on the old code: `'../tiles.png'` vs `'./tiles.png'`), then the fix. I did not add the reviewer's option (b) (always check the derived `tilesPng`): with a correct `dirOf` the derived path has the same prefix as the checked `.metatiles` path, so it cannot escape when that one does not.
- **Spec Minor 2 / adversarial Minor 3.** Tests now assert the key is named (`blockdata_filepath`, `.metatiles`), add a border-only broken layout (defects) and a border-only render refusal (`border: 1`).
- **Spec Minor 1 (ruling).** A broken tileset also skips the blockdata size check. Kept: the size check and the range check share one read block, and fixing the path surfaces the size defect next. Not a D25 violation (nothing wrong is read, nothing hidden permanently).
- **Spec Minor 3 / adversarial Minor 1 (server half).** A broken tileset reaches `renderLayout` callers as a plain `Error` from `project.ts:170`, a broken layout as `PathEscapeError`. Server half must map both, or `project.ts` should throw `PathEscapeError(tp.brokenPaths[0])`.
- **Adversarial Minor 2.** Unknown tileset symbol is masked while any path is broken (documented in the `gba.ts` comment). Accepted.

## Not in F1c core (adversarial Important 2: plan-scope gap, raised to the orchestrator)
Read sites still unguarded: `signs/suggest.ts:79`, `cli/src/writeCommands.ts:25-26`, `write/binary.ts:57,76`, `validate/metatileRange.ts:56`, `blockEdit/gbaOps.ts:63,91,216`, `blockEdit/usage.ts:415`, server `blockEditRoutes.ts:257`, and (server half) `editSessions.ts:45-46`, `index.ts:426`. Cheapest choke point for the tileset half: make `project.ts tilesetPaths` throw on `brokenPaths`, as `getTileset` does. Symlinks and junctions inside a project are not covered anywhere (containment is lexical; no `realpath`): out of F1c scope, recorded for a possible follow-up row.

## Orchestrator ruling on the unguarded readers, and accepted limit
Orchestrator 2 ruled: F1c scope stays as is, not widened. The unguarded readers are now Plan H row F1d (High, after the F1c server half), added to `plans/plan-h-hardening.md`. Accepted limit (out of scope): containment is lexical only (`insideRoot`, no `realpath`), so a symlink or junction inside a project that points outside is not caught anywhere in Plan H Task F.

## Gate after the tilesets.ts fix
Gate at 7bac140 (code identical to adfcf49): 5497 pass / 2 fail / 288 files (286 pass); typecheck pass (exit 0), UI build pass (exit 0); subjects unchanged. The 2 failures: known env fail `engine.test` "parses the subject repo's real porymap.project.cfg", and `gbcAddEventRoutes` "saving the header owner lets another map allocate a new flag" (an 8000 ms timeout at 10.6 s while the machine was loaded; the whole file re-run alone through the lock: 39/39 pass; GBC server code, untouched by this PR).
