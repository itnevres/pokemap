# Plan 14.1: Add Event in both families (design)

Status: **approved by the user 2026-11-02** after builder check + Codex `gpt-6-astra` spec review. Tier: **High**
(new `.asm` / `scripts.inc` / `map.json` / constants-header text through Save; parsing of decomp constants and script
bodies; async staging and visit identity; shared shell UI). Branch `plan-14-gbc-editing-gaps` from master `7c68fc1`.

## Intent

Roadmap Plan 14 (D6, D7) asked for GBC Add Event and a GBC collision editor. In the 2026-11-02 interview the user
widened both into shared features (roadmap D19, D20): an Add Event flow that places a working event of any of the four
kinds in **both** families, and (Plan 14.2, separate spec) a Polished-Map-style block editor in both families. This spec
covers 14.1 only.

Today GBA's "Add Event" (`packages/ui/src/hooks/useMapEditing.ts` `onAddEvent`) drops a fixed object
(`OBJ_EVENT_GFX_BOY_1`, script `NULL`) at the map centre; GBC has no Add Event in the UI (Duplicate reuses core
`addGbcEvent` and `POST /event/add` but never writes a script). Neither can place a warp, coord or bg event from
scratch, and neither writes the script or text the event needs to do anything in game.

**Success:** in either family the user adds an object, warp, coord or bg event on a chosen tile, fills one popup, saves
through the normal Save dialog, and the result builds and works in game (an NPC that talks, an item ball that gives
its item, a trainer that battles, a warp that leads somewhere, a trigger that runs, a sign that reads), with undo
before save.

## Rulings (user, 2026-11-02; binding)

