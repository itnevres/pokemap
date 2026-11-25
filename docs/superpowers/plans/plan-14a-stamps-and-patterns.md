# Plan 14A: Shared stamps and saved patterns

Rectangular selection in both families: capture a map area, preview and place exact arrangements, and save named patterns tied to compatible tilesets. Reuse existing stamp painting; keep pattern management small. Stamps place exact arrangements; terrain brushes remain a separate tool (Plan 14B). The plan also gives the map canvas keyboard access, decided in the same interview as the capture gesture.

## Status

Open. Not started; needs a spec first.

## Depends on

- Plans 12 and 14 (merged) and Plan H, every batch (D21, D35).
- Risk: high (shared canvas interactions and edit-session behaviour).

## Binding decisions

- D17, D21, D22, D23, D24a, D35 (text in [decisions.md](decisions.md)).

## Requirements

- **Requirements (D22).** Saved patterns are named, reusable multi-block stamps (a house, a tree cluster, a pond) placed as a unit, with a pattern library panel and a "create pattern from selection" action. Patterns are tileset-specific: the picker filters by the open layout's tilesets and, on GBA, its split (trap 4). On GBA, collision and elevation travel with the pattern, not just metatile ids (trap 1). The subject has no Porymap prefabs (`prefabs_filepath=` empty, `prefabs_import_prompted=0`).
- **First task:** one generic `paintCells`/`floodFill` for both families (`core/src/edit/paint.ts:36-87`, `core/src/gbc/edit/paint.ts:23-72`). It copies only the keys the existing block already has; the GBC file re-exports it, as it already does for `readBlock` and `shiftGrid`.
- **Map-canvas keyboard access (U3; row 14A-4b).** The map editor canvas (`shared/MapCanvasViewport.tsx:29`) has no `tabIndex`, accessible name or key handler. The world canvas has all three (`canvas/WorldSurface.tsx:874-900`). The keyboard model (cell cursor, paint key, pan keys) is decided in one interview with the capture gesture (D24a). Tier High (canvas-core pointer and keyboard behaviour); run `superpowers:brainstorming` first, because it cannot be broken down before that session.
- **Focus restore.** After the map context menu or a dialog closes, focus returns to the map canvas. The canvas cannot take focus today; the keyboard model gives it focus, so the restore is built with it.

## Traps and pitfalls

1. **The two families' stamps are not the same type.** A GBA stamp cell carries `metatileId`, `collision` and `elevation` (`core/src/edit/paint.ts:3-8`); a GBC one carries `metatileId` only (`core/src/gbc/edit/paint.ts:5`), because GBC collision belongs to the block, not the cell. "Collision and elevation travel with the pattern" is a GBA rule; the spec states the GBC rule (ids only) instead of leaving it to a task.
2. **GBC cannot select more than one block.** `gbc/GbcMetatilePalette.tsx:21,86` picks a single cell as a 1x1 stamp; the GBA palette drag-selects a rectangle (`components/MetatilePalette.tsx:145-163`). Core paints a stamp grid in both families already (`paintCells`), so the gap is UI only, and it is in no task text.
3. **The map canvas has no selection concept.** Tools are pencil, rect, bucket, dropper, shift, collision, sign and edit block (`components/Toolbar.tsx:6`), and the dropper picks one cell (`canvas/MapSurface.tsx:212-217`). The world canvas has a marquee (`canvas/useWorldDrag.ts:42,129-164`) to model on. A capture drag is new canvas-core behaviour (High) and must follow the measured release order outside the canvas (LESSONS, Live Browser Verification: "A release outside a captured canvas").
4. **"Compatible tileset" is a set of files, not a name.** The block editor keys everything by resolved tileset files because tilesets alias them (`specs/2026-11-08-pokemap-plan-14-2-block-editor-design.md`, "Identity: physical files"). On GBA a metatile id at or above the split means a different block under a different primary and secondary pair or split (invariant I1, `project.splitFor`). A pattern records the files and, on GBA, the split it was captured under.
5. **Block ids can change meaning under a saved pattern.** The block editor's OK edits a block everywhere. The spec decides whether a pattern notices (a fingerprint of the blocks it uses) or simply draws the edited block.
6. **`.pokemap/` is treated differently by the two subjects.** The GBA subject ignores it (`.gitignore:1` `.*`), so a pattern file there is never committed; PerfPlus has no `.pokemap/` and does not ignore it, so the file shows as untracked. Sidecars are written by plain `writeFileSync` behind a hand-written shape guard (`core/src/world/sidecar.ts:33-93`), not by `writeFilesAtomically`; the spec says which writer the pattern file uses.
7. **Placing a pattern must go through the existing paint routes.** `refuseUnsavedBlockRefs` sits in every grid-writing path (`server/src/index.ts:947`, `gbcEditRoutes.ts:216`); a new "place" route that writes the grid itself skips it.
8. **Tool keys are nearly used up.** P R B I S C G, K and F are taken (`Toolbar.tsx:15`, `shared/useFitShortcut.ts:17`).
9. **Selection state in the shell re-renders everything** (LESSONS, React: "Shell-level state re-renders everything below it"). The capture rectangle lives in the surface.
10. **"Dropper-then-Pencil gave no stamp" on GBA is recorded and unconfirmed** (LESSONS, GBA / Porymap Quirks). Check it before building capture on the dropper path.
11. **The keyboard model is designed against keys already taken.** Tools use P R B I S C G and K, Edit block (`components/Toolbar.tsx:15`); F fits (`shared/useFitShortcut.ts:17`); Ctrl+Z/Y undo and redo (`Toolbar.tsx:76-81`); `+ = - _`, Enter and Escape belong to the world canvas (`canvas/WorldSurface.tsx:662-680`); Escape has capture-phase listeners (`shared/AddEventBar.tsx:50`, `shared/useWorldContext.ts:123`; LESSONS, Live Browser Verification). There is no Ctrl+S and no map-canvas selection today.

