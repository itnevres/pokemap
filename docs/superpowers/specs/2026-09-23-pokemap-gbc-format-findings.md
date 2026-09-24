# PokeMap GBC format findings (Plan 6 Task 1)

**Subject:** `C:\Programming Projects\pokecrystal-PerfPlus` at HEAD `81ededbe3` (read-only; `git status --porcelain` empty before and after this research).
**Method:** direct reads of the real macro definitions and engine routines, plus throwaway Node scripts that measured the **whole corpus** (every `map_const`, every `map_attributes`, every `.blk`, every tileset, every `maps/*.asm`). Every excerpt below is pasted from the real repo. Nothing is invented.
**Answers:** roadmap `2026-09-23-pokemap-plan-6-gbc-roadmap.md` §3, items 1-6. Also covers the config and family-selection decision (roadmap §5, Plan 6 Task 1).

**Corpus at a glance:** 391 maps in 26 map groups. 391 `map_attributes`, 391 `map` headers and 391 `maps/<Name>.asm` files, one of each per map. 305 `.blk` files on disk. 257 of them are used by real maps and 48 are unreferenced betas. 142 connections. 36 tilesets plus alias `Tileset0`. 1,327 warps, 114 coord events, 792 bg events and 1,468 object events. No CRLF anywhere.

**PerfPlus vs vanilla.** The fork's own git history contains vanilla. The last upstream (pret) commit merged in is `804fa846e` (Rangi42, 2024-01-01). `git diff 804fa846e HEAD` shows no file-format change, but it does show two engine fixes in `home/map.asm`:

- the `LoadMetatiles` 128-wrap fix (§3.2);
- the `ReadObjectEvents` overflow fix (`ld a, NUM_OBJECTS` → `ld a, NUM_OBJECTS - 1`, plus `jr c, .skip`).

Data changes:

- 65 files under `maps/`: 61 `.asm` and 4 `.blk`. The `.asm` files are 3 new CeruleanCave maps plus 58 edited ones, e.g. VioletGym, ViridianGym, VermilionGym; 65 `*_event` lines are added or removed. The `.blk` files are the 3 new CeruleanCave ones and an edited `Route4.blk`.
- The 3 new maps are registered in `map_constants.asm`, `attributes.asm`, `maps.asm`, `blocks.asm` and `scripts.asm`.
- Edited `kanto_collision.asm` (headbutt-tree collisions) and `roofs.pal` (group 3).
- `port.png` is **content-edited**, not just re-saved. It is now 8-bit RGBA, and decoding both versions to gray levels shows 30 pixels differ, in tiles `$0C` and `$1C`.
- Wild data: `johto_grass.asm` and `kanto_grass.asm` edited. `probabilities.asm` changed: grass 30/30/20/10/5/4/1 → 25/25/20/10/10/5/5, water 60/30/10 → 45/30/25. `treemons.asm`/`treemon_maps.asm` add 3 Kanto sets `TREEMON_SET_KCITY/KTOWN/KROUTE`, with the matching constants. `kanto_grass.asm` lost its `db -1` terminator (§Extra, wild data).
- `engine/overworld/wildmons.asm` edited: the level buff now also applies to surf encounters (skipped only for `BATTLETYPE_SUICUNE`).

**Consequence:** encounter odds must be parsed from `probabilities.asm`, never hardcoded. A vanilla corpus member will differ there.

---

## §3.1 Event-section counts: assembler-computed. The editor never maintains them.

**Answer.** Every `def_*` section count is computed by the assembler. Each `def_*_events` macro emits `db {_NUM_X}`, a forward-referenced symbol unique to that invocation (`\@`). Each following `*_event` macro increments it. Inserting or removing an event line needs no count edit. **The pending G4 item "event-count marker that an edit would desync" does not exist, so drop it.**

Evidence, from `macros/scripts/maps.asm`:

```
MACRO def_warp_events
	REDEF _NUM_WARP_EVENTS EQUS "_NUM_WARP_EVENTS_\@"
	db {_NUM_WARP_EVENTS}
	DEF {_NUM_WARP_EVENTS} = 0
ENDM

MACRO warp_event
;\1: x: left to right, starts at 0
;\2: y: top to bottom, starts at 0
;\3: map id: from constants/map_constants.asm
;\4: warp destination: starts at 1
	db \2, \1, \4
	map_id \3
	DEF {_NUM_WARP_EVENTS} += 1
ENDM
```

The same pattern covers `def_coord_events`, `def_bg_events`, `def_object_events`, `def_scene_scripts` (which also runs `const_def`) and `def_callbacks`.

**`db 0, 0 ; filler` is dead padding.** The engine skips it. From `home/map.asm` `ReadMapEvents`:

```
	ld hl, wMapEventsPointer
	ld a, [hli]
	ld h, [hl]
	ld l, a
	inc hl
	inc hl
	call ReadWarps
```

`GetWarpDestCoords` in the same file uses `rept 3 / inc hl` (2 filler bytes plus the warp count). In the corpus, 389 files have `\tdb 0, 0 ; filler` and 2 have `\tdb 0, 0` (`CeruleanCave1F.asm` and `CeruleanCave2F.asm`, both added by PerfPlus).

**Exact macro argument orders (source order, which is what Task 7 parses):**

| Macro | Args (all corpus uses: count/args) | Emitted bytes |
|---|---|---|
| `warp_event` | `x, y, MAP_CONST, destWarp` (1327/4). destWarp is 1-based. `-1` means "return to the previous map's warp" (4 files use it, e.g. `warp_event 25,  1, FAST_SHIP_1F, -1`) | `db y, x, dest` + `db GROUP, MAP` = 5 (`WARP_EVENT_SIZE`) |
| `coord_event` | `x, y, SCENE_*, scriptLabel` (114/4) | `db scene, y, x`, `db 0`, `dw script`, `dw 0` = 8 |
| `bg_event` | `x, y, BGEVENT_*, scriptLabel` (792/4). Types seen: READ 632, ITEM 85, UP 47, RIGHT 12, LEFT 10, IFNOTSET 4, IFSET 1, DOWN 1 | `db y, x, func`, `dw script` = 5 |
| `object_event` | `x, y, SPRITE_*, SPRITEMOVEDATA_*, radiusX, radiusY, h1, h2, PAL_NPC_*or 0, OBJECTTYPE_*, sightRange, scriptLabel, EVENT_*or -1` (1468/13) | `db sprite, y+4, x+4, move`, `dn ry, rx`, `db h1, h2`, `dn pal, type`, `db sight`, `dw script, flag` = 13 |
| `scene_script` | `scriptLabel[, SCENE_const]` (170 uses) | `dw`, `dw 0` |
| `callback` | `MAPCALLBACK_*, scriptLabel` (105 uses) | `dbw` |

Hour-limit semantics (`object_event` \7/\8), quoted from the macro comment: `if h1 == -1, h2 is treated as a time-of-day value: a combo of MORN, DAY, and/or NITE`. In the corpus, 1,457 objects use `-1, -1`. 11 use a single time flag: `-1, DAY` ×5, `-1, MORN` ×3 and `-1, NITE` ×3. No object uses a combination of flags, and none uses real hours.

**Whole-corpus structure (all 391 map files):**
- Each file has exactly one `<Name>_MapEvents:` label and one `<Name>_MapScripts:` label, where `<Name>` is the `map` header name. The file is always `maps/<Name>.asm`, and `data/maps/scripts.asm` INCLUDEs all 391.
- The event block is always the **tail of the file**. After `_MapEvents:` and the filler line, every non-blank line is a `def_*`/`*_event` line or a comment. 0 stray lines.
- Section order is always `def_warp_events`, `def_coord_events`, `def_bg_events`, `def_object_events` (0 violations). This order is mandatory: `ReadMapEvents` reads the sections sequentially.
- Formatting is **not** uniform, so a splicer must preserve raw text exactly. Numbers are column-padded (`warp_event  6,  3, ELMS_LAB, 1`). Five files carry trailing comments on event lines, e.g. `warp_event  5,  5, BURNED_TOWER_B1F, 1 ; inaccessible, left over from G/S`. 22 files have trailing whitespace. `CeruleanCave1F.asm` has `CeruleanCave1F_MapEvents: ` (trailing space), `def_warp_events ` and a tab-only line. All indentation is tabs (0 space-indented event lines).
- 2 map files have **no final newline**: `maps/CeruleanCave2F.asm` and `maps/CeruleanCaveB1.asm`. So do `data/wild/kanto_grass.asm` and 3 files outside Plan 6's read set (`data/types/category_names.asm`, `gfx/trainer_card/{johto,kanto}_badges.pal`). A line parser must accept a last line without `\n`, and the splicer must preserve its absence byte-exactly.
- Per-map maxima: warps 33 (EcruteakGym), coord 30 (TeamRocketBaseB1F), bg 38 (CeladonGameCorner), objects 15 (GoldenrodCity). Objects are capped by `DEF NUM_OBJECTS EQU 16`, because slot 0 is the player.

