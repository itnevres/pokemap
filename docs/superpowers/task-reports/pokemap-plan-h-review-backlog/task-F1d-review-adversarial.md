# Plan H F1d: adversarial / quality review

Scope: `git diff be0d0ac..HEAD` on `claude/plan-h-f1d` (de2ad03). This was a read-only review. Per the brief I did not run vitest, typecheck or build. The mutation results below come from reading the code, not from running it. I read `task-F1d-spec.md` for the rulings and no other F1d review file.

## Verdict: CHANGES NEEDED

There is one Important regression: an existing test fails on this machine. One Important design gap needs a ruling, because the CLI and MCP validator now report "clean" for broken projects. Neither is an outside read. I found no remaining path that reads outside the project in core, server, cli or mcp.

## Important

### I1. An existing corpus test now throws, so the gate is red on this machine
`packages/core/test/load/escapingPaths.test.ts:42` (and `:43`, which calls it again):
```ts
expect(p.tilesetPaths("gTileset_Petalburg").brokenPaths).toHaveLength(1);
expect(() => p.tileset("gTileset_Petalburg")).toThrow(p.tilesetPaths("gTileset_Petalburg").brokenPaths![0]!.message);
```
`gTileset_Petalburg` is broken by this test's own `beforeAll`. Ruling 1 makes `tilesetPaths` throw `PathEscapeError` for a broken tileset (`project.ts:201-205,226`). Line 42 therefore throws before any assertion runs.
- The test is `itWithCorpus`, so it skips only when the subject is missing. The subject IS present on this machine: `C:/Programming Projects/Pokemon Game/game/data/layouts/layouts.json` exists. The full gate will report this as a real failure, not an env skip.
- Failing input: any vitest run that includes `packages/core/test/load/escapingPaths.test.ts` while the corpus is configured.
- Fix: change lines 42-43 to use `tilesetPathsUnchecked`. Optionally also assert that `tilesetPaths` now throws `PathEscapeError`.
- Any gate claim of "known env fail only" needs re-checking against this test.

### I2. CLI `validate` and MCP `pokemap_validate` report a broken project as clean (needs a ruling)
`packages/core/src/validate/metatileRange.ts:40` and `:101` skip a broken layout or tileset silently. `packages/cli/src/index.ts:218-232` prints `0 finding(s)` and sets `exitCode = 0`. `packages/mcp/src/server.ts:116-123` passes that through as `[]`. The CLI has no defects command for GBA, so nothing on the CLI/MCP surface ever tells the user the layout was skipped. The server's `/api/defects` banner is the only reporter, and it is not reachable from CLI/MCP.
- Failing input: the fixture with `breakLayout(root, "X")`, or a broken tileset T, where all other layouts are in range. `pokemap validate --json` prints `[]` and exits 0. Before F1d it either read outside (the hole) or threw.
- An agent using `pokemap_validate` as an oracle gets a wrong "clean" answer, and no check catches it.
- Ruling 6 says "skip", but it does not say "silently". Suggested minimal fix, with no change to the `RangeFinding` type: have the CLI write one `warning: <BrokenPath.message>` line per skipped component to stderr (the same pattern as the GBC `warningLines`) and exit non-zero. Alternatively, accept the gap explicitly in the spec.

## Minor

- **M1. Spec rationale vs. aliasing.** Ruling 6 skips a layout when EITHER tileset is broken (`usage.ts:317`). Its rationale says such a map "cannot be affected by" another map's edit, but it can. Example: layout X with healthy primary A and broken secondary T. An edit to A from Emerald changes Extra's blocks once T is fixed. The planner then skips G4, G8 and the save-as-new SPLIT_LIMIT for X (`gbaOps.ts:316-333`), so no confirm is raised for Extra.
  - Meanwhile `gbaTilesetEffects` (`save.ts:53-74`) DOES list Extra as affected, so the planner's usage and the save summary disagree.
  - This is the trade-off the spec chose: the alternative, `proj.tileset(T)` inside `assertStructural`, would block the healthy edit. The rationale text should still say the map is left unchecked, not that it is unaffected.
