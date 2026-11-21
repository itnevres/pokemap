# Plan 14.2 Task 15: live acceptance on scratch copies

2026-11-19, session t15a (Opus), run in parallel with conductor s17 (Task 14b not merged yet). Code under test: the
main checkout at `824680f` (Task 14a merged), served live (hub via tsx, UI via Vite). No product source or tests touched;
no vitest run.

## Harness

- Real subjects, measured before anything ran: GBA `C:\Programming Projects\Pokemon Game\game` HEAD `590fdf303`,
  porcelain 0, manifest `f31f440ec431`; PerfPlus `C:\Programming Projects\pokecrystal-PerfPlus` HEAD `81ededbe3`,
  porcelain 0, manifest `9fdc463ffc33`. Manifest = first 12 hex of `sha1(git ls-files -s)`.
- Scratch clones (`git clone` of each subject) in the t15a scratchpad
  `C:\Users\Serve\AppData\Local\Temp\claude\8fd0350c313cb955\2d4175d4-8548-424b-acd0-e63f1b320a9f\scratchpad\live\{gba,gbc}`.
  Every Save is committed in the clone (`t15 <tag>`) so the saved state is the next baseline and the hub never sees
  a revert behind its back. Clone logs: GBA `a949d5785` (alias edit), `dbf9b3a33` (Save as new); GBC `b253f2cba`.
- Hubs: `task-15-shots/hub.mts` (`createHub({ port, open, home })`) on 5214 (GBA) and 5216 (GBC), `POKEMAP_HOME`-style
  scratch homes `home-{gba,gbc}`. Vite: `task-15-shots/vite.config.mjs` (`UI_PORT`/`HUB_PORT` env) on 5213 / 5215.
  Ports 5173/5174/5183/5184 untouched.
- Driver `task-15-shots/t15-live.mjs <tag> <gba|gbc> <uiPort> <clone> <map> [key=value...]` (from plan-10a3
  `shots/live.mjs`): headless Chromium shell 1248, 1400x900. Keys: `scenario=edit|discard|saveAsNew|probe`,
  `cell=x,y` (pointer walked to the cell by the status-bar hover readout), `edit=tile:<sheet index>|xflip` (default:
  palette of square 0), `confirm=cancel`, `alias=<map>` + `aliasCell=x,y` (opened in a second tab on the same hub),
  `save=1`. Output `task-15-shots/out/<tag>.json`: every check pass/fail/n-a with detail, network log (block GET /
  POST bodies), confirm text, warnings, byte diffs of every saved file against the clone's HEAD.
- Pixel compare: the dialog's 16x16 (GBA) / 32x32 (GBC) preview PNG is searched on the stage canvas at zoom 1/2/4
  (nearest neighbour, exact RGB); "near" = a hit whose rectangle contains the clicked point. A uniform block (GBA
  block 1, black) matches everywhere, so checks on it are weak; the visible-edit runs use `edit=tile:N`.
- Harness lessons: `window.confirm` (Discard) is auto-dismissed headless unless the driver accepts it; GBC hover
  readout is in event steps (block = step / 2), `cell=` is GBA-only so far; GBC sheet index 20 is a run-time
  reserved tile (click ignored), index 40 works; redo redraw takes about 2 s (driver polls 10 s).

## Session t15b (2026-11-20)

Code under test: `d0e31ff` (14b merged `e72313c`; UI served by the same Vite / hubs, 14b changed UI only). Phase B open.
Driver keys added: `via=tool|palette`, `pid=<palette label hex>`, `presel=<hex>` (select first, to check the
selection survives the right-click), `vw/vh` adds a dialog-fits check, `stale=<clone-relative file>` (flip the last
byte behind the hub, try Save, restore), `owner=<map>` + `ownerTile=<sheet index>` (second tab: refusal, release on
undo, redo refusal). New scripts: `usage-scan.mjs` (independent usage oracle, clone files only), `pngdiff.mjs`
(IHDR + changed 8x8 tiles), `ownprobe.mjs` (direct hub Q3 probe). Harness lessons: a draft must actually change the
block (a `tile:N` equal to the current tile, or a GBC sheet index the sheet ignores, gives a silent no-op apply):
check "draft preview changes" before reading later rows; after another map's undo, a still-open dialog answers
"The block changed since this editor opened; reopen it" (close and reopen). Clone HEADs after t15b: GBA
`7e72c042d` (t15 gba-pal-san), GBC `2d7e42899` (t15 gbc-san); NewBarkTown GBA (15,19) is `$310`, GBC centre
(5,4) is `$80`.

