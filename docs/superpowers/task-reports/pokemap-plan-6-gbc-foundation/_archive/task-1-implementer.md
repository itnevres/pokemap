# Plan 6 Task 1: implementer report

**Status:** DONE_WITH_CONCERNS. The concerns are decisions for the coordinator and user, not blockers.
**Commit:** `2c7e045` (`docs: record GBC format findings for Plan 6 Task 1`). It contains only the findings doc.
**Deliverable:** `docs/superpowers/specs/2026-09-23-pokemap-gbc-format-findings.md`
**PerfPlus:** `git status --porcelain` shows 0 lines before and after. HEAD is `81ededbe3`. Nothing was written there. No GBA or source file was touched.
**Method:** real macro and engine reads, plus 4 throwaway Node scripts in the session scratchpad that measured the WHOLE corpus: 391 maps, 305 `.blk`, 37 metatile bins, 37 collision files, 36 PNGs, all `maps/*.asm`.

## Per item (roadmap §3)
1. **Event counts.** Assembler-computed: `def_*` emits `db {_NUM_X_\@}` and each `*_event` does `+= 1`. `db 0, 0 ; filler` is 2 dead bytes that `ReadMapEvents` skips with `inc hl` ×2. The G4 "count desync" item does not exist, so drop it. Arg orders and emitted byte layouts are in the doc's table. **New hazard:** the `object_const_def` const list is positional and hand-maintained. It matches the object count in 350 maps, is absent in 40, and has 1 fewer const in `MoveDeletersHouse`. Removing or reordering objects re-targets script consts. This is a Plan 7 G4 item. Max 15 objects per map (`NUM_OBJECTS` 16).
2. **Metatile cap.** It varies by tileset: 128 for johto, johto_modern, kanto and battle_tower_outside; **40 for forest**; 64 for the rest. Each metatile is 16 bytes of tile ids with no attribute bits. Forest has 64 collision entries against 40 metatiles, so derive the cap from bin size. PerfPlus **fixed** the vanilla 128-wrap bug (`home/map.asm` diff), so the engine id space is 0-255. The corpus has 0 over-range ids.
   - Placed metatiles use tile ids only in $00-$5F and $80-$DF. The PNG index is t, or t−$20 for $80-$DF, because `LoadTilesetGFX` loads bank 1 into vTiles5 and `_SwapTextboxPalettes` does `res 7`.
3. **Collision.** `tilecoll` is defined in `gfx/tilesets.asm`: 4 bytes, `db COLL_\1..\4`. The order is TL, TR, BL, BR, proven from `GetCoordTile`. 109 `COLL_*` values in total; 54 tokens are used, including hex-named ones (`01`, `FF`, `5B`).
4. **Palettes.** The roadmap is **wrong**. `bg_tiles.pal` holds 42 palettes indexed by environment row × time slot (`environment_colors.asm`). On top of that:
   - 6 tilesets override all palettes (`LoadSpecialMapPalette`);
   - TOWN/ROUTE maps get the roof palette (colors 1-2 of palette 6) by map group;
   - JOHTO, JOHTO_MODERN and BATTLE_TOWER_OUTSIDE get roof TILE graphics ($0A-$12) from `roofs/*.png` by map group.
   - The time slot is `BrightnessLevels[mapPalette][clock]`.
   - Recommended default: DAY clock with Flash on, so DARK maps render as NITE. 5-bit → 8-bit via `(c<<3)|(c>>2)`.
   - **Render must be per-map, not per-layout.**
5. **Region map.** Tile-composed: `gfx/pokegear/{johto,kanto}.bin` is 20×18 + `$ff`, tiles come from `town_map.png`, plus a `landmarks.asm` pixel-coordinate table. It is closer to GBA than to Yellow. Out of scope.
6. **`.blk` sharing.** **Not 1:1.** 391 maps map to 257 used `.blk`. 23 files are shared by 157 maps (`House1.blk` ×50, `Pokecenter1F` ×21, …). All sharers agree on dimensions and tileset. **Split Map and Layout.** This reverses Plan 6's file-structure assumption. There are **2 real size mismatches**, both PerfPlus-added: `CeruleanCave2F.blk` and `CeruleanCaveB1.blk` are 400 bytes against a declared 9×15 = 135.

