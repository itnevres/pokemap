# PokeMap Plan 6c: Project Hub, Encounter Border, World UX (both families)

> **STATUS (2026-10-06): DONE.** All 17 tasks in phases A-F are done and reviewed. Success criteria 1-9 were demonstrated end to end in one browser session, starting from the hub with no project open; the record is `task-reports/pokemap-plan-6c-hub-encounters-world/_archive/task-F1-closeout.md`.
>
> - **Branch:** `plan-6c-hub-encounters-world`, 275+ commits on `master` `ce020d9` (Plan 6b's merge).
> - **Gate at HEAD (Windows):** `npm test` 2,202 pass / 2 fail (130 files). The 2 failures are the known `packages/server/test/world.test.ts` pair caused by the GBA subject's persisted `dungeonAutoLayout:false`. Typecheck is clean and `vite build` passes.
> - **External state:** the GBA subject and PerfPlus are byte-identical to their recorded state. Every live write (criteria 6 and 8, the Dungeon tab) was restored exactly.
>
> **Real file map** (relative to `ce020d9`; tests omitted; 108 files changed in `packages/`):
>
> | Area | New | Changed |
> |---|---|---|
> | Hub (A) | `server/src/hub.ts`, `server/src/recent.ts`, `core/src/hub/wire.ts`, `ui/src/hub/{ProjectPicker,ProjectSwitcher,SwitchConfirmDialog}.tsx`, `ui/src/hub/guards.ts` | `server/src/{index,gbcRoutes,serve,editSessions}.ts` (the handler split), `core/src/family.ts` (`probeEngineFamily`), `ui/src/Root.tsx`. `ui/src/hooks/useProjectInfo.ts` was deleted |
> | Encounter border (B) | `core/src/gbc/load/{species,sprites}.ts`, `ui/src/components/EncounterBorder.tsx`, `ui/src/encounters/{borderSide,fit,guards,summary,useMapEncounterSummaries}.ts` | `core/src/gbc/analyse/atlas.ts`. `EncounterGutter.tsx` and `gbc/GbcEncounterGutter.tsx` were deleted |
> | Lenses and tree (C) | — | `ui/src/components/{LensPanel,MapTree,SpeciesSpotlight}.tsx` |
> | World (D) | `core/src/world/{nearWarp,nearWarpAdapters,conflictAcceptance}.ts`, `ui/src/world/{conflictAcceptance,useConflictAcceptance}.ts`, `ui/src/gbc/{GbcWarpDestinationModal.tsx,warps.ts,hooks/useGbcDungeons.ts}` | `core/src/world/{resolve,sidecar}.ts`, `core/src/gbc/wire.ts`, `ui/src/world/visibility.ts`, `ui/src/gbc/{GbcApp,GbcWorldCanvas,guards}.tsx/ts` |
> | Edit in context (E) | `ui/src/components/{mapView.ts,MapEditingWorkspace.tsx,WorldContextMenu.tsx}`, `ui/src/hooks/useMapEditing.ts`, `ui/src/world/contextView.ts` | `ui/src/components/{MapCanvas,WorldCanvas}.tsx`, `ui/src/App.tsx`, `ui/src/gbc/GbcMapCanvas.tsx`, `server/src/index.ts` (`pngCache` cleared on commit) |
> | Shared | — | `ui/src/styles.css`, `ui/DESIGN.md`, `ui/src/hooks/useGuardedFetch.ts`, `ui/src/gbc/hooks/*`, `ui/src/gbc/time.ts` |
>
> **Deferred** (listed in RESUME under the 6c row): the context-mode world toolbar is cramped at 1024 px; MapCanvas overlay toggles aren't reachable in context; the encounter sprite tooltip clips at the viewport's left edge; the A, B and C items recorded per phase.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.
>
> **This plan is written at task level**, like Plan 6b. Re-granularise each task against the real code right before executing it (Plan 0 §1). The executed spec lands in `task-reports/pokemap-plan-6c-hub-encounters-world/task-<ID>-spec.md`, with bite-sized TDD steps, exact file:line anchors and code. Grounding facts below were measured on 2026-09-28. **Re-measure every corpus fact before pinning it**: spec facts have been wrong before (RESUME, "Lessons from Plan 6b").
>
> **Required reading first:**
> - `docs/superpowers/RESUME.md`: the Plan 2 and Plan 6b UI lessons;
> - `packages/ui/DESIGN.md`;
> - Plan 0 §7 (test-design rules);
> - the GBC roadmap invariants G1-G7 (G7: GBC writes go only to real decomp data files plus `.pokemap/`);
> - the Plan 6b STATUS banner, which holds the GBC file map;
> - `docs/superpowers/specs/2026-09-07-dungeon-mode-and-warp-tools-design.md`, the GBA dungeon feature that Phase D ports.

**Goal:** Nine user-requested improvements:
1. One server that opens any ROM folder, auto-detects GBA vs GBC, and switches projects.
2. A readable encounter display: a sprite border on a free side of each map, with a rich tooltip. It is available in both the world view and the map view.
3. Working empty-maps and unused-species lists.
4. A legend that sits in the toolbar row.
5. Tree auto-scroll when a map is selected.
6. Accepting conflicts.
7. An outdoor-and-dungeon-only world, with dungeons placed near their entrances.
8. GBA's dungeon features for GBC.
9. Editing a map in context on the world view (GBA now; GBC when Plan 7 lands).

**Architecture:**
- The server becomes a **hub**: one HTTP listener that owns a swappable per-project handler, built by today's `createServer` body, refactored into `createProjectHandler`.
- The UI gets a project picker and a switcher.
- The encounter display is one shared component, fed by a per-family adapter.
- World layout gains a core **near-warp placement** algorithm used by both families.
- In-context editing mounts the existing GBA map-editing chrome over `WorldCanvas`, after `MapCanvas` gains a controlled view.

**Tech stack:** TypeScript, Node `http`, React 18 under `<StrictMode>`, Vite, Vitest + Testing Library (no jest-dom), lightningcss (via Vite).

**Base branch:** `master` after itnevres/pokemap#3 (Plan 6b) merges. If #3 hasn't merged when this starts, branch from `plan-6b-gbc-app-layer` and rebase once it merges. Branch name: `plan-6c-hub-encounters-world`.

**Size:** 17 tasks in 6 phases. Each phase ships working software on its own. Per the user's global rule (one orchestrating session per plan), run **one phase per coordinator session**, with a handoff in RESUME between phases.
- Phases A, B, C and D are independent and can run in any order.
- The one cross-phase seam: D4 ships a minimal right-click handler on conflict badges, which E3's context menu absorbs, whichever lands first.
- E1 → E2 → E4 are sequential.
- F is last.

---

## Decisions already made (by the user, 2026-09-28)

| # | Decision |
|---|---|
| U1 | Every UI change applies to **both GBA and GBC**. Shared components change for both. GBA behaviour changes where this plan says so, and existing GBA tests change **only** where the listed behaviour changes. Each such test edit is named in its task's report, with the reason. |
| U2 | **In-context editing is GBA-only in 6c.** GBC gets it with Plan 7. A GBC double-click keeps today's "open in Map view". GBC's right-click menu shows "Edit here" disabled, with the hint "GBC editing arrives with Plan 7". |
| U3 | **Accepting a conflict only acknowledges it.** The placement doesn't change. The badge turns muted, the conflict stops counting as open, and it can be un-accepted. The acceptance is stored in `.pokemap/world.json`. |
| U4 | **Border side order: left, top, right, bottom.** The first free side wins. A side is blocked when any placed map touches or overlaps a band along that side in the world layout. In the map view, where there is no layout, a side is blocked when the map has a connection on it. If all four sides are blocked, use the side whose band overlaps neighbours the least. |

## Decisions made while grounding (checked against code and corpus)

- **The folder picker lives in the app, backed by the server.** A browser can't return an absolute filesystem path (`<input webkitdirectory>` only yields relative names), and the server needs a real path to open. So the server lists directories (`/api/hub/browse`) and the UI renders a folder browser.
  - The server binds `127.0.0.1` only (it already does, `index.ts` `http.listen(…, "127.0.0.1")`).
  - Browsing is read-only: names and flags, never file contents.
  - A typed-path box and a recent-projects list sit beside the browser.
- **Recent projects persist in a user-level file, `~/.pokemap/recent.json`.** Never in the repo's `pokemap.config.json`, which must never be committed. The directory is overridable with `POKEMAP_HOME`, so tests never touch the real home directory.
- **Detection reuses `detectEngineFamily(root)`** (`core/src/family.ts`):
  - GBA = `include/fieldmap.h`;
  - GBC = `data/maps/attributes.asm` + `constants/map_constants.asm`;
  - it throws on "both", and on a Yellow-shaped folder (Plan 8).
  - The browse route runs a **cheap** non-throwing variant per listed folder, so each entry can show a GBA/GBC badge without opening the project.
- **Switching with unsaved GBA edits.**
  - The GBA edit session lives inside the per-project handler (`index.ts`, `sessions`/`isDirty`), so swapping the handler would silently drop unsaved edits.
  - So `POST /api/hub/open` answers **409** `{ error, dirtyMaps: string[] }` when any session is dirty, unless the body says `force: true`.
  - The UI shows a confirm dialog that mirrors `SaveDialog`'s shell (RESUME: modal shells mirror `SaveDialog.tsx`).
- **GBC sprites come from front sprites, not menu icons.** Crystal's menu icons are per icon type, which is why 6b chose text chips.
  - `gfx/pokemon/<name>/front.png` is an **indexed PNG with its own palette**. Measured: dunsparce is 48×288 = 6 stacked 48×48 frames, bit depth 8, colour type 3.
  - The GBC `/api/species/:s/icon.png` (501 today) crops frame 0, the top `w×w` square, and re-encodes it. It is cached per species.
  - The species→folder mapping must be derived from the source (`gfx/pics.asm` INCBIN paths or `data/pokemon/pic_pointers.asm`), not by lowercasing: `NIDORAN_F`, `MR__MIME`, `HO_OH` and `UNOWN` are the traps.
  - There are 295 folders under `gfx/pokemon`, against 251 species. Measure which extras exist (Unown forms, eggs) and why.
- **GBC world visibility is by `environment`.** `GbcMap.environment` is already loaded (`gbc/model/types.ts`).
  - The `data/maps/maps.asm` census is TOWN 23, ROUTE 54, CAVE 42, DUNGEON 39, INDOOR 208, GATE 25 (= 391).
  - Show TOWN/ROUTE/CAVE/DUNGEON (158); hide INDOOR/GATE (233).
  - IlexForest is `CAVE`; BurnedTower1F, SproutTower1F and TinTower1F are `DUNGEON`; NationalPark and RuinsOfAlphOutside are `ROUTE`; DarkCaveVioletEntrance, UnionCave1F and SlowpokeWellB1F are `CAVE`. All are shown, as the user asked.
  - A hidden map the user drags in shows regardless, which is GBA's existing `manual` rule (`ui/src/world/visibility.ts` `isDrawnByDefault`).
- **Sidecars are already root-relative.**
  - `readSidecar`/`writeSidecar` (`core/src/world/sidecar.ts`) and `readDungeons`/`writeDungeons` (`dungeons.ts`) resolve `projectPaths(root).sidecar`/`.dungeons` = `${root}/.pokemap/world.json` / `dungeons.json`.
  - So GBC reuses them unchanged, and G7 allows `.pokemap/`.
  - Adding `acceptedConflicts` to the `Sidecar` shape is the one schema change. It is optional, defaults to `[]`, and `assertShape` validates it as a string array.
- **Near-warp placement must traverse hidden maps.** IlexForest's warps lead to `IlexForestAzaleaGate` and `Route34IlexForestGate`, both GATE and hidden. Their other warps lead to AzaleaTown and Route34.
  - So the anchor for a shown-but-unconnected component is **the shown map reached by BFS over warps through hidden maps**.
  - The anchor point is the warp tile on that shown map where the chain leaves it.
  - Multi-floor dungeons chain: BurnedTowerB1F anchors on BurnedTower1F once 1F is placed.
  - A component with no warp path to any placed map falls back to today's shelf packing.
- **GBA's world already hides interiors** ("placed 1209 · hidden 700": `MAP_TYPE_INDOOR` 695 + `MAP_TYPE_NONE` 6 by the spec's census) and already packs unconnected maps into a shelf (`core/src/world/warpGraph.ts` `autoLayoutUnplaced`).
  - Near-warp placement **replaces the shelf for GBA too** (U1), with the shelf kept as the fallback.
  - Manual placements always win over both, which is today's `applySidecar` order.
