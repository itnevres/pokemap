# Plan 14.2: Block editor in both families (design)

Status: **APPROVED by the user 2026-11-10** (Q11 answered). Written by the Plan 14 conductor (session 4, 2026-11-08) from the accepted playback
(ledger "Decisions", roadmap D20), revised after a Codex `gpt-6-astra` draft review (10 Important, 3 Minor). The
user's Q1-Q10 answers (2026-11-08) are folded into the Design below by the Plan 14.2 conductor (session 1,
2026-11-10); Q11 answered 2026-11-10. Tier: **High** (writes tileset data shared by many maps; binary, `.asm` and PNG formats
that corrupt silently; Save/undo ownership across sessions; render caches; shared shell UI). Branch
`plan-14-2-block-editor` from master `3f4a762`.

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

## Design (user answers Q1-Q11 folded in)

### Identity: physical files, not tileset names

- Tilesets alias files. PerfPlus `gfx/tilesets.asm:90-95`: `TilesetCaveMeta::` / `TilesetDarkCaveMeta::` share
  `cave_metatiles.bin`, and the two `...Coll::` labels share `cave_collision.asm`. Sets may overlap partially.
- Every usage count, ownership check, staged read and cache invalidation is keyed by the **resolved file path** (GBC:
  from the `INCBIN` / `INCLUDE` under each tileset's labels; GBA: each tileset header's `metatiles` /
  `metatileAttributes` paths), never by tileset name. Acceptance includes an edit made through one alias and observed
  through the other.
- GBC palette maps and tile sheets alias the same way (`gfx/tileset_palette_maps.asm` puts several `...PalMap::`
  labels over one `INCLUDE`; `gfx/tilesets.asm` puts `Tileset0GFX::` and `TilesetJohtoGFX::` over one
  `johto.2bpp.lz`, built from `gfx/tilesets/johto.png`). A GBC block edit's file set is therefore up to four files:
  metatiles `.bin`, collision `.asm`, palette map `.asm` (Q2 "all" or "local"), tile sheet `.png` (Q2 "local" only).
- **E1 rulings (conductor s13, 2026-11-18; GBA file-keyed consumers).** Tasks 5/7 keyed GBA consumers by tileset
  symbol; the subject has real aliases (10 `gTileset_Building*` headers share `gMetatiles_InsideBuilding`, 6 SecretBase
  secondaries share `gMetatiles_SecretBaseSecondary`; metatiles and attributes alias together in every case).
  - **E1a alias set.** For an edited symbol S, the alias set is every symbol in `proj.tilesetSymbols()` whose
    canonical `metatilesBin` equals S's **or** whose canonical `attributesBin` equals S's (union: conservative if a
    project aliases one file without the other).
  - **E1b consumers.** Every (layout, role) whose `primaryTileset` (role primary) or `secondaryTileset` (role
    secondary) is in the alias set. R8a holds: a layout whose two slots are both in the set yields two uses.
    `gbaConsumingLayouts(proj, S)` returns this set (sorted by layout id, primary before secondary), each use naming
    `tileset` (the layout's own symbol in that role) and `pairedWith` (the layout's other slot).
  - **E1c per-consumer data.** Each use's primary/secondary halves are the layout's own `primaryTileset` /
    `secondaryTileset`, never S, so the structural check (tile counts, palettes) and the cross-half warnings judge
    each consumer by the tiles and palettes it really loads.
  - **E1d usage.** `gbaBlockUsage(proj, S, local, grids)` counts every E1b consumer (target `local` for primary,
    `split.metatiles + local` for secondary, per layout); `maps` include maps reached through every alias;
    `tilesets` = sorted distinct alias symbols that some layout consumes, plus S; `files` unchanged (S's canonical
    metatiles and attributes); unknown S still gives empty usage (R9b).
  - **E1e planner.** `confirm` (another map draws the target), the save-as-new append limit (`SPLIT_LIMIT` under the
    tightest consumer) and the structural refusal run over the E1b consumers. This matches the route's `limits.cap`
    (B14b/B15d: minimum over every consumer of the file).
  - **E1f unchanged.** `revision` inputs (the edited files' effective bytes and the request map's effective grid) are
    already file-keyed. Hub ownership and the overlay key by canonical path already. GBC is already file-keyed
    (`tilesetsByPath`) and is out of E1's scope.
  - **E1g direct, not transitive (fix round 1).** The alias set is never closed transitively: C sharing a file with
    alias B but neither file with S is not S's consumer. The route's `limits.cap` is the minimum over
    `gbaConsumingLayouts(project, S)` itself (an earlier loop re-expanded each alias and pulled in such C). The
    partial-chain case is pinned in core tests (the subject has no partial alias for a route test).

