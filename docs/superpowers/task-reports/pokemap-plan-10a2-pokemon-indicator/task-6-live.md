# Plan 10a2 Task 6: live acceptance, both families (2026-10-18)

Branch `plan-10a2-pokemon-indicator`. Hub = real `serve.ts` via the 5174→5184 preload, scratch `POKEMAP_HOME`; Vite 5183;
headless Chromium 1208 via the cached `playwright-core`. Driver and hash script: `task-6-shots/ind.mjs`, `task-6-shots/manifest.sh`.
GBA final run on `64ab790` (after the Task 6 fixes); GBC run on `99d5d0e` (GBC path unaffected by those fixes).

| Subject | Before | Final | Result |
|---|---|---|---|
| GBA `Pokemon Game/game` (8 user porcelain lines left in place) | `a0349693144d` | `a0349693144d` | byte-identical |
| GBC `pokecrystal-PerfPlus` (clean) | `13a31cb654ff` | `13a31cb654ff` | byte-identical |

External baselines after: GBA HEAD `718b89f73`, world.json `9c8ab2a…`, dungeons.json `f73f9b7…`, LittlerootTown map.bin
`bdc3ddce2…`; PerfPlus HEAD `81ededbe3`, clean, no `.pokemap`. Restores were byte copies taken before the run.

## P8 flow

| Check | GBA Route101 | GBC Route33 |
|---|---|---|
| Place | WURMPLE at suggested (2,1); banner "Placed Pokémon Indicator: Route101_EventScript_PokemonIndicator1" | SPEAROW (generic) at (6,15) → `SPRITE_MONSTER`, label `Route33PokemonIndicator1`; GEODUDE (own) → `SPRITE_GEODUDE`, label 2 |
| Drag | (2,1)→(4,1); hover shows the object at (4,1) | step (6,15)→(4,15); hover shows object #3 at (4,15) |
| Edit Indicator | enabled; X/Y hidden; prefill text + WURMPLE pressed; Update → ZIGZAGOON + 60-char text | enabled; same; Update → ZUBAT + same text |
| Save dialog | `Route101.json -- 1 field edit`; `Update sign text in scripts.inc` | `maps/Route33.asm -- event block edited` |
| Files changed (manifest diff) | exactly `map.json` + `scripts.inc` | exactly `Route33.asm` |
| Bytes | one object (graphics `OBJ_EVENT_GFX_SPECIES(ZIGZAGOON)`, x 4, y 1, script `…PokemonIndicator1`); C3 script with `playmoncry SPECIES_ZIGZAGOON`; text wrapped at 18 (`\n`, `\l`, `\l`, `$`); LF kept | two consts, two C4 scripts (`cry ZUBAT`, `cry GEODUDE`), text `text`/`line`/`cont`/`cont`/`done`; object_events `4, 15, SPRITE_ZUBAT` and `6, 15, SPRITE_GEODUDE`; LF, tabs, column style kept |
| Reload, fresh hub | (4,1) hover `object: OBJ_EVENT_GFX_SPECIES(ZIGZAGOON)`; `indicator/at` editable, text round-trips | step (4,15) hover `object #3 SPRITE_ZUBAT`; app loader re-parsed the `.asm`; Edit enabled |

Sprite VRAM limit (spec known limit): not observable in the editor; no emulator run.

## Findings

- **F-1 (Important, GBA, fixed in `64ab790`).** First GBA run: Save dialog said "No changes to save" while dirty. Cause: the
  pre-existing `event/move` route staged jsonEdits at the current index; jsonEdits apply to disk JSON before insertOps, so moving a
  not-yet-saved event made the plan refuse `index 7 is not present`. Also pre-existing: the Save dialog hid plan-load refusals.
  Fix: fold moves of pending inserts into the insertOp; render plan refusals. Re-run passed (table above).
- **F-2 (Important, both, fixed in `64ab790`).** A second Place suggested the step the first staged Indicator occupies (C5 "no
  object there"): suggestions read disk, not the session. Fix: suggestions exclude session objects.
- **F-3 (Minor).** GBA Save dialog labels the Indicator's script change "Update sign text in scripts.inc" and the inserted object
  "1 field edit". Wording only.
- **F-4 (Info).** GBC `object_const_def` keeps `ROUTE33_MONSTER` after the species edit to ZUBAT (Task 3 interface: consts untouched).
- **F-5 (Info, pre-existing, out of scope).** Moves/edits after a pending deletion of an earlier object still target the wrong
  original index in GBA `event/move` (Indicator update refuses this case since Task 4).
