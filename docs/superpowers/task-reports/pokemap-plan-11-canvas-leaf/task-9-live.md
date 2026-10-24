# Plan 11 Task 9: live acceptance, measurement, docs (2026-10-24)

Branch `plan-11-canvas-leaf` at `203d821`, plus the GBC reload-alert fix below. Hub: the real `serve.ts`, with a `--import` preload that remaps 5174 to 5184 and a scratch `POKEMAP_HOME`. One hub per subject: GBA first, then PerfPlus. Vite was started programmatically on 5183. Browser: headless Chromium shell 1248, driven through the cached `playwright-core`. Drivers are in `task-9-shots/`: `lib.mjs`, `explore.mjs`, `world.mjs <family>`, `wheel.mjs <family>`, `map.mjs <family> <map>`, `dungeon.mjs <family>` and `gbc-alert.mjs`. Only the hub and Vite this run started were stopped (by port).

## Results

| Check (Acceptance 4) | GBA (`game`) | GBC (PerfPlus) |
|---|---|---|
| Map zoom buttons | PASS: 1× → 2× pressed; Fit | PASS: 2× start; Fit |
| Map wheel zoom | PASS: wheel in 2× → 4×; wheel out ×2 → 1× | PASS: same |
| Overlay toggles and legend | PASS: Grid, Collision, Elevation, Events, Encounters each `aria-pressed` false → true. Legend shows Grid, Collision, Elevation (low → high), Object, Warp, Coord, Bg, Encounters | PASS: Grid, Collision, Events, Encounters. Legend shows Grid, Wall, Water, Object, Warp, Coord, Bg, Encounters |
| Collision names | PASS: "Collision tool" (visible "Collision", title "Collision (C)") and "Show collision overlay" (visible "Collision") | PASS: "Show collision overlay" only (no Collision tool) |
| World wheel zoom | PASS: 6% → 13% (4 notches in) → 9% (2 out); after Fit 3% → 5% | PASS: 8% → 16% → 11%; after Fit 3% → 7% |
| Lens overlays | PASS: "Level curve lens" pressed, overlay drawn (`gba-w2-lens`) | PASS: same (`gbc-w2-lens`) |
| Shift-drag placement | PASS: `POST /world/placement` Route126, then 2 `GET /world` (canvas reload + visibility) | PASS: `POST` FuchsiaCity, then 2 `GET /world` (canvas + adapter world) |
| Group move (one visibility GET) | PASS: Ctrl-select Route117, Route118, Route123, Shift-drag: 3 POSTs, then exactly 2 `GET /world`: one canvas reload, one visibility refresh | n/a: GBC has no group move; Ctrl-click then Shift-drag commits one map (1 POST, 2 GETs) |
| Dungeon-mode placement (GBA) | PASS: dungeon "Kanto Safari Zone", rail drop of `AbandonedShip_CaptainsOffice`: POST 200, 1 `GET /world` (canvas only; the shell's fetch is off in Dungeon mode), left the rail. In World, its row is not greyed | — |
| Dungeon switch double toggle | PASS: shown values `false → true → false` (no flicker back), final `false`. Network: POST on, 2 GETs, POST off, 2 GETs | PASS: `true → false → true`, final `true` |
| Reload alert (F11, from Task 6) | PASS: forced `GET /world` 500 after a toggle: alert "Could not reload the world: GET /api/world -> 500", canvas kept, Dismiss clears it | FAIL, then fixed (below). After the fix: PASS; alert shown, × visible, Dismiss clears |

The dungeon placement note: the live server's `/api/world` also reports the placed map as manual, so the live check cannot tell the F9 callback apart from the visibility GET. The adapter test (`test/shell/placementCommit.test.tsx`, F9) isolates it with a world that never reflects placements.

## Defect found and fixed: GBC reload alert Dismiss clipped

The GBC reload alert put its × button inside the text span, which has `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`. When the message was long, the ellipsis clipped the button: the alert box ended at x 898 and the button sat at x 889-905, mostly hidden (`gbc-w6-reload-alert`). Task 6 had recorded this as spec minor M2. Fix (`gbc/GbcWorldCanvas.tsx`): the toolbar group `div` is now the `role="alert"`. The text span truncates alone, and the button is its flex sibling, so it is always visible (`gbc-w6b-reload-alert-fixed`). The existing F11 tests find the button inside the alert and pass unchanged. Clipping is layout only, so no jsdom test can see it; it was checked live.

## Measurement (`measure.py`, final)

| Pair | code lines GBA / GBC | aligned (runs ≥3) | runs |
|---|---|---|---|
| Map: before (`fb78949`) | — | 263 | — |
| Map: final | 427 / 443 | 167 | 30 |
| World: before (`fb78949`) | 1218 / 909 | 302 | 48 |
| World: final | 1110 / 799 | 191 | 42 |

Map pair: identical to Task 1's final measurement, and no map-canvas code changed after Task 1 except Task 3's names. Every run keeps its Task 1 ruling (`task-1-report.md`).

World pair: the runs ruled in `task-2-report.md` are still there at shifted lines. The aligned count rose from 184 (Task 2) to 191 because Tasks 5-6 added code to both canvases in parallel. Rulings for the runs that are new or moved since Task 2 (lines GBA / GBC):

| Run | Lines | Ruling |
|---|---|---|
| Toggle state (`dungeonsPending`, `toggleGeneration`, `toggleReloadGeneration`) | 431-433 / 528-530 | Each canvas's own state declarations; the generation logic around them reads family reload hooks (GBA `refetchGen`, GBC `useGbcWorld`) |
| `useWorldContext` call arguments | 1419-1423 / 926-930 | Call site of the shared hook; `native`, `placement` and `setView` differ per family |
| Placement POST outcome (ledger resolve, save error) | 1485-1493 / 979-982 | Differs beyond inputs: GBA posts a group with `fetch` and one reload after all settle; GBC posts one map with `fetchGuarded` and reloads per POST. The shared part is already `shared/placementLedger.ts` |
| Pointer handlers (`onMouseDown`, `onMouseMove` opening, `commitMapDrag`, `onMouseUp`) | 1516-1519 / 1009-1012, 1622-1625 / 1018-1021, 1695-1701 / 1052-1055, 1741-1744 / 1059-1062 | Hit-test and drag handlers (P11-2) |
| Wheel and context-menu closings | 1427-1429 / 935-937, 1454-1456 / 953-955 | Closing lines of per-family handlers (P11-2 view model) |
| Load placeholder (`!world && error` / loading) | 1898-1902 / 1265-1269 | Kept. It is now identical except for the error variable (`loadError` / `error`), the case Task 2 deferred to Task 6. It is a two-branch `<p>` ternary: a shared component would add a module and an import in each canvas to save 4 lines each. Re-rule in Plan 12 when the view shell is shared |
| Toolbar wrapper close, status-strip spans | 1892-1895 / 1259-1262, 2012-2015 / 1334-1336, 2030-2033 / 1341-1344, 2036-2040 / 1346-1350 | JSX scaffolding; the status-strip readouts stay per family (spec non-goal) |

Everything else in the `--all` list matches a Task 2 row: imports, declarations, image-load effect, encounter effect, border entries, spotlight loop, redraw and badges (draw path), wheel effect, pointer handlers, `return (`, Fit button, `<canvas>` props, selection div, overlay mounts.

## Baselines

| | before | after |
|---|---|---|
| GBA manifest | `a0349693144d` | `a0349693144d` |
| GBC (PerfPlus) manifest | `13a31cb654ff` | `13a31cb654ff` |
| GBA HEAD / porcelain | `718b89f73` / 8 (the user's own) | same / 8 |
| PerfPlus HEAD / porcelain / `.pokemap` | `81ededbe3` / 0 / absent | same / 0 / absent (the run created `.pokemap/world.json`; removed) |
| GBA `.pokemap/` | backed up | `world.json` restored from backup (the moves changed it); `dungeons.json` unchanged |

No baseline changed.

## Gate

3,528 pass / 0 fail / 218 files; typecheck and UI build pass (with the GBC alert fix).