### Data (per family, core)

- **GBC block** = 16 tile ids (`*_metatiles.bin`, 16 bytes per block) + 4 collision names (`*_collision.asm`,
  `tilecoll TL, TR, BL, BR`, one record per block **by index**). Collision files may hold **more records than blocks**
  (`forest`: 40 metatiles, 64 `tilecoll` records; `gbc/load/tileset.ts` trims the surplus on load). New block id N
  therefore **replaces record N** when it exists and appends only past the end; surplus records and all other text
  (comments, blank lines, CRLF) are preserved byte for byte.
- GBC tile palettes are per **tile**, tileset-wide (`gfx/tilesets/*_palette_map.asm` `tilepal`), not per block. Valid
  tile ids are those `pngTileIndex` maps (low 7 bits < 0x60, bank from the palette map) **and** inside the tileset
  sheet's real bounds.
- **GBC palette edits (Q2).** Each block square has a palette dropdown (the palette names the palette map uses:
  `GRAY, RED, GREEN, WATER, YELLOW, BROWN, ROOF, TEXT`). Changing it asks for a scope, every time:
  - **All:** rewrite that tile id's name in its `tilepal` line (lossless text patch; bank argument and all other text
    kept). Every block in every tileset sharing that palette map file that uses the tile changes; the usage line
    counts them before OK.
  - **Local:** copy the tile's pixels into a **free tile slot** (Q11), set that slot's palette-map entry to the new
    palette, and point every square of **this block** that used the old tile id at the copy. If a non-reserved tile
    with identical pixels and the requested palette already exists in the sheet, it is reused instead of taking a
    slot. With no free slot, Local refuses naming the sheet and the limit; All stays offered.
  - **Runtime reservations.** Some tile slots are rewritten at run time, so their sheet pixels are not what the game
    shows: roof slots (`engine/tilesets/mapgroup_roofs.asm` copies `ROOF_LENGTH` tiles to `vTiles2 tile $0a`) and
    animation destinations (`engine/tilesets/tileset_anims.asm`, every `vTiles2 tile $XX` / `vTiles5 tile $XX` it
    names). The reserved set is the union of those, for every tileset (conservative). A reserved tile is never a free
    slot and never reused; Local on a **reserved source** tile refuses ("tile $XX is animated / a roof tile"). A
    project where these files cannot be parsed refuses Local naming the file; All is unaffected.
  - **Local needs one sheet and one palette map.** Tilesets alias metatiles without aliasing graphics (PerfPlus
    `gfx/tilesets.asm`: Cave and DarkCave share `cave_metatiles.bin` but DarkCave loads `dark_cave.2bpp.lz`).
    Repointing a shared block at a slot copied into one sheet would show garbage through the other. Local is offered
    only when every tileset consuming the block's metatiles file uses the same sheet file and the same palette map
    file; otherwise it refuses naming the tilesets that differ.
  - The PNG write keeps the sheet's dimensions, colour type and bit depth; only the copied tile's pixels change (the
    compressed bytes differ; acceptance compares decoded pixels outside the allocated slots).
  - **Save as new with an All palette change** in the same draft refuses (an All change alters existing blocks, which
    Q10 forbids for Save as new); the message offers Local or OK.
