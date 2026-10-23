# PokeMap roadmap: unified UI and the open issues (Plans 9-18)

Written 2026-10-14 from master `741132d`, after a GitHub issue review and a user interview. This is an outline, not an
implementation plan: each plan below gets its own spec and plan (superpowers:writing-plans) when it starts. Plan numbers
after 10 are provisional.

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

Execution order: **10 → 11 → 12 → 13 → 14 → 14A → 14B → 14C → 15 → 16 → 17 → 17A**; Plan 18 is independent. New entries are roadmap scope; each still needs its own spec and implementation plan.

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
- **Scope:** per Plan 8 Task 8's measurement (`task-reports/pokemap-plan-8-ui-engine-adapter/_archive/task-8-measurement.md`):
  zoom and status-strip JSX, the overlay toggles and legend bar, the lens overlay block, tile-version refetch, the
  small-tile cache, badge geometry. About 100-150 lines per pair.
- **Order:** after Plan 10 (the flags settle which toggles exist per family).
- **Risk:** low-medium. Pure extraction; the canvas tests must pass unchanged.
- **Depends on:** D9.
- **Carried from Plan 9 (user, 2026-10-15):** when the overlay toggles move out of the canvases, give GBA Map view's two
  "Collision" buttons distinct accessible names (the toolbar's Collision tool and the canvas's Collision overlay toggle,
  `MapCanvas.tsx` overlay group); tests currently scope by the "Tools" group to tell them apart. Plan 9 Task 8 ruling;
  final review minor m3 (`task-reports/pokemap-plan-9-family-shell/final-review.md`).
- **Candidates from Plan 10b (2026-10-23, not yet agreed; the user decides at brainstorming):** the deferred canvas and
  world minors in the Plan 10b spec, section "Deferred minors (after merge)" (T7b, Final fix, N1 groups), touch the code
  this plan moves. Fold them in only if the user picks them.

### Plan 12: shared canvas core

- **Goal:** one render and interaction layer for map and world canvases; the adapter supplies tile drawing, geometry and
  family overlays.
- **Scope:** render pipeline taking geometry plus family drawers; shared hit-testing, pan/zoom, LOD and tile caches, overlay
  layers (warps, lines, encounters, events). Fold in the 6c deferrals that live in the canvases (cramped world toolbar in
  context mode, blank refreshed tile until load, encounter tooltip clipping, gutter overlap at mid zoom).
- **Order:** after Plan 11.
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

### Plan 14: GBC editing gaps

- **Goal:** GBC Add Event and a GBC metatile-collision editor.
- **Scope:** Add Event for GBC objects, warps, coord and bg events, with the script-label scaffolding Crystal needs (D6).
  A collision editor in the rail for a metatile's collision data (D7); it edits tileset data, so the UI must say how many
  maps share the tileset before a save. Then drop the GBC flag-offs for Add Event and Collision.
- **Order:** after Plan 13.
- **Risk:** medium-high. New `.asm` text and tileset-wide writes (LESSONS: GBC Format & Engine Quirks).
- **Depends on:** D6, D7.

### Plan 14A: shared stamps and saved patterns

- **Goal/scope:** after Plan 14, rectangular selection in both families, capture a map area, preview/place exact arrangements, and save named patterns tied to compatible tilesets. Reuse existing stamp painting; keep pattern management small. Acceptance: both families can capture, save, reselect and place a pattern, reject incompatible tilesets, and undo a placement.
- **Risk/dependencies:** high (shared canvas interactions and edit-session behavior); depends on Plans 12/14 and D17. Stamps place exact arrangements; terrain brushes remain a separate tool.

### Plan 14B: terrain painting

- **Goal/scope:** after 14A, tileset-specific named brushes with thumbnails and editable tile assignments. First phase: water and paths with centers, inner/outer corners, narrow sections and junctions; painting and erasing repair neighboring edges, show a preview and form one undoable stroke. Define movement permissions per engine rather than silently retaining incorrect collision. Acceptance covers these shapes and erase repairs in both families. Later phase: forests and cliffs with explicit elevation, directional-ledge and terrain-transition rules; separately spec and verify that phase.
- **Risk/dependencies:** high (shared canvas, terrain rules and collision semantics); depends on Plans 12/14/14A and D17. Reuse brush selection/previews without making a large stamp library a prerequisite.

### Plan 14C: create and connect adjacent maps

- **Goal/scope:** after 14B, select an existing map edge, choose dimensions/tileset and a blank fill or compatible template, slide a ghost preview to set offset, then create the map and validated reciprocal game connections. Acceptance: save/reload preserves the new map and connections in both families; failure leaves no partially created map or one-sided connection. Editor-only world placement is distinct from game connectivity.
- **Risk/dependencies:** high (multi-file subject-source writes and save ownership); depends on Plans 10/12/14B and D17. Bring reusable destination-map creation forward from Plan 17; no dependency on town-map editing/minimap. Verify writes on scratch projects.

### Plan 15: town map editor (#9)

- **Goal:** edit the in-game region map: map-section boundaries and names, fly points, tile graphics (D14).
- **Scope:** per-engine loaders and writers behind the adapter (GBA `src/data/region_map/`; Crystal's town map data and
  pokegear graphics); a region-map view in the shell with three tools (section paint, fly-point placement, tilemap paint
  with PNG round trip). Likely two or three phases: data model and read-only view, then each editing tool.
- **Order:** after Plan 14C (D17).
- **Risk:** high. Two unfamiliar formats; graphics writes. Spec must first measure both formats in the subject decomp and
  pokecrystal-PerfPlus.
- **Depends on:** D14.

### Plan 16: town-map minimap (#8)

- **Goal:** a minimap in the lower-right of the world view, drawn from the town map art, highlighting the area in view.
- **Scope:** map world coordinates to region-map squares through map sections; viewport highlight that follows pan and
  zoom; both families through the canvas core.
- **Order:** after Plan 15 (needs its loaders, D13).
- **Risk:** medium. The world-to-region mapping is approximate (the world layout is PokeMap's, the town map is the
  game's); the spec decides how a map with no section renders.
- **Depends on:** D13.

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

- The #5/#6 work exists only as uncommitted changes in the main checkout. It waits until Plan 13. A WIP commit on
  `issues-5-6-warp-popups` (by the user, or on their say-so) would protect it from a lost working tree.
- Plan 3 (GBA data editors) and GBA follow-ups A-C stay outside this roadmap; Plan 18 may feed Plan 3.
