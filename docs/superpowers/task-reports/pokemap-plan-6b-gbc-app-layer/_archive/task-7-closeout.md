# Plan 6b Task 7: close-out

Coordinator, Windows machine, 2026-09-28. The code is at `5629602`; the reports are archived at `8175d06`.

All four success criteria were demonstrated in one Playwright (Chromium) browser session at 1280×800, against the real PerfPlus root (`serve.ts --gbc`) and then the real GBA subject (`serve.ts`), with the Vite dev server (`<StrictMode>`). The server swap was the only change between criteria 3 and 4, because both servers share port 5174. Every screenshot below was opened and looked at, and the measurements come from the DOM and from canvas pixels, not from eyeballing.

## Criterion 1: GBC map view

| Check | Evidence |
|---|---|
| NewBarkTown opened from the group tree (`NEW_BARK` group) | `task-7-c1-newbarktown-day.png` |
| 32 px per block with a 1-block border ring | The source image is `/api/render/NewBarkTown.png?border=1&time=…`, with a natural size of **384×352 = (10+2)·32 × (9+2)·32**. The status strip reads `tileset TILESET_JOHTO · 128 metatiles · 10×9` |
| morn/day/nite give different pixels | Canvas hashes of 2372249872, 979274344 and 2111430098, all distinct. The `src` changes to `time=morn`/`day`/`nite`. See `…-morn.png`, `…-day.png`, `…-nite.png` |
| The collision-quadrant overlay | Turning it on changes the canvas. A wall pixel inside the map goes from (41,115,0) to (139,74,22). The border-ring pixels are unchanged, and so is every sampled point, which also matches the source PNG byte for byte. `task-7-c1-newbarktown-collision-hover.png` |
| Hover shows the metatile id + 4 quadrants | `(5, 4) step (10, 8) id 0x1 · TL FLOOR · TR FLOOR · BL FLOOR · BR FLOOR`, with the hovered quadrant in bold |
| CeruleanCave2F defect banner + 3 out-of-map warps | The `role="alert"` banner reads: `.blk: actual size 400 bytes, declared 9x15=135 -- loaded first 135 bytes, not writable`, then warps [0] (23,7), [1] (29,1) and [3] (19,7), each "outside the 18x30 step grid". The status strip says `not writable`. `task-7-c1-ceruleancave2f-banner.png` |

**Anomaly, settled by instrumentation.** In the screenshots, the border-ring trees look brighter with collision on. Sampled pixels showed that screenshot = canvas = source PNG with the overlay off and on: the border tree is (99,206,8) both times. The apparent brightening comes from the adjacent wall quadrants turning brown. There is no bug.

## Criterion 2: GBC world view

| Check | Evidence |
|---|---|
| 326 components, 3 of them multi-map | `/api/world` gives `components.length` 326, and the multi-map sizes are **[31, 2, 35]**. The status strip reads `326 components · 391 maps`. `task-7-c2-world-fit-all.png` |
| Route16/17/18/Fuchsia conflict badges on Route17 and Route18 | The `--danger` (#ef4444) diamonds were found by scanning canvas pixels, then hovered:<br>- Route17: "Route17 placed via Route16; Route18 disagrees by (0,1)"<br>- Route18: "Route18 placed via FuchsiaCity; Route17 disagrees by (0,-1)"<br>Screenshot: `task-7-c2-conflict-tooltip.png` |

## Criterion 3: encounter lens, gutter, spotlight

| Check | Evidence |
|---|---|
| The method lens tints by GBC method, and never grass | At Fit all, the DOM tints are water 62, fishing 8 and headbutt 22. These are identical to the counts computed independently from `/api/encounters` for all 125 maps (Task 6 verification), and none of the 33 grass-only maps is tinted. `task-7-c3-method-lens.png` |
| The gutter lists grass slots for the selected time | At Route30, Day shows `Grass · day` and Morn shows `Grass · morn`. The fish rows `Fish · Good Rod · day` / `Fish · Super Rod · day` show at Morn too, and `Fish · Old Rod` is untagged. `task-7-c3-gutter-day.png` / `-morn.png` |
| "dunsparce" → dropdown → exactly DarkCaveVioletEntrance | The options are `["Dunsparce"]`. After picking, 390 maps are dimmed and 1 is hit. Hovering the hit reads `DarkCaveVioletEntrance`. `task-7-c3-spotlight.png` |

The dropdown is only visible because of `5629602`: the styles.css comment fix, GBA follow-up #3, pulled into 6b with the user's go-ahead (see the Task 6 report).

## Criterion 4: GBA baseline unchanged

| Check | Evidence |
|---|---|
| `npm test` | **1,679 pass / 0 fail** on Windows. That is the Windows baseline of 1,600 plus 79 new tests: 77 from Task 6 and 2 from `styles.test.ts`.<br>The cloud's 6 local-state failures (`baseline-fails.txt`) pass here, as expected.<br>The 7 Windows-only CLI test bugs were fixed in `123d89f` (test-only). |
| `npm run typecheck` | Clean |
| `vite build` | Now passes (it failed before `5629602`) |
| The GBA app opens a map, with overlays, and the world view | `/api/project` gives `{family:"gba"}`.<br>NewBarkTown opens (`layout_version hns · split metatiles 640 · tiles 640 · pals 7`). Grid, Collision, Elevation and Events each change the canvas, and toggling them off returns it to the byte-identical base hash.<br>The world view reads `placed 1209 · hidden 700 · unplaced 0 · conflicts 19` (the known `CONFLICT_BASELINE` of 19).<br>No page overflow (1280/1280, 800/800).<br>Screenshots: `task-7-c4-gba-map-overlays.png`, `task-7-c4-gba-world.png` |

Console across the session: a favicon 404, plus a `willReadFrequently` warning caused by the test's own `getImageData` probes. No app errors.

## Carried forward (seen, not fixed; the same in GBA)

- In GBA's world toolbar, the open lens legend popover covers the Encounters toggle, so it has to be closed first.
- At mid zoom, the gutter strips of adjacent maps overlap, in both families.
- GBA follow-ups #1 (`MapCanvas` StrictMode double pan) and #2 (`.map-canvas` hover overflow) are still open.
