# Plan 5: Future work

A parking lot of researched items, each with enough detail to pick it up later without re-deriving the research. It is not executed as a whole: when an item is wanted, run `superpowers:brainstorming` on it, then `superpowers:writing-plans`, and do not bolt it onto another plan mid-execution. Section 1: scripts linked out to the user's editor (D28). Section 3: day/night as a palette swap plus the event triggers and wild Pokémon that change with the time (D28). Section 4: `.pla` lights. Section 5: smaller items. Section 6: things deliberately not done. Every item that becomes a feature says what it means for Crystal, or carries a capability flag.

## Status

Open (backlog). Nothing is scheduled. Section 1 is ruled and has its two subtasks; sections 3 and 4 need an interview after a measurement step; section 5 needs one small check.

## Depends on

- Plan 18's table comes before section 1 is specced (D24d).
- Section 3 on GBA: the encounter tables per map, told apart by `base_label` (Plan 3 Task 3).
- Invariant I1 ([Plan 0](archive/plan-00-gba-roadmap.md)) for every GBA palette resolution.

## Binding decisions

- D22, D24d, D28 (text in [decisions.md](decisions.md)).

## Traps and pitfalls

**Section 1, Poryscript**
1. **The "link out" option is mostly built.** The project symbol index maps a script label to its file (`packages/server/src/projectSymbols.ts`), and Add Event already creates and copies scripts (`packages/core/src/addEvent/gbaBuild.ts`, `gbcBuild.ts`). What is missing is the line number and the link.
2. **The hub must not start an editor from a request.** Opening a file from an HTTP route is running a program on the user's machine with a path from the network. A `vscode://file/<path>:<line>` link rendered by the UI needs no hub code; use that, or rule the hub route as High tier with a fixed command and a path taken from the index only.
3. **Poryscript itself is GBA only and unused here.** The subject has `use_poryscript=0` (`porymap.project.cfg:39`) and Crystal has no such language. Full support would be a one-family feature behind a capability flag.
**Section 3, day/night**
4. **The control and the GBC half exist.** Morn/Day/Nite sits in the header behind `capabilities.timeOfDay` (`packages/ui/src/shell/adapter.ts:20`, GBC true and GBA false; `gbc/adapter.tsx:152-160`), and `time` runs through the GBC renderer and its cache (`packages/core/src/gbc/render/map.ts:310`; `packages/server/src/gbcRoutes.ts:473`). "A time-of-day control in the renderer" is GBA work only: the selected time is state inside the GBC adapter (`gbc/adapter.tsx:24`) and must move to the shell or be mirrored.
5. **Every GBA cache key lacks the mode.** `pngCache` is keyed `name:border` (`packages/server/src/index.ts:137`), the pre-warm tests `name:0` (`index.ts:1466`), and the metatile and world-tile URLs carry no time; the tileset version (`tv`) is already in the metatile and map-render URLs. A mode added to the renderer and not to each of these shows the wrong palette from cache, and unit tests with a mocked image will not see it (LESSONS, Server / Routes: "The server's `pngCache` was never invalidated on commit").
6. **`.swapPalettes` is used by only some tilesets.** Four tilesets in the subject now have `.swapPalettes` active and seven have it commented out (`src/data/tilesets/headers.h:55,123,176,182`). The type `"morn" | "day" | "nite"` is Crystal's; how many periods the subject's GBA engine has is unmeasured.
**Section 4, `.pla` lights**
7. **The files exist to be measured.** The subject holds 136 `.pla` files, per tileset palette (`data/tilesets/primary/general/palettes/04.pla`) and per species (`graphics/pokemon/charizard/normal.pla`). The format work starts from them and from the tool in the subject that writes them, not from guesses.
**Section 5, smaller items**
8. **Secret bases are covered for creation; weather triggers are not covered at all.** Add Event offers `secret_base` as a bg type (`packages/core/src/addEvent/gbaOptions.ts:131`). Weather triggers are not an event kind anywhere in PokeMap, and the subject uses them (`data/maps/Route119/map.json` has 21, `Route113` 19). They survive a save because edits are spliced into the original text, but the table's "likely already covered" is wrong for them. Nothing edits an existing event's fields beyond its position yet.
9. **`heal_locations.json` has no build rule in the subject;** `src/data/heal_locations.h` is tracked and no makefile names the JSON. Measure which one the game reads before any editor is planned (Plan 15a, step 15-0). Editing belongs with the fly points (Plan 15b).
10. **The `tRNS` note still stands.** GBA reads species icons, not front sprites, so the two index-15 sprites are not read today.

## Questions