## Session t15c (2026-11-20)

Code under test: `d0e31ff` (no product change since t15b). Same hubs / Vite; hubs restarted after each external clone
change (cap padding, block-0 cell), and the clone restored with `git checkout` before the restart. Driver keys added:
`twice=<sheet index>` (second edit + one undo before the ownership probe), `refuse=1` (Save as new: read the refusal;
when the button is enabled, draft, press, read status and plan, then discard), `names=a+b` (maps the refusal must
name), `edit=allLocal` (GBC: All on square 0 and Local on square 1 in one draft), `paintOwner=<map>` + `newId=0x..`
(second tab pencils the owner's unsaved appended id, then the owner discards). New scripts: `t15-group.mjs`
(placement groups; oracle = picker hover readout per sheet index plus the spec rule; GBC reserved indices read
"Reserved at run time", so their id comes from the GBC sheet rule, index < $60 → index, else index + $20) and
`t15-menu.mjs` (row 3e; "no pan" = the same cell under the pointer before and after the right-click; barrier = the
undo request held by `page.route` while right-clicking). Harness lessons: clicking the selected picker index again
deselects it; the GBA sheet (1024 indices) scrolls the dialog, so hover by element-relative position; Playwright
`click({modifiers})` on a square times out unless the keys are held first (the mode heading moves the grid); the
first zoom click needs about 3 s to settle; pan is a left drag with no tool selected; a second tab opens with no tool
selected (press Pencil before painting). Clone HEADs after t15c: GBA `7e72c042d` (unchanged), GBC `bc213315e`
(t15 gbc-alllocal).

## Results

| Row | GBA | GBC |
|---|---|---|
| 1 popup from map context menu; preview = canvas pixel-for-pixel | pass (Lounge2 (0,7) $001; NewBarkTown (15,19) $2E3) | pass (NewBarkTown $01) |
| 1 popup from Edit block tool | pass (t15b `gba-tool`: K presses the tool, left click on NewBarkTown (15,19) opens `Edit metatile $310`, preview = canvas, OK / redraw / `tv=` / undo / redo pass) | pass (`gbc-tool`: centre $01, same checks) |
| 1 popup from palette (right-click) | pass (`gba-pal`, `gba-pal-san`: right-click `metatile 0x310` opens the editor; selection `metatile 0x1` unchanged before/after; preview found once on the canvas) | pass (`gbc-pal`: right-click `metatile 0x80`, `metatile 0x1` stays picked; preview = canvas; OK / redraw / undo / redo pass) |
| 1 Ctrl / Ctrl+Shift 2x2 / 4x4 placement | pass (`gba-group`, `t15-group.mjs`: mode heading "Place 2x2" for Ctrl and for Ctrl+Shift (4x4 not offered), 2x2 on the Top layer = sheet indices k, k+1, k+16, k+17; oracle = the picker's own hover readout per index) | pass (`gbc-group`: "Place 2x2" / "Place 4x4"; 2x2 and 4x4 at square 0 equal the sheet group) |
| 2 OK redraws the map canvas | pass | pass |
| 2 alias tileset + view opened afterwards redraws | pass: edit $001 through `gTileset_Building_Frontier` (BattleFrontier_Lounge2), second tab opens EverGrandeCity_ChampionsRoom (`gTileset_Building`, same `gMetatiles_InsideBuilding`): cell (0,0) pixel-equals the draft, alias GET returns the edited block | pass (`gbc-cave`): edit $04 on UnionCave1F (usage line "files shared by tilesets TILESET_CAVE, TILESET_DARK_CAVE"), OK / redraw / `tv=` / undo / redo pass; MountMortar1FOutside (TILESET_DARK_CAVE) opened afterwards: hub GET of its $04 cell (0,2) returns the edited tiles (square 0 `1→41`). Pixel find n-a: Dark Cave draws the block with a different sheet, so the draft PNG cannot appear there |
| 2 `tv=` refetch after OK | pass | pass |
| 2 Save writes only the edit's tileset files | pass: `primary/building/metatiles.bin` byte 17 `0x00→0x50` (palette 5), nothing else | pass: `johto_metatiles.bin` byte 16 `0x06→0x28` (tile 40), nothing else |
| 2 undo / redo | pass (canvas and `/plan` empty after undo) | pass |
| 2 Discard | pass (canvas restored, not dirty, clone porcelain empty) | pass (`gbc-discard`) |
| 2 failed save keeps state | pass (`gba-stale`: `secondary/new_bark_town/metatiles.bin` changed behind the hub → Save refuses naming it; dirty, plan and file bytes kept) | pass (`gbc-stale`) |
| 2 draft with several palette changes (All and Local) in one OK | n-a (GBA has no scope) | pass (`gbc-alllocal`, block $80: square 0 BROWN→GRAY All, square 1 GRAY→BROWN Local in one draft; confirm, redraw, `tv=`, undo (plan empty), redo, Save. Bytes: `johto_palette_map.asm` one token (tile $2B BROWN→GRAY); `johto.png` IHDR kept, only tile 33 changed and equals old tile 6; `johto_metatiles.bin` block $80 squares 1-15 `6→33` (every square of this block that used tile 6, spec Local rule); clone `bc213315e`) |
| 3 Save as new from map: appends N, places on clicked cell, tileset + grid in one set, one undo reverts both | pass (NewBarkTown (15,19): `$2E3→$310`, split 0x280, local 144 = old count; `metatiles.bin` +16 bytes = source entry with only top square 0 tile → `$014`; `metatile_attributes.bin` +2 bytes = source attribute; `map.bin` one u16 changed, upper bits `0x04` (collision/elevation) kept; earlier bytes unchanged; undo → `/plan` empty) | pass (`gbc-san`: `johto_metatiles.bin` 2048→2064 = new $80, `NewBarkTown.blk` byte 45 `$01→$80`, `johto_collision.asm` one line appended, undo → `/plan` empty) |
| 3 refuses at the cap naming the file; palette appends only; shared grid refusal | palette appends only: pass (`gba-pal-san`). Cap: pass (`gba-cap`, `new_bark_town` padded to 384 entries in the clone, hub restarted, then restored: "data/tilesets/secondary/new_bark_town/metatiles.bin: layout LAYOUT_NEW_BARK_TOWN (secondary) allows 384 metatiles; cannot append metatile 384", nothing staged). Shared grid: pass (`gba-shared`: "BattleFrontier_Lounge2: shared grid used by BattleFrontier_Lounge2, BattleFrontier_Lounge5", nothing staged, no `/block/apply`) | Cap: pass (`gbc-cap`, johto padded to 256 blocks + 256 collision records, restored: "data/tilesets/johto_metatiles.bin: block cap 256 reached"). Shared grid: pass (`gbc-shared`: "OlivinePortPassage: shared grid used by OlivinePortPassage, VermilionPortPassage"). Both families: the Save as new button stays enabled until pressed; the refusal shows on press |
| 3a All / Local, free slot, reserved, Cave/DarkCave refusal, Save as new after All | n-a | All pass (`gbc-all`); Local pass (`gbc-local`); Save as new after All pass (`gbc-san-all`); reserved source: pass (`gbc-local-res`, NewBarkTown block $18 square 0 tile $10: "tile $10: reserved by runtime", nothing staged); Cave/DarkCave: pass (`gbc-local-cave`: "data/tilesets/cave_metatiles.bin: Local sheet mismatch: TilesetCave, TilesetDarkCave", nothing staged); no free slot: not run (needs every johto sheet slot used; harness cost) |
| 3b GBC raw block 0 notice | n-a | pass (`gbc-blk0`: no subject grid holds block 0, so NewBarkTown.blk byte 12 set to 0 in the clone (hub restarted, restored after): popup "Edit block $05", "This cell is block 0; editing the border block $05", usage "(+ border)", preview = canvas) |
| 3b GBA cross-half warning; still applies | pass: OK on $001 shows "entry 0 tile differs: LAYOUT_… -> gTileset_Building[73] …" and "entry 0 palette differs …" (one `role=status` per entry), apply still staged | n-a |
| 3c placement at block edge / sheet end / `$5F`/`$80` gap | pass (`gba-group`: square 1 / square 3 clipped at the block edge, k=31 skips past the row edge, last index $3FF skips past the sheet end) | pass (`gbc-group`: 2x2 at square 3 and 4x4 at square 10 clipped; k=31 row edge; last index ($DF) sheet end; k=80 2x2 crosses the gap: index 96 is tile $80 (index 95 is $5F, reserved), group = $50 $51 $80 $81; 4x4 from 72 = $48-$4B, $58-$5B, $88-$8B). Note F4 |
| 3d ownership (partial undo, release, redo refusal, unsaved appended id) | pass (`gba-own`: NewBarkTown $025 in `johto_general` (24 maps affected), second edit staged, one undo → first edit still staged and Route29 refused; owner's last undo releases (Route29 stages); NewBarkTown redo then refuses "NewBarkTown: …metatiles.bin: Route29 has unsaved block edits …", plan unchanged, Redo enabled, clone clean). Appended id: GBC only | `gbc-own` pass (release, redo refusal). Appended id: pass (`gbc-paint`: NewBarkTown Save as new stages $81 unsaved; CherrygroveCity pencil with palette `metatile 0x81` → 409 "CherrygroveCity: data/tilesets/johto_metatiles.bin: block 129 is an unsaved addition of NewBarkTown; save it there first", nothing staged; after NewBarkTown Discard both plans empty, clone clean). Partial undo: GBA only |
| 3e menu at several zooms/pans, over events, never paints, disabled outside interior / barriers, Escape and map switch close | `gba-menu` (`t15-menu.mjs`): zoom 1/2/4, after a pan (left drag at 4x), over object event (9,16): menu opens, dialog names the hovered block, nothing staged, same cell under the pointer after; outside the interior: item disabled; Escape and map switch close: pass. **During a pending undo: fail (F5)** | `gbc-menu`: same checks pass incl. event quadrant step (11,5) → block (5,2) $47; **pending undo: fail (F5)** |
| 4 confirm step exactly when another map's drawing changes | pass: $001 (837 uses on 86 other maps) → "Confirm edit" with per-map list; $2E3 (no other map) → no confirm; GBC no-op OK → no confirm, nothing staged | pass ($01, 26 other maps) |
| 4 confirm Cancel keeps the draft, stages nothing | pass (preview unchanged, 0 `/block/apply`, not dirty) | pass (`gbc-discard`) |
| 4 usage counts vs independent scan | pass: `usage-scan.mjs` (reads only clone files) and a per-grid recount: $001 in `gMetatiles_InsideBuilding` (9 aliased tilesets) is drawn by 87 grid files; app lists 87 rows, every interior/border count equal; the 35 maps not listed share a grid with a listed map and every such grid is named in `sharedGrids` (spec: shared grid counts once per file and names all its maps) | pass: $01 johto: 33 on NewBarkTown, 1011 on 26 other maps, per-map rows equal |
| 5 ownership refusal names both maps and files; stale fingerprint refusal | ownership: partial (F3, `gba-own`: "…johto_general/metatiles.bin: NewBarkTown has unsaved block edits …" in Route29's dialog, 409, nothing staged). Stale: pass (`gba-stale`) | ownership: partial (F3): CherrygroveCity's dialog shows "data/tilesets/johto_metatiles.bin: NewBarkTown has unsaved block edits to this file; save, undo or discard them there first" (409 `NOT_OWNER`, nothing staged; also confirmed by `ownprobe.mjs` direct hub calls incl. after undo+redo): names the owner and the file, not the requesting map. Stale: pass (`gbc-stale`) |
| 6 lossless by format | byte checks above (binary metatiles, attributes, grid) | pass: text `johto_palette_map.asm` one token per edit; `johto_collision.asm` one `tilecoll` line appended; PNG (`pngdiff.mjs`): IHDR 128x96 depth 2 colour type 0 before and after, only tile 32 changed, equals old tile 40 |
| Added: dialog at 720x560 (D6) | pass: panel 688x528 at (16,16), no horizontal scroll, scrolls vertically | pass (same box) |
| Added: Save dialog "affects" row from real data (B12/M7) | pass ("affects: BattleColosseum_2P, … and 213 more"; NewBarkTown: "affects: NewBarkTown, Route27, Route29") | pass |

## Findings (not fixed; for Task 16 / the user)

- **F1 (UI, likely pre-existing):** a freshly loaded page does not show a hub-staged edit as dirty. After a run left a
  staged tileset edit on `BattleFrontier_Lounge2` / `NewBarkTown`, a new page showed Save and Discard disabled while
  `GET /api/edit/<map>/plan` listed the file. The next Save on that map then also wrote the hidden staged file (it
  was listed in the Save dialog). Not specific to the block editor; check whether paint edits behave the same.
- **F2 (UI, Minor):** React warning "Encountered two children with the same key" (key `162`) when the GBA dialog
  opens: the Behavior select has 256 options and two `MB_` names share value 162 (option keyed by value).
- **F3 (hub/UI, Minor, spec 5 wording):** the ownership refusal names the owner map and the file but not the
  requesting map ("data/tilesets/johto_metatiles.bin: NewBarkTown has unsaved block edits to this file; …" shown in
  CherrygroveCity's dialog). The redo refusal does name both (prefixed with the requesting map). Behaviour is correct
  (409 `NOT_OWNER`, nothing staged).
- **F4 (UI, Minor, spec gap):** GBC placement groups place run-time reserved tiles (e.g. 2x2 from index 40 puts
  $38 = index 56, reserved, into square 4), while a single click cannot select a reserved tile. The placement rule
  (spec §Shell and UI) skips only past the sheet end, row edge and block edge, so this matches the text; whether
  reserved sources should be skipped is for the user.
- **F5 (UI, Important, spec 3e):** the map context menu's "Edit block" stays enabled while an undo is pending
  (both families; `t15-menu.mjs` held `POST /edit/<map>/undo` and right-clicked: item enabled). Cause:
  `editBlockDisabledReason` uses `hasPendingSessionMutations`, which only tracks `/event/create` and
  `/block/apply` (`packages/ui/src/shared/useEditSessionCore.ts` around line 116), not undo / redo / save / discard /
  switch. Spec 3e and §Shell and UI require the item disabled during every action barrier. Not fixed here (shared UI).
- Note (not a bug): Save as new's cap and shared-grid refusals appear on press (the button is enabled before).
- Note: `make` ran on a copy of the GBA clone at `7e72c042d` (alias edit, Save as new and palette Save as new
  committed) in WSL Ubuntu with devkitARM r65: `make modern -j16` exit 0, `pokemonHnS.gba` 32 MiB. GBC not built: no
  `rgbasm` on Windows or in WSL.
- Note (not a bug): usage counts are per grid file; maps sharing a grid are not separate rows but are named in
  `sharedGrids` (spec Usage index). GBA $001: 87 grids, all equal to the independent scan.
- Note: redo's canvas redraw lands about 2 s after the click (undo is faster); first-run checks at 2.5 s flaked.

## Not run

- 3a GBC Local "no free slot names the sheet": needs every johto sheet slot in use (PNG and metatile edits in the
  clone); left for the user / Task 16.
- `make` on the GBC clone: no `rgbasm` (Windows or WSL).
- 3d "redo after another map took **and saved** the file": the run stages in the other map but does not save it
  (same as `gbc-own`).

## Close-out

- Real subjects after all runs: GBA `590fdf303` / porcelain 0 / manifest `f31f440ec431`; PerfPlus `81ededbe3` / 0 /
  `9fdc463ffc33`: unchanged.
- Committed evidence: `task-15-shots/*.mjs|mts` and `out/*.json` trimmed to the mutating requests (block apply / check, save, undo, redo, discard; `netCount` keeps the full count). Screenshots (`out/*.png`, 3.9 MB) stay local, not committed.
- **Gate at `d0e31ff` (+ uncommitted Task 15 docs/harness only): 5,138 pass / 2 fail / 273 files; typecheck pass, UI build pass; subjects unchanged.** Fails: `packages/core/test/config/engine.test.ts` "parses the subject repo's real porymap.project.cfg" (known env fail, RESUME); `packages/ui/test/WorldCanvasContext.test.tsx` "snap uses the canvas box … shifted box" (load flake: RESUME lists a `WorldCanvasContext` load flake, a different test in the same file; rerun alone 38/38 pass).
