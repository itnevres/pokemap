# Plan 15b: Town map editor tools (#9)

Edit the in-game region map in both families: map-section boundaries and names, fly points, and tile graphics, with one lossless writer per file kind (D14). The goal is full customisation (D26): the user can turn, for example, the Kanto town map into the map of a new region, with tile arrangement where the format allows it and pixel editing where it does not. Three tools in the view Plan 15a builds: section paint, fly-point placement, tilemap paint with PNG round trip.

## Status

Open. Not started; needs a spec first.

## Depends on

- Plan 15a (loaders and view), then Plan 16, in the execution order.
- Plan 3 rows 6a, 7a and 7b (indexed PNG and `.pal` writers, pixel editor), built once by whichever of Plan 3 and this plan starts first (D26, D27).
- Risk: high. Graphics writes and C-array writers.

## Binding decisions

- D14, D22, D23, D26, D27, D29 (text in [decisions.md](decisions.md)).

## Requirements

**Round trip:** loading and re-saving every region map file in every reference engine changes zero bytes, and every save goes through this preserving writer. A regression test named "cannot reproduce the 2026-08-18 porymap 6 failure" loads and saves the subject's file and asserts the output equals the source, contains `"map_section":` and no `"id":`.

**Editor** (new `core/src/edit/regionMap.ts` and a shared UI view): drag entries on the grid; edit `name`, `x`, `y`, `width`, `height`. The real region map tilemap (`region_map_layout*.h`) renders beneath the entries. Each region map in the project is selectable (the subject has four layout headers and two section files; question 1). A new `MAPSEC` also needs its constant in `include/constants/region_map_sections.h` (question 4).

## Traps and pitfalls

1. **PokeMap already reads a build output here.** `core/src/signs/linked.ts:33` takes section names from `region_map_entries.h`, which the subject ignores (`src/data/.gitignore:2`) and the build generates. After a name edit in the JSON, linked signs read the old name until a build. This plan moves that reader to the JSON or records why not.
2. **No indexed PNG writer exists.** Core has a 2-bit grey writer for GBC sheets (`core/src/blockEdit/gbcSheet.ts:23`) and the CLI an RGBA one (`cli/src/png.ts:53`). The GBA art is built to 8bpp. Tile arrangement needs the `.bin` writers; pixel editing (D26) needs the indexed PNG and `.pal` writers and the pixel editor, Plan 3 rows 6a, 7a and 7b, built once by whichever of the two plans starts first.
3. **Edits here belong to no map session.** The save-or-discard prompt (D1) is wired to the selected map's session (`FamilyApp.tsx:79-93`). Region-map edits need their own staged state, plan, fingerprinted commit and leave prompt, the same shape as map creation in Plan 14C.
4. **A name change reaches the signs.** Linked signs take their text from these names and a sign that cannot refresh blocks every save of its map (ruling S10a, `specs/2026-10-16-pokemap-plan-10a-switch-and-signs-design.md`). Names are limited by the game's charmap and a length the measurement step records for each engine.
5. **The acceptance "a successful `make`" runs in WSL** (D29). On the GBA subject the build is `make modern`; plain `make` fails on the game's own code (RESUME, Environments).

## Questions

**Rulings.** "Tile graphics" (D14) means full customisation, pixel editing included (D26; trap 2). The build check runs here (D29).

**Open, for the spec interview:**

1. Fly points: move and reassign existing ones only, or add new ones (new constants and engine tables). Recommendation: existing only.
2. Whether a section or landmark can be created and removed. Recommendation: yes; a new region usually has a different set of towns.

## Subtasks

Provisional phases:

- 15-5 one lossless writer per file kind per family, each with its corpus-gate case (High, subject writes).
- 15-6 staged edits, plan, commit and leave prompt (High, save ownership).
- 15-7 the tools.
- 15-8 live acceptance.
- 15-9 final review.

A conductor hands off after 15-6.

## Acceptance

- **Acceptance:** edit an entry, build on a scratch copy (trap 5), and the build succeeds; `git diff` on that copy shows one changed value and no renamed key.
- The round trip and the regression test under Requirements pass.
- Live acceptance (15-8).
