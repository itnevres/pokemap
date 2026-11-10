# Plan 14.1 Task 9: live acceptance run (both families)

2026-11-09, Sonnet 5.5 (completing Codex's draft driver). Code under test: the main checkout `C:\Programming Projects\PokeMap`
served live (hub via tsx, UI via Vite). Its HEAD moved during the run: `cd1ef6e` when I started, `a0e1586` from 11:53 (Task 10
fix round 1, `645131c`, merged 11:47). Hubs restarted after 11:53 ran the new code; findings W1/W2 below appeared only after that merge.

## Harness

- Driver `task-9-shots/accept.mjs <gba|gbc> <clone> <map> [scenario...] [--coord-map=MAP] [--no-slot] [--ui=URL]`; headless
  Chromium shell 1248, 1400x900. Output `shots/<family>-accept-<scenario>[-noslot].json` (one JSON per run: every sub-check with
  pass/fail/n-a and detail, network results, dialog text and buttons on failure) plus `shots/*.diff` and failure PNGs.
  Every sub-check is recorded (no early abort); the scenario fails if any sub-check fails.
- Scratch clones only (GBA `.../live/gba`, GBC `.../live/gbc` in the session-3 scratchpad). Hubs on 5194 (GBA) and 5196 (GBC),
  Vite on 5193 / 5195, `POKEMAP_HOME` scratch dirs. Ports 5183/5184 untouched. Clones reset with `git checkout -- <changed tracked
  paths>` between scenarios; final `git status --porcelain` of both clones is empty.
- Hub restarts were needed whenever a clone was reverted behind the hub's back (see Harness notes).
- Workarounds because of finding W1: button presses and the placement click use DOM `click`/synthetic mouse events; GBC (and GBA)
  New-flag adds are done last and saved at once (the staged flag is what wedges the page).
- No vitest, no product source or tests touched.

## Results

Counts are sub-checks (pass / fail / n-a).

| Scenario | GBA NewBarkTown | GBC VioletCity (+ Route29 for coord) |
|---|---|---|
| bar | pass 12 / 0 / 1 | pass 13 / 0 / 0 |
| kinds-defaults | pass 31 / 0 / 0 | pass 45 / 0 / 1 |
| script-modes | pass 36 / 0 / 4 | pass 35 / 0 / 4 |
| undo-redo | FAIL 6 / 1 / 1 (W3) | pass 7 / 0 / 1 |
| discard | FAIL 4 / 1 / 0 (W3) | pass 5 / 0 / 0 |
| refusals (a, b) | pass 7 / 0 / 2 | pass 7 / 0 / 1 |
| refusals --no-slot (c) | pass 14 / 0 / 0 | pass 11 / 0 / 0 |
| **Total** | **pass 110 / fail 2 / n-a 8** | **pass 123 / fail 0 / n-a 7** |

n-a sub-checks (all recorded with their reason in the JSON): GBA bar (no scene gating; object-cap/read-only reasons need a full or
read-only map); GBC bar: none; GBC VioletCity coord (no scenes; asserted on Route29 instead); copy-preview-names note in each of the four
script-modes copies (informational: the preview shows the original names, renaming happens at create and is asserted in the diff);
canvas marker count (bitmap canvas; counted through session events and the inspector); refusals (c) not run in the plain refusals run.

### What each scenario asserts

- **bar:** four buttons, tooltip == aria-label (disabled button shows its reason), icons only; GBC Coord disabled with "no scenes"
  title; placement starts (aria-pressed), cancels on Escape, same-button re-click, tool change, and map switch (and does not return on
  switching back).
- **kinds-defaults:** one add per kind/type at distinct cells: NPC, item ball, trainer (first dropdown entry), warp (first destination),
  coord (GBA; GBC on Route29), bg (GBA sign, hidden_item; GBC READ, ITEM, IFSET). Inspector shows the new event after each add. Save
  through the Save dialog, then per item: GBA the exact `map.json` event object (deep-equal on every key) and the exact script block
  (`msgbox T, MSGBOX_NPC`/`end` + text, `finditem`, `trainerbattle_single`+`msgbox ..., MSGBOX_AUTOCLOSE`, `lockall`/`releaseall`,
  `MSGBOX_SIGN`); GBC the `object_event`/`warp_event`/`coord_event`/`bg_event` line, object constants (count == objects), and the
  data/text blocks (`jumptextfaceplayer`, `itemball`, `trainer` header + `...After`/`endifjustbattled`, `hiddenitem ITEM, FLAG`,
  `conditional_event FLAG, Script`, coord `opentext`/`writetext`/`waitbutton`/`closetext`/`end`). Constants: each New flag has exactly
  one added line (GBA a renamed `FLAG_UNUSED_*` with the same value; GBC `const EVENT_*` inside the gap before the final `const_next`),
  added-line count == New flag count, nothing else removed. Changed paths within the allowlist; no removed lines except the JSON closing brace.
- **script-modes** (NPC and GBA sign / GBC READ): Existing: list non-empty, none of the movement/text/map-script labels parsed from the
  map's own script file offered, a sample of 12 offered labels really used as event scripts (GBA: `"script"` in some `map.json`; GBC:
  defined in the map file or `home/`; staged labels from this session are allowed per spec), chosen label referenced and not redefined.
  Copy: first copyable entry point (shortest body first, refusals recorded; none refused here); in the diff the new block equals the
  previewed body up to consistent label renames, the renames are exactly the source's self/text references, no original label appears in
  the added text, each copied text is defined once with the previewed lines. New: exact generated body for custom text
  `HELLO FROM POKEMAP` (GBA `msgbox`/`end` + `.string "...$"`, GBC `jumptext*` + `text "..."`/`done`). No constants file touched.
