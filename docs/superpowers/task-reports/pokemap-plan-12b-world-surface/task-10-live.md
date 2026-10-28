# Task 10 live acceptance: partial (stopped at the P12-4e stop rule)

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