- **GBC block 0 (Q8).** Map rendering substitutes the map's border block for raw block 0 (`gbc/render/map.ts`).
  Opening the editor on a cell whose raw block is 0 edits the **border block** (what is drawn), and the popup says so
  ("This cell is block 0; editing the border block $XX"). Usage counts report raw interior uses, border references,
  and block-0 cells drawn as the border separately. From the palette, block 0 edits block 0 itself.
- **GBA metatile** = 8 tile entries (`metatiles.bin`, u16: tile 10 bits, X flip, Y flip, palette 4 bits; bottom layer 4
  then top layer 4) + one attribute word (`metatile_attributes.bin`, 16 or 32 bits per the engine profile). The editor
  changes only the behavior and layer-type **fields** through the profile masks (`config/engine.ts`): a value must fit
  its mask, every other bit and the word width are preserved.
- **GBA splits are per layout, not global.** The subject has an Emerald split (512 tiles / 512 metatiles / 6 palettes in
  the primary) and an FRLG/HNS split (640 / 640 / 7) (`include/fieldmap.h`; `load/layouts.ts` resolves each layout's
  split). Append limits, new ids and the ownership of an id (primary or secondary) are computed for **every layout that
  consumes the tileset**; a tileset consumed under two different splits refuses edits that would be valid under only one.
- **Primary metatiles are editable (Q1).** Editing one changes every map of every layout whose primary is that
  tileset (e.g. `gTileset_General`); the usage line and the OK confirm (Q4) show the count.
- **GBA dependencies cross the split both ways:** a primary metatile's tile may use a secondary palette, and a secondary
  metatile depends on its paired primary's tiles (`render/metatile.ts`, `src/fieldmap.c`). The picker offers the tile
  range and palettes actually loaded for that layout (absolute palette indexing, sheet bounds); existing entries that
  already use palettes 13-15 or a cross-half tile are preserved as they are. **New cross-half dependencies are allowed
  with a warning (Q7).** The warning is defined by the physical source each consuming layout resolves
  (`render/metatile.ts`: tile below `split.tiles` and palette below `split.pals` come from the primary, the rest from
  the secondary): a new selection warns when it resolves to **different data in different consuming layouts** (a
  primary metatile picking a secondary-range tile or palette, which varies across the secondaries paired with it; a
  secondary metatile picking a primary-range tile or palette while the secondary pairs with more than one primary).
  The warning names the risk and lists the layouts; OK and Save as new stay enabled. The split refusal above is about
  structural validity (an id or palette outside a layout's range), not this dependency risk.
- **Triple-layer GBA metatiles** are detected from the project's configuration (porymap `enable_triple_layer_metatiles`
  or the engine profile), not from file sizes; such a project refuses the block editor naming the file.
- New encoders, each a **lossless patch** of the file, not a re-serialization of the parsed model: GBC collision text
  (replace record N's arguments in place, keep everything else), GBC metatiles (`encodeMetatiles` over the original
  buffer, only block N's 16 bytes change), GBA metatiles + attributes (only entry N's bytes change, masked fields only),
  GBC palette map text (replace one name on one `tilepal` line), GBC tile sheet PNG (decode, copy one 8x8 tile into
  the slot, re-encode with the same dimensions, colour type and bit depth).
  Tests: a no-op patch returns identical bytes for every tileset file in both subjects, and an edit changes only the
  target span.
- **Usage index:** file -> tilesets -> maps (GBC `map.tileset`; GBA layout -> primary/secondary), and per block id the
  count of **interior** cells per map plus **border** references, separately; a map's block grid shared by aliases
  (`PortPassage.blk` used by OlivinePortPassage and VermilionPortPassage, `data/maps/blocks.asm`) counts once per file
  and names all its maps. Counts are recomputed after any staged grid edit (paint, Save-as-new placement) and cached
  per project generation. For a GBC "All" palette edit the index also answers: which blocks, in which metatiles files
  under that palette map, use tile id T, and which maps draw them.

### Save as new block (Q9, Q10)

