# Plan 10a2 design: Pokémon Indicator (rename + GBC port + species edit)

Written 2026-10-17 from master `48ac476`, after a brainstorm with the user. Roadmap: Plan 10 split and D2 amended
(2026-10-16) in `plans/2026-10-14-pokemap-roadmap-unified-ui.md`. Branch `plan-10a2-pokemon-indicator`. Builds next to
the Sign tool (Plan 10a spec `specs/2026-10-16-pokemap-plan-10a-switch-and-signs-design.md`, S1-S11).

## Intent

Today's GBA "Add Wild Sign" composer is not a sign. It adds an **object event**: a catchable species' overworld sprite
that faces the player, plays its cry and says one line (Celadon Poliwrath style). It is renamed **Pokémon Indicator**
and brought to GBC, so both families have the same feature (unified-UI goal: add once, show in both). A placed
Indicator's species (and text) can be changed later.

## Goals

1. Every user-visible "Wild Sign" / "Add Sign" string for this feature reads **Pokémon Indicator**.
2. GBC gets the same dialog and the same behaviour, writing pokecrystal source.
3. Both families: select a placed Indicator, **Edit Indicator**, change species and/or text.

## Non-goals

- No new placement flow. The dialog stays; moving a placed Indicator uses the existing event drag (user, 2026-10-17).
- No per-species GBC sprites beyond what the decomp already has; no edits to `sprite_constants.asm`,
  `sprite_mons.asm` or any engine/data table (no new C, no new asm engine code).
