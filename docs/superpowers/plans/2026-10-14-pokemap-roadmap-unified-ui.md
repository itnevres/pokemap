# PokeMap roadmap: unified UI and the open issues (Plans 9-18)

Written 2026-10-14 from master `741132d`, after a GitHub issue review and a user interview. This is an outline, not an
implementation plan: each plan below gets its own spec and plan (superpowers:writing-plans) when it starts. Plan numbers
after 10 are provisional. In-flight status lives in `RESUME.md` only; an entry here records status once, when its plan
merges (D23d).

**Goal (user, 2026-10-13):** GBA and GBC get the same UI/UX: the same buttons, layout, colouring and features. A feature
added once shows up in both; engine differences sit behind an adapter with capability flags.

## Decisions this roadmap rests on

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
allowed plan adjustments for build flow; these three are Claude's calls under that instruction, not confirmed one by one, except D21's order of H1-H3 before
Plan 14A, which the user confirmed the same day):
- D21. **The review backlog is Plan H** and lives in `plans/2026-09-23-pokemap-followups-remaining.md` (Tasks A-P, with
  tiers, batches and acceptance). It starts when Plan 14.2 merges, because 14.2 holds the server and UI files in flight;
  three small tasks (L1, M2, K5) may run beside 14.2. Batches H1-H3 (request boundary, path containment, save and
  session correctness, route modules) finish before Plan 14A. The remaining tasks run between later plans, one at a
  time; Task N (layout and keyboard access) finishes before Plan 15.
- D22. **Plan 3 and Plan 5 overlap is folded into this roadmap.** Plan 3 Tasks 4-5 (region map) move to Plan 15. Plan 3
  Tasks 1 and 9 and the create-layout part of Task 8 move to Plan 14C. Plan 3 Tasks 6-7 are covered by Plan 14.2 except
  GBA tile pixels, palettes and the FireRed attribute fields, which stay in Plan 3. Plan 3 Task 10 is deleted: each plan
  that adds a writer extends the corpus gate itself. Plan 5 §2 (prefabs) moves to Plan 14A. Plan 3 keeps Tasks 2 and 3
  and the reduced 6-8. The moved task texts stay in those files as requirements for the receiving plan's spec.
- D23. **Build rules for every later plan.** (a) A hub route with no family-specific logic is written once as a route
  module and mounted by both handlers (Plan H Task H sets the shape). (b) New routes decode path segments with the
  guarded decoder and read bodies through the shared JSON helper (Plan H Task E). (c) Every write to a subject repo goes
  through `writeFilesAtomically`, which refuses a path outside the project root (Plan H Task F). (d) In-flight status
  lives in `RESUME.md` only; an entry here records status once, when its plan merges. (e) A plan names the existing
  files it will modify, so work that runs beside it can avoid them.

Made 2026-11-16 (user, answering the 2026-11-15 plan review; these are binding):
- D24. **Six order changes** (the proposals in "Order and overlap review", all confirmed). (a) Plan H Task N's map-canvas
  keyboard model is decided in one interview with Plan 14A and built with or just before it; the layout and theme parts
  of Task N stay before Plan 15. This amends D21's "Task N finishes before Plan 15". (b) Plan 15 splits into 15a
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
  still builds" becomes an acceptance check in Plans 14C, 15, 17 and the trainers plan. Not yet installed.
- D30. **Plan H Task B fixes both cases** (user, 2026-11-16: "fix both"): the core `applyJsonOps` order (add then move
  in one session) and the GBA hub's delete-then-move index (Plan H trap 3b). Step 1's "pin and close" exit is removed.
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

