# Plan 14.1 Task 3: quality review (GBA add-event builder and script copy)

Reviewer: Claude Opus (quality pass only; spec compliance is reviewed separately). Read-only.
Scope: `bbeb725` vs `6c1cc94`: `packages/core/src/addEvent/gbaBuild.ts`, `gbaCopy.ts`, the two tests, and `test/helpers/gbaTempProject.ts`.

## Method

- Read all changed code and the GBC sibling (`gbcBuild.ts`, `gbcCopy.ts`), `write/save.ts` (ScriptReplace planning and guards),
  `server/src/signRefresh.ts` (other ScriptReplace producer), `signs/gbaSign.ts`, `addEvent/sources.ts`, `gbaOptions.ts`.
- Swept `copyGbaScriptBody` over every `*_EventScript_*::` label in the live GBA subject (read-only, tsx in scratchpad):
  10414 ok, 317 `COPY_FALLTHROUGH`, 76 `COPY_NOT_SCRIPT`, 0 crashes. The fall-through refusals end in `case` (109),
  `msgbox`, `setvar`, `goto_if_eq`, `waitstate` and similar, which are real fall-throughs. The `COPY_NOT_SCRIPT` refusals are marts
  (inline `.2byte` data), Braille data, and dialogue blocks with more than one `$`. All of these are conservative and correct.
- Ran the builder in memory on edited copies (scripts below in the scratchpad `t3probe/`): CRLF source, self-`goto`,
  comment containing the old text label, a text with two `$` lines, a text with `.byte`, a label inside a text body,
  injected text keys, `.set`, `#define`, `#include`, `#undef`, and non-charmap characters.
- Checked that every subject `scripts.inc` defines `<dir>_MapScripts` (0 mismatches), so the refusal path that
  `gbaCopy` derives from the text is right for the real corpus.
- Checked subject facts: Route102 Rick body (`scripts.inc:63-66`) matches the emitted trainer form; `flags.h`/`vars.h`
  have no `#if` blocks that duplicate `FLAG_UNUSED_*` defines, so the first-match `#define` rename is safe;
  `dest_warp_id` is a string in every map.json; the hidden_item keys are `type,x,y,elevation,item,flag`.

Confirmed correct (no finding):
- ScriptReplace accumulation. Entries are shallow-copied (`gbaBuild.ts:44`) and only the copy's `after` changes (`:104`), so `before` stays
  the first disk text. `slot()` re-reads the staged `after` (`:98`), so the second create takes `freeFlags[1]`. Inputs
  are not mutated, and the result list replaces the ctx list. Paths come from `projectPaths(ctx.root)`, the same form as
  `proj.paths.mapScriptsInc`, so save's per-path dedupe and guard line up.
- Every emitted name (script, text, trainer texts, copy text renames, new flag or var) goes through `claim()` and then `ctx.check`.
  `defaultGbaLabels` probes the trainer suffixes too.
- Refusals name the map and the file. Copy-grammar refusals on the synthetic body keep `data/maps/<Map>/scripts.inc`
  because the synthetic body starts with `<Map>_MapScripts::`.
- Fall-through, the label-only trailing block, unbounded bodies, and extra labels in an edited body or text are all refused, and the
  edited copy is re-parsed before staging. The rename skips strings and `@` comments. A self-`goto` is renamed to the copy.
- Temp copy cleanup: `copyGbaAddEventProject` removes the copy if the copy itself fails, and `afterAll` removes it otherwise.

## Critical

None.

## Important

### I1. Preprocessor directives in an edited copy bypass the "no extra definitions" rule
`packages/core/src/addEvent/gbaBuild.ts:129-133` (extra-definition check) and `packages/core/src/addEvent/gbaCopy.ts:263`
(the command filter refuses only lines that start with `.`, `map_script*` or `step_end`).

The subject's scripts.inc files go through `cpp` (two maps use `#ifdef BUGFIX`), so `#` lines are live code. The guard at line
130 matches only `Name:`/`Name::`, and the re-parse accepts any `#` line. I reproduced all three of these. Each built OK and
was staged verbatim:
- body `#define Route102_EventScript_Other 1` + original body. The name is never claimed or checked, and it can silently
  redefine an existing constant for the rest of the file. gcc's macro-redefinition diagnostic is a warning, so the build
  does not stop it.
- `#undef FLAG_HIDE_MAP_NAME_POPUP` removes a constant for every later line in `scripts.inc`, including all later appended blocks.
- `#include "data/maps/Route102/scripts.inc"` pulls a whole other file of definitions into the copy.

This is the same class of problem the conductor ruled out for labels ("refuses extra top-level definitions in an edited body", and every
emitted name goes through `ctx.check`). `.set`/`.equ` are already refused (`COPY_NOT_SCRIPT`). Only the `#` form leaks.
Fix (one line in the shared grammar): in `gbaCopy.ts:263` also refuse
`/^#\s*(?!(?:if|ifdef|ifndef|elif|else|endif)\b)/`, so `#define`/`#undef`/`#include` and unknown directives are refused.
Conditionals stay allowed, so the two real `#ifdef BUGFIX` scripts still copy. Add one gbaCopy test that sends an edited body with
`#define X 1` and expects a refusal.

