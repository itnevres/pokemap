# Plan 14.1 Tasks 6-8: live headless check (both families)

2026-11-08, conductor session 4. Code: `p14-1-t8` (`c6a7bb1`, then `20f8cd1` after fix round 2). Hub and UI ran from
that worktree.

## Harness

- Scratch subjects: `git clone` of each subject into the session scratchpad (GBA `26a2e3d1e` plus copies of its ignored
  `.pokemap/` and `porymap.project.cfg`; PerfPlus `81ededbe3`). Real subjects were never served.
- Hub: `node --import tsx --import preload.mjs packages/server/src/serve.ts <clone>` with a scratch `POKEMAP_HOME`, port
  5184 (Plan 13 Task 6 recipe, `preload.mjs` / `vite.mjs` from its `task-6-shots/`). Vite on 5183. Headless Chromium
  shell 1248, 1400x900, React StrictMode dev build.
- Driver `task-8-shots/probe.mjs <gba|gbc> <map>`; JSON and screenshots in `task-8-shots/shots/`.

## Results (after fix round 2)

| Check | GBA (NewBarkTown) | GBC (VioletCity) |
|---|---|---|
| Bar: four buttons, labels = tooltips | yes | yes; Coord disabled, title "This map has no scenes" |
| Placement: click sets `aria-pressed`; Escape and re-click cancel | yes | yes |
| Canvas click opens "Add Object at (x, y)" with the family's fields | yes (elevation, var-free) | yes (hours, palette, object constant) |
| Escape closes the dialog | yes | yes |
| BG sign/READ with a New script: create POST 200, map dirty | yes | yes |
| Undo after create: clean | yes | yes |
| Page errors | 0 | 0 |

## Findings

- **L1 (Important, fixed in `20f8cd1`):** before fix round 2, focus sat on `<body>` while options loaded and Escape did
  nothing (panel-scoped keydown; focus lost to the pointer click / StrictMode effect re-run). Now a document-level
  Escape handler honors the topmost rule and in-flight lock, and initial focus is repaired.
- **L2 (Important, fix on `p14-1-perf`, not merged):** `GET /api/event-options/:map?x=&y=` took ~3.1 s (228 KB) on the
  GBA subject because `entryPointsFor` rescanned every `map.json` and `data/**/*.inc` per call; each tile click and each
  create paid it. `b450c5f` caches the index per hub; astra quality review asks for freshness against external disk
  edits before merge.
- Not a loop: two option loads per dialog open are StrictMode's effect re-run in the dev build.
