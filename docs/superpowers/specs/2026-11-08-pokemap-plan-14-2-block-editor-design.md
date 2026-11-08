# Plan 14.2: Block editor in both families (design)

Status: **DRAFT, not approved.** Written by the Plan 14 conductor (session 4, 2026-11-08) while the user was away,
from the accepted playback (ledger "Decisions", roadmap D20), then revised after a Codex `gpt-6-astra` draft review
(10 Important, 3 Minor, all folded in below). Open questions Q1-Q10 need the user's answers before the plan is
written. Tier: **High** (writes tileset data shared by many maps; binary and `.asm` formats that corrupt silently;
Save/undo ownership across sessions; render caches; shared shell UI). Branch: after 14.1 merges.

## Intent

Roadmap D7 asked for a GBC metatile-collision editor. D20 widened it: a Polished-Map-style **Edit Block** popup in
both families. The user picks a block on the map (or in the block palette), sees it drawn, places tiles from the
tileset into it, sets its collision (GBC) or behavior/layer (GBA), and either changes that block **everywhere** it is
used (OK) or **saves it as a new block** id. Edits are pending and undoable until the normal Save.

Today nothing writes tileset data. GBC has `encodeMetatiles` (`core/src/gbc/load/tileset.ts`) with no caller; GBA has
no metatile or attribute encoder. GBA per-square collision painting (`core/src/edit/paint.ts` `paintCells`) edits map
cells, not tilesets, and stays as it is (D20).

**Success:** in either family the user edits a block's tiles and collision/behavior, sees every open view of maps using
that data redraw, undoes and redoes it, saves through the normal Save dialog (which lists the tileset files and the
maps affected), and the game builds and shows the new block.

## Accepted playback (user, 2026-11-02; binding)

- **P1** Popup over the map, opened on a block (map canvas or palette): the block drawn large, a tile picker showing the
  tileset's tiles, click a tile then click a square of the block to place it.
- **P2 GBC:** 4x4 tiles per block; four collision dropdowns (one per 2x2 quadrant) of the project's collision
  constants.
- **P3 GBA:** 2x2 tiles x 2 layers (bottom, top); per tile palette and X/Y flip; metatile behavior and layer type
  dropdowns.
- **P4 Usage warning** before OK: uses of this block on this map, on other maps, and the maps sharing the tileset.
- **P5 OK** edits the block everywhere it is used. **Save as new block** appends a new block id (GBC cap 256 per
  blockset; GBA per primary/secondary limit) and puts the new block on the clicked map cell.
- **P6** Pending and undoable until Save, like other edits.

## Design (conductor's calls; each open point is a Q below)

### Identity: physical files, not tileset names

- Tilesets alias files. PerfPlus `gfx/tilesets.asm:90-95`: `TilesetCaveMeta::` / `TilesetDarkCaveMeta::` share
  `cave_metatiles.bin`, and the two `...Coll::` labels share `cave_collision.asm`. Sets may overlap partially.
- Every usage count, ownership check, staged read and cache invalidation is keyed by the **resolved file path** (GBC:
  from the `INCBIN` / `INCLUDE` under each tileset's labels; GBA: each tileset header's `metatiles` /
  `metatileAttributes` paths), never by tileset name. Acceptance includes an edit made through one alias and observed
  through the other.

### Data (per family, core)

- **GBC block** = 16 tile ids (`*_metatiles.bin`, 16 bytes per block) + 4 collision names (`*_collision.asm`,
  `tilecoll TL, TR, BL, BR`, one record per block **by index**). Collision files may hold **more records than blocks**
  (`forest`: 40 metatiles, 64 `tilecoll` records; `gbc/load/tileset.ts` trims the surplus on load). New block id N
  therefore **replaces record N** when it exists and appends only past the end; surplus records and all other text
  (comments, blank lines, CRLF) are preserved byte for byte.
- GBC tile palettes are per **tile**, tileset-wide (`gfx/tilesets/*_palette_map.asm` `tilepal`), not per block: the popup
  shows each tile in its palette and does not edit palettes (Q2). Valid tile ids are those `pngTileIndex` maps (low 7
  bits < 0x60, bank from the palette map) **and** inside the tileset sheet's real bounds.
- **GBC block 0** is special: map rendering substitutes the map's border block for raw block 0
  (`gbc/render/map.ts`), thumbnails draw raw block 0, and the engine special-cases block 0 in collision
  (`home/map.asm`). Which block a click on such a cell edits, and how raw vs displayed vs border uses count, is Q8.
