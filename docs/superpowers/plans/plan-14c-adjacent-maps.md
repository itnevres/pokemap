# Plan 14C: Create and connect adjacent maps

Select an existing map edge, choose dimensions/tileset and a blank fill or compatible template, slide a ghost preview to set offset, then create the map and validated reciprocal game connections. Editor-only world placement is distinct from game connectivity. The destination-map creation machinery is built here so Plan 17 can reuse it; there is no dependency on town-map editing or the minimap. Phase two: a new map created as a warp destination (a door to a new interior), with its return warp (trap 8).

## Status

Open. Not started; needs a spec first.

## Depends on

- Plans 10, 12 and 14B (D17); Plan H Tasks F and G (rows 14C-1, 14C-2).
- Risk: high (multi-file subject-source writes and save ownership). Verify writes on scratch projects.

## Binding decisions

- D17, D22, D23, D24c, D29 (text in [decisions.md](decisions.md)).

## Requirements

GBA:

- **Connections** (new `core/src/edit/connections.ts`): `offsetFromPlacement(proj, from, to, dir, toX, toY)` is the exact inverse of the world placement maths (`core/src/world/connections.ts` `buildWorld`). Test it as a round trip over every real connection in the subject: place, re-derive, and get the original offset back for all 374 planar connections. `dive` and `emerge` are a distinct kind and never get a planar offset. A one-way connection gets a warning, not a fix: the decomp has legitimate one-way cases.
- **Editing an existing connection** uses the same machinery; whether it is in this plan is question 1. If it is: dragging a map in the world view updates the offset live and shows it as a number, and the save changes the connection `offset` in `map.json` and nothing else. Removing a connection warns when it would leave a map with no connection, reusing the component analysis (`core/src/world/connections.ts` `layOutComponents`).
- **New map** (new `core/src/edit/newMap.ts`; file set in trap 1): the generated `map.json` carries exactly the key set of a sibling map in the same group, read from that sibling, never from a bundled template (all 1,207 subject maps share one 14-key top-level schema). The new `scripts.inc` has the form of the project's existing ones, checked by a golden test against an existing map's file. The map is registered in `map_groups.json`. A name that collides, or that is not a valid C identifier, is refused.
- **New layout:** the `layouts.json` entry is added with `insertArrayElement`, matching the file's indentation, and carries **only** the keys its siblings carry (a pokeemerald project's new layout does not sprout `border_width`). `map.bin` and `border.bin` are created at the chosen size. On engines that have `layout_version`, the user chooses it explicitly; it is never defaulted, because a wrong choice produces `open-bugs.md` #41. A new layout with no `layout_version` is refused, by name, with the fix.

## Traps and pitfalls

