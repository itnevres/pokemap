# PokeMap Plan 3 — Map Headers, Encounters, Tilesets, Layouts (reduced; connections and region map moved)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Read [Plan 0](2026-08-26-pokemap-plan-0-roadmap.md) first — invariants I1–I8 bind every task.
>
> **Work from the Subtasks table (2026-11-15)** after the brainstorming interview below. The Task sections are the original 2026-08 requirements; where a trap or a ruling disagrees with them, the trap or ruling wins, and their **Files** lines are the 2026-08 layout (`packages/ui/src/components/`, GBA only). The table names the real files.

> **Reduced 2026-11-13 (roadmap D22), amended 2026-11-16 (D27).** Still in this plan: Task 2 (map header), Task 3 (wild encounters), Task 6 (the indexed PNG and `.pal` writers), Task 7 (pixel and palette editing, FireRed fields) and Task 8 (resize, border size, delete). Moved: Task 1, Task 9 and the create-layout part of Task 8 to roadmap Plan 14C; Tasks 4-5 to roadmap Plan 15. Deleted: Task 10. The moved task texts stay below as requirements for the receiving plan's spec; success criteria 1 and 3 and their checklist lines are marked as moved with them. Tasks 2 and 3 run after roadmap Plan 14C as one plan for both families (D24f). When this plan starts, run `superpowers:brainstorming` first: the unified-UI goal (roadmap) wants each editor behind the engine adapter in both families, which this 2026-08 text predates.

**Goal (reduced, D22 and D27):** map header, wild encounter, tileset-pixel, palette and layout editors in both families, through the save funnel. The 2026-08 goal also named connections and the region map, with special care around `region_map_sections.json` (the file whose rewrite broke the build on 2026-08-18); those moved to roadmap Plans 14C and 15.

**Architecture:** Every editor is a UI over the Plan 2 save funnel. No editor writes directly. New guards are added to `write/guards.ts`, never bypassed.

**Success criteria — demonstrated, not asserted:**
1. *(Moved with Task 1 to roadmap Plan 14C.)* Drag a map in the stitched world view and have it write a correct connection `offset`.
2. Edit a tile's pixels or a palette colour and see every map that uses that tileset change. (Metatile edits already do this through Plan 14.2's block editor.)
3. *(Moved with Tasks 4-5 to roadmap Plan 15.)* Edit a region map entry, run `make`, and get a successful build — the direct rebuttal of the 2026-08-18 failure.
4. The 5-engine write corpus still passes at zero bytes changed.

---

## Traps and pitfalls (2026-11-15)

From the plan review of 2026-11-15, checked against `plan-14-2-block-editor` at `21bf0b9` and the two subjects. Line numbers in PokeMap were moved to `master` at `9d14637` on 2026-11-21; the facts were not re-derived. Tasks 1, 4, 5 and 9 have their traps in the roadmap, under Plans 14C and 15.