**The real positional hazard for Plan 7 is `object_const_def`, not the count byte.** Scripts address objects by position through a hand-maintained const list at the top of the file:

```
	object_const_def
	const NEWBARKTOWN_TEACHER
	const NEWBARKTOWN_FISHER
	const NEWBARKTOWN_RIVAL
```

The `object_const_def` expansion is `const_def 2`. Scripts then use these consts (`turnobject NEWBARKTOWN_TEACHER, LEFT`). In the corpus, 350 maps have a const count equal to their object count. 40 maps have no `object_const_def`. 1 map has fewer consts than objects: `MoveDeletersHouse` has 1 const for 2 objects. Removing or reordering an `object_event` silently re-targets every later const.

**Design consequence:**
- **G4:** delete the pending "count marker desync" trigger. Add these triggers instead:
  - (Plan 7) removing or reordering an `object_event` that has a matching `object_const_def` entry, unless the const list is adjusted atomically.
  - more than 15 `object_event`s in one map.
- **G3:** still holds. The splicer works on raw lines and must round-trip the formatting irregularities listed above.
- **Plan 6 Task 4 shrinks.** No count bookkeeping exists. It only needs line/argument location and splicing.

---

## §3.2 Per-tileset metatile cap: varies (40, 64 or 128). The engine id space is 256 in PerfPlus.

**Answer.**
- Every metatile is 16 bytes: a 4×4 grid of tile ids, row-major, with **no attribute bits**. `LoadMetatiles` copies `METATILE_WIDTH` × `METATILE_WIDTH` bytes.
- The per-tileset count is the file size divided by 16, and it is **not** a constant:

| Metatile count | Tilesets |
|---|---|
| **128** (2048 B) | johto, johto_modern, kanto, battle_tower_outside, and `unused_johto` (`UnusedTilesetJohtoMeta:: ; unreferenced`, not in the `Tilesets` table) |
| **40** (640 B) | forest |
| **64** (1024 B) | all other 30 (**corrected 2026-09-23 during Task 2 review**: 36 distinct `_metatiles.bin` INCBIN paths total, not 37 -- see the Task 2 consequences note below) |

- **Collision entry counts do not always match.** `forest_collision.asm` has 64 `tilecoll` lines for 40 metatiles. Take the cap from `_metatiles.bin`'s size, never from collision.
- **No real map exceeds its tileset's count.** The whole-corpus check found 0 block ids ≥ count, including border blocks.
- **Block id 0 is never placed inside a map.** However, **272 of 391 maps have `border = $00`**: every interior (all Pokecenters, Marts, houses, gates, towers, …). Their 3-block ring therefore renders **metatile 0** of their tileset (see §Extra, Border).
- **Engine range.** PerfPlus fixed the vanilla "LoadMetatiles wraps past 128" bug. Diff vs `804fa846e`, `home/map.asm`:

```
 ; BUG: LoadMetatiles wraps around past 128 blocks (see docs/bugs_and_glitches.md)
-	add a
+; Fixed
 	ld l, a
 	ld h, 0
 	add hl, hl
 	add hl, hl
 	add hl, hl
+	add hl, hl
```

  So PerfPlus addresses ids 0-255. Vanilla aliases ids ≥128.

Real bytes, `data/tilesets/johto_metatiles.bin` (first 48 bytes, metatiles 0-2):

```
 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
 06 06 06 06 06 06 06 06 06 06 06 06 06 06 06 06
 05 05 05 05 05 05 05 05 05 05 05 05 05 05 05 05
```

**Where tile attributes come from.** Palette and VRAM bank come from the per-tileset palette map (§3.4). There is no H/V flip anywhere in the BG attribute path: the palette-map nibble is `bank<<3 | pal`.

**Tile id → PNG tile index.** Measured over every metatile actually placed in a real map, including border blocks: used tile ids fall only in `$00-$5F` and `$80-$DF`. `LoadTilesetGFX` (`home/map.asm`) copies decompressed tiles `$00-$5F` to `vTiles2` (bank 0) and tiles `$60-$BF` to `vTiles5` (bank 1). `_SwapTextboxPalettes` then clears bit 7 of each tile id (`res 7, [hl]`) after looking up its palette nibble, so tile `$80+k` on bank 1 means PNG tile `$60+k`. **The mapping is: PNG index = t for t < $60, and t − $20 for $80 ≤ t < $E0.** Tile ids `$60-$7F` and `$E0-$FF` appear only in never-placed garbage metatiles. Examples: house uses `$60` in unused metatiles, battle_tower_outside's unused metatiles use `$E0-$FF`, and lab and port do too. A tileset-picker render must refuse or placeholder those ids rather than guess.

Strictly, the VRAM bank is chosen by **bit 3 of the tile's palette-map nibble**, not by the tile id. The `t − $20` rule is equivalent only because all 37 palette maps have exactly the same shape (verified: 12 `tilepal 0` lines, `rept 16 / db $ff / endr`, then 12 `tilepal 1` lines, with 0 deviations). Task 5 must either assert that uniformity per palette map or derive the bank from the nibble: PNG index = `(nibble & 8 ? $60 : 0) + (t & $7F)`, valid for `t & $7F < $60`.

**Design consequence:**
- **G1** wording ("verify the true per-tileset cap rather than assuming 128") is confirmed. The cap is `metatiles.bin.length / 16`, per tileset.
- **G4** trigger: metatile id ≥ that count.
- **G2** holds. `.blk` and `_metatiles.bin` are headerless fixed-width arrays.
- **Task 5** must implement the `$80 → PNG $60` remap.

---

## §3.3 Collision: 4 bytes per metatile, quadrants TL, TR, BL, BR. Source is asm, not bin.

**Answer.**
- `data/tilesets/<name>_collision.asm` holds one `tilecoll` line per metatile. Each line has 4 `COLL_*` suffixes, one per 16×16-pixel quadrant (2×2 tiles).
- The macro is defined in **`gfx/tilesets.asm`** (not `macros/`):

```
MACRO tilecoll
; used in data/tilesets/*_collision.asm
	db COLL_\1, COLL_\2, COLL_\3, COLL_\4
ENDM
```

- Quadrant order comes from `home/map.asm` `GetCoordTile` (d = x, e = y in 16-pixel steps): `base = id*4`, `+1` if x is odd, `+2` if y is odd. So the order is **\1 = top-left, \2 = top-right, \3 = bottom-left, \4 = bottom-right**.

```
	rr d
	jr nc, .nocarry
	inc hl
.nocarry
	rr e
	jr nc, .nocarry2
	inc hl
	inc hl
```

  The same routine returns `-1` for block id 0 (`and a / jr z, .nope`).

Real lines, `data/tilesets/johto_collision.asm`:

```
	tilecoll 01, 01, 01, 01 ; 00
	tilecoll FLOOR, FLOOR, FLOOR, FLOOR ; 01
	tilecoll WHIRLPOOL, BUOY, WATER, BUOY ; 07
	tilecoll FLOOR, FLOOR, WALL, WARP_CARPET_DOWN ; 0c
```

- **Enum.** The values live in `constants/collision_constants.asm` as `DEF COLL_<NAME> EQU $xx`. That file defines 109 values, many annotated `; unused` or `; garbage`, for example `DEF COLL_FLOOR EQU $00`, `DEF COLL_WALL EQU $07`, `DEF COLL_TALL_GRASS EQU $18`, `DEF COLL_WATER EQU $29`, `DEF COLL_HOP_DOWN EQU $a3`.
- **Tokens used across all 37 collision files:** 54 distinct, including raw hex-suffix tokens like `01`, `5B`, `FF`, `9C` (for example `COLL_01`, `COLL_FF`). A parser maps each token to the `COLL_<token>` constant. It must not assume a token is a word.
- All 37 files contain only `tilecoll` lines. Each line ends with a `; xx` index comment. No CRLF.

