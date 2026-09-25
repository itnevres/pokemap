# PokeMap Plan 6b: GBC App Layer (server + UI, read-only)

> **For agentic workers:** REQUIRED READING FIRST:
> - the GBC roadmap (`2026-09-23-pokemap-plan-6-gbc-roadmap.md`): invariants G1-G7, then §6b, the sketch this plan was written from;
> - the Plan 6 STATUS banner (`2026-09-23-pokemap-plan-6-gbc-foundation.md`), which holds the real GBC file map;
> - the findings doc (`docs/superpowers/specs/2026-09-23-pokemap-gbc-format-findings.md`), whose Decisions are binding;
> - Plan 0 §7 (test-design rules);
> - `packages/ui/DESIGN.md`;
> - `docs/superpowers/RESUME.md`, especially the UI lessons.
>
> This plan is written at **task level**. Re-granularise each task against the real code right before executing it, as Plan 0 §1 requires. Each task's executed spec lands in `task-reports/pokemap-plan-6b-gbc-app-layer/task-N-spec.md`.

**Goal:** Open a Pokémon Crystal (pokecrystal-family) project in the browser, read-only:
- a map tree grouped by the real Crystal map groups;
- a map view that renders at 32 px per block, with a border ring and a time-of-day switch, plus grid, collision-quadrant and event overlays and a hover readout;
- a stitched world view;
- the encounter atlas: gutter, lenses and species spotlight.

Plan 7 then adds editing on top (its Tasks 4-5 depend on this plan).

**Non-goals:**
- Any GBC write path or `/api/edit/*` route (Plan 7).
- GBC species icons: Crystal's menu icons are per icon type, not per species. The GBC gutter uses text chips.
- Dungeon mode, the `.pokemap` sidecar, warp markers, drag-to-place and sign tools for GBC.
- Tile animation.
- Extracting `WorldCanvas.tsx`/`MapCanvas.tsx` (an open item, still not urgent).

**Base:** branch `plan-6b-gbc-app-layer`, from `master` at `3f76262`.

---

## Success criteria (demonstrated, not asserted)

1. Start the server against a real PerfPlus root (`npx tsx packages/server/src/serve.ts --gbc`) and the Vite UI, then use a real Chromium (Playwright) to:
   - open **NewBarkTown** from the group tree;
   - see it rendered at 32 px per block with its 1-block border ring;
   - switch the time of day morn/day/nite and see different pixels;
   - turn on the collision-quadrant overlay;
   - hover a block and read its metatile id plus 4 collision quadrants in the status strip.

   Screenshots are taken **and looked at**. CeruleanCave2F shows its oversize-`.blk` defect banner.
2. The same session opens the **world view**. It shows the stitched Johto and Kanto components, and the Route16/17/18/Fuchsia conflict is visible as a badge.
3. The same session shows an **encounter lens**: the method lens tints maps by GBC method (grass/water/fish/headbutt/rock). The gutter lists a map's grass slots for the selected time of day. The species spotlight finds a real species; DUNSPARCE lights up Dark Cave.
4. **The GBA baseline is unchanged:**
   - `npm test` = baseline pass count plus this plan's new tests, with exactly the same 6 known failures (RESUME "Git state", recorded in `task-reports/.../baseline-fails.txt`);
   - `npm run typecheck` is clean;
   - the GBA app still opens a map and the world view in the browser against `pokemon-three-region`.

---

## Resolved design questions (§6b's three open questions, decided from the code)

### Q1. Shared vs separate response types → **separate types, defined once, in a types-only module in core**

- The GBA wire shapes are declared UI-side and consumed deeply by GBA-only code:
  - `MapLayoutData` in `packages/ui/src/hooks/useMapLayout.ts:14-21` (`split`, `primaryCount`/`secondaryCount`, per-block `collision/elevation/behavior`);
  - its consumers `MapCanvas.tsx:173` (`split`, `layout.borderWidth`), `MetatilePalette` (`split`, counts) and `App.tsx` (`layout.data.layout.name`, `split`, counts).
- A `family`-tagged union would force narrowing in every one of those GBA sites, which means touching GBA code for no GBC benefit.
- No GBA component ever needs to render a GBC payload. The UI branches **once** at startup (Q2).
- So the GBC shapes are independent interfaces, **not** a union with the GBA types. They live in a new types-only module, `packages/core/src/gbc/wire.ts`:
  - `GbcProjectInfo`, `GbcGroupsPayload`, `GbcMapPayload`, `GbcWorldPayload`, `GbcEncountersPayload`;
  - built from existing core types (`GbcMap`, `Collision`, `GbcMapEvents`, `Placement`, `GbcEncounterSource`, ...).