1. **Task 8 still holds work that moved.** Its create-a-layout bullets belong to roadmap Plan 14C and sit in their own "Moved" list under Task 8; a brief quotes only the bullets above that list. The bullets Plan 14.2 built (Task 6's two `.bin` writers; Task 7's composition, behaviour, layer type, split labels, save warning and cache invalidation) were deleted on 2026-11-21 after Plan 14.2 merged.
2. **The 2026-08 File Structure table was GBA only, in the old `components/` layout;** it was rebuilt from the Subtasks table on 2026-11-21. Editors since Plan 9 are one shared component with family data through the adapter (`ui/src/shared/AddEventDialog.tsx` with `gba/addEventFields.ts` and `gbc/addEventFields.ts`; Plan 14.2's `shared/BlockEditorDialog.tsx`). The unified-UI goal wants each editor here in both families, and no task names a GBC file.
3. **Task 2, GBA: the edit exists, the route does not.** `editJson` already replaces a top-level scalar such as `music`, and refuses a key that is absent (`core/src/write/jsonEdit.ts:16-37`, `:91`); only the event operations build paths today (`core/src/edit/events.ts:17-42`). The work is an operation, a route and the panel.
4. **Task 2, `layout` is not a scalar edit.** The session holds the old layout's `layout`, `blocks` and `border` (`core/src/write/save.ts:76-82`), so changing it with painted cells pending has no defined meaning. It is its own subtask with its own ruling, or it is dropped.
5. **Task 2, GBC: the header is one line in a file shared by every map.** `map NewBarkTown, TILESET_JOHTO, TOWN, LANDMARK_NEW_BARK_TOWN, MUSIC_NEW_BARK_TOWN, FALSE, PALETTE_AUTO, FISHGROUP_OCEAN` in `data/maps/maps.asm`, read once at project open (`core/src/gbc/load/map.ts:256`). There is no writer, the file needs the one-owner rule, and the project must be refreshed after the save (Plan H Task G; roadmap Plan 14C builds the refresh).
6. **Task 2, dropdown lists.** Plan 14.1 already parses project constants and caches them per entry point (`core/src/addEvent/sources.ts:43` `cDefines`; fix L2, `cd1ef6e`). Reuse it; do not add a second constants reader.
7. **Task 3, GBA: `wild_encounters.json` is a build input with a template,** the same arrangement that broke the region map on 2026-08-18 (`json_data_rules.mk:4-5`, `wild_encounters.json.txt`). Edits are spliced in place, never re-serialised. Slot weights come from the file's own `fields[].encounter_rates`, and 14 maps hold more `mons` than weights (RESUME, open items): the editor shows that and does not repair it.
8. **Task 3: one file, many maps, per-map sessions.** Two maps' sessions would both hold `wild_encounters.json`. It needs the one-owner rule Plan 14.2 built for tileset files (`server/src/blockEditOwnership.ts`). GBC is the same with `data/wild/*.asm`, and a fishing group (`maps.asm`, eighth argument) is shared by many maps, so editing one needs the "used by N maps" warning.
9. **Task 3: the caches outlive the save.** The project caches encounters (`core/src/project.ts:139,216-221`), the hub caches encounters, coverage and species, and the commit route clears none of them (`server/src/index.ts:1107-1124`); `core/src/analyse/coverage.ts:34` reads the file again on its own. "Immediately updates the atlas" depends on Plan H Task G.
10. **Task 3: a linked sign can end up one save behind.** Species-linked signs are refreshed at save from the project (`server/src/signRefresh.ts:89`), and the project's encounters are the cached, pre-edit ones. The spec says the refresh reads the staged table.
11. **Task 3, GBC: three tables per map and a known defect.** Grass has morn, day and nite slot lists and three rates (`data/wild/johto_grass.asm:5-14`); `kanto_grass.asm` has no terminator and loads anyway (RESUME, GBC facts). The patcher preserves both.
12. **Task 6: "zero bytes changed" cannot hold for a PNG.** A re-encoded PNG differs from the original in its compressed stream even when every pixel is equal. The rule becomes: a sheet whose pixels and palette did not change is not written, and a written one decodes to exactly the intended pixels and palette at the source depth. Core has no indexed encoder to start from, only a 2-bit grey one (`core/src/blockEdit/gbcSheet.ts:23`) and the reader (`core/src/load/png.ts:52`).
13. **Task 7's FireRed fields have no subject.** Plan 14.2 patches attributes through masks (`core/src/blockEdit/gbaPatch.ts:89`); terrain and encounter type would be two more fields in its field spec. Neither subject is FireRed, so only the reference corpus would exercise them and no live check is possible.
14. **Task 8: a half-done resize still loads.** Since Plan 10b a size mismatch is never read-only (ruling R2; `e827cdc`), so the loader accepts a `map.bin` that disagrees with `layouts.json`. Resize tests assert exact sizes in every file and on a reload. Resize also strands events outside the new bounds and shifts connection offsets.
15. **Task 8, GBC: the size lives in a constants file.** `map_const` dimensions in `constants/map_constants.asm`, read once at open (`core/src/gbc/load/map.ts:254`), plus the `.blk` length. Text replacement in constants files exists (`core/src/gbc/write/save.ts:216-218`); the project refresh after the save does not.
16. **The build checks run in WSL.** The toolchain was installed 2026-11-17 (roadmap D29; RESUME, Environments): GBC builds with `make`, the GBA subject with `make modern`, on a scratch copy.

## Subtasks (2026-11-15)

**Run `superpowers:brainstorming` first** (the header already says so). The table is the breakdown that interview starts from; a row may be deleted by an answer. Both families are named in every row. Verify lines run from the repo root after `npm run typecheck`. The interview's questions. Questions 1, 4, 5 and 7 were answered by the user 2026-11-16 (roadmap D24f, D27); their recommendations were replaced by the answers on 2026-11-21.

1. Whether Tasks 2 and 3 run as one plan after roadmap Plan 14C. **Answered: yes,** as one plan for both families (D24f).
2. Task 2: whether changing a map's `layout` is in scope (trap 4). Recommendation: no. Open.
3. Task 3: whether GBC fishing groups, swarms and headbutt trees are editable in the first version. Recommendation: grass and water only; fishing shown read-only with its "shared by N maps" count. Open.
4. Tasks 6 and 7: whether PokeMap edits tile pixels and palette colours, or opens the file in the user's editor. **Answered: inside PokeMap** (D27), so rows 6a, 7a and 7b are built. The pixel editor and the two writers are shared with roadmap Plan 15, which needs them for the town map (D26); whichever of the two plans starts first builds them.
5. Task 7: whether the FireRed fields are built (trap 13). **Answered: yes** (row 7c). With no FireRed subject, their acceptance runs on a scratch copy of the pokefirered reference engine.
6. Task 8: on a resize, which edge grows, what fills the new cells, and what happens to events left outside. Recommendation: a chosen anchor, the layout's most used block, and a refusal that lists the events. Open.
7. Task 8: whether deleting a layout is wanted while maps cannot be deleted. **Answered: yes** (D27; row 8e).

| Id | What | Files | Tier | Verify (`npx vitest run --no-file-parallelism …`) | After |
|---|---|---|---|---|---|
| 2a | Header option lists from project constants, both families | new `packages/core/src/header/{gbaOptions,gbcOptions}.ts` and tests, reusing `addEvent/sources.ts` | Medium | `packages/core/test/header` | - |
| 2b | GBA header edit: operation, route, undo snapshot | new `packages/core/src/edit/header.ts`; the GBA edit-route module Plan H Task I leaves; tests | High (session and save) | `packages/core/test/edit packages/server` | Plan H H3 |
| 2c | GBC header: lossless `maps.asm` line patcher, save entry under the owner rule, project refresh | new `packages/core/src/gbc/write/mapsPatch.ts`; `packages/core/src/gbc/write/save.ts`, `packages/server/src/gbcEditRoutes.ts`; tests | High (subject writes) | `packages/core/test/gbc packages/server` | roadmap Plan 14C |
| 2d | Header panel, shared, with family field specs | new `packages/ui/src/shared/HeaderPanel.tsx`, `gba/headerFields.ts`, `gbc/headerFields.ts`; `shell/adapter.ts` | Medium | `packages/ui/test/shared` | 2b, 2c |
| 3a | GBA encounter edits as splices into `wild_encounters.json`, under the owner rule | new `packages/core/src/edit/encounters.ts`; `packages/core/src/write/save.ts`; tests | High (subject writes) | `packages/core/test/edit packages/core/test/write` | Plan H H2 |
| 3b | GBC grass and water patchers, lossless | new `packages/core/src/gbc/write/wildPatch.ts`; `packages/core/src/gbc/write/save.ts`; tests | High (subject writes) | `packages/core/test/gbc` | Plan H H2 |
| 3c | Routes, ownership and cache invalidation, both hubs | the two edit-route modules, `packages/server/src/blockEditOwnership.ts` or a sibling; tests | High (save ownership) | `packages/server` | 3a, 3b |
| 3d | Linked signs and the Indicator read the staged table | `packages/server/src/signRefresh.ts`; tests | High (save ownership) | `packages/server` | 3c |
| 3e | Encounter editor, shared: variants, rods, live percentages from `speciesChances` and the GBC atlas | new `packages/ui/src/shared/EncounterEditor.tsx` with family specs; `shell/adapter.ts` | Medium | `packages/ui/test/shared` | 3c |
| 6a | Indexed PNG writer at the source depth (4-bit tile sheets, and the 8-bit town-map art for roadmap Plan 15) and JASC `.pal` writer; rule per trap 12 | new `packages/core/src/write/{indexedPng,pal}.ts` and tests | High (subject writes) | `packages/core/test/write` | - |
| 7a, 7b | Tile-pixel editor; palette editor with 5-bit quantising, both shared with roadmap Plan 15's town-map art and offered in both families | needs its own spec and interview (tools, undo, how a sheet edit is staged and owned, GBC's 2-bit sheets and palette files) | High (subject writes, save ownership) | - | 6a |
| 7c | FireRed terrain and encounter-type fields in the block editor's field spec, from the profile masks | `packages/core/src/config/engine.ts`, `packages/core/src/blockEdit/gbaPatch.ts`, the GBA block-editor spec in `packages/ui/src/gba/`; tests on a scratch copy of the pokefirered reference | High (subject writes) | `packages/core/test/blockEdit` | - |
| 8a | GBA resize: operation, the `layouts.json` splice, both `.bin` files, the events and connections refusals | new `packages/core/src/edit/layouts.ts`; `packages/core/src/write/save.ts`; tests | High (subject writes) | `packages/core/test/edit packages/core/test/write` | Plan H H2 |
| 8b | GBC resize: `.blk`, `map_const` replacement, project refresh | new `packages/core/src/gbc/edit/layouts.ts`; `packages/core/src/gbc/write/save.ts`; tests | High (subject writes) | `packages/core/test/gbc` | roadmap Plan 14C |
| 8c | GBA border size, on engines whose layouts carry the border keys | `packages/core/src/edit/layouts.ts`; tests | High | `packages/core/test/edit` | 8a |
| 8d | Resize dialog, shared | new `packages/ui/src/shared/ResizeDialog.tsx`; `shell/adapter.ts` | Medium | `packages/ui/test/shared` | 8a, 8b |
| 8e | GBA delete layout: refuse while any map uses it, naming the maps (reuse `gbaConsumingLayouts`, `packages/core/src/blockEdit/usage.ts:372`); remove the `layouts.json` entry and its two `.bin` files in one atomic set. GBC has no separate layout entity, so the spec says what delete means there or flags it GBA only | `packages/core/src/edit/layouts.ts`, `packages/core/src/write/{atomic,save}.ts` (file removal in the atomic set); tests | High (subject writes) | `packages/core/test/edit packages/core/test/write` | 8a |

