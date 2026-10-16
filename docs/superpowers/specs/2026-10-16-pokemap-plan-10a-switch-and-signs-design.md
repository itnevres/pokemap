# Plan 10a design: save-or-discard on map switch (D1) and the Sign tool (D2 amended)

Written 2026-10-16 from master `18b7d7c`, after a brainstorm with the user. Roadmap: Plan 10 in
`plans/2026-10-14-pokemap-roadmap-unified-ui.md`. Branch `plan-10a-switch-and-signs`.

## Plan 10 split (user, 2026-10-16)

- **10a (this spec):** D1 save-or-discard on map switch, and a new **Sign tool** in both families.
- **10a2 (next session):** rename today's GBA "Add Wild Sign" to **Pokémon Indicator** and port it to GBC.
- **10b (later):** D3 + F2, D6, D8, unchanged from the roadmap.

### D2 amended (user, 2026-10-16)

Today's GBA "sign composer" is not a sign. It adds an **object event**: a catchable species' sprite that plays its cry
and says one line (Celadon Poliwrath style; `core/src/signs/*`, server `POST /api/edit/:map/sign/add`). It becomes
the **Pokémon Indicator** in both families (10a2). D2's "GBC sign composer" is replaced by a real **Sign tool** in
both families: a readable sign (bg event) with customisable text.

## Goal

1. Switching away from a map with unsaved changes asks **Save / Discard / Cancel** in both families, and a discard
   never races queued paint strokes.
2. Both families get a **Sign** toolbar tool. Clicking a tile opens a small editor for that spot. Text is free text,
   or **linked** to the map's display name or its catchable species, and linked text stays current through the tool.

## Non-goals

- No change to the Save dialog's layout, flow or diff, apart from the one "Linked signs" notice in S7 (user, 2026-10-16).
- No decomp engine changes. No new C, and no new asm engine code. Linked text is maintained by the tool at save time.
- Pokémon Indicator (10a2). Moving or deleting signs (the existing inspector does that). Cleaning up orphaned scripts
  when a sign is deleted (unchanged behaviour; noted as a later issue).
- Hub project switch keeps its own `SwitchConfirmDialog`.

## Anti-goals (a failure even if it works)

- Any write to subject source that the Save dialog's diff did not show first.
- A discard that lets a queued stroke link land after it (resurrects edits), or a save that switches maps when the
  commit failed.
- Overwriting text a person edited by hand in their decomp.
- Relying on git anywhere. Some users have no git; every diff, baseline and hand-edit check is in-tool.

## Part 1: save-or-discard on map switch (D1)

### Rulings

- **R1.** One shared modal, `shared/SwitchPromptDialog.tsx`, replaces `window.confirm(GUARD_TEXT)` in both adapters.
  Text: "You have unsaved changes on <map>." Buttons: **Save**, **Discard**, **Cancel** (Cancel autofocused; Escape =
  Cancel; `aria-modal="true"`, so shortcuts are suppressed while it is open).