- The server annotates each response with `satisfies`. The UI imports the same interfaces and still validates with runtime type guards (RESUME: "validate response shapes", as `isDiffPlan` does). One definition, checked on both ends.
- The GBA wire types are left exactly where they are.
- `/api/project` is the single shared shape, `{ family: "gba" | "gbc"; root: string }`. It lives in the same module as `ProjectInfo`, because the UI imports both families' wire types from core already (`@pokemap/core/src/...`).

### Q2. Parameterise vs wrap MapCanvas/WorldCanvas → **new GBC sibling components; reuse the family-agnostic pieces**

What the code says:
- **`MapCanvas.tsx` (961 lines)** is about 70% editing machinery:
  - `pendingPaintRef`/`endActiveStroke` race-safety (RESUME: "load-bearing and easy to accidentally bypass"), event drag, and the dropper;
  - its geometry reads GBA fields directly: `layout.borderWidth/borderHeight` (l. 354-357), `split` in the status strip (l. 944-948), per-block `collision/elevation/behavior` in `hoverAt` (l. 600-601);
  - its overlays go through `core/render/overlays.ts`'s `drawCollision`/`drawEvents`, which are typed to GBA `LayoutRaster`/`MapData`.
  - Parameterising it would put GBC branches inside the paint/drag handlers. Those are the paths the project has had the most race bugs in.
- **`WorldCanvas.tsx` (2,083 lines)** is dominated by GBA-only features:
  - drag-to-place, multi-select move, the sidecar POSTs, dungeon auto-layout, the unplaced rail, warp markers and connection lines;
  - all are explicitly out of scope for GBC (§6b "GBA-only features").

**Decision:**
- **GBC gets its own components:** `GbcMapCanvas.tsx`, `GbcWorldCanvas.tsx`, `GbcEncounterGutter.tsx` and `GbcMetatilePalette.tsx`. They are written fresh against the GBC payloads, and they follow the patterns the GBA canvases paid for:
  - `viewport` in the blit deps (the Task 21 postmortem);
  - a native `wheel` listener with `{ passive: false }`;
  - integer zoom and `image-rendering: pixelated`;
  - a pristine base canvas recomposited on toggle;
  - fit once per map, not on every reload.
- **Reused as-is, or with additive optional props whose defaults are unchanged:**
  - `MapTree` (its `MapGroupsData` shape is family-agnostic);
  - `LensPanel` (new optional `methodKey` prop for the GBC legend);
  - `SpeciesSpotlight` (it only reads `hit.mapName`, `SpeciesSpotlight.tsx:234`; its hit type is loosened to a structural `{ mapName?: string }` constraint, and GBC `/api/where` normalises a `SPECIES_` prefix server-side);
  - `computeFit` (already exported from `WorldCanvas.tsx:240`);
  - every `map-canvas__*` / `world-canvas__*` / `encounter-gutter__*` / `lens-panel__*` CSS class, so GBC looks identical.
- **Hiding the GBA-only panels becomes structural:** the GBC shell simply never mounts `Toolbar`, `CollisionPalette`, `EventInspector`, `SaveDialog`, `SignComposer`, `DungeonSidebar` or `WarpDestinationModal`. No `family` conditionals get sprinkled through `App.tsx`.
- **`App.tsx` itself stays untouched.** It is 633 lines, and RESUME says a 3rd/4th addition is the extraction signal. A new `Root.tsx` fetches `/api/project` once and renders `<App/>` (GBA, byte-identical) or `<GbcApp/>`. `main.tsx` mounts `Root`. This keeps `App.test.tsx` and every GBA UI test unaffected.
- **Cost, accepted:** about 150 lines of pan/zoom/viewport logic are duplicated between `MapCanvas` and `GbcMapCanvas`. A shared `useCanvasViewport` hook is noted as a follow-up, not done here, because doing it would touch the GBA canvas.

### Q3. Where the time-of-day toggle lives → **one app-level GBC setting, in the GBC header**