Each of Tasks 2, 3 and 8 ends with a live check on scratch clones in both families and extends the corpus gate for the file kinds it writes (roadmap D22).

---

## File Structure

Rebuilt 2026-11-21 from the Subtasks table: new files only; the files each row modifies are in its row. The moved tasks' files (connections, region map, new map) belong to roadmap Plans 14C and 15.

| File | Responsibility | Row |
|---|---|---|
| `packages/core/src/header/{gbaOptions,gbcOptions}.ts` | Header option lists from project constants, reusing `addEvent/sources.ts` | 2a |
| `packages/core/src/edit/header.ts` | GBA header edit operation and undo snapshot | 2b |
| `packages/core/src/gbc/write/mapsPatch.ts` | Lossless GBC `maps.asm` line patcher | 2c |
| `packages/ui/src/shared/HeaderPanel.tsx`, `packages/ui/src/gba/headerFields.ts`, `packages/ui/src/gbc/headerFields.ts` | Shared header panel and its family field specs | 2d |
| `packages/core/src/edit/encounters.ts` | GBA encounter edits as splices into `wild_encounters.json` | 3a |
| `packages/core/src/gbc/write/wildPatch.ts` | Lossless GBC grass and water patchers | 3b |
| `packages/ui/src/shared/EncounterEditor.tsx` | Shared encounter editor with family specs | 3e |
| `packages/core/src/write/{indexedPng,pal}.ts` | Indexed `tiles.png` and JASC `.pal` writing. The `.bin` writers are Plan 14.2's `core/src/blockEdit/gbaPatch.ts` | 6a |
| `packages/core/src/edit/tileset.ts` (provisional) | Tile-pixel and palette edits; their own spec names the final files. Metatile composition and attributes are Plan 14.2's `core/src/blockEdit/` | 7a, 7b |
| `packages/core/src/edit/layouts.ts` | GBA resize, border size and layout delete | 8a, 8c, 8e |
| `packages/core/src/gbc/edit/layouts.ts` | GBC resize | 8b |
| `packages/ui/src/shared/ResizeDialog.tsx` | Shared resize dialog | 8d |

