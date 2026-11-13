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

Execution order: **10 → 11 → 12 → 13 → 14 (14.1, 14.2) → H (batches H1-H3) → 14A → 14B → 14C → 15 → 16 → 17 → 17A**; Plan 18 and the rest of Plan H are independent. New entries are roadmap scope; each still needs its own spec and implementation plan.

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
- **Status:** 14.1 done (Tasks 1-10, final review approved, gate 4,416 / 1 env fail / 254 files) and merged via #31 → `3f4a762`. 14.2: spec approved 2026-11-10, plan `plans/2026-11-10-pokemap-plan-14-2-block-editor.md` (Tasks 0-16), in progress on local branch `plan-14-2-block-editor`; its task status is in RESUME (D23d).
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
- **Order:** batches H1-H3 after Plan 14.2 merges and before Plan 14A; the rest between later plans; Task N before
  Plan 15.
- **Risk:** high for the batches that touch write paths, sessions and the request boundary (each task carries its
  tier). The structure tasks are behaviour-preserving moves with the existing route tests as the oracle.
- **Depends on:** D21, D23; Plan 14.2 merged (shared files).

### Plan 14A: shared stamps and saved patterns

- **Goal/scope:** after Plan 14, rectangular selection in both families, capture a map area, preview/place exact arrangements, and save named patterns tied to compatible tilesets. Reuse existing stamp painting; keep pattern management small. Acceptance: both families can capture, save, reselect and place a pattern, reject incompatible tilesets, and undo a placement.
- **Risk/dependencies:** high (shared canvas interactions and edit-session behavior); depends on Plans 12/14 and D17. Stamps place exact arrangements; terrain brushes remain a separate tool.
- **Absorbed (D22, 2026-11-13):** Plan 5 §2 Prefabs is this plan's saved-pattern scope. Its first decision (a PokeMap-native file under `.pokemap/` or Porymap's prefab format) and its rule that collision and elevation travel with the pattern go to this plan's spec. First task: one generic `paintCells`/`floodFill` for both families (Plan H, "Folded into other plans", R4).

### Plan 14B: terrain painting

- **Goal/scope:** after 14A, tileset-specific named brushes with thumbnails and editable tile assignments. First phase: water and paths with centers, inner/outer corners, narrow sections and junctions; painting and erasing repair neighboring edges, show a preview and form one undoable stroke. Define movement permissions per engine rather than silently retaining incorrect collision. Acceptance covers these shapes and erase repairs in both families. Later phase: forests and cliffs with explicit elevation, directional-ledge and terrain-transition rules; separately spec and verify that phase.
- **Risk/dependencies:** high (shared canvas, terrain rules and collision semantics); depends on Plans 12/14/14A and D17. Reuse brush selection/previews without making a large stamp library a prerequisite.

### Plan 14C: create and connect adjacent maps

- **Goal/scope:** after 14B, select an existing map edge, choose dimensions/tileset and a blank fill or compatible template, slide a ghost preview to set offset, then create the map and validated reciprocal game connections. Acceptance: save/reload preserves the new map and connections in both families; failure leaves no partially created map or one-sided connection. Editor-only world placement is distinct from game connectivity.
- **Risk/dependencies:** high (multi-file subject-source writes and save ownership); depends on Plans 10/12/14B and D17. Bring reusable destination-map creation forward from Plan 17; no dependency on town-map editing/minimap. Verify writes on scratch projects.
- **Absorbed (D22, 2026-11-13):** the GBA side takes its requirements from Plan 3 Task 1 (connection offset from placement, round trip over the subject's 374 planar connections, one-way warning, `dive`/`emerge` kept apart), Task 9 (new map: the sibling key set, the golden `.inc` test, name refusals) and the create-layout part of Task 8 (`layout_version` chosen explicitly; only the keys siblings carry). Editing and removing an existing connection use the same machinery; whether they are in this plan is a spec question.

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

### Plan 17A: walking preview

- **Goal/scope:** immediately after Plan 17, a shared 2D player walking preview using each engine's movement/collision rules and connected-map transitions. Acceptance: walkable/blocked terrain, supported ledges/elevation and crossings agree with independently checked engine fixtures in both families. Surface unsupported rules; the preview does not replace in-game testing. 3D rendering and full game emulation are outside this plan.
- **Risk/dependencies:** high (movement correctness may look plausible while wrong); depends on Plans 12/14/14B/14C/17 and D18. Verify representative terrain and map seams, including the later cliff phase when supported.

### Plan 18: HexManiacAdvance triage (#7)

- **Goal:** rate each HMA feature listed in #7 and split the keepers into issues.
- **Scope:** for each feature: fit with PokeMap's decomp-first model (HMA edits ROMs), engine coverage, cost; keepers become
  issues mapped to Plan 3 (GBA data editors) or adapter features. No implementation.
- **Order:** independent; can run any time as a short docs-only session (D18).
- **Risk:** low.
- **Depends on:** D16.

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
  Plan 14.1 (A8) only places trainers that already exist. Not yet numbered; schedule after Plan 14.2.