1. **Most GBA `.inc` files are build output.** `header.inc`, `events.inc` and `connections.inc` are ignored by `data/maps/.gitignore:5-7`; only `map.json` and `scripts.inc` are tracked. Writing the others breaks invariant I3. The GBA create set is `data/maps/<Name>/map.json` and `scripts.inc`, the `map_groups.json` and `layouts.json` entries, the layout's `map.bin` and `border.bin`, and the `.include "data/maps/<Name>/scripts.inc"` in `data/event_scripts.s` (PetalburgCity's is line 107).
2. **Generated headers are tracked in the subject.** `include/constants/map_groups.h` and `layouts.h` are made by the build (`map_data_rules.mk:33,38`) and are in git. PokeMap does not write them, so a new `MAP_*` name is absent from them until a build; name-collision checks read `map_groups.json`, not the headers.
3. **The atomic writer cannot make a folder.** `writeFilesAtomically` creates a file when `before` is null (`core/src/write/atomic.ts:56`) but has no `mkdir`, and its rollback removes files only. A new map folder needs directory creation with rollback, built and tested before any planner.
4. **GBC needs seven files and two of them are positional.** NewBarkTown appears in `maps/NewBarkTown.asm`, its `.blk`, `constants/map_constants.asm`, `data/maps/maps.asm`, `attributes.asm`, `blocks.asm` and `scripts.asm`. The order inside a group in `map_constants.asm` and `maps.asm` must match. No writer exists for any of the five shared files: a GBC save writes the `.blk`, the map's `.asm` and text replacements in constants files (`core/src/gbc/write/save.ts:206-218`).
5. **A GBC connection is two edits per map.** `map_attributes NewBarkTown, NEW_BARK_TOWN, $05, WEST | EAST` carries the direction set, and each direction has a `connection west, Route29, ROUTE_29, 0` line (`data/maps/attributes.asm:100-102`). A reciprocal connection edits the neighbour's set and adds its line.
6. **Both projects read the map list once.** GBA parses groups and layouts at open (`core/src/project.ts:115,122`); GBC reads four files at open (`core/src/gbc/load/map.ts:254-257`); neither has an invalidation call. After a create, the hub rebuilds the handler, which closes every session (`server/src/hub.ts:259-271`), so creation refuses while any map is dirty. This builds on Plan H Task G.
7. **There is no session to stage into.** Sessions are keyed by a map that exists (`server/src/editSessions.ts:39`). Creation is a project-level plan and commit with its own fingerprint, like the map save (`GET plan` returns `fingerprint`, `POST commit` takes it), and it edits the neighbour's `map.json`, which an open session of that map may own.
8. **The two-map return warp is built here** (`specs/2026-11-02-pokemap-plan-14-1-add-event-design.md`, ruling A7). The Add Event dialog only warns today (`ui/src/shared/AddEventDialog.tsx:15-52`). It is phase two, with a new map as a warp destination (below).
9. **Existing conflicts are real data.** The GBA subject has 19 connection conflicts and Crystal has 2 (RESUME). "Validated reciprocal connections" validates the new pair; it does not refuse a project that already has conflicts.
10. **Porymap strips `layout_version` on save** (LESSONS, Editing Sessions). The new-layout requirement above is why it is chosen, never defaulted.
11. **The build check runs in WSL** (D29; RESUME, Environments). "The game still builds" is an acceptance check this plan runs itself, on a scratch copy: `make` for GBC, `make modern` for the GBA subject.
12. **Byte-exact fixtures need `-text`** in `.gitattributes` (LESSONS, Delegation: "Golden fixtures need `-text`"), and every write test runs on a scratch copy (LESSONS, Testing: "Test roots are scratch copies").
13. **The `WorldSurface.tsx` hook extraction (row 14C-0) is a canvas-core change.** The warp fetch is `canvas/WorldSurface.tsx:484-608`, the encounter fetch `:313-353`, the lens overlays `:355-367` and `:805-863`. It is High tier, moves no behaviour, and its oracle is the existing `packages/ui/test/canvas/` tests with none edited.

## Questions

**Rulings.** The first UI task is the `WorldSurface.tsx` hook extraction, row 14C-0 (D24c). A new map as a warp destination is phase two.

**Open, for the spec interview:**

1. Whether moving or removing an existing connection is in this plan. Recommendation: creating and connecting first; dragging an existing connection's offset as a second phase; removal later.
2. GBA: the map group of the new map, and whether it always gets a new layout. Recommendation: the neighbour's group; always a new layout.
3. GBC: where the header fields come from (tileset, environment, landmark, music, palette, fishing group). Recommendation: copied from the neighbour, editable in the dialog.
4. The starting contents: one fill block, or a copy of an existing map of this project. Recommendation: both, with the copy built so Plan 17 can reuse it (one planner, two sources: Plan 17 copies from another project and adds no second way to register a map).
5. A neighbour with unsaved changes: refuse, or save together. Recommendation: refuse, naming the map.
6. Whether a created map can be removed by the app. Recommendation: no; the preview lists every file before the write.

## Subtasks