- **GBA's world double-click today only opens a warp preview**, and only when warps are on (`WorldCanvas.tsx` `onCanvasDoubleClick`). Double-click on a map body is free for "edit here".
  - When warps are on, a double-click on a warp marker keeps the preview. The warp hit test runs first, as it does today.
- **`MapCanvas` has the StrictMode zoom bug** (RESUME follow-up D1: `applyZoom` calls `setPan` inside a `setZoom` updater) plus the `min-width` overflow (D2).
  - In-context editing drives `MapCanvas`'s view from outside, so E1 fixes D1 and D2 first, copying `GbcMapCanvas`'s `zoomAboutPivot`/single-`view` state and its `gbc-map-canvas` min-width rule.
  - This retires follow-up Task D. Mark D1 and D2 done in `plans/2026-09-23-pokemap-followups-remaining.md` when E1 lands.
- **`App.tsx` is 633 lines** and owns the map-editing chrome (`Toolbar`, `CollisionPalette`, `EventInspector`, `SaveDialog`, `SignComposer`, the edit session).
  - RESUME set "a 3rd/4th addition" as the extraction signal, and in-context editing is that addition.
  - So E2 extracts `MapEditingWorkspace` as a pure refactor, with `App.test.tsx` unchanged, before E4 mounts it a second time.
