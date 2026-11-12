# Task 5 tests report: usage index (both families)

**Deliverable:** `packages/core/test/blockEdit/usage.test.ts` (tests only; no `src/blockEdit/usage.ts`
was created or edited by this session).

## What the file covers

Ten corpus tests, each with an oracle built by plain `node:fs` reading of the decomp sources/binaries
(no project loaders, no `usage.ts`). The only project calls are `openGbcProject` / `openProject`,
`proj.splitFor` and `proj.layoutById` (to hand a project to the functions under test; splits are excluded
from the oracle by the brief).

GBC (`itWithGbcCorpus`):

1. **Cave / DarkCave** — both constants resolve the same metatiles file; `gbcTilesetsForFile` lists both;
   a block id drawn by a Cave map and a DarkCave map produces entries naming maps of both tilesets.
2. **Shared `.blk`** — `maps/PortPassage.blk` yields exactly one entry, named `OlivinePortPassage`, its
   `interior` equals one grid's count (not twice), and `sharedGrids` names
   `["OlivinePortPassage", "VermilionPortPassage"]`.
3. **Raw block 0** — a staged grid of raw `0` cells plus a non-zero border: for the border id the entry has
   `interior: 0`, `border: 1`, `block0AsBorder: <area>`; for id `0` it has `interior: <area>`,
   `block0AsBorder: 0`.
4. **Full `maps` equality** — the metatiles file with the most consuming maps, its most frequent cell id,
   comparing `files`, `tilesets` and the whole `maps` list.
5. **Staged grid override** — staging a sole-owner map to one id raises its interior to the full area;
   separately, staging only `VermilionPortPassage` still changes the shared file's single
   `OlivinePortPassage` entry (R3: alphabetically first map present in `grids`).
6. **No stale cache** — three calls on the same project object around two different `grids` yield the two
   staged counts and then the disk count again.
7. **`gbcTileUsage`** — `blocks` (file + ascending ids) and `maps` match the oracle; staging a map to a
   block that does not contain the tile removes it.
8. **Unknown path** — `gbcTilesetsForFile(proj, "nope/missing.bin")` is `[]`.

GBA (`itWithCorpus`):

9. **`gTileset_General`** — `gbaConsumingLayouts` matches every layouts.json entry consuming the symbol
   (role, pairedWith, `split === proj.splitFor(layout)`), the subject's two metatile splits are present
   (512 and 640), and `gbaBlockUsage` maps equal the oracle over a scanned local id. Staging a consuming
   grid to that id raises that entry's interior to the grid's whole area.
10. **Secondary tileset** — a scanned symbol with a consuming layout that actually draws a local id in its
    secondary range: roles/pairedWith/splits and a local id translated through `split.metatiles` match the
    oracle, with a non-empty maps list.

Fixtures are found by scanning except the names the task spec names (Cave/DarkCave, PortPassage pair,
`gTileset_General`). No new corpus helper, no `skipIf`, no real path, no `pokemap.config.json` read.

## Fixture scan evidence (read-only, obtained before deletion of a temporary diagnostic file)

A temporary diagnostic test (never committed; removed after the run) parsed the same copied corpus and
confirmed the fixture assumptions:

- GBC: 391 maps / 257 grid files; `TILESET_CAVE` and `TILESET_DARK_CAVE` both resolve
  `data/tilesets/cave_metatiles.bin`.
- **The subject contains no block-0 bytes on disk** (0 of 37,280 declared map cells, 0 of 391 whole `.blk`
  files). Test 3 therefore stages the raw `0` cells instead of claiming a disk fixture; the assertion still
  covers the block-0-as-border substitution and the id-0 interior case. This is the one departure from a
  literal "map on disk with raw 0 cells"; the task's mutation ("block-0 substitution ignored") is still
  killed because only a staged grid can exercise the path.
- GBA: 1,020 layouts, 1,209 maps; 240 layouts consume `gTileset_General`, 214 of them have maps, and 105
  have at least one scanned local id that is present but does not fill the grid. Distinct General splits are
  exactly `512` and `640`.

## Verification (this sandbox)

- `npx vitest run packages/core/test/blockEdit/usage.test.ts` → **fails as required**: suite load error
  `Failed to load url ../../src/blockEdit/usage.js ... Does the file exist?`, `0` tests collected.
- `npx tsc --noEmit -p tsconfig.base.json` → **only** `TS2307` for `../../src/blockEdit/usage.js`. The file
  declares local structural shapes (`Usage`, `UsageMap`, `GbaLayoutUse`, `TileUsage`) so the missing module
  cannot produce implicit-`any` cascades.
- `npm run typecheck` itself is blocked by the harness's shell policy in this session (`Permission denied:
  shell`), so the equivalent direct `tsc` invocation above was used. Full-gate and UI build are out of scope
  for this tests-only task and were not run.
- No implementation exists yet, so no oracle-vs-implementation result can be claimed. Green execution and
  mutation kills belong to the Task 5 implementer/conductor.

## Oracle assumptions (for the implementer/reviewer)

- `.blk` bytes are limited to the declared `width * height` from `constants/map_constants.asm`; several
  subject files are oversized and the loader truncates to those dimensions.
- GBC: one entry per grid file, named and bordered after its alphabetically first consuming map (R2). The
  oracle groups by `blkPath`; shared aliases are assumed to agree where it matters (test 3 stages a
  sole-owner map).
- GBC tileset resolution follows `constants/tileset_constants.asm` → `data/tilesets.asm` → stacked labels in
  `gfx/tilesets.asm` (GFX/Meta INCBIN, Coll INCLUDE) and `gfx/tileset_palette_maps.asm` (PalMap INCLUDE);
  GFX `.2bpp.lz` maps to `.png`.
- GBA cells are u16 LE masked with `0x3ff`; border bins are counted as border references; `block0AsBorder`
  is always 0. `files` and `sharedGrids` are not asserted for GBA (the oracle does not use
  `proj.tilesetPaths`).
- `gbaConsumingLayouts` is expected to list every consuming layout in layouts.json (sorted by id), including
  layouts without maps; `gbaBlockUsage` skips layouts with no maps, groups by `blockdata_filepath` and names
  the alphabetically first map.
- Layout/map enumeration uses `data/layouts/layouts.json`, `data/maps/map_groups.json` and each
  `data/maps/<name>/map.json`, matching `proj.layouts` / `proj.mapNames()`.