- No marker comments or hash tracking (the Sign tool's S6/S7 machinery). Indicator text is never auto-refreshed.
- Renaming labels of Indicators already in a subject. Deleting/moving (existing inspector and drag do that).
- Plan 10b, the Sign tool's deferred minors (10a S11).

## Anti-goals

- Any write to subject source the Save dialog's diff did not show first; any partial write.
- Overwriting a script someone edited by hand (only the tool's own shape is editable, I4).
- Relying on git.

## Rulings (user, 2026-10-17)

- **I1. Name.** Feature name **Pokémon Indicator**. Toolbar button label "Pokémon Indicator" (icon + label like the
  other rail tools; tooltip "Pokémon Indicator"), dialog title "Pokémon Indicator", submit "Place", success banner
  "Placed Pokémon Indicator: <label>", empty state "No wild encounters on this map to base an Indicator on.", refusal
  prefix "Could not place Indicator: ", the `scripts.inc` refusal fix text. Internal names follow (component, capability,
  core functions, route). The Sign tool's strings are untouched.
- **I2. Dialog unchanged in shape.** Ranked catchable species (best chance first), X/Y prefilled with the suggested spot
  next to grass, one text field. Place stages the edit in the session (dirty, undoable, nothing on disk until Save).
  After placing, the user moves it with the existing event drag (both canvases already drag object events). No extra
  in-dialog drag.
- **I3. GBC sprite.** A species with its own Crystal overworld sprite uses it; every other species uses
  `SPRITE_MONSTER` ("for now a generic sprite"). "Own sprite" = a `SPRITE_<SPECIES>` constant defined in the subject's
  `constants/sprite_constants.asm` (both the regular block, e.g. `SPRITE_SLOWPOKE`, and the `SPRITE_POKEMON` block
  backed by `data/sprites/sprite_mons.asm`, e.g. `SPRITE_GEODUDE`). Read from the project, not hard-coded.
- **I4. Edit Indicator.** Selecting a placed Indicator shows **Edit Indicator** in the event inspector (both families).
  It opens the same dialog prefilled (species, text; X/Y hidden, position is the drag's job). Changing species changes
  the sprite (GBA `OBJ_EVENT_GFX_SPECIES(...)`, GBC per I3) and the cry; changing text rewrites the text body. The
  script and text **labels stay as they are**, so nothing referencing them breaks. "Update" stages one undoable op.
  - An object event is an Indicator iff its script has exactly the tool's shape (I6/I7, either the old `WildSign` or the
    new label form), the text block is in the same file and referenced only by that script, and the sprite matches the
    cry species (GBC: matches I3's choice for that species). Anything else: no Edit button on object events that are not
    Indicators; an object event whose script *looks* generated but fails a check shows Edit Indicator disabled with the
    reason ("This Indicator's script was changed outside PokeMap: <reason>").

## Builder calls (mine, 2026-10-17; the user can override)

- **C1. Text.** The one text field accepts any length; it is wrapped and validated with the Sign tool's code (10a S3:
  per-family width, charmap from the subject, GBC `text`/`line`/`cont`/`para`/`done`, GBA `\n`/`\p`/`$`). A refusal
  names the bad character or over-long word and the dialog stays open. Today's GBA "no newline, one line" limit goes.
  Loading text for Edit uses the Sign tool's round trip (10a S6). (Planning correction, 2026-10-17: the width Plan 10a
  shipped is 18 in both families, `server/src/signRefresh.ts:82`; the Indicator uses the same shared constant.)
- **C2. New labels.** Numbered, not species-named, so a species edit never leaves a stale label and two Indicators of
  one species on a map do not collide. GBA `<Map>_EventScript_PokemonIndicator<N>` / `<Map>_Text_PokemonIndicator<N>`;
  GBC `<Map>PokemonIndicator<N>` / `<Map>PokemonIndicator<N>Text`. `<N>` = lowest unused in that map's file(s), as 10a
  S9a. Existing `_WildSign_<Species>` labels keep their names and stay editable.
- **C3. GBA source shape** (unchanged from today apart from labels and wrapped text): object event
  `graphics_id: "OBJ_EVENT_GFX_SPECIES(<SPECIES>)"`, `MOVEMENT_TYPE_FACE_DOWN`, ranges 1/1, `TRAINER_TYPE_NONE`, flag
  `"0"`; script appended to `scripts.inc` via `scriptAppends`:
  ```
  <script>::
  	lock
  	faceplayer
  	waitse
  	playmoncry SPECIES_<SPECIES>, CRY_MODE_NORMAL
  	msgbox <text>, MSGBOX_DEFAULT
  	waitmoncry
  	closemessage
  	release
  	end

  <text>:
  	.string "...$"
  ```
  Edit = `graphics_id` change in `map.json` + a `ScriptReplace` of the script and text blocks (10a's replace path; one
  replace per path per save, 10a S10a).
- **C4. GBC source shape.** `object_event x, y, <SPRITE>, SPRITEMOVEDATA_POKEMON, 0, 0, -1, -1, 0, OBJECTTYPE_SCRIPT, 0,
  <script>, -1` via `addGbcEvent` (keeps `object_const_def` in step; 15-object cap refuses). Script + text inserted
  directly above `<Map>_MapEvents:` with the multi-line primitive the Sign tool added:
  ```
  <script>:
  	faceplayer
  	opentext
  	writetext <text>
  	cry <SPECIES>
  	waitbutton
  	closetext
  	end

  <text>:
  	text "..."
  	done
  ```
  (pret's Wooster pattern, `maps/AzaleaTown.asm`.) File line endings and tabs kept byte-for-byte. Edit = `spliceArg` on
  the sprite argument + replace of the `cry` line and the text body.
- **C5. GBC placement suggestion.** Same rule as GBA (first in-bounds, non-grass orthogonal neighbour of a grass tile with
  no object there), with grass = any quadrant whose tileset collision is `COLL_TALL_GRASS`, in STEP units. No grass:
  no suggestion (X/Y start at 0, user types them).
- **C6. GBC species list.** `gbcEncounterSources` minus swarms, same as the Sign tool's species signs (10a S9a ruling:
  header fishing only with reachable water). Display names from the GBC species-name table.
- **C7. Route.** The Indicator routes move off `sign/*` (which now belongs to the Sign tool): `GET /api/indicator/:map/
  suggestions`, `POST /api/edit/:map/indicator/add`, `GET /api/edit/:map/indicator/at?index=`, `POST /api/edit/:map/
  indicator/update`, served for both families (GBC through `gbcEditRoutes.ts`). The CLI `writeCommands` follows.
- **C8. Capability.** `pokemonIndicator: true` for both families replaces GBA-only `addSign`.

## Guards

Label collision, missing `scripts.inc` (GBA), missing `_MapEvents:` (GBC), 15-object cap, out-of-step
`object_const_def`, unknown species, unreadable charmap/sprite constants/name table → a located refusal (file, line
where known, fix), never a partial write.

Known limit (accepted, not checked): Crystal loads each map's distinct overworld sprites into limited VRAM; a map
already near that limit could glitch with one more distinct sprite. `SPRITE_MONSTER` is common, which keeps the risk
small. P8's live check watches for it.

Builder check (Codex `gpt-5.6-terra`, read-only, 2026-10-17): "nothing important left".

## Acceptance criteria

- P1. Strings: no user-visible "Wild Sign" / "Add Sign" left for this feature (grep test over `packages/ui/src`); the Sign
  tool's own strings unchanged.
- P2. Golden fixtures, both families: Place produces exactly the expected bytes (GBA `map.json` + `scripts.inc`; GBC
  `.asm`, CRLF and LF variants). One GBC case with an own sprite (e.g. `GEODUDE` → `SPRITE_GEODUDE`), one generic
  (`SENTRET` → `SPRITE_MONSTER`).
- P3. Sprite table: the GBC own-sprite set equals an independently written list from PerfPlus `sprite_constants.asm`.
- P4. Placement: GBC Route 29 suggestion is a non-grass step next to `COLL_TALL_GRASS`; a map without grass gives none.
- P5. Edit: species change rewrites only the sprite/graphics argument and the cry line, plus the text body if text
  changed; labels unchanged; an edit with no change writes nothing. A hand-changed script (one real-shape mutation per
  family) shows Edit disabled with its reason. A pre-existing `_WildSign_` Indicator (GBA fixture) is editable.
- P6. Undo/redo of Place and Update restores session text exactly (GBA snapshot covers `scriptAppends` and the replace;
  GBC `eventsText`). G5 write gate gains a Place-then-undo case: exact bytes on every map.
- P7. Guards: each guard above has a refusal test naming its file.
- P8. Live, both families: Place, drag to a new tile, Edit species, Save → files changed exactly as the diff showed;
  unrelated subject files' hashes unchanged; the written map re-loads with the app's loader and the Indicator shows at
  the dragged position with the new sprite.
- P9. Mutation: breaking the shape check (I4), the own-sprite lookup (I3) or the label numbering (C2) makes a named test
  fail.

## Risk classification (CLAUDE.md)

High: every task that writes subject source or parses decomp data (GBC writer, sprite-constant parser, shape
recogniser/edit writers both families, GBC collision-based suggestion), and (plan review, 2026-10-17) the dialog and
inspector UI, whose hub responses and stale-request ordering are High triggers. Low: docs. The plan tags each task.

## Left to the builder

Component and file names beyond those named; the exact shape-matcher implementation; how the Edit route reports the
current species/text; reuse versus copy of the Sign tool's wrap/round-trip helpers (prefer reuse).
