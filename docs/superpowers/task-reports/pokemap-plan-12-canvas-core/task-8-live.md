# Task 8: live acceptance, both families (2026-10-25)

Branch `plan-12-canvas-core` at `3e264d0` (Task 7; code unchanged since `5663dce`). Hub: the real `serve.ts` with an `--import` preload remapping 5174 → 5184 and a scratch `POKEMAP_HOME`; one hub per subject (GBA `game` first, then PerfPlus via `--gbc`). Vite started programmatically on 5183 (`127.0.0.1`). Browser: headless Chromium shell 1248 through the cached `playwright-core`. Drivers in `task-8-shots/`: `lib.mjs`, `map.mjs` (copied from Plan 11), `guard.mjs`, `edit.mjs <fam> <map>` (Map view), `ctx.mjs <fam>` (in-context), `explore.mjs`. Raw results: `gba-map.json`, `gba-ctx.json`, `gbc-map.json`, `gbc-ctx.json`.

## Save and world-write guard

`guard.mjs` runs before any page loads: `page.route` answers every `POST` whose path ends in `/commit` and every `POST` to `/api/world/placement*` or `/api/world/dungeons*` with 500 and counts them. All four runs: `blocked: []` (none attempted). Save was never clicked. Every POST the pages sent is in each JSON's `postSummary`: only `edit/*/paint/{begin,apply,end}`, `edit/*/event/move` and `edit/*/discard`. The hub logs no per-request lines (its log is the start line only), so the browser-side list is the request record.

## Results

Maps: GBA `Route29` (Map view), `Route114` (in-context); GBC `Route29` (Map view), `PewterCity` (in-context). Edits at 4×.

| Check | GBA Map view | GBA in-context | GBC Map view | GBC in-context |
|---|---|---|---|---|
| Zoom buttons | PASS 1× → 2× | PASS 1× → 4× (context bar, 100% → 400%) | PASS 1× → 2× | PASS 1× → 4× (100 → 400%) |
| Wheel | PASS in 2× → 4×, out → 2× | PASS out 4× → 2× | PASS same as GBA | PASS same |
| Fit, then mouse back over the canvas and wheel | PASS Fit 1×; wheel → 2× | PASS Fit 1×; wheel → 2× | PASS | PASS |
| Overlay toggles + legend | PASS Grid, Collision, Elevation, Events, Encounters false → true → off; legend "Grid Collision Elevation (low → high) Object Warp Coord Bg Encounters: hover or focus a sprite" | n/a: chromeless (no toggles, legend or status; 0 groups in the region) | PASS Grid, Collision, Events, Encounters; legend "Grid Wall Water Object Warp Coord Bg Encounters: …; dimmed = not at day, + = …" | n/a: chromeless |
| Hover readout + status strip | PASS "(35, 15) id 0x9 · collision 0 · elevation 3 · behavior 0x0"; strip "layout_version hns · split …"; leave → "Hover the map…" | n/a: chromeless | PASS "(15, 4) step (30, 8) id 0x63 · TL FLOOR · …"; strip "tileset TILESET_JOHTO · 128 metatiles · 30×9"; leave → placeholder | n/a: chromeless |
| Event drag | PASS object #6 (37,14) → 0 moves while dragging (local preview, `gba-m2`), 1 `event/move` on release | PASS 0 during, 1 on release | PASS object #4 (25,3): 0 during, 1 on release | PASS 0 during, 1 on release |
| Dropper | PASS no POST; Selection 0x9 | PASS no POST; Selection 0x1 | PASS no POST; Selection 0x63 | PASS no POST; Selection 0xA |
| Pencil (P12-4b) | PASS 3 cells crossed with 3 wiggles each → 1 begin, 3 applies (35,16) (36,16) (37,16), 1 end | PASS 49 moves at 4 px → 4 applies, 4 distinct cells, 0 consecutive duplicates, 1 end | PASS 3 cells → 3 applies (15,5) (16,5) (17,5) | PASS 97 moves → 4 applies, 4 distinct, 0 duplicates |
| Rect | PASS 1 apply at release (35,17)-(37,18) | PASS 1 apply | PASS 1 apply (15,6)-(17,7) | PASS 1 apply |
| Bucket | PASS 1 apply | PASS 1 apply | PASS 1 apply | PASS 1 apply |
| Sign pick | PASS editor opens ("Sign · Text mode …"), Escape/Cancel closes (`gba-m3`) | PASS (`gba-c3`) | PASS (`gbc-m3`) | PASS (`gbc-c3`) |
| Pencil drag released outside the canvas | PASS 1 end; applies stop at release (cells crossed on the way out are the trail); moving back with no button adds 0; Undo enabled | PASS same (10 applies on the way out, 0 after) | PASS same | PASS same |
| Apply forced to 500 | PASS banner "POST /api/edit/Route29/paint/apply -> 500 ×" (`gba-m4`) | PASS same text (`gba-c4`) | PASS banner "forced by live check ×" (`gbc-m4`) | PASS same (`gbc-c4`) |
| GBC time switch | — | — | PASS Encounters on; Morn 0 dimmed, Day 0, Nite 3 of 9 sprites; 0 encounter GETs across the switches (`gbc-m5`) | — |
| Leave with Discard | PASS confirm accepted, dirty dot gone | PASS; Done closes the context, no switch dialog | PASS | PASS |
| Page errors | none | none | none | none |

Notes:
- The 500 banner text differs by family: GBA shows the request line, GBC the server's error body. Both come from each session hook's existing error message; it was this way before Plan 12 (P12-4f routes GBA's stroke errors to the same banner; the wording is untouched). Not a 12a finding.
- In-context checks find cells without the hover readout (chromeless): P12-4b is read from the apply bodies (distinct consecutive targets), and the event is found by a click scan until Duplicate becomes enabled.
- Driver fixes during the run, not app defects: the canvas moves down 33 px when an event is selected (the event panel), so `edit.mjs` re-reads the canvas box before each tool; GBC's 9-row map put the first 500 click off-screen, so it was moved to the centre row (the GBA run kept the earlier coordinates and its forced 500 already landed); the GBC event scan first used GBA's "No event selected." text, then switched to Duplicate's enabled state for both.

## Restore

GBA `.pokemap/` backed up before the run, `diff -r` identical after. Manifests unchanged: GBA `a0349693144d`, GBC `13a31cb654ff`. GBA HEAD `718b89f73`, exactly 8 porcelain lines; PerfPlus HEAD `81ededbe3`, clean, no `.pokemap`. Only this run's hub (5184) and Vite (5183) were stopped, by port.