**Design consequence.**
- The collision overlay is 4 values per metatile at 16×16-pixel granularity. The GBA model is per-block.
- The GBC `Block` really is `{ metatileId }` alone: collision is a tileset property, not a per-placement one. The roadmap §1 type note is correct.
- Collision is **asm text**. Editing it is a G3 (line splice) concern, not G2. Plan 6 is read-only, so this only matters for Plan 7.

---

## §3.4 Palettes: the roadmap's "3 RGB blocks" model is wrong. Render needs env × time × group × tileset.

**Answer.** A map's BG palettes are resolved in this order (`engine/gfx/color.asm` `LoadMapPals`, `engine/tilesets/timeofday_pals.asm`, `engine/tilesets/tileset_palettes.asm`, `engine/tilesets/mapgroup_roofs.asm`, `home/map.asm` `LoadTilesetGFX`). I read `timeofday_pals.asm` in full.

**Step 1. Time slot.** The clock gives `wTimeOfDay` ∈ {MORN_F=0, DAY_F=1, NITE_F=2} from `engine/rtc/rtc.asm` `TimesOfDay` (`0400-0959 morn | 1000-1759 day | 1800-0359 nite`). DARKNESS_F=3 never comes from the clock. The map header's palette field (`map ... PALETTE_*` at `\7`, stored via `dn \6, \7`) picks a "palset" from `.BrightnessLevels`:

```
.BrightnessLevels:
; actual palettes used when time is
; DARKNESS_F, NITE_F, DAY_F, MORN_F
	dc DARKNESS_F, NITE_F,     DAY_F,      MORN_F     ; PALETTE_AUTO
	dc DAY_F,      DAY_F,      DAY_F,      DAY_F      ; PALETTE_DAY
	dc NITE_F,     NITE_F,     NITE_F,     NITE_F     ; PALETTE_NITE
	dc MORN_F,     MORN_F,     MORN_F,     MORN_F     ; PALETTE_MORN
	dc DARKNESS_F, DARKNESS_F, DARKNESS_F, DARKNESS_F ; PALETTE_DARK
```

`PALETTE_DARK` becomes all-NITE if Flash was used (`.UsedFlash`). The result is **timeOfDayPal = BrightnessLevels[mapPalette][wTimeOfDay]**: AUTO follows the clock, DAY/NITE/MORN are fixed, and DARK means DARKNESS (or NITE with Flash). Corpus: DAY 270, AUTO 78, NITE 30, DARK 13 maps.

**Step 2. Special tilesets override all 8 BG palettes, independent of time.** `LoadSpecialMapPalette`:
- TILESET_POKECOM_CENTER uses `pokecom_center.pal`.
- TILESET_BATTLE_TOWER_INSIDE uses `battle_tower_inside.pal`.
- TILESET_ICE_PATH uses `ice_path.pal`, **unless the environment is INDOOR** (Hall of Fame).
- TILESET_HOUSE uses `house.pal`.
- TILESET_RADIO_TOWER uses `radio_tower.pal`.
- TILESET_MANSION uses `mansion_1.pal`'s first 8 palettes, then patches YELLOW←`mansion_2.pal`, WATER←`mansion_1` pal 6 and ROOF←`mansion_1` pal 8.

Each of these files is 32 colors (8 palettes), one `RGB r, g, b` per line. `mansion_1` has 36 colors and `mansion_2` has 4.

**Step 3. Otherwise, the environment picks an index row.** `EnvironmentColorsPointers[wEnvironment]` holds 4 rows (morn, day, nite, dark) of 8 indices into `TilesetBGPalette` = `gfx/tilesets/bg_tiles.pal`, which has **42 palettes** (`$00-$29`). From `data/maps/environment_colors.asm`:

```
.OutdoorColors:
	db $00, $01, $02, $28, $04, $05, $06, $07 ; morn
	db $08, $09, $0a, $28, $0c, $0d, $0e, $0f ; day
	db $10, $11, $12, $29, $14, $15, $16, $17 ; nite
	db $18, $19, $1a, $1b, $1c, $1d, $1e, $1f ; dark

.IndoorColors:
	db $20, $21, $22, $23, $24, $25, $26, $07 ; morn
	db $20, $21, $22, $23, $24, $25, $26, $07 ; day
	db $10, $11, $12, $13, $14, $15, $16, $07 ; nite
```

- TOWN and ROUTE use Outdoor. INDOOR and GATE use Indoor. CAVE and DUNGEON use Dungeon. ENVIRONMENT_5 uses Env5.
- `bg_tiles.pal` sections: `; morn` (8), `; day` (8), `; nite` (8), `; dark` (8), `; indoor` (8), and `; overworld water` (2, at `$28` morn/day and `$29` nite). Real lines:

```
; morn
	RGB 28,31,16, 21,21,21, 13,13,13, 07,07,07 ; gray
	RGB 28,31,16, 31,19,24, 30,10,06, 07,07,07 ; red
```

  Note that `bg_tiles.pal` puts 4 colors per `RGB` line while the special `.pal` files put 1 color per line. The `RGB` macro (`macros/gfx.asm`) takes any multiple of 3 args. **The parser must accept both.**
- Palette slot order is the `PAL_BG_*` enum in `constants/tileset_constants.asm`: GRAY 0, RED 1, GREEN 2, WATER 3, YELLOW 4, BROWN 5, ROOF 6, TEXT 7.

**Step 4. Roof palette (TOWN/ROUTE environments only).** `RoofPals[wMapGroup]` (`gfx/tilesets/roofs.pal`, 27 entries, one per group 0-26, each 2 colors for morn/day plus 2 colors for nite) overwrites **colors 1-2 of palette 6 (ROOF)**. The morn/day entry applies when timeOfDayPal < NITE_F, otherwise the nite entry.

**Step 5. Roof tile graphics.** Not a palette, but it affects pixels. If the tileset is JOHTO, JOHTO_MODERN or BATTLE_TOWER_OUTSIDE, `LoadMapGroupRoof` copies 9 tiles from `gfx/tilesets/roofs/<roof>.png` (24×24 pixels, 9 tiles) over **tile ids `$0A-$12`**. `<roof>` = `MapGroupRoofs[wMapGroup]`, from `data/maps/roofs.asm`: `-1` means none, otherwise NEW_BARK, VIOLET, AZALEA, OLIVINE or GOLDENROD.

**Step 6. Per-tile palette.** `gfx/tilesets/<name>_palette_map.asm`, INCLUDEd from `gfx/tileset_palette_maps.asm`. Some labels alias the same file: `TilesetCavePalMap:`/`TilesetDarkCavePalMap:`, all 5 word rooms share ruins_of_alph, and `Tileset0` is johto. The macro is defined in `gfx/tileset_palette_maps.asm`:

```
MACRO tilepal
; used in gfx/tilesets/*_palette_map.asm
; vram bank, pals
	DEF x = \1 << OAM_TILE_BANK
	rept (_NARG - 1) / 2
		dn (x | PAL_BG_\3), (x | PAL_BG_\2)
		shift 2
	endr
ENDM
```

- Each byte covers 2 tiles: **low nibble = even tile id, high nibble = odd**, confirmed by `_SwapTextboxPalettes`: `srl a / jr c, .UpperNybble`. A nibble is `bank<<3 | pal`, with `OAM_TILE_BANK EQU 3`.
- Every one of the 37 palette-map files has the same shape: 12 `tilepal 0` lines (tiles `$00-$5F`), then `rept 16 / db $ff / endr` (tiles `$60-$7F`), then 12 `tilepal 1` lines (tiles `$80-$DF`). That is 112 bytes, indexed by raw tile id (`t >> 1`).

**Step 7. Final color math.** At rest, `_UpdateTimePals` uses `c = $9`, which lands on `.cgbfade` row `dc 3,2,1,0` (the identity), so no DMG shade remap occurs. Tile shade index s (0-3) × BG palette p gives `wBGPals1[p][s]`. Components are 5-bit (`RGB` → `palred/palgreen/palblue`).