---

## Task 1 (MOVED to roadmap Plan 14C, D22): Connection editing

**Files:** `packages/core/src/edit/connections.ts` + test

**Interface:**

```ts
export function offsetFromPlacement(proj: Project, from: string, to: string, dir: ConnectionDirection, toX: number, toY: number): number;
export function setConnectionOffset(session: EditSession, mapName: string, index: number, offset: number): void;
export function addConnection(session: EditSession, mapName: string, conn: Connection): void;
export function removeConnection(session: EditSession, mapName: string, index: number): void;
```

**Requirements:**
- `offsetFromPlacement` is the exact inverse of Plan 1 Task 22's placement maths. Test it as a round-trip over every real connection in the subject repo: place, then re-derive, and get the original offset back for all 374 planar connections.
- Adding a connection does **not** automatically add the reciprocal one — but the editor warns when a connection is one-way, since an unpaired connection is almost always a bug. Warn, do not auto-fix; the decomp has legitimate one-way cases.
- `dive`/`emerge` connections are editable as a distinct kind and are never given a planar offset meaning.
- Removing a connection warns if it would island a map — reuse the component analysis from Plan 1 Task 22.

**UI:** dragging a map in the world view updates the offset live and shows it numerically as it changes. The stitched view stops being a picture of your connection data and becomes the way you edit it.

