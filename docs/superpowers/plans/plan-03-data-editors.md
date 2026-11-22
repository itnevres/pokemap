# Plan 3: Data editors

Map header, wild encounter, tileset-pixel, palette and layout editors in both families, through the save funnel: Task 2 (map header), Task 3 (wild encounters), Task 6 (the indexed PNG and `.pal` writers), Task 7 (pixel and palette editing, FireRed fields) and Task 8 (the layout editor: a map's layout, size, border and tilesets, and deleting a layout). Every editor sits behind the engine adapter and works in both families (README, goal). Every editor is a UI over the save funnel (`core/src/write/save.ts`); no editor writes directly. New guards are added to `write/guards.ts`, never bypassed.

## Status

Open. Not started. Run `superpowers:brainstorming` first, then work from the Subtasks table. The Task requirements below hold the detail; where a trap or a ruling disagrees with them, the trap or ruling wins.

## Depends on

- Plan 14C (rows 2c, 8b: the project refresh) and Plan H batches H2 and H3 (rows 2b, 3a, 3b, 8a). Tasks 2 and 3 run after Plan 14C (D24f).
- Plan H Task G (traps 4, 8).
- Invariants I1-I8 ([Plan 0](archive/plan-00-gba-roadmap.md)) bind every task.

## Binding decisions

- D22, D23, D24f, D26, D27, D29 (text in [decisions.md](decisions.md)).

## Traps and pitfalls

1. **Editors are one shared component with family data through the adapter.** Models: `ui/src/shared/AddEventDialog.tsx` with `gba/addEventFields.ts` and `gbc/addEventFields.ts`; `ui/src/shared/BlockEditorDialog.tsx`. Every row in the Subtasks table names both families.
2. **Task 2, GBA: the edit exists, the route does not.** `editJson` already replaces a top-level scalar such as `music`, and refuses a key that is absent (`core/src/write/jsonEdit.ts:16-37`, `:91`); only the event operations build paths today (`core/src/edit/events.ts:17-42`). The work is an operation, a route and the panel.
3. **Task 2, `layout` is not a scalar edit.** The session holds the old layout's `layout`, `blocks` and `border` (`core/src/write/save.ts:76-82`), so changing it with painted cells pending has no defined meaning. It is its own subtask (row 8g), and the layout editor's opening warning names the pending cells it would lose (Task 8 requirements).
16. **A layout is shared, so a layout change reaches every map on it.** Size, border and tilesets belong to the layout, not the map (GBA `layouts.json`), and several maps can use one layout; `gbaConsumingLayouts` (`core/src/blockEdit/usage.ts:372`) lists them. The warning names those maps. Under new tilesets the metatile ids stay and their graphics change, so the warning says that too. GBC keeps the tileset on the map's `maps.asm` line (trap 4), so there it changes one map.
4. **Task 2, GBC: the header is one line in a file shared by every map.** `map NewBarkTown, TILESET_JOHTO, TOWN, LANDMARK_NEW_BARK_TOWN, MUSIC_NEW_BARK_TOWN, FALSE, PALETTE_AUTO, FISHGROUP_OCEAN` in `data/maps/maps.asm`, read once at project open (`core/src/gbc/load/map.ts:256`). There is no writer, the file needs the one-owner rule, and the project must be refreshed after the save (needs Plan H Task G and Plan 14C's project refresh).
5. **Task 2, dropdown lists.** Project constants are already parsed and cached per entry point (`core/src/addEvent/sources.ts:43` `cDefines`). Reuse it; do not add a second constants reader.
6. **Task 3, GBA: `wild_encounters.json` is a build input with a template,** the same arrangement that broke the region map on 2026-08-18 (`json_data_rules.mk:4-5`, `wild_encounters.json.txt`). Edits are spliced in place, never re-serialised. Slot weights come from the file's own `fields[].encounter_rates`, and 14 maps hold more `mons` than weights (RESUME, open items): the editor shows that and does not repair it.
7. **Task 3: one file, many maps, per-map sessions.** Two maps' sessions would both hold `wild_encounters.json`. It needs the one-owner rule (`server/src/blockEditOwnership.ts` holds it for tileset files). GBC is the same with `data/wild/*.asm`, and a fishing group (`maps.asm`, eighth argument) is shared by many maps, so editing one needs the "used by N maps" warning.
8. **Task 3: the caches outlive the save.** The project caches encounters (`core/src/project.ts:139,216-221`), the hub caches encounters, coverage and species, and the commit route clears none of them (`server/src/index.ts:1107-1124`); `core/src/analyse/coverage.ts:34` reads the file again on its own. "Immediately updates the atlas" needs Plan H Task G.
9. **Task 3: a linked sign can end up one save behind.** Species-linked signs are refreshed at save from the project (`server/src/signRefresh.ts:89`), and the project's encounters are the cached, pre-edit ones. The spec says the refresh reads the staged table.
10. **Task 3, GBC: three tables per map and a known defect.** Grass has morn, day and nite slot lists and three rates (`data/wild/johto_grass.asm:5-14`); `kanto_grass.asm` has no terminator and loads anyway (RESUME, GBC facts). The patcher preserves both.
11. **Task 6: "zero bytes changed" cannot hold for a PNG.** A re-encoded PNG differs from the original in its compressed stream even when every pixel is equal. The rule: a sheet whose pixels and palette did not change is not written, and a written one decodes to exactly the intended pixels and palette at the source depth. Core has no indexed encoder to start from, only a 2-bit grey one (`core/src/blockEdit/gbcSheet.ts:23`) and the reader (`core/src/load/png.ts:52`).
12. **Task 7's FireRed fields have no subject.** Attributes are patched through masks (`core/src/blockEdit/gbaPatch.ts:89`); terrain and encounter type are two more fields in its field spec. Neither subject is FireRed, so only the reference corpus exercises them and no live check is possible.
13. **Task 8: a half-done resize still loads.** A size mismatch is never read-only, so the loader accepts a `map.bin` that disagrees with `layouts.json`. Resize tests assert exact sizes in every file and on a reload. Resize also strands events outside the new bounds and shifts connection offsets.
14. **Task 8, GBC: the size lives in a constants file.** `map_const` dimensions in `constants/map_constants.asm`, read once at open (`core/src/gbc/load/map.ts:254`), plus the `.blk` length. Text replacement in constants files exists (`core/src/gbc/write/save.ts:216-218`); the project refresh after the save does not (needs Plan 14C).
15. **The build checks run in WSL** (D29; RESUME, Environments): GBC builds with `make`, the GBA subject with `make modern`, on a scratch copy.

## Questions

**Rulings (D24f, D27):**
- Tasks 2 and 3 run as one plan for both families, after Plan 14C.
- PokeMap edits tile pixels and palette colours itself (rows 6a, 7a, 7b). The pixel editor and the two writers are shared with Plan 15b's town-map art (D26); whichever of the two plans starts first builds them.
- The FireRed fields are built (row 7c). Their acceptance runs on a scratch copy of the pokefirered reference engine.
- Deleting a layout is in scope while maps cannot be deleted (row 8e).
- The user said (2026-11-21): "I want to be able to edit the town map and how the different maps link together". The town map is Plans 15a and 15b; how maps link together is Plan 14C.
- **The layout editor stays in scope (user, 2026-11-21):** "changing size, border, and tilesets of a map is a huge part of this tool and must be kept. Add a warning outlining what changing it will change/lose of something will be lost when launching the layout editor". Changing a map's `layout`, its size, its border and its tilesets are rows 8a-8d, 8f and 8g; the warning is row 8h (traps 3, 16).

**Open, for the interview:**
1. Task 3: whether GBC fishing groups, swarms and headbutt trees are editable in the first version. Recommendation: grass and water only; fishing shown read-only with its "shared by N maps" count.
2. Task 8: on a resize, which edge grows, what fills the new cells, and what happens to events left outside. Recommendation: a chosen anchor, the layout's most used block, and a refusal that lists the events.

## Subtasks

The table is the breakdown the brainstorming interview starts from; a row may be deleted by an answer. Both families are named in every row. Verify lines run from the repo root after `npm run typecheck`.

| Id | What | Files | Tier | Verify (`npx vitest run --no-file-parallelism …`) | After |
|---|---|---|---|---|---|
| 2a | Header option lists from project constants, both families | new `packages/core/src/header/{gbaOptions,gbcOptions}.ts` and tests, reusing `addEvent/sources.ts` | Medium | `packages/core/test/header` | - |
| 2b | GBA header edit: operation, route, undo snapshot | new `packages/core/src/edit/header.ts`; the GBA edit-route module Plan H Task I leaves; tests | High (session and save) | `packages/core/test/edit packages/server` | Plan H H3 |
| 2c | GBC header: lossless `maps.asm` line patcher, save entry under the owner rule, project refresh | new `packages/core/src/gbc/write/mapsPatch.ts`; `packages/core/src/gbc/write/save.ts`, `packages/server/src/gbcEditRoutes.ts`; tests | High (subject writes) | `packages/core/test/gbc packages/server` | Plan 14C |
| 2d | Header panel, shared, with family field specs | new `packages/ui/src/shared/HeaderPanel.tsx`, `gba/headerFields.ts`, `gbc/headerFields.ts`; `shell/adapter.ts` | Medium | `packages/ui/test/shared` | 2b, 2c |
| 3a | GBA encounter edits as splices into `wild_encounters.json`, under the owner rule | new `packages/core/src/edit/encounters.ts`; `packages/core/src/write/save.ts`; tests | High (subject writes) | `packages/core/test/edit packages/core/test/write` | Plan H H2 |
| 3b | GBC grass and water patchers, lossless | new `packages/core/src/gbc/write/wildPatch.ts`; `packages/core/src/gbc/write/save.ts`; tests | High (subject writes) | `packages/core/test/gbc` | Plan H H2 |
| 3c | Routes, ownership and cache invalidation, both hubs | the two edit-route modules, `packages/server/src/blockEditOwnership.ts` or a sibling; tests | High (save ownership) | `packages/server` | 3a, 3b |
| 3d | Linked signs and the Indicator read the staged table | `packages/server/src/signRefresh.ts`; tests | High (save ownership) | `packages/server` | 3c |
| 3e | Encounter editor, shared: variants, rods, live percentages from `speciesChances` and the GBC atlas | new `packages/ui/src/shared/EncounterEditor.tsx` with family specs; `shell/adapter.ts` | Medium | `packages/ui/test/shared` | 3c |
| 6a | Indexed PNG writer at the source depth (4-bit tile sheets, and the 8-bit town-map art for Plan 15b) and JASC `.pal` writer; rule per trap 11 | new `packages/core/src/write/{indexedPng,pal}.ts` and tests | High (subject writes) | `packages/core/test/write` | - |
| 7a, 7b | Tile-pixel editor; palette editor with 5-bit quantising, both shared with Plan 15b's town-map art and offered in both families | needs its own spec and interview (tools, undo, how a sheet edit is staged and owned, GBC's 2-bit sheets and palette files) | High (subject writes, save ownership) | - | 6a |
| 7c | FireRed terrain and encounter-type fields in the block editor's field spec, from the profile masks | `packages/core/src/config/engine.ts`, `packages/core/src/blockEdit/gbaPatch.ts`, the GBA block-editor spec in `packages/ui/src/gba/`; tests on a scratch copy of the pokefirered reference | High (subject writes) | `packages/core/test/blockEdit` | - |
| 8a | GBA resize: operation, the `layouts.json` splice, both `.bin` files, the events and connections refusals | new `packages/core/src/edit/layouts.ts`; `packages/core/src/write/save.ts`; tests | High (subject writes) | `packages/core/test/edit packages/core/test/write` | Plan H H2 |
| 8b | GBC resize: `.blk`, `map_const` replacement, project refresh | new `packages/core/src/gbc/edit/layouts.ts`; `packages/core/src/gbc/write/save.ts`; tests | High (subject writes) | `packages/core/test/gbc` | Plan 14C |
| 8c | GBA border size, on engines whose layouts carry the border keys | `packages/core/src/edit/layouts.ts`; tests | High | `packages/core/test/edit` | 8a |
| 8d | Layout editor, shared: one dialog for the map's layout, size, border and tilesets; it opens with row 8h's warning | new `packages/ui/src/shared/LayoutEditorDialog.tsx`; `shell/adapter.ts` | Medium | `packages/ui/test/shared` | 8a, 8b, 8f, 8g, 8h |
| 8e | GBA delete layout: refuse while any map uses it, naming the maps (reuse `gbaConsumingLayouts`, `packages/core/src/blockEdit/usage.ts:372`); remove the `layouts.json` entry and its two `.bin` files in one atomic set. GBC has no separate layout entity, so the spec says what delete means there or flags it GBA only | `packages/core/src/edit/layouts.ts`, `packages/core/src/write/{atomic,save}.ts` (file removal in the atomic set); tests | High (subject writes) | `packages/core/test/edit packages/core/test/write` | 8a |
| 8f | Change tilesets: GBA `primary_tileset` and `secondary_tileset` spliced in `layouts.json`; GBC the tileset argument of the map's `maps.asm` line through row 2c's patcher, then the project refresh | `packages/core/src/edit/layouts.ts`, `packages/core/src/gbc/edit/layouts.ts`, `packages/core/src/gbc/write/mapsPatch.ts`; tests | High (subject writes) | `packages/core/test/edit packages/core/test/gbc` | 8a, 2c |
| 8g | Switch a map to another layout (GBA `layout` in `map.json`); the split re-resolves without a reload; pending painted cells are dropped only after the warning (trap 3). GBC has no layout field, so the spec says what it means there or flags it GBA only | `packages/core/src/edit/header.ts`, `packages/core/src/write/save.ts`; tests | High (session and save) | `packages/core/test/edit packages/core/test/write` | 2b |
| 8h | The change report behind the warning, both families: the maps sharing the layout, pending painted cells, cells and events outside a smaller size, connection offsets that shift, and that metatile graphics change under new tilesets (traps 3, 13, 16) | new `packages/core/src/edit/layoutImpact.ts`, reusing `gbaConsumingLayouts`; tests | High (a missing item would not fail a check) | `packages/core/test/edit` | 8a, 8b |

Each of Tasks 2, 3 and 8 ends with a live check on scratch clones in both families and extends the corpus gate (`packages/core/test/write/corpus.test.ts`) for the file kinds it writes.

### New files

New files only; the files each row modifies are in its row.

| File | Responsibility | Row |
|---|---|---|
| `packages/core/src/header/{gbaOptions,gbcOptions}.ts` | Header option lists from project constants, reusing `addEvent/sources.ts` | 2a |
| `packages/core/src/edit/header.ts` | GBA header edit operation and undo snapshot | 2b |
| `packages/core/src/gbc/write/mapsPatch.ts` | Lossless GBC `maps.asm` line patcher | 2c |
| `packages/ui/src/shared/HeaderPanel.tsx`, `packages/ui/src/gba/headerFields.ts`, `packages/ui/src/gbc/headerFields.ts` | Shared header panel and its family field specs | 2d |
| `packages/core/src/edit/encounters.ts` | GBA encounter edits as splices into `wild_encounters.json` | 3a |
| `packages/core/src/gbc/write/wildPatch.ts` | Lossless GBC grass and water patchers | 3b |
| `packages/ui/src/shared/EncounterEditor.tsx` | Shared encounter editor with family specs | 3e |
| `packages/core/src/write/{indexedPng,pal}.ts` | Indexed `tiles.png` and JASC `.pal` writing. The `.bin` writers are `core/src/blockEdit/gbaPatch.ts` | 6a |
| `packages/core/src/edit/tileset.ts` (provisional) | Tile-pixel and palette edits; their own spec names the final files. Metatile composition and attributes are in `core/src/blockEdit/` | 7a, 7b |
| `packages/core/src/edit/layouts.ts` | GBA resize, border size and layout delete | 8a, 8c, 8e |
| `packages/core/src/gbc/edit/layouts.ts` | GBC resize | 8b |
| `packages/ui/src/shared/LayoutEditorDialog.tsx` | Shared layout editor: layout, size, border, tilesets, with the opening warning | 8d |
| `packages/core/src/edit/layoutImpact.ts` | What a layout change alters and loses, both families | 8h |

### Task 2 requirements: map header editing

- Every scalar field in `map.json`: `music`, `weather`, `map_type`, `region_map_section`, `requires_flash`, `allow_cycling`, `allow_escaping`, `allow_running`, `show_map_name`, `battle_scene`. GBC: the header fields of the map's `maps.asm` line (trap 4).
- Constant-valued fields become dropdowns populated by parsing the real constant headers (`include/constants/map_types.h`, `songs.h`, `weather.h`), so the list matches the project rather than a bundled guess. A hack that adds a new weather gets it in the dropdown for free.
- Engine-specific fields appear only where the profile supports them, and are **never added to a map that lacked them** — the `jsonEdit` refusal already enforces this, and there is a test that tries.

### Task 3 requirements: wild encounter editing

- Edit species, min and max level per slot, and the `encounter_rate` per method.
- **Edit each variant separately.** A map may have several tables (day, night, two more; nine for `MAP_ALTERING_CAVE`), distinguished only by `base_label`. The editor selects among them explicitly and never merges them — writing a day edit into the night table would be silent data loss.
- **Fishing edits are scoped to a rod.** Its ten slots are three distributions (Old 2, Good 3, Super 5), each summing to 100. The editor shows rod boundaries and per-rod percentages, because a slot's number means nothing without knowing which rod it belongs to.
- **The percentage is shown live beside every slot**, from the same `speciesChances` used by the atlas. Editing slot 0 of `land_mons` should visibly say 20%, because slot position is the single most misunderstood part of this data. Slot 0 of `fishing_mons` says 70% *of Old Rod*, never 70% outright.
- Adding a method to a map that lacks one is an explicit action, using `insertArrayElement` — matching the "never invent keys" rule.
- A species field validates against the project's real species list; an unknown constant is a refusal with the closest matches listed.
- Editing here immediately updates the encounter atlas, and any wild signs whose species is now off-table get flagged in the sign list. The two features stay coherent (traps 8, 9).

### Task 6 requirements: tileset image and palette writing

The indexed `tiles.png` writer and the `.pal` writer (row 6a), built once and shared with Plan 15b. The `.bin` writers exist (`core/src/blockEdit/gbaPatch.ts`).

- Write `tiles.png` as an **indexed** PNG at the source file's original bit depth and palette — re-encoding a depth-4 sheet as depth-8 would work but produces a gratuitous diff, and `gbagfx` cares about the format.
- Write `.pal` files as JASC-PAL with the same header and line endings as the original.
- **Never write `.4bpp`, `.gbapal` or `.lz`** — invariant **I3**. Those are build outputs; writing them creates files that `.gitignore` hides and that `make` will overwrite, which is exactly the kind of ghost that costs a day.
- Round-trip test, per trap 11: load and re-save every tileset in every reference engine. An unchanged `tiles.png` or `.pal` is not written; a written `tiles.png` decodes to exactly the intended pixels and palette at the source depth. This needs an indexed-PNG *encoder*, the counterpart to the reader (`core/src/load/png.ts`); write it with the same "no dependency, ~120 lines" approach.

### Task 7 requirements: tileset editor

Tile pixel editing and palette editing (rows 7a and 7b, shared with Plan 15b) and the FireRed attribute fields (row 7c). Metatile composition, behaviour, layer type, the usage warning and cache invalidation are in the block editor (`ui/src/shared/BlockEditorDialog.tsx`, `core/src/blockEdit/`).

- Edit tile pixels (row 7a). Its own spec and interview settle the tools, undo, how a sheet edit is staged and owned, and GBC's 2-bit sheets.
- Edit palettes as 16 colours; colours are GBA BGR555, so the editor must quantise to 5 bits per channel and show the quantised value. A colour picker offering 24-bit precision that silently rounds is a lie about what the hardware will show.
- Before a save, the save dialog names every map that uses the edited tileset.
- On FireRed, edit the terrain and encounter-type attributes in the block editor's field spec, read from the profile masks, never hardcoded (row 7c).
- Only if the whole-cache clear (`pngCache.clear()` on every overlay change, `server/src/index.ts:221`) measures as a stall after a tileset edit: invalidate by tileset instead, with a test that a layout on another tileset keeps its cached image. With 1,020 layouts, re-rendering everything is a several-second stall.

### Task 8 requirements: the layout editor (rows 8a-8h)

- **Opening warning (user ruling).** When the layout editor opens, it states what a change will alter and, when anything would be lost, exactly what: the other maps that share the layout, pending painted cells, cells and events outside a smaller size, connection offsets that shift, and that metatiles show different graphics under new tilesets (row 8h; traps 3, 13, 16).
- `layout` is editable, and changing it re-resolves the split immediately. Switching a map from an `emerald` layout to an `hns` one must visibly change the palette boundary in the tile palette without a reload (row 8g, trap 3).
- Change a layout's tilesets (row 8f).
- Resize a layout, preserving overlapping blockdata and filling new area with the default metatile from the engine profile (traps 13, 14; question 2).
- Change border size, honouring the 3×2 case.
- Delete a layout, refusing when any map still references it and naming those maps.

## Acceptance

Demonstrated, not asserted:

1. Edit a tile's pixels or a palette colour and see every map that uses that tileset change.
2. The 5-engine write corpus still passes at zero bytes changed, and it covers each file kind this plan writes.

- [ ] The `gate` skill passes, and the corpus gate covers each file kind this plan writes
- [ ] Tasks 2, 3 and 8 (rows 2a-2d, 3a-3e, 8a-8h): each ends with a live check on scratch clones in both families
- [ ] Row 6a: an unchanged `tiles.png` or `.pal` is not written; a written one decodes to exactly the intended pixels and palette at the source depth (trap 11)
- [ ] Rows 7a, 7b: edit a tile's pixels or a palette colour; every map using that tileset updates, and the save dialog named them beforehand
- [ ] Row 7c: the FireRed fields' acceptance passes on a scratch copy of the pokefirered reference
