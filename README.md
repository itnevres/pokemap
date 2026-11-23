# PokeMap

PokeMap is a map editor for Pokémon decomp projects. It opens pokeemerald-family GBA projects and pokecrystal-family GBC projects in one UI. The engine family is detected from the project folder.

It also stitches the maps into one pannable world view, shows wild encounters on the map, and has a command line and an MCP server so AI agents can render and check maps without an emulator.

## Why it exists

PokeMap exists to prevent two failures that Porymap caused in a real pokeemerald-based project. The design spec (`docs/superpowers/specs/2026-08-26-pokemap-design.md`, section 2) records both. The primary records are `docs/resolved.md` and `docs/human-porymap.md` in that game project's repo, not in this repo. TODO: evidence not found in this repo beyond the design spec's account.

**1. Porymap 6 rewrote schema files and broke the build (2026-08-18).**
- It rewrote `src/data/region_map/region_map_sections.json` and renamed `map_section` to `id` on all 115 entries.
- It added `border_width` and `border_height` to the 726 layouts in `data/layouts/layouts.json` that lacked them (1,452 lines).
- The build tool `jsonproc` reads `map_section.map_section`, so the build failed. The make rule deletes its own output on failure, so every later build failed the same way and named a file nobody had touched. It was first misdiagnosed as a `-j16` parallel-make race.
- Cause: the tool reserialized whole files in its own schema instead of editing the project's file.

**2. Porymap 5 rendered and corrupted 389 layouts (documented 2026-08-26).**
- That project has more than one metatile boundary, set per layout by `layout_version` (`emerald`, `frlg`, `hns`). Porymap reads one `NUM_METATILES_IN_PRIMARY` from `include/fieldmap.h`.
- Every `emerald` layout (389 of them) therefore opened rendering wrong, and saving one rewrote its `map.bin` against the wrong boundary.
- The human workaround was to hand-swap six `#define`s in `include/fieldmap.h`, restart Porymap, edit, and swap them back before building. Forgetting the swap back made every FRLG and Johto map render as garbage.

The spec records a third, quieter failure: Porymap's `use_custom_border_size` setting lives in a gitignored file, and at `0` a save rewrote a 3x2 border down to 2x2.

What PokeMap does about it:
- It resolves the metatile boundary per layout, never from one global (invariant I1).
- It never reserializes a JSON file. Writes are surgical edits to the original text (I2).
- It never saves on its own. Opening a map never writes, and every write is previewed first (I6).
- It refuses rather than guesses, and a refusal names the file and the fix (I7).
- It writes only decomp data files and its own `.pokemap/` folder, and it never edits `include/fieldmap.h` (I8).
- It does not use or require git (decision D33).

The invariants are in `docs/superpowers/plans/archive/plan-00-gba-roadmap.md`, section 3.

## Start it

Double-click `PokeMap.cmd` at the repo root. It installs what it needs on the first run, builds the app page when needed, starts PokeMap and opens your browser. Keep its window open while you work; closing it stops PokeMap. See [LAUNCH.md](LAUNCH.md) for the details and the manual launch. You need Node.js 20.19+ (or 22.12+) first.

## What is in the repo

| Package | What it is |
|---|---|
| `packages/core` | Loads, renders and writes decomp projects, for both families. Runs on Node. |
| `packages/server` | The local hub: HTTP API, project picker, edit sessions, save. |
| `packages/ui` | The browser UI (React, Vite). |
| `packages/cli` | The `pokemap` command line. |
| `packages/mcp` | The MCP server that wraps the CLI for AI agents. |

## Guides

- [User guide](docs/user-guide.md): install, open a project, paint, events, the Pokémon Indicator, the world view, saving.
- [Agent guide](docs/agent-guide.md): the CLI, the MCP server, and the render-and-look workflow.
- [LAUNCH.md](LAUNCH.md): launch steps.