- **M2. M8 (removing `if (paths.brokenPaths?.length) continue;` at `usage.ts:300`) is an equivalent mutant in production.**
  - After `usage.ts:317`, the `consumingBy*` maps never hold a use from a layout that uses a broken tileset.
  - The only callers that can pass a broken symbol into `gbaConsumingUses` are:
    - `consumingUses` and `gbaCrossHalfWarnings` (`gbaOps.ts:47,153`), which run only after `assertLayoutUsable`.
    - `blockEditRoutes.ts:273`, which runs after `context()` → `refuseBrokenLayout`.
    - `gbaBlockUsage`, which throws at `usage.ts:488` before its first file read (`gbaCells` at `:500`).
  - Without the skip, a broken symbol's `pathsBySymbol` entry could only find uses through a healthy alias that shares its in-project `.metatiles` or `.metatileAttributes` file. That is visible only through a direct `gbaConsumingLayouts(proj, brokenSymbol)` call, which nothing in production makes.
  - Keeping the line as defence in depth is fine. To kill the mutant, assert `gbaConsumingLayouts(dirty, "gTileset_T")` equals `[]` in a fixture where T is broken only on `.tiles` and aliases A's metatiles.bin.
- **M3. The message lost the fix hint.** The old tileset error was `message + " " + fix` for every broken path. `PathEscapeError` carries only `brokenPaths[0].message` (`pathGuard.ts:25-28`). The server is unaffected because `refusalBody` sends `defect.fix`. The CLI (`render`, `render-world`, `query --` paths into a broken tileset) and MCP callers now see no fix text, and only the first of several broken paths.
- **M4. CLI `render-world` still lets one broken layout block every healthy map in the bbox** (`cli/src/index.ts:152`). `renderLayout` throws `PathEscapeError`, which aborts the whole PNG. This predates F1d and the spec does not list this reader, but it contradicts the second half of D25. The server warm-up already skips with `brokenPathBody` (`server/src/index.ts:1445`). Follow-up row, not this task.
- **M5. Test-helper doc and hygiene.**
  - The `outsideCalls` docstring (`core/test/helpers/brokenGba.ts:42`) claims it covers openSync/readdirSync, but the `vi.mock` factories wrap only readFileSync/existsSync/statSync. This is harmless today, because every reader under test imports `{ readFileSync, existsSync }` by name from `node:fs` (checked across `core/src`). The doc should still match.
  - The sentinel names in the shared tmpdir parent (`pokemap-f1d-outside-X.bin`) are not unique per run. Two parallel vitest workers could delete each other's sentinels. No assertion depends on the sentinel existing, because the spies record the call either way.
- **M6.** Both `brokenComponents.ts` files end without a trailing newline.

## Re-derivation

### (1) Every reader of a layout path or a tileset INCBIN path
I grepped `blockdataFilepath|borderFilepath|tilesetPaths(|.tileset(|metatilesBin|attributesBin|tilesPng` over all non-UI `src`. Each hit is guarded:
- **core**
  - `render/layout.ts:59,63-64`: the layout guard, then `proj.tileset`, which throws before `loadTileset`.
  - `defects/gba.ts:83`: the `broken.length === 0` guard.
  - `signs/suggest.ts:70`, `blockEdit/gbaOps.ts:249`, `write/binary.ts:58,78`: new guards, all placed before the first read.
  - `validate/metatileRange.ts:40,101`.
  - `usage.ts gbaCells`: reached only through consuming uses, and broken layouts are skipped.
  - `gbaOps cells/effectiveGrid/usedElsewhere`: only the `layoutObject` of consuming uses.
  - `load/tilesetData.ts`: only through `getTileset`, which is checked.
  - `save.ts:54`: string-only, no reads.
  - `write/save.ts`: uses only the guarded binary planners.
- **server**
  - `editSessions.ts:35`.
  - `index.ts:161,433,549,1170`, the edit gate at `:369-380`, and the `guardIds` session layout at `:835`.
  - `blockEditRoutes.ts:224`, which also covers `:262` and the sheet.
  - `addEventRoutes.ts:261`, through `store.open`.
- **cli**: `writeCommands.ts:26`. `query` reads no layout file.
- **mcp**: shells out to the CLI only and reads no project files itself.

No unguarded outside read remains. `canonicalTilesetPath` (`posix.normalize`) leaves `../` intact, so a broken path cannot be normalised into a project-relative alias.

