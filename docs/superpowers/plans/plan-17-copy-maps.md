# Plan 17: Copy maps between games (#10)

Copy a map from one loaded game to another of the same family (D15). Everything travels: layout, blocks, border, events, warps, scripts, encounters; a tileset missing in the destination is copied too. Warps whose targets do not exist in the destination are flagged. Multi-map copy (a whole dungeon) is a spec question, not assumed. The copy fills a map created by Plan 14C's planner.

## Status

Open. Not started; needs a spec first.

## Depends on

- Plan 16 in the execution order; Plan 14C's reusable destination-map creation machinery (D17). The full D15 copy scope is kept.
- Risk: high. Writes many files into a second project (GBA: map/layout JSON, `scripts.inc`, encounters JSON, tileset directories and their C headers; GBC: `.blk`, `.asm`, constants, attributes, tilesets). Name and constant collisions, save safety across two corpora; never test against the real subject without a scratch copy.

## Binding decisions

- D15, D17, D23, D29, D31 (text in [decisions.md](decisions.md)).

## Requirements

**GBA tileset copy (D31).** PokeMap writes the copy (trap 2), refusing two cases with their reasons: a tileset whose header has an animation callback (that is engine code, not data), and a secondary tileset whose paired primary is neither in the destination nor copied with it (its metatiles index the primary's tiles and palettes). The build check (D29) is its acceptance. Phase 17-5 is in scope for both families.

## Traps and pitfalls

1. **The hub holds one project.** `server/src/hub.ts:181` is a single `current` handler; `POST /api/hub/open` replaces it and refuses while maps are dirty (`:252-271`). "One loaded game to another" needs a second, read-only project opened beside it. Make the open project the destination, so every write stays under the root that Plan H Task F checks.
2. **A GBA tileset is defined in C.** Copying a missing one means adding entries to `src/data/tilesets/headers.h` and the graphics and metatile tables beside it, and PokeMap can only splice `#define` lines (`core/src/addEvent/gbaBuild.ts:38,112-129`). D15 says the tileset is copied; this is the largest unknown in the plan and the interview takes it first.
3. **Scripts name things the destination may lack.** Flags, vars, trainers, items, species, texts, movement labels and other maps. The symbol index (`server/src/projectSymbols.ts`, which serves the defect checks C7-C9) can list what is undefined in the destination; the spec decides what is flagged and what is created (Add Event has free-slot rules for flags and vars only, `specs/2026-11-02-pokemap-plan-14-1-add-event-design.md`).
4. **"Same family" is not "same engine".** The reference GBA engines differ in attribute width and fields, and split detection has an open gap on `pokeemerald-expansion` (RESUME, open items). The subject is a three-region project with per-layout `layout_version`, so a copied GBA map needs a version chosen and its metatile ids read under the destination's split (invariant I1).
5. **Encounters live in shared files.** GBA: one entry in `wild_encounters.json`, a build input with a template (`json_data_rules.mk:4-5`). GBC: blocks in `data/wild/*.asm` plus a fishing group shared with other maps. Each needs a writer, built by this plan or Plan 3 Task 3, whichever comes first.
6. **GBC map tables are positional,** as in Plan 14C trap 4; this plan fills a map created by Plan 14C's planner and adds no second way to register one.
7. **Two corpora, two scratch copies.** Every test and the live check run on scratch copies of both projects (LESSONS, Testing: "Test roots are scratch copies"); a GBC warp's `destWarp` is a 1-based position (RESUME, GBC facts), so warps into maps that were not copied are flagged, never renumbered.

## Questions

**Rulings.** GBA tilesets are copied, with the two refusals above (D31). The build check (D29) is the acceptance test.

**Open, for the spec interview:**

1. Which side is open: copy into the open project from a second one picked in the dialog (recommended), or out of it.
2. Missing symbols: flag only, or create flags and vars through Add Event's free-slot rules. Recommendation: flag only.
3. Whether a copy between two different GBA engines is allowed. Recommendation: same engine profile only.
4. Several maps at once (a dungeon). Recommendation: one map first; several as a later phase.
5. Encounters whose species the destination lacks: dropped with a notice, or the copy refused.

## Subtasks

Provisional phases:

- 17-1 second read-only project in the hub (High, hub I/O).
- 17-2 what a map depends on, per family (High, parsing).
- 17-3 the missing-and-colliding report against the destination (High, oracle).
- 17-4 fill a Plan 14C created map with copied content, per family (High, subject writes).
- 17-5 tileset copy per family, per the ruling (High).
- 17-6 the copy dialog, shared (Medium).
- 17-7 live acceptance on two scratch corpora per family.
- 17-8 final review.

## Acceptance

- A copied map, with its tileset where one is missing, builds in the destination on a scratch copy (D29, D31).
- Warps into maps that were not copied are flagged, never renumbered (trap 7).
- Live acceptance on two scratch corpora per family (17-7).