- **undo-redo:** add, dirty/inspector, Undo (dirty gone, files untouched, inspector empty), Redo, Undo; session event count
  GBA 29 -> 28 -> 29 -> 28, GBC likewise.
- **discard:** two adds (second with a New flag), Discard through the confirm, dirty gone, `git status --porcelain` equals the start,
  inspector empty.
- **refusals:** (a) invalid identifier `1invalid`: Add disabled, form kept; (b) existing label: HTTP 400 `LABEL_TAKEN`, text names the
  file and the map, form kept, nothing staged; (c) `--no-slot`: GBA all `FLAG_UNUSED_*`/`VAR_UNUSED_*` defines renamed in the clone
  (`..._FILLED_`), GBC the 48-slot gap filled with `EVENT_FILLER_n`: New flag -> `NO_FLAG_SLOT` (GBA also New var -> `NO_VAR_SLOT`),
  text names `flags.h`/`vars.h`/`event_flags.asm`, form kept, nothing staged.

### Changed paths per save

- GBA kinds (3 saves' worth, one commit each flagged add plus final): `data/maps/NewBarkTown/map.json`, `data/maps/NewBarkTown/scripts.inc`,
  `include/constants/flags.h` (three `FLAG_UNUSED_0x29x` renamed to `FLAG_NEWBARKTOWN_POKEMAP_*`). `vars.h` untouched (coord uses the existing `VAR_TEMP_0`).
- GBA scripts: `map.json`, `scripts.inc` only.
- GBC kinds: `maps/VioletCity.asm`, `constants/event_flags.asm` (four new `EVENT_VIOLETCITY_POKEMAP_*`); coord on `maps/Route29.asm` only.
- GBC scripts: `maps/VioletCity.asm` only.
- Diffs: `shots/gba-kinds.diff`, `gba-scripts.diff`, `gbc-kinds.diff`, `gbc-kinds-coord.diff`, `gbc-scripts.diff`.

### Generated text checked (excerpts)

GBA: `NewBarkTown_EventScript_PokemapObject3::` / `trainerbattle_single TRAINER_NONE, ..Object3Intro, ..Object3Defeated` / `msgbox ..PostBattle,
MSGBOX_AUTOCLOSE` / `end`; sign `msgbox <Text>, MSGBOX_SIGN`; coord `lockall`..`releaseall`; map.json
`{"type":"trigger",...,"var":"VAR_TEMP_0","var_value":"0","script":"NewBarkTown_EventScript_PokemapCoord1"}`; hidden_item object has item+flag, no script.
GBC: `VioletCityPokemapObject3: trainer FALKNER, FALKNER1, EVENT_VIOLETCITY_POKEMAP_OBJECT3, ...SeenText, ...BeatenText, 0, ...After`;
`VioletCityPokemapBg3Wrapper: conditional_event EVENT_..._BG3, VioletCityPokemapBg3`; `hiddenitem NO_ITEM, EVENT_..._BG2`;
Route29 `coord_event 27, 2, SCENE_ROUTE29_NOOP, Route29PokemapCoord1` + `opentext`/`writetext`/`waitbutton`/`closetext`/`end`.
Copy renames: GBA `NewBarkTown_Text_Door` -> `NewBarkTown_Text_PokemapObject1` / `..PokemapBg1`; GBC `VioletGymSignText` -> `VioletCityPokemapObject1Text1` / `VioletCityPokemapBg1Text1`.

## Findings (product; nothing was changed)

- **W1 (Important, regression-suspect): the page stops handling input while a New flag/var is staged.** After any add with a New
  flag (GBC every time; GBA after the first item ball), the next real pointer click (bar button, Save, canvas) hangs
  ("performing click action"), the renderer pegs a core and grows to 3-5 GB, and the page logs `Error: Should not already be working`
  and `DataCloneError ... performance.measure ... out of memory`. A reload does not cure it while the flag stays staged; a DOM
  `click()` on Save works and saving (flag committed) clears it. NPC adds (existing flag `-1`/`0`) never trigger it; it did not happen
  at 11:00 (GBC) and 11:24 (GBA) with the old code, and began after `645131c` (11:47) changed `shared/useEventOptions.ts`, which now builds
  a fresh `project` object on every load when `map.stagedFlags`/`stagedVars` is non-empty (a likely render-loop source; not bisected).
  Repro: serve a clean GBC clone, add an NPC then an Object/Item ball (default fields) at VioletCity, click any button.
- **W2 (Important, seen once): GBA Warp dialog request loop.** At 13:17 the Warp dialog kept issuing
  `GET /api/event-options/NewBarkTown?dest=NewBarkTown` (102 requests in 30 s) and Add never enabled. The next three runs did not reproduce it;
  same area as W1 (`useEventOptions` / the dialog's destination effect). The JSON and screenshot of that run were overwritten; the driver
  now records the warp failure (check "Warp dialog becomes ready", `destRequests`, `shots/<family>-warp-dialog-failure.png`) if it recurs.
- **W3 (Minor): GBA inspector keeps a removed event after Undo and after Discard.** The map is clean (dirty gone, Save/Undo greyed) but
  the rail still shows "Bg event #5 sign" after Undo and "Object event #10" (X 7, Y 7, elev 3) after Discard; Delete/Duplicate stay live
  on an event that no longer exists. GBC clears the selection correctly. Evidence: `shots/gba-undo-redo-failure.png`, `shots/gba-discard-failure.png`.
- Observations (not defects): GBC item ball defaults to `SPRITE_YOUNGSTER` (not `SPRITE_POKE_BALL`) and both families default the item to the first
  option (`ITEM_NONE` / `NO_ITEM`), so a defaults-only add is not a working item ball until the user edits those. GBA trainer defaults to
  `TRAINER_NONE` (first option). The first GBC/GBA option loads on a cold hub take 3-17 s each.

## Harness notes

- A hub keeps stale state when a clone is reverted with `git checkout` behind its back: after the first runs the GBC hub refused
  `EVENT_VIOLETCITY_POKEMAP_OBJECT2` as taken and the GBA hub reported "no free FLAG_UNUSED_* slot" after a `--no-slot` run; restarting the
  hub fixed both. Each scenario therefore ran on a freshly started hub (GBC) or a hub whose clone had not been reverted (GBA).
- Killing a driver mid-run orphans its headless renderer (100% CPU); only my own orphans were stopped.
- Option loads are capped at 45 s in the driver; per-scenario runs are 10-60 s on a warm hub, several minutes on a cold GBA hub.
