# Plan H F1c (core part): adversarial review (Claude Opus, high-risk-reviewer)

Range d46fd89..24a7236 (tests 3b5289f, implementation 24a7236). Reviewer read source through `git show HEAD:` only and ran nothing; mutation results below are hand-traced, and the orchestrator's executed mutation run is in `task-F1c-core.md`. Verdict on first pass: CHANGES NEEDED (tests only; production code correct).

## Production code: correct
- `renderLayout` (`render/layout.ts:59-60`): guard runs right after the layout lookup, before `splitFor`, `proj.tileset`, the blockdata read and the border read, so `blocksOverride` and `border` cannot reach a file. A broken border alone is refused too (`layouts.ts` marks both keys). A broken tileset is stopped at `project.ts:169-171` before `loadTileset`.
- `checkGbaMapDefects` (`defects/gba.ts:63-103`): `broken` collects only the layout and its own primary and secondary tilesets; every decomp-path read (blockdata, metatilesBin) sits inside `if (broken.length === 0)`; the path defects are pushed first; warp, object, connection and symbol checks still run. De-dup keys on the message and only collapses real repeats. With nothing broken, order and messages are unchanged (the tileset headers are read before blockdata, which only changes which error shows first when both are missing).

## Findings
- **I1 (Important, tests).** Three mutations broke D25 behaviour with no failing test: (1) dropping the secondary tileset from `broken` (every test broke only `gTileset_Primary`); (2) widening `broken` to every tileset (no unused broken tileset in the fixture); (3) moving the add loop after the warp checks (the test used `some()`). Fix: break `gTileset_Secondary` alone; add an unused broken `gTileset_Other` and a bad-size `map.bin` (the size defect must still appear, so the checks ran); assert `defects[0]` is the path defect.
- **M1.** Removing the de-dup `.filter` failed no test. Add a layout whose primary and secondary are the same broken tileset: one defect.
- **M2.** Comment at `gba.ts:71-72` says an unknown tileset symbol "keeps the throw"; the throw now happens only when nothing is broken. Say so.
- **M3.** "No outside read" was enforced only by ENOENT. Assert it directly (spy on `readFileSync`, no path containing `outside`).
- **M4 (not in this diff).** A broken layout throws `PathEscapeError`; a broken tileset reaching `proj.tileset` throws a plain `Error` (`project.ts:170`). The server half of F1c must handle both, or `project.ts` should throw `PathEscapeError(tp.brokenPaths[0])`.

## Follow-ups: other core reads of these paths with no broken-path check
- `validate/metatileRange.ts:56-58` (blockdata, border); `signs/suggest.ts:79-80` (blockdata); `write/binary.ts:32,57,76` (save-path reads); `blockEdit/gbaOps.ts:63,74,91,216,251-253`; `blockEdit/usage.ts:295-298,366,415,480-481` (reads the blockdata of every layout that shares the tileset, so a broken layout elsewhere is read when another map's tileset is edited); `blockEdit/save.ts:54-55`.
- `project.ts:178-191`: `getTilesetPaths` returns broken tilesets without refusing them, and every `tilesetPaths` caller inherits that; one refusal there would cover most tileset items.
- `config/paths.ts:67`: `mapJson(name)` builds a path from a `map_groups.json` name with no `insideRoot` check (same class, different component).
