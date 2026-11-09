# Plan 14.1 Task 3 spec-compliance review (GBA add-event builder and script copy)

Reviewer: Claude Opus, read-only. Commit `bbeb725` on `6c1cc94`. Subject: `C:/Programming Projects/Pokemon Game/game`.
Focused tests re-run by me: `gbaBuild.test.ts` + `gbaCopy.test.ts` -> 2 files, 16/16 passed. I did no mutations of my own
(read-only brief); the conductor's three mutations are named in the report and map to tests I read
(`LABEL_TAKEN`, both COPY_FALLTHROUGH / COPY_UNBOUNDED tests, `bg`).

## Interfaces (task text vs diff)

- `buildGbaAddEvent(map, scriptsInc: string | null, form, ctx)` returns `{ value, scriptAppends, scriptReplaces, newNames,
  created: { kind, index } }`. Matches.
- `GbaAddCtx` has every listed field plus the required `charmap: Charmap` from the conductor ruling. Matches.
- `copyGbaScriptBody(scriptsInc, label): CopyPreview`. Matches.
- `defaultGbaLabels(mapName, kind, check)` returns `<Map>_EventScript_Pokemap<Kind><n>` / `<Map>_Text_Pokemap<Kind><n>`.
  `Kind` is `Object/Warp/Coord/Bg`, the same as the GBC sibling. It also skips an `n` whose trainer text companions are
  taken. That is conservative and fine.
- Extra exports `gbaCode` and `GBA_LABEL`: small, and used inside the module. Not YAGNI-worthy.

## Step 1 tests (present, names, strength)

All eleven listed cases are present, and none of their assertions is weaker than the task text:
- npc new: elevation 5 = `tileElevation`, `flag "0"`, new label, one append, `msgbox ..., MSGBOX_NPC` / `end`, `.string "Hello there!$"`.
- itemball: `OBJ_EVENT_GFX_ITEM_BALL`, `finditem ITEM_POTION` / `end`. One flags.h replace with `before === disk` and `after ===`
  disk with only the define renamed (exact equality).
- two new flags: still one replace. Both renames are present. Same line count and exactly 2 changed lines. The second
  create uses `freeFlags[1]`, and `ctx` is not mutated.
- text provenance: COPY_NOT_SCRIPT for a foreign text, and also for a stale `localTexts` entry that is a script.
- trainer existing: `TRAINER_TYPE_NORMAL`, sight "4" from the form, body cited. I checked the cited source:
  `data/maps/Route102/scripts.inc:63-66` is `Route102_EventScript_Rick::` / `trainerbattle_single TRAINER_RICK,
  Route102_Text_RickIntro, Route102_Text_RickDefeated` / `msgbox Route102_Text_RickPostBattle, MSGBOX_AUTOCLOSE` / `end`.
  The argument order matches.
- coord new var: `var` = the user's name, vars.h replace, and NO_VAR_SLOT naming `include/constants/vars.h`.
- bg: sign with facing, `MSGBOX_SIGN`. hidden_item keys are exactly `type,x,y,elevation,item,flag`, the same order as the
  subject. Example: `AbandonedShip_*` `{'type':'hidden_item','x':42,'y':10,'elevation':3,'item':..,'flag':..}`.
  secret_base uses a real id, and a bad id is refused. Every bg has a numeric elevation.
- warp: `dest_warp_id: "1"` (string). `dest_map` is the destination's `id` (`MAP_LITTLEROOT_TOWN`, which has 4 warps),
  and an out-of-range warp is refused.
- NO_SCRIPTS_INC for new, copy and itemball; `existing` works with `null`.
- LABEL_TAKEN: the default advances to `...2`, and a user-typed name is refused. Two extra checks: an in-file label, and
  a taken flag name on flags.h.
- gbaCopy: the Youngster copy renames the text to `Route101_Text_Copied` and re-parses. Fall-through gives
  COPY_FALLTHROUGH (also for a label-only block). A lost terminator gives COPY_UNBOUNDED with the scripts.inc path.

## Generated text vs subject (verified)

- Object keys and types match subject `Route102/map.json` exactly. `movement_range_*` are numbers, while
  `trainer_sight_or_berry_tree_id` and `flag` are strings. The `trainer_type` values are the same.
- Coord matches `Route101/map.json`: `{type:"trigger", x, y, elevation, var, var_value:"1", script}`, and `var_value` is a
  string.