- From the **map**: appends block id N (the first id past the end) and places it on the **one clicked cell** of the
  edited map. No other cell and no other map changes. If that map's grid file (`.blk` / `map.bin`) is shared by other
  maps (GBC `data/maps/blocks.asm` aliases), Save as new **refuses**, naming the sharing maps; OK stays available.
- From the **block palette**: appends block id N only; nothing is placed.
- Caps: GBC 256 blocks per metatiles file; GBA the primary/secondary metatile limit of every layout consuming the
  tileset (see splits). At the cap, Save as new refuses naming the file and the limit.
- GBC: the new id's collision record replaces surplus record N when one exists, else appends (see Data).
- GBA: the new entry is appended at the file-local index (the next entry of that `metatiles.bin`); its map-visible id
  is that index plus `split.metatiles` for a secondary (per consuming layout's split), the index itself for a primary.
  Its attribute word starts as a copy of the source block's whole word, then the edited fields are applied through
  the masks. Placement changes only the clicked cell's metatile id; its collision and elevation are kept (as
  `edit/paint.ts` does when they are omitted).
- The new block's contents are the popup's draft (tiles, collision / attributes, palettes via Local only).

### Session ownership, Save and undo

- A tileset edit is staged in a **tileset session** keyed by the resolved tileset files, not in one map's session,
  because every map using those files changes (Q3).
- Rule (Q3): **one owner at a time per tileset file**, the 14.1 constants-header rule. The map whose
  popup made the first staged edit owns it; its Save writes the tileset files with its own files in one set; its
  undo/redo history holds the combined command; its Discard restores both. Another map's edit to those files refuses
  naming both maps and the files until the owner saves, undoes or discards. Another map's Save does not include them.
  Ownership lasts while **any** staged change to that file remains in the owner's history: a partial undo keeps it;
  it is released by Save, Discard, or undoing the last change that touched the file. Redo of a tileset command
  reacquires every file it needs and checks each file's fingerprint against the command's recorded baseline before
  restoring anything; if another map owns a file or a file changed, redo refuses naming them, and history and bytes
  stay as they were.
- **No references to another owner's unsaved additions.** Other maps' views show staged tileset data, so another map
  could try to paint an appended block id. The hub refuses, in every grid-writing path (paint, fill, stamp, block
  placement), any block id at or past a metatiles file's saved count while another map owns that file, naming the
  owner. Tile copies (Q2 Local) are only referenced from the owner's own block edits, which ownership already
  covers. Undo is linear, so the owner cannot undo an append while its own later paints still reference it.
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
  dropdowns). Opened from the block palette and from the map (Q5) two ways: a right-click **context menu** on a map
  cell with an "Edit block" item (the map canvas has no context menu today; the world view's `WorldContextMenu`
  pattern is the model), and a new **"Edit block" toolbar tool** in both rails (click a cell opens the popup).
