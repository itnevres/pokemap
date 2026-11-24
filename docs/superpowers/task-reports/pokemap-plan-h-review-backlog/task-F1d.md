# Plan H F1d: the remaining readers of a broken layout or tileset path

Tier: High (parsing boundary, D25; an outside read no test catches automatically). Spec and rulings: `task-F1d-spec.md`. Branch `claude/plan-h-f1d` cut from master `be0d0ac`.

## What changed
- `project.ts`: `tileset()` and `tilesetPaths()` throw `PathEscapeError` for a broken tileset (was a plain `Error`); new `tilesetPathsUnchecked()` returns the paths with `brokenPaths` for walks that must keep serving healthy tilesets.
- New `core/src/brokenComponents.ts`: `brokenPathOfLayout`, `assertLayoutUsable`, `assertLayoutFilesInside`, `brokenComponentsOf`. The server's `brokenComponents.ts` delegates to it.
- Single-layout readers refuse before any read: `signs/suggest.ts`, `write/binary.ts` (both writers), `blockEdit/gbaOps.ts` (`PathEscapeError` passes the BAD_VALUE wrapper), `cli/writeCommands.ts`, server `blockEditRoutes.ts` `context()` plus `fail()` answering the typed 409 (this is what makes `GET /api/block-sheet/<map>.png` answer 409, not 500).
- Walkers skip a broken layout (own paths or either tileset): `validate/metatileRange.ts` (both halves), `blockEdit/usage.ts` relations, `blockEdit/save.ts` effects use the unchecked accessor.
- Review fix (Opus adversarial Important 2): CLI `validate` prints `warning: not checked, <message> <fix>` per skipped component on stderr and exits 1; the MCP tool appends that stderr.
- Review fix (both Opus reviews, Important 1): `test/load/escapingPaths.test.ts` used the checked `tilesetPaths` on a broken tileset; now `tilesetPathsUnchecked`. Four `Project` stubs gained `tilesetPathsUnchecked`.

## Process
Tests first (Haiku subagent, brief reviewed by me, commit `fa2d351`), implementation by `chain.py --tier sonnet --no-codex` (OpenRouter ernie-5.5-flash-preview:free, commit `de2ad03`; its own verify timed out under lock contention, I re-ran it: 6 files, 24 tests green), fixes inline (commit `3680ba4` and the stubProject duplicate-property fix). Reviews: two separate Opus `high-risk-reviewer` passes: `task-F1d-review-spec.md` (CHANGES NEEDED: 1 Important, fixed) and `task-F1d-review-adversarial.md` (CHANGES NEEDED: 2 Important, both fixed; no outside read left).

## Mutation checks (executed through the lock, 6 new test files, 24 tests)
| Mutation | Result |
|---|---|
| M1 checked `tilesetPaths` stops throwing | 2 fail |
| M2 `getTileset` throws plain `Error` | 1 fails |
| M3 `suggest.ts` guard removed | 1 fails |
| M4a / M4b `binary.ts` blockdata / border guard removed | 1 fails each |
| M5 range validator layout skip removed | 2 fail |
| M6 palette tileset skip removed | 1 fails |
| M7 `usage.ts` broken-layout skip removed | 4 fail |
| M8 `usage.ts` broken-tileset `pathsBySymbol` skip removed | SURVIVES: equivalent mutant (every layout using a broken tileset is already skipped), kept as defence in depth; both Opus reviews agree |
| M9 `gbaOps` guard removed | 2 fail |
| M10 `gbaOps` PathEscapeError passthrough removed | 2 fail |
| M11 `save.ts` back to checked accessor | 1 fails |
| M12 CLI guard removed | 1 fails |
| M13 `brokenPathOfLayout` ignores tilesets | 3 fail |
| M14 `assertLayoutFilesInside` no-op | 2 fail |
Server mutations S1 (`context()` guard) and S2 (`fail()` 409 mapping): see status below.

## Gate
Full vitest after commit `3680ba4`: 5593 pass / 1 fail / 300 files (299 pass); the 1 failure is the known env fail `engine.test` "parses the subject repo's real porymap.project.cfg". UI build pass. Typecheck at that commit failed with one TS1117 (duplicate property in `test/helpers/stubProject.ts`, mine); fixed in the next commit; the re-run is owed (see status). Server `brokenPaths.test.ts` with the two new F1d cases: 15/15 pass (before the review fixes).

## Follow-ups (not in this diff; none is an outside read)
- `render-world` (CLI) aborts the whole PNG when one layout in the bbox is broken (`cli/src/index.ts:152`); contradicts the second half of D25; a separate reader.
- `PathEscapeError` carries only `brokenPaths[0].message`, no fix hint: CLI/MCP callers of render see no fix text (the server sends `defect.fix`).
- Ruling 6 rationale: a map on a layout skipped because its OTHER tileset is broken is "left unchecked" by the block planner, not "unaffected"; `gbaTilesetEffects` still lists it.
- Test hygiene: sentinel names in the shared tmpdir are not unique per run; the healthy-writer test in `binaryBroken.test.ts` only asserts "not PathEscapeError".
- Symlinks and junctions: accepted limit, unchanged.