- Time of day changes pixels in both views (`renderGbcMap`'s `time` → `resolveFromTables`) and the meaning of grass encounters (morn/day/nite slots, `GbcSourceTags.time`).
- Per-view state would let the map view show nite while the world view and the gutter show day. That inconsistency answers no real question.
- So `GbcApp` holds `time: "morn" | "day" | "nite"`, default `"day"` (the CLI's default, `args.ts` `parseTime`), in a segmented control in the header next to the Map/World switch. It is passed down to `GbcMapCanvas` (`?time=`), `GbcWorldCanvas` (every placement's render URL) and `GbcEncounterGutter` (filters grass/fish rows by time).
- It is not persisted. That matches the GBA posture of per-session UI state.

### Other decisions made while grounding (each checked against code or corpus)

- **Event coordinates are in 16-px steps, not 32-px blocks.**
  - Checked: NewBarkTown is `map_const NEW_BARK_TOWN, 10, 9` (blocks), yet `warp_event 11, 13` and `bg_event 9, 13`. y=13 ≥ 9, so the unit must be the half-block step.
  - Collision quadrants are also 16 px (findings §3.3, `GetCoordTile`).
  - So `GbcMapCanvas` has **two grids**: blocks (32 px) for metatile ids and the grid overlay, and steps (16 px) for collision quadrants, events and the hover cell. Task 4 pins this with a real-map test.
- **The metatile thumbnail route is keyed by MAP, not tileset.** §6b sketched `/api/metatile/:tileset/:id.png`, but pixels depend on the map's palette (environment × time × group × tileset, findings §3.4) and roof tiles (`renderGbcMap`'s `roofSwappedTiles`, per group). The same tileset renders differently on two maps. The route is `/api/metatile/:map/:id.png?time=`, which mirrors GBA's layout-keyed route.
- **Group names.**
  - `constants/map_constants.asm` names each group (`newgroup OLIVINE ; 1`), but `loadGbcMaps` keeps only the index (`gbc/load/map.ts:34-35`).
  - Add a small additive core loader, `loadGbcGroupNames(root): string[]` (index i → name of group i+1), in `gbc/load/map.ts`. `GbcMap` is not changed.
  - `/api/groups` returns the existing `MapGroupsData` shape (`groupOrder` = names in `newgroup` order; `groups[name]` = map names in map-number order), so `MapTree` works unchanged.
- **Collision display.**
  - `GbcTileset.collision` stores numeric `COLL_*` values, and names are **not unique per value** (`collision_constants.asm` has duplicate `$00`, `$01`, `$07`, ...).
  - The payload carries `collisionInfo: Record<value, { names: string[]; category: "land" | "water" | "wall"; talk: boolean }>`, for the values this tileset actually uses. Categories come from `TileCollisionTable` (`parseTileCollisionCategoryTable`, low-nybble mask as in `loadGbcWaterCollisionValues`).
  - Add an additive core helper `loadGbcCollisionInfo(root)` next to `loadGbcWaterCollisionValues`, cached on `GbcProject`.
  - The overlay tints wall quadrants with `--overlay-collision` and water quadrants with `--encounter-water`, and leaves land untinted. Colour is never the only signal: the hover names the category.
- **Server shape.**
  - `createServer` calls `detectEngineFamily(projectPath)` once. For `gbc` it returns `createGbcServer(opts)` from the new `packages/server/src/gbcRoutes.ts` (the counterpart of `cli/src/gbcCommands.ts`).
  - For `gba` it runs today's body **unchanged**, except for one new route, `/api/project`.
  - `PokemapServer` becomes a discriminated union on `family` (no test reads `.project`; checked by grep).
  - Shared helpers (`readBody`, the `send`/400-vs-500 discipline, `encodePng`, `parseBorder`/`parseTime`) are reused, not copied: `readBody` is exported from `index.ts`, and the parsers come from `@pokemap/cli/src/args.js` as the GBA render route already does.
- **GBA-only routes on a GBC server** answer **501** `{ error: "<route> is not supported for gbc (pokecrystal-family) projects yet" }`, the HTTP counterpart of the CLI's `refuseIfGbc`. This covers `/api/warps/*`, `/api/dungeons*`, `/api/world/placement`, `/api/world/dungeons`, `/api/sign/*`, `/api/edit/*` and `/api/species/:s/icon.png`.
  - 501, not 404: the route exists, but this family doesn't support it.
  - Unknown routes stay a plain 404.
- **`serve.ts`:** `argv[2]` still wins; `--gbc` selects `cfg.gbc.projectPath`, and a missing `gbc` block refuses with a named message. One process per project. `.claude/launch.json` gains a `server` and a `server-gbc` entry, so the browser tooling can start each by name.

---

## File structure