- **`LensPanelSummary` carries counts only** (`emptyMaps`, `unusedSpecies`). The coverage payloads already carry the arrays: GBA `coverage().mapsWithoutEncounters`/`unusedSpecies`, and GBC `/api/coverage` the same.
  - C1 widens the summary to carry the arrays.
  - It deletes both `focusEmptyMaps` implementations, GBA `WorldCanvas.tsx` and GBC `GbcWorldCanvas.tsx`, because the list replaces them.

---

## Success criteria (demonstrated in a real browser, screenshots looked at)

1. **One server.**
   - `npx tsx packages/server/src/serve.ts`, with no flags, starts the hub.
   - The UI shows the project picker; the GBA subject opens via the folder browser.
   - Switching to PerfPlus from the header shows the GBC app. Switching back shows GBA.
   - With an unsaved GBA edit, switching asks first, and Cancel keeps the edit.
   - A restart reopens the last project.
2. **Encounter border.**
   - In the world view, Route30 (GBC) shows a sprite strip on a free side, as U4 defines it.
   - Hovering a sprite shows name, percent, method, time(s), levels, and rod or tree class.
   - At Morn, species absent at Morn are dimmed, not hidden.
   - The same toggle exists in the map view, for both families.
   - The GBA world view shows the same border with GBA icons.
