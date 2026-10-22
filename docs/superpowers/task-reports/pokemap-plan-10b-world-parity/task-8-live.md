# Plan 10b Task 8: live acceptance (2026-10-22)

Branch `plan-10b-world-parity` at `d9d502d`. Hub = real `serve.ts` via the 5174->5184 preload, scratch `POKEMAP_HOME`, one hub per subject (GBA first, then PerfPlus); Vite 5183; headless Chromium shell 1248 via cached `playwright-core`. Drivers in `shots/` (`lib.mjs`, `gba-a*.mjs`, `b2.mjs`, `c.mjs`, `d1.mjs`, `e.mjs`). Backups in `live-backup/` (Route101 map.json, layouts.json, Zygarde map.bin, GBA `.pokemap/`, CeruleanCave2F.blk). Only the hub and Vite this run started were stopped.

## Results

| Check | Result | Evidence |
|---|---|---|
| a. GBA F2 tree drop and rail drop | PASS (note: slow with auto-layout on) | see below |
| b. GBA Duplicate object + sign, Save | PASS | see below |
| c. Defects banner (Size mismatch) / Route101 clean | PASS | see below |
| d. GBC Unplaced rail round trip | PASS | see below |
| e. GBC mismatched .blk paint + Save | PASS | see below |

**a.** World view, auto-layout off (initial state). Tree drop of greyed `NewBarkTown_House2`: `POST /world/placement 200`, row un-greyed within 1.5 s, no view switch or reload (greyed 1025 -> 1024). Timed: `NewBarkTown_PlayersHouse_1F` 319 ms. Rail drop (rail count 1022): `AbandonedShip_CaptainsOffice` row greyed -> un-greyed, rail 1022 -> 1021, greyed 1024 -> 1023. Auto-layout on (`POST /world/dungeons {enabled:true}`): tree drops un-grey without reload but slowly: 1679 ms (`NewBarkTown_PlayersHouse_2F`), 2332 ms (`CherrygroveCity_House1`), 1.5 s was still grey for `CherrygroveCity_PokemonCenter` (a first on-run read; it was un-greyed on the next load). Rail is empty with auto on, so no rail drop there. Observation (not a failure): auto-on refresh latency is 5-7x the off case (see O1). Shots `gba-a-0-world`, `gba-a-1-tree-drop`, `gba-a-2-rail-drop-off`, `gba-a-3-tree-drop-auto-on`, `gba-a-3b-...`, `gba-a-4-...-timed`.

**b.** Route101, Events overlay on: selected Object #0 (Youngster) and Bg #0 (sign), Duplicate on each, Save: `GET /api/edit/Route101/plan` (fingerprint `9610b1fb...`) then `POST .../commit` 200; dialog "Route101.json -- 5 field edits". On disk `map.json` had 10 object_events (was 7) and 3 bg_events (was 1); youngster copy at (17,8), sign copy at (6,9), no `local_id` key on any object. Count is 3 and 2 copies not 1 and 1 because two earlier aborted driver runs had left staged Duplicates in the hub session (my click coordinates shifted when the toolbar wrapped); the Save carried all of them. Restored `map.json` from backup, `cmp` identical. Shots `gba-b-1-events`, `gba-b-2-duplicated`, `gba-b-3-save-dialog`, `gba-b-4-saved`.

**c.** `layouts.json` NavelRockZygardeChamber_Layout temporarily 30x22 -> 33x37 (declares 2442 bytes, file is 1320: +561 blocks, the spec class). Opened `NavelRock_ZygardeChamber`: banner "Size mismatch  data/layouts/NavelRockZygardeChamber/map.bin: actual size 1320 bytes, expected 2442 bytes" with fix "Change width/height for LAYOUT_NAVEL_ROCK_ZYGARDE_CHAMBER in data/layouts/layouts.json or trim/extend data/layouts/NavelRockZygardeChamber/map.bin from 1320 to 2442 bytes." (`GET /api/defects/NavelRock_ZygardeChamber` kind `size`). Route101: `defects: []`, no banner. `layouts.json` restored from backup, `cmp` identical; Zygarde `map.bin` untouched (cmp identical). Shots `gba-c-1-zygarde-*`, `gba-c-2-route101-Route101`.

**d.** PerfPlus (no `.pokemap/`; default auto-layout on, rail 0, 158 tree rows not greyed). Toggle off: `POST /world/dungeons {enabled:false}`; rail 323; 90 rows newly greyed, every one in the rail (e.g. SproutTower1F/2F/3F, TinTower1F-5F); not-greyed 158 -> 68. Dragged `SproutTower1F` from the rail to the canvas: `POST /world/placement {map:SproutTower1F,x:113,y:147}` 200, row not greyed, rail 323 -> 322. Toggle on: rail 0, not-greyed back to 158. `.pokemap/` removed afterwards (verified absent). Shots `gbc-d-0-world` ... `gbc-d-4-auto-on-again`.

**e.** CeruleanCave2F (.blk 400 bytes, declared 135): banner "Size mismatch  maps/CeruleanCave2F.blk: actual size 400 bytes, expected 135 bytes ... Change the CERULEAN_CAVE_2F map_const dimensions in constants/map_constants.asm or trim/extend maps/CeruleanCave2F.blk from 400 to 135 bytes." Painted one block (Pencil, metatile 0x0), plan "maps/CeruleanCave2F.blk -- 1 block changed", commit 200. On disk: size still 400, `cmp -l` vs backup differs at exactly one byte (offset 67, inside the first 135), bytes 135..399 identical (verified by cmp of tail). Restored from backup, `cmp` identical. Shots `gbc-e-1-banner`, `gbc-e-2-save-dialog`, `gbc-e-3-saved`.

## Baselines

| | before | after |
|---|---|---|
| GBA manifest | `a0349693144d` | `a0349693144d` |
| GBC (PerfPlus) manifest | `13a31cb654ff` | `13a31cb654ff` |
| GBA HEAD / porcelain | `718b89f73` / 8 (the user's own) | same / 8 |
| PerfPlus HEAD / porcelain / `.pokemap` | `81ededbe3` / 0 / absent | same |
| pret HEAD / porcelain | `3bc8daa41` / 0 | same |
| GBA `.pokemap/` (world.json, dungeons.json) | backed up | restored, cmp identical |

No baseline changed.

## Findings

None blocking. Observations:
- O1: with Dungeon auto-layout on (GBA, 1,000+ placements) a tree drop takes 1.7-2.3 s to un-grey the row (0.3 s with it off). It does un-grey without reload; if "at once" must mean sub-second, this is a latency item (likely the world recompute with dungeon layout).
- O2: toolbar wraps onto a second line once the map is dirty and shifts canvas coordinates by ~33 px; scripts must re-measure (harness note only).