- Warp: `{x, y, elevation, dest_map, dest_warp_id}` with `dest_warp_id` as a string. This matches `LittlerootTown` warp 0.
- `msgbox <Text>, MSGBOX_NPC` / `end` matches the subject (`Route101_EventScript_Youngster`, scripts.inc:211-213).
  `finditem ITEM_POTION` / `end` matches `Route102_EventScript_ItemPotion`. The coord body is `lockall/msgbox
  MSGBOX_DEFAULT/releaseall/end`, as the spec says.
- Text goes through `wrapSign(text, ctx.charmap, SIGN_WIDTH)` and `renderGbaBody`, giving `.string "...\n"/"\l"/"\p"/"$"`.
  The charmap is not hard-coded.
- flags.h / vars.h replaces: each one is a whole-file `ScriptReplace` with `path` from `projectPaths` (normalised, the same
  form as `mapScriptsInc`). There is one entry per path, `before` keeps the first (disk) text, and later creates update
  `after` on a shallow copy (gbaBuild.ts:93-105). Duplicate input paths are refused. EOL is preserved because only the
  define token is replaced. The Route101 and header files are LF.
- Refusals use `<Map>: <file>: ...` with `path` set. Copy refusals from the synthetic body use `ctx.mapName` because the
  synthetic starts with `<Map>_MapScripts::`, and the catch re-wraps anything that does not already name map and file.
  Verified.

## Findings

### Important

**I1. hidden_item flags are not bounded to the engine's hidden-item range (known open item; still a must-fix in this task).**
gbaBuild.ts:173-175 (`flag(true)`, which accepts any `options.flags` entry, or any `freeFlags` slot through `slot()` at
gbaBuild.ts:93). In the engine, the flag of a hidden item is stored relative to `FLAG_HIDDEN_ITEMS_START`:
- `asm/macros/map.inc:90-91`: `bg_hidden_item_event` passes `((\flag) - FLAG_HIDDEN_ITEMS_START)` as `arg7`.
- `asm/macros/map.inc:76-79`: `arg7` is emitted as `.2byte`. The C struct field is `u16 hiddenItemId`
  (`include/global.fieldmap.h:136-139`). It is a 16-bit field, not a byte as the implementer's report says.
- The engine rebuilds the flag as `hiddenItemId + FLAG_HIDDEN_ITEMS_START` in three places:
  `src/field_control_avatar.c:453` (`gSpecialVar_0x8004 = (script >> 16) + FLAG_HIDDEN_ITEMS_START`), and
  `src/item_use.c:441,472` (`FlagGet(hiddenItemId + FLAG_HIDDEN_ITEMS_START)`, where `FlagGet(u16)` is at `src/event_data.c:253`).

The exact bounds for the fix:
- **Lower bound:** `flag >= FLAG_HIDDEN_ITEMS_START` = `0x1F4` (`include/constants/flags.h:545`). Below this, `flag - START`
  is negative, so `.2byte` stores a two's-complement value. It only round-trips because of u16 wrap. That is not a
  contract, so refuse it.
- **Upper bound:** `flag - FLAG_HIDDEN_ITEMS_START <= 0xFFFF` (u16). The tighter limit is `flag < FLAGS_COUNT`
  (`flags.h:3481`, `HOENN_FLAGS_END + 1`), so the flag lands in the save-block bit array (`NUM_FLAG_BYTES`,
  `include/global.h:155`). Anything `>= SPECIAL_FLAGS_START` (`0x4000`, flags.h:3484) goes to the unsaved `sSpecialFlags`
  (`src/event_data.c:219-226`), and the item would respawn after a reload.

Notes for the fix:
- The vanilla dedicated block is `START+0x00` .. `START+0x6F` (`0x1F4`..`0x263`). The last entry is
  `FLAG_HIDDEN_ITEM_ROUTE_105_BIG_PEARL`, `flags.h:657`, and `FLAG_MINTS_CLERK 0x264` follows at `flags.h:659`. The block
  has no gaps, and the subject comment at `flags.h:2464` says it "is boxed in from 0x264".
- No `FLAG_UNUSED_*` lies in that block. The lowest is `0x296`, at flags.h:706. So if the rule is "inside the vanilla
  block", every New hidden-item flag is NO_FLAG_SLOT. If the rule is the engine bound (`0x1F4 <= value < FLAGS_COUNT`),
  every current `FLAG_UNUSED_*` qualifies.