3. **Lists.** "List them" (empty maps) fills a list in the legend row, and clicking an entry jumps to that map. Unused species shows a list of names. Both work in both families.
4. **Legend row.** The lens legend renders as a toolbar row, like `map-canvas__legend`. It covers nothing: the Encounters toggle is clickable with a legend open.
5. **Tree auto-scroll.** Single-clicking a map far down the world view scrolls the tree to it and highlights it, in both families.
6. **Conflicts.**
   - Right-click on the Route17 badge → "Accept conflict". The badge goes muted, and the status reads `2 conflicts · 1 accepted` (or the family's equivalent).
   - A reload keeps the acceptance; un-accepting restores the badge.
7. **GBC world.**
   - Only the 158 TOWN/ROUTE/CAVE/DUNGEON maps draw by default.
   - IlexForest sits next to Azalea/Route34, DarkCaveVioletEntrance next to its entrance, and BurnedTower1F next to EcruteakCity, with B1F next to 1F.
   - Warp markers and the Dungeon tab work on GBC.
8. **In context (GBA).**
   - Double-clicking NewBarkTown in the GBA world view shows the map-editing tools, with the world visible around the map.
   - Pencil-painting one block and saving updates the world tile.
   - Right-click → "Open in Map view" and shift+double-click both switch to the Map view.
   - A GBC double-click still opens the Map view, and GBC's "Edit here" is disabled.
9. **Gate.** `npm test`: 0 new failures (Windows baseline 1,679 / 0 at 6b HEAD; re-measure at branch start). `npm run typecheck` clean, `vite build` passes.

---

## File structure

| File | New/changed | Responsibility |
|---|---|---|
| `packages/server/src/index.ts` | changed | Split into `createProjectHandler(root)` → `{ family, project, handle(req,res), dirtyMaps(), dispose() }` plus a thin `createServer` wrapper, so existing tests stay unchanged |
| `packages/server/src/gbcRoutes.ts` | changed | Same split: `createGbcProjectHandler(root)` |
| `packages/server/src/hub.ts` | new | `createHub({ port, home })`: the listener, the current handler, `/api/hub*` routes, and a 503 `{ error: "no project open" }` for project routes |
| `packages/server/src/recent.ts` | new | Read and write `~/.pokemap/recent.json` (`POKEMAP_HOME`-overridable) with a shape guard; up to 10 entries, most recent first |
| `packages/server/src/serve.ts` | changed | No args → hub (reopens the last project). `--gbc`/positional → hub with that project opened |
| `packages/core/src/family.ts` | changed, additive | `probeEngineFamily(root): EngineFamily \| "unsupported" \| null`, which never throws. Used by browse |
| `packages/core/src/gbc/load/sprites.ts` | new | Species → `gfx/pokemon/<dir>` mapping from the source; `loadGbcFrontSprite(root, species)` → the frame-0 RGBA raster |
| `packages/core/src/world/nearWarp.ts` | new | `placeNearWarps(input)`, pure and family-agnostic. The inputs are placements, shown/hidden sets, a warp list and map sizes; the output is new placements. Both families' adapters feed it |
| `packages/core/src/world/sidecar.ts` | changed | `acceptedConflicts?: string[]`, plus `conflictKey(conflict)` |
| `packages/ui/src/Root.tsx` | changed | No project → `ProjectPicker`; the app is re-keyed on switch |
| `packages/ui/src/hub/{ProjectPicker,ProjectSwitcher,SwitchConfirmDialog}.tsx` + `hub/guards.ts` | new | Folder browser, recent list, typed path; the header switcher; the dirty-edit confirm |
| `packages/ui/src/encounters/{summary,borderSide}.ts` | new | Per-family adapters → `SpeciesSummary[]`; `pickBorderSide`, `borderSideFromConnections` |
| `packages/ui/src/components/EncounterBorder.tsx` | new | The shared sprite border + tooltip + LOD badge + legend. **Replaces** `EncounterGutter.tsx` and `gbc/GbcEncounterGutter.tsx`, which are deleted along with their tests; the replaced behaviours get new tests |
| `packages/ui/src/components/LensPanel.tsx` | changed | The legend becomes a row; empty-maps and unused-species lists |
| `packages/ui/src/components/MapTree.tsx` | changed | Scrolls the selected row into view (`block: "nearest"`) and expands its group if collapsed |
| `packages/ui/src/components/MapCanvas.tsx` | changed | D1/D2 fixes; optional controlled `view`/`onViewChange` props; Encounters toggle |
| `packages/ui/src/gbc/GbcMapCanvas.tsx` | changed | Encounters toggle |
| `packages/ui/src/components/MapEditingWorkspace.tsx` | new | The edit chrome extracted from `App.tsx` |
| `packages/ui/src/components/WorldContextMenu.tsx` | new | The right-click menu for both families: Open in Map view / Edit here / Accept or Un-accept conflict |
| `packages/ui/src/components/WorldCanvas.tsx`, `gbc/GbcWorldCanvas.tsx` | changed | Border, lists, context menu, accept, in-context mode (GBA). GBC also gets visibility/manual placement, warps and the dungeon filter |
| `packages/ui/src/gbc/GbcApp.tsx` | changed | Dungeon tab, tree grey-out, switcher |
| `packages/ui/src/App.tsx` | changed | Mounts `MapEditingWorkspace`, the switcher, and in-context wiring |
| `packages/ui/src/styles.css`, `DESIGN.md` | changed | Border, legend row, lists, context menu, picker, muted-conflict tokens/classes |
| `.claude/launch.json` | changed | `server` = the hub; `server-gbc` kept as the PerfPlus-preopened hub |

---

## Tasks

The process is the one Plan 6b used and RESUME records:
- executed spec;
- Sonnet implementer, test-first, committing each green step;
- Opus spec review, which may mutate and run servers, alongside a Sonnet read-only quality review;
- one fix round, continuing the same implementer;
- the coordinator re-runs every surviving mutation on the final fix commit;
- live-verify in a real browser;
- archive the reports.

Binding for every UI brief:
- no jest-dom;
- real tokens only;
- no `.btn`;
- modal shells mirror `SaveDialog.tsx`;
- every fetch goes through `useGuardedFetch`/`fetchGuarded` with a shape guard and a visible error;
- never call a state setter inside another setter's updater;
- flex children with long text get `min-width: 0` (check `scrollWidth === clientWidth` at 1280 and 1024);
- cite `WorldCanvas.tsx` by grep-able anchor, never by line number.

**Gate after every task:** `npm test` = the branch baseline plus the new tests, with no new failures; typecheck clean; `vite build` passes. `styles.test.ts` guards the CSS.

### Phase A: One server, any project

#### A1. Server hub, project handler split, browse/open routes, recent list
- Refactor `createServer` (GBA) and `createGbcServer` into `createProjectHandler`/`createGbcProjectHandler`, returning `{ family, project, handle, dirtyMaps, dispose }`. The existing `createServer({projectPath, port})` becomes a wrapper that listens with one handler.
  - **Every existing server test must pass unchanged.** That is the proof the split is behaviour-neutral.
- `hub.ts` routes:
  - `GET /api/hub` → `{ current: ProjectInfo | null, recent: RecentEntry[] }`.
  - `GET /api/hub/browse?dir=` → `{ dir, parent, entries: [{ name, path, family: "gba"|"gbc"|"unsupported"|null }] }`.
    - With no `dir`: drive roots on Windows (probe `A:`-`Z:`), and `/` elsewhere.
    - Directories only; hidden and dot folders excluded.
    - Unreadable entries are skipped, not thrown.
    - `family` comes from `probeEngineFamily`.
  - `POST /api/hub/open { path, force? }`:
    - 400 on a bad body;
    - 404 on a missing directory;
    - 422 `{ error }` on an unsupported or ambiguous family (the message from `detectEngineFamily`);
    - 409 `{ error, dirtyMaps }` when the current GBA handler has dirty sessions and `!force`;
    - on success it disposes the old handler, opens the new one, pushes to recent, and answers `ProjectInfo`.
  - Every other `/api/*` goes to the current handler, or 503 `{ error: "no project open" }`.
- `recent.ts`: `~/.pokemap/recent.json` = `{ version: 1, entries: [{ path, family, openedAt }] }`. It has a shape guard, deduplicates by normalised path, and keeps at most 10 entries. A corrupt file is renamed `recent.json.bad` and treated as empty, never thrown.
- `serve.ts`:
  - no args → hub, reopening `recent[0]` if it still detects;
  - `--gbc` / a positional path → hub with that project opened.
  - Keep `--gbc`'s existing config semantics.
- Tests:
  - handler-split parity: the existing suites;
  - hub routing and 503 before open;
  - open GBA → `/api/project` gives gba; open PerfPlus → gbc; switch back;
  - 409 with a real dirty session (open an edit session and paint through the real routes; don't stub `isDirty`), then `force` succeeds;
  - 422 on a temp dir that has both markers, and on a Yellow-shaped temp dir;
  - browse lists a temp tree with the correct badges; drive roots on win32 only (`it.skipIf`);
  - recent persistence round-trip under a temp `POKEMAP_HOME`, plus the corrupt-file recovery.
- **Mutations:** skip the dirty check; drop `dispose()` of the old handler; recent not deduplicated; browse lists files; 503 → pass-through.

#### A2. UI: project picker, header switcher, dirty-switch confirm
- `Root.tsx`:
  - `GET /api/hub`;
  - with no current project → `<ProjectPicker/>`;
  - otherwise `<App key={root}/>` or `<GbcApp key={root}/>`, keyed by root so a switch remounts with fresh state.
- `ProjectPicker`:
  - recent list first (family badge, path, "Open");
  - then the folder browser: breadcrumb, a parent button, and subfolders with GBA/GBC badges. Opening is only enabled on a detected folder;
  - then a typed-path box.
  - Errors (422/404) show inline with the server's message.
- `ProjectSwitcher`, in both headers, as an additive prop to `App` and `GbcApp`: a button showing the project folder name, opening the picker as a modal.
- `SwitchConfirmDialog` mirrors `SaveDialog`'s shell (backdrop, Escape, `autoFocus` on Cancel). It lists `dirtyMaps`, and "Discard and switch" re-posts with `force: true`.
- Tests:
  - Root routes no-project / gba / gbc;
  - the picker browse → open flow with a fetch mock;
  - a 409 opens the confirm, Cancel doesn't switch, force does;
  - the re-key remounts (the old app's state is gone).
- **Live-verify:** criterion 1, fully.

### Phase B: Encounter border (both families, world and map view)

#### B1. GBC species sprites + the species summary adapters
- Core `gbc/load/sprites.ts`:
  - the species constant → folder mapping, derived from `gfx/pics.asm` or `data/pokemon/pic_pointers.asm`. Measure which one is authoritative in PerfPlus first;
  - `loadGbcFrontSprite(root, species)` decodes the indexed PNG with the existing decoder and crops frame 0 (`w×w` at the top).
  - Tests pin CHIKORITA, NIDORAN_F, MR__MIME, HO_OH and UNOWN by folder, and DUNSPARCE's size and the RGBA of 3 pixels, byte-read from the PNG.
- Server:
  - the GBC `/api/species/:s/icon.png` switches from 501 to a real route (normalised species, 404 unknown, cached PNG);
  - the route test is byte-equal to `encodePng(loadGbcFrontSprite(...))`.
- UI `encounters/summary.ts`: `summariseGba(methods)` and `summariseGbc(sources)` → `SpeciesSummary[]`:
  ```ts
  interface SpeciesRow { method: "grass"|"water"|"fish"|"headbutt"|"rock"|string; label: string; percent: number; minLevel: number; maxLevel: number; time?: "morn"|"day"|"nite"; rod?: string; list?: string; conditional?: "swarm"; rate?: number }
  interface SpeciesSummary { species: string; displayName: string; iconUrl: string; rows: SpeciesRow[]; availableAt?: Array<"morn"|"day"|"nite"> }
  ```
  - `availableAt` is GBC-only, computed with `matchesTime` (moved from `GbcEncounterGutter.tsx` into `summary.ts`, keeping its tests).
  - The order is first appearance by method order (grass, water, fish, headbutt, rock), then by highest percent.
- Tests:
  - Route30 GBC fixture → exact summaries, including POLIWAG's rows across water/fish/grass-nite;
  - a GBA fixture → exact summaries;
  - `availableAt` for a morn-only species.

#### B2. Border side selection (pure)
- `pickBorderSide(rect, neighbours: Rect[], band)` → `"left"|"top"|"right"|"bottom"`, using U4's order and least-overlap fallback. `band` is the border thickness in world units.
- `borderSideFromConnections(dirs: Set<"north"|"south"|"east"|"west">)` is used in the map view.
- Tests:
  - the user's examples: top+bottom → left; left+right → top; top+right → left;
  - all blocked → least overlap, with an exact fixture;
  - touching counts as blocked, and a gap ≥ band doesn't;
  - a real-corpus check: NewBarkTown (GBC) with its real world neighbours → the pinned side. Measure it; don't guess.

#### B3. `EncounterBorder` replaces both gutters in the world views
- Props: `{ entries: Array<{ map, rect, side, summaries }>, zoom, time? }`.
- Rendering:
  - One sprite per species along the side, outside the map rect, sized `min(32, band)` px.
  - Below the LOD threshold, a species-count badge on that side.
  - GBC sprites for species not in `availableAt` for the app time get the dimmed class (opacity plus a dashed outline, so colour isn't the only signal).
  - Hover or focus on a sprite shows a tooltip. It reuses `EncounterGutter`'s top-level-sibling tooltip mechanics (read its long comment first), and contains:
    - the name;
    - one line per row: `Grass · Morn 30% Lv 3-5+`, `Fish · Good Rod · day 64.8% Lv 20`, `Headbutt · rare 30% Lv 10`, `Surf 75% Lv 15-24+`;
    - the encounter rate / bite chance;
    - the `+` buff note for grass and water.
  - Sprites are focusable buttons with an `aria-label` of the tooltip's first line.
- Legend and toggle: the "Encounters" toggle stays, and the legend explains the dimming and the `+`.
- `WorldCanvas` and `GbcWorldCanvas` compute `side` per visible map with `pickBorderSide` against the current placements, memoised on `[placements, sizes]`, not on pan.
- Delete `EncounterGutter.tsx` and `gbc/GbcEncounterGutter.tsx` along with their CSS and tests. Every behaviour the old tests pinned that still applies (the lazy one-fetch-per-map cache, time independence, the GBA-shaped payload rejection, the failed-maps note) moves to the new tests.
- **The GBA world view's rendering changes (U1).** Name each GBA test that is replaced.
- **Mutations:** side order swapped; dimming applied to the available species; tooltip dropping `time`; LOD threshold off by one; one fetch per map broken.

#### B4. Encounters in the map view (both families)
- An "Encounters" toggle in the `MapCanvas` and `GbcMapCanvas` overlay groups.
- The canvas margin grows by one band on the side from `borderSideFromConnections`, and `EncounterBorder` draws there with the canvas's zoom and pan. GBC gets the app time.
- The fetch is shared with the world view's cache pattern: one per map, time-independent.
- Tests:
  - the toggle's `aria-pressed`;
  - the border appears on the exact side for a fixture with north/south connections (→ left);
  - no fetch until the toggle is on.
- **Live-verify:** criterion 2, fully.

### Phase C: Lenses, lists, legend, tree

#### C1. LensPanel legend row + real lists
- `LensPanelSummary` gains `emptyMapNames: string[]` and `unusedSpeciesNames: string[]`. The counts become their lengths.
- The legend renders as a row below the world toolbar (`world-canvas__legend-row`, styled like `map-canvas__legend`), not a popover.
- Empty maps: "List them" toggles a list in the row: a scrollable `<ul>`, max height ~40vh, each map a button. Clicking one calls `onJumpToMap(name)`.
- Unused species: "Show list" toggles a list of display names (with GBA icons or GBC sprites).
- Delete both `focusEmptyMaps`, and the tests that pinned them, which are named in the report.
- Tests:
  - the list renders the exact names from a fixture;
  - clicking an entry calls `onJumpToMap` with the name;
  - the unused list renders the exact names;
  - the legend is in the row, not over the toolbar: the Encounters toggle is clickable with the legend open (a real click, not `fireEvent` on a covered element; assert via `elementFromPoint` in live-verify).
- **Live-verify:** criteria 3 and 4, in both families.

#### C2. Tree auto-scroll on world selection
- `MapTree`: when `selected` changes, expand its group if collapsed, then `scrollIntoView({ block: "nearest" })` on the row. Only on change, and never while the user is typing in the filter (the filter keeps focus).
- Wire the world-view single-click to the tree selection in `App.tsx` for GBA, if it isn't already. `GbcApp` already has `onSelectMap`.
- Tests: a jsdom spy on `Element.prototype.scrollIntoView`, called once with `{block:"nearest"}` on change and not on re-render; the collapsed group expands.
- **Live-verify:** criterion 5, in both families.

### Phase D: World layout, GBC dungeon features, conflicts

#### D1. GBC visibility, sidecar, manual placement
- The GBC `/api/world` placements gain `mapType` (= environment) and `manual`, and the payload guard is updated.
- UI:
  - `isDrawnByDefault` takes a family-aware hidden set: GBA `{MAP_TYPE_INDOOR, MAP_TYPE_NONE}`, GBC `{INDOOR, GATE}`;
  - the tree's grey-out works for GBC;
  - drag-to-place is ported from `WorldCanvas`'s map drag (grep `drag?.kind === "map"`), with a single `view` state (no second view state; see 6b's Task 5).
- `POST /api/world/placement` on GBC mirrors the GBA route and writes only `.pokemap/world.json` (G7).
- Tests:
  - the counts: 158 drawn / 233 hidden by default (re-measure);
  - a manual placement round-trip on PerfPlus, restoring in `finally`, read-guarded (RESUME lesson);
  - a hidden-then-dragged map draws.

#### D2. Near-warp auto-layout (core, both families)
- `placeNearWarps({ placements, shown, hidden, warps, sizes, gap })`:
  - For each shown map not in a multi-map component, BFS over warps through hidden maps to a placed shown map (the anchor).
  - The anchor point is the source warp's tile on the anchor, converted to the anchor's world coordinates.
  - The preferred position puts the new map's nearest edge `gap` beyond the anchor edge closest to that warp tile.
  - A spiral search then finds the nearest non-overlapping position.
  - Newly placed maps become anchors for their own warp-only neighbours (floors chain), in BFS order from outdoor maps, so the result is deterministic.
  - No path → fallback to `autoLayoutUnplaced`'s shelf.
- Both families' world routes call it in place of the shelf when auto-layout is on. Manual placements are applied last.
- Real-corpus tests, all measured:
  - GBC: IlexForest within N blocks of AzaleaTown's gate-warp side; DarkCaveVioletEntrance adjacent to its entrance map; BurnedTower1F adjacent to EcruteakCity; BurnedTowerB1F adjacent to BurnedTower1F; **zero overlaps** among all placements; deterministic across two runs.
  - GBA: zero overlaps, and 3 named dungeons adjacent to their entrances (pick them from the subject; measure).
- **Opus spec review is mandatory here** (hand-derived geometry): one fixture world hand-computed end to end.
- **Mutations:** the BFS stops at hidden maps; the spiral allows overlap; the anchor edge is chosen by the map centre instead of the warp tile; nondeterministic order.

#### D3. GBC warps + Dungeon tab
- Warp markers toggle plus the destination preview on `GbcWorldCanvas`, ported from `WorldCanvas`'s `warpsOn`/`warpMarkerEntries`/`setWarpPopup`. The preview uses `GbcMapCanvas` read-only.
- GBC `destWarp` is a **1-based positional index** (RESUME carry-forward): pin one real warp's destination tile.
- A Dungeon tab in `GbcApp`: named groups stored in `.pokemap/dungeons.json` via `readDungeons`/`writeDungeons`. The GBC dungeon CRUD routes mirror GBA's. It shows a scoped `GbcWorldCanvas` (`mapFilter`) with warp lines between exact tiles.
- Tests: the route CRUD round-trip (restore in `finally`); the scoped view draws only the group's maps; the warp line endpoints for one pinned warp pair.

#### D4. Accept conflicts (both families)
- Core:
  - `conflictKey(c) = \`${c.map}|${c.viaA.from}|${c.viaB.from}|${c.dx},${c.dy}\``, which is stable across runs. Verify the GBA `Conflict` shape has the same fields, and adapt if not;
  - `Sidecar.acceptedConflicts`.
- Routes (both families): `POST /api/world/conflicts/accept { key, accepted: boolean }` → the updated list. It writes `.pokemap/world.json` only, and 404s an unknown key.
- The world payloads mark each conflict `accepted: boolean`.
- UI:
  - an accepted badge draws muted (the `--text-muted` diamond with a check glyph);
  - the tooltip says "Accepted (right-click to un-accept)";
  - the status strip shows open vs accepted counts;
  - `WorldContextMenu` (E3) hosts the action. Until E3 lands, D4 ships a minimal right-click handler on badges only, which E3 absorbs.
- Tests:
  - the key's stability and the round-trip on PerfPlus (restore in `finally`);
  - GBA with a temp-copied sidecar;
  - badge colour by state, via the draw-call spy pattern (instrument `drawDiamond` arguments).
- **Live-verify:** criteria 6 and 7.

### Phase E: Edit in context (GBA), context menu (both)

#### E1. `MapCanvas` view fixes + controlled view
- Fix D1: a single `view = { zoom, pan }` state, with `zoomAboutPivot` copied from `GbcMapCanvas`, plus a StrictMode test pinning the exact pan after one zoom step.
- Fix D2: `min-width: 0` on `.map-canvas`, plus the hover-overflow check.
- Add optional `view` + `onViewChange` props. When `view` is given, the canvas renders it and reports changes instead of owning state.
- **Mutations:** a setter inside an updater (the StrictMode test must go red); min-width removed.

#### E2. Extract `MapEditingWorkspace` from `App.tsx` (pure refactor)
- Move the edit chrome (`Toolbar`, `CollisionPalette`, `EventInspector`, `SaveDialog`, `SignComposer`, `useEditSession` wiring and the event/sign handlers) into `MapEditingWorkspace({ mapName, data, canvas: ReactNode | render-prop })`. `App` mounts it for Map mode.
- **`App.test.tsx` and every GBA UI test pass unchanged.** That is the proof.
- The race-safety paths (`pendingPaintRef`/`endActiveStroke`) must stay inside `MapCanvas` untouched. The reviewer traces the paint call chain.

#### E3. `WorldContextMenu` (both families)
- Right-click on a map → a menu at the pointer: "Open in Map view", "Edit here" (GBA; GBC shows it disabled with "GBC editing arrives with Plan 7"), and "Accept conflict" / "Un-accept conflict" on a badge.
- Keyboard: the ContextMenu key and Shift+F10 on the focused canvas open it at the selected map. Arrow keys, Enter and Escape work.
- Shift+double-click → Open in Map view, as the fallback. A GBC plain double-click keeps opening the Map view.
- Tests: the menu items per family, the disabled GBC item, Escape closes it, and the shift+double-click route.

#### E4. GBA in-context edit mode
- A plain double-click on a GBA map body enters context mode. A warp marker hit still opens the warp preview first.
- Entering context mode:
  - snaps the world zoom to the nearest `MapCanvas` level (1/2/4 × 16 px per tile), keeping the map's centre under the pointer;
  - mounts `MapEditingWorkspace`, with `MapCanvas` in controlled-view mode positioned exactly over the map's world rect. The world view and the map canvas share pan, and zoom is limited to 1/2/4 while in context;
  - dims the rest of the world with `--overlay-spotlight-dim`, but keeps it visible and pannable.
- Exiting: Escape, a "Done" button, or double-clicking outside. It uses the Map view's existing unsaved-edits flow (`SaveDialog`), without inventing a new one.
- After a save, only the edited map's world tile is re-fetched (its render URL gets a cache-busting version).
- Tests:
  - the alignment math (the map rect → the controlled view, exact numbers);
  - enter/exit state;
  - the Escape path with a dirty session opens `SaveDialog`;
  - the post-save tile refresh URL.
- **Live-verify:** criterion 8. Paint one block in NewBarkTown on the GBA subject, save, and see the world tile update. Then **restore the subject exactly**: the decomp is read-only except for this deliberate test write, so record `git status --porcelain` before, and restore by reverse-painting and saving, then diff to zero.

### Phase F: Close-out

#### F1. Close-out
- Demonstrate criteria 1-9 end to end in one browser session, starting from the hub with no project open. Take screenshots and look at them.
- A GBA smoke test (map, overlays, world, dungeon tab, a save round-trip restored), then the full gate.
- Docs:
  - RESUME: state table, running instructions (a single `serve.ts`), lessons;
  - the roadmap §6 row;
  - this plan's STATUS banner with the real file map;
  - the follow-ups plan: Task D done.
- Archive the reports, push, and open the PR.

---

## Risks

| Risk | Mitigation |
|---|---|
| The handler split changes GBA server behaviour | A1's gate is "every existing server test passes unchanged". The hub only wraps the handler |
| Switching loses unsaved edits | 409 + confirm; tested with a real dirty session, not a stub |
| Browse exposes the filesystem | 127.0.0.1 only; directory names only; no file reads; hidden folders excluded |
| The GBC species→folder mapping is wrong for the odd names | Derived from the source, with 5 named trap species pinned |
| Near-warp geometry produces overlaps or jitter | Zero-overlap and determinism pins on both corpora; mandatory Opus review with a hand-computed fixture |
| Deleting the gutters loses pinned behaviour | B3 moves every still-relevant pin into the new tests and names each one in the report |
| In-context mode re-opens the paint race (Plan 2 Task 11) | E2 is a pure move; E4 routes all painting through `MapCanvas`'s existing chain; the reviewer re-runs the `setTimeout`-delayed race reproduction |
| E1 touches `MapCanvas` (961 lines, a race-prone history) | Minimal diff: a view-state merge only, with StrictMode and race tests before and after |
| The GBA subject is mutated by a live-verify | E4's restore protocol: porcelain before and after, diff to zero |
| `WorldCanvas.tsx` (2,125 lines) grows further | The border, context menu and lists live in their own components; `WorldCanvas` only wires them. Extraction of the lens/spotlight overlays remains an open item, not done here |

## Out of scope

- GBC editing of any kind (Plan 7), including GBC in-context editing (U2).
- Pokémon Yellow (Plan 8); the picker shows it as "unsupported".
- Remote or multi-user access to the hub.
- Tile animation, and species icons beyond front-sprite frame 0.
- Changing GBA's warp preview or dungeon-tab behaviour beyond the near-warp auto-layout (D2) and the context menu (E3).
