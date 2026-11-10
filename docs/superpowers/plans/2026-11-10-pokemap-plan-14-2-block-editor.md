# Plan 14.2 Block Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Polished-Map-style Edit Block popup in both families that edits a block's tiles, collision (GBC) or
behavior/layer (GBA) and GBC tile palettes, everywhere (OK) or as a new block (Save as new), staged and undoable until
the normal Save.

**Architecture:** Pure core modules under `packages/core/src/blockEdit/` do the format work (lossless patchers, sheet
PNG, usage index, per-family edit planners) and return byte-level file edits. The hub stages those edits in the owning
map's session (one owner per file, the 14.1 constants-header rule), overlays all staged bytes onto tileset loading so
every view renders them, and saves them in the owner's atomic file set. A shared `BlockEditorDialog` in the shell
drives it through family specs from the engine adapter.

**Tech Stack:** TypeScript, Node (`node:zlib` for PNG), React 19, Vitest + Testing Library (no jest-dom).

**Spec:** `docs/superpowers/specs/2026-11-08-pokemap-plan-14-2-block-editor-design.md` (approved 2026-11-10; P1-P6,
Q1-Q11 binding). Read it with this plan; the plan assigns its rules to tasks and does not restate them.

**Ledger:** `docs/superpowers/task-reports/pokemap-plan-14-2-block-editor/ledger.md`. Task reports go to the same
folder (global rule 7).

## Global Constraints

- Branch `plan-14-2-block-editor` from master `3f4a762`. One scratch worktree per task from the branch tip, merged
  `--no-ff`, gate after each merge. No push, PR or merge to master without the user.
- Gate: `npm test -- --maxWorkers=4 --minWorkers=1` from the repo root (baseline 4,416 pass / 1 env fail / 254 files),
  `npm run typecheck`, `npm run build --workspace=@pokemap/ui`, then the gate skill's subject check (HEADs, porcelain,
  manifest hashes unchanged). Never two vitest processes at once.
