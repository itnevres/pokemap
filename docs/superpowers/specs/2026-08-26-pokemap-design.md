# PokeMap — Design Spec

**Date:** 2026-08-26
**Status:** Approved
**Target repo:** `C:\Programming Projects\PokeMap`
**Primary subject repo:** `C:\Programming Projects\Pokemon Game\game` (Heart & Soul, pokeemerald-based)

---

## 1. Goal

A map editor with Porymap feature parity for pokeemerald-family decomp projects, which additionally:

1. **Understands per-layout metatile boundaries** (`layout_version`), which Porymap does not — this is the reason the tool exists.
2. **Stitches maps into one pannable world**, overworld by connection graph and dungeons by warp graph with manual override.
3. **Writes minimal, schema-faithful diffs**, so it can never rewrite a file into a schema the project's build tools do not accept.
4. **Exposes a headless CLI** so AI coding agents can build maps and visually verify their own work without an emulator or a ROM build.

---

## 2. Why this exists — the two documented failures

Both are recorded in the subject repo's own docs and are the concrete motivation.

### 2.1 Porymap 6 rewrote schema files and broke the build

`docs/resolved.md`, 2026-08-18. Porymap 6:

- Rewrote `src/data/region_map/region_map_sections.json`, renaming `map_section` → `id` on all 115 entries. `jsonproc` renders `region_map_entries.h` from an Inja template that reads `map_section.map_section`; the key was gone, so it failed — **and the make rule deletes its own output on failure**, so every subsequent build failed identically, naming a file nobody had touched.
- Added `border_width` / `border_height` to all 726 layouts in `data/layouts/layouts.json` that lacked them (1452 lines).

The failure did not name its cause and was initially misdiagnosed as a `-j16` parallel-make race.

**Root cause class:** the tool reserialized whole files in *its* schema rather than editing the project's.

### 2.2 Porymap 5 renders and corrupts 389 layouts

`docs/human-porymap.md`, 2026-08-26. The subject tree has **two metatile boundaries**, per layout:

| `layout_version` | tiles in primary | metatiles in primary | pals in primary | layouts |
|---|---|---|---|---|
| `emerald` | 512 | 512 | 6 | 389 |
| `frlg` | 640 | 640 | 7 | 349 |
| `hns` | 640 | 640 | 7 | 282 |

Porymap reads a single `NUM_METATILES_IN_PRIMARY` from `include/fieldmap.h` (640). Every `emerald` layout therefore opens rendering wrong — "the same hot pink the bug was about" — and **saving one in that state rewrites its `map.bin` against the wrong boundary.**

The current human workaround is to hand-swap six `#define`s in `include/fieldmap.h`, restart Porymap, edit, and swap them back before building. Forgetting step 5 renders every FRLG and Johto map as garbage.

**`layout_version` is an upstream pokeemerald-expansion field**, not a Heart & Soul invention (confirmed present in `refs/pokeemerald-expansion/data/layouts/layouts.json`). Supporting it serves every expansion-based project.

### 2.3 A third, quieter failure

`use_custom_border_size` lives in `porymap.project.cfg`, which is **gitignored**, so it does not survive a fresh clone and nothing warns you. At `0`, Porymap renders a 3×2 border as 2×2 and *saving rewrites that map's `border.bin` down to 2×2*, destroying data. **7 layouts have a 3×2 border**: `ViridianForest`, `SafariZoneCenter`, `SafariZoneEast`, `SafariZoneWest`, `KantoSafariZoneNorth`, `SixIslandPatternBush`, `ThreeIslandBerryForest`.

PokeMap reads border dimensions from `layouts.json` per layout and always honours them. There is no setting to get this wrong.

---

## 3. Target engines

PokeMap must work against all of these. Verified schema differences:

| Engine | `layouts.json` extra keys | `map.json` extra keys | metatile attrs |
|---|---|---|---|
| `pokeemerald` | — | — | 2-byte |
| `modern-emerald` | — | — | 2-byte |
| `pokeclassic` | `border_width`, `border_height` | — | 2-byte |
| `pokefirered` | `border_width`, `border_height` | `floor_number` | **4-byte** + terrain/encounter masks |
| `pokeemerald-expansion` | `border_width`, `border_height`, `layout_version` | `region` | 2-byte |
| Heart & Soul (subject) | `border_width`, `border_height`, `layout_version` | — | 2-byte |

