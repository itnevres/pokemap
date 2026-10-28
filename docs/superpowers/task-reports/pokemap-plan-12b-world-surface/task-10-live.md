# Task 10 live acceptance: complete (run 2 below); run 1 stopped at the P12-4e stop rule

Branch `plan-12b-world-surface` at `dd87f7f`. Hub: real `serve.ts` run in-process (`node --import tsx --import preload.mjs serve.ts <GBA path>`; the `tsx` CLI spawns a child that skips the `--import` preload, so the port stays 5174 — use `--import tsx`), port 5184, scratch `POKEMAP_HOME`. Vite programmatic on 5183 (`vite.mjs`, proxy `/api` → 5184). Headless Chromium shell 1248. Drivers and screenshots in `task-10-shots/`; `guard.mjs` blocked 0 requests (no POSTs were made).

## P12-4e first-load fit, GBA (World mode, 1400x900 window, viewport 880x766)

Fit readout 3%; 184 `/api/render` requests (placed 186, hidden 2). Manual Fit gives the same view (`gba-fit-manual.png`). Times are from the `/api/world` response finishing to the last render response finishing (`settle.mjs`):

| Run | Last tile | First tile | Median request | Long tasks (ms) |
|---|---|---|---|---|
| cold (fresh hub) | 9,427 ms (168 of 184 done at 10 s) | 555 ms | 4,508 ms | 261, 64, 52, 52, 106 |
| warm 1 | 698 ms | 489 ms | 272 ms | 81, 108, 83 |
| warm 2 | 859 ms | 652 ms | 256 ms | 250, 73, 113, 73 |
| warm 3 | 1,026 ms | 798 ms | 300 ms | 204, 102, 256 |
| warm 4 | 1,264 ms | 821 ms | 277 ms | 224, 183, 101, 231 |

Cold filmstrip (`film.mjs`, a second fresh hub): tiles done at 1 s 0, 2 s 0, 4 s 31, 6 s 70, 8 s 97, 10 s 119. The frame, badges and dive/emerge markers show at once; maps fill in one by one (`film-cold-*.png`).

Cause: each `/api/render/<map>.png` renders synchronously on first request into the handler's in-memory `pngCache` (process lifetime, cleared on save), so every hub start pays it. Old GBA opened at zoom 1 on the top-left corner (few tiles); its Fit had the same cold cost.

**Stop rule (P12-4e, 1.5 s): tripped cold. Shown to the user with the filmstrip; options: placeholders, pre-warm, disk cache, worker threads. User ruling P12-4w (2026-10-27): pre-warm** (spec; plan Task 9a). Task 10 restarts from Step 1 after Task 9a.

## Restore

Servers stopped (TaskStop; ports 5183/5184 free). GBA `.pokemap/` `diff -r` identical to the backup. Subject manifests (HEAD, porcelain, `git diff HEAD` hash, untracked hashes) unchanged: GBA `7da429302a67` (HEAD `26a2e3d1e`, 9 porcelain lines), PerfPlus `713238d10d66` (HEAD `81ededbe3`, clean, no `.pokemap`).

# Task 10 run 2 (2026-10-28, after Task 9a): complete

Branch at `1dd3617` plus the toolbar CSS fix below. Same harness as run 1 (in-process `serve.ts` + `preload.mjs` on 5184, scratch `POKEMAP_HOME`, `vite.mjs` on 5183, Chromium headless shell 1248, 1400x900 unless stated). Drivers: `settle.mjs` (GBC-safe readout, `PRE` env), `live.mjs` (World/Dungeon checks), `ctx1024.mjs` (in-context editing at 1024x768 plus tile refresh), `extra.mjs` (jump fill; mocked GBC dungeon list). Raw JSON and key screenshots in `task-10-shots/run2/`. `guard.mjs` answered every placement/commit POST with 500; the hub saw no commit and no world write (GBA run: 3 placement POSTs blocked; GBC: 3).

## P12-4e first-load fit on a pre-warmed hub (P12-4w)

Hub log: GBA `warmed 184 world tiles in 3849 ms (0 skipped, 0 failed)` (3870 ms on the restart); GBC `warmed 158 world tiles in 1385 ms (0 skipped, 0 failed)`. Runs start after the warm-up line. World payload → last tile:

| Run | Renders | First tile | Last tile | Median request | Long tasks (ms) |
|---|---|---|---|---|---|
| GBA w1 | 184 | 355 ms | 557 ms | 269 ms | 108, 59, 68 |
| GBA w2 | 184 | 372 ms | 562 ms | 246 ms | 96, 77 |
| GBA w3 | 184 | 322 ms | 515 ms | 249 ms | 107, 59 |
| GBA w4 (after restart) | 184 | 305 ms | 491 ms | 243 ms | 104, 71 |
| GBC gw1 | 156 | 239 ms | 383 ms | 205 ms | 53 |
| GBC gw2 | 156 | 224 ms | 370 ms | 190 ms | 58 |

GBA settles in 0.49-0.56 s, under the 1.5 s threshold; no visible jank. Fit readout 3% (GBA); GBC status strip `zoom 8%`.

## Step 3 checks

