# Plan 15a: Town map loaders and read-only view

Per-engine loaders for the in-game region map (GBA `src/data/region_map/`; Crystal's town map data and pokegear graphics) behind the adapter, and a fourth view in the shell that shows them read-only in both families. It first finishes the layout rules (the 1,024 px minimum width, the light theme removed, stylesheet tokens and split). It then starts with a measurement of both formats in the subject decomp and pokecrystal-PerfPlus, written into the spec. Plan 15b adds the writers and tools; Plan 16 builds on these loaders (D24b).

## Status

Open. Not started; needs a measurement step and a spec first.

## Depends on

- Plan 14C (D17), then Plan 3 Tasks 2-3, in the execution order.
- Risk: high. Two unfamiliar formats.

## Binding decisions

- D14, D22, D23, D24a, D24b, D26, D35 (text in [decisions.md](decisions.md)).

## Requirements

**Layout and stylesheet first (steps 15-L1 to 15-L4).** The new view is built on finished layout rules (D24a). The layout work and the stylesheet work run together; both rewrite layout rules.

- **Minimum width (U1).** `styles.css` has no `@media` rule. The sidebar (280 px, line 230), the rail (272 px, line 2831) and the canvas minimum (`min-width: 480px`, line 239) overflow below 1,032 px. `DESIGN.md:226-236` specifies a 260 px tree that resizes between 240 and 420 px; neither exists. The smallest supported width is 1,024 px and the tree collapses to a toggle first; the CSS (280 px, fixed) is right, so the resize claim leaves `DESIGN.md`. The GBC toolbar overflows at 720 px (page `scrollWidth` 803), below that minimum; re-check the toolbar at 1,024 px in both families.
- **Light theme (U4).** `[data-theme="light"]` (`styles.css:132-169`) cannot be reached; no code sets `data-theme`. Delete the block and the claim at `DESIGN.md:33`.
- **Stylesheet tokens and split (U5).** `styles.css` is one global sheet of 3,274 lines. It has 21 raw `z-index` declarations (values 1-12 and 1000) and no scale. The shadow `0 4px 16px rgba(0, 0, 0, 0.4)` is written out at lines 922, 951, 1025, 1063, 1265, 1438 and 1526.

  ```css
  /* before */
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  /* after */
  box-shadow: var(--shadow-popover);
  ```

  Add `--shadow-popover` and a named z-index scale (`--z-overlay`, `--z-popover`, `--z-dialog`, `--z-toast`). Then split the sheet by area (shell, canvas, palette, dialogs, world) and import the parts in the current order. Tier Low for the tokens (mechanical; `styles.test.ts` and a live check), Medium for the split.

**Town map.**

GBA. `region_map_sections.json` is the file that broke the build on 2026-08-18: Porymap 6 renamed `map_section` to `id` on all 115 entries (`{ "map_section": "MAPSEC_VIOLET_CITY", "name": "VIOLET CITY", "x": 12, "y": 4, "width": 1, "height": 1 }`), `jsonproc` renders `region_map_entries.h` from an Inja template that reads `map_section.map_section`, and the make rule deletes its own output on failure, so every later build failed while naming a file nobody had touched.

**Loader** (new `core/src/load/regionMap.ts`): reads whichever key is present and records which one, so the writer puts back the same key; it never normalises. It discovers files by globbing `src/data/region_map/region_map_sections*.json`, not one hardcoded path (trap 2). It parses the template `src/data/region_map/region_map_sections.json.txt` to learn which key the build reads, and rejects a file whose key differs from the template's.

## Traps and pitfalls

1. **The GBA region map is five kinds of file, and the JSON is the smallest part.** In the subject: `region_map_sections.json` with its template (build input, `json_data_rules.mk:10-11`); the per-cell section grids as C arrays in `region_map_layout.h`, `_hoenn.h`, `_johto.h` and `_jk.h`; hand-written entry headers `region_map_entries_johto.h` and `_jk.h`; and the art in `graphics/pokedex/` (`region_map.png`, `.pal`, the tilemap `region_map.bin`, `johto_region_map.*`, `region_map_affine.*`). The path `graphics/pokenav/region_map*` named elsewhere does not exist there. "Section boundaries" means writing a C array, and PokeMap's only C writer splices `#define` lines (`core/src/addEvent/gbaBuild.ts:38,112-129`).
2. **`region_map_sections_johto.json` has no build rule.** No makefile, C file or template in the subject names it. The loader's glob would build an editor for a file the game may never read; the measurement step settles whether it is live.
3. **Crystal has no section boundaries.** A landmark is a point and a name (`data/maps/landmarks.asm:1-12`); a fly point is a landmark and spawn pair (`data/maps/flypoints.asm:1-12`); the tilemaps are `gfx/pokegear/johto.bin` and `kanto.bin`, 361 bytes each, over `town_map.png` and `town_map_palette_map.asm`. D14's first tool has no GBC counterpart. The interview rules what GBC gets (landmark position and name), so no task discovers it.
4. **A fourth view compiles without being handled.** `Mode` is `"map" | "world" | "dungeon"` (`ui/src/shell/adapter.ts:10`) and the shell switches on it with ternaries (`shell/FamilyApp.tsx:257-273`), so a new mode falls into the dungeon branch silently. The adapters gate their hooks on it (`gba/adapter.tsx:30-31`, `gbc/adapter.tsx:30-32`) and `FamilyRuntime` has one render slot per mode (`adapter.ts:76-78`). The first UI task adds an exhaustive check.
5. **Count `z-index` declarations, not grep lines.** `styles.css` has 21 `z-index` declarations; a plain grep finds 25 `z-index:` matches and 34 lines that mention `z-index`, because comments count too. Recount on the day. The split changes what `packages/ui/test/styles.test.ts` parses, so that test changes with it.

## Questions

**Rulings.** The plan is split into 15a (loaders and a read-only view) and 15b (the tools); Plan 16 follows 15a (D24b).
- The smallest supported window width is 1,024 px; the tree collapses to a toggle first.
- The sidebar CSS (280 px, fixed) is right; delete the resize claim from `DESIGN.md`.
- The light theme is deleted: the block and the `DESIGN.md:33` claim.

**Open, for the spec interview:**

1. GBA: which of Hoenn, Johto and JK are live in the subject's game, and which file wins when the layout grid and the JSON entry disagree.
2. GBC: landmark position and name as the counterpart of sections (trap 3).

## Subtasks

Provisional phases:

- 15-L1 minimum width 1,024 px, the tree collapsing to a toggle first, the `DESIGN.md` resize claim removed, the toolbar re-checked at 1,024 px in both families (`packages/ui/src/styles.css`, `DESIGN.md`, `packages/ui/test/styles.test.ts`; High, layout; verify `packages/ui/test/styles.test.ts` and live).
- 15-L2 delete the light theme block and the `DESIGN.md:33` claim (Low; verify `packages/ui/test/styles.test.ts`).
- 15-L3 shadow token and z-index scale (`packages/ui/src/styles.css`, `packages/ui/test/styles.test.ts`; Low; verify `packages/ui/test/styles.test.ts` and live).
- 15-L4 split the sheet by area (`packages/ui/src/styles/*.css`, the import site, `packages/ui/test/styles.test.ts`; Medium; verify `packages/ui/test/styles.test.ts`, the UI build and live). After 15-L3.
- 15-0 measure both formats in both subjects and the reference engines, written into the spec (docs). It includes which of `heal_locations.json` and `src/data/heal_locations.h` the GBA game reads (Plan 5 trap 9).
- 15-1 GBA loaders, key-preserving (High, parsing).
- 15-2 GBC loaders (High, parsing).
- 15-3 read routes, one module (Medium).
- 15-4 the fourth view, read-only, both families (High, shell).

A conductor hands off after 15-4.

## Acceptance

- The shell works at 1,024 px in both families: the tree collapses to a toggle first and the toolbar fits (15-L1).
- The light theme block and its `DESIGN.md:33` claim are gone, and the resize claim has left `DESIGN.md` (15-L1, 15-L2).
- `packages/ui/test/styles.test.ts` passes on the token scale and on the split sheet, the UI builds, and a live check looks unchanged (15-L3, 15-L4).
- The spec records the measurement of both formats in both subjects and the reference engines (15-0).
- The loaders read every region map file of both subjects and the reference engines and record the key each one uses.
- The read-only view opens in both families, and the shell handles the new mode exhaustively (trap 4).