**Recommended deterministic default render:** **DAY clock, Flash on.** Concretely:

- `timeOfDayPal = BrightnessLevels[mapPalette][DAY_F]`. AUTO→DAY, DAY→DAY, NITE→NITE, MORN→MORN. DARK→NITE, since the Flash palset is all-NITE, matching what a player sees after using Flash. Without Flash the result is near-black, which is useless for editing.
- Apply the special-tileset palette, then the environment row, then the roof palette. Apply the roof tile swap by map group.
- Offer the caller a `{ time: 'morn'|'day'|'nite', flash: boolean }` override.
- Convert 5-bit to 8-bit with `(c << 3) | (c >> 2)`. This is a convention choice: the GBA side has no precedent because JASC files are already 8-bit. Task 6 pins it.

**Design consequence.**
- Roadmap §3.4 and Plan 6 Task 6 ("resolve to one of the three real RGB blocks in `bg_tiles.pal`") are wrong. Resolution needs the **map's** environment, palette field and map group, plus the tileset. So **rendering is per-map, not per-layout.** This matters because layouts are shared (§3.6).
- Task 6's input becomes `(tilesetConst, environment, mapPalette, mapGroup, {time, flash})`. Its output is 8 BG palettes × 4 RGB colors, plus the roof-tile source (or none).
- Roof tile substitution (step 5) changes pixels, not colors, and depends on the map group. Per Decision 6 it belongs in Task 9's per-map render, not Task 5's per-tileset load.

---

## §3.5 Region map (Town Map): tile-composed tilemap plus a pixel landmark table. Not Yellow's model.

**Answer.**
- `gfx/pokegear/johto.bin` and `kanto.bin` are each 361 bytes: a 20×18 tilemap (screen-sized, one tile id per byte) followed by a `$ff` terminator. `engine/pokegear/pokegear.asm` `FillTownMap` copies bytes to the screen until it reads `-1`. First bytes of `johto.bin`: `06 07 07 07 07 07 07 07 07 07 07 07 07 07 07 07`.
- The tiles come from `gfx/pokegear/town_map.png` (128×24 pixels, 2bpp gray, 48 tiles, INCBINed as `TownMapGFX` in `gfx/font.asm`).
- Per-tile palettes come from `gfx/pokegear/town_map_palette_map.asm` (`townmappals` macro, 6 `PAL_TOWNMAP_*`). Per `TownMapPals`, "The palette map covers tiles $00 to $5f; $60 and above use palette 0".
- Location markers are in `data/maps/landmarks.asm`: `landmark x, y, NameLabel` gives `db \1 + 8, \2 + 16` (pixel coordinates in OAM space), one per `LANDMARK_*`. Each map header's `\4` (landmark) ties maps to these.

**Design consequence.** This is structurally closer to GBA's tile-composed region map (Plan 3) than to Yellow's static image. A future Crystal region-map editor would edit two 360-byte tilemaps (G2-style byte patch) plus `landmarks.asm` coordinates (G3-style splice). It is out of Plan 6 scope. No Plan 6 task needs to change.

---

## §3.6 `.blk` ↔ map: NOT 1:1. Shared blockdata is pervasive, so split `Map` and `Layout`.

**Answer (whole corpus).**
- Each map resolves to a `.blk` like this: `map_attributes <Name>, ...` emits `dw <Name>_Blocks`. In `data/maps/blocks.asm`, one or more stacked `<Name>_Blocks:` labels precede each `INCBIN "maps/<file>.blk"`. There are 439 labels and 305 INCBINs.
- All 391 maps resolve to **257 distinct `.blk` files**. **23 `.blk` files are shared, by 157 maps in total.** Examples: `maps/House1.blk` ×50, `Pokecenter1F.blk` ×21, `Mart.blk` ×13, `NorthSouthGate.blk` ×12, `Pokecenter2F.blk` ×11, `EastWestGate.blk` ×10, the 7 `DeptStore*.blk` ×2 each, and `NationalPark.blk` ×2 (NationalPark plus NationalParkBugContest).
- Within every shared group, all users agree on width×height and on tileset (0 conflicts). Real stacked labels:

```
GoldenrodDeptStore1F_Blocks:
CeladonDeptStore1F_Blocks:
	INCBIN "maps/DeptStore1F.blk"
```

- 48 INCBINed `.blk` files (all under `maps/unused/Beta*`, labelled `; unreferenced`) belong to no map. Every `.blk` on disk is INCBINed.
- **Size mismatches: 2, both PerfPlus-added maps.** `maps/CeruleanCave2F.blk` and `maps/CeruleanCaveB1.blk` are **400 bytes**, but `map_const CERULEAN_CAVE_2F, 9, 15` (and B1) declares 9×15 = 135. `CeruleanCave1F.blk` is correctly 135 bytes. All other 254 used `.blk` files match exactly.
- Real bytes, `maps/NewBarkTown.blk` (10×9 = 90 bytes), first 20: `05 05 18 1f 19 05 05 05 05 05 05 47 1c 77 1e 05 18 19 05 05`.

**Three distinct names per map:**
1. the header name `NewBarkTown` (used by `map`, `map_attributes` \1, labels and `maps/NewBarkTown.asm`),
2. the constant `NEW_BARK_TOWN` (used by `map_const`, `map_attributes` \2, warps, connections and wild data),
3. the `.blk` file stem, which differs whenever the file is shared.

Map group and number come from the position within `newgroup` and `map_const` order.

**Design consequence. This reverses the Plan 6 file-structure assumption.** `gbc/model/types.ts` needs:
- a `Layout` keyed by `.blk` path, holding `{ blkPath, width, height, blocks }`;
- a separate `Map` holding `{ name, constName, group, number, layout, tileset, environment, landmark, music, palette, fishGroup, border, connections }`.

It mirrors GBA's split, and for the same reason: painting `House1.blk` edits 50 maps. Plan 7 must surface that, as GBA does.

Tileset, border and palette live on the **map**. All sharers agree on the tileset, but not necessarily on border, environment or group. So **render is per-map**, reading pixels from the layout. The CLI's "map or layout name" resolution should accept a map name.