**Rulings (D28; user, 2026-11-16).**
- Section 1: link out, in both families; subtasks 1a and 1b are the whole of it. Poryscript support is closed until a project uses it.
- Section 3: a palette swap is enough for the first version, and the time-of-day control must also show what else changes with the time: "day/night event triggers/wild pokemon change". Crystal has both in its data already (object events carry a time-of-day field; grass tables are per morn, day and nite, `packages/core/src/gbc/model/types.ts:284-285`); on GBA the subject keeps several encounter tables per map told apart by `base_label`, and how its events depend on the time is unmeasured.

**Open, for the interview:**
1. Claude's reading of the section 3 ruling, to confirm: with a time selected, the map shows only the events active at that time, and the encounter panel shows that time's table.
2. Are lights wanted in the preview? Recommendation: after the swap ships.

## Subtasks

**Section 1** (Medium and Low):
- (1a) the symbol index returns file and line for a label, both families: `packages/server/src/projectSymbols.ts` and its test, Medium, `npx vitest run --no-file-parallelism packages/server/test/projectSymbols.test.ts`.
- (1b) a link beside each script label in the event inspectors: `packages/ui/src/components/EventInspector.tsx`, `packages/ui/src/gbc/GbcEventInspector.tsx`, Low, `npx vitest run --no-file-parallelism packages/ui`, live check.
- Full Poryscript support stays a plan of its own and is not broken down.

**Sections 3 and 4.** Step 0 is a measurement written into the spec: how the subject's engine applies the swap, whether it blends, how many periods it has, what a `.pla` file holds. Provisional subtasks after the spec:
- (3a) palette mode in the GBA tileset load and renderer, resolved per layout split (invariant I1): `packages/core/src/load/tilesetData.ts`, `packages/core/src/render/`, fixtures; High (render core, numeric fixtures).
- (3b) the mode in every GBA render route, cache key and the pre-warm: `packages/server/src/` read routes; High (hub).
- (3c) the time control lifted to the shell and the GBA capability turned on: `packages/ui/src/shell/{adapter.ts,FamilyApp.tsx}`, `gba/adapter.tsx`, `gbc/adapter.tsx`; Medium.
- (3d) live acceptance in both families, with one GBA tileset that swaps and one that does not.
- (3e) the encounter panel follows the selected time, in both families. Waits on step 0.
- (3f) events filtered or dimmed by the selected time, in both families. Waits on step 0.

**Section 5:**
- (5a) A pin test that a map with weather-trigger coord events and a secret-base bg event saves byte-identically after an unrelated edit, on a scratch copy: `packages/core/test/write/corpus.test.ts` or a sibling; Low.
- The heal-locations measurement (trap 9) is Plan 15a's step 15-0. The other rows need no work.

### Section 1: Poryscript

**What it is:** A higher-level scripting language that compiles to the decomp's `.inc` script format, with `if`/`else`, `while`, `switch` and local labels. Porymap supports it via a `use_poryscript` project setting.

**Current state in the subject repo:** `porymap.project.cfg` has `use_poryscript=0`. The tree uses raw `.inc` scripts throughout.

**What PokeMap does instead (trap 1):** templated script generation, not general script editing. Add Event creates and copies scripts in both families (`packages/core/src/addEvent/`), and the project symbol index maps a script label to its file (`packages/server/src/projectSymbols.ts`).

**What full Poryscript support would need** (closed by D28 until a project uses it):
- A Poryscript parser and compiler, or shelling out to the real `poryscript` binary.
- Round-trip fidelity for `.pory` → `.inc`, which is genuinely hard: the compiler is not injective, so PokeMap could not reliably edit a `.inc` that a `.pory` produced.
- A script editor with syntax highlighting, and jump-to-definition from an event to its script.


**Estimated scope of full support:** Large. A plan of its own, at least Plan 1's size.

### Section 3: Day/night palette preview


**What it is:** The subject repo blends alternate palettes by time of day. From `src/data/tilesets/headers.h`:

```c
// Whether a palette has a night version, located at ((x + 9) % 16).pal
#define SWAP_PAL(x) ((x) < NUM_PALS_IN_PRIMARY ? 1 << (x) : 1 << ((x) - NUM_PALS_IN_PRIMARY))
```

So palette *n* has a night variant at `((n + 9) % 16).pal`. Note the macro is **already `NUM_PALS_IN_PRIMARY`-aware**, which means a correct implementation must resolve the split per layout exactly as the renderer does — invariant **I1** applies here too. A day/night preview that assumed one global palette boundary would be wrong on 389 layouts in the same way Porymap is.

