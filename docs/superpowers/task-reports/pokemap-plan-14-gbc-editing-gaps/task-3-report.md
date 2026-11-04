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

- Hidden items with a New flag: pokeemerald's `bg_hidden_item_event` stores `flag - FLAG_HIDDEN_ITEMS_START` in a `.2byte` (u16 `hiddenItemId`; corrected in fix round 1, spec M4),
  so a renamed `FLAG_UNUSED_*` outside the hidden-item range may not work in game. Not refused here; worth a ruling
  (restrict hidden_item flags to Existing, or to a hidden-range slot) before Task 4/acceptance build checks.
- New FLAG_/VAR_ names are only checked against `flags.h`/`vars.h` text plus `ctx.check`; other headers rely on the
  injected NameCheck (as specified).

## Fix round 1

Base `bbeb725`. Rulings R1 (hidden-item flag range) and R2 (slot freedom) applied. Every new test was run red before
its fix (or, for test-gap findings where the code was already correct, turned red by the named mutation below).

| Finding | Change | Regression test |
|---|---|---|
| Spec I1 / R1 | `gbaBuild.ts`: `hiddenItemFlag()` evaluates `FLAG_HIDDEN_ITEMS_START <= value < FLAGS_COUNT` from the staged flags.h (+ its `constants/` includes). New hidden flag takes the first in-range free slot, none -> `NO_FLAG_SLOT` (names map + `include/constants/flags.h`); existing out of range -> `BAD_OPTION`. Temp project now also copies `include/constants/opponents.h` (FLAGS_COUNT needs MAX_TRAINERS_COUNT). | gbaBuild: "hidden_item flag range: a new flag takes the first in-range slot, NO_FLAG_SLOT when none"; "hidden_item flag range: an existing flag outside the range is BAD_OPTION" |
| Spec I2 / R2 | `gbaOptions.ts` (Task 1): new exported `gbaDefineValues(root, header)` (integer `+ - * %` evaluator over the header and its included constants headers; octal, `/`, shifts, unknown names, cycles -> undefined). `unusedSlots`: free only if the name occurs exactly once in src/include/data (its own #define; header included), its value is evaluable and shared by no other define in the header, and it lies outside TEMP_FLAGS/DAILY_FLAGS/SPECIAL_FLAGS (flags) and TEMP_VARS/SPECIAL_VARS (vars) `_START.._END`. Subject: 77 free flags, first is now `FLAG_UNUSED_0x299`; vars unchanged (`VAR_UNUSED_0x40B8`, `0x40BB`), so the existing VAR oracle needed no change. | gbaOptions: "R2: free slots on a hand-written project exclude header references, aliases, ranges and unevaluable values"; "gbaDefineValues evaluates + - * % arithmetic through included headers and refuses the rest"; "R2: subject FLAG slots skip the 0x296 alias, the DAILY_FLAGS_* sentinels' slots and the daily range" (pins freeFlags[0] != 0x296, 0x91F/0x95F excluded, no `(DAILY_FLAGS_START + n)` flag, hand-derived DAILY range 0xB40..0xB7F) |
| Spec M1 | none (code correct) | gbaBuild: "coord new script body is lockall / msgbox MSGBOX_DEFAULT / releaseall / end" (mutation MSGBOX_DEFAULT->MSGBOX_NPC: red) |
| Spec M2 | `existing` script `0x0` refused unless kind is object (NPC). GBC sibling not touched (Task 2 file): same gap remains there, conductor to rule. | gbaBuild: "existing script 0x0 is allowed only for an NPC" |
| Spec M3 | `gbaCopy.ts`: `GBA_STRING` honours `\"` escapes (comment strip, DIALOGUE, reference scan, builder rename); commands containing `;` outside strings refused (`COPY_NOT_SCRIPT`). | gbaCopy: "an edited body with a ; statement separator is refused"; "string literals honour \\\" escapes" |
| Spec M4 | Report line corrected (`.2byte`/u16, not a byte). | n/a (doc) |
| Quality I1 | `gbaCopy.ts`: any `#` directive other than if/ifdef/ifndef/elif/else/endif refused (`COPY_NOT_SCRIPT`). | gbaCopy: "an edited body with a #define, #undef or #include directive is refused"; "preprocessor conditionals stay copyable" |
| Quality I2 | none (guards correct, tests added) | gbaCopy: "edited texts that are not dialogue or not referenced are refused, never dropped" (mutation drop count check: red); gbaBuild: "a new flag named after an existing flags.h define is LABEL_TAKEN even when check misses it" (mutation drop header clause: red) |
| Quality M1 | `OBJ_EVENT_GFX_BOY_1` fallback removed. | gbaBuild: "an npc without a sprite is refused without inventing a default" |
| Quality M2 | Item-ball citation -> `data/scripts/item_ball_scripts.inc:1-3` (code + test comment). | n/a (comment) |
| Quality M3 | Edited copied texts tokenized with `ctx.charmap`; each displayed line (split at \n \l \p $) may be no wider than max(SIGN_WIDTH, widest line of the original texts) -> `BAD_OPTION` (ponytail note: character count, not pixels). GBC sibling unchanged. | gbaCopy: "edited copied text is checked against the charmap and the source text's width" |
| Quality M4 | Destination map.json that is not an object / has no string id -> `BAD_OPTION` naming the destination file with an accurate message; self-warp counts the in-memory map's warps. Other open sessions' staged warps left for Task 4 (ponytail note). | gbaBuild: "warp destination: self-warp counts this map's in-memory warps; bad destination files are named" |
| Quality M5 | `gbaCode` and `GBA_LABEL` no longer exported; `GBA_STRING` exported (used by gbaBuild). | n/a (no behaviour) |
| Quality M6 | Warp test index = `map.warpEvents.length`; new failure-after-staging test. | gbaBuild: "a create that fails after staging a flag leaves the input entries untouched" (mutation no shallow copy: red) |
| Quality M7 | Left for Task 4 per conductor. | - |

Mutations (each restored after): drop header clause, drop text count check, coord body, no shallow copy, drop existing
hidden range, drop new hidden range, allow 0x0, drop width/charmap check, self-warp from disk, drop directive refusal,
drop `;` refusal, old DIALOGUE regex, drop check (claim), drop fall-through, hidden quantity: each turned its named test
red (claim also turns "LABEL_TAKEN" red; fall-through "a body reached by fall-through -> COPY_FALLTHROUGH"; quantity "bg").

Commands and results:
- `npx vitest run packages/core/test/addEvent/gbaBuild.test.ts packages/core/test/addEvent/gbaCopy.test.ts packages/core/test/addEvent/gbaOptions.test.ts` -> Test Files 3 passed (3), Tests 44 passed (44)
- `npx tsc --noEmit -p tsconfig.base.json` -> no output, exit 0
- `npx vitest run packages/core` -> Test Files 1 failed | 91 passed (92), Tests 1 failed | 1460 passed (1461); the one failure is the known environmental `engineProfile > parses the subject repo's real porymap.project.cfg`.

Files: `packages/core/src/addEvent/gbaBuild.ts`, `gbaCopy.ts`, `gbaOptions.ts` (CRLF kept),
`packages/core/test/addEvent/gbaBuild.test.ts`, `gbaCopy.test.ts`, `gbaOptions.test.ts` (CRLF kept),
`packages/core/test/helpers/gbaTempProject.ts`.