Reference copies live in `C:\Programming Projects\Pokemon Game\refs\`.

**Design consequence.** Because the writer (§7) preserves absent keys and never invents keys, PokeMap needs *no per-engine write schema*. A pokeemerald map round-trips without growing `border_width`; a firered map keeps its `floor_number`. Engine differences affect only **reading** (attribute size and masks, split resolution) and **which UI controls to show**.

Engine configuration is read from `porymap.project.cfg` when present, with built-in defaults per `base_game_version` when it is absent (6 of the 8 reference repos have no cfg).

---

## 4. Architecture

A single TypeScript monorepo at `C:\Programming Projects\PokeMap`, pointed at a decomp directory by configuration. It never assumes it lives inside the decomp.

| Package | Responsibility | May import |
|---|---|---|
| `core` | Parse decomp → model → render to RGBA → minimal-diff write | fs adapter only |
| `cli` | Headless commands, for the owner and for AI agents | `core` |
| `server` | HTTP shim exposing `core` to the browser | `core` |
| `ui` | React + Canvas editor | `server` over HTTP |
| `mcp` *(Plan 4)* | MCP tools wrapping the CLI surface | `core` |
| `electron` *(Plan 4)* | Ships `ui` + `server` as a desktop app | `ui`, `server` |

### 4.1 The RGBA rule

`core` renders to plain `Uint8ClampedArray` RGBA buffers. It never touches a canvas, a DOM node, or a PNG encoder. Node encodes buffers to PNG; the browser blits them via `putImageData` or uploads them as a WebGL texture.

This single rule is what makes agent rendering and UI rendering **the same code path**: an agent's PNG is pixel-identical to what the user sees on screen. It also keeps `core` trivially unit-testable with no browser and no headless-GL dependency.

### 4.2 Development vs. shipping

Developed and tested as a web app plus a local Node server. Shipped as an Electron desktop app (Plan 4). Because `server` is a thin shim over `core`, the Electron wrap is configuration, not a rewrite.

---

## 5. Data model and sources of truth

### 5.1 Files read

| Concept | Path | Format |
|---|---|---|
| Engine profile | `porymap.project.cfg` | `key=value` text |
| Split constants | `include/fieldmap.h` | C `#define`s |
| Layouts | `data/layouts/layouts.json` | JSON |
| Map groups | `data/maps/map_groups.json` | JSON |
| Map | `data/maps/<Name>/map.json` | JSON |
| Blockdata | `data/layouts/<Name>/map.bin` | `u16[]` LE |
| Border | `data/layouts/<Name>/border.bin` | `u16[]` LE |
| Tileset → dir | `src/data/tilesets/metatiles.h`, `graphics.h` | C `INCBIN` paths |
| Metatiles | `data/tilesets/{primary,secondary}/<dir>/metatiles.bin` | `u16[]` LE |
| Metatile attributes | `.../metatile_attributes.bin` | `u16[]` or `u32[]` LE |
| Tile graphics | `.../tiles.png` | 4bpp indexed PNG |
| Palettes | `.../palettes/NN.pal` | JASC-PAL text |
| Wild encounters | `src/data/wild_encounters.json` | JSON |
| OW mon sprites | `graphics/object_events/pics/pokemon/<species>.png` | indexed PNG |
| Species icons | `graphics/pokemon/<species>/icon.png` | indexed PNG |

### 5.2 Build artifacts are NOT sources of truth

`.gitignore` lines 18–21 ignore `*.4bpp`, `*.gbapal`, `*.lz`. These are generated by `gbagfx` during the build and **do not exist in a fresh clone**.

**PokeMap reads `tiles.png` and `palettes/NN.pal`.** It may use `tiles.4bpp` / `NN.gbapal` only as an optimisation when present and never as the sole source. A tool built against `tiles.4bpp` silently works on the author's machine and fails for everyone else.

### 5.3 Tileset directory resolution

`gTileset_General` → `data/tilesets/primary/general/` is resolved by parsing the `INCBIN` string literals in `src/data/tilesets/metatiles.h` and `graphics.h`, keyed by symbol name.

It is **never** derived by mangling the symbol into a directory name. The subject repo's `rules.md` records that mangling being wrong before ("a run of DIGITS is its own word").

### 5.4 Bit layouts

**Block (`map.bin` / `border.bin`), one `u16` per tile**, masks read from `porymap.project.cfg`:

