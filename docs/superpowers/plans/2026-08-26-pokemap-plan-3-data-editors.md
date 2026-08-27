# PokeMap Plan 3 — Connections, Headers, Encounters, Tilesets, Region Map

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Read [Plan 0](2026-08-26-pokemap-plan-0-roadmap.md) first — invariants I1–I8 bind every task.
>
> **RE-GRANULARISE BEFORE EXECUTING.** Task level only; expand to Plan 1's step shape against the code Plans 1–2 actually produced.

**Goal:** Complete Porymap parity — editors for connections, map headers, wild encounters, tilesets and the region map — with special care around `region_map_sections.json`, the file whose rewrite broke the build on 2026-08-18.

**Architecture:** Every editor is a UI over the Plan 2 save funnel. No editor writes directly. New guards are added to `write/guards.ts`, never bypassed.

**Success criteria — demonstrated, not asserted:**
1. Drag a map in the stitched world view and have it write a correct connection `offset`.
2. Edit a metatile in the tileset editor and see it change across every map that uses it.
3. Edit a region map entry, run `make`, and get a successful build — the direct rebuttal of the 2026-08-18 failure.
4. The 5-engine write corpus still passes at zero bytes changed.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/core/src/edit/connections.ts` | Connection add/remove/offset, with geometry from drag |
| `packages/core/src/edit/header.ts` | Map header field editing, engine-aware |
| `packages/core/src/edit/encounters.ts` | Wild encounter table editing |
| `packages/core/src/load/regionMap.ts` | `region_map_sections*.json` loading, schema-preserving |
| `packages/core/src/edit/regionMap.ts` | Region map entry editing |
| `packages/core/src/edit/tileset.ts` | Metatile composition, attributes, palettes |
| `packages/core/src/write/tilesetBinary.ts` | `metatiles.bin`, `metatile_attributes.bin`, `tiles.png`, `.pal` writing |
| `packages/ui/src/components/ConnectionEditor.tsx` | |
| `packages/ui/src/components/HeaderInspector.tsx` | |
| `packages/ui/src/components/EncounterEditor.tsx` | |
| `packages/ui/src/components/TilesetEditor.tsx` | |
| `packages/ui/src/components/RegionMapEditor.tsx` | |

---

## Task 1: Connection editing

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
- **The percentage is shown live beside every slot**, from the same `speciesChances` used by the atlas. Editing slot 0 of `land_mons` should visibly say 20%, because slot position is the single most misunderstood part of this data.
- Adding a method to a map that lacks one is an explicit action, using `insertArrayElement` — matching the "never invent keys" rule.
- A species field validates against the project's real species list; an unknown constant is a refusal with the closest matches listed.
- Editing here immediately updates the encounter atlas and any wild signs whose species is now off-table get flagged in the sign list. The two features stay coherent.

---

## Task 4: Region map loading — schema-preserving

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

## Task 5: Region map editing

**Files:** `packages/core/src/edit/regionMap.ts`, `packages/ui/src/components/RegionMapEditor.tsx` + tests

**Requirements:**
- Drag entries on the region map grid; edit `name`, `x`, `y`, `width`, `height`.
- Renders the actual region map tilemap from `region_map_layout*.h` beneath the entries, so placement is done against the real picture rather than a blank grid.
- Multiple region maps (Hoenn, Johto, JK) are selectable — the subject repo has four layout headers and two section files.
- Adding a new `MAPSEC` is an explicit action that also reports the constant needs adding to `include/constants/region_map_sections.h`; PokeMap does not edit that header itself in this plan.
- **Every save round-trips through Task 4's preserving writer.**

---

## Task 6: Tileset binary writing

**Files:** `packages/core/src/write/tilesetBinary.ts` + test

**Requirements:**
- Write `metatiles.bin` (16 bytes per metatile) and `metatile_attributes.bin` (2 or 4 bytes per the engine profile).
- Write `tiles.png` as an **indexed** PNG at the source file's original bit depth and palette — re-encoding a depth-4 sheet as depth-8 would work but produces a gratuitous diff, and `gbagfx` cares about the format.
- Write `.pal` files as JASC-PAL with the same header and line endings as the original.
- **Never write `.4bpp`, `.gbapal` or `.lz`** — invariant **I3**. Those are build outputs; writing them creates files that `.gitignore` hides and that `make` will overwrite, which is exactly the kind of ghost that costs a day.
- Round-trip test: load and re-save every tileset in every reference engine, zero bytes changed. Note this requires an indexed-PNG *encoder*, the counterpart to Plan 1 Task 9's reader; write it here with the same "no dependency, ~120 lines" approach.

---

## Task 7: Tileset editor

**Files:** `packages/core/src/edit/tileset.ts`, `packages/ui/src/components/TilesetEditor.tsx` + tests

**Requirements:**
- Compose a metatile from an 8×8 tile picker: two layers, per-tile palette and flips.
- Edit metatile attributes: behaviour, layer type, and on FireRed the terrain and encounter types — read from the profile masks, never hardcoded.
- Edit palettes as 16 colours; colours are GBA BGR555, so the editor must quantise to 5 bits per channel and show the quantised value. A colour picker offering 24-bit precision that silently rounds is a lie about what the hardware will show.
- **The tile picker and metatile list respect the current layout's split**, with the boundary labelled — same rule as Plan 2 Task 7.
- Changing a metatile invalidates the render cache for every layout using that tileset, and the world view updates. There is a test asserting the invalidation is by tileset, not global — with 1,020 layouts, invalidating everything is a several-second stall.
- **Warn loudly before saving a tileset**: a metatile edit changes every map using it. The dialog names how many layouts are affected and lists them. Porymap gives no such warning and this is a real way to break many maps at once.

---

## Task 8: Layout management

**Files:** `packages/core/src/edit/layouts.ts` + test

**Requirements:**
- Create a new layout: writes the `layouts.json` entry, creates `map.bin` and `border.bin` at the right size, and **requires a `layout_version`** on engines that support it — chosen explicitly by the user, never defaulted silently, because a wrong choice here produces exactly `open-bugs.md` #41.
- Resize a layout, preserving overlapping blockdata and filling new area with the default metatile from the engine profile.
- Change border size, honouring the 3×2 case.
- Delete a layout, refusing when any map still references it and naming those maps.
- New entries are added to `layouts.json` with `insertArrayElement`, matching the file's existing indentation, and carry **only** the keys their siblings carry — a pokeemerald project's new layout does not sprout `border_width`.

---

## Task 9: New map creation

**Files:** `packages/core/src/edit/newMap.ts` + test

**Requirements:**
- Create `data/maps/<Name>/map.json`, `header.inc`, `events.inc`, `connections.inc`, `scripts.inc`, and register the map in `map_groups.json`.
- The generated `map.json` carries exactly the key set the project's other maps carry — read from a sibling in the same group rather than from a bundled template. The subject repo's audit found all 1,207 maps sharing an identical 14-key top-level schema; a new map must not be the first exception.
- The `.inc` files match the project's existing generated form, verified by a golden test that regenerates an existing map's `.inc` files and diffs them.
- Refuse a name that collides, or that is not a valid C identifier.

---

## Task 10: Extend the corpus gate

**Files:** Modify `packages/core/test/write/corpus.test.ts`

Add to the existing gate: region map files, tileset binaries, `layouts.json`, and `map_groups.json` — load and re-save every one across all reference engines, zero bytes changed.

By the end of this plan the gate covers every file type PokeMap can write. That is the point at which "it cannot rewrite your schema" stops being a design intention and becomes a tested property.

---

## Plan 3 completion checklist

- [ ] `npm test` green, including the extended corpus across every writable file type
- [ ] Drag a map in the world view; the connection `offset` in `map.json` changes and nothing else does
- [ ] Edit a metatile; every map using that tileset updates, and the save dialog named them beforehand
- [ ] Edit a region map entry, then run `make` in the decomp — **the build succeeds.** This is the direct rebuttal of the 2026-08-18 failure and must be demonstrated, not assumed
- [ ] `git diff` in the decomp after a region map edit shows one changed value and no renamed keys
- [ ] Create a new layout without a `layout_version` — refused, by name, with the fix
