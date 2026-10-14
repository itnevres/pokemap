# Task 8 Step 1: duplication re-measured (2026-10-13, at `58e7287`)

## Pairs (`wc -l`), Task 0 baseline vs now

| GBA | before | now | GBC | before | now |
|---|---|---|---|---|---|
| `App.tsx` | 394 | 364 | `gbc/GbcApp.tsx` | 381 | 357 |
| `components/MapCanvas.tsx` | 1041 | 967 | `gbc/GbcMapCanvas.tsx` | 882 | 850 |
| `components/WorldCanvas.tsx` | 2399 | 2299 | `gbc/GbcWorldCanvas.tsx` | 1494 | 1391 |
| `MapEditingWorkspace.tsx` + `useMapEditing.ts` | 158 + 332 | 166 + 338 | `gbc/GbcMapEditing.tsx` | 204 | 196 |
| `hooks/useEditSession.ts` | 347 | 259 | `gbc/hooks/useGbcEditSession.ts` | 159 | 120 |
| `hooks/useCoverage.ts` | 55 | 29 | `gbc/hooks/useGbcCoverage.ts` | 19 | 19 |
| `hooks/useDungeons.ts` | 97 | 97 | `gbc/hooks/useGbcDungeons.ts` | 53 | 53 |
| `hooks/useMapGroups.ts` | 39 | 12 | `gbc/hooks/useGbcGroups.ts` | 19 | 19 |
| `hooks/useMapLayout.ts` | 78 | 78 | `gbc/hooks/useGbcMap.ts` | 39 | 39 |
| **Total GBA** | **4940** | **4609** (−331) | **Total GBC** | **3250** | **3044** (−206) |

New shared code: `src/shared/` = 500 lines in 7 files (`useWorldContext` 133, `useStrokeChain` 116,
`useEditSessionCore` 77, `useContextEditing` 72, `WorldContextOverlay` 41, `useVisit` 24, `EditingWorkspace` 22,
`useBeforeUnloadGuard` 15); `hooks/useGuardedFetch.ts` grew 121 → 124. Net: 8,190 paired lines became 7,653 paired + 500 shared
(−37 overall, −34 with `useGuardedFetch`'s +3). Plan 8 bought single-sourced behaviour (and the bugs it fixed on the way), not fewer lines.

## What remains duplicated inside the canvases

Method: code lines only (blank, comment-only and lone-bracket lines dropped, whitespace collapsed), then
`difflib.SequenceMatcher` over the two files; "aligned" = identical lines in matching runs of 3+.

| Pair | code lines GBA / GBC | identical (any order) | aligned in runs ≥3 | runs | longest run |
|---|---|---|---|---|---|
| `MapCanvas` / `GbcMapCanvas` | 508 / 527 | 321 | 250 (~48%) | 34 | 24 |
| `WorldCanvas` / `GbcWorldCanvas` | 1228 / 839 | 467 | 295 (~24% / 35%) | 45 | 34 |
| `App` / `GbcApp` (for scale) | 246 / 255 | 102 | 50 | 11 | — |

Largest aligned runs, by what they are:
- MapCanvas pair: zoom/pan handlers (`applyZoom`… 24 lines), the zoom-button and status-strip JSX (24 + 19 + 16 + 13),
  composite version and redraw effects (15 + 13 + 9), controlled-view plumbing (8), stroke handlers around `chain.start` (6).
- WorldCanvas pair: the lens overlay JSX (34), conflict acceptance wiring (15), effects (13), the context overlay mount (13),
  tile-version refetch (10), lens overlay entries (9), small-tile cache (8), badge geometry (8).

Reading: the shared parts are many short runs interleaved with family rendering (GBA metatile/layer drawing, GBC
block/time-of-day palettes, different LOD caches and hit-tests). Lifting them needs a render-pipeline core that takes
`geometry` plus family overlay drawers — the "canvas-core unification" the plan gates. Its risk is high (hit-testing, LOD
caches, overlays). The cheap middle option is a few more leaf extractions (zoom/status-strip JSX, the lens overlay
block, tile-version refetch) at roughly 100-150 lines per pair, without touching rendering.
