# PokeMap plans

**Goal (user, 2026-10-13):** GBA and GBC get the same UI/UX: the same buttons, layout, colouring and features. A feature added once shows up in both; engine differences sit behind an adapter with capability flags.

Every plan in execution order. Open plans are in this folder; finished plans are in [archive/](archive/) with their full step text, unedited.

| Plan | TLDR | Status |
|---|---|---|
| [0: GBA roadmap and invariants](archive/plan-00-gba-roadmap.md) | Conventions, package layout and the GBA invariants I1-I8 that bind every GBA task. Not executed itself. | complete |
| [1: Foundation, renderer, stitched world, encounter atlas](archive/plan-01-foundation-world.md) | Read-only GBA renderer per layout split, the stitched world, the encounter atlas and the CLI. | complete |
| [1a: World view usability](archive/plan-01a-world-view-usability.md) | Multi-select map moving, a World-mode jump-to-map and a species type-ahead in the world view. | complete |
| [1b: Dungeon mode and warp tools](archive/plan-01b-dungeon-mode-and-warp-tools.md) | Small interiors hidden by default with a greyed third state, warp markers and a Dungeon tab. | complete |
| [2: Painting, events, and wild sign authoring](archive/plan-02-editing.md) | GBA painting, event editing and wild signs through one previewed save funnel. | complete |
| [6 roadmap: GBC family and invariants G1-G7](archive/plan-06-gbc-roadmap.md) | Scope and conventions for the Game Boy / GBC family (Crystal now, Yellow later) and its invariants G1-G7. | complete |
| [6: GBC foundation](archive/plan-06-gbc-foundation.md) | Read-only Pokémon Crystal core: maps, tilesets, world, encounters, through the CLI. | complete |
| [6b: GBC app layer](archive/plan-06b-gbc-app-layer.md) | GBC server routes and UI, read-only. | complete |
| [6c: Hub, encounter border, world UX](archive/plan-06c-hub-encounters-world.md) | Project hub and picker, the encounter border, world placements and in-context editing, both families. | complete |
| [7: GBC editing](archive/plan-07-gbc-editing.md) | The Crystal write path: painting and events with a previewed save. | complete |
| [8: UI engine adapter](archive/plan-08-ui-engine-adapter.md) | Shared GBA/GBC UI modules over an engine adapter. | complete |
| [9: Family shell](archive/plan-09-family-shell.md) | One `FamilyApp` shell over an `EngineAdapter`, the rail layout and the icon-and-label toolbar for both families. | complete |
| [9F: Rail palette](archive/plan-09f-palette.md) | Porymap-style metatile palette in the rail, both families. | complete |
| [10a: Save-or-discard switch and Sign tool](archive/plan-10a-switch-and-signs.md) | Save-or-discard prompt on map switch and a Sign tool, both families. | complete |
| [10a2: Pokémon Indicator](archive/plan-10a2-pokemon-indicator.md) | The GBA species sign becomes the Pokémon Indicator, ported to GBC. | complete |
| [10a3: Save integrity](archive/plan-10a3-save-integrity.md) | All-or-nothing multi-file save, and a commit bound to the previewed plan by fingerprint. | complete |
| [10b: World parity and defects](archive/plan-10b-world-parity-and-defects.md) | Shared manual placements, defects banner, dungeon filter cache, Duplicate and the world bar. | complete |
| [11: Canvas leaf extractions](archive/plan-11-canvas-leaf-extractions.md) | Shared runs outside the draw path lifted out of the canvas pairs. | complete |
| [12a: Canvas foundation and MapSurface](archive/plan-12a-canvas-foundation-map-surface.md) | One map render and interaction surface for both families. | complete |
| [12b: WorldSurface](archive/plan-12b-world-surface.md) | One world surface for both families, and world-tile pre-warm in the hub. | complete |
| [13: Warp destination popups (#5/#6)](archive/plan-13-warp-popups.md) | Editable warp destination popup and the dungeon world scope, both families. | complete |
| [14.1: Add Event](archive/plan-14-1-add-event.md) | Add Object, Warp, Coord and BG events from a placement popup, both families. | complete |
| [14.2: Block editor](archive/plan-14-2-block-editor.md) | Polished-Map-style block editor: tiles, collision or behaviour, usage warning, Save as new block. | complete |
| [H: Hardening and structure pass](plan-h-hardening.md) | Request boundary, path containment, save and session correctness, route modules, small UI fixes, tooling. All of it before 14A. Merged: every batch, M3 fonts and P1-P3b (lint #76, CI #77, `exports` map #78, imports rewritten #79-#81). P3c skipped: no whole folder is GBA-only ([finding](../task-reports/pokemap-plan-h-review-backlog/p3c-finding.md)). K5 is not in the merge list. | done |
| [18: HexManiacAdvance triage (#7)](plan-18-hma-triage.md) | Rate the 21 HMA features in issue #7 and turn the keepers into issues (#50-#54). Docs only. | complete |
| [14A: Shared stamps and saved patterns](plan-14a-stamps-and-patterns.md) | Capture a map area, save it as a named pattern tied to its tilesets, and place it, both families; keyboard access to the map canvas. | open |
| [19: Create new trainers](plan-19-new-trainers.md) | Create a trainer and its party by copying an existing one, from the Add Object popup, both families. | open |
| [14B: Terrain painting](plan-14b-terrain-painting.md) | Water and path brushes that repair neighbouring edges; forests and cliffs in a later phase. | open |
| [14C: Create and connect adjacent maps](plan-14c-adjacent-maps.md) | Create a map off an existing edge with reciprocal game connections, all-or-nothing, both families. | open |
| [3: Data editors](plan-03-data-editors.md) | Map header, wild encounter, tile pixel, palette and layout editors, both families. | open |
| [15a: Town map loaders and read-only view](plan-15a-town-map-view.md) | Finish the layout rules and stylesheet split, then measure both town map formats, load them losslessly and show them in a fourth view, both families. | open |
| [16: Town-map minimap (#8)](plan-16-town-map-minimap.md) | A minimap of the town map art in the world view, highlighting the area in view. | open |
| [15b: Town map editor tools (#9)](plan-15b-town-map-tools.md) | Full town map customisation: sections, fly points, tile arrangement and pixels, with lossless writers. | open |
| [17: Copy maps between games (#10)](plan-17-copy-maps.md) | Copy a map with everything it needs, tileset included, into another game of the same family. | open |
| [17A: Walking preview](plan-17a-walking-preview.md) | A 2D collision-aware walking preview with each engine's movement rules. May run any time after 14C. | open |
| [4: Launcher and MCP server](plan-04-launcher-and-mcp.md) | One double-click launcher, MCP tools for agents, the guides and a CLI speed-up are merged. The Electron app and installer are deferred (D32). | open |
| [5: Future work](plan-05-future-work.md) | Backlog: script link-out, day/night preview, `.pla` lights and smaller items. Nothing scheduled. | open |

**Execution order (D24, D35):** 10 → 11 → 12 → 13 → 14 (14.1, 14.2) → H (every batch) → 14A (with the map-canvas keyboard model) → 19 → 14B → 14C → Plan 3 Tasks 2-3 → 15a → 16 → 15b → 17 → 17A. Plan 18 runs early, before Plan 19 is specced; Plan 17A may move up to any point after 14C; Plans 4 and 5 are independent. Plan 19 is the trainers plan named in D24.

## Where things live

- **Decisions D1-D35**, word for word, and the standing rule for every plan: [decisions.md](decisions.md).
- **Invariants:** GBA I1-I8 in [Plan 0](archive/plan-00-gba-roadmap.md); GBC G1-G7 in the [GBC roadmap](archive/plan-06-gbc-roadmap.md).
- **Specs and rulings** per plan: [`docs/superpowers/specs/`](../specs/).
- **Current state** (what is in flight, gates, git state): [`docs/superpowers/RESUME.md`](../RESUME.md). Status in this table changes when a plan merges.
- **Traps and lessons** learned while building: [`docs/superpowers/LESSONS.md`](../LESSONS.md).
- **Task reports and ledgers:** [`docs/superpowers/task-reports/`](../task-reports/).
- **Finished plans** and removed task text (cancelled or done): [archive/](archive/). **Background** (the 2026-10-14 issue map and toolbar comparison, the Plans 9-14 notes, the order-and-overlap review, the Plan H review findings): [background/](background/).
