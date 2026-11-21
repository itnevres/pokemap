# PokeMap Plan 5 — Future Work (Unmapped)

> **This plan contains no tasks and is not executed.** It is a parking lot with enough detail to pick each item up later without re-deriving the research. Everything here was deliberately excluded from Plans 1–4 as YAGNI, not forgotten.
>
> When one of these is wanted, run `superpowers:brainstorming` on it, then `superpowers:writing-plans`. Do not bolt any of them onto an existing plan mid-execution.

**Status:** Backlog. Written 2026-08-26 alongside the design spec.

---

## Traps and pitfalls (2026-11-15)

From the plan review of 2026-11-15, checked against `plan-14-2-block-editor` at `21bf0b9` and the GBA subject at `97ac21d4b`. This file predates the GBC family; every item below that becomes a feature has to say what it means for Crystal, or carry a capability flag. Section 2 moved to roadmap Plan 14A and has its traps there.

**Section 1, Poryscript**
1. **The "link out" option is mostly built.** The project symbol index maps a script label to its file (Plan 10b Task 5, `d8ac3d0`; `packages/server/src/projectSymbols.ts`), and Add Event already creates and copies scripts (Plan 14.1, `3f4a762`; `packages/core/src/addEvent/gbaBuild.ts`, `gbcBuild.ts`). The section's "exactly one script template" and "symbol indexing across all `scripts.inc`" lines are out of date. What is missing is the line number and the link.
2. **The hub must not start an editor from a request.** Opening a file from an HTTP route is running a program on the user's machine with a path from the network. A `vscode://file/<path>:<line>` link rendered by the UI needs no hub code; use that, or rule the hub route as High tier with a fixed command and a path taken from the index only.
3. **Poryscript itself is GBA only and unused here.** The subject has `use_poryscript=0` (`porymap.project.cfg:39`) and Crystal has no such language. Full support would be a one-family feature behind a capability flag.

**Section 3, day/night**
4. **The control and the GBC half exist.** Morn/Day/Nite sits in the header behind `capabilities.timeOfDay` (`packages/ui/src/shell/adapter.ts:20`, GBC true and GBA false; `gbc/adapter.tsx:152-160`), and `time` runs through the GBC renderer and its cache (`packages/core/src/gbc/render/map.ts:310`; `packages/server/src/gbcRoutes.ts:473`). "A time-of-day control in the renderer" is GBA work only: the selected time is state inside the GBC adapter (`gbc/adapter.tsx:24`) and must move to the shell or be mirrored.
5. **Every GBA cache key lacks the mode.** `pngCache` is keyed `name:border` (`packages/server/src/index.ts:137`), the pre-warm tests `name:0` (`index.ts:1466`), and the metatile and world-tile URLs carry no time; Plan 14.2 adds a tileset version to those URLs. A mode added to the renderer and not to each of these shows the wrong palette from cache, and unit tests with a mocked image will not see it (LESSONS, Server / Routes: "The server's `pngCache` was never invalidated on commit").
6. **The section's "current state" is stale.** Four tilesets in the subject now have `.swapPalettes` active and seven have it commented out (`src/data/tilesets/headers.h:55,123,176,182`). The type `"morn" | "day" | "nite"` is Crystal's; how many periods the subject's GBA engine has is unmeasured.

**Section 4, `.pla` lights**
7. **The files exist to be measured.** The subject holds 136 `.pla` files, per tileset palette (`data/tilesets/primary/general/palettes/04.pla`) and per species (`graphics/pokemon/charizard/normal.pla`). The format work starts from them and from the tool in the subject that writes them, not from guesses.

**Section 5, smaller items**
8. **Secret bases are covered for creation; weather triggers are not covered at all.** Add Event offers `secret_base` as a bg type (`packages/core/src/addEvent/gbaOptions.ts:131`; Plan 14.1). Weather triggers are not an event kind anywhere in PokeMap, and the subject uses them (`data/maps/Route119/map.json` has 21, `Route113` 19). They survive a save because edits are spliced into the original text, but the table's "likely already covered" is wrong for them. Editing any existing event's fields beyond its position was out of scope in Plan 14.1.
9. **`heal_locations.json` has no build rule in the subject;** `src/data/heal_locations.h` is tracked and no makefile names the JSON. Measure which one the game reads before any editor is planned. It belongs with the fly points of roadmap Plan 15.
10. **The `tRNS` note still stands.** GBA reads species icons, not front sprites, so the two index-15 sprites are not read today.

## Breakdown (2026-11-15)

Sections 1, 3 and 4 need an interview before they can be planned; section 5 needs two small checks. Nothing here is scheduled (roadmap, "Order and overlap review").