- Tile picker: the tileset's valid tiles at 2x, hover shows `Tile: $XX`, click selects; click a block square places it.
- Placement modifiers (Q6, Polished Map `block-window.cpp` `change_chip_cb`): plain click places one tile;
  **Ctrl+click places 2x2** and **Ctrl+Shift+click places 4x4**, anchored at the clicked square. The group is taken
  in **sheet coordinates**: source sheet index = selected tile's sheet index + dy * 16 + dx (16 tiles per picker
  row), then mapped back to the tile id whose `pngTileIndex` is that index (GBC: sheet index `$60` is tile `$80`, so
  a group crosses the `$5F` / `$80` bank gap as Polished Map's `+$20` does). Sources past the sheet's end or row edge,
  and squares past the block edge, are skipped; nothing wraps. GBA uses the same rule over its layout's tile range;
  2x2 fills one layer of the metatile; 4x4 is not offered. A heading shows the active mode ("Place 2x2"). Polished
  Map's other modes (2/2, 2+2, 2-2 and their 4-tile forms) are not in 14.2.
- Map context menu: right-click on an **interior** block cell (GBC: the block, not the event quadrant) opens a menu
  with "Edit block"; the browser menu is suppressed; the gesture never paints, places an event or pans. Outside the
  map's interior, or while an action barrier (save, discard, undo, redo, switch) is pending, the item is disabled.
  Escape, a click elsewhere, or a map switch closes the menu. The Edit block tool targets cells the same way.
- Collision / behavior / layer dropdowns list typed option sets parsed from the project (GBC collision constants,
  `parseCollisionConstants`; GBA `MB_*` behaviors and `METATILE_LAYER_TYPE_*`), text box fallback like 14.1.
- Usage line under the preview: "Used N times on this map (+ border), M times on K other maps; files shared by
  tilesets T1, T2; J maps affected" (P4), always visible. **Confirm on OK (Q4):** one predicate in Design and
  Acceptance: OK confirms when the draft changes what **any map other than the edited one** draws, i.e. another map
  uses the block (interior, border, or block-0-as-border), or, for a GBC All palette edit, another map draws any
  block using that tile. The confirm step lists the counts and maps, computed by the hub when OK is pressed. Cancel
  returns to the popup with the draft intact and nothing staged.

## User answers (2026-11-08; binding)

- **Q1:** allow GBA primary metatile edits, with the usage warning.
- **Q2:** GBC tile palettes are editable, and the user picks the scope on each edit: **all** (edit the palette map
  entry; every block using that tile changes) or **local** (duplicate the tile into a free tile slot with the new
  palette and point only this block at the copy). Local refuses with a message naming the limit when the tileset has
  no free tile slot; "all" stays offered.
- **Q3:** one owner per tileset file, as drafted.
- **Q4:** always-visible usage line **and** a confirm step on OK when other maps use the block.
- **Q5:** both a right-click context menu ("Edit block") on a map cell and a new "Edit block" toolbar tool.
- **Q6:** single-tile placement plus Polished Map's 2x2 / 4x4 placement modifiers.
- **Q7:** new cross-half GBA dependencies are allowed with a warning naming the risk (not refused).
- **Q8:** a cell whose raw GBC block is 0 edits the border block (what is drawn), and the popup says so.
- **Q9:** Save as new from the block palette appends the block only; no placement.
- **Q10:** Save as new changes only the one clicked cell on the edited map: no other map and no other cell. When the
  cell's `.blk` is shared by several maps, placing it would change them all, so Save as new **refuses** there with a
  message naming the sharing maps (conductor's reading of the answer; appending without placement is not offered
  there unless the user asks).

## Q11 (user answer 2026-11-10; binding)

- **Q11 GBC free tile slot (for Q2 Local): existing sheet only.** A slot is free when it is inside the sheet's current
  bounds, valid under `pngTileIndex`, not in the runtime reserved set (roof and animation destinations, see Data),
  and no block in any metatiles file loaded with that sheet (via any alias), saved or staged, references its tile id;
  the sheet is never enlarged, so a full sheet refuses Local (All stays offered). Growing the sheet was offered and
  declined.

## Open questions Q1-Q10 (answered above; kept for the record)

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

- Editing tile graphics (pixels) or palette colours; adding tiles; tileset animations. The one exception is Q2
  Local, which copies an existing tile's pixels unchanged into a free slot of the same sheet.
- GBA tile palettes beyond the per-entry palette field P3 already edits (no GBA palette-file writes).
- GBA triple-layer metatiles (refused, detected from configuration).
- Deleting or reordering blocks (ids are referenced by every `.blk` / blockdata).
- Polished Crystal style per-block attribute files (`*_attributes.bin`): neither subject uses them.

## Acceptance

1. Both families: popup opens from the map (context menu and Edit block tool) and the palette; preview matches the
   canvas pixel-for-pixel for the same map context. Ctrl / Ctrl+Shift place 2x2 / 4x4 groups as specified.
2. OK edits the block everywhere: every view redraws, including an alias tileset and a view opened afterwards; Save
   writes only the tileset files in the edit's file set; undo, redo, Discard and a failed save restore or keep state
   exactly, including a draft with several palette changes (All and Local) in one OK.
3. Save as new appends id N (GBC replaces surplus collision record N), refuses at the cap/limit naming the file, places
   it on the clicked cell only; Save writes the tileset files and the grid in one atomic set; one undo reverts both.
   From the palette it appends only. On a grid shared by several maps it refuses naming them.
3a. GBC palette: "All" rewrites one `tilepal` name and every block using that tile redraws; "Local" copies the tile to
   a free slot (Q11), repoints only this block, reuses an identical non-reserved copy, and refuses naming the sheet
   when none is free, naming the tile when the source is reserved, and naming the tilesets when the block's
   metatiles file is shared by tilesets with a different sheet or palette map (Cave / DarkCave). Save as new with an
   All change in the draft refuses.
3b. GBC raw block 0 cell edits the border block and the popup says so. GBA cross-half selections warn exactly when the
   selection resolves to different data in different consuming layouts, and still apply. GBA Save as new keeps the
   source attribute word's unedited bits and the clicked cell's collision/elevation; tested under both splits.
3c. Placement groups: 2x2 and 4x4 at a block edge (clipped), at the sheet end (skipped), and across the GBC `$5F`/`$80`
   gap (continues at `$80`).
3d. Ownership: a partial undo keeps ownership; undoing the last change releases it; redo after another map took and
   saved the file refuses with history and bytes unchanged. Another map painting an unsaved appended id refuses
   naming the owner; after the owner's Discard no grid references a missing id.
3e. Map context menu: opens on interior cells at several zooms/pans and over event overlays (GBC quadrants map to their
   block); never paints, places or pans; disabled outside the interior and during barriers; Escape and map switch
   close it.
4. Usage counts (interior, border, block-0-as-border, aliases, shared grids) match an independent scan of both
   subjects. OK opens the confirm step exactly when the draft changes what another map draws (the Shell predicate);
   Cancel keeps the draft and stages nothing.
5. Ownership refusal names both maps and the files; stale fingerprint / external change refuses at commit naming the
   file; unrelated bytes unchanged.
6. Lossless tests, by format: binary files (GBC metatiles, GBA metatiles and attributes): a no-op patch returns the
   original bytes for every tileset file in both subjects and an edit changes only the target entry's bytes (GBA
   attribute edits keep unedited bits and width); text files (collision, palette map): only the target record's
   arguments / the one name change, all other bytes identical; PNG: a no-op returns the original bytes, and an edit
   keeps dimensions, colour type and bit depth with decoded pixels unchanged outside the allocated slots.