| Check | GBA | GBC |
|---|---|---|
| Wheel / Fit | 6 wheel steps 3% → 8%; Fit restores the first-load view pixel-identical | wheel changes view; Fit restores pixel-identical |
| Ctrl-click | click 1 selected; Ctrl adds (2); Ctrl again toggles off (1) | same (1, 2, 1) |
| Marquee (Ctrl-drag from empty space at Fit) | rectangle shown, 171 maps selected | shown, 139 selected |
| Group move (2 selected, Shift-drag) | 2 POST attempts (`/world/placement` each), 1 `/api/world` reload, alert `POST /api/world/placement -> 500`, positions rolled back | 2 POSTs, 1 reload, `Could not save placement: … 500`, rolled back |
| Map drag released outside the canvas | 1 POST attempt, 1 reload | 1 POST, 1 reload |
| Warps forced 500 | 6 forced fetches, alert `Warp data unavailable: GET /api/warps/Route29 -> 500`, 0 markers | 6 forced, alert for TohjoFalls, 0 markers |
| Retry after pan, route lifted | 13 markers | 14 markers |
| Marker click | 0 selected | 0 selected |
| Enter / `+` / `-` on the focused canvas | `+` changes view (already at the 100% cap), `-` 100% → 83%; Enter opens Map view on NewBarkTown | `+`/`-` change view; Enter opens Map view |
| Jump same map twice | fade animation at 1500 ms, re-jump restarts it (883 ms, opacity 1) | 1500 → 900 ms, restarted |
| Reveal hidden map on jump | WorldHub: status `hidden 2` → `hidden 1`, highlighted, hover shows it | RuinsOfAlphResearchCenter (INDOOR) highlighted and hovered at centre |
| P12-4m jump fill | 100% at NewBarkTown (cap) | Route29 (30x9 blocks): highlight 880 px = viewport width (fill 1.000), zoom 92% — amended full fill confirmed |
| Lens | Level curve pressed, view changes | same |
| Spotlight | `Zigzagoon` option, view changes | `Pidgey`, view changes |
| Context menu | `Open in Map view`, `Edit here`; Escape closes | same |
| Dungeon lines to an offscreen member | Kanto Safari Zone 20: 36 lines, still 36 after zooming in and panning 500 px; Fit back to the initial view | no dungeons on disk; `GET /api/dungeons` mocked in the browser (UnionCave1F/B1F/B2F, Route32, Route33): 10 lines, 10 after pan offscreen, 10 after Fit |
| P12-7 border overlap at mid zoom | 69%: 4 strips, 0 overlapping pairs (adjacent strips meet edge to edge) | 6 strips, 0 overlaps |
| Encounter tooltip at the left edge | sprite panned to 6 px inside the viewport: tooltip left 280 = viewport left (clamped) | same, clamped at 280 |
| In-context at 1024 px | rail shown before, hidden in context; page no horizontal overflow | same |
| Tile refresh after in-context paint | 3 applies; 1 `/api/render/NewBarkTown.png` refetch; world canvas sampled at the painted spot for 236 frames: 0 blank frames | 3 applies, 1 refetch, 242 frames, 0 blank |
| Done with a dirty draft | Save dialog `data/layouts/NewBarkTown/map.bin -- 3 blocks changed`; Cancel; Discard → clean | `maps/NewBarkTown.blk -- 3 blocks changed`; Cancel; Discard → clean |

P12-7 is closed with this evidence: no adjacent border overlap at mid zoom in either family; no `EncounterBorder.tsx` change.

## Finding fixed: World toolbar overlap at 1024 px in context (both families)

At 1024x768 in context (rail hidden, editor panel open) the World toolbar is 472 px wide. Before the fix its groups squeezed into each other: GBA "Dungeon auto-layout off" wrapped to three lines, the spotlight input covered the Warps switch, `100%` overlapped `Method` and Fit was clipped; GBC's lens buttons were cut off at the right. Fix: `flex-wrap: wrap` on `.world-canvas__toolbar` and `.world-canvas__toolbar-group` (`styles.css`, 4 lines, shared by both families; inline Claude edit, tiny-change rule). After: GBA toolbar wraps to four clean rows (140 px), GBC three (110 px), nothing overlaps or clips (`run2/*-x1-context-1024.png`); at 1400 px both stay one row (41 px, `run2/*-tb-1400.png`).

## Observation (not changed): warp alert stays after a successful retry

After the forced warp 500, lifting the route and panning loads the markers (retry works, P12-4s), but the `Warp data unavailable` alert stays until Warps is toggled or a marker popup opens; it is dismissible. Same in both families and matches `WorldSurface.tsx` (`setWarpError(null)` only on toggle and popup). No ruling covers clearing on success; left for the user.

## Restore (Step 4)

Servers stopped by TaskStop; ports 5183/5184 free. GBA `.pokemap/` `diff -r` identical to the backup. Manifests (plan script `manifest.sh`) unchanged: GBA `0e3237e6ade2` (HEAD `26a2e3d1e`, 9 porcelain lines — the user's own; the plan's "8" predates one of them), PerfPlus `13a31cb654ff` (HEAD `81ededbe3`, clean, no `.pokemap`).