## Surprising / plan-text corrections
- The border concept EXISTS: a single metatile id in `map_attributes` \3, a 3-block padding ring, and block 0 renders as the border.
- The connection offset axis is the reverse of the macro's own comment: north/south = x, east/west = y.
- Wild data: the path is `data/wild/*.asm` (no `data/wild/maps/`). Grass HAS morn/day/nite rates and species (3×7 slots). There is no `WildDataPointers`; lookup is a linear search. Plan Tasks 8 and 12 premises are false.
- `port.png` (a PerfPlus edit) is 8-bit RGBA. The other 35 PNGs are 2-bit gray. The existing `png.ts` is indexed-only, and **the repo has no pngjs**, despite what the plan says.
- Palette maps live in `gfx/tilesets/*_palette_map.asm`, not `data/tilesets/`.
- Vanilla pokecrystal is inside PerfPlus's own history at `804fa846e`. It can serve as a G5 corpus member with no clone, via `git archive` to a temp dir. I did NOT run that.
- **UNRESOLVED:** that gray → shade = 3−gray (white = 0). This is rgbgfx's default behavior, but there is no compiled `.2bpp` and no rgbgfx locally to verify it. Task 5 must pin it with an independent check.

## Decisions made
- **Config:** add a top-level `"gbc": { projectPath, referenceProjects }` block to `pokemap.config.json`. It is zero-diff for the 4 existing readers (`cli/context.ts`, `server/serve.ts`, `core/test/helpers/corpus.ts`, `core/test/write/corpus.test.ts`), which read only `projectPath`/`referenceProjects`.
- **Family:** probe-based `detectEngineFamily(root)` in `packages/core/src/family.ts`.
  - gba = `include/fieldmap.h`.
  - gbc = `data/maps/attributes.asm` + `constants/map_constants.asm`.
  - Refuse on neither or both. Refuse a Yellow shape (`data/maps/headers/` without `attributes.asm`).
  - No `--family` flag. Same `pokemap` binary. GBC handlers go in `cli/src/gbcCommands.ts`. GBA-only commands refuse on GBC.
  - The server is untouched in Plan 6, which has no server/UI task.

## Coordinator must decide
1. Where the config edit plus GBC corpus test helper lands: a Task 1b, or step 1 of Task 2.
2. The G5 second member, before Plan 7: user clones `pret/pokecrystal` into `refs/`, or tests `git archive 804fa846e` into a temp dir. A single member is fine for Plan 6.
3. The 2 bad-size CeruleanCave maps: refuse (recommended, G4), or allow a flagged "engine reads first w×h bytes" render. Also: tell the user? It is likely a real PerfPlus bug in their fork.
4. Task 8/12 scope: whether to include fishing (`FISHGROUP`) and headbutt (`treemon_maps`) sources.
5. Roof-tile swap: Task 5 or Task 9.
6. Apply the roadmap edits listed at the end of the findings doc (G4 list, I7 cap wording, §1 Map/Layout, §4 pngjs).

## Fix round 1

**Status:** DONE. **Commit:** `c08879b`. It contains the findings doc and the roadmap only. PerfPlus `git status --porcelain` shows 0 lines.

Every review item was re-verified with my own script (`scratchpad/verify.mjs`, `portdiff.mjs`) or a direct read before editing.