### I2. Two silent-discard and duplicate-name guards have no test (mutation stays green)
- `gbaBuild.ts:138-140`: the edited-texts count check. If it is dropped, a text the user edited into something non-dialogue
  (reproduced: `.string "a$"` + `.byte 0`) or no longer references is silently left out of `preview.texts`. The body
  then keeps pointing at the original text label, so the user's edit is thrown away without a refusal. No test sends
  mismatched `texts` (grep: no "unused text" in either test file), so removing lines 138-140 turns nothing red.
- `gbaBuild.ts:55-56`: the header word check `headers && ... word(name).test(headerText(rel))`. Every test's
  `ctx.check` is `() => ({ taken: false })` except the `FLAG_POKEMAP_POTION` case, which is caught by `ctx.check` itself.
  If the header clause is dropped, a new flag named after an existing define (for example `FLAG_HIDE_MAP_NAME_POPUP`) renames the free
  slot to a second `#define` with a different value. That is a redefinition warning only, and later uses silently point at the new
  bit. No test catches this.

This is a High-tier task and its discard and claim ownership are a trigger, so each guard needs a test that fails when the guard is
removed. Fix: add (a) a copy form whose `texts` holds a non-dialogue or unreferenced entry, expecting `COPY_UNBOUNDED`; and
(b) `itemball("FLAG_HIDE_MAP_NAME_POPUP")` (or any name read from the temp `flags.h`) with the default
`check`, expecting `LABEL_TAKEN` at `include/constants/flags.h`. Then run the two mutations.

## Minor

### M1. Default sprite does not exist in the subject
`gbaBuild.ts:182`: the fallback `"OBJ_EVENT_GFX_BOY_1"` has zero `#define`s in the subject's `event_objects.h`.
Reproduced: an npc or trainer form without `fields.sprite` always fails with `BAD_OPTION invalid sprite: OBJ_EVENT_GFX_BOY_1`.
Fix: drop the fallback so the error reads "invalid sprite: undefined", or default to a value that the corpus has.

### M2. Item-ball source citation points at the wrong file
`gbaBuild.ts:192` and `gbaBuild.test.ts:69` cite `data/maps/Route102/scripts.inc`. `Route102_EventScript_ItemPotion` is
actually in `data/scripts/item_ball_scripts.inc:1-3`, and the body (`finditem ITEM_POTION` / `end`) is correct. Fix the
comments.

### M3. Edited copied text is not checked against the charmap or the width
`gbaBuild.ts:145` emits the edited text bodies verbatim. Reproduced: `.string "中文$"` is accepted. New texts do go
through `wrapSign` with `ctx.charmap`. Unknown characters fail later at `preproc` (caught by the build), but line overflow is not
caught. The GBC sibling behaves the same way, so this is a family-wide note, not a GBA regression.

### M4. Warp destination read: stale count and misleading errors
`gbaBuild.ts:158-162`:
- The warp count comes from disk, so a warp staged in this session (self-warp) or in another open session is not counted.
  A valid new index is refused, or an index removed in that session is accepted.
- A `map.json` that parses to `null` throws a TypeError, which the outer catch turns into `BAD_OPTION` blamed on the source map's
  `map.json`.
- A missing `id` is reported as "has no warps".

Low impact. Note it for Task 4: it could pass the destination's warp count in ctx instead of reading disk.

### M5. Dead exports and a duplicate comment stripper
`gbaCopy.ts:4` (`gbaCode`) and `:7` (`GBA_LABEL`) are exported but used only inside the file. `signs/gbaSign.ts:4`
already has a private quote-aware `code()` that does the same `@`-comment stripping. Either drop `export` or keep one shared
stripper.

### M6. Test hygiene
- `gbaBuild.test.ts:156` hard-codes `index: 0` for the Route101 warp. Use `map.warpEvents.length`, as the coord case does.
- `gbaBuild.test.ts:183-188` "failed create leaves context byte-identical" runs with empty `scriptReplaces` and compares
  `JSON.stringify(ctx)`, where the `charmap` Map serialises to `{}`. So it does not prove that a failure after `slot()`
  leaves staged entries alone. A stronger case: `ctx.scriptReplaces = first.scriptReplaces`, then a trainer form with a
  new flag and `trainer: "TRAINER_NOT_REAL"`. `flag()` stages into the copy before `option(trainer)` fails. Then assert the
  input entry's `after` is unchanged. The code is correct today, and this test would keep it that way.

### M7. Note for Task 4 (outside this diff)
`write/save.ts:140` and `:188` describe every ScriptReplace as sign text ("Update sign text in scripts.inc", "Reopen the
map before editing its signs"). `flags.h` and `vars.h` replaces will show those strings. Also, two open sessions that each create
a new flag both pick `freeFlags[0]`. The second save is refused as `script-changed-on-disk`, which is safe but has a confusing
message.

Quality: CHANGES REQUESTED