- **New tests never write the real subjects** (GBA `C:\Programming Projects\Pokemon Game\game`, PerfPlus
  `C:\Programming Projects\pokecrystal-PerfPlus`). Write tests use temp copies: GBC `copyGbcSubjectToTemp`
  (`packages/core/test/gbc/helpers/corpus.ts`); GBA `copyGbaTilesetProject` from Task 1 (the 14.1
  `gbaTempProject.ts` copies only add-event inputs). Read-only corpus tests are fine. (The existing suite's few
  restore-in-`finally` writers predate 14.2; the gate's globalSetup snapshot and post-gate subject check cover them.)
- No new npm dependencies. PNG via `node:zlib` and the existing decoders.
- Identity is the resolved repo-relative **file path** (forward slashes), never a tileset name.
- Every patcher is lossless: unchanged input returns identical bytes; an edit changes only its target span (text:
  only the target arguments; PNG: decoded pixels outside the slot).
- Errors: one schema everywhere, `{ error: string, code: string }` (the shape `useEditSessionCore` already reads).
  Core throws `BlockEditRefusal { code, message }`; routes answer 409 with `{ error: message, code }`, 400 for a
  malformed body. Messages start with the subject (file, map or tile), e.g. `forest_metatiles.bin: block cap 256
  reached`.
- Many files are CRLF; patch text with the file's own line endings. No jest-dom matchers in UI tests.
- Do not edit existing tests or shared fixtures unless the task names them. Report unrelated bugs instead.
- Every listed mutation names the assertion that catches it; the conductor runs them after green.

## Review Focus

1. **Aliased files edited through one name, read through another** (Cave/DarkCave metatiles, Tileset0/Johto sheet and
   palette map): every view and every count follows the file. Pinned in Tasks 5, 10.
2. **Undo/redo/Discard/failed Save after tileset and grid edits interleave**, including edit → inverse edit, a partial
   undo, and redo after another map took the file. Pinned in Task 9.
3. **External change while staged or while the popup is open**: the revision check refuses at check/apply, the
   baseline check refuses at commit, naming the file; nothing written. Pinned in Tasks 8, 11.
4. **GBC collision files with surplus records and CRLF** (`forest`: 40 blocks, 64 records). Pinned in Task 2.
5. **Stale thumbnails, map canvas and world tiles** after edit, undo, redo, discard, save: an unchanged URL is a stale
   image. Pinned in Task 10 and the live check (Task 15).

---

## File map

Core (`packages/core/src/blockEdit/`, new): `types.ts`, `grids.ts` (Task 1); `gbcPatch.ts` (2); `gbcSheet.ts` (3);
`gbaPatch.ts` (4); `usage.ts` (5); `placement.ts`, `gbcOps.ts` (6); `gbaOps.ts` (7); `save.ts` (8); `index.ts`
re-exports, added to `packages/core/src/index.ts`.

Core (modified): `config/engine.ts`, `project.ts`, `gbc/project.ts`, `load/tilesetData.ts`, `gbc/load/tileset.ts`
(Task 1); `write/save.ts`, `gbc/write/save.ts` (Task 8).

Server: `src/blockEditOwnership.ts` (Task 9), `src/tilesetOverlay.ts` (Task 10), `src/blockEditRoutes.ts` (Task 11);
`index.ts`, `gbcEditRoutes.ts`, `gbcRoutes.ts`, `editSessions.ts`, `gbcEditSessions.ts` (Tasks 9-11).

UI: `shared/useEditSessionCore.ts`, `components/SaveDialog.tsx`, URL builders (Tasks 10, 12);
`shared/BlockEditorDialog.tsx` + `shared/blockEditor/*`, `shell/adapter.ts`, family adapters (Task 13);
`shared/MapContextMenu.tsx`, `canvas/MapSurface.tsx`, `MapCanvasViewport`, toolbar, palettes (Task 14).

## Task tiers

All implementation tasks are **High** (CLAUDE.md triggers: silent-corruption formats in 2-4 and 8; oracle counts in 5;
refusal/error boundaries in 6, 7, 11; save/discard ownership and async ordering in 9, 12; shared render caches in 10;
shared shell UI over save/undo in 13; canvas-core pointer behavior in 14; any case a test would not catch in 1, 15).
Separate spec and quality reviews (Codex astra → Claude Opus) for every task.

---

### Task 1: Contracts, readers and file overlay

**Files:**
- Create: `packages/core/src/blockEdit/types.ts`, `packages/core/src/blockEdit/grids.ts`,
  `packages/core/src/blockEdit/index.ts`, `packages/core/test/helpers/gbaTilesetProject.ts`
- Modify: `packages/core/src/index.ts`, `packages/core/src/config/engine.ts`, `packages/core/src/project.ts`,
  `packages/core/src/gbc/project.ts`, `packages/core/src/load/tilesetData.ts`, `packages/core/src/gbc/load/tileset.ts`
- Test: `packages/core/test/blockEdit/contracts.test.ts`; one new case in `packages/core/test/config/engine.test.ts`

**Interfaces (produced; later tasks use these names):**
- `interface TilesetFileEdit { path: string; before: Buffer; after: Buffer }` (`before` = baseline bytes when the
  owner first staged the path; kept across later edits of the same path)
- `class BlockEditRefusal extends Error { code: BlockEditCode }`, `type BlockEditCode = "BLOCK_CAP" | "SHARED_GRID" |
  "NO_FREE_TILE" | "RESERVED_TILE" | "LOCAL_SHEET_MISMATCH" | "ALL_WITH_SAVE_AS_NEW" | "NOT_OWNER" | "FILE_CHANGED" |
  "STALE" | "UNSAVED_BLOCK" | "TRIPLE_LAYER" | "SPLIT_LIMIT" | "BAD_VALUE" | "RESERVATIONS_UNREADABLE"`
- `type FileOverlay = ReadonlyMap<string, Buffer>`; `Project.setTilesetOverlay(o: FileOverlay): void`,
  `GbcProject.setTilesetOverlay(o: FileOverlay): void` (replace the overlay, clear tileset caches and the static
  usage relations of Task 5); tileset loaders read every tileset file (metatiles, attributes, collision, palette
  map, sheet PNG) through an injected `read(path): Buffer` that consults the overlay first
- `Project.tilesetPaths(symbol: string): TilesetPaths` (expose the private `tsPaths`; GBC `GbcTileset` already has
  `gfxPath`, `metatilesPath`, `collisionPath`, `palMapPath`)
- `type GridIds = readonly number[]` (row-major metatile ids of a map's grid; GBA masked by
  `blockMetatileIdMask`); `type StagedGrids = ReadonlyMap<string /* map name */, GridIds>`;
  `gbaGridIds(blocks: readonly { metatileId: number }[]): GridIds`, `gbcGridIds(blocks: readonly { metatileId:
  number }[]): GridIds` (session block objects → ids)
- `EngineProfile.tripleLayerMetatiles: boolean` (cfg key `enable_triple_layer_metatiles`, default `false`)
- Test helper `copyGbaTilesetProject(): string` (temp copy of the GBA subject's `data/tilesets`, `data/layouts`,
  `data/maps`, `include`, `src/data/tilesets`, `porymap.project.cfg`, and whatever `loadProject` needs; returns the
  root) and `removeGbaTemp(root)`

- [ ] **Step 1: Write failing tests**: `overlay changes a GBC render`: a PerfPlus metatiles overlay with block 1's
  bytes swapped for block 2's renders block 1 like block 2, and `setTilesetOverlay(new Map())` restores it;
  `overlay changes a GBA metatile` likewise; `overlay is consulted for the sheet PNG and palette map`;
  `tilesetPaths` returns the same paths `loadTileset` reads; `gbcGridIds` / `gbaGridIds` mask and order;
  `copyGbaTilesetProject` loads with `loadProject` and renders a layout; cfg `enable_triple_layer_metatiles=1` sets
  the flag.
- [ ] **Step 2: Run** `npx vitest run packages/core/test/blockEdit/contracts.test.ts` → FAIL.
- [ ] **Step 3: Implement.** No global state: the overlay lives on the project object.
- [ ] **Step 4: Run** the file and `npx vitest run packages/core` → PASS (the known env fail in engine.test stays).
  Mutations: loader bypasses `read` for the PNG (`overlay ... sheet PNG` red); cache not cleared on
  `setTilesetOverlay` (`restores it` red).
- [ ] **Step 5: Commit** `feat(plan-14.2): block-edit contracts, readers and tileset overlay (Task 1)`.

### Task 2: GBC lossless patchers

**Files:** Create `packages/core/src/blockEdit/gbcPatch.ts`; Test `packages/core/test/blockEdit/gbcPatch.test.ts`

**Interfaces:**
- Consumes: `parseMetatiles`, `encodeMetatiles`, `parsePaletteMap` (`gbc/load/tileset.ts`); Task 1 types.
- Produces:
  - `patchGbcMetatiles(buf: Buffer, id: number, tiles: readonly number[], path: string): Buffer` (16 ids; `id ===
    count` appends; `id > count` throws `BAD_VALUE`; count past 256 throws `BLOCK_CAP`)
  - `readGbcCollisionRecords(text: string): string[][]` (four argument names per `tilecoll` record, surplus included)
  - `patchGbcCollision(text: string, id: number, names: readonly [string, string, string, string], path: string):
    string` (replace record `id` in place; `id === records.length` appends a line in the file's style and EOL)
  - `patchGbcPaletteMap(text: string, tileId: number, palName: string, path: string): string`

- [ ] **Step 1: Write failing tests**: `no-op over the corpus` (every PerfPlus `*_metatiles.bin`, `*_collision.asm`,
  `*_palette_map.asm`, each record/tile 0 rewritten with its own value equals the original; `itWithGbcCorpus`);
  `metatile edit changes only bytes [16*id, 16*id+16)`; `append at count`; `BLOCK_CAP at 256`; `forest surplus`:
  record 40 changes, 64 records remain, every other byte identical; `append uses the file's EOL` (CRLF and LF
  fixtures); `palette name on a bank-1 line` (tile `$85`) changes only that name; `$60-$7F gap tile` and an unknown
  palette name throw `BAD_VALUE` naming the path.
- [ ] **Step 2: Run** `npx vitest run packages/core/test/blockEdit/gbcPatch.test.ts` → FAIL.
- [ ] **Step 3: Implement** with a line scanner over the original string; never re-serialize a parsed model.
- [ ] **Step 4: Run** → PASS. Mutations: record index off by one (`forest surplus`); LF-only append (`append uses the
  file's EOL`); whole-buffer re-encode (`no-op over the corpus`).
- [ ] **Step 5: Commit** `feat(plan-14.2): GBC lossless tileset patchers (Task 2)`.

### Task 3: GBC sheet PNG and runtime reservations

**Files:** Create `packages/core/src/blockEdit/gbcSheet.ts`; Test `packages/core/test/blockEdit/gbcSheet.test.ts`

**Interfaces:**
- Consumes: `readShadesPng`, `ShadeImage` (`gbc/load/png.ts`).
- Produces:
  - `encodeGrayPng(img: ShadeImage): Buffer` (colour type 0, depth 2, non-interlaced; shade s → gray `3 - s`)
  - `copySheetTile(png: Buffer, fromIndex: number, toIndex: number, path: string): Buffer` (sheet index, 16 per row;
    `from === to` returns `png`; a non-2-bit-grayscale source throws `BAD_VALUE` naming the path)
  - `parseGbcReservedTiles(roofsText: string, animsText: string, roofLength: number): Set<number>` (pure) and
    `loadGbcReservedTiles(root: string): Set<number>` (reads `engine/tilesets/mapgroup_roofs.asm`, the `ROOF_LENGTH`
    definition, `engine/tilesets/tileset_anims.asm`; missing file or no destination found throws
    `RESERVATIONS_UNREADABLE` naming the file). Roof range `$0a .. $0a + roofLength - 1`; `vTiles2 tile $XX` → `XX`;
    `vTiles5 tile $XX` → `$80 + XX`.

- [ ] **Step 1: Write failing tests**: `encode round-trip` for every PerfPlus `gfx/tilesets/*.png` (decode equal,
  header width/height/depth/colour type equal); `copy changes only the target tile` (all tiles compared);
  `no-op copy returns identical bytes`; `RGBA source refused`; pure parser on a synthetic fixture with a roof, a
  `vTiles2 tile $14` and a `vTiles5 tile $03` → `{$0a..$12, $14, $83}`; `loadGbcReservedTiles(PerfPlus)` contains the
  roof range from the subject's own `ROOF_LENGTH` and `$14`, not `$00`; a temp root without the anims file throws
  `RESERVATIONS_UNREADABLE`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**: `deflateSync`, filter 0 per row, CRC from `zlib.crc32` (Node ≥ 20.19 / 22.12), chunks
  IHDR, IDAT, IEND.
- [ ] **Step 4: Run** → PASS. Mutations: gray not inverted (`encode round-trip`); row stride off by one
  (`copy changes only the target tile`); vTiles5 not offset (synthetic `$83` case).
- [ ] **Step 5: Commit** `feat(plan-14.2): GBC sheet PNG writer and reserved tiles (Task 3)`.

### Task 4: GBA lossless patchers

**Files:** Create `packages/core/src/blockEdit/gbaPatch.ts`; Test `packages/core/test/blockEdit/gbaPatch.test.ts`

**Interfaces:**
- Consumes: `TileEntry` (`load/tilesetData.ts`), `EngineProfile`, `maskShift`.
- Produces:
  - `patchGbaMetatile(buf: Buffer, localIndex: number, entries: readonly TileEntry[], path: string): Buffer` (8
    entries, bottom 4 then top 4; tile 10 bits, palette 4 bits; append at count)
  - `patchGbaAttribute(buf: Buffer, localIndex: number, profile: EngineProfile, fields: { behavior?: number;
    layerType?: number }, path: string, cloneFrom?: number): Buffer` (width `profile.metatileAttributesSize`; append
    starts from word `cloneFrom`; a value outside its mask throws `BAD_VALUE`; unedited bits kept)
  - `assertNotTripleLayer(profile: EngineProfile, cfgPath: string): void` (throws `TRIPLE_LAYER`)

- [ ] **Step 1: Write failing tests**: `no-op over every GBA tileset` (each `metatiles.bin`,
  `metatile_attributes.bin` under `data/tilesets/**`, entry 0 rewritten equals the original); `metatile edit touches
  only 16 bytes`; `attribute edit keeps other bits` (all non-behavior bits set) for widths 2 and 4; `mask overflow
  refused`; `append clones the source word then applies fields`; `triple-layer refused`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS. Mutations: byte order swapped (`no-op`); mask without shift (`keeps other bits`);
  append ignores `cloneFrom` (`append clones`).
- [ ] **Step 5: Commit** `feat(plan-14.2): GBA lossless metatile/attribute patchers (Task 4)`.

### Task 5: Usage index (both families)

**Files:** Create `packages/core/src/blockEdit/usage.ts`; Test `packages/core/test/blockEdit/usage.test.ts`

**Interfaces:**
- Consumes: Task 1 (`tilesetPaths`, `StagedGrids`, overlay reset hook), GBC/GBA projects, `resolveSplit`.
- Produces (types in `types.ts`):
  - `interface MapUse { map: string; interior: number; border: number; block0AsBorder: number }`
  - `interface BlockUsage { files: string[]; tilesets: string[]; maps: MapUse[]; sharedGrids: { file: string; maps:
    string[] }[] }`
  - `gbcTilesetsForFile(proj: GbcProject, path: string): string[]`
  - `gbcBlockUsage(proj: GbcProject, metatilesPath: string, blockId: number, grids: StagedGrids): BlockUsage`
  - `gbcTileUsage(proj: GbcProject, palMapPath: string, tileId: number, grids: StagedGrids): { blocks: {
    metatilesPath: string; ids: number[] }[]; maps: string[] }`
  - `gbaConsumingLayouts(proj: Project, tilesetSymbol: string): { layout: string; role: "primary" | "secondary";
    split: Split; pairedWith: string }[]`
  - `gbaBlockUsage(proj: Project, tilesetSymbol: string, localIndex: number, grids: StagedGrids): BlockUsage`
- Caching: only **static relations** (file → tilesets → maps / layouts, grid-file sharing) are cached on the project
  and reset by `setTilesetOverlay`. Counts are computed per call from disk grids overridden by `grids`; nothing
  count-related is cached, so paint/fill/stamp/undo/redo/discard/save need no invalidation hook.

- [ ] **Step 1: Write failing tests** with an **independent oracle** in the test file (plain parsing of
  `data/maps/blocks.asm`, `.blk` files, `gfx/tilesets.asm`; GBA `layouts.json`, `map.bin`, border bins; no import of
  `usage.ts`): Cave/DarkCave shared metatiles (both tilesets, maps of both); `PortPassage.blk` counted once naming
  OlivinePortPassage and VermilionPortPassage; a map with raw block 0 interior cells; `gTileset_General` with layouts
  under both splits; `grids` override changes the count; two calls around a changed `grids` return different counts
  (no stale cache); `gbcTileUsage` with an override. Fixture maps found by scanning.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS. Mutations: shared grid counted per map (`PortPassage`); block-0 substitution ignored
  (`raw block 0`); relations keyed by tileset name (`Cave/DarkCave`); counts cached (`two calls`).
- [ ] **Step 5: Commit** `feat(plan-14.2): block usage index for both families (Task 5)`.

### Task 6: GBC edit planner and group placement

**Files:** Create `packages/core/src/blockEdit/placement.ts`, `packages/core/src/blockEdit/gbcOps.ts`; Test
`packages/core/test/blockEdit/placement.test.ts`, `packages/core/test/blockEdit/gbcOps.test.ts`

**Interfaces:**
- Consumes: Tasks 1-3, 5; `pngTileIndex`.
- Produces:
  - `placeGroup(squares: readonly number[], width: number, at: { x: number; y: number }, selectedSheetIndex: number,
    mode: "1x1" | "2x2" | "4x4", sheetCount: number, sheetToTileId: (i: number) => number | null): number[]`
    (source = selected + dy*16 + dx; skipped past the sheet end, past the 16-wide row edge, past the block edge, or
    unmapped; no wrap)
  - `gbcSheetToTileId(ts: GbcTileset): (sheetIndex: number) => number | null`
  - `interface GbcBlockDraft { tiles: number[] /*16*/; collision: [string, string, string, string]; palettes: {
    square: number; palName: string; scope: "all" | "local" }[] }`
  - `interface GbcBlockEditRequest { map: string; blockId: number; mode: "ok" | "saveAsNew"; from: "map" | "palette";
    cell?: { x: number; y: number }; draft: GbcBlockDraft }`
  - `interface BlockEditPlan { edits: TilesetFileEdit[] /* before = current effective bytes */; newBlockId?: number;
    placement?: { x: number; y: number; blockId: number }; warnings: string[]; usage: BlockUsage; confirm: boolean;
    revision: string }`
  - `resolveGbcEditTarget(proj: GbcProject, map: string, cell: { x: number; y: number }, grids: StagedGrids): {
    blockId: number; viaBorder: boolean }` (effective cell = staged grid if present; raw 0 → border block, Q8)
  - `blockEditRevision(files: ReadonlyMap<string, Buffer>, grid: GridIds): string` (sha1 over the edit's file set
    bytes and the map's grid; the popup's baseline token)
  - `planGbcBlockEdit(proj: GbcProject, req: GbcBlockEditRequest, staged: FileOverlay, grids: StagedGrids):
    BlockEditPlan` (pure; reads `staged` first, then disk; throws `BlockEditRefusal`)

- [ ] **Step 1: Write failing tests**: placement `2x2 at block edge clipped`, `4x4 across $5F/$80 continues at $80`,
  `past sheet end skipped`, `row edge not wrapped`. Planner (temp copy): `OK edits only block N's 16 bytes and
  collision record N`; `saveAsNew on forest replaces surplus record 40`; `saveAsNew from palette has no placement`;
  `saveAsNew on a shared grid refuses SHARED_GRID naming both maps`; `cap refuses BLOCK_CAP naming the file`;
  `All rewrites one tilepal name`; `Local copies to the lowest free non-reserved slot and repoints only this block's
  squares that used the tile`; `Local reuses an identical non-reserved copy`; `identical copy in a reserved slot is
  not reused`; `Local on reserved source refuses RESERVED_TILE`; `Local with no free slot refuses NO_FREE_TILE
  naming the sheet` (synthetic full sheet); `Local on Cave metatiles refuses LOCAL_SHEET_MISMATCH naming TilesetCave
  and TilesetDarkCave`; `palette-map-only mismatch also refuses` (synthetic alias sharing metatiles and sheet but not
  palette map); `free-slot scan counts blocks of every metatiles file loaded with the sheet, staged ones included`;
  `reservations unreadable: Local refuses RESERVATIONS_UNREADABLE, All still plans`; `All + saveAsNew refuses
  ALL_WITH_SAVE_AS_NEW`; `mixed draft`: one OK with an All change on square 0 and a Local change on square 5 yields
  edits whose bytes equal independently computed expectations (palette map, PNG, metatiles); `confirm` true exactly
  when another map draws the block (interior, border, block-0-as-border) or, for All, another map draws a block using
  the tile, false for same-map-only uses; `painted cell targets its staged block`; `raw block 0 cell targets the
  border block`; staged bytes compose (two plans in a row).
- [ ] **Step 2: Run** both files → FAIL.
- [ ] **Step 3: Implement.** Free slot per Q11.
- [ ] **Step 4: Run** → PASS. Mutations: reserved check removed (`RESERVED_TILE`); one-sheet rule removed
  (`LOCAL_SHEET_MISMATCH`); free-slot scan ignores staged bytes (`staged ones included`); confirm counts same-map uses
  (`confirm ... false for same-map-only`).
- [ ] **Step 5: Commit** `feat(plan-14.2): GBC block edit planner and group placement (Task 6)`.

### Task 7: GBA edit planner

**Files:** Create `packages/core/src/blockEdit/gbaOps.ts`; Test `packages/core/test/blockEdit/gbaOps.test.ts` plus a
synthetic fixture project under `packages/core/test/fixtures/blockEdit/gba/` (mark `-text` in `.gitattributes`)

**Interfaces:**
- Consumes: Tasks 1, 4, 5, `placeGroup`, `blockEditRevision`, `BlockEditPlan` (Task 6), split resolution as in
  `render/metatile.ts`.
- Produces:
  - `interface GbaBlockDraft { entries: TileEntry[] /*8*/; behavior: number; layerType: number }`
  - `interface GbaBlockEditRequest { map: string; metatileId: number /* map-visible */; mode: "ok" | "saveAsNew"; from:
    "map" | "palette"; cell?: { x: number; y: number }; draft: GbaBlockDraft }`
  - `planGbaBlockEdit(proj: Project, req: GbaBlockEditRequest, staged: FileOverlay, grids: StagedGrids): BlockEditPlan`
  - `gbaCrossHalfWarnings(proj: Project, tilesetSymbol: string, draft: GbaBlockDraft, original: readonly TileEntry[]):
    string[]` (only changed entries judged; warns when a selection resolves to different data in different
    consuming layouts, naming them)

- [ ] **Step 1: Write failing tests.** Synthetic fixture (deterministic, no skips): one primary consumed under two
  splits, two secondaries, a secondary paired with two primaries, a layout grid shared by two maps. Cases: `OK edits
  entry N and attribute word N only`; `primary edit allowed; usage counts every paired layout` (Q1); `saveAsNew
  appends at the file-local index; map-visible id = split.metatiles + index for a secondary, under each split`;
  `saveAsNew keeps the cell's collision and elevation` (both splits); `saveAsNew from palette appends only`;
  `saveAsNew on the shared grid refuses SHARED_GRID`; `append limit refuses SPLIT_LIMIT under the tighter split`;
  `structural refusal`: a tile or palette outside some consuming layout's range refuses `SPLIT_LIMIT` naming the
  layout; cross-half warnings for: primary picks a secondary-range tile; primary picks a secondary-range palette only;
  secondary picks a primary-range tile while paired with two primaries; **no** warning when the source is identical
  in every consuming layout; `existing palette 13-15 / cross-half entries untouched keep their bytes and warn
  nothing`; `triple-layer project refuses TRIPLE_LAYER`. Two subject smoke cases (read-only): planning an unchanged
  draft for one `gTileset_General` block returns edits whose `after` equals `before`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS. Mutations: secondary id without split offset (`map-visible id`); limit from one split
  (`tighter split`); palette ignored in the cross-half check (`palette only`); attribute append without clone
  (`keeps ... collision and elevation` / attribute bytes).
- [ ] **Step 5: Commit** `feat(plan-14.2): GBA block edit planner (Task 7)`.

### Task 8: Core save integration

**Files:** Create `packages/core/src/blockEdit/save.ts`; Modify `packages/core/src/write/save.ts`,
`packages/core/src/gbc/write/save.ts`; Test `packages/core/test/blockEdit/save.test.ts`

**Interfaces:**
- Consumes: `TilesetFileEdit`, usage relations (Task 5), `AtomicEntry`, `planFingerprint`.
- Produces:
  - Session field on both `EditSession` and `GbcEditSession`: `tilesetEdits?: TilesetFileEdit[]` (one per path)
  - `mergeTilesetEdits(prior: readonly TilesetFileEdit[] | undefined, next: readonly TilesetFileEdit[]):
    TilesetFileEdit[]` (keeps the first `before` per path, takes the latest `after`)
  - `checkTilesetBaselines(root: string, edits: readonly TilesetFileEdit[]): void` (throws `FILE_CHANGED` naming the
    file when disk bytes differ from `before`)
  - `tilesetEffects(proj, edits): { path: string; maps: string[] }[]` per family (GBA and GBC variants)
  - Plans (`planSave`, `planGbcSave`) gain `tilesetEffects` and list each changed tileset path as a change; a
    baseline mismatch becomes a refusal `file-changed-on-disk` naming the file. `prepareSave` / `prepareGbcSave` add
    one `AtomicEntry { path, before, after }` per changed path. Commit requires **exactly one** prepared entry per
    changed tileset path whose `before`/`after` equal the session's (missing, duplicate or stale → refuse, as
    `gbc/write/save.ts:239-245` does for constants), then re-checks baselines.

- [ ] **Step 1: Write failing tests** (temp copies, both families): plan lists tileset changes with `tilesetEffects`
  naming the maps; commit writes grid + tileset files in one atomic set; `plan → external edit → commit` refuses
  `FILE_CHANGED` naming the file and writes nothing (byte-compare every file); missing / duplicate / stale prepared
  entry refuses; a failed atomic write (injected `AtomicIo`) leaves disk unchanged and the session's
  `tilesetEdits` intact; an edit restored to its original bytes (`after === before`) writes nothing for that path;
  `mergeTilesetEdits` keeps the first baseline.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS, plus `npx vitest run packages/core/test/write packages/core/test/gbc/write`.
  Mutations: commit skips the baseline re-check (`plan → external edit → commit`); prepared-entry match skipped
  (`stale prepared entry`); merge keeps the latest `before` (`keeps the first baseline`).
- [ ] **Step 5: Commit** `feat(plan-14.2): tileset edits in the save set (Task 8)`.

### Task 9: Hub ownership, undo/redo and paint guards

**Files:** Create `packages/server/src/blockEditOwnership.ts`; Modify `packages/server/src/editSessions.ts`,
`packages/server/src/gbcEditSessions.ts` (snapshot includes `tilesetEdits`), `packages/server/src/index.ts`,
`packages/server/src/gbcEditRoutes.ts` (redo reacquire; paint/fill/stamp guards; another map's Save excludes);
Test `packages/server/test/blockEditOwnership.test.ts`

**Interfaces:**
- Consumes: Task 8; 14.1 `requireHeaderOwnership` pattern (`addEventRoutes.ts:78`); `EditCommandStack`.
- Produces:
  - `ownedTilesetPaths(entry): Set<string>` = paths in the current session's `tilesetEdits` **or in any snapshot on
    the undo side of its history** (ownership follows history, not bytes: edit → inverse edit keeps it)
  - `requireTilesetOwnership(entries: Iterable<[string, entry]>, mapName: string, paths: readonly string[]): void`
    (`NOT_OWNER`: `"<path>: <owner> has unsaved block edits to this file; save, undo or discard them there first"`)
  - `stageTilesetPlan(store, mapName, plan: BlockEditPlan, label: string): SessionPayload` (ownership check, merge
    edits, apply placement to the grid, push **one** `snapshotCommand`; used by Task 11 and by Task 10 tests)
  - Redo: before restoring, `requireTilesetOwnership` and `checkTilesetBaselines` for every path in the target
    snapshot; on refusal, history and bytes unchanged
  - `refuseUnsavedBlockRefs(entries, mapName, metatilesPath, savedCount, ids: Iterable<number>): void`
    (`UNSAVED_BLOCK` naming the owner) wired into both families' paint begin/apply, fill and stamp routes

- [ ] **Step 1: Write failing tests** (temp copies, both families): A stages, B's stage on the same file refuses
  naming A, B and the file; edit → inverse edit → B refused (A still owns), then A undoes twice → B stages; A partial
  undo keeps ownership; A undoes everything → released; A redo after B staged refuses `NOT_OWNER`, A's history and
  bytes unchanged; B saves, then A redo refuses `FILE_CHANGED`; B's Save while A owns writes none of A's files; B
  paints / fills / stamps an id ≥ saved count of a file A owns → `UNSAVED_BLOCK` naming A; A's Discard leaves no
  session referencing a missing id; one `stageTilesetPlan` = one undo step reverting tileset + grid.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS. Mutations: ownership by bytes instead of history (`edit → inverse edit`); redo skips
  baseline check (`A redo refuses FILE_CHANGED`); paint guard in one family only (`UNSAVED_BLOCK` in both).
- [ ] **Step 5: Commit** `feat(plan-14.2): tileset ownership, redo reacquire, paint guards (Task 9)`.

### Task 10: Overlay lifecycle, caches and versioned URLs

**Files:** Create `packages/server/src/tilesetOverlay.ts`; Modify `packages/server/src/index.ts`,
`packages/server/src/gbcRoutes.ts`, `packages/server/src/gbcEditRoutes.ts`, `packages/ui/src/gba/mapSurface.tsx`,
`packages/ui/src/gbc/mapSurface.tsx`, `packages/ui/src/gba/worldSurface.tsx`, `packages/ui/src/gbc/worldSurface.tsx`,
`packages/ui/src/components/MetatilePalette.tsx`, `packages/ui/src/gbc/GbcMetatilePalette.tsx`, the family runtime
that holds session payloads (`shell/FamilyApp.tsx` runtime / `shared/useEditSessionCore.ts`)
Test `packages/server/test/tilesetOverlay.test.ts`; new cases in the palette and surface tests

**Interfaces:**
- Consumes: Tasks 1, 9 (`stageTilesetPlan`, `ownedTilesetPaths`).
- Produces:
  - `syncTilesetOverlay(store, project, caches): number` (union of every session's `stagedTilesetBytes` across all
    owners → `project.setTilesetOverlay`; clears GBA `pngCache`, GBC `renderCache`, `metatileCache`, warp and
    coverage caches; increments and returns the hub's `tilesetVersion`) called after stage, undo, redo, discard,
    save (success and failure) in both families
  - `tilesetVersion: number` in every session payload and in the map GET payload, read by the family runtime into
    one state value; URL builders append `tv=<tilesetVersion>` to `/api/render/...`, `/api/metatile/...` and world
    tile URLs (`imageUrl(name, version)` callers pass it through; `useWorldTiles` gets it via its `imageUrl`)

- [ ] **Step 1: Write failing tests**: hub (temp copies): two owners of different files both render staged; an edit
  to Cave renders through DarkCave on a map opened after; undo, redo and discard each bump the version and the
  metatile PNG bytes follow the session; a **successful** save keeps the new pixels with a new version; a **failed**
  save keeps the staged pixels; UI: palette `src` and map/world image URLs contain `tv=` and change when the payload's
  `tilesetVersion` changes, for an already-open canvas.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** new tests, then `npx vitest run packages/ui` (exact-URL mocks across the UI suite, LESSONS) →
  PASS; existing mocks updated only where the URL gains `tv=`, listed in the report. Mutations: skip
  `metatileCache.clear()` (`metatile PNG bytes follow`); no bump on undo (`undo ... bump`); overlay from one owner
  only (`two owners`).
- [ ] **Step 5: Commit** `feat(plan-14.2): staged tileset overlay lifecycle and versioned URLs (Task 10)`.

### Task 11: Hub block-editor routes

**Files:** Create `packages/server/src/blockEditRoutes.ts`; Modify `packages/server/src/index.ts`,
`packages/server/src/gbcEditRoutes.ts` (mount under each family's edit base); Test
`packages/server/test/blockEditRoutes.test.ts`, `packages/server/test/gbcBlockEditRoutes.test.ts`

**Interfaces:**
- Consumes: Tasks 5-10.
- Produces (under the family's existing edit base, so `useEditSessionCore.post` reaches them as
  `/<map>/block/...`; errors `{ error, code }`):
  - `GET <edit base>/<map>/block?block=<id>` or `?x=&y=` → `{ blockId, viaBorder, revision, block, sheet: { url:
    "/api/block-sheet/<map>.png?tv=<v>", tileCount, validTiles: number[], reservedTiles?: number[] }, options: {
    collision?: string[]; palettes?: string[]; behaviors?: { name: string; value: number }[]; layerTypes?: { name:
    string; value: number }[] }, usage, owner: string | null, limits: { nextId: number | null; cap: number } }`
  - `GET /api/block-sheet/<map>.png` → the map's tile sheet rendered with its palettes (GBC: map/time palettes; GBA:
    the layout's primary+secondary tiles with their palettes), one picker cell per valid tile
  - `POST <edit base>/<map>/block/check` `{ request, revision }` → `{ usage, confirm, warnings, refusal?: { code,
    error } }`; never touches the session or history
  - `POST <edit base>/<map>/block/preview` `{ request }` → PNG of the draft with the map's context
  - `POST <edit base>/<map>/block/apply` `{ request, revision }` → session payload via `stageTilesetPlan`; `STALE`
    (409) when the current `blockEditRevision` differs from `revision`
  - 404 unknown map; 400 malformed body naming the field

- [ ] **Step 1: Write failing tests** (temp copies, both families): happy paths; `check` and `preview` leave the
  session JSON and history length byte-identical; `check.confirm` per the Task 6 predicate; GBA cross-half warning
  surfaces; `apply` saveAsNew places on the cell, one undo reverts tileset + grid; `apply` from a non-owner → 409
  `NOT_OWNER`; `apply` after an external file change or a paint since GET → 409 `STALE` and nothing staged; malformed
  draft (15 tiles, unknown collision name, value over mask) → 400 naming the field; `preview` of an unchanged draft
  equals the canvas render of that block for the map's context; `block-sheet` cell count equals `tileCount`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS. Mutations: apply skips ownership (`NOT_OWNER`); revision check skipped (`STALE`);
  check stages (`check ... byte-identical`); preview ignores map palettes (`preview ... equals the canvas`).
- [ ] **Step 5: Commit** `feat(plan-14.2): block editor hub routes (Task 11)`.

### Task 12: UI mutation transport and Save dialog effects

**Files:** Modify `packages/ui/src/shared/useEditSessionCore.ts`, `packages/ui/src/shell/FamilyApp.tsx` (switch
wait), `packages/ui/src/components/SaveDialog.tsx`; Test `packages/ui/test/shared/useEditSessionCore.blockEdit.test.tsx`,
one new case in `packages/ui/test/SaveDialog.test.tsx`

**Interfaces:**
- Consumes: Task 11 routes.
- Produces:
  - `post` treats `/block/apply` like `/event/create`: structured error body, registered in the pending-mutation
    registry; `eventCreateBarrier` generalized to `sessionMutationBarrier(mapName)` (rename, keep the old name as an
    alias if callers outside this file use it) that undo, redo, Discard, Save (plan and commit) and map switch await
  - `post` for `/block/check` and `/block/preview` is read-only: not registered, never invalidates
  - SaveDialog lists each tileset file with "affects: <maps>" from the plan's `tilesetEffects`

- [ ] **Step 1: Write failing tests** with deferred fetch responses: a pending `/block/apply` delays undo, redo,
  Discard, Save plan, Save commit and map switch until it settles (each asserted by request order); a 409 surfaces
  `{ code, error }` as `EditSessionError`; a response arriving after the dialog closed or the map switched is dropped
  (`isCurrent`); a stale `check` response after a newer one is ignored by the caller contract (`ticket.seq`);
  SaveDialog renders the tileset rows with their maps.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the files, then `npx vitest run packages/ui` → PASS. Mutations: Discard does not await the
  barrier (`delays ... Discard`); switch does not await (`map switch`); apply not structured (`409 surfaces`).
- [ ] **Step 5: Commit** `feat(plan-14.2): block-edit mutation barrier and Save dialog effects (Task 12)`.

### Task 13: BlockEditorDialog and family specs

**Files:** Create `packages/ui/src/shared/BlockEditorDialog.tsx`, `packages/ui/src/shared/blockEditor/TilePicker.tsx`,
`packages/ui/src/shared/blockEditor/BlockGrid.tsx`, `packages/ui/src/shared/blockEditor/useBlockEditor.ts`; Modify
`packages/ui/src/shell/adapter.ts`, `packages/ui/src/gba/adapter.tsx`, `packages/ui/src/gbc/adapter.tsx`,
`packages/ui/src/styles.css`; Test `packages/ui/test/shared/BlockEditorDialog.test.tsx`

**Interfaces:**
- Consumes: Tasks 11-12, `placeGroup` (Task 6), `trapDialogFocus` / `useRestoreFocus` (`shared/dialogFocus.ts`).
- Produces:
  - `interface BlockEditorSpec { family: "gba" | "gbc"; width: 4 | 2; layers: 1 | 2; squareControls: ("palette" |
    "flip")[]; blockFields: { key: string; label: string; optionsKey: "collision" | "behaviors" | "layerTypes" }[];
    modes: ("1x1" | "2x2" | "4x4")[] }` on `EngineAdapter.blockEditorSpec(ctx)`. GBC: width 4, layers 1,
    `["palette"]`, four collision quadrants, all three modes. GBA: width 2, layers 2, `["palette", "flip"]`, behavior
    and layer type (numeric values from `options`), modes `["1x1", "2x2"]`
  - `BlockEditorDialog({ map, target: { block: number } | { x: number; y: number }, from: "map" | "palette", spec,
    onClose, onApplied })`
- Behaviour (spec "Shell and UI"): large preview (debounced `/block/preview`), sheet picker at 2x with `Tile: $XX`
  hover, Ctrl / Ctrl+Shift with "Place 2x2" / "Place 4x4" heading, GBA layer tabs with per-square palette and X/Y
  flip, GBC palette dropdown + All/Local prompt, usage line, warnings (cross-half; block 0 "This cell is block 0;
  editing the border block $XX"), OK → `check` → confirm step when `confirm` → `apply`, Save as new → `check` →
  `apply` (disabled with the refusal text when `check` refuses), typed dropdowns with text-box fallback like 14.1,
  topmost-Escape rule, focus trap; `revision` from GET sent with check/apply; `STALE` shows "The block changed since
  this editor opened; reopen it" and keeps the draft.

- [ ] **Step 1: Write failing tests** (fetch mocks): both specs render (GBA flip and palette controls present, GBC
  four collision dropdowns); Ctrl+click and Ctrl+Shift+click place via `placeGroup`; palette change asks All/Local
  and sends the scope; typed option values sent as numbers (GBA) / names (GBC); unknown value falls back to a text
  box; OK with `confirm: true` shows the list and Cancel returns with the draft and no apply; OK with `confirm:
  false` applies once; Save as new refusal text shown and disabled; block-0 notice; `STALE` message keeps the draft;
  Escape closes only the topmost layer; Tab stays inside the dialog.
- [ ] **Step 2: Run** `npx vitest run packages/ui/test/shared/BlockEditorDialog.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, then `npx vitest run packages/ui` → PASS. Mutations: confirm skipped (`Cancel returns
  ... no apply`); scope defaulted silently (`asks All/Local`); revision not sent (`STALE`).
- [ ] **Step 5: Commit** `feat(plan-14.2): shared BlockEditorDialog and family specs (Task 13)`.

### Task 14: Entry points: map context menu, Edit block tool, palette

**Files:** Create `packages/ui/src/shared/MapContextMenu.tsx` (reuse `WorldContextMenu`'s clamping, Escape, aria-modal
and keyboard-echo rules; extract a shared helper only if both callers use it unchanged); Modify
`packages/ui/src/canvas/MapSurface.tsx`, the `MapCanvasViewport` it renders (new `onContextMenu` prop),
`packages/ui/src/components/Toolbar.tsx`, `packages/ui/src/components/toolIcons.tsx`, `packages/ui/src/shell/adapter.ts`
(`ALL_TOOLS`, capability `blockEditor`), `packages/ui/src/gbc/GbcMapEditing.tsx`, `packages/ui/src/hooks/useMapEditing.ts`,
`packages/ui/src/components/MetatilePalette.tsx`, `packages/ui/src/gbc/GbcMetatilePalette.tsx`; Test
`packages/ui/test/shared/MapContextMenu.test.tsx` and new cases in the surface, toolbar and palette tests

**Interfaces:** tool kind `"editBlock"`, label "Edit block", key `K` unless already bound (check `TOOL_KEY`).

- [ ] **Step 1: Write failing tests**: right-click an interior cell at zoom 1 and 3 after a pan opens the menu for that
  cell's block (GBC: an event-quadrant click maps to its block; over an event overlay too); the `contextmenu` event
  is `defaultPrevented`; no paint POST, no event placement, and the pan offset is unchanged after the gesture;
  outside the interior the item is disabled; disabled while a barrier is pending; Escape, a click elsewhere and a
  map switch close it; the Edit block tool click opens the dialog in both families; palette right-click opens it with
  `from: "palette"`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the files, then `npx vitest run packages/ui` → PASS. Mutations: `preventDefault` removed
  (`defaultPrevented`); right button reaches the paint path (`no paint POST`); quadrant mapping off (`event-quadrant`).
- [ ] **Step 5: Commit** `feat(plan-14.2): Edit block entry points in both families (Task 14)`.

### Task 15: Live acceptance on scratch copies

**Files:** Create `docs/superpowers/task-reports/pokemap-plan-14-2-block-editor/task-15-live.md` and a driver script
there; Modify `packages/ui/DESIGN.md` (shared-module rows), `docs/superpowers/RESUME.md` (status)

- [ ] **Step 1:** Copy both subjects to scratch (never the real ones); start a hub on each copy on fresh ports (not
  5183/5184) and Vite; headless Playwright.
- [ ] **Step 2:** Walk spec Acceptance 1-6 and 3a-3e in both families: context menu, tool and palette; preview equals
  canvas (pixel compare); OK on an aliased tileset redraws the other alias and a map opened afterwards; map canvas,
  thumbnails and world tiles refetch (`tv=` changes); Save as new from map and palette; All and Local palette; block
  0 notice; cross-half warning; confirm step; ownership refusal in a second map; undo / redo / Discard / Save;
  byte-compare saved files against the patcher expectations.
- [ ] **Step 3:** `make` on the scratch copies if the toolchain exists; else record "not run: no rgbasm /
  arm-none-eabi-gcc".
- [ ] **Step 4:** Real subjects unchanged (HEADs, porcelain counts, manifest hashes); gate.
- [ ] **Step 5: Commit** `docs(plan-14.2): live acceptance (Task 15)`.

### Task 16: Final review

- [ ] Ask the user GPT Astra or Claude Opus (header "Reviewer"); review `3f4a762..HEAD`; fix rounds with scoped
  re-review; gate; stop for the user before any push, PR or merge.
