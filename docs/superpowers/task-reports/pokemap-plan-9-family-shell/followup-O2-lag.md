# Plan 9 follow-up E (O2): dirty/undo lag after a paint

## Method
- Hub on 5184 (PerfPlus, then the GBA game), Vite dev on 5183, a production build via `vite preview` on 5185, headless Chromium over CDP.
- One pencil click on Route29, three times, each followed by Ctrl+Z. An init script wrapped `fetch` for `/api/edit/*` (send, headers, json timestamps, reply `isDirty`), watched the dirty indicator with a MutationObserver, and logged `longtask` entries.
- A CPU profile (Profiler domain, 200 us sampling) of one click, totalled by inclusive time per app function.
- Scripts: scratchpad `live/e1.mjs` (timing), `live/e2.mjs` (profile). Projects byte-identical before and after (`e-before.txt` == `e-after.txt`: porcelain hashes, Route29 `.blk`/`map.bin`, `.pokemap` listings). Nothing was saved.

## Findings
- The server is not the cause. With an idle main thread every reply arrives in 4-20 ms.
- The server marks the session dirty only in the `/paint/end` reply (begin and apply reply `isDirty: false`). So dirty can show only after three sequential round trips: begin, apply, end (the stroke chain awaits each).
- Every reply calls `setState` in the edit session at the shell level, and every hover sets `hoveredMetatileId` there too. Each one re-rendered the whole shell, including the map tree (391 GBC / 1,209 GBA rows) and the metatile palette (128 / 784 cells).
- In the dev build that costs 60-400 ms per reply. The profile of one GBC click: MapTree 104 ms, GbcMetatilePalette 22 ms. GBA: MapTree 1,028 ms, MetatilePalette 620 ms (over the three replies). Each reply's response then waits behind the previous render (apply's headers arrived at +92 to +408 ms instead of ~5 ms).
- GBA lagged more than GBC (dirty +700 ms, undo ~370 ms); the live run only noted GBC.
- The production build hides most of it: GBC dirty +42-54 ms and undo +23 ms; GBA dirty +46 ms (first click +282 ms, cold session) and undo +46 ms.

## Fix (`perf(ui): edit-session replies no longer re-render the map tree and palettes`)
- `MapTree`, `MetatilePalette` and `GbcMetatilePalette` are `memo`; `FamilyApp` (tree `onSelect`) and `GbcMapEditing` (palette pick) pass ref-stable callbacks. GBA's palette props were already stable.
- Test: `test/shell/treeRenders.test.tsx` (the real export is a memo; a stroke's three replies do not re-render the tree). Red before the fix (4 renders vs 3), green after.

| Dev build, one pencil click | Before | After |
|---|---|---|
| GBC dirty shown | +172 to +422 ms | +57 to +86 ms, no long tasks |
| GBC undo | +41 to +135 ms | +33 to +38 ms |
| GBA dirty shown | about +700 ms | +77 to +374 ms |
| GBA undo | +364 to +387 ms | +37 to +40 ms |

## Left as is
- GBA still has one 74-211 ms task after a reply (the MapCanvas redraw of a 108 KB reply). That is the canvas, not the shell.
- Dirty on `end` only is by design: a stroke is one undo step.
