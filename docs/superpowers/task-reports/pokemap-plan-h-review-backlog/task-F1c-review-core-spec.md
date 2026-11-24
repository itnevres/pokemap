# Plan H F1c (core half): spec-compliance review

Pass: spec only. Diff `origin/master...HEAD` on `plan-h-f1c-b` (`layout.ts`, `defects/gba.ts`, two new test files, reports). Read-only: no tests, typecheck or build run. I re-derived everything from the spec and the code. I did not take the earlier combined review (`task-F1c-review-core.md`) as evidence.

**Verdict: APPROVED** for the core half. No Important findings. Three Minor findings follow. The F1c row as a whole is **not** complete: the server half (edit-session open, save refusal, the render and map routes, `test/api` and `test/editSessions`) is still to do, as the task report says.

## Spec sources used
- Plan H row F1c (`plan-h-hardening.md:130`): "GBA consumers refuse a broken layout or tileset and the defect reaches the banner: render, edit-session open, save, the defects check". Core files: `defects/gba.ts` and `render/layout.ts`.
- The F ruling (`plan-h-hardening.md:81`) and D25 (`decisions.md:73`): a DataDefect that names the file, the key or line, the bad path and what to change. The component cannot be rendered, edited or saved. Every map that uses it shows the defect in the banner. Nothing else is blocked. D25 adds: the block covers the broken component "and what depends on it, not the rest of the project".
- Acceptance 1 (`plan-h-hardening.md:355`): absolute, drive-letter, `../..` and backslash variants each mark the layout broken. The DataDefect names the layout id and the path. The project opens, and a map on that layout cannot be rendered, edited or saved.

## Criterion by criterion

| # | Criterion (core half) | Code | Test that proves it |
|---|---|---|---|
| 1 | Render refuses a broken layout | `layout.ts:60` throws `PathEscapeError(layout.brokenPaths[0])` after the unknown-layout check, before `splitFor`, `proj.tileset` and every file read (blockdata at :64, and the border read later) | `brokenLayout.test.ts` "refuses with a PathEscapeError..." (instance type, carries the same `BrokenPath`, message names the id). The stub's `splitFor`/`tileset` throw "should not be called", so a guard that ran late would fail the `toBeInstanceOf` check. `blocksOverride` and `border` variants are covered too. |
| 2 | Render refuses a broken tileset | Not in this diff. `project.ts:169-171` (F1b) makes `proj.tileset` throw a plain `Error` before `loadTileset`, and `renderLayout` calls it before any read | `escapingPaths.test.ts:43` (F1b) checks `proj.tileset`. **No test** renders a layout whose tileset is broken (Minor 3). |
| 3 | Defects check: broken layout path is a defect on the map | `gba.ts:73-77,78` adds every `layout.brokenPaths` entry as `build`, with the `BrokenPath`'s file, message and fix | `gbaBrokenPaths.test.ts` first test: kind `build`, file `data/layouts/layouts.json`, message has the id and the path, fix names layouts.json |
| 4 | Acceptance 1 variants (absolute, drive letter, backslash) | Marked by F1's `insideRoot`, consumed here | `it.each` over `/etc/outside.bin`, `C:/outside.bin`, `..\\..\\outside.bin` (one defect each, names the id) |
| 5 | Defects check: a broken tileset the map uses (primary or secondary) | `gba.ts:74-76` | "a broken tileset..." (primary) and "a broken secondary tileset is reported on its own" |
| 6 | Only this map's tilesets are reported | Lookup by `layout.primaryTileset` and `layout.secondaryTileset` only | "a broken tileset this map does not use is not reported" |
| 7 | Defect names the file, the key, the bad path and what to change | The message and fix come from the F1/F1b `BrokenPath` without change (layouts: `layout ${id}: ${key} "${path}"`; tilesets: `tileset ${sym}: ${key} path "..."`) | Path, id or symbol, and file are asserted. The **key** (`blockdata_filepath`, `.metatiles`) is never asserted in these tests (Minor 2) |
| 8 | Category and severity `build` | `add("build", ...)` | Asserted with `toMatchObject` in three tests |
| 9 | Path defects first | The broken-path loop runs before the size check, range, warp, object, connection and symbol checks | "path defects come first..." (index 0 is the layout, index 1 is the warp) |
| 10 | No read outside the project | Blockdata read, size check and `count()` reads all sit inside `if (broken.length === 0)` | Each broken-path test would throw ENOENT on `${root}/../../outside*` if the read still ran. The sentinel test points the path at a real 3-byte file outside the root and expects no size defect, which proves directly that the escaping file is not read. |
| 11 | Each defect once (primary equals secondary) | Message de-dup at `gba.ts:77` | "the same broken tileset as primary and secondary is reported once" |
| 12 | Nothing else is blocked | Warp, object-count, connection and symbol checks sit outside the `if` | "warp checks still run next to a broken layout" (also checks `incomplete` is empty). Connection, object-count and symbol checks: structurally unaffected, no broken-path test (acceptable) |
| 13 | Nothing broken: unchanged | The body inside the `if` matches the old code exactly (blockdata read, size defect, split, `count`, range). Only the tileset-header parse moved ahead of the blockdata read. | The "unused broken tileset" test checks that the size check still runs. The existing `gba.test.ts` suite covers the rest (not re-run here, read-only) |
| 14 | Project still opens | F1/F1b concern. This diff adds no throw on open | n/a |
| 15 | Edit-session open refused; save refused; render and map routes; banner over HTTP | **Not in this diff** (server half, deferred: C7 owns those files) | none, deferred |