---

## Task 2: Map header editing

**Files:** `packages/core/src/edit/header.ts`, `packages/ui/src/components/HeaderInspector.tsx` + tests

**Requirements:**
- Every scalar field in `map.json`: `music`, `weather`, `map_type`, `region_map_section`, `requires_flash`, `allow_cycling`, `allow_escaping`, `allow_running`, `show_map_name`, `battle_scene`.
- Constant-valued fields become dropdowns populated by parsing the real constant headers (`include/constants/map_types.h`, `songs.h`, `weather.h`), so the list matches the project rather than a bundled guess. A hack that adds a new weather gets it in the dropdown for free.
- Engine-specific fields appear only where the profile supports them, and are **never added to a map that lacked them** — the `jsonEdit` refusal from Plan 1 already enforces this, and there is a test that tries.
- `layout` is editable, and changing it re-resolves the split immediately. Switching a map from an `emerald` layout to an `hns` one must visibly change the palette boundary in the tile palette without a reload.

---

## Task 3: Wild encounter editing

**Files:** `packages/core/src/edit/encounters.ts`, `packages/ui/src/components/EncounterEditor.tsx` + tests

**Requirements:**
- Edit species, min and max level per slot, and the `encounter_rate` per method.
- **Edit each variant separately.** A map may have several tables (day, night, two more; nine for `MAP_ALTERING_CAVE`), distinguished only by `base_label`. The editor selects among them explicitly and never merges them — writing a day edit into the night table would be silent data loss.
- **Fishing edits are scoped to a rod.** Its ten slots are three distributions (Old 2, Good 3, Super 5), each summing to 100. The editor shows rod boundaries and per-rod percentages, because a slot's number means nothing without knowing which rod it belongs to.
- **The percentage is shown live beside every slot**, from the same `speciesChances` used by the atlas. Editing slot 0 of `land_mons` should visibly say 20%, because slot position is the single most misunderstood part of this data. Slot 0 of `fishing_mons` says 70% *of Old Rod*, never 70% outright.
- Adding a method to a map that lacks one is an explicit action, using `insertArrayElement` — matching the "never invent keys" rule.
- A species field validates against the project's real species list; an unknown constant is a refusal with the closest matches listed.
- Editing here immediately updates the encounter atlas and any wild signs whose species is now off-table get flagged in the sign list. The two features stay coherent.

---

## Task 4 (MOVED to roadmap Plan 15, D22): Region map loading — schema-preserving

The file that broke the build. Handled with more care than anything else in this plan.

**Files:** `packages/core/src/load/regionMap.ts` + test

**Real schema, verified in the subject repo:**

```json
{ "map_sections": [ { "map_section": "MAPSEC_VIOLET_CITY", "name": "VIOLET CITY", "x": 12, "y": 4, "width": 1, "height": 1 } ] }
```

115 entries. **Porymap 6 renamed `map_section` to `id` on every one**, and `jsonproc` renders `region_map_entries.h` from an Inja template reading `map_section.map_section`. The key vanished, the rule failed, and because the make rule deletes its own output on failure, every later build failed while naming a file nobody had touched.

