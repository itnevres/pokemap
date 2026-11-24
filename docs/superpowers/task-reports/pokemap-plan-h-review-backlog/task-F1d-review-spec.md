# Plan H F1d: spec-compliance review (Opus, read-only)

Range: `be0d0ac..de2ad03` (fa2d351 tests + spec, de2ad03 implementation). Read-only review: no vitest, typecheck or build was run, as the brief required. Mutation results below come from tracing each guard by hand against the tests, not from running them. The repo has no implementer report with gate or mutation evidence for F1d: no `task-F1d-implement*.md`, and the commit messages carry none.

**Verdict: CHANGES NEEDED.** There is one Important finding: an existing corpus test is broken by ruling 1 and was not updated. Every ruling is otherwise implemented, every reader the row names is guarded, and the repo-wide sweep found no unguarded reader.

## Important

**I1. `packages/core/test/load/escapingPaths.test.ts:42-43` now throws, so the full gate goes red wherever the corpus exists.**
- **What changed.** Ruling 1 makes `Project.tilesetPaths()` throw `PathEscapeError` for a broken tileset (`project.ts:201-205`, `tilesetPaths: getTilesetPathsChecked`).
- **What the old test does.** This F1 corpus test (`itWithCorpus`) breaks `gTileset_Petalburg` and then calls `p.tilesetPaths("gTileset_Petalburg").brokenPaths` (line 42). It also calls it inside the `toThrow(...)` argument on line 43.
- **Failure scenario.** On any machine where `hasProject(SUBJECT_ROOT)` is true, line 42 throws `PathEscapeError` before the `expect` runs, and the case fails. That breaks the acceptance bullet "Gate: full vitest (known env fail only)". The diff does not touch this file.
- **Fix.** Use `p.tilesetPathsUnchecked(...)` on lines 42-43, and on 44 for consistency. Optionally assert `toThrow(PathEscapeError)` on line 43 as well. The message check still holds, because `PathEscapeError` uses `brokenPath.message` as its message (`pathGuard.ts:25-27`).
- **Why it was missed.** No gate evidence was recorded. This is the only test in the repo that calls the checked accessor on a broken symbol. I checked the other suites that build escaping paths (listed under Minor M6), and none of them do.

## Minor

- **M1. Surviving mutant at `packages/core/src/blockEdit/usage.ts:300`.** Removing `if (paths.brokenPaths?.length) continue;` fails no test.
  - It is not observable at present. Every layout that uses the broken tileset is skipped at `:317`, so the extra `pathsBySymbol` entry has no consumers. Its only reachable callers are healthy symbols, plus `gbaBlockUsage(T)`, which still throws at `:488`.
  - Ruling 6 says broken-tileset symbols "have no pathsBySymbol entry", but no test pins this. It is defense in depth, so this is Minor.
  - A direct check would pin it, for example `gbaConsumingLayouts(dirty, "gTileset_T")` returning `[]` in a variant where T's attributes path aliases a healthy tileset's file.
- **M2. The healthy-layout writer test is weak.** At `packages/core/test/write/binaryBroken.test.ts:78-87` it asserts only "not a `PathEscapeError`". A healthy plan that silently returned the wrong thing would still pass. Asserting `planBlockdataWrite(...)` equals `null`, since the blocks are E's own bytes, would make it a real regression check.
- **M3. The server F1d cases are corpus-gated.** They sit under `describe.skipIf(!hasProject(SUBJECT_ROOT))` (`packages/server/test/brokenPaths.test.ts:210-222`).
  - On a machine without the subject, nothing guards the block-sheet 409 or the `fail()` → `brokenPathBody` mapping. Those are the guard at `blockEditRoutes.ts:224` and the mapping at `:149-150`.
  - This is acceptable because the F1c suite has the same constraint. Record it so the gate summary states whether these ran.
- **M4. Fixed sentinel names in the shared OS tmpdir.** `packages/core/test/helpers/brokenGba.ts:13-24, 37-39` writes `<tmpdir>/pokemap-f1d-outside-*.bin` with fixed names. It overwrites these unconditionally and the tests delete them in `afterEach`.
  - Two concurrent runs (two worktrees, or file-parallel vitest) can delete each other's sentinels.
  - Correctness survives, because `outsideCalls` records the attempted call even when the file is gone.
  - It still differs from the server suite's "never overwrite a file we did not create" rule. The doc comment also says "8-byte" for the layout sentinel, which is accurate, while the tileset sentinel is 64 bytes. Consider unique names, for example including the root's basename.
