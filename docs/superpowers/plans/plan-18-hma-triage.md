# Plan 18: HexManiacAdvance triage (#7)

Rate each HexManiacAdvance (HMA) feature listed in issue #7 and split the keepers into issues. For each feature: fit with PokeMap's decomp-first model (HMA edits ROMs), what that means in both families, cost, and the plan that owns it. No implementation.

## Status

Complete. All 21 features are rated, and the five drafts below are posted as issues: A #50, B #51, C #52, D #53, E #54.

## Depends on

- Nothing. Docs only (D18).
- Risk: low.

## Binding decisions

- D16, D18, D24d, D28, D33 (text in [decisions.md](decisions.md)).

## Traps and pitfalls

1. **The feature list is the body of issue #7:** 21 checklist items in six groups. Read it with `gh issue view 7 --repo itnevres/pokemap`.
2. **HMA edits a compiled ROM; PokeMap edits decomp source.** A feature that exists only because a ROM has fixed addresses (repointing, patches, a goto tool, Thumb code) has no counterpart in source and is rated drop. A feature that edits game data is rated by whether the same data sits in a table PokeMap can splice (GBA C headers and JSON, GBC asm tables).
3. **Every keeper needs a Crystal line,** because the goal is one feature in both families behind the engine adapter. Each row says what the feature means in GBA and GBC.
4. **The result has two homes and neither is a new file.** The table and drafts live in this file; the issues are created by the user's go-ahead.

## Rating

Ratings: **keep** (worth an issue now), **later** (worth an issue, behind named work), **owned** (a plan or decision already covers it), **drop** (does not fit, with the reason). Issue drafts exist for every keep and later row.

## Rating table

| # | HMA feature | Rating | Owner | Reason, and the Crystal line |
|---|---|---|---|---|
| 1 | Edit Pokémon, trainers, moves, items and more | later | trainers: Plan 19 (later phase); the rest: draft D | Trainers: Plan 19 creates them and names editing existing ones as a later phase. Stats, moves and items are plain tables in both source trees (GBA `src/data/*.h`, GBC `data/pokemon/`, `data/moves/`), so one shared table editor serves both. Large, needs a measurement step. |
| 2 | "Goto" tool for uncommon data | drop | none | A goto tool exists because a ROM has no names. Source has names, and a text search or the editor's own search finds them. PokeMap's `where` and `query` commands already answer the map-shaped cases. |
| 3 | Edit game constants (shiny odds, badge boosts) | drop | none | These values sit inside C and asm code, not in a data table. A constants editor is a source editor with no map link, and there is no catalogue of them to drive a form. Edit in the user's editor. |
| 4 | Edit maps, events, connections and warps | owned | built; connections Plan 14C; map header Plan 3 | Painting and event move, add and delete are in `core/src/edit/paint.ts` and `core/src/edit/events.ts`; warp editing is `ui/src/shared/WarpPopup.tsx`. Both families. |
| 5 | Show simple event scripts as controls in the map editor | keep | draft A | Only an event's position, graphics and creation exist; no other field of an existing event can be changed (`core/src/edit/events.ts`). The keeper is editing an existing event's fields (script label, flag, trainer, movement) in the inspector, reusing the Add Event field model in both families. Editing script bodies is closed (D28); reading them is the link-out below. |
| 6 | Jump between related maps, scripts and tables | owned | built for maps; scripts: Plan 5 section 1 | Warp destination jumps and the world-view jump exist. A script label gets a file-and-line link in both families through Plan 5 section 1. Jumping to tables has no owner and no demand yet. |
| 7 | Find and edit almost any text | later | draft C | Dialogue lives in script files (GBA `.inc` and `.pory` strings, GBC `text/*.asm`), so it is a splice in a shared file with the game's charmap and box-width rules. Valuable, and a different tool from the script editor D28 closed. Needs its own spec after a measurement step. |
| 8 | Automatically repoint text that no longer fits | drop | none | A ROM concept. In source the linker places every string, so text can grow with no address to move. |
| 9 | Edit images and tilemaps, PNG import and export | owned | Plan 3 rows 6a, 7a and 7b; Plan 15b for town map tilemaps | Decomp art is already PNG, so there is nothing to export; the work is the indexed PNG writer and pixel editor Plan 3 builds, shared by both families. |
| 10 | Treat tilemaps like any other sprite | drop | none | A ROM concept: HMA decompresses a tilemap and shows it as a sprite. Source keeps a tilemap as a `.bin` beside its PNG, and Plan 15b edits the town map's. |
| 11 | Edit title screen, menus, town map, icons, sprites | later | town map: Plans 15a and 15b; the rest: draft E | The town map is planned. The rest are PNG files (GBA `graphics/`, GBC `gfx/`, 2bpp) a user can already open in any image editor; the gain is opening them in Plan 3's pixel editor with palette awareness, once it exists. |
| 12 | Shared palettes by hand or automatic | owned | Plan 3 row 7b | The palette editor with 5-bit quantising covers it in both families. |
| 13 | View and edit event scripts | owned | Plan 5 section 1 | Ruled in D28: scripts are linked out to the user's editor, not edited in PokeMap. Poryscript support is closed until a project uses it. |
| 14 | Move effect, move animation and trainer AI scripts | drop | none | Battle scripts are asm macro files with no map link and no form to put on them. D28's reasoning applies: link out, do not edit. Crystal has the same files. |
| 15 | View and edit Thumb code | drop | none | A ROM concept. The source is C, built by the toolchain; Crystal is Z80 asm and has no Thumb. |
| 16 | Safely add the Fairy type | drop | none | A code and type-chart change, not a map or data-table edit, and Crystal has no Fairy type. Not one feature in both families. |
| 17 | Add any number of extra moves or tutors | drop | none | Adding a move is source code plus a table row; the table editor in row 1 can add rows later. Tutors are script code. Not a separate feature. |
| 18 | Add abilities similar to Pixilate | drop | none | A battle-code change; Crystal has no abilities. |
| 19 | Create and apply patches (.ips, .ups) | drop | none | Patches describe ROM byte changes. A decomp project builds from source and shares by source; PokeMap does not rely on git (D33) and does not build ROMs. |
| 20 | Reorder the Pokédex | later | draft D | An order table in both trees (the files are found by the measurement step, not assumed here). Part of the table editors in row 1, one small first step. |
| 21 | Export backups while working | keep | draft B | PokeMap's safety is the save preview and the fingerprinted all-or-nothing write (D33). A copy of every file a save is about to change, kept outside the project, adds an undo for a save that was wrong. One writer for both families: the save funnel. |

