# Decisions D1-D35

Every later plan follows these. They are kept word for word; "this roadmap" in a decision means this folder: the [README](README.md) (order and scope) and this file (the decision log).

Made 2026-10-13 (in RESUME "Unified UI direction"):
- D1. Map switch with unsaved changes: both families warn and offer **save or discard**.
- D2. GBC gets the sign composer.
- D3. Manual placements, the defects banner and the dungeon filter cache are shared features.

Made 2026-10-14 (this session):
- D4. **Edit layout: the GBC rail** for both families. One right-hand rail: metatile palette (always visible, hover-linked
  to the canvas) over the event inspector. The collision palette joins the rail while the Collision tool is active. The
  GBA horizontal palette strip goes away (it also fixes the short world area in context mode, a 6c E deferral).
- D5. **Tool buttons: icon plus capitalised label**, keyboard shortcut in the tooltip.
- D6. **Inspector:** Duplicate in both families; Add Event behind a capability flag (GBA now). GBC Add Event is scoped in
  Plan 14.
- D7. **GBC collision:** plan a GBC metatile-collision editor (Plan 14). Until then the Collision tool and the Elevation
  overlay are capability-flagged off for GBC.
- D8. **World bar:** both families get the Dungeon auto-layout toggle and the Unplaced maps rail.
- D9. **Canvas core staged:** cheap leaf extractions first (Plan 11), then the full render-pipeline core (Plan 12).
- D10. **Shell split into two plans:** Plan 9 shell and layout (behaviour-preserving apart from layout), Plan 10 parity
  features.
- D11. **#5/#6 (Codex, uncommitted on `issues-5-6-warp-popups`) land after the canvas core** (Plan 13), ported onto it.
- D12. Issues in this roadmap: #8, #9, #10, #7. Order after the core: #5/#6, GBC Add + collision, #9, #8, #10, #7.
  #8 moved after #9 because of D13.
- D13. **#8 minimap draws the in-game town map art** (needs #9's region-map loaders).
- D14. **#9 first version edits all three:** map-section boundaries and names, fly points, tile graphics.
- D15. **#10 copies everything** (layout, blocks, border, events, warps, scripts, encounters) **and copies a missing
  tileset; same family only** (GBA to GBA, GBC to GBC). Cross-family conversion is backlog.
- D16. **#7 is triage only:** rate HMA features, split keepers into issues. No implementation.

Made 2026-10-16 (user-approved Reddit feature assessment):
- D17. **Keep Plans 10-14 in order; insert 14A stamps, 14B terrain painting, then 14C adjacent-map creation before Plan 15.** Both families use the shared canvas and adapter. Plan 17 reuses 14C's destination-map creation machinery.
- D18. **Plan 17A follows Plan 17:** a 2D collision-aware walking preview in both families. Plan 18 remains independent triage and may run any time.

Made 2026-11-02 (Plan 14 interview; user):
- D19. **Plan 14 splits into 14.1 Add Event and 14.2 Block editor, both families now.** One shared UI in the shell; each
  engine supplies options and writers. 14.1: four icon Add buttons (Object, Warp, Coord, BG), place on a tile, then a
  popup with dropdowns / text boxes / a Use existing - Copy from - New toggle (spec
  `specs/2026-11-02-pokemap-plan-14-1-add-event-design.md`). Supersedes D6's "GBC Add Event" scope.
- D20. **D7 widened: a Polished-Map-style block editor (14.2) replaces the collision-only editor.** Popup over the map
  showing the block as drawn; pick tiles from the tileset into the block; collision (GBC) or behavior/layer (GBA)
  dropdowns; a warning of uses on this map, other maps and maps sharing the tileset; OK edits the block everywhere,
  Save as new block appends a new block id. GBA per-square collision painting stays as it is.

Made 2026-11-13 (after the 2026-11-12 code review; the user asked for its gaps to be added to the existing plans and
allowed plan adjustments for build flow; D21-D23 are Claude's calls under that instruction, except D21's order of H1-H3
before Plan 14A, which the user confirmed; see "Open items for the user"):
- D21. **The review backlog is Plan H** and lives in `plans/plan-h-hardening.md` (Tasks A-Q, with
  tiers, batches and acceptance). Batches H1-H3 (request boundary, path containment, save and session correctness,
  route modules) finish before Plan 14A. The remaining tasks run between later plans, one at a time; Task N's two slots
  are D24a.
- D22. **Plan 3 and Plan 5 overlap is folded into this roadmap.** Plan 3 Tasks 4-5 (region map) move to Plan 15. Plan 3
  Tasks 1 and 9 and the create-layout part of Task 8 move to Plan 14C. Plan 3 Tasks 6-7 are covered by Plan 14.2 except
  GBA tile pixels, palettes and the FireRed attribute fields, which stay in Plan 3. Plan 3 Task 10 is deleted: each plan
  that adds a writer extends the corpus gate itself. Plan 5 §2 (prefabs) moves to Plan 14A. Plan 3 keeps Tasks 2 and 3
  and the reduced 6-8. Moved task texts stay as requirements, in the receiving plan (D34).
- D23. **Build rules for every later plan.** (a) A hub route with no family-specific logic is written once as a route
  module and mounted by both handlers (Plan H Task H sets the shape). (b) New routes decode path segments with the
  guarded decoder and read bodies through the shared JSON helper (Plan H Task E). (c) Every write to a subject repo goes
  through `writeFilesAtomically`, which refuses a path outside the project root (Plan H Task F). (d) In-flight status
  lives in `RESUME.md` only; an entry here records status once, when its plan merges. (e) A plan names the existing
  files it will modify, so work that runs beside it can avoid them.

