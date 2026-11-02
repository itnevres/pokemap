# Plan 13 Task 6: live acceptance (both families)

Branch `plan-13-warp-popups` at `46551f6` plus the F1 fix below. 2026-11-02.

## Harness

- Scratch subjects: `git clone` of each subject into the session scratchpad (GBA at `26a2e3d1e` plus a copy of its ignored
  `.pokemap/`; PerfPlus at `81ededbe3`). Every save in this run went to those clones; the real subjects were never served.
- Hub: real `serve.ts` in-process (`node --import tsx --import preload.mjs serve.ts <clone>`), port 5184, scratch
  `POKEMAP_HOME` per family. Vite programmatic on 5183 (`vite.mjs`, `/api` -> 5184). Headless Chromium shell 1248, 1400x900.
- Driver `task-6-shots/accept.mjs <fam> <anchor> <dungeon>` (one family per run; raw JSON in `shots/<fam>-accept.json`,
  screenshots in `shots/`). Commits are intended (scratch); `/api/world/placement` and `/api/world/dungeons` POSTs are
  blocked (0 attempted in both runs). `dprobe.mjs` is a read-only dungeon zoom probe.
- GBC seed (scratch only): the PerfPlus clone had no `.pokemap/`. Created dungeon "Violet" (VioletCity + VioletMart,
  VioletGym, VioletNicknameSpeechHouse, VioletPokecenter1F, VioletKylesHouse, SproutTower1F) and saved dungeon
  auto-layout off, through the hub's own `POST /api/dungeons` and `POST /api/world/dungeons`. GBA's copied sidecar already
  had `dungeonAutoLayout: false` and the 20-map "Kanto Safari Zone".

Runs: `node accept.mjs gba NewBarkTown "Kanto Safari Zone"`; `ZOOMAT=676,143 node accept.mjs gbc VioletCity Violet`
(GBC's dungeon fit opens at 6%, below the warp-marker zoom; the driver wheels in on VioletCity first).

## Results

| Acceptance item | GBA | GBC |
|---|---|---|
| Popup from World (double-click resolved marker) | NewBarkTown -> `NewBarkTown_Lab`; destination selected | VioletCity -> `Route31VioletGate`; destination selected |
| Paint, undo, redo | stroke posts begin/apply/end; Undo -> Redo enabled, Save disabled; Redo -> Save enabled | same |
| Dirty close -> Cancel | prompt closes, popup stays, edits intact (Undo enabled) | same |
| Dirty close -> Discard | popup closes, selection back to NewBarkTown | back to VioletCity |
| Escape inside SaveDialog (close -> Save -> Escape) | SaveDialog closes; popup stays open, edits intact | same |
| Dirty close -> Save -> Save Changes | commit 200; popup closes; back to NewBarkTown | commit 200; back to VioletCity |
| World tile refresh after save | `GET /api/render/NewBarkTown_Lab.png?v=1` | gate not placed in GBC world; see dungeon row |
| Popup from Dungeon, save, close | `FuchsiaCity_SafariZone_Entrance`: commit 200, `GET /api/warps/<map>` refetched, close returns to the pre-dungeon selection (`NewBarkTown_Lab`, read in Map view) | `VioletMart`: commit 200, warps refetched, `GET /api/render/VioletMart.png?time=day&v=1` at Fit, close returns to `Route31VioletGate` |
| Auto-layout saved off, dungeon with indoor members | all 20 members placed in `?scope=dungeon`, 101 connection lines; indoor floors shelved at x~19,700 (fit frames anchored members, ruling P12-4m) | all 7 members visible at fit with lines (18) |
| Forced warp-fetch failures (`/api/warps/*` -> 500) | "Warp data unavailable for 3 maps: ..."; cleared after recovery + zoom (13 markers) | "... for 4 maps: ..."; cleared (20 markers) |
| Page errors | 0 | 0 |

Note: `backToSource:false` / `linesAfter:0` in `d2_popupSave` JSON are driver artifacts (dungeon mode shows no map tree,
and the count ran after the switch to Map view); the screenshots `*-d2-after-close.png` show the lines, and
`mapViewSelected === preDungeonSelected` is the close-to-source check.

## Finding F1 (fixed in this task)

The popup reused the old preview panel size (`.warp-modal__panel`: `min(720px, 90vw)` x `min(560px, 85vh)`). With the
full workspace inside (P13-1) the toolbar wrapped, "Discard Changes" was clipped, and the rail/palette were cut off
at 1400x900 (first GBA run; later runs overwrote that shot). Fix: `WarpPopup` adds `warp-modal__panel--workspace`
(`96vw` x `92vh`); every other dialog keeps the shared size. Inline conductor edit (7 lines, CSS + one className; tiny).
All results above are with the fix.

## Subjects

Before and after (manifest script `task-reports/pokemap-plan-10a2-pokemon-indicator/task-6-shots/manifest.sh`):
GBA `0e3237e6ade2` (HEAD `26a2e3d1e`, 9 porcelain lines, the user's), PerfPlus `13a31cb654ff` (HEAD `81ededbe3`, clean).
Unchanged. Servers stopped; ports 5183/5184 free.