| File | New/changed | Responsibility |
|---|---|---|
| `packages/core/src/gbc/wire.ts` | new, types only | `ProjectInfo`, `GbcGroupsPayload`, `GbcMapPayload`, `GbcCollisionInfo`, `GbcWorldPayload`, `GbcEncountersPayload`. Imported by the server (`satisfies`) and the UI (guards) |
| `packages/core/src/gbc/load/map.ts` | changed, additive | `loadGbcGroupNames(root)` |
| `packages/core/src/gbc/load/tileset.ts` | changed, additive | `loadGbcCollisionInfo(root)`: value → names[] + category + talk |
| `packages/core/src/gbc/project.ts` | changed, additive | cached `groupNames()`, `collisionInfo()` |
| `packages/server/src/index.ts` | changed | family branch at the top of `createServer`; `/api/project` (gba); export `readBody`; `PokemapServer` union |
| `packages/server/src/gbcRoutes.ts` | new | `createGbcServer`: every GBC route, plus the 501 refusals |
| `packages/server/src/serve.ts` | changed | `--gbc` flag |
| `packages/server/test/gbcRoutes.test.ts` (+ `gbcWorldRoutes.test.ts`) | new | Route tests against real PerfPlus (`describe.skipIf(!hasGbcProject(GBC_SUBJECT_ROOT))`, hooks inside) |
| `packages/ui/src/Root.tsx`, `packages/ui/src/main.tsx` | new / changed | Family bootstrap: `/api/project` → `<App/>` or `<GbcApp/>`; load/error states |
| `packages/ui/src/gbc/GbcApp.tsx` | new | GBC shell: header (Map/World, time of day), `MapTree`, view switch |
| `packages/ui/src/gbc/hooks/{useProjectInfo,useGbcMap,useGbcWorld,useGbcCoverage}.ts` | new | Fetch + runtime shape guards |
| `packages/ui/src/gbc/guards.ts` | new | `isGbcMapPayload` etc. |
| `packages/ui/src/gbc/GbcMapCanvas.tsx` | new | Map view: 32-px blocks, 16-px steps, overlays, hover |
| `packages/ui/src/gbc/GbcMetatilePalette.tsx` | new | Read-only metatile grid, hovered id highlighted |
| `packages/ui/src/gbc/GbcWorldCanvas.tsx` | new | World view: cull, LOD, conflict badges, hover, jump, lens tints |
| `packages/ui/src/gbc/GbcEncounterGutter.tsx` | new | Text-chip gutter grouped by method/tags, filtered by time |
| `packages/ui/src/components/{LensPanel,SpeciesSpotlight}.tsx` | changed, additive | Optional `methodKey` prop; structural hit type |
| `packages/ui/src/styles.css` | changed, additive | `--encounter-headbutt` token + any `gbc-*` classes; DESIGN.md gets the token |
| `packages/ui/test/gbc/*.test.tsx` | new | Component/hook tests (no jest-dom) |
| `.claude/launch.json` | changed | `server`, `server-gbc` entries |

---

## Tasks

Process for every task (the user's brief and RESUME's lessons):
- Re-granularise into `task-N-spec.md` against the real code.
- Sonnet implementer (TDD, commit green work early).
- Opus spec review for payload/route design and anything hand-derived; Sonnet quality review.
- **Mutation-check every guard.** The coordinator re-runs the surviving mutations on the final fix commit.
- **GBA regression gate:** `npm test` has exactly the baseline's 6 failures and no new ones, and `npm run typecheck` is clean.
- UI tasks are live-verified in real Chromium, with screenshots that are looked at.
- Reports go to `task-reports/pokemap-plan-6b-gbc-app-layer/` and are archived to `_archive/` on pass.
- Commits use `git add <named paths>` and Conventional Commits.
- Never commit `pokemap.config.json`.

UI briefs must state up front:
- no `@testing-library/jest-dom` (use `.getAttribute`, `.disabled`, `document.body.contains`);
- real token names only (`--border`, `--bg-panel-raised`, `--bg-selected` + `--border-strong`, `--warn`);
- no shared `.btn` class;
- modal shells mirror `SaveDialog.tsx`;
- every fetch validates its shape and has a visible `.catch`.

`frontend-design`/`ui-ux-pro-max` are not installed in the cloud session. UI tasks follow `DESIGN.md` directly and record that in the report.

### Task 1: Server family branch + `/api/project` + GBC groups/map/render/metatile routes