- **GBA metatile** = 8 tile entries (`metatiles.bin`, u16: tile 10 bits, X flip, Y flip, palette 4 bits; bottom layer 4
  then top layer 4) + one attribute word (`metatile_attributes.bin`, 16 or 32 bits per the engine profile). The editor
  changes only the behavior and layer-type **fields** through the profile masks (`config/engine.ts`): a value must fit
  its mask, every other bit and the word width are preserved.
- **GBA splits are per layout, not global.** The subject has an Emerald split (512 tiles / 512 metatiles / 6 palettes in
  the primary) and an FRLG/HNS split (640 / 640 / 7) (`include/fieldmap.h`; `load/layouts.ts` resolves each layout's
  split). Append limits, new ids and the ownership of an id (primary or secondary) are computed for **every layout that
  consumes the tileset**; a tileset consumed under two different splits refuses edits that would be valid under only one.
- **GBA dependencies cross the split both ways:** a primary metatile's tile may use a secondary palette, and a secondary
  metatile depends on its paired primary's tiles (`render/metatile.ts`, `src/fieldmap.c`). The picker offers the tile
  range and palettes actually loaded for that layout (absolute palette indexing, sheet bounds); existing entries that
  already use palettes 13-15 or a cross-half tile are preserved as they are, and Q7 decides whether new selections may
  create such dependencies.
- **Triple-layer GBA metatiles** are detected from the project's configuration (porymap `enable_triple_layer_metatiles`
  or the engine profile), not from file sizes; such a project refuses the block editor naming the file.
- New encoders, each a **lossless patch** of the file, not a re-serialization of the parsed model: GBC collision text
  (replace record N's arguments in place, keep everything else), GBC metatiles (`encodeMetatiles` over the original
  buffer, only block N's 16 bytes change), GBA metatiles + attributes (only entry N's bytes change, masked fields only).
  Tests: a no-op patch returns identical bytes for every tileset file in both subjects, and an edit changes only the
  target span.
- **Usage index:** file -> tilesets -> maps (GBC `map.tileset`; GBA layout -> primary/secondary), and per block id the
  count of **interior** cells per map plus **border** references, separately; a map's block grid shared by aliases
  (`PortPassage.blk` used by OlivinePortPassage and VermilionPortPassage, `data/maps/blocks.asm`) counts once per file
  and names all its maps. Counts are recomputed after any staged grid edit (paint, Save-as-new placement) and cached
  per project generation.

### Session ownership, Save and undo

- A tileset edit is staged in a **tileset session** keyed by the resolved tileset files, not in one map's session,
  because every map using those files changes (Q3).
