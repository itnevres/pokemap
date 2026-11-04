# Plan 14.1 Task 3 report: GBA add-event builder and script copy

Status: DONE_WITH_CONCERNS (concerns at the end). Implementer: Claude (Opus), worktree branch `p14-1-t3`.

## Files

- Created `packages/core/src/addEvent/gbaBuild.ts`
- Created `packages/core/src/addEvent/gbaCopy.ts`
- Created `packages/core/test/addEvent/gbaBuild.test.ts`
- Created `packages/core/test/addEvent/gbaCopy.test.ts`
- Created `packages/core/test/helpers/gbaTempProject.ts` (copies `data/maps/Route101`, `data/maps/LittlerootTown/map.json`,
  `include/constants/flags.h`, `include/constants/vars.h`, `charmap.txt` from the GBA subject into a fresh temp root)

No other source, test or fixture file touched. All new files LF, ASCII, no BOM (checked byte-wise).

## Exported signatures

`gbaBuild.ts`:
- `type GbaAddCtx = { options: EventOptions; mapOptions: MapEventOptions; root: string; mapName: string; tileElevation: number;
  freeFlags: string[]; freeVars: string[]; scriptReplaces: ScriptReplace[]; check: NameCheck; charmap: Charmap }`
  (`charmap` required, per the conductor ruling; `scriptReplaces` = the session's current entries, the result replaces them)
- `defaultGbaLabels(mapName: string, kind: EventKind, check: NameCheck): { script: string; text: string }` -
  `<Map>_EventScript_Pokemap<Kind><n>` / `<Map>_Text_Pokemap<Kind><n>`, lowest n where script, text and the trainer
  companions (`<text>Intro/Defeated/PostBattle`) are all free.
- `buildGbaAddEvent(map: MapData, scriptsInc: string | null, form: AddEventForm, ctx: GbaAddCtx): { value: Record<string, unknown>;
  scriptAppends: ScriptAppend[]; scriptReplaces: ScriptReplace[]; newNames: string[]; created: { kind: EventKind; index: number } }`

`gbaCopy.ts`:
- `copyGbaScriptBody(scriptsInc: string, label: string): CopyPreview`
- `gbaCode(line: string): string` (strip `@` comments outside strings), `GBA_LABEL: RegExp` (small shared helpers)

## Behaviour summary

- Builder is pure apart from reading `flags.h`/`vars.h` (only when a New flag/var is requested) and the destination
  `map.json` (warp: id + warp count). Never mutates map, ctx or ctx.scriptReplaces (copies them).
- `claim()` checks every emitted name (script, text, trainer texts, copied text names, new FLAG_/VAR_ name): identifier
  shape (`NAME_INVALID`), then labels/`.set` defined in the current `scriptsInc`, names claimed earlier in this build,
  `ctx.check`, and for new flag/var names the current (staged or disk) text of both headers (`LABEL_TAKEN`).
- New flag/var: first `freeFlags`/`freeVars` entry still `#define`d in the staged header text gets its define name renamed
  (only that line); one whole-file `ScriptReplace` per header, accumulated (`before` stays the disk text). None left ->
  `NO_FLAG_SLOT` / `NO_VAR_SLOT` naming the header.
- Generated bodies: NPC `msgbox <Text>, MSGBOX_NPC` / `end`; sign `MSGBOX_SIGN`; coord `lockall` / `msgbox ..., MSGBOX_DEFAULT`
  / `releaseall` / `end`; itemball `finditem ITEM` / `end` (subject Route102_EventScript_ItemPotion); trainer
  `trainerbattle_single TRAINER, <Text>Intro, <Text>Defeated` / `msgbox <Text>PostBattle, MSGBOX_AUTOCLOSE` / `end`
  (subject `data/maps/Route102/scripts.inc:63-66`, Route102_EventScript_Rick). Script labels `::`, text labels `:`.
  Text via `wrapSign(text, ctx.charmap, SIGN_WIDTH)` + `renderGbaBody`. One `ScriptAppend` to `mapScriptsInc(map)`,
  in the file's line endings.
- Values: object (all 11 subject keys; elevation default = `tileElevation`; flag default `"0"`; trainer
  `TRAINER_TYPE_NORMAL` + sight from the form), warp (`dest_map` = destination map.json `id`, `dest_warp_id` 0-based
  string, bounded by the destination's warp count), coord (`type: "trigger"`, var Existing/New, `var_value`), bg sign
  (facing + script), hidden_item (item + flag only, no quantity), secret_base (real id from options). Every bg has elevation.
- `NO_SCRIPTS_INC` for new/copy scripts, itemball, trainer and copied texts when `scriptsInc === null`; `existing` works.
- Text provenance: `TextChoice.copy` needs `from` in `mapOptions.localTexts` AND to be a bounded `.string` dialogue
  label in the current scripts.inc (probe through `copyGbaScriptBody`), else `COPY_NOT_SCRIPT`.
- Copy grammar (`copyGbaScriptBody`): label defined once; body runs to the next label (GBA has no locals, so a
  label-only block falls into the next label); final command must be `end`, `return` or `goto <label>` else
  `COPY_FALLTHROUGH` (next label exists) / `COPY_UNBOUNDED` (EOF); `.` directives, `map_script*` and `step_end` ->
  `COPY_NOT_SCRIPT`; referenced same-file dialogue labels are returned in `texts`.
- Copy in the builder: source must be in `localScripts` and parse on the real text; edited body/texts with any extra
  top-level label -> `COPY_UNBOUNDED`; edited content re-parsed (texts first, script last so a lost terminator is
  unbounded); unused texts -> `COPY_UNBOUNDED`; self and text references renamed outside strings/comments
  (texts -> `textLabelOf(label)`, then `...2`, `...3`).
- Refusals: `AddEventRefusal` with message `<Map>: <file>: ...` and `path` = scripts.inc, map.json, or the header.

## Tests (each its own `it`)

`gbaBuild.test.ts` (Route101 in `copyGbaAddEventProject()`; options/free slots from `subjectSnapshot()`):
1. npc new
2. itemball
3. two new flags
4. text provenance
5. trainer existing (comment cites Route102_EventScript_Rick, `data/maps/Route102/scripts.inc:63-66`)
6. coord new var (incl. empty `freeVars` -> `NO_VAR_SLOT`)
7. bg (sign facing, hidden_item keys exactly type/x/y/elevation/item/flag, secret_base real id, bad id refused)
8. warp (incl. out-of-range dest warp refused)
9. NO_SCRIPTS_INC when scriptsInc is null; existing still works
10. LABEL_TAKEN (default advances to ...2; user-typed refused; in-file label refused; taken flag name refused on flags.h)
11. NAME_INVALID and failed create leaves context byte-identical

`gbaCopy.test.ts`:
1. copy of Route101_EventScript_Youngster renames its text label
2. a body reached by fall-through -> COPY_FALLTHROUGH (plus label-only block, plus EOF -> COPY_UNBOUNDED)
3. an edited body that loses its terminator -> COPY_UNBOUNDED on re-parse
4. an edited body with an extra top-level definition is refused
5. data, movement and text labels are not event scripts

## Commands and results

Red (before implementation):
`npx vitest run packages/core/test/addEvent/gbaBuild.test.ts packages/core/test/addEvent/gbaCopy.test.ts`
-> `Error: Failed to load url ../../src/addEvent/gbaCopy.js ... Does the file exist?` / `Test Files 2 failed (2)`.

Green:
- same command -> `Test Files 2 passed (2)` / `Tests 16 passed (16)`
- `npx vitest run packages/core` -> `Test Files 1 failed | 91 passed (92)` / `Tests 1 failed | 1443 passed (1444)`;
  the one failure is `engineProfile > parses the subject repo's real porymap.project.cfg` (known environmental, excluded by the brief).
- `npx tsc --noEmit -p tsconfig.base.json` -> no output, exit 0.

Conductor mutations (each applied, run, reverted; suite green again afterwards, 16/16):
- drop `ctx.check(name).taken` from `taken()` -> `LABEL_TAKEN` red (1 failed).
- drop the terminator/fall-through check in `copyGbaScriptBody` -> `a body reached by fall-through -> COPY_FALLTHROUGH`
  and `an edited body that loses its terminator -> COPY_UNBOUNDED on re-parse` red (2 failed).
- emit `quantity: 1` on hidden_item -> `bg` red (1 failed).

## Deviations

- Builder also needs the destination map's `map.json` for a warp (name -> `MAP_*` id and warp-count bound), so the temp
  helper copies `LittlerootTown/map.json`; `options.maps` holds map names, not ids.
- Text labels for a user-named script derive from the script label (`_EventScript_` -> `_Text_`, else `<label>_Text`)
  instead of a separate form field; the form has no text-label field.
- Copy terminators include `goto <label>` (parity with GBC `sjump`), beyond the spec's `end`/`return` list.
- `trainer_sight_or_berry_tree_id` defaults to `"3"` when the form omits sight range.

## Concerns

- Hidden items with a New flag: pokeemerald's `bg_hidden_item_event` stores `flag - FLAG_HIDDEN_ITEMS_START` in a byte,
  so a renamed `FLAG_UNUSED_*` outside the hidden-item range may not work in game. Not refused here; worth a ruling
  (restrict hidden_item flags to Existing, or to a hidden-range slot) before Task 4/acceptance build checks.
- New FLAG_/VAR_ names are only checked against `flags.h`/`vars.h` text plus `ctx.check`; other headers rely on the
  injected NameCheck (as specified).