### (2) Walkers
- **Primary healthy, secondary broken.** The layout is skipped as a whole (see M1). `brokenPathOfLayout` tries the layout's own paths first, then primary, then secondary, and swallows only the unknown-symbol error, so an unknown symbol still fails later as before.
- **Broken tileset used by no layout.** It has no `pathsBySymbol` entry. The palette walk skips it. `gbaTilesetEffects` lists its paths without reading them. Healthy maps are unaffected.
- **Alias via `.tiles` or `.palettes`.** A tileset broken only on `.tiles` or `.palettes` still has in-project metatiles and attributes paths. Its layouts are skipped from relations, but they appear in `gbaTilesetEffects` (M1).
- **Caching.** The relations cache is keyed on `tilesetGeneration`. Brokenness is fixed at `openProject` (`tsPaths` is parsed once). `setTilesetOverlay` replaces only bytes, never paths, and `getTileset` refuses a broken tileset before `readTilesetFile` runs. A stale cache therefore cannot change which components count as broken.
- **Grid sharing.** `buildGbaMapsByGridFile` (`usage.ts:373`) still includes broken layouts. Example: X broken only through its border, but sharing E's blockdata. X's maps then appear in E's `sharedGrids` and SHARED_GRID. Nothing is read, and they genuinely share the grid file. Correct.

### (3) Error semantics
- **Throw sites and catch sites.** `PathEscapeError` is thrown from `getTileset`, `tilesetPaths`, `assertLayoutUsable` and `assertLayoutFilesInside`. In core src, nothing catches it or depends on the old message text, apart from the `gbaOps.ts:233` passthrough.
- **Server.** `brokenPathBody` maps it to 409 in `blockEditRoutes fail()` (`:149-150`), which runs before the BlockEditRefusal/500 branch. That also covers the POST `.catch(fail)` path, and GBC block routes now get 409 instead of 500 for a GBC `PathEscapeError`.
  - The GET read path rethrows non-refusals to `fail`, so the result is 409, not 500.
  - The edit gate already pre-refuses `/api/edit/*`. The `context()` guard is the only one in front of `/api/block-sheet`, and the new server test covers it.
- **Tests.** The only test that depends on the old non-throwing `tilesetPaths` is I1. No test matches the old `"message fix"` text. `server/test/brokenPaths.test.ts:74` calls `tilesetPaths` on the clean probe project, which is fine.

### (4) Test quality and mutations (by reasoning)
- **Are the mocks real?** Every relevant core reader imports `readFileSync`/`existsSync`/`statSync` by name from `"node:fs"`, so the `vi.mock("node:fs")` factories really intercept them. The sentinel path strings contain `OUTSIDE` whether built with a template or with `join`. The spies therefore record a wrong outside read even when that read later throws on size.
- **Guard mutants:** each removal fails at least one new test.

| Guard removed | Test that fails, and why |
|---|---|
| `gbaOps.ts:249` | The Extra edit no longer throws `PathEscapeError` (blockEdit/brokenPaths, broken-layout case). |
| `:233` passthrough | The broken-T Extra edit is wrapped as BAD_VALUE, so `not.toBeInstanceOf(BlockEditRefusal)` fails. |
| `usage.ts:317` | X appears in `gbaConsumingLayouts(A)`, and an outside read is recorded. |
| `metatileRange.ts:40` | An outside read for X, plus a throw for T. |
| `:101` | `validatePaletteRange` throws. |
| `suggest.ts:70` | An outside blockdata read for X. The T case survives on its own, because `proj.tileset` throws. |
| `writeCommands.ts:26` | An outside read. |
| `binary.ts:58`, `:78` | `existsSync`/`readFileSync` on the outside path. |
| `blockEditRoutes.ts:224` | block-sheet for `LAYOUT_MAP` returns 200 instead of 409. |
| `:149-150` | 500 for the broken-tileset sheet. |
| `project.ts` checked `tilesetPaths` | brokenTileset test. |
| `getTileset` error type | brokenTileset test. |

- **M8** survives and is equivalent in production (see M2).
- **Coverage gap.** Nothing covers the POST `/api/edit/<map>/block/check|apply` for a broken map, because the edit gate answers first.