- **R2.** It appears when the session is dirty and the target differs from the current map: tree click, world click,
  world "open map", and entering in-context editing on another map (all route through `runtime.leave`). A same-map
  click never prompts (today's `sameMap`).
- **R3. Save** opens the existing Save dialog unchanged. On `onCommitted` the switch runs. If the dialog is cancelled,
  or the commit fails or is refused, the user stays on the current map with edits intact.
- **R4. Discard** = `strokeSettled().then(() => session.discard()).then(go)` in **both** families (closes the Plan 8
  deferral). A discard failure shows the existing `switchError` banner and does not switch. GBA changes behaviour:
  today it switches without discarding and the server session stays open; after 10a it discards server-side like GBC.
- **R5. Cancel** does nothing. No stroke wait, no request.
- **R6.** While a Save or Discard is in flight the prompt's buttons are disabled; a second switch request while one is
  pending is ignored (no queued double switch).
- **R7.** The shared shell owns the prompt; each family's `leave` only supplies `session` and `strokeSettled`. Family
  differences, if any are found, go behind the adapter, not into the dialog.

### Acceptance criteria (D1)

- A1. Dirty map, tree click on another map: prompt shows in both families. Cancel: same map, edits intact, no request.
- A2. Discard with a stroke still queued (test holds a link's promise open): the discard request is not sent until the
  link settles; after discard the switch happens; the old map's server session is closed (GBA and GBC).
- A3. Save: Save dialog opens; commit → switch to the target; cancel dialog → no switch, still dirty.
- A4. Discard request fails → `switchError` banner, no switch, still dirty.
- A5. Clean map: no prompt. Same map: no prompt.
- A6. Live, both families: paint, switch, Discard → hash of subject files (porcelain + touched `.asm`/`.json`/`.bin`)
  equals the pre-edit hash. Paint, switch, Save → the files change exactly as the Save dialog's diff showed.
- A7. Mutation: removing the `strokeSettled` wait makes A2 fail; removing the GBA server discard makes A2 fail for GBA.

## Part 2: the Sign tool (both families)

### Rulings

- **S1. Tool.** A new toolbar tool **Sign** (icon + label, shortcut **G**, tooltip "Sign (G)"), in both families,
  behind a new capability `signTool: true` for both. It does not paint. Clicking a tile:
  - empty tile (no bg event there): opens the **sign editor** for a new sign at that tile;
  - a tile holding a sign (any bg sign event): opens the editor on that sign, editable or read-only per S6;
  - a tile holding another bg event: the editor says "This tile already has a <kind> event" and offers nothing else.
- **S2. Editor.** A small popover anchored at the clicked tile (not a full modal; `role="dialog"`, Escape closes,
  `aria-modal="true"` so tool shortcuts are suppressed while it is open). Fields:
  - **Text mode** (radio): Free text, Map name, Catchable species.
  - **Text**: a textarea for Free text; a read-only preview for linked modes.
  - A live preview of the text wrapped as the game shows it, page by page.
  - Buttons: **Place** / **Update**, and **Cancel**.
  Placing or updating stages the edit in the session (dirty, undoable like every event op); nothing touches disk until
  the Save dialog commits.
- **S3. Wrap and validation.** Text is wrapped and checked before it is staged; a refusal lists the bad character or
  over-long word and the editor stays open.
  - GBC: 18 characters per line, two lines per box. Lines go out as `text`, `line`, then `cont` for later lines in the
    same paragraph; a blank line in the input starts a `para`; ends with `done`. Allowed characters are those in the
    subject's `constants/charmap.asm` (read from the project, not hard-coded). `"` and `@` are refused.
  - GBA: line breaks `\n`, paragraph `\p`, terminator `$` added by the tool; `"` and `$` refused in input. Wrap width
    is a per-family constant (builder's call on the value; a `ponytail:` comment names it as a character-count
    approximation of the proportional font).
- **S4. Linked text.**
  - **Map name.** GBA: `region_map_section` → display string in the subject's region map data
    (`src/data/region_map/region_map_entries.h`, `sMapName_*`). GBC: map header landmark → `data/maps/landmarks.asm`
    name string; the charmap's multi-character tokens (e.g. `<TOWN>`) are kept as written.
  - **Catchable species.** All species catchable on the map (the same sources the Indicator's ranking uses:
    `signs/suggest.ts` for GBA, `gbc/load/encounters.ts` `wildForMap` for GBC), ordered by best encounter chance,
    shown as display names (each family's species-name table), comma-separated and wrapped. Generated text starts with
    the map name line. Empty list: "No wild POKéMON here." (charmap-legal per family).
- **S5. Live linking.** Every time the tool builds a save plan for a map (the Save dialog's plan, which is also what
  commit writes), it regenerates every linked sign on that map from current data. Changed text is part of the plan
  and shows in the diff like any other edit. No engine command, no decomp change.
  - Known limit (accepted): a sign only refreshes when its own map is saved.
- **S6. Marker and editable signs (user, 2026-10-16: the decomp's original signs are editable too).**
  - Tool-made signs carry a one-line marker comment directly above the text label: GBC `; pokemap:sign <mode> <hash>`,
    GBA `@ pokemap:sign <mode> <hash>`; `<mode>` is `free`, `name` or `species`, `<hash>` a short hash of the body the
    tool last wrote.
  - **Original signs are editable** when their script has the simple shape: GBC `<Label>:` + `jumptext <X>`; GBA
    `<Label>::` + `msgbox <X>, MSGBOX_SIGN` + `end`; and `<X>` is one text block in the same file that no other script
    references. The first Update **adopts** the sign: the body is rewritten and the marker is added (the diff shows
    both). Before adoption the hand-edit baseline is the body as read when the session opened (in-tool, no git).
  - Any other shape (`opentext`/`writetext`, `jumpstd`, `text_far`, text in another file, shared text, a missing
    label) opens the editor read-only with the reason ("This sign's script is too complex to edit here: <reason>").
  - **Round trip.** Loading a body into the editor maps GBC `line`/`cont` and GBA `\n`/`\l` to a newline, and GBC
    `para` / GBA `\p` to a blank line. Saving maps them back the same way, and only over-long lines are wrapped. So an
    Update with no text change writes identical bytes, apart from the added marker (B6). Which of `line`/`cont` (GBC)
    or `\n`/`\l` (GBA) is used is preserved per position where the line count is unchanged; new lines follow S3.
- **S7. Hand-edit safety (user, 2026-10-16).** Before rewriting a marked sign (S5 refresh or an editor Update), the
  tool hashes the current text body. If it differs from the marker's hash, that sign is **not rewritten** and the save
  is **not blocked**:
  - The Save dialog shows a **Linked signs** notice listing each such sign ("<label> was edited outside PokeMap and was
    not refreshed") with two buttons: **Refresh** (rewrite from current data, re-hash) and **Unlink** (keep the body,
    marker becomes `free`, re-hash). Each click re-plans, so the diff shows the result before commit. With no click the
    commit leaves the sign untouched and the notice is the warning.
  - The editor, opened on such a sign, offers the same two choices.
  - Nothing is overwritten silently.
  - **Body** (what is hashed and replaced): the lines after the text label up to and including the terminator line
    (GBC first `done`; GBA the `.string` line ending in `$"`). The script label and its `jumptext`/`msgbox` lines are
    neither hashed nor rewritten. A body whose terminator cannot be found counts as hand-edited.
  - Unchanged data → the regenerated body equals the current one → no diff (refresh is a no-op).
- **S8. Source shape, GBC.** In the map's `.asm`, the tool adds `bg_event x, y, BGEVENT_READ, <Map>PokemapSign<N>`
  under `def_bg_events` (existing `addGbcEvent`), and a block inserted directly above `<Map>_MapEvents:`:
  ```
  <Map>PokemapSign<N>:
  	jumptext <Map>PokemapSign<N>Text

  ; pokemap:sign <mode> <hash>
  <Map>PokemapSign<N>Text:
  	text "..."
  	line "..."
  	done
  ```
  `<N>` is the lowest unused number. The file's own line endings and indentation (tab) are kept byte-for-byte. This
  needs a new multi-line insert/replace primitive next to `asmSplice.ts`'s `insertLineAfter` (which refuses line breaks
  by design and stays as it is).
- **S9. Source shape, GBA.** In `map.json` `bg_events`: `{ type: "sign", x, y, elevation, player_facing_dir,
  script: "<Map>_EventScript_PokemapSign<N>" }` (existing `addEvent` kind `bg`). In `scripts.inc`, appended:
  ```
  <Map>_EventScript_PokemapSign<N>::
  	msgbox <Map>_Text_PokemapSign<N>, MSGBOX_SIGN
  	end

  @ pokemap:sign <mode> <hash>
  <Map>_Text_PokemapSign<N>:
  	.string "...$"
  ```
  A new sign uses the existing `scriptAppends`. Updating or refreshing an existing sign needs a replace of that one
  text block in `scripts.inc`, staged in the session and shown in the diff (new; `scriptAppends` is append-only).
- **S9a. Builder-check answers (my calls, 2026-10-16).**
  - GBA bg event: `player_facing_dir: "BG_EVENT_PLAYER_FACING_ANY"` (the real Route101 sign); drop the S2 facing field.
    GBC always `BGEVENT_READ`. Signs sit on solid tiles in both games, so no collision check; an object event on the
    tile is shown as a note in the editor, not refused.
  - S1: non-sign bg events (GBA `type` other than `sign`, GBC `BGEVENT_*` other than `READ`/`UP`/`DOWN`/`LEFT`/
    `RIGHT`) show their kind and nothing else.
  - `<N>`: lowest number unused in that map's own file (`.asm` / `scripts.inc` + `map.json`). Undo of a new sign frees
    it; an orphan left by an inspector delete keeps its number taken.
  - Sessions are server-side. GBC: the whole `.asm` is `eventsText`, so script/text inserts are text edits in the same
    session (undo and discard cover them if snapshots cover `eventsText`). GBA: snapshots already carry
    `scriptAppends`; the new `scripts.inc` replace must ride the same snapshot. B7 tests both.
  - `runtime.leave` is per family (`gba/adapter.tsx`, `gbc/adapter.tsx`), called by FamilyApp for every switch path and
    by `useContextEditing.enter`. GBA's server discard already exists (`POST /api/edit/:map/discard`,
    `server/src/index.ts`).
  - Species list: deduped by species, ordered by each species' best chance across all methods and times
    (`suggest.ts` already keeps the highest chance per species), no evolutions; GBC includes every source `wildForMap`
    returns except swarms.
  - Charmap: GBC parses `constants/charmap.asm`; GBA parses the subject's `charmap.txt`. Free text may use plain
    characters and any token the charmap defines (originals use them, e.g. GBA `{UP_ARROW}`). For wrapping, a token
    counts as its fixed expansion width where it has one (`<TOWN>` style), and runtime-name tokens (`<PLAYER>`,
    `<RIVAL>`, GBA `{PLAYER}`) count at their maximum name length (`ponytail:` conservative). A token the charmap does
    not define is refused.
  - GBC build check: the repo has no assembler check. The G5 write gate (`core/test/gbc/write/writeGate.test.ts`,
    byte round trips over the corpus) gains a sign case: place then undo restores exact bytes on every map. B8's GBC
    live check re-parses the written `.asm` with the app's loader. GBA: B8 re-loads the map with the app's loader.
- **S10. Guards.** Label collisions, a missing `_MapEvents:` label (GBC), a missing `scripts.inc` (GBA), an unreadable
  charmap or name table → a located refusal (file, line where known, fix), never a partial write. See S9a for the build check.

### Acceptance criteria (Sign tool)

- B1. Golden fixtures: for one GBC map and one GBA map, placing a free-text sign produces exactly the expected `.asm` /
  `map.json` + `scripts.inc` bytes (fixture files, CRLF and LF variants for GBC).
- B2. Wrap: fixtures for 18-char GBC wrapping (`line`/`cont`/`para`), a word longer than a line (refused), a charmap
  miss (refused, names the character), `<TOWN>`-style tokens counted per the charmap.
- B3. Linked name: GBC NewBarkTown → `NEW BARK<TOWN>`; GBA Route101 → `ROUTE 101`. Linked species: Route 29 (GBC) and
  Route 101 (GBA) lists match an independently written expected list.
- B4. Refresh: change the name source in a temp copy of the subject, save the map → plan diff shows only the sign text
  change and the new marker hash.
- B5. Hand edit: alter a marked body in a temp copy, save → commit succeeds, that sign's bytes unchanged, notice shown;
  Refresh → body rewritten; Unlink → body kept, marker `free`; both visible in the diff before commit.
- B6. Original signs: GBC Route29Sign1 and GBA Route101 RouteSign open editable with their exact text; Update with no
  change writes only the marker line; Update with new text rewrites only that body. A complex-shape sign (one real
  example per family) opens read-only with its reason. An original sign nobody opened is never changed by a save.
- B7. Undo/redo of Place and Update restores the session text exactly.
- B8. Live, both families: place a linked sign, Save, files changed exactly as the diff showed; hash of unrelated
  subject files unchanged. For GBC, the written `.asm` re-parses with the app's loader (and assembles, if a build check
  exists).
- B9. Mutation: breaking the hash check (S7), the wrap width, or the marker parse makes a named test fail.

## Risk classification (CLAUDE.md)

High: D1 (save/discard ownership, async ordering); every Sign task that writes subject source or parses decomp data
(name tables, charmap, encounters, marker/hash, text-block writers, refresh-on-save). Medium: the toolbar tool and
editor popover UI over a tested server API. The plan tags each task.

## Left to the builder

Component and file names beyond those named above; the hash function (short, stable, in-tool); the GBA wrap width
value; where the refresh hooks into each family's plan builder, provided commit writes exactly what the plan showed.
