# Plan 10a Task 8: live acceptance, both families (2026-10-16)

Branch `plan-10a-switch-and-signs` at `fe0ba79` (26da6ad plus a docs-only merge of master `49a1e7f`).
Hub = real `serve.ts` via the 5174→5184 preload, scratch `POKEMAP_HOME`; Vite 5183; headless Chromium 1208 via the
cached `playwright-core`. Driver and hash script: `task-8-shots/run.mjs`, `task-8-shots/manifest.sh`.

**Hash method.** `manifest.sh` = `git status --porcelain -uall` plus `sha1sum` of every tracked and untracked
(non-ignored) file. Taken before any edit, after each scenario, and at the end. The hub was restarted between
scenarios so each reload read disk, not the map cache (ledger M8).

| Subject | Before | Final | Result |
|---|---|---|---|
| GBA `Pokemon Game/game` (user's uncommitted NavelRock/fieldmap edits left in place) | `a0349693144d` | `a0349693144d` | byte-identical |
| GBC `pokecrystal-PerfPlus` (clean) | `13a31cb654ff` | `13a31cb654ff` | byte-identical |

Restores were byte copies of `data/maps/Route101`, `data/layouts/Route101`, `maps/Route29.*` taken before the run.

## A6: paint → switch → Discard / Save

| Check | GBA (Route101 → Route102) | GBC (Route29 → Route30) |
|---|---|---|
| Paint makes the map dirty | yes (block 10,9) | yes (block 15,4) |
| Tree click shows the prompt | "You have unsaved changes on Route101." Save/Discard/Cancel | same text for Route29 |
| Discard | `POST discard 200` after `paint/end`; switched to Route102; clean | same; switched to Route30 |
| Hash after Discard | equal to before | equal to before |
| Save → Save dialog diff | `data/layouts/Route101/map.bin -- 1 block changed` | `maps/Route29.blk -- 1 block changed` |
| Files changed after commit | only `map.bin`; 1 byte at offset 380 (= block 10,9 at width 20), 0x01→0x03 | only `Route29.blk`; 1 byte at offset 135 (= block 15,4 at width 30), 0x63→0x03 |
| After commit | switched to target, clean, no dialog left | same |

## B8: place a linked name sign, Save, reload

| Check | GBA Route101 tile (4,2) | GBC Route29 tile (19,2) |
|---|---|---|
| Editor anchor | click (611,386) → editor top-left (608,395) | click (534,381) → (528,403) |
| Save dialog diff | `Route101.json -- 1 field edit`; `scripts.inc -- append 7 lines` | `maps/Route29.asm -- event block edited` |
| Files changed (manifest diff) | exactly `map.json` + `scripts.inc` | exactly `Route29.asm` |
| Bytes written | one `bg_events` sign entry for `Route101_EventScript_PokemapSign1`; script + `@ pokemap:sign name f1dfb55a` + `.string "ROUTE 101$"`, LF kept | script + `; pokemap:sign name 36a748f8` + `text "ROUTE 29"`/`done` before `_MapEvents`; `bg_event 19,  2, BGEVENT_READ, Route29PokemapSign1` in column style |
| Reload with a fresh hub | `sign/at` → `{kind:sign, mode:name, text:"ROUTE 101", handEdited:false}`; editor offers **Update** | same with `"ROUTE 29"`. The app's loader re-parsed the written `.asm` |
| Restore | byte copy → hash equal | byte copy → hash equal |

GBC assemble check: not run. No `rgbasm` or `make` on PATH; spec B8 says "if a build check exists".

## Word over 18 characters (deferred minor from Task 7)

Free text `ABCDEFGHIJKLMNOPQRSTUVWXYZ`. The preview shows it as one 26-character line. The **server refuses**:
`sign/put 400`, the editor stays open, nothing is staged (not dirty). Both families. So the preview is only
misleading, and the ruling (Minor, display only) stands.

## Findings (not fixed here; Task 8 is evidence only)

- **F1 (Important, UI, both families; fixed 2026-10-17, see below).** The Sign editor renders 720×560 px. It is mostly unstyled: bare fieldset
  and a full-width button row. Opened at a tile in the lower half, it runs past the viewport bottom (y 395 + 560 > 900).
  S2 asks for "a small popover anchored at the clicked tile". Anchoring is right; size and clamping are not.
  Cause: it reuses `warp-modal__panel` outside the modal backdrop. Shots: `*-long-2-placed.png`, `*-b8r-1-reload-editor.png`.
- **F2 (Minor).** For linked modes the preview shows the placeholder "Linked text / preview". It does not show the
  linked text, even on a placed sign where `sign/at` already returns `"ROUTE 29"`.
- **F3 (Minor).** The too-long-word refusal names the charmap file (`charmap.txt` / `constants/charmap.asm`) as its
  location, though the charmap is not at fault.
- **F4 (Minor).** The GBA Save dialog lists `scripts.inc` by absolute path; `map.json` uses a short name.
- **F5 (Info).** The pre-existing toolbar "Add Sign" composer button still shows next to the new Sign tool (GBA).
- **F6 (Info, pre-existing).** The hover readout keeps the pre-paint metatile id until the mouse moves.

## F1 fix (2026-10-17)

`SignEditor` now has its own `.sign-editor` style: 300 px wide, padded, `max-height: calc(100vh - 16px)` with
scrolling. It opens below a tile in the upper half of the window and above a tile in the lower half, and `left` is
clamped inside the window. Live, at 1400×900 viewport:

| Case | Click | Editor box |
|---|---|---|
| GBA upper (4,2) | (611,386) | (608,395) 300×303 |
| GBA lower (4,19) | (611,648) | (608,332) 300×303, ends above the tile |
| GBC upper (19,2) | (534,381) | (528,403) 300×303 |
| GBC lower (19,11) | (534,527) | (528,212) 300×303, ends above the tile |

New jsdom test pins both placements and the clamp; forcing "always below" fails it. Gate 2,991 pass / 0 fail /
192 files; typecheck and UI build pass. Both subjects unchanged. Shots: `gba-f1-0.7-2-placed.png`,
`gbc-f1-0.55-2-placed.png`.

## Gate at start

`npm test` at `fe0ba79`: 2,989 pass / 1 fail / 192 files. The failure was
`GbcAppEditing.test.tsx > beforeunload is registered only while dirty`. It passed 11/11 in each of 3 isolated
reruns, so it is a load flake (same class as the Task 7 App P-key one-off).
