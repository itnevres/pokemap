# Plan 9 Task 12: live acceptance of the unified family shell

## Environment
- Repo branch plan-9-family-shell, HEAD 9d117df. Vite (root packages/ui, port 5183, proxy to 5184) + hub on 5184 (preload remaps 5174 to 5184).
- Browser: headless Chromium over CDP (127.0.0.1:9333) driven by playwright-core (Playwright MCP not used; CDP fallback per LESSONS). Scripts in scratchpad `live/`.
- Subject: GBA `C:\Programming Projects\Pokemon Game\game` (map Route29, dungeon "Kanto Safari Zone"); GBC PerfPlus (below).
- Snapshot: `live/snap/` + `snap.sha256` (9,608 files) taken by the earlier (rate-limit-killed) run; orchestrator verified both projects byte-identical to it before this run started. `world.json` written by the item-7 drag was restored by copy from snap (verified with cmp) right after.
- Viewport height 800; widths 1280 and 1024.

## GBA results

**GBA 1. Rail at 1280/1024: 1280 PASS, 1024 FAIL (finding F1).**
- 1280: Map view `scrollWidth 1280 == clientWidth 1280`; in-context same (1280/1280). Collision tool pressed: first child of `.edit-rail` is `collision-palette` (top 83 == rail top 83), then metatile palette, event inspector. Screenshots `task-12-gba-1-collision-rail-1280.png`, `task-12-gba-1-incontext-1280.png`.
- 1024: Map view `scrollWidth 1067 > clientWidth 1024` FAIL; in-context also 1067. Collision palette is still at the rail top (top 98 == rail top 98). Screenshots `task-12-gba-1-collision-rail-1024.png`, `task-12-gba-1-incontext-1024.png`, `task-12-gba-1-overflow-1024.png`. Width 1100 passes (1100/1100). Cause in F1.

**GBA 2. Shortcuts and ignore rules: PASS.**
- Keys on fresh load (initial tool none): p/r/b/i/s/c select Pencil/Rect/Bucket/Dropper/Shift/Collision; Ctrl+P does not change the tool.
- Palette search ("Search by hex id…") with Rect active: typed `pbc`, tool stayed Rect, value `pbc`.
- Event inspector X input (event selected, no tool): typed `pbrisc`, tool stayed none, value unchanged `55`, dirty false; `f` there did not change the canvas hash. Screenshot `task-12-gba-2-inspector-typing.png`.
- Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z (mouse parked off-canvas to avoid the pencil preview ghost): paint changed canvas, Ctrl+Z restored the pre-paint hash, Ctrl+Y == painted hash, Ctrl+Shift+Z == painted hash; Undo/Redo enabled states followed; Discard restored the original hash.
- SaveDialog open (`[aria-modal]` count 1): r b i s c f Ctrl+Z Ctrl+Y Ctrl+Shift+Z: tool stayed Pencil, dirty stayed true, canvas hash unchanged, undo/redo stayed enabled-as-before; Escape then closed the dialog. Screenshot `task-12-gba-2-savedialog-open.png`.
- F (R5), compare each view's F against its own Fit button via pixel diff after pan+zoom away: Map view F vs Fit 0.0 differing pixels (away-vs-fit 0.85); World view F vs Fit 0.0 (zoomed 0.176, panned 0.188, then F again 0.0); World view has exactly 1 `Fit` button; Dungeon view (Kanto Safari Zone) F vs Fit 0.00063 (away 0.91), 1 Fit button. In-context: F vs Fit button 0.0 (screenshots `task-12-gba-2-F-ctx-F-key.png`, `task-12-gba-2-F-ctx-Fit-button.png`); both leave the 1x step pressed, as Map view's Fit does (`task-12-gba-2-F-ctx-mapview-fit.png`; map stage 740x647 vs ctx canvas 500x614, so a pixel crop compare is not meaningful, zoom step equality used instead). Other screenshots `task-12-gba-2-F-map.png`, `-F-world.png`, `-F-dungeon.png`.
- Ctrl+F: keydown `["f", ctrl=true, defaultPrevented=false]`, canvas unchanged (browser find stays available).

**GBA 3. Paint + save, reverse: PASS.**
- Map view: Route29 cell (dropper read 0xDC) painted 0x1 (hover read `id 0xdc` before), dirty true, Save dialog -> Save Changes -> dirty false, no alerts; reverse paint back to 0xDC + save; live `data/layouts/Route29/map.bin` sha256 `bcf8388e...f245` == snapshot. Screenshot `task-12-gba-3-map-painted-saved.png`.
- In-context (World, double-click the map): dropper read 0x1A, painted 0x1, saved (dirty false, no alerts), reverse painted 0x1A, saved; map.bin sha256 again identical to snapshot. Screenshots `task-12-gba-3-ctx-painted.png`, `task-12-gba-3-ctx-restored.png`.