- **M5. `gbaTilesetEffects` still lists maps on a broken layout or broken tileset in a healthy file's effect list** (`packages/core/src/blockEdit/save.ts:53-74`). This is informational only: it reads no files, and ruling 2 only asks that it "still works". The Save summary may name a map that cannot be opened. Noted, not a spec breach.
- **M6. Swept for other tests calling `tilesetPaths` on a broken symbol: none found.** Checked:
  - `defects/gbaBrokenPaths`
  - `blockEdit/save`
  - `load/layouts`
  - `load/tilesetsSlashless`
  - `render/brokenLayout`
  - the server F1c suite (it calls `probe.tilesetPaths` before breaking the copy)

  The GBC `escapingPaths` tests use the GBC project, which is unaffected.

## Rulings check

| Ruling | Status | Evidence |
|---|---|---|
| 1. One error type | Met | `project.ts:176-179`: `getTileset` throws `PathEscapeError(tp.brokenPaths[0])`. `:201-205, :226`: `tilesetPaths` is the checked accessor. The server `fail()` now handles it with no special case (`blockEditRoutes.ts:149-150`). |
| 2. `tilesetPathsUnchecked` | Met | Declared in `project.ts:43-48`, wired in `:227`. Used by `usage.ts:299`, `save.ts:54`, and core `brokenComponents.ts:27`, which the server check delegates to. Also used by `metatileRange.ts:101`. |
| 3. Shared helper | Met | `core/src/brokenComponents.ts` exports `brokenPathOfLayout` (checks the layout first, then primary, then secondary, and skips unknown symbols), `assertLayoutUsable` and `assertLayoutFilesInside`. `server/src/brokenComponents.ts` keeps the same exports and signatures and delegates. Delegating matters: the old server body called `project.tilesetPaths` inside `try/catch { continue }`. Under ruling 1 that would have swallowed the new throw and silently passed broken tilesets; delegating avoids it. |
| 4. Single-map readers refuse before any read | Met | `assertLayoutUsable` / `refuseBrokenLayout` sits right after `layoutForMap` in each reader: `signs/suggest.ts:70`, `cli/src/writeCommands.ts:26`, `blockEdit/gbaOps.ts:249` and server `blockEditRoutes.ts:224` (GBA `context()`, which serves block read, sheet, preview, check and apply). `planGbaBlockEdit` rethrows `PathEscapeError` unchanged (`gbaOps.ts:233`). `fail()` answers `brokenPathBody` with 409 (`blockEditRoutes.ts:149-150`). |
| 5. Binary writers | Met | `write/binary.ts:58, :78` call `assertLayoutFilesInside` before `buildPlan`'s `existsSync`/`readFileSync`. |
| 6. Walkers skip broken layouts | Met | `metatileRange.ts:40` (layout loop), `:101` (palette loop), `usage.ts:300` (symbols) and `:317` (layouts). `gbaOps` follows from the relations: `consumingUses`, `usedElsewhere`, `assertStructural` and `gbaCrossHalfWarnings` only ever see healthy layouts. `gbaBlockUsage(brokenSymbol)` throws through the checked `tilesetPaths` (`usage.ts:488`). |
| 7. Symlinks out of scope | Met | Nothing added. |

## Readers named by the row

All are guarded, as the table above shows:
- `signs/suggest.ts`
- `write/binary.ts` (both writers)
- `validate/metatileRange.ts` (both halves)
- `blockEdit/gbaOps.ts`
- `blockEdit/usage.ts`
- `blockEdit/save.ts`
- `cli/src/writeCommands.ts`
- server `blockEditRoutes.ts`, including `GET /api/block-sheet/<map>.png`

The block-sheet route sits outside the F1c `/api/edit` gate. It reaches `context()` → `refuseBrokenLayout`, and on throw `fail()` returns 409 `broken-path`.

For a healthy map, the block GET's own blockdata read (`blockEditRoutes.ts:262`) happens after `context()` has refused a broken one. The `sharing` filter at `:260` compares path strings only and reads nothing.

## Acceptance coverage

- **Single-map readers throw `PathEscapeError` and never open the outside file.** Spy and sentinel checks via `outsideCalls` cover:
  - `readFileSync`, `existsSync` and `statSync`: signs, gbaOps (`blockEdit/brokenPaths.test.ts`) and the binary writers
  - `readFileSync` and `existsSync` only: the CLI (`statSync` is asserted for the broken case)
  - the server, by sentinel only, over HTTP