Scope creep: none. The diff touches only the two named core source files, two new test files and reports. There are no server edits and none of the follow-ups (`validate/metatileRange`, `signs/suggest`, `write/binary`, `blockEdit/*`, the `project.ts` error type, `mapJson`).

## Findings

**Minor 1: a broken tileset also hides the blockdata size check, which does not depend on the tileset.** `packages/core/src/defects/gba.ts:84-88`. The size check reads only the layout's own blockdata, which is inside the project when only a tileset is broken. D25 limits the block to "the broken component and what depends on it", and the range check (`count()` reads `metatilesBin`) depends on the tileset, but the size check does not. Scenario: primary tileset `.metatiles` INCBIN is `../../x.bin` and `map.bin` is 4 bytes short. The banner shows only the path defect. After the user fixes the INCBIN, a size defect appears that could have been shown at the same time. The test "a broken tileset is a build defect... the layout's size and range checks are skipped" pins this choice. It is defensible ("don't read the component until it is fixed" read broadly), and no wrong data is read. Option: gate the size check on `layout.brokenPaths` only and the range check on any broken path. Otherwise record the broader skip as a ruling.

**Minor 2: no test asserts that the defect names the key.** `packages/core/test/defects/gbaBrokenPaths.test.ts:80-87,96-103`. D25 and the F ruling require the defect to name "the key or line". The messages include it (`blockdata_filepath`, `.metatiles`) because they come from F1/F1b. But if F1c rebuilt the message, for example `${bp.path} leaves the project`, every F1c test would still pass. One `toContain("blockdata_filepath")` and one `toContain(".metatiles")` would close this. Related: no defects test breaks `border_filepath` alone. The code handles it the same way (any `layout.brokenPaths`), so this is coverage only.

**Minor 3: render refusal of a broken tileset has no F1c test and uses a different error type.** `packages/core/src/render/layout.ts:62-63` and `packages/core/src/project.ts:169-171`. The row says render refuses "a broken layout or tileset". For a tileset that holds only because `proj.tileset` throws (tested in F1b at `escapingPaths.test.ts:43`). No test calls `renderLayout` on a layout whose tileset is broken. The error is a plain `Error`, while a broken layout gives a `PathEscapeError`. The spec does not prescribe the type, so this is not a violation. But the deferred server half must map both to the same response, or `project.ts` should throw `PathEscapeError(tp.brokenPaths[0])`. The task report already lists this as a follow-up. Keep it in the server-half brief.

**Observation (no action):** with nothing broken, `tileset_headers.h`/`metatiles.h` are now read before the blockdata. When both the blockdata file and a tileset header file are missing, the ENOENT now names the header instead of the blockdata. The result is the same (a throw) and no other output changes.

## What is left for F1c overall
The server half: edit-session open refused, save refused, the render and map routes surfacing the defect (and handling both error types), plus `S test/api.test.ts` and `S test/editSessions.test.ts`. Acceptance 1's "cannot be edited or saved" has no proof until then.