**GBA 4. Dirty switch confirm: PASS.** Painted, clicked NewBarkTown in the tree: `confirm: "You have unsaved changes on this map. Discard them and switch maps?"`. Dismissed: stays on Route29, dirty true. Accepted: switches to NewBarkTown, dirty false; map.bin unchanged vs snapshot. Screenshots `task-12-gba-4-dirty-switch-cancelled.png`, `-accepted.png`.

**GBA 5. Add Sign opens and cancels: PASS.** "Add Sign" opens a modal ("Add Wild Sign" with species rows), Cancel closes it (modal count 0, dirty false, no alerts). Screenshot `task-12-gba-5-add-sign-open.png`. (An "Add Event" click is a different control that adds an event and dirties; not part of this item.)

**GBA 6. Hover-link and Follow hover: PASS.**
- Hover-link: hovering the map cell with id 629 highlights palette cell `metatile 0x275` (`.metatile-palette__cell--hovered`), a different cell elsewhere highlights `0x15`; after switching map to NewBarkTown there is no hovered cell (null).
- Follow hover ON: palette scrolled to top (scrollTop 0), hover id 629: hovered cell brought into view, scrollTop 1655, inView true. Screenshot `task-12-gba-6-hover-follow-on.png`.
- OFF: scrollTop 0, hover id 629: cell 0x275 highlighted but NOT in view, scrollTop stays 0. Screenshot `task-12-gba-6-hover-follow-off.png`.
- Persistence: localStorage `pokemap.palette.followHover` = "off"/"on"; switch state survives a reload (set on, reload, `aria-checked=true`). Left ON for the GBC leg (family-switch check there).

**GBA 7. Issue #4: PASS with finding F2.**
- World view shows only non-hidden types: `/api/world` placements by type: TOWN 29, ROUTE 119, CITY 17, OCEAN_ROUTE 14, UNDERWATER 4, NONE 3 (+1 manual NONE `NewBarkTown_Lab` in the sidecar); no INDOOR placed. Tree: 1209 maps, 1025 greyed, 184 not greyed = 183 non-hidden-type placements + the 1 manually placed map. Indoor maps (NewBarkTown_House1, PlayersHouse_1F, PokemonCenters, Gyms...) are greyed, towns/routes are not. Screenshots `task-12-gba-7-world-view.png`, `task-12-gba-7-tree-greyed.png`.
- Drag: greyed (title "Not currently drawn in the world view - click to reveal, or drag onto the canvas to place it", draggable true) `NewBarkTown_House2` dragged onto the world viewport: `POST /api/world/placement`, `.pokemap/world.json` gained a manualPlacements entry (366,669), after a reload the row is no longer greyed (1024 greyed). Screenshot `task-12-gba-7-after-drag.png`. world.json restored from snapshot.

## GBC (PerfPlus) results (subject map Route29, 30x9; hub run on the PerfPlus path)

**GBC 1. Rail at 1280/1024: PASS.** Map view 1280/1280 and 1024/1024 (`scrollWidth == clientWidth`); in-context 1280/1280 and 1024/1024; rail order `gbc-metatile-palette`, `event-inspector`; no Collision tool (a "Collision" overlay toggle exists in the canvas header, not a tool). In-context shows rail and toolbar at both widths. Screenshots `task-12-gbc-1-rail-1280.png`, `-1024.png`, `task-12-gbc-1-incontext-1280.png`, `-1024.png`. (One 1280 enter-context attempt in a batch gave no context, an unrepeated timing flake; a rerun entered it.)