Counts: keep 2 (5, 21), later 4 (1, 7, 11, 20), owned 5 (4, 6, 9, 12, 13), drop 10 (2, 3, 8, 10, 14, 15, 16, 17, 18, 19).

## Issue drafts

Posted as issues #50-#54 (18-3). Rows 1 and 20 share draft D; trainers in row 1 stay in Plan 19.

**A. Edit an existing event's fields in the inspector** (keep; new plan)
Today the inspector can move, delete and change the graphics of an existing event but not its other fields. Let the inspector edit an existing event's script, flag, trainer and movement using the same field model and dropdowns as Add Event, staged through the same save preview. Both families, through the adapter. Script bodies stay in the user's editor (D28).

**B. Back up the files a save changes** (keep; new plan)
Before a save writes, copy each file it will change into a backup folder outside the project (the hub's home folder, not the repo), grouped by save, and show the folder in the save result. This gives an undo that needs no git (D33) and comes from the one save funnel, so GBA and GBC both get it. Decide how many saves to keep and a restore command.

**C. Find and edit dialogue text** (later; new plan, after Plan 14A)
Search every in-game string in the project and edit it from a list or from the event inspector, with the game's charmap, line width and box-size limits shown. GBA strings live in script files, GBC strings in `text/*.asm`; both are shared files, so the one-owner rule applies. Start with a measurement of both formats.

**D. Edit Pokémon, move and item tables, and the Pokédex order** (later; new plan, after Plan 3)
One shared table editor over the decomp's data tables: Pokémon base stats and learnsets, moves, items, and the Pokédex order, with the engine adapter supplying each family's files and fields. Start with Pokédex order as the smallest table and prove the splice writer on it. Editing existing trainers stays in Plan 19's later phase.

**E. Open any sprite, icon or title screen in the pixel editor** (later; follows Plan 3 rows 7a and 7b)
Let the pixel editor open the project's other indexed PNGs (GBA `graphics/`, GBC `gfx/`) with their palettes, not only tileset sheets. One editor, both families, GBC at 2bpp. Needs a file picker that knows which PNGs the game builds.

## Subtasks

- 18-1: read the issue, rate each item, write the table and drafts into this file. Done.
- 18-2: the user reviews the table. Done.
- 18-3: create one issue per draft and add a pointer in the owning plan. Done (issues #50-#54; Plan 3 points to #54).

## Acceptance

- All 21 items have a row (met: see Rating table).
- Every keep and later row has a draft (met).