Scope:
- the `wire.ts` types for these routes;
- `loadGbcGroupNames` and `loadGbcCollisionInfo`, plus the `GbcProject` caches;
- `createServer`'s family branch and `PokemapServer` union;
- `/api/project` for both families;
- the `gbcRoutes.ts` routes:
  - `GET /api/project`;
  - `GET /api/groups`;
  - `GET /api/map/:name`;
  - `GET /api/render/:name.png?border=0..paddingWidth&time=morn|day|nite`;
  - `GET /api/metatile/:map/:id.png?time=`;
  - the 501 refusals;
- `serve.ts --gbc`;
- the `launch.json` entries.

`GbcMapPayload`:
- `family: "gbc"`;
- `map`: the `GbcMap` header, with connections;
- `layout: { blkPath, width, height, writable }`;
- `blocks: { metatileId }[]`, exactly w×h;
- `metatileCount`;
- `tileset: { constName, name }`;
- `collision: Collision[]` (per metatile);
- `collisionInfo` (only the values used);
- `events: GbcMapEvents`;
- `defects: DataDefect[]` (layout + events);
- `paddingWidth`.

Route rules:
- An unknown map is a 404.
- A bad `border` or `time` is a 400 naming the parameter, not the 500 that `renderGbcMap`'s own throw would become.
- A metatile id that isn't a non-negative integer is a 400.
- An out-of-range id is a 404. Don't render a placeholder silently.
- PNG cache keys include **every** input (`name:border:time`, `map:id:time`), per the Plan 0 §7 "cache key dropped border" lesson; the tests request two values of each input.

Tests pin real PerfPlus values:
- NewBarkTown's group name, 10×9, `TILESET_JOHTO`, and its 4 warps;
- CeruleanCave2F `writable: false` plus the defect;
- a `border $00` interior (ElmsLab);
- time-of-day PNGs that differ;
- border 3 = (w+6)·32 px, border 4 → 400.

**GBA gate.** Plus:
- `api.test.ts` gets `/api/project` → `gba`;
- a family-detection test proves a GBA root never reaches `gbcRoutes`, and vice versa.

### Task 2: GBC world + atlas routes

- `GET /api/world` → `GbcWorldPayload`:
  - `placements: Record<name, Placement>` (blocks);
  - `components`, `conflicts`, `blockPx: 32`;
  - `buildGbcWorld`, computed once and cached (read-only).
- `GET /api/encounters/:map` → `{ mapName, sources: GbcEncounterSource[], defects }`.
- `GET /api/where/:species`:
  - normalises case and a `SPECIES_` prefix exactly like `gbcCommands.ts` `normalizeSpecies`. Move that function to core or export it, so there is one implementation;
  - returns `GbcSpeciesHit[]`.
- `GET /api/coverage` → `GbcCoverage`, cached.
- `GET /api/species` → sorted bare species constants (`loadGbcSpeciesConstants`), cached.
- Tests pin real values:
  - the conflict count (2);
  - the component count;
  - a known map's sources: tags, and percents summing to 100 per source;
  - `where DUNSPARCE`, including a lowercase and a `SPECIES_`-prefixed query;
  - coverage counts cross-checked against `runGbcCoverage --json`.
- **GBA gate.**

### Task 3: UI family bootstrap + GBC shell

- `Root.tsx`:
  - fetches `/api/project` once, with a type guard;
  - `gba` → `<App/>`, byte-identical behaviour;
  - `gbc` → `<GbcApp/>`;
  - a loading state, and a visible error state on failure or a bad shape.
- `main.tsx` mounts `Root`.
- `GbcApp`:
  - header with the title, the Map/World switch, the time-of-day segmented control (`role="group"`, `aria-pressed`, `map-canvas__btn`) and the selected map name;
  - sidebar `MapTree` fed by `/api/groups`;
  - main area: placeholder "Select a map", or the view.
- Tests (no jest-dom):
  - `Root` routes each family;
  - a `/api/project` failure shows an error;
  - the GBC header toggles time;
  - the GBA `App` tests are untouched and green.
- **Live-verify:**
  - GBC server + UI: the tree shows real group names;
  - GBA server + UI: the app is unchanged.
  - Screenshots of both.
- **GBA gate.**

### Task 4: Read-only GBC map view