**Answered by the user 2026-11-16 (roadmap D28).** Section 1: link out; subtasks 1a and 1b below are the whole of it and Poryscript support is closed until a project uses it. Section 3: a palette swap is enough, and the time-of-day control must also show what else changes with the time: "day/night event triggers/wild pokemon change". Claude's reading, to confirm in the interview: with a time selected, the map shows only the events active at that time, and the encounter panel shows that time's table. Crystal has both in its data already (object events carry a time-of-day field; grass tables are per morn, day and nite, `packages/core/src/gbc/model/types.ts:284-285`); on GBA the subject keeps several encounter tables per map told apart by `base_label` (Plan 3 Task 3), and how its events depend on the time is unmeasured. This adds two subtasks after 3c: (3e) the encounter panel follows the selected time in both families; (3f) events filtered or dimmed by the selected time in both families. Both wait on step 0's measurement.

- **Section 1.** Question: edit scripts in PokeMap, or link out. Recommendation: link out, in both families, and close the Poryscript question until a project uses it. If so, two subtasks: (1a) the symbol index returns file and line for a label, both families: `packages/server/src/projectSymbols.ts` and its test, Medium, `npx vitest run --no-file-parallelism packages/server/test/projectSymbols.test.ts`; (1b) a link beside each script label in the event inspectors: `packages/ui/src/components/EventInspector.tsx`, `packages/ui/src/gbc/GbcEventInspector.tsx`, Low, `npx vitest run --no-file-parallelism packages/ui`, live check. Full Poryscript support stays a plan of its own and is not broken down.
- **Sections 3 and 4.** Step 0 is a measurement written into the spec: how the subject's engine applies the swap, whether it blends, how many periods it has, what a `.pla` file holds. Questions: is a plain palette swap, labelled approximate, enough for the first version (recommendation: yes); are lights wanted in the preview (recommendation: after the swap ships). Provisional subtasks after the spec: (3a) palette mode in the GBA tileset load and renderer, resolved per layout split (invariant I1): `packages/core/src/load/tilesetData.ts`, `packages/core/src/render/`, fixtures; High (render core, numeric fixtures). (3b) the mode in every GBA render route, cache key and the pre-warm: `packages/server/src/` read routes; High (hub). (3c) the time control lifted to the shell and the GBA capability turned on: `packages/ui/src/shell/{adapter.ts,FamilyApp.tsx}`, `gba/adapter.tsx`, `gbc/adapter.tsx`; Medium. (3d) live acceptance in both families, with one GBA tileset that swaps and one that does not.
- **Section 5.** (5a) A pin test that a map with weather-trigger coord events and a secret-base bg event saves byte-identically after an unrelated edit, on a scratch copy: `packages/core/test/write/corpus.test.ts` or a sibling; Low. (5b) Fold the heal-locations measurement into roadmap Plan 15's step 15-0. The other rows need no work.

---

## 1. Poryscript

**What it is:** A higher-level scripting language that compiles to the decomp's `.inc` script format, with `if`/`else`, `while`, `switch` and local labels. Porymap supports it via a `use_poryscript` project setting.

**Current state in the subject repo:** `porymap.project.cfg` has `use_poryscript=0`. The tree uses raw `.inc` scripts throughout.

**What Plans 1–4 do instead:** Plan 2 Task 12 generates exactly one script template — the wild sign — as a targeted `.inc` append, verified byte-for-byte against the existing `CeladonCity_EventScript_Poliwrath`. That is templated generation, deliberately not general script editing.

**What real support would need:**
- A Poryscript parser and compiler, or shelling out to the real `poryscript` binary.
- Round-trip fidelity for `.pory` → `.inc`, which is genuinely hard: the compiler is not injective, so PokeMap could not reliably edit a `.inc` that a `.pory` produced.
- A script editor with syntax highlighting, and jump-to-definition from an event to its script.
- Symbol indexing across all 1,209 `scripts.inc` files.

**Open question to settle first:** whether PokeMap should edit scripts at all, or link out to the user's editor with the right file and line. The second is a fraction of the work and might be the better product. The subject repo's own `docs/human-porymap.md` draws a hard line — scripts and JSON are "an agent's job", tiles are the human's — which argues that a script editor inside a *map* tool may be solving the wrong problem.

**Estimated scope:** Large. A plan of its own, at least Plan 1's size.

---

## 2. Prefabs (MOVED to roadmap Plan 14A, D22)

**Moved 2026-11-13.** Roadmap Plan 14A (shared stamps and saved patterns, both families) owns this item. The text below is the input for that plan's spec; the file-format trade-off is its first decision.

**What it is:** Named, reusable multi-block stamps — a house, a tree cluster, a pond — that can be placed as a unit. Porymap stores them in a JSON file named by `prefabs_filepath`.

**Current state in the subject repo:** `prefabs_filepath=` is empty and `prefabs_import_prompted=0`. No prefabs exist.

**What Plans 1–4 do instead:** Plan 2 Task 6 supports rectangular multi-block stamps within a session. They are not named, saved, or shared between maps.

**What real support would need:**
- A prefab file format. Porymap's own is the obvious choice for interoperability, but adopting it means adopting its schema — and this project's entire premise is not letting a tool's schema drive the project's files. A PokeMap-native format under `.pokemap/prefabs.json` avoids that and loses interop. **This trade-off is the first thing to decide.**
- Prefabs are tileset-specific; a prefab built on `gTileset_Petalburg` is meaningless on a Johto map. The picker must filter by the open layout's tilesets, and by its split.
- Collision and elevation should travel with the prefab, not just metatile ids.
- A prefab library panel, and a "create prefab from selection" action.