7. Mutation checks for each High step; write tests only on temp copies; live check on scratch copies of both subjects;
   build check (`make`) on scratch copies where the toolchain exists (not on this machine as of 14.1: recorded as not
   run); gate green, typecheck, UI build.

## Review record

- Draft review 1: Codex `gpt-6-astra` (read-only), 2026-11-08: 10 Important (collision record by index and surplus;
  aliased files; per-layout GBA splits; cross-half palette/tile dependencies; GBC block 0; Save-as-new placement on
  palette and shared grids; ownership/save/undo definition; cache coverage; attribute bit preservation; preview context
  and triple-layer detection), 3 Minor (lossless text model; border/pending usage counts; mutation/failure acceptance).
  All folded in; Q8-Q10 added. Conductor spot-checked forest 40 blocks / 64 records and the Cave/DarkCave aliases.
- User answers Q1-Q10 folded into Design (2026-11-10, conductor s1). Spec review 2: Codex `gpt-6-astra` (read-only),
  2026-11-10: 9 Important (free-slot runtime reservations; Local across tilesets sharing metatiles but not sheets;
  Save as new after an All palette change; references to another owner's unsaved additions; ownership release and
  redo reacquisition; GBA cross-half warning boundary; placement arithmetic at the GBC bank gap; confirm predicate;
  GBA Save-as-new attribute/cell preservation), 2 Minor (per-format losslessness; map context-menu contract). All
  folded in; conductor verified the roof copy (`mapgroup_roofs.asm`, `vTiles2 tile $0a`) and the animation
  destinations in `tileset_anims.asm`.