```
metatile id  = v & block_metatile_id_mask   (0x03FF)
collision    = (v & block_collision_mask) >> 10   (0x0C00)
elevation    = (v & block_elevation_mask) >> 12   (0xF000)
```

**Metatile: 16 bytes = 8 × `u16` tile entries** (2 layers × 2×2 subtiles), so `metatiles.bin.length / 16` is the tileset's real metatile count. Each entry:

```
tile index   = e & 0x03FF
x flip       = (e >> 10) & 1
y flip       = (e >> 11) & 1
palette      = (e >> 12) & 0x0F
```

**Metatile attributes**, size and masks from the engine profile. Subject repo: 2 bytes, `metatile_behavior_mask=0xFF`, `metatile_layer_type_mask=0xF000`. FireRed: 4 bytes, plus `metatile_terrain_type_mask=0x3E00`, `metatile_encounter_type_mask=0x7000000`.

### 5.5 Split resolution — the core rule

For any layout:

```
version = layout.layout_version ?? "emerald"        // matches GetNumMetatilesInPrimary()'s default: branch
split   = version === "emerald"
            ? { tiles: NUM_TILES_IN_PRIMARY_EMERALD, metatiles: NUM_METATILES_IN_PRIMARY_EMERALD, pals: NUM_PALS_IN_PRIMARY_EMERALD }
            : { tiles: NUM_TILES_IN_PRIMARY,         metatiles: NUM_METATILES_IN_PRIMARY,         pals: NUM_PALS_IN_PRIMARY }
```

All six constants are parsed from `include/fieldmap.h`, never hardcoded, so editing the header changes PokeMap's behaviour to match.

On engines with no `layout_version` support, every layout uses the single global set. The subject repo is the hard case; the other five engines take the easy path through identical code.

**Resolution rules:**
- metatile id `< split.metatiles` → primary tileset, index `id`
- metatile id `>= split.metatiles` → secondary tileset, index `id - split.metatiles`
- palette index `< split.pals` → primary palettes; otherwise secondary palettes at `index - split.pals`
- tile index `< split.tiles` → primary `tiles.png`; otherwise secondary at `index - split.tiles`

**A layout whose `layout_version` key is missing on an engine that supports the key renders as `emerald` but is refused for saving**, because saving is where the boundary bug does damage. The refusal names the layout and tells the user to run `tools/donors/classify_layout_versions.py --write`.

---

## 6. Rendering

- A metatile renders as 16×16 RGBA: bottom layer, then top layer, honouring `layer_type` from attributes and per-tile flips and palettes.
- Colour 0 of any palette is transparent.
- JASC-PAL is 8-bit RGB text; GBA palettes are BGR555. `.pal` files store the already-expanded 8-bit values, so they are read directly.
- A layout renders as `width × height` blocks at 16px, plus its border repeated outside, honouring `border_width` / `border_height` (2×2 default, 3×2 for 7 layouts).
- Overlays, each independently toggleable: grid, collision, elevation, events, connection seams, encounter gutters (§9).
- Caching is keyed by `(layoutId, primaryTilesetId, secondaryTilesetId, splitVersion)`. Changing a tileset or a `layout_version` invalidates exactly the affected layouts.

**Day/night palettes and `.pla` lights are out of scope** (Plan 5). Rendering uses base palettes only.

---

## 7. Write safety

The single most important property of this tool: **it must be structurally incapable of the §2.1 failure.**

### 7.1 Surgical JSON editing

JSON files are never reserialized. PokeMap loads raw text, locates the target value by source position, and splices. Therefore:

- Unknown keys survive untouched — a field PokeMap has never heard of cannot be renamed.
- Absent keys stay absent — PokeMap cannot inject `border_width` into 726 layouts.
- Key order and indentation are preserved.
- Only genuinely changed values produce bytes on disk.

### 7.2 The round-trip corpus test

CI loads and re-saves **every map and every layout across the subject repo and all reference engines** — roughly 5,000 maps across 5 engines — with no edits, and asserts **zero bytes changed**.

This is simultaneously the portability proof and the safety proof. A regression that reintroduces schema rewriting fails this test loudly, at build time, before it can touch anyone's repo.

### 7.3 Other guarantees