## Questions

**Rulings (user, 2026-11-16).** The pattern file is a PokeMap-native format, not Porymap's prefab file. The library is project data, committed, in a tracked path the spec names for each family (trap 6). Capture is a drag with the Dropper that fills the brush, plus "Save as pattern"; no new tool key. The keyboard side of selection is decided in the same interview as the map-canvas keyboard model (D24a).

**Open, for the spec interview:**

1. Whether events inside the captured area are copied. Recommendation: no.
2. An incompatible pattern: hidden, or shown disabled with the reason. Recommendation: shown disabled.
3. Placement at the map edge: clipped or refused. Recommendation: clipped, as stamps are today.
4. Pattern management: rename and delete only. Recommendation: yes.
5. The map-canvas keyboard model: a cell cursor on the arrow keys, which key applies the tool, how Rect and Shift take a second point, how pan works. Decided with the capture gesture, in one interview (trap 11; D24a).
6. Whether events can be selected and moved from the keyboard in this plan. Recommendation: no; canvas painting only.
7. Whether the world canvas gains arrow-key panning to match.
8. Whether the dialogs opened from the canvas (Add Event placement, Edit block) need the same cell cursor to be reachable without a mouse.

## Answers

1. no, per Recommendation
2. shown disabled, per Recommendation
3. Clipped, as stamps are today, per Recommendation
4. yes, per Recommendation

## Subtasks

Provisional (names and files; the spec may move them). All verify lines run from the repo root after `npm run typecheck`.

| Id | What | Files | Tier | Verify | After |
|---|---|---|---|---|---|
| 14A-1 | One generic `paintCells`/`floodFill` | `packages/core/src/edit/paint.ts`, `packages/core/src/gbc/edit/paint.ts`, their tests under `packages/core/test/edit/` and `packages/core/test/gbc/` | High (shared engine) | `npx vitest run --no-file-parallelism packages/core/test/edit packages/core/test/gbc` | Plan H H1-H3 |
| 14A-2 | Pattern model, compatibility check, file read and write with a shape guard | new `packages/core/src/world/patterns.ts`, `packages/core/src/config/paths.ts`, a test under `packages/core/test/world/` | Medium | `npx vitest run --no-file-parallelism packages/core/test/world` | 14A-1 |
| 14A-3 | Pattern routes, one module mounted by both handlers (D23a) | new `packages/server/src/patternRoutes.ts` and its test; `packages/server/src/{index,gbcRoutes}.ts` | Medium | `npx vitest run --no-file-parallelism packages/server` | 14A-2; Plan H Task H |
| 14A-4 | Capture gesture on the map surface, both families | `packages/ui/src/canvas/{MapSurface.tsx,mapSurfaceAdapter.ts}`, `gba/mapSurface.tsx`, `gbc/mapSurface.tsx`, `packages/ui/test/canvas/` | High (canvas core) | `npx vitest run --no-file-parallelism packages/ui/test/canvas` | 14A-1 |
| 14A-4b | Map-canvas keyboard model (U3): focus, accessible name, key handler and cell cursor per the interview; focus restore after the context menu or a dialog closes | `packages/ui/src/shared/MapCanvasViewport.tsx`, `packages/ui/src/canvas/MapSurface.tsx`, `packages/ui/test/canvas/` | High (canvas core) | `npx vitest run --no-file-parallelism packages/ui/test/canvas` | 14A-4 |
| 14A-5 | GBC palette multi-block selection | `packages/ui/src/gbc/GbcMetatilePalette.tsx`, its test | Medium | `npx vitest run --no-file-parallelism packages/ui/test/gbc` | 14A-1 |
| 14A-6 | Pattern panel in the rail, shared, with family data through the adapter | new `packages/ui/src/shared/PatternPanel.tsx`; `shell/adapter.ts`, `gba/adapter.tsx`, `gbc/adapter.tsx` | Medium | `npx vitest run --no-file-parallelism packages/ui/test/shared packages/ui/test/shell` | 14A-3, 14A-4 |
| 14A-7 | Live acceptance on scratch clones, both families | report | - | live report | all |
| 14A-8 | Final review | - | - | reviewer per the `delegate` skill | 14A-7 |

## Acceptance

- Both families can capture, save, reselect and place a pattern, reject incompatible tilesets, and undo a placement.
- The map canvas takes focus, has an accessible name and paints from the keyboard per the interview's model; focus returns to it after the context menu or a dialog closes (row 14A-4b).
- Live acceptance on scratch clones in both families (row 14A-7).