- Either way, checking the bound needs the define's numeric value. Many slots are expressions such as
  `(DAILY_FLAGS_START + 0x1B)`, so the fix needs a small define evaluator, or a refusal when the value is not a literal.
- The existing test flag `FLAG_HIDDEN_ITEM_ROUTE_104_SUPER_POTION` is in range, so the bg test stays valid.
- Failure scenario today: an existing flag such as `FLAG_TEMP_1` (0x1) or `FLAG_HIDE_MAP_NAME_POPUP` (0x4000) is accepted
  for a hidden item. The first assembles to a wrapped `.2byte`. The second maps to an unsaved special flag, so the item
  can be picked up again after every reload.

**I2. The first New flag slot in the subject aliases a live flag, and some "free" slots break the build or are cleared
daily.** gbaBuild.ts:100 takes `freeFlags.find(...)` in header order with no further check. The root cause is
`gbaOptions.ts:18` (Task 1): it ignores every reference inside the header itself. Concrete subject cases:
- `FLAG_UNUSED_0x296  0x296` (flags.h:706) is the first `FLAG_UNUSED_*` and is referenced nowhere else, so it is
  `freeFlags[0]`. It has the same value as `FLAG_SHINY_STARTER_3 0x296` (flags.h:709). The first New flag a user creates,
  for example on an item ball, sets the Totodile shiny-starter flag on pickup.
- `FLAG_UNUSED_0x91F` (flags.h:1642) is used by `DAILY_FLAGS_START` (flags.h:1647). `FLAG_UNUSED_0x95F` (flags.h:1719)
  is used by `DAILY_FLAGS_END` (flags.h:1720). Both are "free", because flags.h is excluded from the reference scan.
  Renaming either one leaves `DAILY_FLAGS_*` undefined, and the build breaks (`src/event_data.c:53`). That does not meet
  the spec ("free = not referenced anywhere else in the project").
- `FLAG_UNUSED_0x920`..`0x95F` are `DAILY_FLAGS_START + n`. `ClearDailyFlags` (`src/event_data.c:53`) zeroes them, so an
  item ball or beaten flag placed there resets every day.

Fix: in `slot()`, or better in `unusedSlots`, skip any slot whose name appears in the header outside its own `#define`
line. Also skip slots whose value equals another define's value, and slots in the daily (and temp) ranges. The last two
need a conductor ruling, since the spec's definition is reference-based. Add a test that pins `freeFlags[0]` not equal to
`FLAG_UNUSED_0x296`, and that excludes `FLAG_UNUSED_0x91F`.

### Minor

**M1. No test pins the GBA coord New body.** gbaBuild.ts:120-121 emits `lockall/msgbox ..., MSGBOX_DEFAULT/releaseall/end`,
and the spec names this exact body. The only coord test uses `existing`, so a mutation to `MSGBOX_NPC`, or dropping
`releaseall`, stays green. Add one assertion to "coord new var" or a new case.

**M2. `existing` script accepts `0x0` for coord and sign.** gbaBuild.ts:116 checks only `mapOptions.entryPoints`, which
`entryPointsFor` (entryPoints.ts:68) seeds with `0x0` for every kind. The spec allows `0x0` "for an NPC" only. A coord
or sign event with script `0x0` would be accepted. The GBC sibling does the same with `ObjectEvent` (parity), so fix both
or rule on it.

**M3. Copy-grammar escapes, edited-body side.** gbaBuild.ts:130 and gbaCopy.ts:5:
- ARM gas treats `;` as a statement separator. An edited body line like `\tmsgbox X ; Helper::` defines a top-level label
  that passes the line-start check at :130. That bypasses the "extra top-level definition" refusal, and `Helper` is
  never NameChecked.
- The string regex `"[^"\r\n]*"` does not handle `\"` escapes.

Both need user-typed adversarial input, so the impact is low. Refusing `;` outside strings in edited bodies is enough.

**M4. Report inaccuracy (not code).** task-3-report.md "Concerns" says the hidden-item flag offset is stored "in a byte".
It is a `.2byte` / `u16` field (see I1). This is noted so the fix round does not size the bound to 0xFF.

Accepted deviations (no finding): `goto <label>` as a copy terminator (an unconditional jump, parity with GBC `sjump`).
The text label is derived from the script label. The sight range defaults to `"3"`, as in subject trainer
`Route102_EventScript_Calvin`. The destination map.json is read for the `id` and the warp-count bound.

Spec: FAIL