Made 2026-11-16 (user; binding):
- D24. **Six order changes.** (a) Plan H Task N's map-canvas
  keyboard model is decided in one interview with Plan 14A and built with or just before it; the layout and theme parts
  of Task N stay before Plan 15. (b) Plan 15 splits into 15a
  (loaders and a read-only view) and 15b (the tools); Plan 16 follows 15a. (c) The `canvas/WorldSurface.tsx` hook
  extraction is Plan 14C's first UI task, not Plan 16's. (d) Plan 18 runs early, before the trainers plan, Plan 3's
  remainder and Plan 5 section 1 are specced. (e) Plan 17A may run any time after Plan 14C. (f) The trainers plan runs
  after Plan 14A; Plan 3 Tasks 2 and 3 run after Plan 14C as one plan for both families.
- D25. **PokeMap does not refuse to open a project over one broken part.** User: "I don't want to ship a tool that will
  refuse to open a project. Let's give the operator a chance to change the breaking bug. GBA should open, but force a fix
  to the broken component first." The project opens; the broken component is named with what to change, and it cannot
  be read, edited or saved until it is fixed. First use: Plan H Task F (a path that leaves the project). Claude's reading
  of "force a fix first": the block is on the broken component and what depends on it, not on the rest of the project.
- D26. **Plan 15's goal is full customisation of the town map** (D14 clarified): the user must be able to turn, for
  example, the Kanto town map into the map of a new region. Tile arrangement where the format allows it, pixel editing
  where it does not. The pixel editor and the indexed PNG and palette writers are therefore in scope and are built once,
  shared with Plan 3 (D27).
- D27. **Plan 3 keeps its tileset work inside PokeMap** (amends D22's reduction): tile pixel editing, palette editing,
  the FireRed attribute fields, and layout deletion are all built.
- D28. **Plan 5:** scripts are linked out to the user's editor, not edited in PokeMap. The day/night work is a palette
  swap plus the things that change with the time of day: event triggers and wild Pokémon.
- D29. **The build toolchain is installed on the Windows machine** (`make`, `arm-none-eabi-gcc`, `rgbasm`), so "the game
  still builds" becomes an acceptance check in Plans 14C, 15, 17 and the trainers plan. Installed 2026-11-17, in WSL2
  Ubuntu on that machine: devkitARM r65, rgbds 0.6.1 and agbcc. Both subjects build from clean clones: GBC with `make`,
  the GBA subject with `make modern` (plain `make`, through agbcc, fails on the game's own code; not PokeMap's).
  Setup and the check command: RESUME, Environments.
- D30. **Plan H Task B fixes both cases** (user, 2026-11-16: "fix both"): the core `applyJsonOps` order (add then move
  in one session) and the GBA hub's delete-then-move index (Plan H trap 3b).
- D31. **Plan 17 copies GBA tilesets** (user, 2026-11-16), refusing only two cases, each with its reason: a tileset
  whose header has an animation callback, and a secondary tileset whose paired primary is neither in the destination nor
  copied with it. The build check (D29) is the acceptance test.
- D32. **Plan 4 builds the launcher only** (user, 2026-11-16: "start with just the launcher, stand alone app can be down
  the line. launcher should be all I need to press to run the app"). One double-click runs PokeMap. The Electron app
  and its installer are deferred, not cancelled.
- D33. **PokeMap never relies on git** (user, 2026-11-16: "I don't want this tool to rely on git, maybe the person using
  it doesn't use git?"). Plan 4 Task 4 (git integration) is cancelled. No product feature may require git or a git
  repository; safety comes from the save preview, the fingerprinted all-or-nothing write and byte comparisons. Checked
  2026-11-16: no code under `packages/*/src` calls git today. Claude's reading: developer tooling (the `gate` skill's
  subject snapshot, test setup) may keep using git, since it is not shipped.

Made 2026-11-21 (user):
- D34. **Plans hold only their own work and how to build it.** User: "all we care about in the plans now is what are we
  going to do in this plan, and information about how to build the plan." No "this used to be here, but is now here"
  notes, no review provenance, no answered questions shown as questions, nothing about what another plan built or
  covers. Existing code is cited by its path, never by the plan that built it. Dependencies stay. A requirement that
  belongs to another plan lives in that plan. This roadmap keeps the order, each plan's scope and the decision log.

Made 2026-11-21 (user; binding):
- D35. **Plan H runs as one block before Plan 14A; Task N and Task O move out.** User: "Split as you recommended."
  Every Plan H batch (H0-H5 and the "Now" tasks) merges before Plan 14A starts. The map-canvas keyboard model and focus
  restore are part of Plan 14A. The minimum width, the light theme removal, and the stylesheet tokens and split are the
  first step of Plan 15a. This replaces D21's "remaining tasks run between later plans" and the two Task N slots in D24a.
  D22 and D23 are confirmed; on D23 the user said "looks good".

Execution order (D24, D35): **10 → 11 → 12 → 13 → 14 (14.1, 14.2) → H (every batch) → 14A (with the map-canvas keyboard model) → trainers plan → 14B → 14C → Plan 3 Tasks 2-3 → 15a → 16 → 15b → 17 → 17A**; Plan 18 runs early, before the trainers plan is specced; Plan 17A may move up to any point after 14C; 15a starts with the layout rules and stylesheet work (D35). The trainers plan's exact slot after 14A is Claude's reading of D24f ("after Plan 14A"). Each entry still needs its own spec and implementation plan.

## Standing rule

Every plan that writes a file read once at project open (map groups, layouts, GBC `maps.asm` and `map_constants.asm`, encounters, region map) depends on Plan H Task G's invalidation, and its spec lists the caches it must clear.