- **Explicit save only.** No autosave, no save-on-close. Opening a map to look at it can never write. (Porymap's "saving a map rewrites its whole layout file" is why the subject repo's docs say "if you only opened it to look, close without saving.")
- **Diff preview** before every write: exact files, exact byte deltas.
- **`.bin` written only when the grid actually changed**, and only against that layout's own boundary.
- **Refuse to save** a layout whose `layout_version` is missing on an engine that supports it.
- **Refuse to save** a block whose metatile id falls outside its tileset's real range for that layout's split — the `check_metatile_range.py` invariant, enforced at write time rather than discovered at build time.
- Border dimensions always honoured from `layouts.json`; no `use_custom_border_size` equivalent exists.

Opt-in git integration (refuse to save into a dirty tree; auto-commit each save) is deferred to Plan 4 as a setting, default off.

---

## 8. Stitched world view

### 8.1 Planar pass

Breadth-first traversal of the `connections` graph using `direction` ∈ {`up`,`down`,`left`,`right`} and `offset` in tiles, producing global tile coordinates for every reachable map. Disconnected regions form separate components, laid out side by side.

`dive` and `emerge` connections (7 each in the subject repo) are **excluded from planar layout** and drawn as vertical link badges.

Conflicts — where two paths through the graph disagree about a map's position — are reported, not silently resolved, and the offending connection pair is highlighted. This makes connection bugs visible as geometry.

### 8.2 Dungeon pass

Off by default when the user disables dungeon stitching. When enabled, a warp-graph heuristic places unconnected maps as a starting guess. Any map can be dragged to override, and with auto-layout off the canvas starts empty and maps are dragged on manually.

### 8.3 Sidecar

`.pokemap/world.json` in the decomp root holds manual positions, per-component offsets, and view state.

**PokeMap writes nothing else outside the decomp's own data files.** This file never affects the build and can be committed or gitignored at the owner's discretion.

### 8.4 Scale

1,209 maps. Each map renders once to an offscreen buffer, cached per §6; the world view applies viewport culling and LOD mip levels so zoomed-out panning stays interactive.

---

## 9. Encounter atlas (read-only)

Data: `src/data/wild_encounters.json` — 497 map entries in `gWildMonHeaders`, plus `gBattlePyramidWildMonHeaders` (7) and `gBattlePikeWildMonHeaders` (4). Four methods with per-slot weights: `land_mons` (12 slots), `water_mons` (5), `rock_smash_mons` (5), `fishing_mons` (10).

- **Per-map gutter**: species icons from `graphics/pokemon/<species>/icon.png` along the map edge, grouped by method. Hover gives species, level range, and **true percentage computed from `encounter_rates` weights** — not slot count. Slot 0 of `land_mons` is 20%; slot 11 is 1%.
- **Species spotlight**: type a species; the stitched world dims except maps containing it, each lit with rate and level band. The design question "where can I catch X, and at what level" answered by looking, across 1,209 maps.
- **Coverage lenses**: level-curve heatmap; maps with no encounter table; species appearing in zero tables; per-method coverage.
- **UI guidance**: overlays default off behind one obvious toggle. Turning a lens on opens a legend panel stating in plain words what the colours mean and what to do next. No lens is ever active without its legend visible. Empty states explain rather than sit blank.

CLI: `pokemap encounters <map>`, `pokemap where <species>`, `pokemap coverage`.

---

## 10. Wild sign authoring (writes real game data)

Heart & Soul places overworld Pokémon at map edges to tell the *player* what is catchable there. PokeMap authors those markers. 24 maps use them today.

**Mechanism:** an ordinary object event whose `graphics_id` is `OBJ_EVENT_GFX_SPECIES(NAME)` (`include/constants/event_objects.h`: `OBJ_EVENT_GFX_MON_BASE 0x200`). PokeMap renders them with the real overworld sprite from `graphics/object_events/pics/pokemon/<species>.png` (1,304 files present). **Porymap renders these as nothing**, so this is currently blind work.

**Flow:** select a map → PokeMap reads its encounter table → offers species **ranked by real encounter rate**, so signs match what is actually catchable → user picks one or more → PokeMap proposes edge positions (border-adjacent, walkable, elevation 3, clear of warps and connection seams) → user drags to adjust → save.

**Writes, per sign**, matching the existing `CeladonCity` Poliwrath template exactly:

```json
{
  "graphics_id": "OBJ_EVENT_GFX_SPECIES(POLIWRATH)",
  "x": 36, "y": 14, "elevation": 3,
  "movement_type": "MOVEMENT_TYPE_FACE_RIGHT",
  "movement_range_x": 1, "movement_range_y": 1,
  "trainer_type": "TRAINER_TYPE_NONE",
  "trainer_sight_or_berry_tree_id": "0",
  "script": "CeladonCity_EventScript_Poliwrath",
  "flag": "0"
}
```

plus a script appended to that map's `scripts.inc`:

```
CeladonCity_EventScript_Poliwrath::
	lock
	faceplayer
	waitse
	playmoncry SPECIES_POLIWRATH, CRY_MODE_NORMAL
	msgbox CeladonCity_Text_Poliwrath, MSGBOX_DEFAULT
	waitmoncry
	closemessage
	release
	end
```

plus a `<Map>_Text_<Species>` entry authored in the editor.

**Scope guard:** this is templated `.inc` generation for this one pattern. It is not general script editing. Poryscript stays parked in Plan 5.

**Guardrails:**
- Placement on a warp tile or connection seam is blocked. (`docs/human-porymap.md`: moving art out from under a warp silently unpairs it.)
- Choosing a species absent from the map's encounter table is allowed but warned.
- The per-map object-event cap is enforced.
- Every generated symbol name is checked for collision against the existing `.inc` before writing.

CLI: `pokemap sign add <map> <species> --at x,y`, `sign list <map>`, `sign suggest <map>` — so an agent can place signs across many maps and render a PNG to check its own work.

---

## 11. Agent interface

```
pokemap render <map|layout> --out shot.png [--grid] [--collision] [--events] [--encounters]
pokemap render-world --bbox x,y,w,h --out world.png
pokemap validate [--metatile-range] [--warps] [--connections] [--layout-version]
pokemap query <map> --events | --header | --connections
pokemap encounters <map>
pokemap where <species>
pokemap coverage [--empty] [--unused]
pokemap sign add|list|suggest
pokemap diff
```

`validate --metatile-range` is a native port of the subject repo's `tools/verify/check_metatile_range.py`, per-`layout_version` — the same check, without Python and without a ROM build.

`render` replaces the `tools/verify/map_shot.sh` emulator round-trip with a millisecond PNG. This is what lets an AI agent check its own map work visually.

All commands accept `--project <path>` and emit `--json` where a machine reader makes sense.

---

## 12. Testing

- **`core` unit tests** (vitest) against real fixtures copied read-only from the subject repo and the reference engines.
- **Round-trip corpus test** (§7.2) — zero bytes changed across ~5,000 maps and 5 engines. This is the gate.
- **Visual regression** — the CLI renders a fixed map list to PNG and compares hashes. The list must include at least one `emerald`, one `frlg`, and one `hns` layout, and at least one of the seven 3×2-border layouts.
- **UI tests** (Playwright) driving the real app.
- The renderer is additionally spot-checked against `tools/verify/scratch/mapshot/` screenshots from the subject repo, which were produced by an emulator and are therefore ground truth.

---

## 13. UI development

All UI work invokes the `frontend-design` and `ui-ux-pro-max` skills. This is written into the plan steps rather than left to the executor's discretion.

---

## 14. Plan sequence

| Plan | Scope |
|---|---|
| **0** | Overarching roadmap — repo conventions, package layout, invariants binding all plans |
| **1** | `core` loaders, per-layout renderer, `cli`, map list, single-map view, stitched world, encounter atlas |
| **2** | Painting, collision/elevation, event editing, wild sign authoring — the first write path |
| **3** | Connections/headers/wild-encounter editors, tileset editor, region map editor |
| **4** | Electron packaging, MCP server, opt-in git integration |
| **5** | Future work, unmapped: poryscript, prefabs, day/night palette preview, `.pla` lights |

---

## 15. Out of scope

Deliberately excluded, each recorded in Plan 5 rather than forgotten: poryscript support, prefabs, day/night palette preview (`SWAP_PAL`, `((x+9)%16).pal`), `.pla` lights, ROM building, emulator integration, multi-user editing.

---

## 16. Success criteria

1. Every one of the 1,209 subject maps opens and renders correctly — both boundaries at once, no constant swapping, no restart.
2. The round-trip corpus test passes at zero bytes changed across all six repos.
3. The whole overworld pans as one continuous image; dungeons can be placed and persist.
4. An AI agent can edit a map, render it to PNG, and inspect the result without building the ROM.
5. Wild signs can be authored and land in the ROM identically to hand-written ones.