**GBC 2. Shortcuts, ignore rules, F: PASS.**
- Keys: p/r/b/i/s select Pencil/Rect/Bucket/Dropper/Shift; `c` leaves the tool unchanged (no Collision tool, absent tool ignored); Ctrl+P no change.
- Event inspector number input (object event "SPRITE_FRUIT_TREE", X=12): typed `pbrisc`, `f`, Ctrl+Z: tool stayed none, value `12`, dirty false, canvas unchanged. Ctrl+F keydown `["f", ctrl, defaultPrevented=false]`. Screenshot `task-12-gbc-2-inspector-typing.png`. (The GBC palette has no search box, so that ignore rule does not apply to GBC.)
- Undo/Redo: Ctrl+Z restored the pre-paint hash, Ctrl+Y and Ctrl+Shift+Z returned to the painted hash; Undo/Redo states followed.
- SaveDialog open: r b i s c f Ctrl+Z Ctrl+Y: tool stayed Pencil, dirty stayed true, canvas unchanged, undo/redo states unchanged. Screenshot `task-12-gbc-2-savedialog-open.png`.
- F vs Fit (pixel diff): Map view 0.0 (away 0.82); World view 0.0 (zoomed 0.057, panned 0.064, F again 0.0); 1 `Fit` button in World view; Dungeon view F 0.0 (needs a dungeon: none exist in PerfPlus, so I created `AcceptF` through "+ New Dungeon" (seed Route29), then removed the resulting `.pokemap` dir; the dungeon canvas is small so pan/zoom-away only changed 1.2% of pixels, weak evidence for that view); 1 Fit button there. In-context F vs Fit button 0.0, and ctx F is pixel-identical to Map view Fit (offset 0,0, 0.0 differing; ctx canvas 740x623 vs Map view 740x631 only because the viewport band differs); both leave the 1x step selected. Screenshots `task-12-gbc-2-F-map.png`, `-F-world.png`, `-F-dungeon.png`, `-F-ctx-F-key.png`, `-F-ctx-Fit-button.png`, `-F-ctx-mapview-fit.png`, `task-12-gbc-2-dungeon-view.png`, `task-12-gbc-2-newdungeon.png`.

**GBC 3. Paint + save, reverse: PASS.**
- Map view: painted 0x1 at one Route29 block (original 0x02 found by `cmp -l`: the Dropper in GBC does not mark a palette cell, so I could not read it first), saved (dirty false, no alerts), then reverse painted 0x2 and saved; `maps/Route29.blk` `cmp` identical to snapshot. Screenshot `task-12-gbc-3-map-painted-saved.png`.
- In-context: painted 0x1 (original 0x5F by `cmp -l`), saved, reverse painted 0x5F and saved; `.blk` identical to snapshot. Screenshots `task-12-gbc-3-ctx-painted.png`, `-ctx-restored.png`. Observation: the dirty indicator and Undo state read false for up to ~300-500 ms after a paint (GBC edit session is async) and were true at 1.5 s, in both Map view and in-context; Save was disabled at 300 ms and enabled at 1.5 s.

**GBC 4. Dirty switch: PASS.**
- Discard path: painted, clicked NewBarkTown: `confirm: "You have unsaved changes on this map. Discard them and switch maps?"`, accepted, switched, dirty false, no alert. Screenshot `task-12-gbc-4-dirty-switch-discard.png`.
- Forced discard failure (`page.route("**/api/edit/*/discard" -> 500)`, then `unroute`): painted, clicked NewBarkTown: alert `POST /api/edit/Route29/discard -> 500`, user stays on Route29, dirty true. Screenshot `task-12-gbc-4-switch-error.png`. After unroute, a real Discard Changes cleared dirty; the stale `switchError` alert stayed visible until the next map selection (minor observation, spec says `onSelected` clears it). `.blk` identical to snapshot.

**GBC 5. Time of day and defects banner: PASS.** Morn/Nite/Day: `aria-pressed` follows (Morn=true; Nite=true; Day=true, exclusive) and the canvas hash differs for all three (3 distinct values). Screenshots `task-12-gbc-5-time-Morn.png`, `-Nite.png`, `-Day.png`. CeruleanCave2F: banner `maps/CeruleanCave2F.blk: actual size 400 bytes, declared 9x15=135 -- loaded first 135 bytes, not writable` + `warp[0] at (23,7) is outside ...` in Map view and in-context (non-dismissible). Screenshots `task-12-gbc-5-defects-CeruleanCave2F-map.png`, `-ctx.png`.

**GBC 6. Hover-link and Follow hover: PASS.**
- Highlight follows the cursor (GBC palette marks the hovered cell with `--selected`): hovering id 0x65 highlights `metatile 0x65`; after a map switch no cell is highlighted.
- Follow ON (state read "true" at start, carried over from the GBA leg through the shared localStorage key `pokemap.palette.followHover`, so the choice survives a family switch): scrollTop 0, hover 0x65: cell in view, scrollTop 82. Follow OFF: scrollTop stays 0, cell highlighted but not in view. After reload the OFF state persisted. Left ON as found. Screenshots `task-12-gbc-6-hover-follow-on.png`, `-off.png`.

