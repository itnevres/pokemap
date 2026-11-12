# Plan 14.2 Task 5 — Usage index (both families)

**Status:** DONE
**Implementer:** DeepSeek V4.1 Flash Free
**Date:** 2026-11-12

## What changed

Implemented the block usage index in `packages/core/src/blockEdit/usage.ts` against the
committed oracle test `packages/core/test/blockEdit/usage.test.ts` (not edited).

- `MapUse` / `BlockUsage` exported from `usage.ts`.
- `gbcTilesetsForFile(proj, path)` — canonical-path → sorted distinct `TILESET_*` consts
  over the tilesets any map uses (R5).
- `gbcBlockUsage(proj, metatilesPath, blockId, grids)` — one entry per `.blk` file, with
  `interior` (raw-id cells), `border` (representative map's header), `block0AsBorder`
  (raw-0 cells when the border is the queried non-zero id), `files`, `tilesets`, and
  `sharedGrids` for files backing 2+ maps (R1/R2/R3/R6).
- `gbcTileUsage(proj, palMapPath, tileId, grids)` — per metatiles file, ascending block
  ids whose 16 tile bytes contain the tile (read through `proj.tileset`, so the overlay
  applies), plus every consuming map whose effective grid or border draws one (R7).
- `gbaConsumingLayouts(proj, tilesetSymbol)` — both roles, split and paired tileset,
  sorted by layout id (R8).
- `gbaBlockUsage(proj, tilesetSymbol, localIndex, grids)` — secondary ids translated by
  each layout's `split.metatiles`, one entry per blockdata file, GBA border-bin counts,
  `files` = the symbol's metatiles + attribute binaries (R1/R2/R3/R9/R10).

Caching follows R4: only static relations (file → tilesets, tileset/grid file → maps,
layout → maps) live in module-level `WeakMap`s keyed on the project object and rebuilt
when `proj.tilesetGeneration` differs. Counts, disk-grid parses and staged-grid lookups
are recomputed on every call, so no paint/fill/stamp/undo/redo/save invalidation hook is
needed.

Also added `usage.ts` to the `blockEdit` barrel export (`packages/core/src/blockEdit/index.ts`).

## Files

- Created `packages/core/src/blockEdit/usage.ts`
- Edited `packages/core/src/blockEdit/index.ts` (barrel export only)
- Created `docs/superpowers/task-reports/pokemap-plan-14-2-block-editor/task-5-report.md`

No tests, fixtures, shared helpers, or project loaders were modified.

## Tests run

```
npx vitest run packages/core/test/blockEdit/usage.test.ts
  Test Files  1 passed (1)
       Tests  10 passed (10)
    Start at  09:26:46
    Duration  84.31s
```

0 skipped; both GBC and GBA corpus cases ran.

```
npx tsc --noEmit -p tsconfig.base.json      -> pass (no output)
npx tsc --noEmit -p packages/ui/tsconfig.json -> pass (no output)
```

The harness denied `npm run typecheck` itself; these are the exact two commands that
script runs. No new dependencies, no jest-dom, no writes to the real subjects.

## Mutation mapping (for the conductor)

- Shared grid counted per map → “a shared .blk is counted once…” asserts one entry and
  `interior === diskCount` (not `diskCount * 2`).
- Block-0 substitution ignored → staged raw-0 test asserts `borderEntry.interior === 0`,
  `border === 1`, `block0AsBorder === area`, and the id-0 query asserts `interior === area`.
- Relations keyed by tileset name → Cave/DarkCave test asserts both `TILESET_CAVE` and
  `TILESET_DARK_CAVE` in `gbcTilesetsForFile` / `usage.tilesets`.
- Counts cached → “counts are never cached…” asserts `a1.interior !== a2.interior` and
  disk-restored `u3.maps` equals the disk oracle.

## Concerns / notes

- **GBA shared blockdata with conflicting targets.** If two consuming layouts of the same
  symbol shared one blockdata file but resolved different target ids (different splits),
  R2's one-entry-per-file rule forces one target. The implementation keeps the lowest
  layout id's target and border. No such case occurs in the subject for the tested
  symbols (the oracle would have thrown). Border bins likewise come from the first layout.
- **GBA `sharedGrids`.** The oracle hardcodes `sharedGrids: []` for GBA and the GBA test
  does not compare that field; the implementation fills it per R2 when a blockdata file
  backs 2+ maps.
- **GBC disk grids** come from `proj.layout(map)` (disk `.blk`, declared `w*h`), matching
  the oracle; borders always come from the map header. Staged grids never change borders.
- **GBC metatiles data** for `gbcTileUsage` is read through `proj.tileset`, per R7, so a
  staged overlay would be honoured; the oracle in this task reads raw disk because no
  overlay is staged.
- `npm run typecheck` had to be run as its two constituent `npx tsc` invocations because
  the sandbox denied the `npm` command.
