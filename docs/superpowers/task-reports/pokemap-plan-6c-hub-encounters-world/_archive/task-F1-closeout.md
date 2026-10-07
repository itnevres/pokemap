# F1 close-out: criteria 1-9 end to end (2026-10-06)

The demo ran in one Chromium session (Playwright MCP, 1280×800, `visibilityState` visible) against the real `serve.ts`:
- **Hub:** run with **no args**, its `listen(5174)` remapped to 5184 by the documented preload. It was restarted once, for criterion 1.
- **Vite:** dev server on 5183 with StrictMode on, proxying `/api` to the hub.
- **Scratch home:** a fresh, empty `POKEMAP_HOME` (`…/pokemap-phase-d-coordinator/f1-home`).
- **Projects:** the GBA subject (`C:\Programming Projects\Pokemon Game\game`) and PerfPlus.

**Snapshots first.** Before the demo, the subject's porcelain, `.pokemap/world.json` (`b285bbf…`), `.pokemap/dungeons.json` (`f73f9b7…`) and NewBarkTown `map.bin` (`fa1462b…`) were copied to `…/f1-snapshot/`. PerfPlus started clean, with no `.pokemap`.

Screenshots were looked at; they are in the scratch folder `…/f1-shots/`.

## Criteria

| # | Evidence |
|---|---|
| 1 | <ul><li>`GET /api/hub` returned `{"current":null,"recent":[]}`, and `/api/world` returned 503.</li><li>The UI showed "Open a project". The folder browser went C: → Programming Projects → Pokemon Game, where `game` carried a **GBA** badge; Open loaded the GBA app.</li><li>Header switcher → browse → `pokecrystal-PerfPlus` → Open showed the GBC app (the "Time of day" group). Switcher → recent "Pokemon Game" brought back the GBA app.</li><li>With an unpainted-then-painted, unsaved NewBarkTown edit, switching produced the confirm "1 map(s) have unsaved edits… NewBarkTown" (the server answered 409). Cancel kept GBA with Save and Undo still enabled. Discard Changes then cleared it, and `map.bin` was unchanged.</li><li>Killing the hub and restarting it with no args gave `current` = the GBA subject (reopened from `recent.json`).</li></ul> |
| 2 | <ul><li>**GBC, Route30, World:** the strip sits on Route30's **left** side (the first free side, U4). 73 sprites were on screen.</li><li>The tooltip reads "Hoothoot · Grass · nite 55% Lv 2-7+ · rate 9.8% · Headbutt · common 50% Lv 10 · Headbutt · rare 50% Lv 10 · + = level can roll up to 4 higher".</li><li>At **Morn**, 7 sprites were dimmed (for example "Geodude, not encountered at morn").</li><li>The **Map view** toggle exists in both families: GBC Route30 showed 13 sprites, GBA Route102 showed 11.</li><li>The **GBA world** border on Route102 had 11 sprites from `/api/species/SPECIES_POOCHYENA/icon.png`…, with the tooltip "Poochyena · Land 30% Lv 3-4".</li></ul> |
| 3 | <ul><li>**GBA:** Empty maps → List them gave 982 entries. Clicking Route23 jumped to it and selected it in the tree. Unused species listed 730 by name.</li><li>**GBC:** 266 empty maps; clicking TinTower1F jumped and selected it. Unused species → Show list gave 70 names with icons.</li></ul> |
| 4 | In both families, with the Empty maps legend open the legend renders as `.world-canvas__legend-row`, and `elementFromPoint` at the Encounters toggle's centre returns `encounter-border__toggle`. |
| 5 | <ul><li>**GBA:** Route10's tree row was scrolled off-screen. A single world click selected Route10 and its row is now visible.</li><li>**GBC:** the same with Route29.</li></ul> |
| 6 | <ul><li>**GBA:** Route111 badge right-click gave `[Open in Map view, Edit here, Accept conflict]` → "19 conflicts · 1 accepted". A reload kept "1 accepted". Un-accept gave "0 accepted".</li><li>**GBC:** Route17's menu shows the disabled `Edit here GBC editing arrives with Plan 7` → "2 conflicts · 1 accepted". A reload kept it; Un-accept gave 0.</li></ul> |
| 7 | <ul><li>**GBC:** 158 of 391 maps draw by default, and 233 tree rows are greyed.</li><li>Gaps: IlexForest–Route34 15 blocks; DarkCaveVioletEntrance–Route31 touching; BurnedTower1F 4 blocks from EcruteakCity; B1F 4 blocks from 1F.</li><li>Warps: 10 markers.</li><li>Dungeon tab: a new group BurnedTower1F + B1F (scoped to `2 maps`) drew 18 connection lines; it was then deleted, leaving `/api/dungeons` = `[]`.</li></ul> |
| 8 | <ul><li>**Into context:** double-clicking NewBarkTown (GBA World) shows Pencil and EventInspector around the same world, plus the overlay bar.</li><li>**Paint and save:** Pencil + metatile 0xC6 on a tree tile, then Done (dirty) → SaveDialog → Save Changes, gave `POST …/commit`, then exactly one `GET /api/render/NewBarkTown.png?v=2`. The world tile under the paint went from (67,139,47) to (109,180,119). (An earlier grass-on-grass paint, 0x00 → 0x01, saved via `?v=1` but was visually identical.)</li><li>**Map-view routes:** right-click → "Open in Map view" switched to Map/CherrygroveCity, and Shift+double-click switched to Map/VioletCity with no context overlay.</li><li>**GBC:** a double-click opens the Map view, and "Edit here" is disabled (criteria 6/7 run).</li><li>**Restore:** reverse-painting the original ids (tile (4,14) → 0x0, tile (4,29) → 0x1C) in the Map view and saving made `map.bin` **byte-identical** to the snapshot.</li></ul> |
| 9 | Final gate below. |

## GBA smoke test

- **Map view:** Grid, Collision and Events overlays are on.
- **World:** criteria 2-6 and 8 above.
- **Dungeon tab:** "Kanto Safari Zone" (20 maps) opens as a scoped world.
- **Save round trip:** criterion 8, restored byte-identical.

## Restoration (verified after the servers stopped)

- **GBA subject:**
  - `world.json` was re-serialized by criterion 6 with a defaulted `acceptedConflicts: []`. It was restored by copying the snapshot bytes and checked `cmp`-identical.
  - `dungeons.json` and NewBarkTown `map.bin` are identical.
  - The porcelain is identical (HEAD `718b89f`, the 6 pre-existing `M` files plus the untracked `docs/human-tasks-notes.md`).
- **PerfPlus:** the `.pokemap/` created by criteria 6/7 held only defaults (`dungeons: []`, `acceptedConflicts: []`). It was removed. PerfPlus is clean, with no `.pokemap`.
- **Playwright log:** this session's MCP console log was removed; the 3 older logs were left.

## Notes

- **Browser noise.** `ERR_NO_BUFFER_SPACE` showed once (on `/api/encounters/Route37`) when many fetches ran in parallel under headless Windows. It is environmental and was seen before.
- **Cosmetic, deferred.** The encounter sprite tooltip clips at the viewport's left edge when a strip sits at that edge (seen on GBA Route102).