**GBC 7. Issue #4: PASS.** `/api/world` types: TOWN 23, ROUTE 54, CAVE 42, DUNGEON 39, INDOOR 208, GATE 25 (391 maps). Tree: 391 rows, 233 greyed = INDOOR 208 + GATE 25, 158 not greyed = TOWN+ROUTE+CAVE+DUNGEON; Pokecenters/Gyms/Houses/Gates greyed. Drag of greyed `OlivinePokecenter1F` onto the world: `POST /api/world/placement`, row un-greys immediately (233 to 232), manual placement (140,242) written to a new `.pokemap/world.json`. Screenshots `task-12-gbc-7-world-view.png`, `task-12-gbc-7-tree-greyed.png`, `task-12-gbc-7-after-drag.png`. PerfPlus had no `.pokemap/` before; the dir I created (`world.json`, `dungeons.json`) was removed and `git status --porcelain` matches the pre-run file.

## Findings
- **F1 (bug, GBA 1024 px, Plan 9 item 1 fails).** GBA at viewport 1024x800, Route29, Map view: `documentElement.scrollWidth` 1067 > `clientWidth` 1024 (also in-context). The toolbar (`.toolbar`, 744 px wide at main width 744) has `scrollWidth` 787; the "Discard Changes" button ends at x=1067 and the rail's palette cells at 1051. At 1100 px it is fine; GBC fits at 1024. Repro: open GBA project at 1024-wide window, select Route29 (or any map): horizontal scrollbar. Screenshot `task-12-gba-1-overflow-1024.png`.
- **F2 (minor, GBA only).** Dragging a greyed map (e.g. NewBarkTown_House1) onto the World canvas places it (POST ok, world.json updated) but the tree row stays greyed (1025 greyed) for at least 6 s, until switching Map/World view or reloading. GBC un-greys at once (233 to 232). Not checked whether it predates Plan 9.
- **O1 (observation).** GBC stale `switchError` banner stays after a successful Discard Changes on the same map (see GBC 4).
- **O2 (observation).** GBC dirty/undo state lags ~0.3-0.5 s behind a paint.

## Skipped / caveats
- Playwright MCP not used; headless Chromium over CDP with playwright-core (LESSONS fallback). No `.playwright-mcp/` files created by me.
- GBA in-context F vs Map view Fit: compared by zoom step (both 1x) and F-vs-Fit-button pixel diff; a pixel crop compare was not meaningful for GBA (map anchored bottom-right in the larger Map view stage). GBC has the exact pixel match.
- Ctrl+F opening the browser's find UI cannot be seen headless; checked that the F handler does not `preventDefault` and does not act (canvas unchanged).
- Dungeon view F evidence in GBC is weak (see above); GBA dungeon view (Kanto Safari Zone) pan-away changed 0.91 of pixels and F matched Fit (0.00063).

## Snapshot verification (Step 4) and cleanup
- `sha256sum -c` of all 9,608 entries in `snap.sha256` against the live GBA and PerfPlus files at the end: 0 mismatches (map.bin / .blk matched after reverse paints). `git diff | sha256sum` GBA `98d66ff1...ad1a` and PerfPlus `e3b0c442...b855` equal `diffhash-before.txt`; `git status --porcelain` equals the before files in both projects.
- Differences found and restored: during the run GBA `.pokemap/world.json` changed (item 7 drag; restored by copy from snap, verified with cmp, before the GBC leg); PerfPlus `.pokemap/` (absent at start) was created by the item-7 drag and the Dungeon test and removed. Neither is a product bug (expected sidecar writes).
- Hub stopped by port 5184 (0 listeners). No `.playwright-mcp/` files created (the existing ones predate this run). Vite (5183) and the headless Chromium (9333) from the earlier run are still running; nothing committed.

## Orchestrator follow-up (2026-10-15)

- Independent re-check after this run: all 9,608 snapshot hashes match (`sha256sum -c`), both projects' `git diff | sha256sum` equal `diffhash-before.txt`, both `git status --porcelain` equal the before files; PerfPlus has no `.pokemap/`. Leftover Vite (5183) and headless Chromium (9333) from the runs stopped.
- **F1 fixed** (`fix(ui): editing toolbar wraps…`): `.toolbar` gets `flex-wrap: wrap; row-gap; min-width: 0` + a CSS pin test. Live, GBA Route29 at 1024x800: Map view 1024/1024, in-context 1024/1024, toolbar 744/744 (wraps to 76 px). Screenshots `task-12-gba-1-F1-fixed-map-1024.png`, `task-12-gba-1-F1-fixed-incontext-1024.png`.
- **F3 (new, from the F1 screenshot):** the palette's Follow hover switch put its text inside the 34x18 `.world-canvas__switch` pill: clipped, overflowing the rail. Fixed (`fix(ui): Follow hover uses the World-bar switch pattern…`): pill holds only its thumb, `aria-label="Follow hover"`, label span beside it, plus a markup test. Live screenshot `task-12-gba-1-F3-follow-map-1024.png`. GBC palette header not re-checked live (same component).
- F2 and the two observations are left for the final review's triage.
