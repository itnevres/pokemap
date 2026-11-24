# Plan H F1d: spec (High tier)

Tier: High. Reason: parsing boundary (D25), outside-the-project reads that no test or check catches automatically.

Goal (D25): nothing outside the project is ever read, and one broken component blocks only the maps that use it. A broken layout or tileset path is refused at every remaining reader; nothing else in the project is blocked.

## Rulings (binding for this row)
1. **One error type.** A broken tileset throws `PathEscapeError(tp.brokenPaths[0])`, not a plain `Error`. `Project.tileset()` and `Project.tilesetPaths()` both throw it. (Server already handles both; its tileset check becomes a plain call.)
2. **Non-throwing accessor for project-wide walks.** `Project.tilesetPathsUnchecked(symbol)` returns the paths with `brokenPaths` set. Used where code walks EVERY tileset or layout and must keep working for healthy ones: `blockEdit/usage.ts buildGbaRelations`, `blockEdit/save.ts gbaTilesetEffects`, the server's broken-component check.
3. **Shared helper** `core/src/brokenComponents.ts`: `brokenPathOfLayout(proj, layout)` (layout paths first, then primary, then secondary tileset), `assertLayoutUsable(proj, layout)` (throws `PathEscapeError`), `assertLayoutFilesInside(layout)` (layout's own blockdata/border only; for readers that never touch tilesets). The server's `brokenComponents.ts` delegates to it (same exports, same behavior).
4. **Readers that act on ONE named map/layout refuse it** (`assertLayoutUsable`, before any read): `signs/suggest.ts`, `cli/src/writeCommands.ts openCliEditSession`, `blockEdit/gbaOps.ts planGbaBlockEditInner`, server `blockEditRoutes.ts` GBA `context()`. `PathEscapeError` passes through `planGbaBlockEdit`'s BAD_VALUE wrapper unchanged, and `blockEditRoutes.ts fail()` answers it with the typed 409 (`brokenPathBody`), not 500.
5. **`write/binary.ts planBlockdataWrite/planBorderWrite`** call `assertLayoutFilesInside(layout)` before the read (F2 stays the hard write refusal).
6. **Readers that walk EVERY layout skip a "broken layout" (`brokenPathOfLayout` set: its own paths OR either tileset broken), never read its files, and keep serving healthy ones**: `validate/metatileRange.ts` (both halves; the palette loop skips a broken tileset), `blockEdit/usage.ts` relations (a broken layout contributes no consuming use, so `gbaOps` never calls `proj.tileset` on its other half; broken-tileset symbols have no `pathsBySymbol` entry), `blockEdit/gbaOps.ts` follows from the relations. Rationale: a map on a broken layout cannot be rendered, opened or saved, so it cannot be affected by, or conflict with, another map's edit. `gbaBlockUsage` on a broken tileset symbol itself throws `PathEscapeError` (checked `tilesetPaths`).
7. Symlinks/junctions stay out of scope (accepted limit, unchanged).

## Acceptance
- Each reader above, given a project where `blockdata_filepath`/`border_filepath` is `../outside.bin` (with a sentinel file there): throws `PathEscapeError` (single-map readers) or skips it (walkers), and a spy/sentinel proves the outside file is never opened.
- A broken tileset: `proj.tileset(sym)` and `proj.tilesetPaths(sym)` throw `PathEscapeError` with the `BrokenPath`; `tilesetPathsUnchecked` returns it; `buildGbaRelations` and `gbaTilesetEffects` still work for every healthy tileset.
- A project with one broken layout: `validateMetatileRange` returns the findings for the healthy layouts; usage/plan for a healthy map unchanged.
- Server: GET `/api/block-sheet/<map>.png` and `/api/edit/<map>/block*` answer 409 `code: "broken-path"` for a broken layout or tileset; a healthy map on a project that also has a broken layout still works.
- Mutation checks: removing each guard fails at least one new test.
- Gate: full vitest (known env fail only), typecheck, UI build.