**Estimated scope:** Medium. Could ride along with a painting-focused plan.

---

## 3. Day/night palette preview

**What it is:** The subject repo blends alternate palettes by time of day. From `src/data/tilesets/headers.h`:

```c
// Whether a palette has a night version, located at ((x + 9) % 16).pal
#define SWAP_PAL(x) ((x) < NUM_PALS_IN_PRIMARY ? 1 << (x) : 1 << ((x) - NUM_PALS_IN_PRIMARY))
```

So palette *n* has a night variant at `((n + 9) % 16).pal`. Note the macro is **already `NUM_PALS_IN_PRIMARY`-aware**, which means a correct implementation must resolve the split per layout exactly as the renderer does — invariant **I1** applies here too. A day/night preview that assumed one global palette boundary would be wrong on 389 layouts in the same way Porymap is.

**Current state:** `.swapPalettes` is commented out on `gTileset_General` in the subject repo, so not every tileset uses it yet.

**What Plans 1–4 do:** Render base palettes only, always.

**What real support would need:**
- A time-of-day control in the renderer and a palette-resolution mode threaded through `renderMetatile`. **(Marked 2026-11-15: the control is SUPERSEDED, it exists in the shared header for GBC since Plans 6b and 9, `packages/ui/src/gbc/adapter.tsx:152-160`; the GBA palette mode is still to do. See trap 4.)**
- Cache keys extended with the palette mode — the existing key is `(layout, primary, secondary, split)` and would need a fifth component.
- Understanding how the engine blends, not just swaps: check `src/palette.c` and whatever the day/night system does at runtime before assuming a straight substitution.
- A visual regression baseline per mode, which doubles the fixture set.

**Estimated scope:** Small-to-medium, and mostly research. The renderer changes are contained; working out the exact blend is the real work.

---

## 4. `.pla` lights

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
- Light rendering composited over the base render, which is a genuinely different rendering path from anything in Plan 1.
- Interaction with day/night (§3) — lights presumably only matter at night, so these two are probably one piece of work rather than two.

**Estimated scope:** Medium. Should be scoped *with* §3, not separately.

---

## 5. Smaller items, recorded so they are not rediscovered

| Item | Note |
|---|---|
| **Heal location editing** | `enable_heal_location_respawn_data=0` in the subject repo, so the simpler schema applies. Small, but touches another JSON file and so needs its own round-trip coverage. |
| **Secret base editing** | `enable_event_secret_base=1`. Rare event type; the generic event editor from Plan 2 Task 10 may already cover it — check before planning work. **Checked 2026-11-15: creating one is covered by Plan 14.1's Add Event (`3f4a762`); editing its fields is not.** |
| **Weather triggers** | `enable_event_weather_trigger=1`. Same: likely already covered by the generic editor. **Checked 2026-11-15: not covered; see trap 8.** |
| **Map allow-flags** | `enable_map_allow_flags=1`. Covered by Plan 3 Task 2's header editor. |
| **`tRNS` and non-zero transparent indices** | The PNG reader ignores `tRNS` and treats index 0 as transparent. Verified safe for everything Plan 1 reads (zero violations across 245 tileset sheets, 1,059 icons, 960 overworld sprites). But two battle sprites — `graphics/pokemon/togedemaru/front.png` and `anim_front.png` — use index **15** as transparent and index 0 as opaque. Any feature that widens scope to `graphics/pokemon/*/front.png` must read `tRNS` rather than assuming index 0, or those two render inverted. |
| **Multi-user editing** | Explicitly out of scope. PokeMap is a single-user desktop tool. |
| **ROM building / emulator integration** | Out of scope. PokeMap's answer to "does this look right" is `render`, which is faster than a build and does not need one. |
| **`region_map_sections.json.txt` template editing** | The Inja template drives what keys the build requires. Plan 3 Task 4 (now roadmap Plan 15) *reads* it to derive the contract; editing it is a build-system change and does not belong in a map editor. |
| **Johto region map second file** | `src/data/region_map/region_map_sections_johto.json` is handled by Plan 3 Task 4's globbing (now roadmap Plan 15). Listed here only so a future reader knows it was noticed rather than missed. |

---

## 6. Things deliberately not on this list

Recorded because "why doesn't PokeMap do X" deserves an answer better than silence:

- **Automatic connection repair.** Plan 1 Task 22 reports conflicts and Plan 3 Task 1 (now roadmap Plan 14C) warns about one-way connections, but neither fixes them. Connection geometry encodes design intent, and a tool that silently "corrects" it would be making map-design decisions.
- **Automatic `layout_version` assignment.** The subject repo already has `tools/donors/classify_layout_versions.py`, which does this with domain knowledge PokeMap does not have. PokeMap's job is to refuse and point at that tool, not to duplicate it.
- **Editing `include/fieldmap.h`.** Invariant **I8**. The constant-swapping workaround is the thing this tool exists to eliminate, not to automate.