- **A1 Four Add buttons** (Object, Warp, Coord Event, BG Event) replace the single Add Event button, in both families,
  above the event inspector in the rail. **Icon only, one row, small, each with a tooltip** saying what it does (the
  toolbar's inline-SVG icon style, `packages/ui/src/components/toolIcons`).
- **A2 Place, then popup.** A button enters placement mode; the user clicks a tile; a popup opens for that kind at that
  tile asking for the event's information.
- **A3 Inputs.** Where options already exist in the project, a dropdown. Where something new is required, a text box.
  Where either is possible, a toggle: **Use existing** (dropdown), **Copy from** (pick an existing one; its content is
  copied into editable boxes under a new name), **New** (empty boxes).
- **A4 Both families now** (D19). One shared UI in the shell; each family's engine supplies option lists, defaults,
  validation and writers.
- **A5 Accepted playback:** placement cancels on Esc or by pressing the same button again; the toggle applies to script,
  text and flag fields; a New NPC script is "face the player and say this text"; the new event is pending and undoable
  until the normal Save; the warp popup warns when the tile cannot act as a warp; a GBC coord event uses an existing
  scene of the map (a map with none disables the Coord button with that reason); GBC writes new scripts/text into the
  map's `.asm`, GBA into the map's `scripts.inc`.
- **A6 New vars and flags.** GBA coord events may create a new `VAR_` name; flags may be new in both families. "New"
  claims a free slot: GBA renames a free `VAR_UNUSED_*` / `FLAG_UNUSED_*` define in `include/constants/vars.h` /
  `flags.h` to the user's name (subject has 9 and 134); GBC adds a `const EVENT_<NAME>` in `constants/event_flags.asm`
  inside the existing unused gap (see Flags below). No free slot → refusal naming the file. The constants file is
  written in the same all-or-nothing save.
- **A7 No return warp in 14.1.** After a warp is added, the popup (and the Save dialog's notes) say when the destination
  map has no warp leading back to this map ("<Dest> has no warp back to <Map>; add one there"). Save is not blocked.
  The two-map version is built in Plan 14C.
- **A8 Object types:** ordinary scripted NPC, item ball, and trainer **using an existing trainer** (dropdown) with new or
  copied seen / beaten / after texts. Creating a new trainer and its party is a future plan (roadmap open item).

## Design (conductor's calls unless marked as a ruling)

### Shell and UI

1. **Buttons.** Shared `shared/AddEventBar.tsx`: four `<button>`s, `aria-label` = tooltip text, `aria-pressed` while
   that kind's placement is active. Rendered in both rails where the GBA `EventInspector` empty-state Add Event button
   and the GBC inspector live today; the old GBA button goes away (its tests move to the new flow; each removed
   assertion gets a named replacement, LESSONS "Deleting a component's tests loses pins"). Disabled, with the reason as
   tooltip, when the map is not editable, an edit request is in flight, or the kind is unavailable: GBC objects at 15
   (`NUM_OBJECTS 16`, slot 0 = player); GBA objects at `OBJECT_EVENT_TEMPLATES_COUNT` (64 in the subject,
   `include/constants/global.h`; read from the project, not hard-coded); GBC coord with no scenes.
2. **Placement mode.** Owned by the shared map workspace state: `placing: EventKind | null`. The cursor and the click
   use the **event grid** (GBC events are 16 px cells, half a 32 px block; GBA events are the block grid). A primary
   click on an in-bounds cell ends placement and opens the popup with `{ kind, x, y }`. Esc, the same button, a tool
   change, a map switch, Save or Discard cancel it. The click never paints; events may share cells.
3. **Popup.** Shared `shared/AddEventDialog.tsx`: modal, "Add <Kind> at (x, y)", focus and Tab trap via
   `shared/dialogFocus.ts`; Escape handled by the dialog itself and consumed only when it is the topmost dialog and no
   request is in flight (the same rule `WarpPopup` follows). Body: fields described by the family (below), rendered
   generically: `select` (searchable when long), `text`, `number`, `multiline`, and the A3 toggle. Add is disabled until
   the form validates client-side; the server validates again and its 400 message shows inline with the form kept.
4. **In-flight rules.** While the create request is in flight: Add, Cancel, Escape and the backdrop do nothing; the
   map's Save, Discard, undo/redo and map switch wait for it (the same queue the edit session already uses for strokes).
   On success the dialog closes and the new event is selected **only if the visit is still current** (A→B→A counts as a
   new visit; LESSONS visit identity). On failure the dialog stays open with the error and the fields intact.
5. **Options.** Engine adapter gains `addEventForm(kind, ctx)` and `addEventDefaults(kind, ctx)`. Project option lists
   come from `GET /api/event-options` (both hubs), map-local ones from `GET /api/event-options/:map` (and
   `?dest=<map>` for a destination's warps and its warps back). Map-local options are computed from the **session's
   staged text** when a session is open, so an event or label staged and not yet saved is visible to the next Add. The
   client drops both caches on every save, discard, undo/redo and project reload, and the requests carry the visit so a
   late response for an old visit is ignored.

### Option sets (typed, not raw prefix filters)

Each list is built by a family function that parses the defining file and excludes function-like macros, `NUM_*` /
`*_COUNT` / `*_START` / `*_END` sentinels and grouping constants; a test pins each set against the subject (spot
entries present, sentinels absent). Unknown or empty set → the field falls back to a text box validated against the
same parser's accepted shape.

| Field | GBA source | GBC source |
|---|---|---|
| sprite / graphics | `OBJ_EVENT_GFX_*` (`include/constants/event_objects.h`) | `SPRITE_*` (`constants/sprite_constants.asm`) |
| movement | `MOVEMENT_TYPE_*` | `SPRITEMOVEDATA_*` |
| object type | n/a (trainer via `trainer_type`) | `OBJECTTYPE_SCRIPT`, `_ITEMBALL`, `_TRAINER` (A8) |
| palette | n/a | `PAL_NPC_*` plus `0` |
| flag | `FLAG_*` defines | `EVENT_*` consts |
| var | `VAR_*` defines | n/a |
| item | `ITEM_*` | item consts (`constants/item_constants.asm`) |
| trainer | `TRAINER_*` (`include/constants/opponents.h`) | trainer class + id (`constants/trainer_constants.asm`) |
| bg type / facing | `sign` (+ `BG_EVENT_PLAYER_FACING_*`), `hidden_item`, `secret_base` (+ real `SECRET_BASE_*` ids only) | `BGEVENT_READ/UP/DOWN/LEFT/RIGHT`, `BGEVENT_ITEM`, `BGEVENT_IFSET/IFNOTSET`; `BGEVENT_COPY` excluded |
| scene | n/a | this map's `scene_script` constants |
| maps / warps | project map list; a map's warps as `#n (x, y)` (GBA 0-based `dest_warp_id`, GBC 1-based) | same |

### Per kind

- **Object, NPC:** sprite, movement, range x/y, (GBA elevation default = the tile's elevation; GBC hours `-1,-1`,
  palette `0`), flag (toggle Existing / New; default none: GBA `0`, GBC `-1`), GBC object const name (text, default
  `<MAP>_<SPRITE>` uniquified, inserted by `addGbcEvent`), **script** (toggle, below).
- **Object, item ball:** item, flag (required; Existing / New). Script generated: GBC object type `OBJECTTYPE_ITEMBALL`
  with an `itemball ITEM` data label; GBA `OBJ_EVENT_GFX_ITEM_BALL` with `finditem ITEM` / `end`. No script toggle.
- **Object, trainer (existing trainer):** trainer (dropdown), sight range, beaten flag (Existing / New), seen / beaten /
  after-battle texts (each New or Copy from). Generated: GBC `OBJECTTYPE_TRAINER` with a `trainer` header label plus
  an after-battle script; GBA `trainer_type TRAINER_TYPE_NORMAL`, `trainerbattle_single TRAINER, SeenText,
  BeatenText` + after-battle `msgbox`. Exact macro forms are taken from the subject's own trainers (cited in code).
- **Warp:** destination map, destination warp; GBA elevation. Tile warning (below) and the A7 return-warp note.
- **Coord:** GBC scene (existing only; scene `-1` "any scene" is also offered, `home/map.asm` coord check); GBA var
  (Existing / New, A6) and value (number); elevation; **script** (toggle).
- **BG:** GBC `READ`/facing → **script** toggle; `BGEVENT_ITEM` → item + flag (generated `hiddenitem ITEM, FLAG` data
  label); `IFSET`/`IFNOTSET` → flag + **script** toggle (generated `conditional_event FLAG, <Script>` wrapper label).
  GBA `sign` → facing + **script** toggle; `hidden_item` → item + flag (no quantity: the subject's mapjson emits
  item/flag only and the pickup awards one); `secret_base` → secret base id. Every GBA bg event gets an elevation
  (default = the tile's elevation).

### Scripts (the toggle on a script field)

- **Use existing:** dropdown of **event entry points only**: labels that some event in the project already uses as a
  script (object/bg/coord script fields, GBA `map.json` and GBC event macros), plus GBC `ObjectEvent` and GBA `0x0`
  for an NPC. No movement/text/data/MapScripts labels. GBC additionally restricts to labels in the same file as this map
  or in ROM0 (`home/`, e.g. `ObjectEvent`) (the engine calls an event script in the current map's bank,
  `engine/overworld/events.asm`). Plan review 3 narrowed this from "far-callable common scripts used from other
  banks" to this safe subset: no label from another file is offered, even in the same ROM section.
- **Copy from:** dropdown of entry points **defined in this map's own script file**. Supported grammar: the body runs
  from the label to its terminator (`end`, `return`, `jumptext*`, `itemball`/`hiddenitem` data, GBA `end`/`return`/
  `releaseall`+`end`) with no fall-through into the next top-level label; local labels (GBC `.Foo`, GBA none) and the
  text labels it references in the same file are copied with it. Self-references and local/text references are renamed
  consistently. Refused, with the reason: fall-through, a reference to a movement/script/object constant defined
  elsewhere in a way the copy cannot keep valid (copied as-is only when the target is project-global and unchanged),
  a body the parser cannot bound. The user edits the copied body and texts; on Add the edited body is re-parsed with
  the same rules before staging.
- **New:** new label + text box. Generated bodies: GBC NPC `jumptextfaceplayer <Label>Text`; GBC bg `jumptext
  <Label>Text`; GBC coord `opentext` / `writetext` / `waitbutton` / `closetext` / `end`; GBA NPC `msgbox <Text>,
  MSGBOX_NPC` / `end`; GBA sign `msgbox <Text>, MSGBOX_SIGN` / `end`; GBA coord `lockall` / `msgbox <Text>,
  MSGBOX_DEFAULT` / `releaseall` / `end`. Text wrapped and encoded with the Sign tool's helpers
  (`core/src/signs/wrap.ts`, `charmap.ts`).
- **Names.** Defaults follow the Sign tool's scheme: GBC `<Map>Pokemap<Kind><n>` (+`Text`), GBA
  `<Map>_EventScript_Pokemap<Kind><n>` / `<Map>_Text_Pokemap<Kind><n>`, lowest unused `n`. Every emitted name (script,
  text, wrapper/data label, object const, new var/flag) must be a valid identifier and unused in **both** the label and
  constant namespaces of the symbol index, in the effective staged text of **every open edit session** of the project,
  and is re-checked at plan and commit time (see Save). Known limit, stated in the code: macro-generated definitions
  the index does not scan are not seen; the build check (Acceptance 6) is the backstop.
- **Where text goes:** GBC before `<Map>_MapEvents:` (as `insertGbcSign` does); GBA appended to the map's `scripts.inc`
  through `EditSession.scriptAppends` (`core/src/write/save.ts`). A GBA map with no `scripts.inc` refuses a generated or
  copied script (Sign tool spec S10a).

### Flags and vars (A6)

- GBA New: pick the first free `FLAG_UNUSED_*` / `VAR_UNUSED_*` define (free = not referenced anywhere else in the
  project), stage a `ScriptReplace`-style edit of that one `#define` line renaming it; refusal if none.
- GBC New flag: insert `const EVENT_<NAME>` after the last `const EVENT_*` line that precedes the file's final
  `const_next` boundary, only while `const_value` stays below that boundary (the "Unused: next 48 events" gap in
  PerfPlus); refusal otherwise. Item balls and hidden items need a flag; their default is New with a generated name.
- Flags have no "Copy from" (nothing to copy); their toggle is Existing / New.

### Core and server

- **Core (per family):** a pure `buildAddEvent(kind, form, ctx)` returning the event value/args, object const, script
  and text blocks, and constants-file edits, with refusals that name map and file; `copyScriptBody(text, label)` with
  the grammar above; reuses `addEvent` (`core/src/edit/events.ts`) and `addGbcEvent` (`core/src/gbc/edit/events.ts`).
- **Server:** `POST .../event/create` per family, taking `{ kind, x, y, fields }`. It builds and validates a **complete
  candidate session** (event + scripts + constants edits) before publishing it as **one** undoable command, following
  the Indicator route's build-then-publish pattern (`packages/server/src/index.ts` indicator add), so a late failure
  leaves the session and its undo history unchanged. Returns the session like `/event/add`. Read-only option routes as
  above. The constants-file edit joins the save's file set.
- **Save safety:** `planSave` / `prepareSave` / `commitSave` gain a fresh check of every appended or inserted name
  against the current disk text and the other sessions (appends are not re-validated today: `core/src/write/save.ts`
  trusts `scriptAppends`), refusing with `LABEL_TAKEN` if a definition appeared since staging; the fingerprint-bound
  commit is unchanged. GBC object-const desync and file-changed-on-disk guards still apply. Writes stay all-or-nothing
  (`writeFilesAtomically`); the symbol index is invalidated after commit (already).

### Warp tile check (A5)

A warning, never a refusal. GBC: the collision of the quarter the event cell sits on (event cell parity, as the engine
selects it in `home/map.asm`) is checked against the warp-capable collision set the engine's warp check uses, cited in
the code. GBA: the block's metatile behavior against the warp behaviors the subject's `src/field_control_avatar.c`
accepts (doors, stairs including its customized stair warps, ladders, arrow warps), cited in the code.

## Out of scope

- Editing an existing event's fields beyond x/y.
- New GBC scenes (RAM + constants in other files); new trainers and parties (A8, future plan); return warps (A7, 14C).
- Copying a script from another map's file; `BGEVENT_COPY`.

## Acceptance

1. Both families: four icon buttons with tooltips and disabled reasons; placement on the event grid; Esc / re-click /
   tool change / switch cancel.
2. Each kind and object type, each family, on scratch subject copies: add with defaults, Save; the diff is exactly the
   event line (+ const, + script/text, + constants line) in the expected place; it shows on canvas and inspector.
3. Script toggle: Existing lists entry points only; Copy renames self/local/text references and refuses fall-through;
   New writes the generated body. New var/flag claims a free slot and refuses when none is free.
4. One undo removes the event and everything it staged; a failed create leaves session and undo unchanged; Discard
   leaves files untouched; a create in flight blocks Save/switch until it resolves; a late response after A→B→A does
   not select or error on the new visit.
5. Refusals name map and file: duplicate name (incl. one staged in another session, and one appearing on disk after
   staging, at commit), invalid identifier, object cap, GBC coord with no scenes, GBA map with no `scripts.inc`, no
   free flag/var slot.
6. Build check: one of each kind/type added to scratch copies of PerfPlus and the GBA subject, then `make` on each
   where the toolchain is available; otherwise record that it was not run and why.
7. Option-set tests against both subjects; gate green (pass/fail/files), typecheck, UI build; live check in both
   families (headless Playwright fine), result recorded.

## Review record

- Builder check + spec review: Codex `gpt-6-astra` (read-only), 2026-11-02. Builder questions 1-3 answered by the user
  (A8, A6, A7). All Important findings folded in above (entry-point filtering, GBC bank rule, type-dependent payloads,
  GBC bg wrappers, copy grammar, append re-validation, cross-session names, in-flight rules, build-then-publish,
  hidden-item quantity, typed option sets, event-grid placement, warp predicates from engine code, cache invalidation).
  Minors: GBA cap is `OBJECT_EVENT_TEMPLATES_COUNT`; Escape stacking is the dialog's own; names are Sign-derived.