- **Walkers skip the broken component.** `metatileRangeBroken.test.ts` covers this, including exact equality with the clean findings minus the broken layout(s). `blockEdit/brokenPaths.test.ts` covers `gbaConsumingLayouts` and `gbaBlockUsage`.
- **Broken tileset.** `project/brokenTileset.test.ts` shows `tileset` and `tilesetPaths` throw with `brokenPath.key === ".metatiles"`, and that `tilesetPathsUnchecked` returns it. `blockEdit/brokenPaths.test.ts` shows `gbaBlockUsage(A)` and `gbaTilesetEffects` still work for healthy tilesets.
- **Healthy-map plan unchanged.** `expectSamePlan` compares edit paths, `after` bytes and `confirm` against a clean project, for both a broken layout and a broken tileset.
- **Server.** The block sheet returns 409 for a broken layout, a broken secondary and a broken primary tileset (`brokenPaths.test.ts:210-214`). The `/api/edit/<map>/block` 409 is covered by the existing F1c case at `:160-163`. The healthy control's sheet and block GET return 200 (`:216-222`).
- **Mutation checks.** Traced by hand only (I1 shows why the gate evidence is still owed). Each guard and the test that fails when it is removed:
  - `project.ts` checked throw → `brokenTileset` "tilesetPaths throws". Also `gbaBlockUsage(T)` throws, because without the guard it would return empty usage.
  - `getTileset` `PathEscapeError` (reverted to a plain `Error`) → `brokenTileset` "proj.tileset throws PathEscapeError".
  - `suggest.ts:70` → `suggestBroken` broken-layout case: outside `readFileSync`, and nothing thrown.
  - `binary.ts:58/:78` → `binaryBroken`: outside `existsSync`/`readFileSync`, and no `PathEscapeError`.
  - `metatileRange.ts:40` → `metatileRangeBroken` case 1 (outside read) and case 2 (`tileset(T)` throws). `:101` → case 3.
  - `usage.ts:317` → "gbaConsumingLayouts omits X" and "excludes Extra/SharedA".
  - `usage.ts:300` → none (M1).
  - `save.ts:54` (reverted to checked) → "Save plan's tileset effects do not throw".
  - `gbaOps.ts:249` → "Extra refused". Without the guard, `effectiveGrid` on X reads the outside file at `:347` and returns a plan.
  - `gbaOps.ts:233` → the same test's `not.toBeInstanceOf(BlockEditRefusal)`.
  - `writeCommands.ts:26` → `writeBroken` case 1.
  - `blockEditRoutes.ts:224` → the server block-sheet `LAYOUT_MAP` case. Without the guard, the sheet renders from healthy tilesets and returns 200. This case runs only when the corpus is present.
  - `blockEditRoutes.ts:149-150` → all three block-sheet cases (500 instead of 409). Also corpus-only.

## Repo-wide sweep (core, server, cli, mcp)

Searched for `tilesetPaths(`, `.tileset(`, `blockdataFilepath` and `borderFilepath` in `packages/{core,server,cli,mcp}/src`.

- **Covered by F1/F1c:**
  - `render/layout.ts:59` (`PathEscapeError` before any read)
  - `defects/gba.ts:83` (reads only when `broken.length === 0`)
  - server `editSessions.ts:35` (`refuseBrokenLayout`; this also covers `addEventRoutes.ts:258-261` through `store.open`, and `index.ts:292` through the opened session)
  - `index.ts:433` (`/api/map`), `:549` (`/api/metatile`), `:835` (session-gated paint guard) and `:1170` (indicator suggest)
- **`write/guards.ts:16,47`** only calls `proj.tileset`, which now refuses a broken tileset with `PathEscapeError` before any read. It reads no layout file.
- **Covered by F1d:** every site named in the row, as listed above.
- **Not applicable (GBC project, F3's scope):**
  - `blockEdit/gbcOps.ts` and `usage.ts:60,244`
  - `gbc/*` and `indicator/gbcData.ts`
  - server `gbcRoutes.ts`, `gbcEditRoutes.ts`, and the GBC half of `blockEditRoutes.ts`
- **CLI:** `index.ts` reaches only `renderLayout` (guarded) and `validateMetatileRange`/`validatePaletteRange` (guarded). The `query` command reads only `layoutForMap` metadata, with no file read. `renderWorld.ts` goes through `renderLayout`.
- **MCP:** `packages/mcp/src` imports nothing from core and reads no project files; it drives the CLI and server.

**No new unguarded reader found.**

## Healthy-map behaviour (D25: nothing else blocked)

- For a project with no broken paths, every new check is a no-op: `brokenPathOfLayout` returns `undefined`, `tilesetPathsUnchecked` equals `tilesetPaths`, and the relations are identical.
- With one broken component, healthy maps plan identically (`expectSamePlan`) and their sheets and block GETs still return 200.
- The only behaviour change for healthy code is I1: a test that relied on the old non-throwing `tilesetPaths`.