**Requirements:**
- The loader reads whichever key is present and **records which one it was**, so the writer puts back the same key. It never normalises.
- The subject repo has a second file, `src/data/region_map/region_map_sections_johto.json`, which Porymap has no concept of. The loader discovers region map files by globbing `src/data/region_map/region_map_sections*.json` rather than hardcoding one path.
- A test asserts that loading and re-saving all region map files, in all reference engines, changes zero bytes.
- A test asserts the loader **rejects** a file where `map_section` has been renamed to `id`, unless the project's Inja template also uses `id`. The template at `src/data/region_map/region_map_sections.json.txt` is parsed to find out which key it reads. The tool derives the contract from the build rather than assuming it.

**The regression test, named for the incident:**

```ts
it("cannot reproduce the 2026-08-18 porymap 6 failure", () => {
  const src = readFileSync(P.regionMapSections, "utf8");
  const saved = saveRegionMap(loadRegionMap(src), src);
  expect(saved).toBe(src);
  expect(saved).not.toContain('"id":');
  expect(saved).toContain('"map_section":');
});
```

---

## Task 5 (MOVED to roadmap Plan 15, D22): Region map editing

**Files:** `packages/core/src/edit/regionMap.ts`, `packages/ui/src/components/RegionMapEditor.tsx` + tests

**Requirements:**
- Drag entries on the region map grid; edit `name`, `x`, `y`, `width`, `height`.
- Renders the actual region map tilemap from `region_map_layout*.h` beneath the entries, so placement is done against the real picture rather than a blank grid.
- Multiple region maps (Hoenn, Johto, JK) are selectable — the subject repo has four layout headers and two section files.
- Adding a new `MAPSEC` is an explicit action that also reports the constant needs adding to `include/constants/region_map_sections.h`; PokeMap does not edit that header itself in this plan.
- **Every save round-trips through Task 4's preserving writer.**

---

## Task 6: Tileset binary writing

**Reduced 2026-11-13 (D22); shared with roadmap Plan 15 (D26, D27).** Plan 14.2 writes `metatiles.bin` and `metatile_attributes.bin` through lossless patchers (`packages/core/src/blockEdit/gbaPatch.ts`). This task is the indexed `tiles.png` writer and the `.pal` writer, built once by whichever of Plan 3 and Plan 15 starts first. Invariant I3 below still binds.

**Files:** `packages/core/src/write/indexedPng.ts`, `packages/core/src/write/pal.ts` + tests (row 6a)

**Requirements:**
- Write `tiles.png` as an **indexed** PNG at the source file's original bit depth and palette — re-encoding a depth-4 sheet as depth-8 would work but produces a gratuitous diff, and `gbagfx` cares about the format.
- Write `.pal` files as JASC-PAL with the same header and line endings as the original.
- **Never write `.4bpp`, `.gbapal` or `.lz`** — invariant **I3**. Those are build outputs; writing them creates files that `.gitignore` hides and that `make` will overwrite, which is exactly the kind of ghost that costs a day.
- Round-trip test, per trap 12: load and re-save every tileset in every reference engine. An unchanged `tiles.png` or `.pal` is not written; a written `tiles.png` decodes to exactly the intended pixels and palette at the source depth. Note this requires an indexed-PNG *encoder*, the counterpart to Plan 1 Task 9's reader; write it here with the same "no dependency, ~120 lines" approach.

---

## Task 7: Tileset editor

**Reduced 2026-11-13 (D22) and 2026-11-21.** Plan 14.2's block editor (merged via [#32](https://github.com/itnevres/pokemap/pull/32) → `9d14637`) covers metatile composition (two layers, per-tile palette and flips), behaviour and layer type, the split labels, the usage warning before a save, and cache invalidation; their bullets were deleted here on 2026-11-21. D27 keeps the rest inside PokeMap: tile pixel editing and palette editing (rows 7a and 7b, shared with roadmap Plan 15 per D26) and the FireRed attribute fields (row 7c).

**Files:** `packages/core/src/edit/tileset.ts`, `packages/ui/src/components/TilesetEditor.tsx` + tests