- `useGbcMap(name)` with the `isGbcMapPayload` guard.
- `GbcMapCanvas`:
  - `/api/render/:name.png?border=1&time=`;
  - geometry from the payload: `(w + 2)·32` wide, origin 32;
  - zoom 1×/2×/4× and Fit; drag-pan; native wheel;
  - overlays:
    - Grid: 32-px blocks;
    - Collision: 16-px quadrants, wall/water tints from `collisionInfo`;
    - Events: 16-px steps, one hue per kind using the existing `--event-*` tokens (object/warp/coord/bg), with the legend row shared with `map-canvas__legend`;
  - status strip:
    - tileset + metatile count;
    - hover: block (bx,by), step (sx,sy), metatile id (hex), the 4 quadrants each as `names[0]` (with `+N` if aliased) and category, with the hovered quadrant marked, and the event under the step, if any.
- `GbcMetatilePalette`:
  - read-only grid of `/api/metatile/:map/:id.png?time=` thumbnails (32 px);
  - the hovered block's id is highlighted (`aria-current`) and scrolled into view;
  - no selection writes.
- Defect banner (`role="alert"`, the `app__event-op-error` look) for `payload.defects`; CeruleanCave2F names its `.blk` and "not writable".
- Tests:
  - geometry/origin math for a known payload;
  - a quadrant hit test (step → quadrant index TL/TR/BL/BR, per `GetCoordTile`: +1 odd x, +2 odd y);
  - the event step hit test;
  - overlay composition leaves a no-collision cell byte-identical to the base (Plan 0 §7);
  - the `time` change changes the URL.
- **Live-verify:** criterion 1, fully.
- **GBA gate.**

### Task 5: GBC world view

- `useGbcWorld` with a guard.
- `GbcWorldCanvas`:
  - placements in blocks × 32 px;
  - viewport culling and LOD (the `WorldCanvas` technique, with its own constants: zoom = screen px per block, native 32);
  - per-placement image `/api/render/:map.png?time=`, cache keyed by map + time;
  - conflict badges on both maps of each conflict, with the tooltip giving the `(dx,dy)` disagreement (the CLI's `noteLines` wording);
  - hover tooltip (map name, component);
  - click a map → select it (the tree highlight), double-click → open it in Map view;
  - the tree click jumps to it (`jumpToMap`/`jumpToken`, as in `WorldCanvas`);
  - Fit via `computeFit`.
- Tests: culling math, the fit pin, the badge placement for a fixture conflict, and the time in the URL.
- **Live-verify:** criterion 2.
- **GBA gate.**

### Task 6: Encounter lenses, gutter, spotlight (GBC)

- `GbcEncounterGutter`:
  - text chips, fetched lazily per visible map (the `WorldCanvas` encounter-cache pattern);
  - rows grouped by method with tags (`grass · morn`, `fish · good rod`, `headbutt · rare`, `swarm`), filtered to the app-level time for time-tagged sources;
  - true percentages, never slot counts;
  - collapses to a species-count badge below the LOD threshold.
- `LensPanel`, reused with a GBC `methodKey` (water/fish/headbutt/rock; add `--encounter-headbutt` to `styles.css` and `DESIGN.md`):
  - the level-curve lens (`GbcCoverage.levelByMap`, already keyed by name);
  - the empty-maps lens;
  - the unused-species count;
  - the method lens.
- `SpeciesSpotlight`, reused: GBC hits dim non-matching maps.
- Tests:
  - the chip rows for a fixture source set, including the time filter;
  - the method-lens tint precedence;
  - the spotlight feeds `mapName`s.
- **Live-verify:** criterion 3.
- **GBA gate.**

### Task 7: Close-out

1. Re-run criteria 1-4 end to end in one browser session. Screenshots go in the report.
2. The GBA smoke test: open a map, overlays, and the world view against the subject.
3. The full GBA gate.
4. Update docs:
   - RESUME (state table, running instructions: `serve.ts --gbc`);
   - the roadmap §6 status row;
   - this plan's STATUS banner with the real file map.
5. Archive the reports, push, open the PR.

---

## Risks

| Risk | Mitigation |
|---|---|
| The family branch changes GBA server behaviour | The GBA body is untouched except for `/api/project`. The GBA gate runs after every server task. A test proves a GBA root never reaches `gbcRoutes` |
| `Root.tsx` breaks GBA UI boot | `App` is not modified. The GBA live smoke runs in Task 3 and Task 7 |
| Duplicated canvas logic drifts from the GBA fixes | GBC briefs cite each MapCanvas/WorldCanvas postmortem pattern by line. Reviewers check them. The follow-up extraction is noted |
| A wrong unit (block vs step) misplaces events or collision | Pinned against real NewBarkTown data in Task 4, and live-verified |
| A per-map metatile palette looks wrong on a roofed map | The route is keyed by map, and the Task 1 test compares a thumbnail with the matching 32×32 region of the map render |