| # | Review item | Verified | Applied |
|---|---|---|---|
| 1 | border $00 | 272/391 maps, confirmed | §3.2 + §Extra Border rewritten. Task 9 now requires a `border $00` interior render test |
| 2 | kanto_grass no `db -1` | Confirmed: no terminator, no final newline; vanilla has it. `wildmons.asm` INCLUDEs kanto_grass then kanto_water back-to-back, so the lookup runs into KantoWaterWildMons at the 47-byte stride | Wild item 2 + Decision 4 |
| 3 | 2 engine fixes / data-change list | Confirmed: ReadObjectEvents `NUM_OBJECTS - 1` fix; 65 `maps/` files (61 asm + 4 blk); 65 event lines ±; probabilities old→new; KCITY/KTOWN/KROUTE added; port.png 30 px differ in tiles $0C/$1C (my own decode); wildmons.asm surf level buff | Header rewritten |
| 4 | no final newline | Confirmed: CeruleanCave2F/B1.asm, kanto_grass.asm, plus 3 files outside the Plan 6 read set (`data/types/category_names.asm`, 2 trainer_card `.pal`) | §3.1 bullet, Task 4/7/8 notes |
| 5 | header args are expressions | Confirmed: RadioTower1F-5F `RADIO_TOWER_MUSIC \| MUSIC_GOLDENROD_CITY` | §Extra + Task 3 |
| 6 | wild file list | Confirmed: 15 files | Listed all 15 |
| 7 | family probe table | Re-probed all 12 roots myself: 9 gba, 1 gbc, yellow-shape 1, neither 1, both 0 | Table added |
| 8 | hour-limit wording | Confirmed: DAY ×5, MORN ×3, NITE ×3, 0 combos | Fixed |
| opt | shade corroboration | **Partial disagreement.** The reviewer says all 42 `bg_tiles.pal` palettes are lightest-first and darkest-last. My Rec.601 check: color 0 lightest in 42/42, color 3 darkest in only **40/42**. The 2 `water` lines have `01,04,31` (luma 6.2) darker than `07,07,07` (7.0). By R+G+B sum, 3 lines deviate (green ×2, morn roof). | Cited with the accurate numbers, plus the `.cgbfade` identity and rgbds 0.6.1. Conclusion unchanged (high confidence, pin in Task 5) |
| opt | bank comes from the nibble | Confirmed: all 37 palette maps are uniform, 0 deviations (script) | Note + nibble-based formula in §3.2 and Task 5 |

**Decisions recorded** (new "Decisions" section, which replaces the open items):
1. Config, family detection and the GBC corpus helper are Task 2's first step.
2. Single-member corpus for Plan 6; the user clones vanilla before Plan 7; the helper tolerates an empty `referenceProjects`.
3. CeruleanCave: first w×h bytes plus a warning, never writable. Confirmed `ChangeMap` copies exactly h rows × w bytes.
4. kanto_grass: tolerant parse plus a warning, pinned in the corpus test.
5. Atlas includes fishing and headbutt.
6. Roof tiles go to Task 9. Task 6 keeps the roof palette colors because it already takes mapGroup.

**Fishing and headbutt measured and added** (§Extra, Wild):
- `fishgroup` macro, `FishGroups[FISHGROUP−1]`, `FISHGROUP_NONE` = no fishing.
- Rod tables use cumulative percentages.
- `time_group n` (species 0) → `TimeFishGroups[n]` day/nite pair, 22 rows.
- Qwilfish/Remoraid swarm substitution.
- `treemon_map` has 66 tree and 4 rock entries.
- `TreeMons` pointer table has 11 sets; label order differs from set order.
- **`TREEMON_SET_CITY` (index 0) yields nothing**: `GetTreeMons` does `and a / jr z, .quit`, and 13 maps use it. This is new.
- Common/rare lists use non-cumulative percentages, with the score-based 10/50/80% encounter chance. Rock is 40%, single list.
- Grass/surf +0 to +4 level buff.

**Roadmap edits** (surgical):
- §0 rows I1, I3 and I7;
- §1 detectEngineFamily decided and the Map/Layout split;
- G1 measured caps;
- G4 list (count item struck; bad-size, terminator, object-const and >15 objects added);
- G5 single-member corpus;
- §3 RESOLVED banner;
- §4 no pngjs;
- §5 config decided.

The plan-6 file itself was not edited; the coordinator re-granularises it.