**Requirements:**
- Edit tile pixels (row 7a). Its own spec and interview settle the tools, undo, how a sheet edit is staged and owned, and GBC's 2-bit sheets.
- Edit palettes as 16 colours; colours are GBA BGR555, so the editor must quantise to 5 bits per channel and show the quantised value. A colour picker offering 24-bit precision that silently rounds is a lie about what the hardware will show.
- On FireRed, edit the terrain and encounter-type attributes in the block editor's field spec, read from the profile masks, never hardcoded (row 7c).
- Only if Plan 14.2's whole-cache clear (`pngCache.clear()` on every overlay change, `server/src/index.ts:221`) measures as a stall after a tileset edit: invalidate by tileset instead, with a test that a layout on another tileset keeps its cached image. With 1,020 layouts, re-rendering everything is a several-second stall.

---

## Task 8: Layout management

**Reduced 2026-11-13 (D22).** Creating a layout moves to roadmap Plan 14C with Task 9. Resize, border size and delete stay here.

**Files:** `packages/core/src/edit/layouts.ts` + test

**Requirements (built here, rows 8a-8e):**
- Resize a layout, preserving overlapping blockdata and filling new area with the default metatile from the engine profile.
- Change border size, honouring the 3×2 case.
- Delete a layout, refusing when any map still references it and naming those maps.

**Moved to roadmap Plan 14C (D22); kept as requirements for its spec, not built here:**
- Create a new layout: writes the `layouts.json` entry, creates `map.bin` and `border.bin` at the right size, and **requires a `layout_version`** on engines that support it — chosen explicitly by the user, never defaulted silently, because a wrong choice here produces exactly `open-bugs.md` #41.
- New entries are added to `layouts.json` with `insertArrayElement`, matching the file's existing indentation, and carry **only** the keys their siblings carry — a pokeemerald project's new layout does not sprout `border_width`.

---

## Task 9 (MOVED to roadmap Plan 14C, D22): New map creation

**Files:** `packages/core/src/edit/newMap.ts` + test

**Requirements:**
- Create `data/maps/<Name>/map.json`, `header.inc`, `events.inc`, `connections.inc`, `scripts.inc`, and register the map in `map_groups.json`.
- The generated `map.json` carries exactly the key set the project's other maps carry — read from a sibling in the same group rather than from a bundled template. The subject repo's audit found all 1,207 maps sharing an identical 14-key top-level schema; a new map must not be the first exception.
- The `.inc` files match the project's existing generated form, verified by a golden test that regenerates an existing map's `.inc` files and diffs them.
- Refuse a name that collides, or that is not a valid C identifier.

---

## Task 10 (DELETED, D22): Extend the corpus gate

**Deleted 2026-11-13 (D22):** each plan that adds a writer extends the corpus gate (`packages/core/test/write/corpus.test.ts`) for its own file types. The task's original text was removed 2026-11-21; it is in this file's history before that date.

---

## Plan 3 completion checklist

Updated 2026-11-21 to the Subtasks table. The lines for moved tasks are listed last, marked with the plan they moved to.

- [ ] The `gate` skill passes, and the corpus gate covers each file kind this plan writes (D22)
- [ ] Tasks 2, 3 and 8 (rows 2a-2d, 3a-3e, 8a-8e): each ends with a live check on scratch clones in both families
- [ ] Row 6a: an unchanged `tiles.png` or `.pal` is not written; a written one decodes to exactly the intended pixels and palette at the source depth (trap 12)
- [ ] Rows 7a, 7b: edit a tile's pixels or a palette colour; every map using that tileset updates, and the save dialog named them beforehand
- [ ] Row 7c: the FireRed fields' acceptance passes on a scratch copy of the pokefirered reference (question 5)
- [ ] *(Moved to roadmap Plan 14C.)* Drag a map in the world view; the connection `offset` in `map.json` changes and nothing else does
- [ ] *(Moved to roadmap Plan 14C.)* Create a new layout without a `layout_version` — refused, by name, with the fix
- [ ] *(Moved to roadmap Plan 15.)* Edit a region map entry, then build the decomp (`make modern` for the GBA subject; RESUME, Environments) — **the build succeeds.** This is the direct rebuttal of the 2026-08-18 failure and must be demonstrated, not assumed
- [ ] *(Moved to roadmap Plan 15.)* `git diff` in the decomp after a region map edit shows one changed value and no renamed keys