Provisional (the spec may move them). Verify lines run from the repo root after `npm run typecheck`.

| Id | What | Files | Tier | Verify | After |
|---|---|---|---|---|---|
| 14C-0 | Warp fetch, encounter fetch and lens overlays from `WorldSurface.tsx` as hooks (first UI task, D24c) | new `packages/ui/src/canvas/{useWorldWarps,useWorldEncounters,useLensOverlays}.ts`; `canvas/WorldSurface.tsx` | High (canvas core) | `npx vitest run --no-file-parallelism packages/ui/test/canvas` | nothing else holding `WorldSurface.tsx` |
| 14C-1 | Folder creation with rollback in the atomic writer | `packages/core/src/write/atomic.ts`, `packages/core/test/write/atomic.test.ts` | High (subject writes) | `npx vitest run --no-file-parallelism packages/core/test/write` | Plan H Task F |
| 14C-2 | Handler rebuild after a structural write, refused while any map is dirty | `packages/server/src/hub.ts`, `packages/server/test/hub.test.ts` | High (session ownership) | `npx vitest run --no-file-parallelism packages/server/test/hub.test.ts` | Plan H Task G |
| 14C-3 | GBA connection offset from placement and its inverse, round trip over the subject's planar connections | new `packages/core/src/edit/connections.ts` and test | High (numeric oracle) | `npx vitest run --no-file-parallelism packages/core/test/edit` | - |
| 14C-4 | GBC connection maths and a lossless `attributes.asm` patcher | new `packages/core/src/gbc/edit/connections.ts`, `packages/core/src/gbc/write/attributesPatch.ts` and tests | High (parsing, subject writes) | `npx vitest run --no-file-parallelism packages/core/test/gbc` | - |
| 14C-5 | GBA new-map planner (trap 1's file set, sibling key set, name refusals) | new `packages/core/src/edit/newMap.ts` and test | High (subject writes) | `npx vitest run --no-file-parallelism packages/core/test/edit` | 14C-1, 14C-3 |
| 14C-6 | GBC new-map planner (trap 4's file set) | new `packages/core/src/gbc/edit/newMap.ts` and test | High (subject writes) | `npx vitest run --no-file-parallelism packages/core/test/gbc` | 14C-1, 14C-4 |
| 14C-7 | Create routes: plan and commit with a fingerprint, one module for both families | new `packages/server/src/mapCreateRoutes.ts` and test; `packages/server/src/{index,gbcRoutes}.ts` | High (hub I/O, save ownership) | `npx vitest run --no-file-parallelism packages/server` | 14C-2, 14C-5, 14C-6 |
| 14C-8 | Edge pick and ghost preview on the world surface | `packages/ui/src/canvas/{WorldSurface.tsx,worldSurfaceAdapter.ts}`, `gba/worldSurface.tsx`, `gbc/worldSurface.tsx`, `packages/ui/test/canvas/` | High (canvas core) | `npx vitest run --no-file-parallelism packages/ui/test/canvas` | 14C-0 |
| 14C-9 | Create dialog, shared, with family field specs | new `packages/ui/src/shared/CreateMapDialog.tsx`, `gba/createMapFields.ts`, `gbc/createMapFields.ts`, `shell/adapter.ts` | Medium | `npx vitest run --no-file-parallelism packages/ui/test/shared` | 14C-7 |
| 14C-10 | Live acceptance on scratch clones, both families | report | - | live report | all |
| 14C-11 | Final review | - | - | reviewer per the `delegate` skill | 14C-10 |

A conductor hands off after 14C-6 and after 14C-9.

## Acceptance

- Save and reload preserve the new map and its connections in both families.
- A failure leaves no partially created map and no one-sided connection.
- The round trip over every real planar connection in the GBA subject (374) returns the original offsets (requirement Connections).
- The game still builds on a scratch copy (trap 11; D29).
- Live acceptance on scratch clones in both families (row 14C-10).
