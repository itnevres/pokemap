# Plan 6 Task 1 — adversarial review of `docs/superpowers/specs/2026-09-23-pokemap-gbc-format-findings.md` (commit 2c7e045)

**Verdict: CHANGES_REQUIRED (8 issues).** Core format claims (event macros, metatile/collision/palette/tile-id mapping, .blk sharing, connections) all re-derived and correct. Defects: one false corpus claim (border 0), one false wild-data claim (terminator), inaccurate PerfPlus-vs-vanilla summary, and several parser-relevant irregularities the doc missed.

Method: own Node scripts in scratch (not the implementer's), whole-corpus. Read-only on PerfPlus: `git status --porcelain` empty before and after; HEAD `81ededbe3`. Implementer report not consulted.

## Per-claim results

### Header / PerfPlus vs vanilla
| Claim | Result |
|---|---|
| 391 maps, 26 groups, 391 attrs/headers/asm, 305 .blk, 257 used, 48 unused, 142 conns, 36 tilesets + `Tileset0`, 1327/114/792/1468 events, no CRLF | ✅ all measured identical |
| `804fa846e` = last upstream (Rangi42, 2024-01-01), ancestor of HEAD | ✅ `git log`, `merge-base --is-ancestor` |
| "no format change except **one** engine fix, described in **§2**" | ❌ `git diff 804fa846e HEAD -- home/map.asm` has **two** fixes: LoadMetatiles (`add a` removed, 4th `add hl, hl`) **and** ReadObjectEvents overflow (`NUM_OBJECTS` → `NUM_OBJECTS - 1`, + `jr c, .skip`). Section ref should be §3.2. |
| "data changes are 3 new maps, Route4.blk, kanto_collision, roofs.pal, re-saved port.png, wild edits" | ❌ incomplete: 65 `maps/` files changed (65 `*_event` lines ±, e.g. VioletGym/ViridianGym/VermilionGym), `data/wild/probabilities.asm` changed (grass 30/30/20/10/5/4/1 → 25/25/20/10/10/5/5; water 60/30/10 → 45/30/25), treemon files. port.png is content-edited (30 px differ vs vanilla after decode), not merely re-saved. |

### §3.1 events
| Claim | Result |
|---|---|
| `def_*` emit `db {_NUM_X_\@}`, `*_event` increments; no editor-maintained count | ✅ read `macros/scripts/maps.asm` (all 6 `def_*`; `def_scene_scripts` also `const_def`) |
| def_warp_events/warp_event excerpt verbatim | ✅ |
| `db 0, 0 ; filler` skipped (`inc hl` ×2 in ReadMapEvents; `rept 3` in GetWarpDestCoords) | ✅ `home/map.asm:402`, `:657` excerpts verbatim |
| 389 std filler / 2 bare (CeruleanCave1F, 2F) | ✅ |
| Arg orders & emitted bytes (warp 5, coord 8, bg 5, object 13, scene_script dw+dw0, callback dbw) | ✅ vs macro defs; `WARP_EVENT_SIZE EQU 5`, `OBJECT_EVENT_SIZE … ; 13`. Arg counts 1327/4, 114/4, 792/4, 1468/13 ✅ |
| warp dest -1 "4 files" | ✅ 4 files, 6 lines (CeladonDeptStoreElevator 2, GoldenrodDeptStoreElevator 2, FastShip1F, Pokecenter2F) |
| BGEVENT counts READ 632 ITEM 85 UP 47 RIGHT 12 LEFT 10 IFNOTSET 4 IFSET 1 DOWN 1 | ✅ |
| 1457 `-1, -1`; 11 `-1, DAY|NITE|MORN` | ⚠️ counts ✅ but wording implies a combo; real values are single flags: `-1, DAY` ×5, `-1, MORN` ×3, `-1, NITE` ×3, 0 combos |
| one `_MapEvents:`/`_MapScripts:` per file; all 391 INCLUDEd in scripts.asm; event tail only def/event/comment lines; section order fixed | ✅ 0 stray, 0 order violations |
| 5 files trailing comments; 22 files trailing WS; CeruleanCave1F label/def trailing space + tab-only line; tabs only | ✅ (`cat -A` confirms lines 8, 11, 12) |
| maxima 33 EcruteakGym / 30 TeamRocketBaseB1F / 38 CeladonGameCorner / 15 GoldenrodCity; `NUM_OBJECTS EQU 16` | ✅ |
| object_const_def = `const_def 2`; 350 equal / 40 none / 1 fewer (MoveDeletersHouse 1/2) | ✅ |
| scene_script 170, callback 105 | ✅ |

### §3.2 metatiles
| Claim | Result |
|---|---|
| 128: johto, johto_modern, kanto, battle_tower_outside (+unused_johto 2048 B, `; unreferenced`); 40: forest; 64: other 31 | ✅ sizes from each tileset's resolved `Meta` INCBIN; all 37 bins %16 = 0 |
| forest collision 64 lines vs 40 metatiles | ✅ only mismatch |
| 16 B/metatile, no attribute bits | ✅ LoadMetatiles copies raw 4×4 (`rept METATILE_WIDTH`); `METATILE_WIDTH EQU 4` |
| 0 block ids ≥ count | ✅ (checked in-map + border) |
| **"No real map uses block id 0 … or as `border` via 0"** | ❌ in-map: 0 ✅. Border: **272 / 391 maps have `border = $00`** (every INCLUDE-style interior: all Pokecenters, Marts, Houses, gates, towers…). Contradicts the doc's own "values seen: $00 …". For these maps the 3-block ring renders **metatile 0**. |
| PerfPlus 128-wrap fix diff excerpt; vanilla aliases ≥128 | ✅ verbatim vs `git diff 804fa846e HEAD -- home/map.asm` |
| johto_metatiles first 48 bytes | ✅ |
| Tile id → PNG index: t<$60 → t; $80–$DF → t−$20 | ✅ **hand-traced**: `LoadTilesetGFX` copies scratch[0,$60) → `vTiles2` (bank 0, $9000) and scratch[$60,$C0) → `vTiles5` (bank 1, $9000). `LCDC_DEFAULT` lacks the tile-data bit ⇒ $8800 signed mode, ids 0–$7F address $9000+. Palette nibble looked up with the raw id (`srl a` → byte t>>1), then `res 7, [hl]` (`engine/tilesets/map_palettes.asm`, both `_SwapTextboxPalettes` and `_ScrollBGMapPalettes`). Id $80+k → tilepal-1 nibble (bank bit 3 set) → id k in bank 1 → `vTiles5[k]` = PNG $60+k = t−$20. |
| Placed ids only in $00–$5F ∪ $80–$DF; $60–$7F/$E0–$FF only in unplaced metatiles | ✅ union over every metatile placed by a real map incl. border. (Bins containing such ids: battle_tower_outside, house, pokecenter, port, lab, champions_room, tower, beta_word_room — doc's "examples" list is a subset; fine.) |
| palette nibble = `bank<<3 | pal`, no flip | ✅ `tilepal` macro, `OAM_TILE_BANK EQU 3` |

### §3.3 collision
| Claim | Result |
|---|---|
| `tilecoll` in `gfx/tilesets.asm`, `db COLL_\1..\4` | ✅ verbatim |
| Quadrant order TL,TR,BL,BR | ✅ traced GetCoordTile: `hl = id*4` (16-bit, no wrap) + collision base; `rr d` carry (odd x, 16-px units) → +1; `rr e` carry (odd y) → +2. Block 0 → `-1` ✅ |
| johto_collision excerpt lines 00/01/07/0c | ✅ verbatim (lines 1, 2, 8, 13) |
| 109 `COLL_*` consts; 54 distinct tokens; hex tokens; all defined; only tilecoll lines w/ `; xx`; no CRLF | ✅ (hex tokens: 01 03 04 5B 64 65 9C FF) |

### §3.4 palettes
| Claim | Result |
|---|---|
| TimesOfDay 0400/1000/1800; DARKNESS never from clock | ✅ `engine/rtc/rtc.asm:48` |
| BrightnessLevels excerpt; `dc` packs arg1 in bits 7-6 ⇒ columns DARK,NITE,DAY,MORN; GetTimePalette extracts by wTimeOfDay ⇒ `BrightnessLevels[mapPal][tod]` | ✅ (also 3 unused padding rows after PALETTE_DARK — irrelevant) |
| PALETTE_DARK: no Flash → DARKNESS_PALSET, Flash → all-NITE | ✅ ReplaceTimeOfDayPals |
| palette field = low nibble of `dn \6, \7` | ✅ `GetMapTimeOfDay: and $f` |
| DAY 270 / AUTO 78 / NITE 30 / DARK 13 | ✅ |
| 6 special tilesets, ice-path INDOOR skip, mansion patching (YELLOW←m2, WATER←m1 pal 6, ROOF←m1 pal 8) | ✅ `engine/tilesets/tileset_palettes.asm` |
| special pals 32 colours, mansion_1 36, mansion_2 4, 1 colour/line | ✅ |
| EnvironmentColorsPointers mapping; row index = wTimeOfDayPal (maskbits 4) | ✅ LoadMapPals `engine/gfx/color.asm:1197`. Excerpt of IndoorColors omits its 4th (dark) row — truncation, not error |
| bg_tiles.pal 42 palettes, sections morn/day/nite/dark/indoor(8 each)/water(2) | ✅ 168 colours; section headers at lines 1/11/21/31/41/51 |
| PAL_BG_* order | ✅ |
| Roof pal: TOWN/ROUTE only, `RoofPals[group*8]`, +4 if tod ≥ NITE_F, overwrites ROOF colours 1–2; 27 entries | ✅ (54 RGB lines, 2 colours each) |
| Roof tiles: JOHTO/JOHTO_MODERN/BATTLE_TOWER_OUTSIDE, 9 tiles → `vTiles2 tile $0a` | ✅ `ROOF_LENGTH EQU 9`; roof PNGs 24×24 d2 gray |
| palette_map shape: all 37 = 12×tilepal 0, rept 16 $ff, 12×tilepal 1 | ✅ all 37 exact |
| low nibble = even tile | ✅ `dn (x|\3),(x|\2)` + `srl a / jr c, .UpperNybble` |
| `.cgbfade` at c=$9 = `dc 3,2,1,0` identity | ✅ byte offset 9 = row 4 |

### §3.5 region map
✅ johto.bin/kanto.bin 361 B, first $ff at offset 360; first 16 bytes match; FillTownMap copies until -1; town_map.png 128×24 d2 gray; `TownMapGFX` in `gfx/font.asm`; 6 `PAL_TOWNMAP_*`; `$60 and above use palette 0` comment verbatim; `landmark` → `db \1 + 8, \2 + 16`.

### §3.6 .blk sharing
✅ 439 labels / 305 INCBINs; 257 distinct used; 23 shared by 157 maps; top counts House1 ×50, Pokecenter1F ×21, Mart ×13, NorthSouthGate ×12, Pokecenter2F ×11, EastWestGate ×10; 0 w×h/tileset conflicts; 48 unused all `maps/unused/Beta*`; every on-disk .blk INCBINed; exactly 2 size mismatches CeruleanCave2F/B1 400 B vs 9×15; NewBarkTown 90 B, first 20 bytes match; DeptStore1F stacked-label excerpt verbatim. Per-map-render justification ✅: among shared groups, environment differs in 1 and map group in 18 (border/palette 0).

### Extra findings
| Claim | Result |
|---|---|
| Border = 1 metatile; ring `MAP_CONNECTION_PADDING_WIDTH EQU 3`; zero-fill; 0 → border substitution | ✅ ChangeMap stride w+6, origin offset 3·(w+6)+3; LoadMetatiles `and a / jr nz / ld a, [wMapBorderBlock]` |
| Connection offset axis N/S = x, E/W = y, reversed vs macro comment; units blocks; target origin = current + offset | ✅ `_x = (\4) * -2` and `_len = CURRENT_MAP_WIDTH + … - (\4)` for N/S; `_y`/HEIGHT for E/W; comment says the opposite. Excerpt `connection west, Route34, ROUTE_34, -18` under AzaleaTown ✅ |
| 142 conns all 4-arg; order N,S,W,E 0 violations; flags match 0 mismatches | ✅ |
| map header arg order; NewBarkTown line verbatim | ✅ (see issue 5: args can be expressions) |
| Tileset aliases (BTOutside GFX = johto_modern; 5 word rooms = ruins_of_alph GFX + palmap; Tileset0 = Johto; DarkCave palmap = cave) | ✅ |
| 36 PNGs 128 wide, 28×96-tall + 8×48-tall (list correct); 48-tall ones place no id ≥ $60 | ✅ |
| 35 gray d2 ct0; port.png d8 ct6 with exactly 0/85/170/255 opaque gray | ✅ decoded; none interlaced |
| core `load/png.ts` indexed type 3, depth 4/8 only; no pngjs | ✅ `png.ts:27,29`; no `pngjs` in any package.json, no `node_modules/pngjs` |
| Makefile tileset rule plain `$(RGBGFX) $(rgbgfx) -o $@ $<`, no `-c` | ✅ catch-all `%.2bpp: %.png`, no tileset override |
| wild: path, grass 3 rates + 3×7, water 1 + 3, lengths/asserts, no WildDataPointers, linear search swarm→Johto/Kanto | ✅ (`LookUpWildmonsForMapDE` stride bc until byte $ff; `_JohtoWildmonCheck` via IsInJohto) |
| wild: "Each file ends with `db -1 ; end`" | ❌ see issue 2 |
| wild file list | ⚠️ omits `flee_mons.asm`, `treemons_asleep.asm`, `unlocked_unowns.asm` |
| probabilities 25,25,20,10,10,5,5 / 45,30,25 | ✅ (PerfPlus-modified — see issue 3) |
| No CRLF; 0 trailing WS in attributes/maps/map_constants/blocks/gfx/tilesets.asm | ✅ — but see issue 4 (no final newline) |
| G5 `git archive 804fa846e` path | ✅ feasible (commit present locally) |

### Config / family decision
| Claim | Result |
|---|---|
| 4 readers of `pokemap.config.json`, read only projectPath/referenceProjects | ✅ literal readers: `packages/cli/src/context.ts:17`, `packages/server/src/serve.ts:7`, `packages/core/test/helpers/corpus.ts:9`, `packages/core/test/write/corpus.test.ts:15` (worktree copies under `.claude/worktrees/` ignored). Top-level `gbc` block is zero-diff for them. |
| `openProject` requires `include/fieldmap.h` | ✅ |
| Probes gba=`include/fieldmap.h`, gbc=`data/maps/attributes.asm`+`constants/map_constants.asm` | ✅ no mis-detect, no "both": `game`, `refs/heart-and-soul`, `hns-v2`, `modern-emerald`, `pokeclassic`, `pokeemerald`, `pokeemerald-expansion`, `pokefirered`, `soulgold` → gba (all pokeemerald-derived GBA decomps). PerfPlus → gbc. `pokeyellow` → neither (has `data/maps/headers/` + `map_constants.asm`, no attributes.asm) ⇒ Yellow-shape rule correct. `Pokemon-Hyper-Emerald-5.7-QoL` → neither (binary-patch repo, not a decomp) ⇒ correct refusal. Doc only evidences 2 roots — issue 7. |
| Trade-off table (flag / config field / probe) | ✅ present, reasoned |

### §11 gray → shade (doc: UNRESOLVED)
⚠️ Not provable offline: no `.2bpp`/`.lz`/ROM anywhere in PerfPlus or refs/pokeyellow; rgbgfx not on PATH; `.gitignore` excludes `*.2bpp`, `*.lz`. Strong corroboration the doc should cite: (a) all 42 `bg_tiles.pal` palettes have colour 0 = lightest and colour 3 = darkest (`07,07,07` / `00,00,00`; 39/42 strictly monotonic, the other 3 still lightest-first/darkest-last); (b) `.cgbfade`/`.dmgfades` identity `dc 3,2,1,0` = DMG convention index 0 = white; (c) INSTALL.md pins rgbds 0.6.1. ⇒ PNG white → index 0, i.e. `shade = 3 − gray2` / `3 − (v>>6)`, high confidence. port.png (RGBA) goes through rgbgfx's non-grayscale palette path; the same mapping holds only because it uses all 4 grays in one palette — keep the test pin as the doc says.

### Completeness vs spec
✅ six §3 items each answered with cited path + real excerpt; design consequences per item; config + family decision with trade-off; consequences for Tasks 2–12 all present; roadmap-edit list present.

## Required corrections to the findings doc
1. **§3.2 border-0 claim (false).** Replace "No real map uses block id 0, either inside the map area or as `border` via 0" with: block 0 is never placed inside a map, but **272/391 maps have `border = $00`**, so their 3-block ring renders metatile 0. Task 9 consequence: ring rendering of metatile 0 is the common case (all interiors), and a corpus render test must cover a `border $00` map (e.g. ElmsLab / PlayersHouse1F).
2. **Wild terminator (false).** "Each file ends with `db -1 ; end`" is wrong: PerfPlus `data/wild/kanto_grass.asm` has **no `db -1` terminator** and no final newline (vanilla `804fa846e` has it). Engine consequence: `LookUpWildmonsForMapDE` for a Kanto map with no grass entry runs past into `KantoWaterWildMons` at grass stride (latent PerfPlus bug). Task 8: parser must not require the terminator; corpus test must assert this one missing-terminator file; flag as a data defect (warn/report) rather than silently accept — coordinator decides warn vs refuse.
3. **PerfPlus-vs-vanilla summary.** Two engine fixes in `home/map.asm` (add the ReadObjectEvents `NUM_OBJECTS - 1` fix); fix the "§2" ref → §3.2; data-change list must add ~60 edited `maps/*.asm` (65 `*_event` lines changed), `probabilities.asm` (list vanilla vs PerfPlus odds), treemon files; port.png content-edited (30 px). Consequence: Tasks 8/12 must parse `probabilities.asm`, never hardcode odds; a vanilla corpus member will differ there.
4. **No-final-newline files.** Add: `maps/CeruleanCave2F.asm`, `maps/CeruleanCaveB1.asm`, `data/wild/kanto_grass.asm` lack a trailing `\n`. Task 4 (G3 splicer) round-trip must preserve this byte-exactly; Task 7/8 line parsers must handle a last line without `\n`.
5. **Map header args are expressions.** `RadioTower1F`–`5F` use music `RADIO_TOWER_MUSIC | MUSIC_GOLDENROD_CITY`. Task 3 must split header args on commas and treat each as an expression (same as `connection` flags `WEST | EAST`), not match `\w+`.
6. **Wild file list** in "Wild data" item 1: add `flee_mons.asm`, `treemons_asleep.asm`, `unlocked_unowns.asm` (or say "includes").
7. **Family-probe evidence.** "verified against real trees" names only 2 roots; add the 12-root result table above (9 gba, 1 gbc, pokeyellow neither/Yellow-shaped, Hyper-Emerald neither/non-decomp; 0 both, 0 mis-detections).
8. **Hour-limit wording.** Replace "11 use `-1, DAY|NITE|MORN`" with "11 use a single time flag: `-1, DAY` ×5, `-1, MORN` ×3, `-1, NITE` ×3 (no combos)".

Optional (not counted): cite the palette-ordering corroboration for shade = 3 − gray (§11 above); note that bank selection is really the palette-map nibble's bit 3 (the `t−$20` rule is equivalent only because all 37 palette maps are uniform — Task 5 should assert that uniformity or derive bank from the nibble).

---

# Re-review 1 (commit `c08879b` vs `2c7e045`)

**Verdict: CHANGES_REQUIRED (2 issues)** — both one-sentence text fixes; all prior items correctly applied, all new format content verified. PerfPlus `git status --porcelain` empty before/after.

## (a) Prior corrections
| # | Result |
|---|---|
| 1 border $00 | ✅ §3.2 bullet + §Extra Border (272/391); Task 9 requires a `border $00` render test |
| 2 kanto_grass terminator | ✅ wild item 2 + Decision 4; vanilla tail description matches `git show 804fa846e:data/wild/kanto_grass.asm`; 47-byte stride = 2+3+42 ✅; back-to-back INCLUDE ✅ (`wildmons.asm:1066-1067`) |
| 3 PerfPlus summary | ✅ both engine fixes; 65 `maps/` files (61 asm + 4 blk); probabilities old→new; KCITY/KTOWN/KROUTE (+3 consts) ✅; port.png 30 px in tiles $0C/$1C ✅ (own decode); kanto_collision = HEADBUTT_TREE/CUT_TREE edits ✅; wildmons surf buff ✅ |
| 4 no final newline | ✅ + 3 extra files (`data/types/category_names.asm`, `gfx/trainer_card/{johto,kanto}_badges.pal`) confirmed last byte ≠ `\n`; Tasks 4/7/8 + plan-wide note |
| 5 header expressions | ✅ §Extra + Task 3 |
| 6 wild file list | ✅ 15 files = `ls data/wild` |
| 7 probe table | ✅ matches my 12-root probe exactly |
| 8 hour wording | ✅ |
| opt shade corroboration | ✅ **Implementer is right, I was wrong.** Rec.601 luma: colour 0 lightest 42/42; colour 3 darkest 40/42; exceptions palettes `$03`/`$0B` (morn/day water: `01,04,31` luma 6.18 < `07,07,07` 7.00). My original "all 42 darkest-last" came from an R+G+B-sum check that itself showed 3 non-monotonic palettes; I misreported it. Doc text now accurate. |
| opt bank from nibble | ✅ §3.2 + Task 5; formula `(nibble&8 ? $60 : 0) + (t & $7F)` correct per trace |

## (b) New content (Decisions, fishing, headbutt)
| Claim | Result |
|---|---|
| `fishgroup` macro, `FISHGROUP_DATA_LENGTH EQU 1 + 2 * 3`, Shore excerpt, `time_group EQUS "0,"` | ✅ verbatim |
| 13 groups + NONE; NONE = can't fish (`and a / jr nz, .goodtofish`); index `FISHGROUP−1` (`dec d`) | ✅ `engine/events/overworld.asm:1673-1675`, `engine/events/fish.asm` |
| bite = `Random < chance`; record = first with `Random ≤ chance`; no terminator, every rod table ends `100 percent` | ✅ all 39 rod tables checked |
| TimeFishGroups rows day/nite, nite when tod ≥ NITE_F, 22 rows, row 0 excerpt | ✅ |
| **"With the daily fish-swarm flag set, QWILFISH and REMORAID are swapped to `_SWARM`"** | ❌ incomplete: `GetFishGroupIndex` also requires `wFishingSwarmFlag == FISHSWARM_QWILFISH` (resp. `FISHSWARM_REMORAID`); only the matching group swaps. |
| `treemon_map` → `map_id` + `db`; TreeMonMaps 66, RockMonMaps 4 (names ✅), both `db -1`; linear search | ✅ |
| TreeMons 11 sets, file label order KCity/KRoute/KTown ≠ table order | ✅ |
| SET_CITY → `and a / jr z, .quit`; 13 maps | ✅ (City label is stacked on Canyon, so data exists but is unreachable — consistent) |
| common/rare `db -1` lists, non-cumulative (`RandomRange 100`, `sub [hl]`), 10/50/80% by score, rare skips common list | ✅ |
| Rock: 90 KRABBY / 10 SHUCKLE, 40% (`RandomRange 10`, `cp 4`) | ✅ |
| level buff 35/30/20/10/5 → +0..+4, skipped for SUICUNE | ✅ `wildmons.asm:298-314` |
| Decisions 1–5 | ✅ consistent with findings + Task consequences. "user's choice" labels not verifiable by me (coordinator's record). |
| **Decision 6** | ❌ internally inconsistent: heading "**Roof graphics and roof palette go to Task 9**" vs body "Task 6 still resolves … including the roof colors" (and Task 6 consequence still lists `roofs.pal`/roof step). Heading must say roof *graphics* go to Task 9, roof *palette* stays in Task 6. |

## (c) Roadmap edits
✅ Surgical: only I1/I3/I7 rows, §1 detect sentence + Map/Layout paragraph, G1, G4 list, G5 sentence, §3 RESOLVED banner (original questions kept), §4 pngjs, §5 decided prefix (original kept). All consistent with findings (caps 40/64/128, 272-border not needed there, bad-size read/refuse-write = Decision 3, terminator = Decision 4, >15 objects, object-const hazard, single-member corpus = Decision 2).

## (d) Regressions
None found. Unchanged sections still match my original verification; no new unverified numbers outside those checked above.

## Required corrections
1. §Extra Fishing, "Group → table" bullet: swap happens only when the daily fish-swarm flag is set **and** `wFishingSwarmFlag` equals `FISHSWARM_QWILFISH` (→ `FISHGROUP_QWILFISH_SWARM`) or `FISHSWARM_REMORAID` (→ `FISHGROUP_REMORAID_SWARM`); tag with that condition.
2. Decision 6 heading: "Roof **graphics** go to Task 9; roof **palette** colours stay in Task 6" — match the body.