Execution order (amended by D24, 2026-11-16): **10 → 11 → 12 → 13 → 14 (14.1, 14.2) → H (batches H1-H3) → 14A (with Plan H Task N's keyboard model) → trainers plan → 14B → 14C → Plan 3 Tasks 2-3 → 15a → 16 → 15b → 17 → 17A**; Plan 18 runs early, before the trainers plan is specced; Plan 17A may move up to any point after 14C; the rest of Plan H is independent. The trainers plan's exact slot after 14A is Claude's reading of D24f ("after Plan 14A"). Each entry still needs its own spec and implementation plan.

## Issue map (all 7 open, reviewed 2026-10-14)

| # | Title (short) | Category | State on master | Where it goes |
|---|---|---|---|---|
| 4 | World auto-populates major areas; drag unplaced maps from search | UI unification, likely done | `world/visibility.ts` hides indoor/none (GBA) and indoor/gate (GBC); `MapTree` greys undrawn maps and makes them draggable, both families | Live-check in Plan 9 acceptance, then close with evidence |
| 5 | Warp toggle; double-click opens destination in a popup | Feature | Warps toggle and preview popup in both world views; the editable popup is Codex's uncommitted work | Plan 13 |
| 6 | Dungeon mode with warp connection lines | Feature, mostly done | Dungeon mode and connection lines in both families; Codex's uncommitted GBA `scope=dungeon` indoor-placement fix | Plan 13 |
| 7 | Evaluate HexManiacAdvance features | Epic, mostly GBA data | None | Plan 18 (triage) |
| 8 | Town map mini-map highlighting the viewport | Feature | None | Plan 16 |
| 9 | Edit the in-game town map | Engine-specific feature | GBA paths known (`config/paths.ts` `regionMapDir`, `regionMapSections`); no loader for the tilemap or fly points; GBC none | Plan 15 |
| 10 | Copy maps between games | Engine-specific feature | None | Plan 17 |

## Toolbar comparison (master `741132d`, basis for D4/D5)

Both families already render the same `components/Toolbar.tsx`; the differences are its props and the chrome around it.

| Area | GBA (`App` + `MapEditingWorkspace`) | GBC (`GbcApp` + `GbcMapEditing`) |
|---|---|---|
| Header | PokeMap, Map/World/Dungeon, status, switcher | PokeMap **Crystal**, Map/World/Dungeon, **Morn/Day/Nite**, selected map, switcher |
| Tools | pencil rect bucket dropper shift **collision** (raw lowercase names) | pencil rect bucket dropper shift; disabled with the reason when the `.blk` is non-writable |
| History, Save, Discard | Undo, Redo, Save (dot when dirty), Discard Changes (danger) | same; undo/redo/discard errors go to the banner |
| Extra | **Add Sign** | none |
| Under the toolbar | collision palette strip (Collision tool) or metatile strip (pencil/rect/bucket only); error banner; sign-added banner | error banner |
| Side | `EventInspector`: X/Y/Elevation, Delete, **Add Event** | 260px rail: palette over `GbcEventInspector`: Delete, **Duplicate**, warp-renumber warnings |
| Canvas bar | zoom levels, Fit; Grid, Collision, **Elevation**, Events, Encounters | same without Elevation; legend Wall/Water and Object/Warp/Coord/Bg |
| World bar | Warps, Connection lines, **Dungeon auto-layout**, **Unplaced maps** rail | Warps, Connection lines |

## The plans

### Plan 9: one shell and the unified edit layout

- **Goal:** one `FamilyApp` drives both families through an `EngineAdapter` with capability flags; both families show the
  D4 rail layout and the D5 toolbar.
- **Scope:** `EngineAdapter` interface (data hooks, edit session, canvases, inspector, palette, family header extras such
  as time of day) and its two implementations; `FamilyApp` replaces `App` and `GbcApp`; capability flags for what only one
  engine does today (collision tool, elevation overlay, Add Event, Add Sign, time of day, defects, manual placements,
  dungeon filter, world-bar controls). One rail component; `Toolbar` gets icons, labels and shortcuts. Behaviour stays as
  it is apart from layout: the switch semantics, sign composer and GBC-only features stay flag-gated per family here.
  Live check of issue #4 in both families.
- **Order:** first. Everything else builds on the shell.
- **Risk:** medium. `App` and `GbcApp` differ in switch semantics (GBC discards on the server before switching and shows
  `switchError`); context-editing and visit identity must survive the merge; StrictMode double effects (LESSONS: React /
  UI Patterns). Gate on test counts: tests are moved, not dropped, and a lower count is a finding.
- **Depends on:** D4, D5, D10.

### Plan 10: parity features through the adapter

- **Goal:** turn the per-family flags from Plan 9 into shared features, per D1-D3, D6, D8.
- **Scope:** save-or-discard prompt on map switch in both families (D1), including the Plan 8 deferral: a discard waits for
  queued stroke links (`strokeSettled().then(discard)`); GBC sign composer with a GBC engine side writing the `.asm` bg
  event and Crystal text (D2); manual placements, defects banner and dungeon filter cache in GBA (D3); Duplicate in the GBA
  inspector (D6); Dungeon auto-layout toggle and Unplaced rail in GBC (D8).
- **Order:** after Plan 9.
- **Risk:** medium-high. The GBC sign composer writes new source text (save safety, LESSONS: Editing Sessions & Save
  Safety; GBC Format & Engine Quirks); the switch prompt touches session ownership and the server-side discard.
- **Depends on:** D1, D2, D3, D6, D8.
- **Split (user, 2026-10-16):** **10a** = D1 + a new Sign tool (spec
  `specs/2026-10-16-pokemap-plan-10a-switch-and-signs-design.md`, plan `plans/2026-10-16-pokemap-plan-10a-switch-and-signs.md`);
  **10a2** = Pokémon Indicator (done, merged via #21); **10a3** = save integrity: all-or-nothing save and
  commit bound to the previewed plan (spec `specs/2026-10-19-pokemap-plan-10a3-save-integrity-design.md`; done, merged via #22); **10b** = D3 + F2, D6, D8 (done; merged via #23 → `b18375d`, 2026-10-23; three deferred minors fixed via #24).
- **D2 amended (user, 2026-10-16):** the GBA "sign composer" is not a sign: it adds an object event (a catchable
  species' sprite with cry + one line). It is renamed **Pokémon Indicator** and ported to GBC in 10a2. D2's "GBC sign
  composer" becomes a real **Sign tool** in both families (readable bg-event signs; free text or text linked to the map
  name / catchable species, kept current by the tool at save time; the decomp's original simple signs are editable).
- **Carried from Plan 9 (user, 2026-10-15):** with D3's manual placements in GBA, dragging a greyed (unplaced) map from the
  tree onto the World canvas must un-grey its tree row at once, as GBC does (`onPlacementSaved`). Today the GBA row stays
  greyed until a view switch or reload, because GBA snapshots world visibility once per World-mode entry. Plan 9 Task 12
  finding F2 (`task-reports/pokemap-plan-9-family-shell/task-12-live.md`); predates Plan 9.

### Plan 11: canvas leaf extractions

- **Goal:** take the cheap shared runs out of the canvas pairs without touching rendering.
- **Status:** done, merged via #26 (2026-10-24). Map pair 263 → 167 aligned lines, world pair 302 → 191; every remaining run is ruled in the task reports.
- **Scope:** per Plan 8 Task 8's measurement (`task-reports/pokemap-plan-8-ui-engine-adapter/_archive/task-8-measurement.md`):
  zoom and status-strip JSX, the overlay toggles and legend bar, the lens overlay block, tile-version refetch, the
  small-tile cache, badge geometry. About 100-150 lines per pair.
- **Order:** after Plan 10 (the flags settle which toggles exist per family).
- **Risk:** high (ruling P11-3). The extractions are pure; the canvas tests must pass unchanged except where a P11-3 or P11-4 fix changes them.
- **Depends on:** D9.
- **Carried from Plan 9 (user, 2026-10-15):** when the overlay toggles move out of the canvases, give GBA Map view's two
  "Collision" buttons distinct accessible names (the toolbar's Collision tool and the canvas's Collision overlay toggle,
  `MapCanvas.tsx` overlay group); tests currently scope by the "Tools" group to tell them apart. Plan 9 Task 8 ruling;
  final review minor m3 (`task-reports/pokemap-plan-9-family-shell/final-review.md`).
- **Brainstorming rulings (user, 2026-10-23; binding):**
  - **P11-1 Scope = every shared run outside the draw path.** Re-measured at `fb78949` (same method as Plan 8 Task 8):
    MapCanvas pair 263 aligned code lines in 37 runs, WorldCanvas pair 302 in 48. Plan 11 lifts zoom/pan (`applyZoom`,
    controlled-view plumbing), zoom buttons and status strip, the lens overlay block and `lensOverlayEntries`, tile-version
    refetch, small-tile cache, badge geometry, conflict-acceptance wiring and the context-overlay mount.
  - **P11-2 D9 holds.** Composite-version and redraw effects, and the stroke handlers around `chain.start`, stay for
    Plan 12.
  - **P11-3 Plan 10b deferred minors folded in:** all of groups T7b, Final fix and N1 (Plan 10b spec, "Deferred minors
    (after merge)"). These change behaviour and fix async races, so canvas tests may change for them (only for them).
  - **P11-4 Collision names:** the toolbar button's accessible name becomes "Collision tool" and the canvas toggle's
    "Show collision overlay"; visible text stays "Collision". Tests stop scoping by the "Tools" group.
  - **Tier: High** (async-ordering trigger from P11-3). Full workflow: spec, plan, SDD, separate spec and quality
    reviews.

### Plan 12: shared canvas core

- **Status (2026-10-25):** specced and split; 12a merged via #27 (`58f7213`); housekeeping (handoff docs + `.claude` tooling) via #28 (`935d981`); 12b (WorldSurface) plan written 2026-10-26 (`plans/2026-10-26-pokemap-plan-12b-world-surface.md`, 11 tasks, one plan per user; new rulings P12-4n..q in the spec), reviewed and approved by the user 2026-10-26; **implemented and reviewed 2026-10-28, merged via #29 (Plan 12 complete): one `WorldSurface` core for both families, hub world-tile pre-warm (P12-4w), live acceptance in both families, final review Codex `gpt-6-astra` Approved with fixes (2 Minor, fixed).** The 6c deferrals folded in here are closed: cramped world toolbar in context mode (toolbar wraps), refreshed tile kept until the new one loads, encounter tooltip clamped, no gutter overlap at mid zoom (P12-7). Spec `specs/2026-10-24-pokemap-plan-12-shared-canvas-core-design.md` (rulings P12-1..P12-8), plan `plans/2026-10-24-pokemap-plan-12a-canvas-foundation-map-surface.md`; 12b planned after 12a merges.
- **Goal:** one render and interaction layer for map and world canvases; the adapter supplies tile drawing, geometry and
  family overlays.
- **Scope:** render pipeline taking geometry plus family drawers; shared hit-testing, pan/zoom, LOD and tile caches, overlay
  layers (warps, lines, encounters, events). Fold in the 6c deferrals that live in the canvases (cramped world toolbar in
  context mode, blank refreshed tile until load, encounter tooltip clipping, gutter overlap at mid zoom).
- **Order:** after Plan 11.
- **Starting point:** Plan 11's final measurement and rulings (`task-reports/pokemap-plan-11-canvas-leaf/task-9-live.md`): the remaining aligned runs are draw path, hit-test and view model, which is exactly this plan's scope. The identical `!world` load placeholder in both world canvases is re-ruled here.
- **Risk:** high. Hit-testing, LOD caches and overlays (LESSONS: Canvas / World View Rendering). Needs live browser checks
  in both families (LESSONS: Live Browser Verification). Split into phases if the task count passes about 12.
- **Depends on:** D9.

### Plan 13: issues #5/#6 on the new core

- **Goal:** land the editable warp destination popup (#5) and the GBA `scope=dungeon` fix (#6) in both families.
- **Scope:** port Codex's uncommitted work (`issues-5-6-warp-popups`, record in that working tree's
  `task-reports/warp-dungeon-issues/coordinator.md`) onto the shell and core rather than rebasing it line by line; keep
  its tested behaviours: dirty-switch protection before opening, Escape and close keep pending edits, saved-refresh
  failure recovery with Retry, focus restoration. Full gate plus live World/Dungeon acceptance. Close #5 and #6 with
  evidence.
- **Order:** first after the core (D12): the parked work rots the longest.
- **Risk:** medium. The branch is uncommitted in the main checkout; a lost working tree loses it (see open item below).
  Its gate never collected tests (EPERM), so none of it is verified yet.
- **Depends on:** D11.
- **Status (2026-10-28):** spec `specs/2026-10-28-pokemap-plan-13-warp-popups-design.md`, plan
  `plans/2026-10-28-pokemap-plan-13-warp-popups.md` (7 tasks, High); risk re-rated High (shared shell/core).
- **Status (2026-11-02):** Tasks 1-7 done on local branch `plan-13-warp-popups`; live acceptance passed in both families
  (`task-reports/pokemap-plan-13-warp-popups/task-6-live.md`); final review (Codex astra) approved with one Minor, fixed.
  **Merged via #30 -> `7c68fc1` (2026-11-02); #5 and #6 closed.**

### Plan 14: GBC editing gaps

- **Goal:** GBC Add Event and a GBC metatile-collision editor.
- **Scope:** Add Event for GBC objects, warps, coord and bg events, with the script-label scaffolding Crystal needs (D6).
  A collision editor in the rail for a metatile's collision data (D7); it edits tileset data, so the UI must say how many
  maps share the tileset before a save. Then drop the GBC flag-offs for Add Event and Collision.
- **Order:** after Plan 13.
- **Split (D19, D20; naming ruling, user 2026-11-02):** Plan 14 is split into **Plan 14.1 Add Event**
  (spec `specs/2026-11-02-pokemap-plan-14-1-add-event-design.md`, plan `plans/2026-11-02-pokemap-plan-14-1-add-event.md`)
  and **Plan 14.2 Block editor** (the widened collision editor, D20). The numbering keeps them apart from Plans 14A-14C.
- **Status:** 14.1 done (Tasks 1-10, final review approved, gate 4,416 / 1 env fail / 254 files) and merged via #31 → `3f4a762`. 14.2 done (Tasks 0-16, final Claude Opus review approved after one fix round, gate 5,148 / 4 known fails / 273 files) and merged via [#32](https://github.com/itnevres/pokemap/pull/32) → `9d14637` (2026-11-21); its final review moved 15 items to Plan H Task Q.
- **Risk:** medium-high. New `.asm` text and tileset-wide writes (LESSONS: GBC Format & Engine Quirks).
- **Depends on:** D6, D7.

### Plan H: hardening and structure pass (review backlog)

- **Goal:** close the gaps the 2026-11-12 code review found, and leave one route shape, one session store and a
  contained write path for Plans 14A-17 to build on (D21, D23).
- **Scope:** `plans/2026-09-23-pokemap-followups-remaining.md`, Tasks A-P. Security: species-route path traversal, a
  body size cap, GBA route guards, path containment for decomp-sourced paths, JSON content type, dependency advisories,
  self-hosted fonts. Correctness: the render-cache bypass, the `applyJsonOps` order, discard against in-flight strokes,
  a suspected stale GBA map cache. Structure: shared sidecar routes, route modules in place of the 1,065-line GBA
  handler, one session store, small dedupes. UI: reduced motion, labels, responsive layout, keyboard access to the map
  canvas, stylesheet tokens. Tooling: lint, CI, a public core surface.
- **Order:** batch H0 (Task Q1), then H1-H3, before Plan 14A (Plan 14.2 merged 2026-11-21, so H0 may start); the rest between later plans; Task N before
  Plan 15.
- **Risk:** high for the batches that touch write paths, sessions and the request boundary (each task carries its
  tier). The structure tasks are behaviour-preserving moves with the existing route tests as the oracle.
- **Depends on:** D21, D23; Plan 14.2 merged (done, #32).

### Plan 14A: shared stamps and saved patterns

- **Goal/scope:** after Plan 14, rectangular selection in both families, capture a map area, preview/place exact arrangements, and save named patterns tied to compatible tilesets. Reuse existing stamp painting; keep pattern management small. Acceptance: both families can capture, save, reselect and place a pattern, reject incompatible tilesets, and undo a placement.
- **Risk/dependencies:** high (shared canvas interactions and edit-session behavior); depends on Plans 12/14 and D17. Stamps place exact arrangements; terrain brushes remain a separate tool.
- **Absorbed (D22, 2026-11-13):** Plan 5 §2 Prefabs is this plan's saved-pattern scope. Its first decision (a PokeMap-native file under `.pokemap/` or Porymap's prefab format) and its rule that collision and elevation travel with the pattern go to this plan's spec. First task: one generic `paintCells`/`floodFill` for both families (Plan H, "Folded into other plans", R4).
- **Traps and pitfalls (2026-11-15).**
  1. **The two families' stamps are not the same type.** A GBA stamp cell carries `metatileId`, `collision` and `elevation` (`core/src/edit/paint.ts:3-8`); a GBC one carries `metatileId` only (`core/src/gbc/edit/paint.ts:5`), because GBC collision belongs to the block, not the cell. "Collision and elevation travel with the pattern" is a GBA rule; the spec states the GBC rule (ids only) instead of leaving it to a task.
  2. **GBC cannot select more than one block.** `gbc/GbcMetatilePalette.tsx:21,86` picks a single cell as a 1x1 stamp; the GBA palette drag-selects a rectangle (`components/MetatilePalette.tsx:145-163`). Core paints a stamp grid in both families already (`paintCells`), so the gap is UI only, and it is in no task text.
  3. **The map canvas has no selection concept.** Tools are pencil, rect, bucket, dropper, shift, collision, sign and edit block (`components/Toolbar.tsx:6`), and the dropper picks one cell (`canvas/MapSurface.tsx:212-217`). The world canvas has a marquee (`canvas/useWorldDrag.ts:42,129-164`) to model on. A capture drag is new canvas-core behaviour (High) and must follow the measured release order outside the canvas (LESSONS, Live Browser Verification: "A release outside a captured canvas").
  4. **"Compatible tileset" is a set of files, not a name.** Plan 14.2 keys everything by resolved tileset files because tilesets alias them (its spec, "Identity: physical files"). On GBA a metatile id at or above the split means a different block under a different primary and secondary pair or split (invariant I1, `project.splitFor`). A pattern records the files and, on GBA, the split it was captured under.
  5. **Block ids can change meaning under a saved pattern.** Plan 14.2's OK edits a block everywhere. The spec decides whether a pattern notices (a fingerprint of the blocks it uses) or simply draws the edited block.
  6. **`.pokemap/` is treated differently by the two subjects.** The GBA subject ignores it (`.gitignore:1` `.*`), so a pattern file there is never committed; PerfPlus has no `.pokemap/` and does not ignore it, so the file shows as untracked. Sidecars are written by plain `writeFileSync` behind a hand-written shape guard (`core/src/world/sidecar.ts:33-93`), not by `writeFilesAtomically`; the spec says which writer the pattern file uses.
  7. **Placing a pattern must go through the existing paint routes.** Plan 14.2 put `refuseUnsavedBlockRefs` in every grid-writing path (`server/src/index.ts:947`, `gbcEditRoutes.ts:216`); a new "place" route that writes the grid itself skips it.
  8. **Tool keys are nearly used up.** P R B I S C G, K (Plan 14.2) and F are taken (`Toolbar.tsx:15`, `shared/useFitShortcut.ts:17`).
  9. **Selection state in the shell re-renders everything** (LESSONS, React: "Shell-level state re-renders everything below it"). The capture rectangle lives in the surface.
  10. **"Dropper-then-Pencil gave no stamp" on GBA is recorded and unconfirmed** (LESSONS, GBA / Porymap Quirks). Check it before building capture on the dropper path.
- **Breakdown (2026-11-15): needs a spec first.** Questions for the interview, each with a recommendation:
  1. File format: PokeMap-native or Porymap's prefab file. Recommendation: native; the subject's `prefabs_filepath` is empty and GBC has no Porymap.
  2. Whether the library is project data to commit or personal editor state (trap 6). Recommendation: project data, in a tracked path the spec names for each family.
  3. Capture gesture: a new Select tool, or a drag with the Dropper that fills the brush, plus "Save as pattern". Recommendation: the Dropper drag; it needs no new tool key and is how Porymap behaves.
  4. Whether events inside the captured area are copied. Recommendation: no.
  5. An incompatible pattern: hidden, or shown disabled with the reason. Recommendation: shown disabled.
  6. Placement at the map edge: clipped or refused. Recommendation: clipped, as stamps are today.
  7. Pattern management: rename and delete only. Recommendation: yes.
  8. The keyboard side of selection, decided with Plan H Task N (see "Order and overlap review").
  **Answered by the user 2026-11-16:** question 1 native format; question 2 project data, committed; question 3 the Dropper drag; question 8 one interview with Task N (D24a). Questions 4-7 are still open.
- **Provisional subtasks** (names and files; the spec may move them). All verify lines run from the repo root after `npm run typecheck`.

  | Id | What | Files | Tier | Verify | After |
  |---|---|---|---|---|---|
  | 14A-1 | One generic `paintCells`/`floodFill` | `packages/core/src/edit/paint.ts`, `packages/core/src/gbc/edit/paint.ts`, their tests under `packages/core/test/edit/` and `packages/core/test/gbc/` | High (shared engine) | `npx vitest run --no-file-parallelism packages/core/test/edit packages/core/test/gbc` | Plan H H1-H3 |
  | 14A-2 | Pattern model, compatibility check, file read and write with a shape guard | new `packages/core/src/world/patterns.ts`, `packages/core/src/config/paths.ts`, a test under `packages/core/test/world/` | Medium | `npx vitest run --no-file-parallelism packages/core/test/world` | 14A-1 |
  | 14A-3 | Pattern routes, one module mounted by both handlers (D23a) | new `packages/server/src/patternRoutes.ts` and its test; `packages/server/src/{index,gbcRoutes}.ts` | Medium | `npx vitest run --no-file-parallelism packages/server` | 14A-2; Plan H Task H |
  | 14A-4 | Capture gesture on the map surface, both families | `packages/ui/src/canvas/{MapSurface.tsx,mapSurfaceAdapter.ts}`, `gba/mapSurface.tsx`, `gbc/mapSurface.tsx`, `packages/ui/test/canvas/` | High (canvas core) | `npx vitest run --no-file-parallelism packages/ui/test/canvas` | 14A-1 |
  | 14A-5 | GBC palette multi-block selection | `packages/ui/src/gbc/GbcMetatilePalette.tsx`, its test | Medium | `npx vitest run --no-file-parallelism packages/ui/test/gbc` | 14A-1 |
  | 14A-6 | Pattern panel in the rail, shared, with family data through the adapter | new `packages/ui/src/shared/PatternPanel.tsx`; `shell/adapter.ts`, `gba/adapter.tsx`, `gbc/adapter.tsx` | Medium | `npx vitest run --no-file-parallelism packages/ui/test/shared packages/ui/test/shell` | 14A-3, 14A-4 |
  | 14A-7 | Live acceptance on scratch clones, both families | report | - | live report | all |
  | 14A-8 | Final review | - | - | reviewer per the `delegate` skill | 14A-7 |

### Plan 14B: terrain painting

- **Goal/scope:** after 14A, tileset-specific named brushes with thumbnails and editable tile assignments. First phase: water and paths with centers, inner/outer corners, narrow sections and junctions; painting and erasing repair neighboring edges, show a preview and form one undoable stroke. Define movement permissions per engine rather than silently retaining incorrect collision. Acceptance covers these shapes and erase repairs in both families. Later phase: forests and cliffs with explicit elevation, directional-ledge and terrain-transition rules; separately spec and verify that phase.
- **Risk/dependencies:** high (shared canvas, terrain rules and collision semantics); depends on Plans 12/14/14A and D17. Reuse brush selection/previews without making a large stamp library a prerequisite.
- **Traps and pitfalls (2026-11-15).**
  1. **GBC painting cannot set movement permissions.** A GBC block's collision is four `tilecoll` entries in the tileset's `*_collision.asm`, shared by every map (Plan 14.2 spec, "Data"); a GBA cell carries its own collision and elevation (`core/src/edit/paint.ts:3-8`). "Define movement permissions per engine" therefore means: a GBA brush role sets collision and elevation, a GBC brush role only chooses a block. The spec writes both rules down.
  2. **Ledges and water are block properties in both families.** GBA ledges are metatile behaviours in the tileset attributes; GBC ledges are collision types (`HI_NYBBLE_LEDGES`, PerfPlus `constants/collision_constants.asm:127`). The cliff phase cannot paint a ledge onto a block that does not have it; it needs blocks made in the Plan 14.2 editor first.
  3. **A tileset may not have every transition block.** Roles (centre, edges, inner and outer corners, narrow, junction) map to blocks that exist only if the tileset's author drew them. A brush with missing roles needs a stated fallback, or painting produces holes that no test on a complete fixture shows.
  4. **The neighbour-mask table is a hand-derived oracle.** That is a High trigger in `CLAUDE.md`: the fixtures are derived twice, independently, and the tests are mutation-checked.
  5. **Repairs touch cells the pointer never crossed.** A stroke is begin, queued applies, end (`ui/src/shared/useStrokeChain.ts`), and the hub applies a stamp to targets. The repair is one pure core function called by both hubs inside paint apply, so one implementation serves both families, the preview and undo.
  6. **The preview needs that core function in the browser.** The UI imports core by deep path and cannot bundle a module that imports `node:fs`; the terrain module stays free of node imports.
  7. **Brush definitions are tileset data.** They have Plan 14A's storage and identity questions (files, not names; where the file lives).
- **Breakdown (2026-11-15): needs a spec first.** Questions for the interview:
  1. Who authors a brush's role-to-block table: the user in an editor, or shipped defaults for the stock tilesets. Recommendation: the user, in a small table editor, with one worked example per family.
  2. The role set for phase one: 13 roles (centre, four edges, four outer and four inner corners) or the full 47. Recommendation: 13 plus the narrow and junction cases the roadmap names.
  3. What erasing paints (a per-brush base block). 
  4. Whether a brush overwrites cells under events. Recommendation: yes; events are not terrain.
  5. GBA: the collision and elevation each role writes, and whether the user can edit them per role.
  6. Which tilesets are the acceptance fixtures in each subject.
- **Provisional phases:** 14B-1 core terrain model and mask fixtures (High, oracle); 14B-2 repair inside paint apply in both hubs (High, shared engine); 14B-3 brush storage and routes, one module (Medium); 14B-4 brush table editor in the rail (Medium); 14B-5 brush tool and preview on the map surface (High, canvas core); 14B-6 live acceptance; 14B-7 final review. The cliff phase is a separate spec. Each phase is split to subtasks in the plan the spec produces.

### Plan 14C: create and connect adjacent maps

- **Goal/scope:** after 14B, select an existing map edge, choose dimensions/tileset and a blank fill or compatible template, slide a ghost preview to set offset, then create the map and validated reciprocal game connections. Acceptance: save/reload preserves the new map and connections in both families; failure leaves no partially created map or one-sided connection. Editor-only world placement is distinct from game connectivity.
- **Risk/dependencies:** high (multi-file subject-source writes and save ownership); depends on Plans 10/12/14B and D17. Bring reusable destination-map creation forward from Plan 17; no dependency on town-map editing/minimap. Verify writes on scratch projects.
- **Absorbed (D22, 2026-11-13):** the GBA side takes its requirements from Plan 3 Task 1 (connection offset from placement, round trip over the subject's 374 planar connections, one-way warning, `dive`/`emerge` kept apart), Task 9 (new map: the sibling key set, the golden `.inc` test, name refusals) and the create-layout part of Task 8 (`layout_version` chosen explicitly; only the keys siblings carry). Editing and removing an existing connection use the same machinery; whether they are in this plan is a spec question.
- **Traps and pitfalls (2026-11-15).**
  1. **Plan 3 Task 9's GBA file list is wrong for the subject.** `header.inc`, `events.inc` and `connections.inc` are build output, ignored by `data/maps/.gitignore:5-7`; only `map.json` and `scripts.inc` are tracked. Writing them breaks invariant I3 and the "golden `.inc` test" has no source. The GBA create set is `data/maps/<Name>/map.json` and `scripts.inc`, the `map_groups.json` and `layouts.json` entries, the layout's `map.bin` and `border.bin`, and one line no plan mentions: the `.include "data/maps/<Name>/scripts.inc"` in `data/event_scripts.s` (PetalburgCity's is line 107).
  2. **Generated headers are tracked in the subject.** `include/constants/map_groups.h` and `layouts.h` are made by the build (`map_data_rules.mk:33,38`) and are in git. PokeMap does not write them, so a new `MAP_*` name is absent from them until a build; name-collision checks read `map_groups.json`, not the headers.
  3. **The atomic writer cannot make a folder.** `writeFilesAtomically` creates a file when `before` is null (`core/src/write/atomic.ts:56`) but has no `mkdir`, and its rollback removes files only. A new map folder needs directory creation with rollback, built and tested before any planner.
  4. **GBC needs seven files and two of them are positional.** NewBarkTown appears in `maps/NewBarkTown.asm`, its `.blk`, `constants/map_constants.asm`, `data/maps/maps.asm`, `attributes.asm`, `blocks.asm` and `scripts.asm`. The order inside a group in `map_constants.asm` and `maps.asm` must match. No writer exists for any of the five shared files: a GBC save writes the `.blk`, the map's `.asm` and text replacements in constants files (`core/src/gbc/write/save.ts:206-218`).
  5. **A GBC connection is two edits per map.** `map_attributes NewBarkTown, NEW_BARK_TOWN, $05, WEST | EAST` carries the direction set, and each direction has a `connection west, Route29, ROUTE_29, 0` line (`data/maps/attributes.asm:100-102`). A reciprocal connection edits the neighbour's set and adds its line.
  6. **Both projects read the map list once.** GBA parses groups and layouts at open (`core/src/project.ts:115,122`); GBC reads four files at open (`core/src/gbc/load/map.ts:254-257`); neither has an invalidation call. After a create, the hub rebuilds the handler, which closes every session (`server/src/hub.ts:259-271`), so creation refuses while any map is dirty. This builds on Plan H Task G.
  7. **There is no session to stage into.** Sessions are keyed by a map that exists (`server/src/editSessions.ts:39`). Creation is a project-level plan and commit with its own fingerprint (Plan 10a3's rule), and it edits the neighbour's `map.json`, which an open session of that map may own.
  8. **Plan 14.1 sent return warps here and this section never said so.** Its spec, ruling A7: "The two-map version is built in Plan 14C". The dialog only warns today (`ui/src/shared/AddEventDialog.tsx:15-52`). The spec rules it in or out.
  9. **Existing conflicts are real data.** The GBA subject has 19 connection conflicts and Crystal has 2 (RESUME). "Validated reciprocal connections" validates the new pair; it does not refuse a project that already has conflicts.
  10. **`layout_version` is chosen, never defaulted,** and Porymap strips it on save (Plan 3 Task 8; LESSONS, Editing Sessions). A new layout entry carries only the keys its siblings carry.
  11. **Nothing here can be built on this machine.** `make`, `arm-none-eabi-gcc` and `rgbasm` are not installed (checked 2026-11-15; Plan 14.1 Task 9 says the same). "The game still builds" is the user's check, or the toolchain is installed first.
  12. **Byte-exact fixtures need `-text`** in `.gitattributes` (LESSONS, Delegation: "Golden fixtures need `-text`"), and every write test runs on a scratch copy (Plan 14.2 Task 0).
- **Breakdown (2026-11-15): needs a spec first.** Questions for the interview:
  1. Whether moving or removing an existing connection is in this plan. Recommendation: creating and connecting first; dragging an existing connection's offset as a second phase; removal later.
  2. Whether a new map can also be created as a warp destination (a door to a new interior), with the return warp (trap 8). Recommendation: yes as a second phase; it is the commoner case for houses and caves, and it is where A7 belongs.
  3. GBA: the map group of the new map, and whether it always gets a new layout. Recommendation: the neighbour's group; always a new layout.
  4. GBC: where the header fields come from (tileset, environment, landmark, music, palette, fishing group). Recommendation: copied from the neighbour, editable in the dialog.
  5. The starting contents: one fill block, or a copy of an existing map of this project. Recommendation: both, with the copy built so roadmap Plan 17 can reuse it (see "Order and overlap review").
  6. A neighbour with unsaved changes: refuse, or save together. Recommendation: refuse, naming the map.
  7. Whether a created map can be removed by the app. Recommendation: no; the preview lists every file before the write.
  8. Who runs the build check (trap 11).
  **Answered by the user 2026-11-16:** question 2 yes, a new map as a warp destination with its return warp is phase two; question 8 the toolchain is installed on this machine and the build is an acceptance check (D29). The `WorldSurface.tsx` hook extraction (Plan 16 subtask 16-1) is this plan's first UI task (D24c). Questions 1 and 3-7 are still open.
- **Provisional subtasks** (the spec may move them). Verify lines run from the repo root after `npm run typecheck`.

  | Id | What | Files | Tier | Verify | After |
  |---|---|---|---|---|---|
  | 14C-1 | Folder creation with rollback in the atomic writer | `packages/core/src/write/atomic.ts`, `packages/core/test/write/atomic.test.ts` | High (subject writes) | `npx vitest run --no-file-parallelism packages/core/test/write` | Plan H Task F |
  | 14C-2 | Handler rebuild after a structural write, refused while any map is dirty | `packages/server/src/hub.ts`, `packages/server/test/hub.test.ts` | High (session ownership) | `npx vitest run --no-file-parallelism packages/server/test/hub.test.ts` | Plan H Task G |
  | 14C-3 | GBA connection offset from placement and its inverse, round trip over the subject's planar connections | new `packages/core/src/edit/connections.ts` and test | High (numeric oracle) | `npx vitest run --no-file-parallelism packages/core/test/edit` | - |
  | 14C-4 | GBC connection maths and a lossless `attributes.asm` patcher | new `packages/core/src/gbc/edit/connections.ts`, `packages/core/src/gbc/write/attributesPatch.ts` and tests | High (parsing, subject writes) | `npx vitest run --no-file-parallelism packages/core/test/gbc` | - |
  | 14C-5 | GBA new-map planner (trap 1's file set, sibling key set, name refusals) | new `packages/core/src/edit/newMap.ts` and test | High (subject writes) | `npx vitest run --no-file-parallelism packages/core/test/edit` | 14C-1, 14C-3 |
  | 14C-6 | GBC new-map planner (trap 4's file set) | new `packages/core/src/gbc/edit/newMap.ts` and test | High (subject writes) | `npx vitest run --no-file-parallelism packages/core/test/gbc` | 14C-1, 14C-4 |
  | 14C-7 | Create routes: plan and commit with a fingerprint, one module for both families | new `packages/server/src/mapCreateRoutes.ts` and test; `packages/server/src/{index,gbcRoutes}.ts` | High (hub I/O, save ownership) | `npx vitest run --no-file-parallelism packages/server` | 14C-2, 14C-5, 14C-6 |
  | 14C-8 | Edge pick and ghost preview on the world surface | `packages/ui/src/canvas/{WorldSurface.tsx,worldSurfaceAdapter.ts}`, `gba/worldSurface.tsx`, `gbc/worldSurface.tsx`, `packages/ui/test/canvas/` | High (canvas core) | `npx vitest run --no-file-parallelism packages/ui/test/canvas` | the WorldSurface hook extraction (see "Order and overlap review") |
  | 14C-9 | Create dialog, shared, with family field specs | new `packages/ui/src/shared/CreateMapDialog.tsx`, `gba/createMapFields.ts`, `gbc/createMapFields.ts`, `shell/adapter.ts` | Medium | `npx vitest run --no-file-parallelism packages/ui/test/shared` | 14C-7 |
  | 14C-10 | Live acceptance on scratch clones, both families | report | - | live report | all |
  | 14C-11 | Final review | - | - | reviewer per the `delegate` skill | 14C-10 |

  A conductor hands off after 14C-6 and after 14C-9.

### Plan 15: town map editor (#9)

- **Goal:** edit the in-game region map: map-section boundaries and names, fly points, tile graphics (D14).
- **Scope:** per-engine loaders and writers behind the adapter (GBA `src/data/region_map/`; Crystal's town map data and
  pokegear graphics); a region-map view in the shell with three tools (section paint, fly-point placement, tilemap paint
  with PNG round trip). Likely two or three phases: data model and read-only view, then each editing tool.
- **Order:** after Plan 14C (D17).
- **Risk:** high. Two unfamiliar formats; graphics writes. Spec must first measure both formats in the subject decomp and
  pokecrystal-PerfPlus.
- **Depends on:** D14.
- **Absorbed (D22, 2026-11-13):** Plan 3 Tasks 4-5 are the GBA requirements: the key-preserving loader (`map_section`
  or `id`, whichever the file has), the glob over `region_map_sections*.json`, the Inja-template contract, the
  regression test named for the 2026-08-18 build failure, and a successful `make` after an edit as acceptance.
- **Before it starts (D21):** Plan H Task N (layout and keyboard access), so the new view is built on the finished
  layout rules.
- **Traps and pitfalls (2026-11-15).**
  1. **The GBA region map is five kinds of file, and the JSON is the smallest part.** In the subject: `region_map_sections.json` with its template (build input, `json_data_rules.mk:10-11`); the per-cell section grids as C arrays in `region_map_layout.h`, `_hoenn.h`, `_johto.h` and `_jk.h`; hand-written entry headers `region_map_entries_johto.h` and `_jk.h`; and the art in `graphics/pokedex/` (`region_map.png`, `.pal`, the tilemap `region_map.bin`, `johto_region_map.*`, `region_map_affine.*`). The path `graphics/pokenav/region_map*` named elsewhere does not exist there. "Section boundaries" means writing a C array, and PokeMap's only C writer splices `#define` lines (`core/src/addEvent/gbaBuild.ts:38,112-129`).
  2. **`region_map_sections_johto.json` has no build rule.** No makefile, C file or template in the subject names it. Plan 3 Task 4's glob would build an editor for a file the game may never read; the measurement step settles whether it is live.
  3. **PokeMap already reads a build output here.** `core/src/signs/linked.ts:33` takes section names from `region_map_entries.h`, which the subject ignores (`src/data/.gitignore:2`) and the build generates. After a name edit in the JSON, linked signs read the old name until a build. This plan moves that reader to the JSON or records why not.
  4. **Crystal has no section boundaries.** A landmark is a point and a name (`data/maps/landmarks.asm:1-12`); a fly point is a landmark and spawn pair (`data/maps/flypoints.asm:1-12`); the tilemaps are `gfx/pokegear/johto.bin` and `kanto.bin`, 361 bytes each, over `town_map.png` and `town_map_palette_map.asm`. D14's first tool has no GBC counterpart. The interview rules what GBC gets (landmark position and name), so no task discovers it.
  5. **No indexed PNG writer exists.** Core has a 2-bit grey writer for GBC sheets (`core/src/blockEdit/gbcSheet.ts:23`) and the CLI an RGBA one (`cli/src/png.ts:53`). The GBA art is built to 8bpp. If "tile graphics" means tilemap arrangement, only the `.bin` writers are needed; if it means pixels, this plan needs Plan 3 Task 6's writer first.
  6. **A fourth view compiles without being handled.** `Mode` is `"map" | "world" | "dungeon"` (`ui/src/shell/adapter.ts:10`) and the shell switches on it with ternaries (`shell/FamilyApp.tsx:257-273`), so a new mode falls into the dungeon branch silently. The adapters gate their hooks on it (`gba/adapter.tsx:30-31`, `gbc/adapter.tsx:30-32`) and `FamilyRuntime` has one render slot per mode (`adapter.ts:76-78`). The first UI task adds an exhaustive check.
  7. **Edits here belong to no map session.** The save-or-discard prompt (D1) is wired to the selected map's session (`FamilyApp.tsx:79-93`). Region-map edits need their own staged state, plan, fingerprinted commit and leave prompt, the same shape Plan 14C builds for map creation.
  8. **A name change reaches the signs.** Linked signs take their text from these names and a sign that cannot refresh blocks every save of its map (Plan 10a ruling S10a). Names are limited by the game's charmap and a length the measurement step records for each engine.
  9. **The acceptance "a successful `make`" cannot be run on this machine** (no toolchain, checked 2026-11-15).
- **Breakdown (2026-11-15): needs a measurement step and a spec first.** Questions for the interview:
  1. Whether "tile graphics" (D14) is tilemap arrangement or pixel editing. Recommendation: arrangement, plus opening the PNG in the user's editor.
  2. GBA: which of Hoenn, Johto and JK are live in the subject's game, and which file wins when the layout grid and the JSON entry disagree.
  3. GBC: landmark position and name as the counterpart of sections (trap 4).
  4. Fly points: move and reassign existing ones only, or add new ones (new constants and engine tables). Recommendation: existing only.
  5. Whether a new section or landmark can be created. Recommendation: no in the first version (Plan 3 Task 5 reported it and did nothing).
  6. Who runs the build check.
  7. Whether this plan splits into 15a (loaders and a read-only view) and 15b (the tools), so Plan 16 can start after 15a (see "Order and overlap review").
  **Answered by the user 2026-11-16:** question 1 both: the goal is full customisation, pixel editing included (D26), so trap 5's writer is needed and is shared with Plan 3 Task 6 (D27); question 6 the toolchain is installed here (D29); question 7 yes (D24b). Question 5 needs asking again in the interview: a new region usually has a different set of towns, so creating and removing sections or landmarks is probably needed; the recommendation changes to yes. Questions 2-4 are still open.
- **Provisional phases:** 15-0 measure both formats in both subjects and the reference engines, written into the spec (docs); 15-1 GBA loaders, key-preserving (High, parsing); 15-2 GBC loaders (High, parsing); 15-3 read routes, one module (Medium); 15-4 the fourth view, read-only, both families (High, shell); 15-5 one lossless writer per file kind per family, each with its corpus-gate case (High, subject writes); 15-6 staged edits, plan, commit and leave prompt (High, save ownership); 15-7 the tools; 15-8 live acceptance; 15-9 final review. A conductor hands off after 15-4 and after 15-6.

### Plan 16: town-map minimap (#8)

- **Goal:** a minimap in the lower-right of the world view, drawn from the town map art, highlighting the area in view.
- **Scope:** map world coordinates to region-map squares through map sections; viewport highlight that follows pan and
  zoom; both families through the canvas core.
- **Order:** after Plan 15 (needs its loaders, D13).
- **Risk:** medium. The world-to-region mapping is approximate (the world layout is PokeMap's, the town map is the
  game's); the spec decides how a map with no section renders.
- **Depends on:** D13.
- **First task (D21, 2026-11-13):** extract the warp fetch, the encounter fetch and the lens overlays from
  `canvas/WorldSurface.tsx` (934 lines) as hooks, before the minimap is added to that surface.
- **Traps and pitfalls (2026-11-15).**
  1. **The extraction is a canvas-core change.** The warp fetch is `canvas/WorldSurface.tsx:484-608`, the encounter fetch `:313-353`, the lens overlays `:355-367` and `:805-863`. It is High tier, moves no behaviour, and its oracle is the existing `packages/ui/test/canvas/` tests with none edited.
  2. **Never remount the world canvas to add the minimap** (LESSONS, React: "Never remount a heavy canvas to add chrome around it"). The minimap is mounted in every state and drawn on its own canvas from a view ref; a highlight held in React state re-renders the surface on every pan frame (Plan 6c deferral: "an open lens list re-renders with every pan frame").
  3. **The two families map to the town map differently.** A GBA map names a section, and sections are cells; a Crystal map names a landmark (`data/maps/maps.asm`, fourth argument of `map`), and a landmark is a point. The GBA highlight is a set of cells; the GBC highlight is a set of points or a box around them.
  4. **One view can span regions.** The GBA subject has three region layouts, and Kanto and Johto are separate world components in Crystal (RESUME, GBC facts). The spec says which art shows when the view spans two.
  5. **It needs Plan 15's loaders only,** not its tools.
- **Breakdown (2026-11-15).** Questions for the spec: a map with no section; a view spanning regions; whether a click on the minimap moves the view (recommendation: yes); whether it shows in Dungeon mode (recommendation: no); its size and a toggle.

  | Id | What | Files | Tier | Verify | After |
  |---|---|---|---|---|---|
  | 16-1 | Warp fetch, encounter fetch and lens overlays as hooks | new `packages/ui/src/canvas/{useWorldWarps,useWorldEncounters,useLensOverlays}.ts`; `canvas/WorldSurface.tsx` | High (canvas core) | `npx vitest run --no-file-parallelism packages/ui/test/canvas` | nothing else holding `WorldSurface.tsx` |
  | 16-2 | World-to-town-map mapping, one pure function per family | new `packages/core/src/world/regionView.ts`, `packages/core/src/gbc/world/regionView.ts` and tests | High (numeric oracle) | `npx vitest run --no-file-parallelism packages/core/test/world packages/core/test/gbc` | Plan 15 loaders |
  | 16-3 | Minimap component and its adapter members | new `packages/ui/src/canvas/Minimap.tsx`; `canvas/{WorldSurface.tsx,worldSurfaceAdapter.ts}`, `gba/worldSurface.tsx`, `gbc/worldSurface.tsx` | High (canvas core) | `npx vitest run --no-file-parallelism packages/ui/test/canvas` | 16-1, 16-2 |
  | 16-4 | Live acceptance, both families | report | - | live report | 16-3 |
  | 16-5 | Final review | - | - | reviewer per the `delegate` skill | 16-4 |

### Plan 17: copy maps between games (#10)

- **Goal:** copy a map from one loaded game to another of the same family (D15).
- **Scope:** everything travels: layout, blocks, border, events, warps, scripts, encounters; a tileset missing in the
  destination is copied too. Warps whose targets do not exist in the destination are flagged. Multi-map copy (a whole
  dungeon) is in the spec's scope question, not assumed.
- **Order:** after Plan 16.
- **Risk:** high. Writes many files into a second project (GBA: map/layout JSON, `scripts.inc`, encounters JSON, tileset
  directories and their C headers; GBC: `.blk`, `.asm`, constants, attributes, tilesets). Name and constant collisions,
  save safety across two corpora; never test against the real subject without a scratch copy.
- **Depends on:** D15, D17 and Plan 14C's reusable destination-map creation machinery; retain the full D15 copy scope.
- **Traps and pitfalls (2026-11-15).**
  1. **The hub holds one project.** `server/src/hub.ts:181` is a single `current` handler; `POST /api/hub/open` replaces it and refuses while maps are dirty (`:252-271`). "One loaded game to another" needs a second, read-only project opened beside it. Make the open project the destination, so every write stays under the root that Plan H Task F checks.
  2. **A GBA tileset is defined in C.** Copying a missing one means adding entries to `src/data/tilesets/headers.h` and the graphics and metatile tables beside it, and PokeMap can only splice `#define` lines (`core/src/addEvent/gbaBuild.ts:38,112-129`). D15 says the tileset is copied; this is the largest unknown in the plan and the interview takes it first.
  3. **Scripts name things the destination may lack.** Flags, vars, trainers, items, species, texts, movement labels and other maps. The symbol index (`server/src/projectSymbols.ts`; Plan 10b checks C7-C9) can list what is undefined in the destination; the spec decides what is flagged and what is created (Plan 14.1 has free-slot rules for flags and vars only).
  4. **"Same family" is not "same engine".** The reference GBA engines differ in attribute width and fields, and split detection has an open gap on `pokeemerald-expansion` (RESUME, open items). The subject is a three-region project with per-layout `layout_version`, so a copied GBA map needs a version chosen and its metatile ids read under the destination's split (invariant I1).
  5. **Encounters live in shared files.** GBA: one entry in `wild_encounters.json`, a build input with a template (`json_data_rules.mk:4-5`). GBC: blocks in `data/wild/*.asm` plus a fishing group shared with other maps. Each needs a writer this plan or Plan 3 Task 3 builds, whichever comes first.
  6. **GBC map tables are positional,** as in Plan 14C trap 4; this plan fills a map created by Plan 14C's planner and adds no second way to register one.
  7. **Two corpora, two scratch copies.** Every test and the live check run on scratch copies of both projects (Plan 14.2 Task 0); a GBC warp's `destWarp` is a 1-based position (RESUME, GBC facts), so warps into maps that were not copied are flagged, never renumbered.
- **Breakdown (2026-11-15): needs a spec first.** Questions for the interview:
  1. Which side is open: copy into the open project from a second one picked in the dialog (recommended), or out of it.
  2. GBA tileset copy in the first version (trap 2): written by PokeMap, or refused with the list of manual steps. Recommendation: refused with the list in the first version, and D15 amended to say so.
  3. Missing symbols: flag only, or create flags and vars through the Plan 14.1 slot rules. Recommendation: flag only.
  4. Whether a copy between two different GBA engines is allowed. Recommendation: same engine profile only.
  5. Several maps at once (a dungeon). Recommendation: one map first; several as a later phase.
  6. Encounters whose species the destination lacks: dropped with a notice, or the copy refused.
  **Answered by the user 2026-11-16 (D31):** question 2, build the GBA tileset copy with two refusals: a tileset whose header has an animation callback (that is engine code, not data), and a secondary tileset whose paired primary is neither in the destination nor copied with it (its metatiles index the primary's tiles and palettes). The build check (D29) is its acceptance. Phase 17-5 is in scope for both families. Questions 1 and 3-6 are still open.
- **Provisional phases:** 17-1 second read-only project in the hub (High, hub I/O); 17-2 what a map depends on, per family (High, parsing); 17-3 the missing-and-colliding report against the destination (High, oracle); 17-4 fill a Plan 14C created map with copied content, per family (High, subject writes); 17-5 tileset copy per family, per the ruling (High); 17-6 the copy dialog, shared (Medium); 17-7 live acceptance on two scratch corpora per family; 17-8 final review.

### Plan 17A: walking preview

- **Goal/scope:** immediately after Plan 17, a shared 2D player walking preview using each engine's movement/collision rules and connected-map transitions. Acceptance: walkable/blocked terrain, supported ledges/elevation and crossings agree with independently checked engine fixtures in both families. Surface unsupported rules; the preview does not replace in-game testing. 3D rendering and full game emulation are outside this plan.
- **Risk/dependencies:** high (movement correctness may look plausible while wrong); depends on Plans 12/14/14B/14C/17 and D18. Verify representative terrain and map seams, including the later cliff phase when supported.
- **Traps and pitfalls (2026-11-15).**
  1. **The walk grid differs by family.** GBA collision and elevation are per cell in the blockdata and the behaviour comes from the metatile (the map payload already resolves it per block, `server/src/index.ts:407-414`). GBC collision is four quadrants per block from the tileset's `*_collision.asm`, so the player steps on a grid twice as fine as the block grid (LESSONS, GBA / Porymap Quirks: "GBC event steps divide by two into block units").
  2. **The fixtures are the oracle, and they are hand-derived.** That is a High trigger. Follow the encounter atlas: every rule cites the engine source by file and line (RESUME, GBC facts: "every probability is derived from engine asm"). The sources are PerfPlus `engine/overworld/player_movement.asm` with `constants/collision_constants.asm` and `data/collision/collision_permissions.asm`, and the GBA engine's player-avatar and object-movement code.
  3. **A plausible stepper passes a casual look.** GBA elevation has special values and bridges; ledges are one-way; water needs Surf. The spec lists each rule as supported or shown as unsupported, and the acceptance names a map in each subject for each supported rule.
  4. **An animated preview does not fit the redraw-on-change surfaces.** Player position kept in shell state re-renders everything under it (LESSONS, React). The preview draws on its own overlay canvas from a ref.
  5. **Arrow keys are wanted twice.** Plan H Task N may give them to a cell cursor. The preview is a mode that owns them while it is on.
  6. **No code here depends on Plan 17.** It needs collision data, connections (Plan 14C's maths) and, for cliffs only, Plan 14B's later phase. Its place after Plan 17 is D18's order, not a dependency.
- **Breakdown (2026-11-15): needs a spec first.** Questions for the interview: which player states can be switched (walking, running, bike, Surf); whether object events block the player; whether a warp is followed or only shown; Map view only, or the world view too; an animated step or an instant move. Recommendation for the first version: walking and Surf, objects block, warps shown and not followed, Map view only, instant move.
- **Provisional phases:** 17A-1 the rule list with citations and the fixtures, per family (High, oracle); 17A-2 a pure GBA stepper in core (High); 17A-3 a pure GBC stepper (High); 17A-4 crossing a connection, both families (High); 17A-5 the preview mode on the map surface (High, canvas core); 17A-6 live acceptance; 17A-7 final review.

### Plan 18: HexManiacAdvance triage (#7)

- **Goal:** rate each HMA feature listed in #7 and split the keepers into issues.
- **Scope:** for each feature: fit with PokeMap's decomp-first model (HMA edits ROMs), engine coverage, cost; keepers become
  issues mapped to Plan 3 (GBA data editors) or adapter features. No implementation.
- **Order:** independent; can run any time as a short docs-only session (D18).
- **Risk:** low.
- **Depends on:** D16.
- **Traps and pitfalls (2026-11-15).**
  1. **The feature list is not in the repository.** It is the body of issue #7: 21 checklist items in six groups (data, map, text, image and code editing, utilities). The session reads it with `gh issue view 7 --repo itnevres/pokemap`.
  2. **"Map the keepers to Plan 3" points at a plan that was reduced.** Several items are already built or planned elsewhere: editing maps, events and warps (Plans 2, 7, 14.1) and connections (Plan 14C); the town map (Plan 15); trainers (the future plan below); event scripts shown as controls (the Sign tool, Add Event, and Plan 5 section 1); jumping between related maps (Plan 13). The table names the plan that owns each, and "already done" is a valid rating.
  3. **HexManiacAdvance edits GBA ROMs.** Every keeper needs a line on what it means for Crystal, because the goal is one feature in both families.
  4. **The result has two homes and neither is a new file.** The rating table goes into this section (`CLAUDE.md`: no new decision documents); the keepers become GitHub issues, and creating issues is the user's go-ahead on the finished list.
- **Subtasks (2026-11-15).** 18-1: read the issue, rate each item (fit with the decomp-first model, both families, cost, owning plan), and write the table here. Docs only, Low, one session. 18-2: the user reviews the table. 18-3: after the go-ahead, create one issue per keeper and add a pointer in the owning plan. The check for 18-1 is that all 21 items have a row.

### Future plan (unnumbered): create new trainers

Scope from the open item below (user, 2026-11-02): create a trainer and its party from the Add Object popup, in both families. Plan 14.1 (ruling A8) places existing trainers only. It is not yet placed in the execution order.

- **Traps and pitfalls (2026-11-15).**
  1. **The GBA subject keeps trainers in three C files.** `src/data/trainers.h` (one struct per `[TRAINER_X]`), `src/data/trainer_parties.h` and `include/constants/opponents.h`; there is no `trainers.party`. PokeMap's only C writer splices `#define` lines (`core/src/addEvent/gbaBuild.ts:38,112-129`), so struct and array insertion is new, and a new id also moves the trainer count and the trainer flags that follow from it. The spec measures how ids are allocated before any writer is planned.
  2. **PerfPlus parties are not pret's format.** A party starts `db "FALKNER@", TRAINERTYPE_VARIABLE` and holds one sub-party per badge count, ended by `db $fe` (`data/trainers/parties.asm:23-31`). The reference corpus is pret (`3bc8daa`), so a parser proven on one is unproven on the other.
  3. **A GBC trainer's id is its position.** The name in `constants/trainer_constants.asm` and the party in `parties.asm` must sit at the same place inside the class group. A new class also needs a row in ten more tables under `data/trainers/` (attributes, class names, DVs, music, genders, palettes, pointers, pics, sprites).
  4. **The dialog already has the seam.** The trainer field is a plain select (`ui/src/gba/addEventFields.ts:27`, `gbc/addEventFields.ts:22`); flags, scripts and texts use the "Use existing / Copy from / New" modes (`shared/AddEventDialog.tsx:266-273`). "New trainer" adds modes to that field and a party editor under it; it is not a second dialog.
  5. **A party editor needs lists the options payload lacks.** Moves and items are parsed nowhere yet; trainers come from `opponents.h` (`core/src/addEvent/gbaOptions.ts:129-130`) and `trainer_constants.asm` (`gbcOptions.ts:16-24`). The payload grows, and it is cached per entry point (Plan 14.1 fix L2), which the new lists must respect.
  6. **These are shared files with one owner at a time** (Plan 14.1's rule for constants headers; Plan 14.2's for tileset files, `server/src/blockEditOwnership.ts`). A staged new name must not rebuild the merged options on every load: that froze the page once (Plan 14.1, W1).
  7. **Generated C and asm cannot be assembled on this machine** (no toolchain; Plan 14.1 deferred "no assembly in tests" as M8). A struct with a syntax error passes every test here.
- **Breakdown (2026-11-15): needs a measurement step and a spec first.** Questions for the interview:
  1. Create only, or also edit an existing trainer's party (issue #7 lists trainer editing). Recommendation: create by copying an existing trainer and editing the copy; editing existing trainers as a later phase.
  2. Whether a new trainer class can be made. Recommendation: no.
  3. GBC on PerfPlus: one fixed party, or a party per badge count (trap 2). Recommendation: one fixed party in the first version, with the variable form shown as unsupported.
  4. GBA: which party features the form offers (held items, custom moves). Recommendation: what the copied trainer's own struct uses.
  5. Rematch sets (`JOEY1` to `JOEY5`). Recommendation: out of scope.
  6. Who runs the build check.
  **Answered by the user 2026-11-16:** questions 1-3 as recommended (create by copying an existing trainer; no new class; one fixed party on PerfPlus); question 6 the toolchain is installed here (D29), which also closes trap 7 once it is installed. It runs after Plan 14A (D24f) and after Plan 18's table (D24d). Questions 4 and 5 are still open.
- **Provisional phases:** T-0 measure both subjects and the reference engines (docs); T-1 GBA readers for the three files, lossless (High, parsing); T-2 GBA id allocation and patchers (High, subject writes); T-3 GBC readers (High); T-4 GBC patchers (High); T-5 moves and items in the options payload, both families (Medium); T-6 the new files in the save set under the owner rule (High, save ownership); T-7 the dialog field and party editor (Medium); T-8 live acceptance; T-9 final review.

## Order and overlap review (2026-11-15)

From the plan review of 2026-11-15. **Status 2026-11-16: the user confirmed all six proposed order changes below; they are decision D24 and the execution-order line carries them.** The items under "Overlaps checked" are still proposals unless a decision D25-D29 covers them. D21's "Plan H batches H1-H3 before Plan 14A" is user-confirmed and stays.

**The order holds:** H1-H3, 14A, 14B, 14C, 15, 16, 17, 17A, with Plan 18 independent. The checks below found dependencies the order already satisfies and six places to adjust.

**Proposed changes to the order.**
1. **Plan H Task N's keyboard half moves before Plan 14A's spec.** D21 puts Task N before Plan 15, but Task N says its cell cursor is decided "together with Plan 14A's rectangular selection", and Plans 14A, 14B and 14C each add a pointer gesture to the map or world canvas. Proposal: one interview for Task N and Plan 14A; the map-canvas keyboard work (N, finding U3) is built with or just before Plan 14A; the responsive layout and theme parts (U1, U4, with Task O) stay before Plan 15.
2. **Plan 15 splits into 15a (loaders and a read-only town-map view) and 15b (the three tools); Plan 16 needs 15a only.** The minimap reads the town map and never edits it. Plan 16 can follow 15a and run before or beside 15b.
3. **The WorldSurface extraction moves from Plan 16 to the first plan that adds to that file.** Plan 14C's ghost preview is drawn on `canvas/WorldSurface.tsx` (934 lines) two plans before Plan 16 splits it. Proposal: do the extraction (Plan 16, subtask 16-1) as Plan 14C's first UI task, or in Plan H batch H3 with the other structure moves.
4. **Plan 18 runs early.** It is one docs session, and its table decides scope for the trainers plan (issue #7 lists trainer editing), Plan 3's remainder and Plan 5 section 1. Proposal: run it before any of those three is specced.
5. **Plan 17A is tied to Plan 17 by D18 only.** No code depends on the copy feature; it needs Plan 14C's connection maths and, for cliffs, Plan 14B's later phase. Proposal: record it as "any time after Plan 14C" so it can swap with Plan 17 if the user wants it sooner. No move proposed.
6. **The trainers plan and Plan 3's Tasks 2 and 3 get a slot.** The trainers plan extends the Add Event dialog and the save set, so it must not run beside a plan holding `core/src/addEvent/`, `ui/src/shared/AddEventDialog.tsx` or the save funnel; after Plan 14A is the first clean slot. Plan 3 Task 2 (map header) on GBC needs a `maps.asm` line patcher and the project refresh that Plan 14C builds; proposal: Plan 3 Tasks 2 and 3 run after Plan 14C, as one plan for both families.

**Overlaps checked, and what to do about each.**
- **Plan 3 Tasks 6-8 against Plan 14.2's block editor.** Writing `metatiles.bin` and `metatile_attributes.bin` is done (Plan 14.2 Tasks 4 and 8, `51225cf` and `025b8e5`). Composition, behaviour, layer type, the usage warning and cache invalidation are built in core and hub (Tasks 5-9) and their UI is Tasks 11-14; all of it merged via [#32](https://github.com/itnevres/pokemap/pull/32) → `9d14637` (2026-11-21). Proposed: delete those requirement bullets now that Plan 14.2 has merged (marked superseded in Plan 3 today); merge the PNG and `.pal` writers of Task 6 into the feature that first needs them; decide by interview whether tile-pixel and palette editing is built at all or handed to an external editor; move the FireRed attribute fields to a small follow-up on the block editor's field spec, or drop them, since no subject is FireRed.
- **Plan 5 section 3 (day/night) against GBC time of day.** The control and the whole GBC path exist: Morn/Day/Nite behind `capabilities.timeOfDay` (`ui/src/gbc/adapter.tsx:152-160`, `shell/adapter.ts:20`), `time` through the GBC renderer (`core/src/gbc/render/map.ts:310`) and the render cache. What is left is the GBA side: a palette mode in the GBA renderer and in every GBA cache key (`pngCache` is keyed `name:border`, `server/src/index.ts:137`), and the capability switched on. The section's "what Plans 1-4 do" and its "time-of-day control" bullet are out of date; marked in Plan 5.
- **Plan 4 Task 4 (git) against Plan 10a3 and Plan H Task F.** No conflict with Task F. Against 10a3: the fingerprint covers file entries (`core/src/write/atomic.ts:97`), not refusals, so a tree that turns dirty between preview and commit is not caught by it; the dirty check runs again at commit, in both hubs. "Extend `save.ts`" names one of two save modules and neither commit route. And `refuseDirtyTree` as written refuses every save for this user: the GBA subject always carries the user's own uncommitted lines (RESUME, External baselines) and PerfPlus does not ignore `.pokemap/`. Proposed rewrite in Plan 4. **Ruled 2026-11-16: Plan 4 Task 4 is cancelled (D33).**
- **Plan 4 Task 3 (MCP) and Task 1 (Electron) against the two-family hub.** Task 1's project picker and recent list exist in the hub (Plan 6c Phase A, `a16b604`; `server/src/recent.ts`, `ui/src/hub/`). The hub serves no static files and its port is fixed (`server/src/serve.ts:70`), so Electron needs a hub change first. Task 3's tool table names commands that were renamed or exist in one family only (`cli/src/index.ts`: `validate` and `indicator` are GBA only, `event` is GBC only, `sign` is gone), and MCP writes go around the hub's sessions and caches. Both marked in Plan 4. **Ruled 2026-11-16 (D32): the launcher first; Electron deferred.**
- **Plan H Task N against Plans 14A and 15.** Proposal 1 above.
- **Plan H Tasks H and I against the routes Plans 14A-17 add.** Holds: H3 finishes before 14A. One rule to add to D23a when the user confirms: a new route module takes only the values it reads, as `(req, url, send) => boolean`, and is not handed the whole `GbaRouteContext`; otherwise that context becomes the new 1,065-line dependency.
- **Plan H Task G against Plans 14C, 15, 3 and 4.** Holds by order (H2). Every plan that writes a file read once at project open (map groups, layouts, GBC `maps.asm` and `map_constants.asm`, encounters, region map) depends on Task G's invalidation; each such plan's spec lists the caches it must clear.
- **Plan 17's map copy against Plan 14C's map creation.** One planner, two sources. Plan 14C's "compatible template" is a copy of a map of the same project; Plan 17 is the same copy from another project, plus dependency checks and the tileset. Proposed: Plan 14C's planner takes full content (blocks, border, events, scripts) from the start, and Plan 17 adds no second way to register a map.
- **Plan 16's first task against Plan H.** Proposal 3 above.
- **The trainers plan against Plan 14.1's dialog.** An extension of the same field mechanism, not a new dialog (its trap 4). It overlaps issue #7's trainer editing; proposal 4.
- **Plan 4 Task 2 (CI) against Plan H Task P2.** Same folder, `.github/workflows/`, which does not exist yet. P2 first; the release job is added to it.
- **Plan 4 Task 6's render cache against the gate.** A cache under the project's `.pokemap/cache/` adds files to both subjects on every render, which the gate reads as damage ("subjects unchanged") and Task 4 reads as a dirty tree. Proposed: `~/.pokemap/cache/<project>` beside `recent.json`.
- **Plan 5 section 5 against Plan 14.1.** Secret-base bg events can be created (`core/src/addEvent/gbaOptions.ts:131`; Plan 14.1, `3f4a762`). Weather triggers cannot: they are not an event kind, and the subject has them (`data/maps/Route119/map.json` has 21). Marked in Plan 5.

## Open items for the user

- Closed: the #5/#6 work landed as Plan 13, merged via #30 (2026-11-02).
- Plan 3 (GBA data editors) stays outside this roadmap in its reduced form (D22: Tasks 2 and 3 and the reduced 6-8);
  Plan 18 may feed it. The GBA follow-ups A-C are now part of Plan H (D21).
- **Confirmed by the user (2026-11-13):** Plan H's batches H1-H3 run before Plan 14A (D21's order). This part of D21 is
  now binding.
- **For the user to confirm or overrule (2026-11-13):** the rest of D21-D23 were made by Claude under the instruction
  to add the review gaps and adjust the plans. The one with the most effect: Plan 3's region-map, connection and
  new-map tasks now belong to Plans 15 and 14C (D22).
- **Future plan (user, 2026-11-02): create new trainers and their parties** from the Add Object popup, both families.
  Plan 14.1 (A8) only places trainers that already exist. Not yet numbered; schedule after Plan 14.2. Its traps,
  interview questions and phases are under "Future plan (unnumbered): create new trainers" above (2026-11-15).
- **For the user (2026-11-15):** the "Order and overlap review" above holds six proposed order changes and the overlap
  rulings; none is applied to D1-D23 or to the execution-order line until confirmed.
