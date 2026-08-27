# PokeMap Plan 5 — Future Work (Unmapped)

> **This plan contains no tasks and is not executed.** It is a parking lot with enough detail to pick each item up later without re-deriving the research. Everything here was deliberately excluded from Plans 1–4 as YAGNI, not forgotten.
>
> When one of these is wanted, run `superpowers:brainstorming` on it, then `superpowers:writing-plans`. Do not bolt any of them onto an existing plan mid-execution.

**Status:** Backlog. Written 2026-08-26 alongside the design spec.

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

## 2. Prefabs

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
- A time-of-day control in the renderer and a palette-resolution mode threaded through `renderMetatile`.
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
| **Secret base editing** | `enable_event_secret_base=1`. Rare event type; the generic event editor from Plan 2 Task 10 may already cover it — check before planning work. |
| **Weather triggers** | `enable_event_weather_trigger=1`. Same: likely already covered by the generic editor. |
| **Map allow-flags** | `enable_map_allow_flags=1`. Covered by Plan 3 Task 2's header editor. |
| **`tRNS` and non-zero transparent indices** | The PNG reader ignores `tRNS` and treats index 0 as transparent. Verified safe for everything Plan 1 reads (zero violations across 245 tileset sheets, 1,059 icons, 960 overworld sprites). But two battle sprites — `graphics/pokemon/togedemaru/front.png` and `anim_front.png` — use index **15** as transparent and index 0 as opaque. Any feature that widens scope to `graphics/pokemon/*/front.png` must read `tRNS` rather than assuming index 0, or those two render inverted. |
| **Multi-user editing** | Explicitly out of scope. PokeMap is a single-user desktop tool. |
| **ROM building / emulator integration** | Out of scope. PokeMap's answer to "does this look right" is `render`, which is faster than a build and does not need one. |
| **`region_map_sections.json.txt` template editing** | The Inja template drives what keys the build requires. Plan 3 Task 4 *reads* it to derive the contract; editing it is a build-system change and does not belong in a map editor. |
| **Johto region map second file** | `src/data/region_map/region_map_sections_johto.json` is handled by Plan 3 Task 4's globbing. Listed here only so a future reader knows it was noticed rather than missed. |

---

## 6. Things deliberately not on this list

Recorded because "why doesn't PokeMap do X" deserves an answer better than silence:

- **Automatic connection repair.** Plan 1 Task 22 reports conflicts and Plan 3 Task 1 warns about one-way connections, but neither fixes them. Connection geometry encodes design intent, and a tool that silently "corrects" it would be making map-design decisions.
- **Automatic `layout_version` assignment.** The subject repo already has `tools/donors/classify_layout_versions.py`, which does this with domain knowledge PokeMap does not have. PokeMap's job is to refuse and point at that tool, not to duplicate it.
- **Editing `include/fieldmap.h`.** Invariant **I8**. The constant-swapping workaround is the thing this tool exists to eliminate, not to automate.