**G4 / size mismatch.** A `.blk` whose size ≠ w×h is a data defect, and the corpus has 2 real hits. Per Decision 3 (user's choice):

- Reads mimic the engine. `ChangeMap` copies exactly w×h bytes, so load the **first w×h bytes** and attach a flagged warning naming the file, the actual size and w×h.
- These layouts are **never writable**. Plan 7 must refuse writes to them.
- Corpus tests pin exactly this 2-layout warning set.

---

## Extra findings

**Border.**
- `map_attributes <Name>, <CONST>, <borderBlock>, <connection flags>` (`data/maps/attributes.asm`). The border is **one metatile id**, not GBA's 2×2 `border.bin`. Values seen: `$00 $01 $05 $09 $0a $0f $13 $19 $1d $24 $2c $2d $2e $35 $43 $71`.
- **272 of 391 maps use `$00`** as their border, i.e. every interior. Ring rendering of metatile 0 is therefore the common case, not an edge case.
- `wOverworldMapBlocks` is the map plus a `MAP_CONNECTION_PADDING_WIDTH EQU 3` block ring (`constants/gfx_constants.asm`). `LoadBlockData` zero-fills it, then copies the map and connection strips. `LoadMetatiles` substitutes the border for any byte 0: `ld a, [de] / and a / jr nz, .ok / ld a, [wMapBorderBlock]`. So block 0 anywhere, **including inside the map**, renders as the border. The corpus never places block 0, but a renderer should replicate this.
- Plan 6 Task 9's "no border-ring concept unless found" is answered: **it exists** (3-ring, single metatile).

**Connections.**
- `connection <dir>, <TargetName>, <TARGET_CONST>, <offset>`: 142 in total, all 4-argument. The macro still accepts a legacy 6-argument form (`offset = \4 - \5`), but it is unused.
- Direction lines always come in the order north, south, west, east (0 violations). Each map's flag list (`WEST | EAST`) matches its `connection` lines exactly (0 mismatches).
- **The offset axis is the reverse of the macro's own comment.** For north/south the offset is an **x** shift (`_x = (\4) * -2`, `_len = CURRENT_MAP_WIDTH + 3 - (\4)`). For east/west it is a **y** shift. Units are blocks. The target's origin = the current map's origin + offset on that axis, the same convention as GBA's `offset`. Real example: `connection west, Route34, ROUTE_34, -18` (AzaleaTown).

**Map header and tileset assignment.**
- The map header lives in `data/maps/maps.asm`:
  ```
  map NewBarkTown, TILESET_JOHTO, TOWN, LANDMARK_NEW_BARK_TOWN, MUSIC_NEW_BARK_TOWN, FALSE, PALETTE_AUTO, FISHGROUP_OCEAN
  ```
  The argument order is name, tileset, environment, landmark, music, phoneBlock, palette, fishGroup. Maps are grouped under `MapGroup_<X>:`, whose order matches `newgroup`.
- **Header arguments are expressions, not bare words.** `RadioTower1F` through `RadioTower5F` use music `RADIO_TOWER_MUSIC | MUSIC_GOLDENROD_CITY`. Parse each header argument, like `map_attributes`' connection flags (`WEST | EAST`), by splitting on commas and keeping each trimmed expression. Do not match `\w+`.
- Tileset constant → the `Tilesets::` table in `data/tilesets.asm` (`tileset TilesetJohto` → `dba \1GFX, \1Meta, \1Coll`, `dw \1Anim`, `dw NULL`, `dw \1PalMap`).
- Labels resolve to paths through **stacked labels** in `gfx/tilesets.asm` (GFX/Meta/Coll) and `gfx/tileset_palette_maps.asm` (PalMap). The same stacking parser works for `blocks.asm`.
- Aliases:
  - `TilesetBattleTowerOutsideGFX` uses `johto_modern.2bpp.lz`;
  - the 5 word rooms use `ruins_of_alph.2bpp.lz` and its palette map;
  - `Tileset0*` aliases Johto;
  - DarkCave shares cave's metatiles, collision and palette map (stacked `TilesetCaveMeta::`/`TilesetDarkCaveMeta::`, `TilesetCaveColl::`/`TilesetDarkCaveColl::`, `TilesetCavePalMap:`/`TilesetDarkCavePalMap:`) **but not GFX** -- `TilesetDarkCaveGFX::` INCBINs its own `dark_cave.2bpp.lz`, unstacked (**added 2026-09-23**). `dark_cave_metatiles.bin`, `dark_cave_collision.asm` and `dark_cave_palette_map.asm` all exist on disk, in the same shape as cave's, but none is ever INCBIN'd/INCLUDEd -- orphans, like the 4 word-room collision/palette-map files below.
- **I4 holds.** Resolve through these literals, never by name-mangling.

**Tileset graphics.**
- The source is `gfx/tilesets/<name>.png` (INCBIN `…2bpp.lz`, a gitignored build output per `.gitignore`: `*.2bpp`, `*.lz`). All 36 PNGs are **128 wide**: 28 are 96 tall (192 tiles) and 8 are 48 tall (96 tiles: cave, dark_cave, elite_four_room, facility, kanto, players_house, players_room, port). The 48-tall tilesets have no bank-1 tiles, and none of their placed metatiles uses an id ≥ $60. Tiles are row-major, 16 per row.
- "Multiple gfx parts" is one PNG split by `LoadTilesetGFX` into bank 0 (tiles 0-95) and bank 1 (96-191), per §3.2.
- **Format: 35 of 36 are 2-bit grayscale** (depth 2, color type 0) with values 0-3.
- **PerfPlus's `port.png` is 8-bit RGBA** (color type 6), using exactly 4 grays: `255.255.255.255`, `170…`, `85…`, `0…`. The GBC decoder must accept both.
- The existing `packages/core/src/load/png.ts` accepts **only indexed (type 3) 4- or 8-bit PNGs**, so it cannot be reused as-is. **There is no pngjs dependency in this repo**, despite the Plan 6 tech-stack line. Decoding is hand-rolled on `node:zlib`.
- Shade mapping: the Makefile builds these with plain `$(RGBGFX) $(rgbgfx) -o $@ $<`, with no `-c` flag on tileset rules. rgbgfx's grayscale default makes white index 0 and black index 3, i.e. **shade = 3 − grayLevel** (or `3 - (v >> 6)` for 8-bit). **Not verified on a compiled `.2bpp`**: no build artifacts exist locally and rgbgfx is not on PATH. Three pieces of corroborating evidence make this high confidence:
  - (a) In `bg_tiles.pal`, color 0 is the lightest in all 42 palettes under Rec.601 luma (measured). Color 3 is the darkest in 40. The 2 exceptions are the morn and day `water` lines (`01,04,31` luma 6.2 vs `07,07,07` luma 7.0), where saturated blue has lower luma than dark gray. This is still consistent with index 0 = light and index 3 = dark in intent.
  - (b) The `.cgbfade` identity row is `dc 3,2,1,0`, the DMG convention where index 0 = white.
  - (c) `INSTALL.md` pins rgbds 0.6.1.

  Task 5's test must still pin the mapping. For `port.png` (RGBA), the same mapping holds only because rgbgfx's non-grayscale path sees exactly the 4 grays in one palette.
- Tileset animation (`\1Anim`, `gfx/tilesets/{water,flower,…}` directories) is out of scope. A static render uses the PNG as-is.

**Wild data. Plan 6 Task 8/12's model is wrong on 3 counts.**
1. The path is `data/wild/*.asm`, 15 files: `johto_grass.asm`, `kanto_grass.asm`, `johto_water.asm`, `kanto_water.asm`, `swarm_grass.asm`, `swarm_water.asm`, `fish.asm`, `treemons.asm`, `treemon_maps.asm`, `treemons_asleep.asm`, `bug_contest_mons.asm`, `roammon_maps.asm`, `flee_mons.asm`, `unlocked_unowns.asm`, `probabilities.asm`. **There is no `data/wild/maps/` directory.**
2. **Grass does have morn/day/nite variation**, in both rates and species. From `data/wild/johto_grass.asm`:

```
	def_grass_wildmons SPROUT_TOWER_2F
	db 2 percent, 2 percent, 2 percent ; encounter rates: morn/day/nite
	; morn
	db 3, RATTATA
	...
	; nite
	db 3, GASTLY
	...
	end_grass_wildmons
```

   The layout is `map_id` (2 bytes) + 3 rates + 3 × `NUM_GRASSMON EQU 7` × (level, species) (`GRASS_WILDDATA_LENGTH EQU 2 + 3 + NUM_GRASSMON * 2 * 3`, asserted by `end_grass_wildmons`). Water uses 1 rate and `NUM_WATERMON EQU 3` slots (`WATER_WILDDATA_LENGTH EQU 2 + 1 + NUM_WATERMON * 2`).

   Each list is meant to end with `db -1 ; end`. **`data/wild/kanto_grass.asm` in PerfPlus has no terminator and no final newline.** Its last bytes are `\tend_grass_wildmons` then EOF. Vanilla `804fa846e` ends with `end_grass_wildmons`, a blank line, then `db -1 ; end`. The other 5 grass/water lists all have it.

   Latent engine consequence: `LookUpWildmonsForMapDE` walks at `GRASS_WILDDATA_LENGTH` stride until it reads `$ff`. For a Kanto map with no grass entry, it runs off the end of `KantoGrassWildMons` straight into `KantoWaterWildMons`. That table follows immediately because `engine/overworld/wildmons.asm` INCLUDEs `kanto_grass.asm` then `kanto_water.asm` back-to-back. The engine then reads water records as grass records at the 47-byte grass stride. The walk still stops on some later `$ff`, but it may also false-match a map id along the way. This is a likely PerfPlus fork bug. See Decision 4.
3. **There is no `WildDataPointers` table.** `engine/overworld/wildmons.asm` finds a map by linear search on `map_id` through the swarm list first, then the Johto or Kanto list (chosen by `IsInJohto`).

Slot odds live in `data/wild/probabilities.asm`. Grass: 25, 25, 20, 10, 10, 5, 5 (cumulative `mon_prob 25,0 … 100,6`). Water: 45, 30, 25.

Grass levels in the tables are **base** levels. `ChooseWildEncounter` adds +0 to +4 at random (35% +0, 30% +1, 20% +2, 10% +3, 5% +4; skipped for `BATTLETYPE_SUICUNE`), and in PerfPlus this applies to surf too. The atlas should report the base level and note the buff.

**Fishing (`data/wild/fish.asm`, engine `engine/events/fish.asm`).**

- **Map → group.** The map header's 8th argument (`FISHGROUP_*`, from `constants/map_data_constants.asm`) holds one of 13 groups plus `FISHGROUP_NONE`. `GetFishingGroup` (`home/map.asm`) reads it, and `FISHGROUP_NONE` = 0 means "can't fish here" (`engine/events/overworld.asm`: `and a / jr nz, .goodtofish`).
- **Group → table.** The index into `FishGroups` is `FISHGROUP_x − 1` (`GetFishGroupIndex`: `dec d`). A swap happens only when the daily flag `DAILYFLAGS1_FISH_SWARM_F` (in `wDailyFlags1`) is set **and** `wFishingSwarmFlag` names the matching species. Then `FISHGROUP_QWILFISH` → `FISHGROUP_QWILFISH_SWARM` when `wFishingSwarmFlag == FISHSWARM_QWILFISH`, and `FISHGROUP_REMORAID` → `FISHGROUP_REMORAID_SWARM` when `wFishingSwarmFlag == FISHSWARM_REMORAID`. Only the matching group swaps, and every other group is unaffected.
- **Macro:**

```
MACRO fishgroup
; chance, old rod, good rod, super rod
	db \1
	dw \2, \3, \4
ENDM
...
	fishgroup 50 percent + 1, .Shore_Old,            .Shore_Good,            .Shore_Super
```

  `FISHGROUP_DATA_LENGTH EQU 1 + 2 * 3`. `\1` is the bite chance (`call Random / cp [hl] / jr nc, .no_bite`).
- **Rod tables.** Each rod table is a run of `db cumulativeChance, SPECIES, level` 3-byte records. The engine picks the first record with `Random ≤ chance` (`cp [hl] / jr z/c, .ok`). There is no terminator; the last record is `100 percent`. Real excerpt:

```
.Shore_Good:
	db  35 percent,     MAGIKARP,   20
	db  70 percent,     KRABBY,     20
	db  90 percent + 1, KRABBY,     20
	db 100 percent,     time_group 0
```

- **Time-based entries.** `DEF time_group EQUS "0,"`, so `time_group n` emits species 0 and level n. Species 0 routes to `TimeFishGroups[n]`, whose rows are `db daySpecies, dayLevel, niteSpecies, niteLevel`. The nite pair is used when `wTimeOfDay ≥ NITE_F`, otherwise the day pair (morn counts as day). Real row: `db CORSOLA,    20,  STARYU,     20 ; 0`. There are 22 rows (0-21).

**Headbutt and Rock Smash (`data/wild/treemon_maps.asm`, `data/wild/treemons.asm`, engine `engine/events/treemons.asm`).**

- **Map → set.** `treemon_map MAP_CONST, TREEMON_SET_*` expands to `map_id \1` then `db \2`. Two lists: `TreeMonMaps:` (66 entries, headbutt) ends with `db -1`, then `RockMonMaps:` (4 entries: CIANWOOD_CITY, ROUTE_40, DARK_CAVE_VIOLET_ENTRANCE, SLOWPOKE_WELL_B1F, all `TREEMON_SET_ROCK`) ends with `db -1`. The lookup `GetTreeMonSet` is a linear search.
- **Set → table.** `TreeMons:` is a `dw` pointer table indexed by `TREEMON_SET_*`. It has 11 sets; PerfPlus adds KCITY, KTOWN and KROUTE. Resolve through the pointer table's labels, since label order in the file differs from set order (KCity, KRoute, KTown in the file vs KCITY, KTOWN, KROUTE in the table).
- **`TREEMON_SET_CITY` (index 0) never yields an encounter.** `GetTreeMons` does `and a / jr z, .quit`. 13 `treemon_map` lines use it (e.g. `ROUTE_28`). The atlas must report these as "no headbutt encounters", not list the City/Canyon table.
- **Table shape.** Each headbutt set is two `db -1`-terminated lists, `; common` then `; rare`, of `db percent, SPECIES, level` records. The percents are **non-cumulative** (`SelectTreeMon`: `RandomRange 100`, then `sub [hl]` per record). Which list applies depends on a per-tree score derived from tree coordinates and the player's trainer ID (`GetTreeScore`). Encounter chance is 10% (bad score), 50% (good) or 80% (rare, uses the rare list). A static atlas should report both lists as "common"/"rare" without a per-tree resolution.
- **Rock Smash.** `TreeMonSet_Rock` is a single list (`db 90, KRABBY, 15` / `db 10, SHUCKLE, 15` / `db -1`) with a flat 40% encounter chance (`RockMonEncounter`).

**Line endings and whitespace.** No CRLF in any map `.asm`, table asm, collision or palette-map file. `attributes.asm`, `maps.asm`, `map_constants.asm`, `blocks.asm` and `gfx/tilesets.asm` have 0 trailing-whitespace lines. PerfPlus's additions are irregularly formatted (e.g. `map_const CERULEAN_CAVE_1F,                             9,  15 ; 18`). A splicer must not normalize.

**G5 corpus.**
- No separate vanilla checkout exists locally. However, **vanilla pret pokecrystal is already inside PerfPlus's own git history**: commit `804fa846e` is the last upstream commit merged in. A second corpus member can be materialized without any network clone and without touching PerfPlus's working tree or refs: `git -C <PerfPlus> archive 804fa846e | tar -x -C <somewhere outside PerfPlus>`. This read-only action was **not** performed here.
- `pokeyellow` is not a Crystal corpus member.
- **Decided (Decision 2):** Plan 6 uses a single-member corpus (PerfPlus). The user will clone `pret/pokecrystal` into `C:\Programming Projects\Pokemon Game\refs\pokecrystal` before Plan 7. Vanilla is valuable despite being near-identical: it has none of the PerfPlus data defects (2 bad-size `.blk` files, the missing `kanto_grass.asm` terminator, 3 no-final-newline files), so it exercises the clean path for a full corpus. The `git archive 804fa846e` route remains an offline fallback. Nothing was cloned.

---

## Config and family decision

**Current wiring (read, not modified).**
- `pokemap.config.json` = `{ projectPath, referenceProjects[] }`. It has four readers: `packages/cli/src/context.ts` `resolveProject`, `packages/server/src/serve.ts` (argv[2] ?? `cfg.projectPath`), `packages/core/test/helpers/corpus.ts` and `packages/core/test/write/corpus.test.ts`.
- `openProject` (`packages/core/src/project.ts`) refuses any root without `include/fieldmap.h`.
- CLI: one `pokemap` binary with a global `-p, --project <path>`. Every command calls `resolveProject(program.opts().project)`.

**Decision 1. Registration: extend `pokemap.config.json` with a top-level `gbc` block.** Use neither a sibling file nor a restructured project array.

```json
{
  "projectPath": "C:/Programming Projects/Pokemon Game/game",
  "referenceProjects": ["…unchanged…"],
  "gbc": {
    "projectPath": "C:/Programming Projects/pokecrystal-PerfPlus",
    "referenceProjects": []
  }
}
```

- Why: all four existing readers only touch `projectPath` and `referenceProjects`, so the change is **zero-diff for GBA code and tests**. Restructuring into a `[{projectPath, family}]` array would break all four. A sibling file would split one concept across two files and add a second "which cwd" lookup.
- `gbc.referenceProjects` receives vanilla pokecrystal later (see G5). GBC tests get a `test/gbc/helpers/corpus.ts` that reads `cfg.gbc.projectPath` and skips when it is absent, mirroring `itWithCorpus`.
- Nothing needs both projects at once. There is one server process per project, as the roadmap §5 guess said.

**Decision 2. Family selection: auto-detect by probing the root.** Use no `--family` flag and no family config field.

| Option | Pro | Con |
|---|---|---|
| Explicit `--family` flag | No inference | Redundant with the root, since the root determines the family. It adds a new failure mode (flag/root mismatch) and must be typed on every call. |
| Config field | Explicit for configured roots | Useless for ad-hoc `--project` paths, which would still need a flag. |
| **Probe marker files (chosen)** | Zero user burden. Works for any root, CLI or server. The existing `openProject` already probes (`fieldmap.h`). | Misdetection risk, mitigated by unique markers plus refusal when neither or both family markers match (I7/G4). |

Markers, verified against all 12 local roots (the subject, all 10 dirs under `Pokemon Game/refs/`, and PerfPlus):

| Root | `include/fieldmap.h` | `attributes.asm` + `map_constants.asm` | Yellow shape | Result |
|---|---|---|---|---|
| `Pokemon Game/game`, `refs/heart-and-soul`, `hns-v2`, `modern-emerald`, `pokeclassic`, `pokeemerald`, `pokeemerald-expansion`, `pokefirered`, `soulgold` (9) | yes | no | no | gba |
| `pokecrystal-PerfPlus` | no | yes | no | gbc |
| `refs/pokeyellow` | no | no | yes (`data/maps/headers/` + `map_constants.asm`, no `attributes.asm`) | refuse: Yellow, Plan 8 |
| `refs/Pokemon-Hyper-Emerald-5.7-QoL` (a binary-patch repo, not a decomp) | no | no | no | refuse: not a decomp |

No root matched both families, and 0 were misdetected.

- **gba** = `include/fieldmap.h`, the same file `openProject` already requires. Present in `Pokemon Game/game`.
- **gbc** (Crystal) = `data/maps/attributes.asm` **and** `constants/map_constants.asm`.
- Future Yellow = `data/maps/headers/` plus `constants/map_constants.asm` without `attributes.asm`. The detector must refuse that shape as "pokeyellow-shaped, unsupported until Plan 8", not treat it as Crystal.

Shape:
- `packages/core/src/family.ts`: `detectEngineFamily(root): "gba" | "gbc"`. It throws, naming every probed path, on neither or both matching.
- Root resolution stays `--project` > `pokemap.config.json` `projectPath`. GBC usage is `pokemap --project "C:/Programming Projects/pokecrystal-PerfPlus" render NewBarkTown -o out.png`.
- **Same `pokemap` binary; no `pokemap-gbc`.**
- In the CLI, split `resolveProject` into a `resolveRoot(explicit)` that returns the path, plus the existing GBA open. Commands branch once on `detectEngineFamily(root)` and call `packages/cli/src/gbcCommands.ts` handlers. GBA-only commands (`sign *`, `paint`, `diff`, `render-world` until Task 11) refuse on GBC with a named message.
- Server: `serve.ts` already takes argv[2]. `createServer` gains the same branch when a GBC UI plan exists. **Plan 6 has no server/UI task**, so the server is untouched in Plan 6.

---

## Decisions (coordinator and user, after Task 1 review)

1. **Config and family wiring land as Task 2's first step**, not as a separate task. The step covers three things:
   - the top-level `gbc` block in `pokemap.config.json`;
   - `packages/core/src/family.ts` (`detectEngineFamily`);
   - the GBC corpus test helper `packages/core/test/gbc/helpers/corpus.ts`.
2. **G5 corpus.**
   - Plan 6 uses a single-member corpus: PerfPlus.
   - The **user** will clone `pret/pokecrystal` into `C:\Programming Projects\Pokemon Game\refs\pokecrystal` before Plan 7.
   - `gbc.referenceProjects` starts as `[]`, and the corpus helper must treat an empty (or absent) list as "no reference roots", not as an error.
3. **CeruleanCave2F / CeruleanCaveB1 bad-size `.blk`** (400 B vs 9×15 = 135).
   - Render the **first w×h bytes, flagged**. This mimics the engine's `ChangeMap` read.
   - Surface a data-defect warning that names the file, its size and w×h.
   - These layouts are never writable: Plan 7 must refuse writes on them.
   - This is likely a PerfPlus fork bug. Report it to the user; this tool does not fix it.
4. **`data/wild/kanto_grass.asm` has no `db -1` terminator.** Same posture as #3.
   - Parse tolerantly: end of file ends the list.
   - Emit a flagged data-defect warning.
   - The corpus test pins exactly this one file as terminator-less.
   - Latent engine consequence: a Kanto map with no grass entry makes `LookUpWildmonsForMapDE` run into `KantoWaterWildMons` at grass stride (§Extra, Wild data). This is likely a PerfPlus fork bug; report it to the user.
5. **Atlas scope (Tasks 8/12):** grass, water, fishing (header `FISHGROUP` → `fish.asm`) and headbutt/rock smash (`treemon_maps.asm` → `treemons.asm`). The data layouts are in §Extra, Wild data.
6. **Roof graphics (tile swap) go to Task 9** (per-map render). **Roof palette colors stay in Task 6.** Task 5's tileset load stays per-tileset and map-agnostic. Task 6 still resolves the full per-map palette set including the roof colors, since it already takes `mapGroup`. Task 9 applies the roof **tile** swap.

---

## Consequences for Plan 6 Tasks 2-12

- **Plan-wide.**
  - The tech stack has no pngjs. PNG decoding is hand-rolled on `node:zlib` (`packages/core/src/load/png.ts` precedent), extended or paralleled for gray depth-2 and RGBA depth-8.
  - Data-defect warnings (Decisions 3 and 4) are one shared shape. Loaders return them alongside data. They never throw and never silently drop them. The CLI prints them.
  - Every line parser must accept a final line with no `\n`.
- **Task 2 (config/family + `.blk` and metatile codec).**
  - **New first step (Decision 1):**
    - Add the `gbc` block to `pokemap.config.json`: `projectPath` = PerfPlus, `referenceProjects: []`.
    - Add `packages/core/src/family.ts` `detectEngineFamily(root)`, with probes and refusals per §Config and a test over the probe table.
    - Add `packages/core/test/gbc/helpers/corpus.ts`. It reads `cfg.gbc`, skips when the subject is absent, and tolerates an empty or absent `referenceProjects`.
    - GBA readers stay untouched.
  - Codec scope is unchanged. `Block = { metatileId }`: 1 byte, row-major, confirmed with no extra bits. The metatile table is 16-byte records of 4×4 tile ids, row-major, with no attribute bits.
  - Round-trip corpus: 305 `.blk` (257 used plus 48 unused betas; include all) and **36** `_metatiles.bin` INCBIN paths (**corrected 2026-09-23, spec review of Task 2**: not 37. `data/tilesets.asm`'s `Tilesets::` table has 37 `tileset` entries, but `Tileset0Meta::`/`TilesetJohtoMeta::` stack onto one INCBIN, and `TilesetCaveMeta::`/`TilesetDarkCaveMeta::` stack onto another -- 37 table entries minus those 2 aliases, plus the unreferenced `unused_johto_metatiles.bin` (not in the table), is 36 distinct files. `dark_cave_metatiles.bin` exists on disk, byte-identical to `cave_metatiles.bin`, but is never INCBIN'd and is excluded from the round-trip set). Enumerate via the INCBINs in `data/maps/blocks.asm` and `gfx/tilesets.asm`, not by globbing.
  - The codec is length-agnostic, so the 2 oversize CeruleanCave files round-trip whole. The w×h handling is Task 3's job.
- **Task 3 (maps).**
  - Split `Map` and `Layout` (§3.6); change the File-structure row for `gbc/model/types.ts`.
  - Parse:
    - `constants/map_constants.asm`: `newgroup`/`map_const NAME, w, h`/`endgroup`. Group index = `newgroup` order from 1; map number = order within the group from 1.
    - `data/maps/attributes.asm`: `map_attributes Name, CONST, border, flags` + `connection dir, Name, CONST, offset`.
    - `data/maps/maps.asm`: `map Name, TILESET, ENV, LANDMARK, MUSIC, phone, PALETTE, FISHGROUP`.
    - `data/maps/blocks.asm`: stacked labels → INCBIN path.
  - **All macro arguments are comma-split expressions** (`RADIO_TOWER_MUSIC | MUSIC_GOLDENROD_CITY`, `WEST | EAST`), never `\w+`.
  - Connection offset axis per §Extra (north/south = x, east/west = y).
  - Border = 1 metatile. 272 maps use `$00`.
  - Layout load for a bad-size `.blk`: first w×h bytes plus a warning (Decision 3), with a `writable: false` marker for Plan 7.
  - Assert corpus counts: 391 maps / 257 layouts / 23 shared / exactly 2 size warnings.
- **Task 4 (asm splice).**
  - **Scope shrinks.** No count bookkeeping (§3.1). It needs:
    - a line locator: macro name + ordinal within a `<Name>_MapEvents` section, or `map_attributes <Name>`, or `map <Name>`;
    - an argument-span splicer that preserves padding, comments, trailing whitespace and **a missing final newline**.
  - The no-op round trip covers all 391 `maps/*.asm` (including the 2 no-final-newline CeruleanCave files), plus `attributes.asm`, `maps.asm`, `map_constants.asm` and the tileset collision files. **Clarified 2026-09-23 (spec review of Task 2):** 37 `*_collision.asm` exist on disk, but `gfx/tilesets.asm` only `INCLUDE`s 32 of them -- 5 on-disk files are orphans, never reached: `dark_cave_collision.asm` (stacks onto `cave_collision.asm` instead, see §Extra) and `ho_oh_word_room_collision.asm`/`kabuto_word_room_collision.asm`/`omanyte_word_room_collision.asm`/`aerodactyl_word_room_collision.asm` (all four stack onto `beta_word_room_collision.asm` instead). Per the same enumerate-don't-glob rule as `.blk`/`_metatiles.bin`, **Task 4/5 should splice/round-trip the 32 `INCLUDE`d files** -- the set the engine actually loads. The 5 on-disk orphans are syntactically valid `tilecoll` files and could be added to a round-trip test for extra confidence, but are not reachable from any tileset and are not required.
  - Record the `object_const_def` positional hazard as a Plan 7 G4 trigger. No Plan 6 action.
- **Task 5 (tileset, per-tileset only).**
  - **Fix path:** palette maps are `gfx/tilesets/<name>_palette_map.asm`, resolved via `gfx/tileset_palette_maps.asm` labels. They are not under `data/tilesets/`.
  - Collision: `data/tilesets/<name>_collision.asm`, TL/TR/BL/BR (§3.3). The token→`COLL_<token>` map comes from `constants/collision_constants.asm`.
  - Metatile count = bin size / 16. Do not take it from collision (forest: 40 vs 64).
  - Tile id → PNG index: derive the bank from the palette-map nibble's bit 3, giving `(bank ? $60 : 0) + (t & $7F)` for `t & $7F < $60`. Alternatively, assert the palette map's uniform shape and use t / t − $20. Otherwise refuse or placeholder.
  - Palette nibble = byte[t >> 1], low nibble for even t.
  - PNG decoder: grayscale depth 2 and RGBA depth 8 (port). Shade = 3 − gray (pin by test).
  - **No roof handling here** (Decision 6).
  - Real excerpts for tests are in §3.2-3.4 above.
- **Task 6 (palette).**
  - **Rewrite the spec:** input `(tilesetConst, environment, mapPalette, mapGroup, {time='day', flash=true})`.
  - Order: `LoadSpecialMapPalette` override (6 tilesets; ice path skipped for INDOOR), else the `EnvironmentColors[env][timeOfDayPal]` → `bg_tiles.pal` index row, then the roof palette for TOWN/ROUTE (colors 1-2 of palette 6).
  - Parse `RGB` with any number of triples per line.
  - Output 8 palettes × 4 RGB colors. 5→8 bit via `(c<<3)|(c>>2)`.
  - Files: `bg_tiles.pal`, `roofs.pal`, `pokecom_center.pal`, `battle_tower_inside.pal`, `ice_path.pal`, `house.pal`, `radio_tower.pal`, `mansion_1.pal`, `mansion_2.pal`; `data/maps/environment_colors.asm`; `data/maps/roofs.asm`.
- **Task 7 (events).**
  - Argument orders exactly as the §3.1 table.
  - Also capture `object_const_def` const names. The expansion is `const_def 2`, so the first listed const = 2 and positionally names the first `object_event`. Also capture `scene_script` and `callback`.
  - `warp_event` dest `-1` is legal.
  - Hour limits: `-1, -1` or `-1, <single flag>`. Store as parsed expressions.
  - `bg_event`'s script pointer target type depends on `BGEVENT_*` (ITEM → `hiddenitem`, IFSET/IFNOTSET → `conditional_event`). Parse as a label only in Plan 6.
- **Task 8 (wild), with grown scope (Decision 5).**
  - **Grass/water:** `data/wild/{johto,kanto,swarm}_{grass,water}.asm`.
    - Grass = 3 rates (morn/day/nite) + 3×7 (level, species). Water = 1 rate + 3 slots.
    - Lookup is by `def_*_wildmons MAP_CONST`, with no pointer table.
    - Slot odds are parsed from `probabilities.asm`, never hardcoded (PerfPlus changed them).
    - Swarm lists are conditional; tag them, don't merge them.
    - `kanto_grass.asm`: EOF terminates, plus a warning (Decision 4).
  - **Fishing:**
    - Map header `FISHGROUP_*` → `FishGroups[FISHGROUP − 1]` (`fishgroup chance, old, good, super`). `FISHGROUP_NONE` means no fishing.
    - Rod tables: cumulative `db pct, SPECIES, level` records.
    - `time_group n` (species 0) → `TimeFishGroups[n]` day/nite pair.
    - Qwilfish/Remoraid swarm substitution is conditional; tag it.
  - **Headbutt/Rock Smash:**
    - `TreeMonMaps`/`RockMonMaps` (`treemon_map MAP_CONST, SET`, `db -1` terminated) → `TreeMons` pointer table → common/rare `db pct, SPECIES, level` lists (non-cumulative, `db -1` terminated).
    - `TREEMON_SET_CITY` (index 0) yields nothing: 13 maps.
    - Rock = one list, 40%.
  - Report base levels. The engine adds a +0 to +4 level buff to grass, and in PerfPlus to surf.
- **Task 9 (render, per map).**
  - **Render per map, not per layout** (palette and roof depend on map fields).
  - Apply the roof **tile** swap here (Decision 6): for JOHTO, JOHTO_MODERN and BATTLE_TOWER_OUTSIDE, `roofs/<MapGroupRoofs[group]>.png` 9 tiles replace ids $0A-$12, with none for `-1`.
  - Border ring exists: 3 blocks, a single border metatile, with block 0 → border substitution. **Metatile 0 as the ring is the common case** (272 maps).
  - Render tests must cover a `border $00` interior (e.g. ElmsLab or PlayersHouse1F) as well as NewBarkTown (JOHTO, TOWN, PALETTE_AUTO, group NEW_BARK (24), roof NEW_BARK).
  - Bad-size maps render the first w×h bytes with the warning surfaced (Decision 3).
- **Task 10 (CLI).**
  - Same `pokemap` binary with probe-based family branching (§Config).
  - `render <map>` takes a GBC map name (`NewBarkTown`). Accepting the `.blk` stem is optional.
  - Handlers live in `packages/cli/src/gbcCommands.ts`. GBA-only commands refuse on GBC.
  - Data-defect warnings print to stderr.
  - Success-criterion command: `pokemap --project "C:/Programming Projects/pokecrystal-PerfPlus" render NewBarkTown -o out.png`.
- **Task 11 (world).** Connection semantics confirmed; the direct port holds, with the offset axis noted above. There are 142 connections, and 77 maps are TOWN/ROUTE. Assess LOD needs from the real stitched extent, as the plan already says.
- **Task 12 (atlas).** **The premise "no day/night variants at the data level" is false.**
  - Grass differs by morn/day/nite. Fishing differs day vs nite through `time_group`.
  - `where`/`coverage` report per-source chances: grass per time slot (slot % × rate), water, fishing per rod, and headbutt common/rare/rock.
  - Scope grows (Decision 5).
- **Roadmap edits.** Applied in the same commit as this revision (`docs/superpowers/plans/2026-09-23-pokemap-plan-6-gbc-roadmap.md`):
  - §0 I7 bullet: the cap is per tileset (40/64/128).
  - §1: `Map`/`Layout` split.
  - G1: cap wording.
  - G4 list: count-desync item dropped; bad-size `.blk` and the missing terminator become flagged read-only data defects; object-const positional hazard and more than 15 objects added.
  - G5: single-member corpus for Plan 6.
  - §3: marked resolved, pointing here.
  - §4: no pngjs.
  - §5: the config shape decided.
