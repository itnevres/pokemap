# PokeMap roadmap: unified UI and the open issues (Plans 9-18)

> **Background, not a live plan.** The decisions are in [decisions.md](../decisions.md), and the order and every plan in the [README](../README.md); Plans H, 14A-19 have their own files. This file keeps the 2026-10-14 issue map and toolbar comparison, the notes for Plans 9-14, and the 2026-11-15 order-and-overlap review as they stood on 2026-11-21.

Written 2026-10-14 from master `741132d`, after a GitHub issue review and a user interview. This is an outline, not an
implementation plan: each plan below gets its own spec and plan (superpowers:writing-plans) when it starts. Plan numbers
after 10 are provisional. In-flight status lives in `RESUME.md` only; an entry here records status once, when its plan
merges (D23d).

**Goal (user, 2026-10-13):** GBA and GBC get the same UI/UX: the same buttons, layout, colouring and features. A feature
added once shows up in both; engine differences sit behind an adapter with capability flags.

## Issue map (open issues)

| # | Title (short) | Category | State on master | Where it goes |
|---|---|---|---|---|
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
  `specs/2026-10-16-pokemap-plan-10a-switch-and-signs-design.md`, plan `plans/archive/plan-10a-switch-and-signs.md`);
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

- **Status (2026-10-25):** specced and split; 12a merged via #27 (`58f7213`); housekeeping (handoff docs + `.claude` tooling) via #28 (`935d981`); 12b (WorldSurface) plan written 2026-10-26 (`plans/archive/plan-12b-world-surface.md`, 11 tasks, one plan per user; new rulings P12-4n..q in the spec), reviewed and approved by the user 2026-10-26; **implemented and reviewed 2026-10-28, merged via #29 (Plan 12 complete): one `WorldSurface` core for both families, hub world-tile pre-warm (P12-4w), live acceptance in both families, final review Codex `gpt-6-astra` Approved with fixes (2 Minor, fixed).** The 6c deferrals folded in here are closed: cramped world toolbar in context mode (toolbar wraps), refreshed tile kept until the new one loads, encounter tooltip clamped, no gutter overlap at mid zoom (P12-7). Spec `specs/2026-10-24-pokemap-plan-12-shared-canvas-core-design.md` (rulings P12-1..P12-8), plans `plans/archive/plan-12a-canvas-foundation-map-surface.md` and `plans/archive/plan-12b-world-surface.md`.
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
  `plans/archive/plan-13-warp-popups.md` (7 tasks, High); risk re-rated High (shared shell/core).
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
  (spec `specs/2026-11-02-pokemap-plan-14-1-add-event-design.md`, plan `plans/archive/plan-14-1-add-event.md`)
  and **Plan 14.2 Block editor** (the widened collision editor, D20). The numbering keeps them apart from Plans 14A-14C.
- **Status:** 14.1 done (Tasks 1-10, final review approved, gate 4,416 / 1 env fail / 254 files) and merged via #31 → `3f4a762`. 14.2 done (Tasks 0-16, final Claude Opus review approved after one fix round, gate 5,148 / 4 known fails / 273 files) and merged via [#32](https://github.com/itnevres/pokemap/pull/32) → `9d14637` (2026-11-21); its final review moved 15 items to Plan H Task Q.
- **Risk:** medium-high. New `.asm` text and tileset-wide writes (LESSONS: GBC Format & Engine Quirks).
- **Depends on:** D6, D7.

## Order and overlap review

Open proposals, each waiting for a ruling:
- **Route modules against the routes Plans 14A-17 add.** Plan H batch H3 finishes before Plan 14A. Proposed rule for D23a: a new route module takes only the values it reads, as `(req, url, send) => boolean`, and is not handed the whole `GbaRouteContext`; otherwise that context becomes the new 1,099-line dependency (the GBA `handle` function, `server/src/index.ts:336-1434`).
- **Plan 17's map copy against Plan 14C's map creation.** One planner, two sources. Plan 14C's "compatible template" is a copy of a map of the same project; Plan 17 is the same copy from another project, plus dependency checks and the tileset. Proposed: Plan 14C's planner takes full content (blocks, border, events, scripts) from the start, and Plan 17 adds no second way to register a map.
- **Plan 4's render cache location.** A cache under the project's `.pokemap/cache/` adds files to both subjects on every render, which the gate reads as damage ("subjects unchanged"). Proposed: `~/.pokemap/cache/<project>` beside `recent.json` (Plan 4 decision 4).

Standing rule: every plan that writes a file read once at project open (map groups, layouts, GBC `maps.asm` and `map_constants.asm`, encounters, region map) depends on Plan H Task G's invalidation, and its spec lists the caches it must clear.

