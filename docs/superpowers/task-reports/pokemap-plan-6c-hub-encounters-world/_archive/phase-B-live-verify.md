# Plan 6c Phase B: criterion 2 live verify (coordinator, 2026-10-01)

Setup (5173 held by a leftover Vite from an earlier session, left alone): the real `serve.ts --gbc` with
an `--import` preload remapping `listen(5174)` → 5184, `POKEMAP_HOME` = a scratch dir; Vite started
programmatically on 5183 (`root` via `fileURLToPath`, not `URL.pathname`, which keeps `%20` for the
space in "Programming Projects" and serves 404s), `/api` proxied to 5184. Project switches via
`POST /api/hub/open`. Viewport 1280×900, then 1024×800. Code at `25d19a4` (B4 closed), gate 1,935 / 0.

| Check | Result |
|---|---|
| GBC world, Route30, Encounters on | strip on the **left** (U4: top blocked by Route31, bottom by Cherrygrove), 13 sprites in B1's pinned order Caterpie, Hoothoot, Pidgey, Ledyba, Spinarak, Poliwag, Weedle, Hoppip, Zubat, Poliwhirl, Magikarp, Pineco, Exeggcute |
| Hover Poliwag | `Poliwag` / `Grass · nite 20% Lv 4-8+ · rate 9.8%` / `Surf 75% Lv 15-24+ · rate 2%` / `Fish · Old Rod 14.8% Lv 10 · bite 50%` / Good Rod day+nite 64.8% Lv 20 / Super Rod day+nite 79.7% Lv 40 / `+ = level can roll up to 4 higher` |
| Hover Pineco (tree class) | `Pineco` / `Headbutt · rare 30% Lv 10` |
| Day | only Zubat dimmed |
| Nite | Caterpie, Pidgey, Weedle, Hoppip dimmed (exactly the morn/day-only species) |
| Morn | all 13 present, only Zubat dimmed; dimmed img opacity 0.4 + dashed outline; `aria-label` "Zubat, not encountered at morn" |
| Fit all (zoom 3%) | 125 count badges, `Route30 · 13 species` |
| GBA world, Route102 | strip on **top** (left and right blocked by its west/east neighbours), 11 GBA icons; hover `Poochyena` / `Land 30% Lv 3-4`; no failed-fetch alert |
| GBA map view, Route102 | `Encounters` last in Overlays (`aria-pressed` true), legend row "Encounters: hover or focus a sprite", strip on top outside the drawn border ring, no internal toggle; Fit leaves the band in view |
| GBC map view, Route30 | strip on the left (north/south connections), 13 sprites, Zubat dimmed at Day, legend "Encounters: hover or focus a sprite; dimmed = not at day, + = level can roll up to 4 higher" |
| Overflow | `scrollWidth === clientWidth` at 1280 and 1024 |
| Corpora | GBA subject porcelain 7 lines before and after (the known 6 M + 1 ??); PerfPlus clean; real `~/.pokemap` never created |

Observations (not defects, for later phases):
- At Fit all the per-map count badges overlap heavily (the old gutter's badges behaved the same).
- A map taller than the viewport at 1× (Route30 in the GBC map view) shows its left strip starting above
  the visible area until panned; `fit` can't go below 1×.
- GBC world still draws every placement including interiors (Phase D's visibility work).