- Draft rule (Q3 decides): **one owner at a time per tileset file**, the 14.1 constants-header rule. The map whose
  popup made the first staged edit owns it; its Save writes the tileset files with its own files in one set; its
  undo/redo history holds the combined command; its Discard restores both. Another map's edit to those files refuses
  naming both maps and the files until the owner saves, undoes or discards. Another map's Save does not include them.
  A map that is not the owner but references an appended block id (only possible on the owner's own grid in 14.2)
  cannot exist before the owner saves.
- Every staged edit records an immutable baseline (bytes and fingerprint of each file when opened); plan rejects a
  stale preview; commit re-checks fingerprints (external change -> refusal naming the file); create/edit requests go
  through the same action barriers as 14.1 (Save, Discard, undo, redo, switch wait); a failed write keeps the staged
  edit. The atomic writer's documented limits (crash/race windows and rollback failure, `core/src/write/atomic.ts`)
  apply and are restated in the Save dialog notes as today.
- One OK = one undo command; one Save-as-new = one undo command covering the tileset bytes **and** the grid change;
  the snapshot holds everything it touched.

### Rendering and caches

- After edit, undo, redo, discard, a successful save and a failed save, every view of every map using the changed
  files redraws from the staged data: map canvas, block palette thumbnails (`/api/metatile/...` URLs carry a staged
  version so the browser refetches), world view tiles (versioned URLs; `canvas/useWorldTiles.ts`), the hub's cached
  tileset objects (`project.ts`, `gbc/project.ts`) and pre-render PNGs, including views opened later and views reached
  through an alias.
- The popup preview renders through the family renderer **with the map's context** (GBC map/time palettes and roof
  substitution, `gbc/render/map.ts`; GBA the layout's primary/secondary pair), so it matches the canvas.

### Shell and UI

- Shared `shared/BlockEditorDialog.tsx`: modal, focus trap and topmost-Escape rule as `AddEventDialog`; family field
  data through the engine adapter (`blockEditorSpec(ctx)`: grid size, layers, per-tile controls, attribute
  dropdowns). Opened from the map (Q5) and from the block palette.
- Tile picker: the tileset's valid tiles at 2x, hover shows `Tile: $XX`, click selects; click a block square places it.
- Collision / behavior / layer dropdowns list typed option sets parsed from the project (GBC collision constants,
  `parseCollisionConstants`; GBA `MB_*` behaviors and `METATILE_LAYER_TYPE_*`), text box fallback like 14.1.
- Usage line under the preview: "Used N times on this map (+ border), M times on K other maps; files shared by
  tilesets T1, T2; J maps affected" (P4), always visible, plus Q4's confirm step.

## Open questions (need the user)

- **Q1 GBA primary tilesets.** Editing a primary metatile changes every map on every secondary that pairs with that
  primary (e.g. `gTileset_General`). Allow it with the usage warning, or limit edits to secondary metatiles?
  (Conductor lean: allow; the warning shows the count.)
- **Q2 GBC palettes.** Leave tile palettes read-only in 14.2, or add a per-tile palette dropdown that edits the palette
  map (changes every block using that tile)? (Lean: read-only.)
- **Q3 Ownership.** One owner per tileset file as drafted above, or a shared tileset session that every affected map's
  Save includes? (Lean: one owner.)
- **Q4 Confirm on OK.** Always-visible usage line only, or also a confirm step when other maps use the block?
- **Q5 Entry point on the map.** A new "Edit block" tool, a right-click context menu, or double-click with the select
  tool?
- **Q6 Multi-place.** Single-tile placement only, or Polished Map's 2x2 / 4x4 placement modifiers too?
- **Q7 GBA cross-half dependencies.** May a new tile or palette selection make a primary metatile depend on a secondary
  tile or palette (it breaks on other secondaries), or a secondary metatile on a non-paired primary? Refuse, or allow
  with a warning? (Lean: refuse new ones; keep existing ones.)
- **Q8 GBC block 0.** A click on a cell whose raw block is 0 shows the border block. Edit block 0 itself, edit the
  border block, or refuse block 0? (Lean: edit what is drawn, the border block, and say so.)
- **Q9 Save as new from the palette.** There is no clicked cell: append only (no placement), or disable Save as new
  from the palette?
- **Q10 Save as new on a shared grid.** Placing the new block on a cell of a `.blk` shared by several maps changes all of
  them: allow with the alias names in the warning, or refuse?

## Out of scope

- Editing tile graphics (pixels) or palette colours; adding tiles; tileset animations.
- GBA triple-layer metatiles (refused, detected from configuration).
- Deleting or reordering blocks (ids are referenced by every `.blk` / blockdata).
- Polished Crystal style per-block attribute files (`*_attributes.bin`): neither subject uses them.

## Acceptance (draft)

1. Both families: popup opens from the map and the palette; preview matches the canvas pixel-for-pixel for the same
   map context.
2. OK edits the block everywhere: every view redraws, including an alias tileset and a view opened afterwards; Save
   writes only the tileset files, changing only the edited block's bytes/record; undo, redo, Discard and a failed save
   restore or keep state exactly.
3. Save as new appends id N (GBC replaces surplus collision record N), refuses at the cap/limit naming the file, places
   it on the clicked cell; Save writes the tileset files and the grid in one atomic set; one undo reverts both.
4. Usage counts (interior, border, aliases, shared grids) match an independent scan of both subjects.
5. Ownership refusal names both maps and the files; stale fingerprint / external change refuses at commit naming the
   file; unrelated bytes unchanged.
6. Lossless patch tests: no-op patch == original bytes for every tileset file in both subjects; edits touch only the
   target span; GBA attribute edits keep unedited bits and width.
7. Mutation checks for each High step; write tests only on temp copies; live check and build check (`make`) on scratch
   copies of both subjects; gate green, typecheck, UI build.

## Review record

- Draft review 1: Codex `gpt-6-astra` (read-only), 2026-11-08: 10 Important (collision record by index and surplus;
  aliased files; per-layout GBA splits; cross-half palette/tile dependencies; GBC block 0; Save-as-new placement on
  palette and shared grids; ownership/save/undo definition; cache coverage; attribute bit preservation; preview context
  and triple-layer detection), 3 Minor (lossless text model; border/pending usage counts; mutation/failure acceptance).
  All folded in; Q8-Q10 added. Conductor spot-checked forest 40 blocks / 64 records and the Cave/DarkCave aliases.