**Current state:** not every tileset uses `.swapPalettes`; trap 6 has the count (four active, seven commented out, `gTileset_General` among the latter).

**What PokeMap does today:** GBA renders base palettes only, always; GBC renders the selected Morn/Day/Nite palettes (trap 4).

**What real support would need:**
- A palette-resolution mode threaded through the GBA `renderMetatile`. The time-of-day control already exists in the shared header (trap 4).
- Cache keys extended with the palette mode — the existing key is `(layout, primary, secondary, split)` and would need a fifth component.
- Understanding how the engine blends, not just swaps: check `src/palette.c` and whatever the day/night system does at runtime before assuming a straight substitution.
- A visual regression baseline per mode, which doubles the fixture set.

**Estimated scope:** Small-to-medium, and mostly research. The renderer changes are contained; working out the exact blend is the real work.

### Section 4: `.pla` lights

**What it is:** Per-tile light sources. From the same header:

```c
// Whether a palette has lights
// the color indices to blend are stored in the palette's color 0
#define LIGHT_PAL(x) ...
// NOTE: Instead of using LIGHT_PAL, consider taking a look at the .pla files
// to mark colors as lights, instead. The old method *should* still work.
```

Two mechanisms exist — the older `LIGHT_PAL` macro and the newer `.pla` files — and the header's own note says the newer one is preferred.

**What real support would need:**
- A `.pla` file format parser. **Find and read the upstream documentation first**; this is an expansion feature and guessing the format from bytes would be reckless.
- Light rendering composited over the base render, which is a genuinely different rendering path from anything in the renderer today.
- Interaction with day/night (§3) — lights presumably only matter at night, so these two are probably one piece of work rather than two.

**Estimated scope:** Medium. Should be scoped *with* §3, not separately.

### Section 5: Smaller items, recorded so they are not rediscovered

| Item | Note |
|---|---|
| **Heal location editing** | `enable_heal_location_respawn_data=0` in the subject repo, so the simpler schema applies. Small, but touches another JSON file and so needs its own round-trip coverage. |
| **Secret base editing** | `enable_event_secret_base=1`. Rare event type; Creating one is covered by Add Event (trap 8); editing its fields is not. |
| **Weather triggers** | `enable_event_weather_trigger=1`. Not covered by any editor (trap 8). |
| **Map allow-flags** | `enable_map_allow_flags=1`. Covered by Plan 3 Task 2's header editor. |
| **`tRNS` and non-zero transparent indices** | The PNG reader ignores `tRNS` and treats index 0 as transparent. Verified safe for everything PokeMap reads today (zero violations across 245 tileset sheets, 1,059 icons, 960 overworld sprites). But two battle sprites — `graphics/pokemon/togedemaru/front.png` and `anim_front.png` — use index **15** as transparent and index 0 as opaque. Any feature that widens scope to `graphics/pokemon/*/front.png` must read `tRNS` rather than assuming index 0, or those two render inverted. |
| **Multi-user editing** | Explicitly out of scope. PokeMap is a single-user desktop tool. |
| **ROM building / emulator integration** | Out of scope. PokeMap's answer to "does this look right" is `render`, which is faster than a build and does not need one. |
| **`region_map_sections.json.txt` template editing** | The Inja template drives what keys the build requires. Plan 15a *reads* it to derive the contract; editing it is a build-system change and does not belong in a map editor. |
| **Johto region map second file** | `src/data/region_map/region_map_sections_johto.json` is found by Plan 15a's loader glob (its trap 2 asks whether the game reads it). Listed here only so a future reader knows it was noticed rather than missed. |

### Section 6: Things deliberately not on this list

Recorded because "why doesn't PokeMap do X" deserves an answer better than silence:

- **Automatic connection repair.** PokeMap reports connection conflicts, and Plan 14C warns about one-way connections, but neither fixes them. Connection geometry encodes design intent, and a tool that silently "corrects" it would be making map-design decisions.
- **Automatic `layout_version` assignment.** The subject repo already has `tools/donors/classify_layout_versions.py`, which does this with domain knowledge PokeMap does not have. PokeMap's job is to refuse and point at that tool, not to duplicate it.
- **Editing `include/fieldmap.h`.** Invariant **I8**. The constant-swapping workaround is the thing this tool exists to eliminate, not to automate.

## Acceptance

- 1a: the symbol index test returns file and line for a label in both families; 1b: the link opens the right file and line, checked live.
- 3d: live acceptance in both families, with one GBA tileset that swaps and one that does not; 3e and 3f follow the selected time in both families.
- 5a: the pin test passes on a scratch copy.
