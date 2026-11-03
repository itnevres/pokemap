# Plan 14.1: Add Event (both families) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four icon Add buttons place a working object (NPC / item ball / existing trainer), warp, coord or bg event on a
clicked tile through one popup, in GBA and GBC, staged as one undo step and written by the normal Save.

**Architecture:** Task 1 fixes the shared contracts (types, route shapes, error shape). Core gets typed option sets and
per-family pure builders; the hubs expose read-only option and copy-preview routes and one `event/create` route per
family that builds a complete candidate session (all metadata in the undo snapshot) and publishes it as one undo
command; Save re-checks new names through an injected fresh check. The UI adds a shared `AddEventBar`, placement mode
on `MapSurface` (the Sign tool's pick path, generalized), a create path wired into the edit-session barriers, and a
shared `AddEventDialog` driven by per-family field specs.

**Tech Stack:** TypeScript, Node hub (`packages/server`), React 19 + Vitest + Testing Library (no jest-dom), core
parsers in `packages/core`.

**Spec:** `docs/superpowers/specs/2026-11-02-pokemap-plan-14-1-add-event-design.md` (rulings A1-A8; read it first).

## Global Constraints

- Both families in every UI task; one shared component per piece, family differences only in adapter/field data (A4).
- Buttons icon-only, one row, tooltip = `aria-label` (A1). Events placed on the **event grid**, origin-aware (GBA
  surface has a border origin, `gba/mapSurface.tsx`; GBC 16 px event cells, `gbc/mapSurface.tsx`).
- Every refusal names map and file. Error shape on the wire: `{ error: string, code?: string }` (the string is what
  `useEditSessionCore` already shows; `code` is extra).
- Every emitted name is checked against labels **and** constants, every open session's staged text, and again at plan
  **and** commit through an injected `NameCheck` (Task 4).
- One create = one undo command, and the undo snapshot holds **all** session metadata the create touched
  (`scriptAppends`, `scriptReplaces`, `insertOps`, `newNames`, GBC `constEdits`, events text); a failed create leaves
  session and undo history byte-identical (build-then-publish).
- Writes only through Save (`writeFilesAtomically`). Tests never read whole real subjects while other tests write them:
  project-wide scans run on one **immutable temp snapshot** made by a vitest `globalSetup` before any worker starts
  (Task 1 Step 0); write tests use temp copies. Check every package for racing writers (LESSONS Editing Sessions).
- Fixtures derive counts from the corpus at test time (free-slot counts, gap size); hard numbers only where the spec
  pins them (GBC cap 15, GBA `OBJECT_EVENT_TEMPLATES_COUNT` 64 in the subject, PerfPlus gap documented as 48 events).
  Constant names come from the corpus (PerfPlus items are `POTION`, not `ITEM_POTION`).
- No `@testing-library/jest-dom` matchers. Run vitest from the repo root. Gate: `npm test -- --maxWorkers=4 --minWorkers=1`.
- Files keep CRLF where they have it; no BOM; grep Codex diffs for mojibake (LESSONS Delegation).
- Every High task lists conductor mutation checks; each must turn at least one named test red.
- Out of scope: editing existing events beyond x/y, new GBC scenes, new trainers, return warps (warn only),
  `BGEVENT_COPY`, cross-file script copy.

## Review Focus

1. **Map switch, Save, Discard or undo while a create is in flight** → they wait for it; a late success or failure
   after A→B→A neither selects nor errors on the new visit. Task 8 witnesses (delayed success and delayed failure).
2. **Two dirty maps creating the same name, or a name defined on disk in an unrelated file after Save's plan was shown**
   → refusal `LABEL_TAKEN` at create, at plan, and at commit. Tasks 4 and 5.
3. **Copy from a script that falls through, is data (itemball/trainer/conditional), or lives in another bank** → not
   offered or refused; nothing staged. Tasks 1-3.
4. **Create → undo → create, redo, Discard** → names and slot reservations come back exactly; no orphan constants edit;
   Discard leaves files untouched. Task 5.
5. **No free flag/var slot, or GBC event gap full** → refusal naming the file, form kept. Tasks 2, 3, 9.

---

### Task 1: Contracts, counter-aware constants, typed option sets — Tier High (parsing decomp source)

**Files:**
- Create: `packages/core/src/addEvent/types.ts`, `packages/core/src/addEvent/gbaOptions.ts`,
  `packages/core/src/addEvent/gbcOptions.ts`, `packages/core/src/addEvent/entryPoints.ts`,
  `packages/core/src/gbc/load/constCounter.ts`
- Test: `packages/core/test/addEvent/gbaOptions.test.ts`, `packages/core/test/addEvent/gbcOptions.test.ts`,
  `packages/core/test/gbc/load/constCounter.test.ts`, helper `packages/core/test/helpers/subjectSnapshot.ts`

**Interfaces (Produces; every later task uses these names):**
- `type EventKind = "object" | "warp" | "coord" | "bg"`; `type ObjectType = "npc" | "itemball" | "trainer"`.
- `interface EventOptions { family: "gba" | "gbc"; sprites: string[]; movements: string[]; flags: string[];
  vars: string[]; items: string[]; trainers: TrainerRef[]; bgTypes: string[]; facings: string[]; secretBases: string[];
  palettes: string[]; maps: string[]; objectCap: number; freeFlagSlots: number; freeVarSlots: number }`
  (absent fields `[]` / `0`). `type TrainerRef = { id: string; label: string }` — GBA `id` = `TRAINER_*`; GBC
  `id` = `"<CLASS>,<ID>"` (class const + trainer const, as the `trainer` macro takes them), `label` for display.
- `interface MapEventOptions { entryPoints: string[]; localScripts: string[]; localTexts: string[]; scenes: string[];
  warps: { n: number; x: number; y: number }[]; tileInfo?: { x: number; y: number; warpCapable: boolean };
  returnsTo?: boolean }`.
- `interface CopyPreview { label: string; body: string; texts: Record<string, string> }`;
  `interface TextPreview { label: string; text: string }` (plain text decoded from the map file's text block; source
  must be a text label defined in this map's file, else refusal `COPY_NOT_SCRIPT`).
- `type FileReplace = { path: string; before: string; after: string }`: **whole-file** contents, as the existing
  `ScriptReplace` is (`core/src/write/save.ts` compares `before` to the whole disk file and refuses two entries for one
  path). Constants edits accumulate into **one** `FileReplace` per path: `before` stays the original disk text, `after`
  is the running result; each create re-derives `after` from the current entry.
- `type ScriptChoice = { mode: "existing"; label: string } | { mode: "copy"; from: string; label: string; body: string;
  texts: Record<string, string> } | { mode: "new"; label: string; text: string }`;
  `type TextChoice = { mode: "copy"; from: string; text: string } | { mode: "new"; text: string }`;
  `type NameChoice = { mode: "existing"; name: string } | { mode: "new"; name: string }`.
- `interface AddEventForm { kind: EventKind; x: number; y: number; objectType?: ObjectType;
  fields: Record<string, string>; script?: ScriptChoice; texts?: Record<"seen" | "beaten" | "after", TextChoice>;
  flag?: NameChoice; varName?: NameChoice }`.
- `class AddEventRefusal extends Error { code: RefusalCode; path?: string }` with
  `RefusalCode = "NAME_INVALID" | "LABEL_TAKEN" | "OBJECT_CAP" | "NO_SCENES" | "NO_FLAG_SLOT" | "NO_VAR_SLOT" |
  "NO_SCRIPTS_INC" | "COPY_UNBOUNDED" | "COPY_FALLTHROUGH" | "COPY_FOREIGN_LOCAL" | "COPY_NOT_SCRIPT" | "BAD_OPTION"`.
- `type NameCheck = (name: string) => { taken: boolean; where?: string }`.
- `loadGbaEventOptions(root): EventOptions`, `loadGbcEventOptions(root): EventOptions`.
- `entryPointsFor(family, root, mapName, mapText): string[]` — labels used as an **executable** script by some
  event, excluding data labels (bodies starting `itemball`, `hiddenitem`, `trainer`, `conditional_event` on GBC; GBA
  bodies that are not script code). GBC bank rule (a safe subset of the spec's): a label is eligible only if it is defined
  in **this map's own file** or in ROM0 (`home/`, e.g. `ObjectEvent`); a label from any other file is never offered,
  even one in the same ROM `SECTION` ("used by other maps" and "same section" are not evidence of reachability). GBC adds `ObjectEvent`, GBA `0x0`.
- `freeGbaSlots(root, "FLAG" | "VAR"): string[]` — `*_UNUSED_*` defines with **no reference** anywhere in the project
  outside the header (the subject warns some `VAR_UNUSED_*` are in use, `include/constants/vars.h`).
- `constCounter(text): { name: string; value: number; line: number }[]` and `gbcEventGap(text): { afterLine: number;
  remaining: number } | null` — handles `const_def`, `const`, `const_skip`, `const_next`; the gap is the run between the
  last `const EVENT_*` and the next `const_next` target.
- `gbcWarpCapable(coll: number, names: Map<number, string>): boolean`, `gbaWarpBehavior(behavior: number, b: GbaBehaviors): boolean`
  — mirror the engine checks, each citing its source lines (GBC warp collision check; GBA `src/field_control_avatar.c`
  including its custom stair warps and arrow warps).

- [ ] **Step 0: Snapshot prerequisite.** Add a vitest `globalSetup` (root vitest config) that copies the directories
  the option loaders read from both subjects into one temp dir **before any worker starts**, exposed as
  `POKEMAP_SUBJECT_SNAPSHOT`; `subjectSnapshot()` returns that path. This keeps scans away from the live writers
  `packages/cli/test/writeCommands.test.ts` and `packages/core/test/write/corpus.test.ts`.
- [ ] **Step 1: Failing tests** (scans run on `subjectSnapshot()`; never the live subject):
  - `constCounter.test.ts`: fixture lines `const_def 5` / `const A` / `const B` / `const_skip 2` / `const C` /
    `const_next 20` / `const D` → `[{A,5},{B,6},{C,9},{D,20}]`; on PerfPlus `event_flags.asm`, `gbcEventGap` → `remaining === 48` and every `const` value is below the
    boundary.
  - `gbaOptions.test.ts`: `sprites` has `OBJ_EVENT_GFX_YOUNGSTER`; no option list contains a name matching
    `/^NUM_|_COUNT$|_START$|_END$/` or a function-like macro (assert against the header text); `objectCap === 64`;
    `freeGbaSlots(VAR)` equals the `VAR_UNUSED_*` defines that have zero references outside `vars.h` (computed in the
    test with a plain grep of the snapshot) and excludes any that are referenced; `facings` equals the header's
    `BG_EVENT_PLAYER_FACING_*`; `entryPointsFor` contains `Route101_EventScript_Youngster`, not
    `LittlerootTown_MapScripts` nor a movement label from `LittlerootTown/scripts.inc`.
  - `gbcOptions.test.ts`: `sprites` has `SPRITE_YOUNGSTER`; `items` has `POTION`; `bgTypes` lacks `BGEVENT_COPY`;
    `palettes[0] === "0"`; `objectCap === 15`; entry points for Route29 contain `ObjectEvent` and a Route29 NPC script,
    **not** `Route29Potion` (an `itemball` data label, `maps/Route29.asm`) nor `Route29_MapScripts`, nor a script
    defined only in another map's file that no other-bank map uses.
  - GBC quarter parity: an event cell with even x / odd y selects the bottom-left quarter of its block (engine
    `home/map.asm` coordinate parity, cited), and `tileInfo.warpCapable` follows that quarter only (fixture block with
    a door in one quarter, floor in the others).
  - bank rule (negative fixtures): a label defined in another map file of the **same** `SECTION` is not eligible; one in
    a different section is not eligible; one in this map's file and one in `home/` are.
  - warp predicates: GBC `COLL_DOOR` true, `COLL_FLOOR` false, plus one stair/ladder collision true; GBA door true,
    `MB_NORMAL` false, the subject's custom stair behavior true, an arrow warp behavior true.
- [ ] **Step 2:** `npx vitest run packages/core/test/addEvent packages/core/test/gbc/load/constCounter.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Reuse `parseConstDefs` only for plain lists; use `constCounter` wherever values or
  `const_next`/`const_skip` matter.
- [ ] **Step 4:** same → PASS.
- [ ] **Step 5: Conductor mutations:** drop the data-label exclusion → `Route29Potion` test red; drop the section
  check → bank-rule test red; drop the reference check in `freeGbaSlots` → VAR test red; ignore `const_skip` → counter
  test red; ignore parity → quarter test red.
- [ ] **Step 6: Commit** `feat(plan-14.1): add-event contracts and typed option sets`.

### Task 2: GBC builder and script copy (core) — Tier High (new .asm text)

**Files:**
- Create: `packages/core/src/addEvent/gbcBuild.ts`, `packages/core/src/addEvent/gbcCopy.ts`
- Modify: `packages/core/src/gbc/write/save.ts` (session field `constEdits?: FileReplace[]`, at most one per path,
  written in the same atomic set; plan shows a refusal and commit writes nothing when disk ≠ `before`),
  `packages/core/src/gbc/write/guards.ts`
- Test: `packages/core/test/addEvent/gbcBuild.test.ts`, `packages/core/test/addEvent/gbcCopy.test.ts`,
  `packages/core/test/gbc/write/save.test.ts` (extend)

**Interfaces:**
- Consumes: Task 1 contracts; `addGbcEvent` (`gbc/edit/events.ts`, inserts the object const); `insertLineAfter`
  (takes a JavaScript **string offset**) and `replaceLines` (takes **line indices**) from `gbc/write/asmSplice.ts`; sign wrap/charmap.
- Produces: `buildGbcAddEvent(text, mapName, form, ctx: GbcAddCtx): { text: string; events: GbcMapEvents;
  constEdits: FileReplace[]; newNames: string[]; created: { kind: EventKind; index: number } }` with
  `GbcAddCtx = { options: EventOptions; mapOptions: MapEventOptions; mapConsts: Set<string>; eventFlagsDisk: string;
  constEdits: FileReplace[]; check: NameCheck }` (the session's current entries; the result replaces them); `copyGbcScriptBody(text, label): CopyPreview`; `defaultGbcLabel(mapName, kind, check)` →
  `<Map>Pokemap<Kind><n>`.

- [ ] **Step 1: Failing tests** (temp copy via `copyGbcSubjectToTemp`, Route29):
  - "npc new": exactly one new `object_event` line, script `Route29PokemapObject1`; that label before
    `Route29_MapEvents:` with `jumptextfaceplayer Route29PokemapObject1Text` and a text block ending `done`;
    `newNames` = the two labels + the object const.
  - "itemball": `OBJECTTYPE_ITEMBALL`; data label body `itemball POTION`; flag New → one `constEdits` entry on
    `constants/event_flags.asm` inserting `const EVENT_<NAME>` at `gbcEventGap().afterLine`.
  - "trainer existing": `OBJECTTYPE_TRAINER`; header uses the subject's `trainer` macro argument order (copied from a
    named PerfPlus trainer in the test comment); seen/beaten/after texts present.
  - "bg item": `BGEVENT_ITEM` → `<Label>: hiddenitem <ITEM>, <EVENT>`. "bg ifset": `conditional_event <EVENT>, <Script>`.
  - "coord": scene `SCENE_ROUTE29_NOOP`; scene `-1` accepted; `NO_SCENES` on a map with no `scene_script`.
  - refusals: `NAME_INVALID` (`1abc`), `LABEL_TAKEN` (check says taken), `OBJECT_CAP` at 15, `NO_FLAG_SLOT` (gap-full
    fixture), `BAD_OPTION` (sprite not in options).
  - `gbcCopy.test.ts`: copy of a `jumptextfaceplayer` script → body + its text; fall-through fixture →
    `COPY_FALLTHROUGH`; local `.Foo` inside the body kept, jump to a local outside → `COPY_FOREIGN_LOCAL`;
    `itemball` label → `COPY_NOT_SCRIPT`; a staged copy renames self, local and text references consistently.
  - "two new flags": two creates in sequence → one `constEdits` entry whose `after` holds both consts, `before` is the
    original disk text, every other line of the file unchanged.
  - "text provenance": a `TextChoice` with `mode: "copy"` whose `from` is not a text label defined in this map's file
    → `COPY_NOT_SCRIPT` (validated at create, not only in the preview route).
  - copy re-validation: an edited GBC body that loses its terminator → `COPY_UNBOUNDED`.
  - `save.test.ts`: `constEdits` + `.asm` written together; disk ≠ `before` → refusal, nothing written.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5: Conductor mutations:** remove the fall-through check; skip `check()` for the object const; write
  `constEdits` outside the atomic set → each turns a named test red.
- [ ] **Step 6: Commit** `feat(plan-14.1): GBC add-event builder and script copy`.

### Task 3: GBA builder and script copy (core) — Tier High (new scripts.inc/header text)

**Files:**
- Create: `packages/core/src/addEvent/gbaBuild.ts`, `packages/core/src/addEvent/gbaCopy.ts`
- Test: `packages/core/test/addEvent/gbaBuild.test.ts`, `packages/core/test/addEvent/gbaCopy.test.ts`, temp-copy
  helper `packages/core/test/helpers/gbaTempProject.ts` (copies Route101 + headers it needs; existing GBA temp copies
  only cover single maps)

**Interfaces:**
- Consumes: Task 1; `addEvent` (`core/src/edit/events.ts`); `ScriptAppend`/`ScriptReplace` (`core/src/write/save.ts`).
- Produces: `buildGbaAddEvent(map, scriptsInc: string | null, form, ctx: GbaAddCtx): { value: Record<string, unknown>;
  scriptAppends: ScriptAppend[]; scriptReplaces: ScriptReplace[]; newNames: string[]; created: { kind; index } }`,
  `GbaAddCtx = { options; mapOptions; root; mapName; tileElevation: number; freeFlags: string[]; freeVars: string[];
  scriptReplaces: ScriptReplace[]; check: NameCheck }` (current entries; the result replaces them); `copyGbaScriptBody(scriptsInc, label): CopyPreview`; `defaultGbaLabels(mapName, kind, check)`
  → `{ script: "<Map>_EventScript_Pokemap<Kind><n>", text: "<Map>_Text_Pokemap<Kind><n>" }`.

- [ ] **Step 1: Failing tests** (Route101 in `gbaTempProject`):
  - "npc new": `elevation` = tile elevation, `flag: "0"`, script = new label; one append with `msgbox <Text>,
    MSGBOX_NPC` / `end` and `.string "...$"`.
  - "itemball": `OBJ_EVENT_GFX_ITEM_BALL`, `finditem ITEM_POTION` / `end`; flag New renames `freeFlags[0]`'s define:
    one whole-file `ScriptReplace` on `include/constants/flags.h` (`before` = disk text, `after` = disk text with only
    that `#define` name changed).
  - "two new flags": two creates → still one `ScriptReplace` for `flags.h` (accumulated), both renames present, all
    other lines identical; the second create does not reuse the first's slot.
  - "text provenance": same `COPY_NOT_SCRIPT` rule as GBC for `TextChoice.from` outside this map's `scripts.inc`.
  - "trainer existing": `trainer_type: "TRAINER_TYPE_NORMAL"`, sight range from the form, body in the subject's
    `trainerbattle_single` form (named source in the test comment).
  - "coord new var": `var` = the user's name with a `vars.h` replace; empty `freeVars` → `NO_VAR_SLOT`.
  - "bg": sign with facing; `hidden_item` has `item` + `flag`, no quantity key; `secret_base` with a real id; every bg
    has `elevation`.
  - "warp": `dest_warp_id` is the 0-based index as a string.
  - `NO_SCRIPTS_INC` for new/copied script when `scriptsInc === null`; `existing` still works.
  - "LABEL_TAKEN": check says taken for the default `…1` → default advances to `…2`; for a user-typed name → refusal.
  - `gbaCopy.test.ts`: copy of `Route101_EventScript_Youngster` renames its text label; a body reached by
    fall-through → `COPY_FALLTHROUGH`; an edited body that loses its terminator → `COPY_UNBOUNDED` on re-parse.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5: Conductor mutations:** drop `check()`; drop the fall-through check; emit a hidden-item quantity →
  named tests red.
- [ ] **Step 6: Commit** `feat(plan-14.1): GBA add-event builder and script copy`.

### Task 4: Fresh name checks at plan and commit (core, both families) — Tier High (save safety)

**Files:**
- Modify: `packages/core/src/write/save.ts` (`planSave`, `prepareSave(proj, session, opts?)`, `commitSave(proj, plan,
  ..., opts?)`), `packages/core/src/gbc/write/save.ts` (same for `planGbcSave`/`prepareGbcSave`/`commitGbcSave`)
- Create: `packages/core/src/addEvent/names.ts`
- Test: `packages/core/test/addEvent/names.test.ts`, extend `packages/core/test/write/save.test.ts`,
  `packages/core/test/gbc/write/save.test.ts`

**Interfaces:**
- Produces: `definedNames(text, family): Set<string>` (labels, `const`, `#define`); sessions carry
  `newNames?: string[]`; `opts.checkNames?: NameCheck` — the caller supplies a check built **at call time** from a
  fresh symbol index and every other open session's staged text (Task 5 builds it). Plan and commit each call it for
  every `newNames` entry, ignoring the session's own staged definitions; a hit → refusal
  `{ code: "LABEL_TAKEN", path, name }` and commit writes nothing.
- [ ] **Step 1: Failing tests:** (a) plan succeeds; **then** the check starts returning taken for `X` (simulating an
  unrelated file gaining `X:` after the plan was shown); commit refuses `LABEL_TAKEN` and writes nothing; (b) with the
  check clean, commit writes; (c) GBC same with an `EVENT_` const; (d) a session without `newNames` never calls the
  check.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5: Conductor mutation:** remove the commit-time call → (a) red.
- [ ] **Step 6: Commit** `feat(plan-14.1): fresh name checks at plan and commit`.

### Task 5: Hub routes and session snapshots (both families) — Tier High (hub I/O, undo atomicity)

**Files:**
- Modify: `packages/server/src/index.ts`, `packages/server/src/editSessions.ts` (snapshot/restore include
  `scriptReplaces`, `scriptAppends`, `insertOps`, `newNames`), `packages/server/src/gbcEditRoutes.ts`,
  `packages/server/src/gbcEditSessions.ts` (`GbcSnapshot` gains `constEdits`, `newNames`), `packages/server/src/gbcRoutes.ts`
- Create: `packages/server/src/addEventRoutes.ts` (`nameCheckFor(store, family, mapName, symbolIndex): NameCheck`,
  options cache keyed by project, dropped with the symbol index)
- Test: `packages/server/test/addEventRoutes.test.ts`, `packages/server/test/gbcAddEventRoutes.test.ts`

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces (both hubs, same paths):
  - `GET /api/event-options` → `EventOptions`.
  - `GET /api/event-options/:map[?x=&y=][&dest=<map>]` → `MapEventOptions`, from the session's **staged** text when a
    session is open; `dest` fills `warps` (destination's) and `returnsTo`.
  - `GET /api/event-options/:map/copy?label=<label>` → `CopyPreview`; `GET /api/event-options/:map/text?label=<label>`
    → `TextPreview` (trainer seen/beaten/after "Copy from"); refusals as 400 `{ error, code }`. Both read the session's
    staged text.
  - `EventOptions.flags` / `.vars` include names the project's open sessions have staged as new (a flag created in one
    Add is offered in the next before Save).
  - `POST /api/edit/:map/event/create` (GBA) / GBC table entry `"POST event/create"`; body `AddEventForm` → GBA
    `{ map, isDirty, canUndo, canRedo, created }`, GBC `{ ...sessionBody, created }`; refusal 400 `{ error, code }`.
  - Every commit path passes `checkNames: nameCheckFor(...)` built at commit time (Task 4).
- [ ] **Step 1: Failing tests** (hub over temp projects as `indicatorRoutes.test.ts` / `gbcIndicatorRoutes.test.ts`
  do; GBA two-map cases use `gbaTempProject` with two maps):
  - create NPC → 200; `POST /undo` → `GET plan` shows no changes and `newNames` is empty; `POST /redo` restores event,
    script, const edit and names; create → undo → create again reuses `…1`.
  - item ball with a new flag → undo removes the `constEdits`/`scriptReplaces` entry; two creates claim two different
    slots; undo of the second frees only its slot.
  - post-staging failure: the route builds the candidate, then runs `verifyCandidate(candidate)` (re-parses the
    candidate text, re-checks every `newNames` entry) before publishing; the test injects a failing verifier through
    the route factory's `hooks.verifyCandidate` option and asserts the hook saw the event and script already staged in
    the candidate → 400, `canUndo` unchanged, session text byte-identical, no snapshot pushed.
  - real commit-time collision: create → `GET plan` → write `<sameName>:` into an **unrelated** file of the temp
    project → `POST commit` with the plan fingerprint → refusal `LABEL_TAKEN`, no file written (the index is rebuilt at
    commit, not reused).
  - a new flag staged in session A is listed in `GET /api/event-options` flags; after A's undo it is gone.
  - two creates with new flags → `POST commit` → on disk the header holds **both** new names and every other line is
    byte-identical to the original; GBC same for `event_flags.asm` (both families).
  - two creates with new flags, then undo once → the session's header replacement equals exactly the one after the
    first create (`after` text compared), redo → equals the two-create text.
  - a name staged in another open dirty session → 400 `LABEL_TAKEN`.
  - options for `:map` include a label staged but unsaved; `?dest=` reports `returnsTo: false` for a one-way warp.
  - `copy?label=` of an itemball label → 400 `COPY_NOT_SCRIPT`.
  - Discard after a create → files byte-identical to before.
- [ ] **Step 2:** FAIL. **Step 3:** implement build-then-publish on a session copy (GBA indicator add route pattern;
  GBC `stageSign` extended to the new snapshot fields), one `snapshotCommand("add <kind>", prev, next)`.
- [ ] **Step 4:** PASS; then `npx vitest run packages/server`.
- [ ] **Step 5: Conductor mutations:** omit `newNames` from the snapshot → redo/undo test red; push the snapshot before
  validation → failure test red.
- [ ] **Step 6: Commit** `feat(plan-14.1): add-event routes and complete undo snapshots`.

### Task 6: AddEventBar and placement mode (UI, both families) — Tier High (shared canvas input)

**Files:**
- Create: `packages/ui/src/shared/AddEventBar.tsx`; 4 icons in `packages/ui/src/components/toolIcons.tsx`
- Modify: `packages/ui/src/canvas/MapSurface.tsx` (props `placing?: EventKind | null`,
  `onEventPick?: (x, y, anchor: DOMRect) => void`; one shared click branch with `onSignPick`; cursor + hint overlay),
  `packages/ui/src/components/MapEditingWorkspace.tsx`, `packages/ui/src/gbc/GbcMapEditing.tsx`,
  `packages/ui/src/components/EventInspector.tsx` (remove empty-state Add Event), `packages/ui/src/hooks/useMapEditing.ts`
  (remove `onAddEvent`), `packages/ui/src/styles.css`
- Test: `packages/ui/test/shared/AddEventBar.test.tsx`, `packages/ui/test/canvas/placement.test.tsx`; tests of the old
  button migrated (the task report lists each removed assertion and its replacement)

**Interfaces:**
- Produces: `<AddEventBar placing onToggle={(k: EventKind) => void} disabled={Partial<Record<EventKind, string>>} />`
  (reason → `title`); workspace state `placing: EventKind | null`, `pick: { kind; x; y; anchor } | null`.
- [ ] **Step 1: Failing tests:**
  - labels exactly: "Add Object: click a tile, then fill in the details", "Add Warp: click a tile, then pick the
    destination", "Add Coord Event: click a tile, then pick the trigger and script", "Add BG Event: click a tile, then
    pick the sign or hidden item"; `aria-pressed` toggles; a disabled reason is the `title` and blocks the toggle.
  - placement on both families with the surface's real geometry (origin from the adapter, not hard-coded): click the
    centre of event cell (2, 1) at zoom 1 and at zoom 2 after a pan → pick `(2, 1)` both times; GBC cell = 16 px.
  - Esc, same button, tool change, map switch, Save and Discard each clear `placing`.
  - no paint POST while placing (strict fetch mock).
  - capacity: GBC with 15 objects → Object disabled with reason; GBC map without scenes → Coord disabled.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS + `npx vitest run packages/ui`.
- [ ] **Step 5: Conductor mutations:** drop the origin offset → zoom/pan pick test red; let paint run while placing →
  strict-mock test red.
- [ ] **Step 6: Commit** `feat(plan-14.1): add-event bar and placement mode`.

### Task 7: Create path in the edit sessions and the options hook (UI) — Tier High (async ordering)

**Files:**
- Create: `packages/ui/src/shared/useEventOptions.ts`
- Modify: `packages/ui/src/shared/useEditSessionCore.ts` (structured error: read `error` string, keep `code`;
  a `barrier()` promise that Save/Discard/undo/redo/switch await), `packages/ui/src/hooks/useEditSession.ts`,
  `packages/ui/src/gbc/hooks/useGbcEditSession.ts` (`createEvent(form): Promise<{ kind; index } | null>`; `null` for a
  stale ticket), the Save/Discard/undo/redo/switch callers in both families
- Test: `packages/ui/test/shared/useEventOptions.test.tsx`, `packages/ui/test/shared/createEvent.test.tsx`

**Interfaces:**
- Produces: `useEventOptions(mapName, visit): { project?: EventOptions; map?: MapEventOptions; load(q?): Promise<void>;
  copy(label): Promise<CopyPreview>; text(label): Promise<TextPreview>; invalidate(): void }` — `invalidate` is called on save, discard, undo, redo and
  project reload; responses for an old visit are dropped.
- [ ] **Step 1: Failing tests:** both caches (`project` and `map`) drop on save, discard, undo and redo (assert the
  refetch of each URL); `createEvent` posts once and resolves `created`; a 400 rejects with the server's
  `error` text and `code`; while it is pending, Save, Discard, undo, redo and a map switch wait (assert their POSTs go
  out after the create resolves); delayed **success** after A→B→A resolves `null` and applies nothing; delayed
  **failure** after A→B→A rejects with a stale marker the caller ignores; after undo, `useEventOptions` refetches.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS + `npx vitest run packages/ui`.
- [ ] **Step 5: Conductor mutations:** remove the barrier await in Save → ordering test red; skip `invalidate` on undo →
  refetch test red.
- [ ] **Step 6: Commit** `feat(plan-14.1): create path, barriers and event options hook`.

### Task 8: AddEventDialog and family field specs (UI) — Tier High (dialog stacking, visit identity)

**Files:**
- Create: `packages/ui/src/shared/AddEventDialog.tsx`, `packages/ui/src/gba/addEventFields.ts`,
  `packages/ui/src/gbc/addEventFields.ts`
- Modify: `packages/ui/src/shell/adapter.ts` (`EngineAdapter.addEventFields(kind, objectType, ctx): FieldSpec[]` and
  `addEventDefaults(kind, objectType, ctx): Record<string, string>`, with `ctx = { mapName; x; y; options:
  EventOptions; map: MapEventOptions }`), `packages/ui/src/gba/adapter.tsx`, `packages/ui/src/gbc/adapter.tsx`,
  `MapEditingWorkspace.tsx`, `GbcMapEditing.tsx`, the Save dialog notes (return-warp note)
- Test: `packages/ui/test/shared/AddEventDialog.test.tsx`, `packages/ui/test/gba/addEventFields.test.ts`,
  `packages/ui/test/gbc/addEventFields.test.ts`

**Interfaces:**
- Consumes: Task 6 `pick`, Task 7 `createEvent` / `useEventOptions`.
- Produces: `type FieldSpec = { key: string; label: string; kind: "select" | "text" | "number" | "multiline" | "source";
  options?: string[]; modes?: ("existing" | "copy" | "new")[]; showIf?: (v: Record<string, string>) => boolean }`.
- [ ] **Step 1: Failing tests:**
  - field specs per family/kind/type match the spec tables (GBC item ball: item + flag, no script source; GBA hidden
    item: no quantity; flag source modes = existing/new; GBC coord scenes include `-1`; trainer = trainer select +
    three text sources).
  - a select with more than 20 options is searchable (typing filters); an empty option list renders a text box.
  - client validation: Add disabled while a required field is empty or a name fails `/^[A-Za-z_][A-Za-z0-9_]*$/`;
    enabled once fixed.
  - every disabled-button condition from spec Shell item 1 (not editable, request in flight, object cap per family,
    GBC coord without scenes) renders its reason; wired through the real workspace (`MapEditingWorkspace` /
    `GbcMapEditing`), a canvas click with `placing` set reaches `onEventPick` and opens the dialog.
  - Copy from: choosing a label calls `copy(label)` and fills the body/text boxes and the default label; for a trainer,
    choosing a seen/beaten/after source calls `text(label)` and fills that text box.
  - submit posts once (double click), success closes and selects `created` when the visit is current; 400 shows the
    message inline with fields intact; while in flight Escape, Cancel and backdrop do nothing.
  - stacking: with the Save dialog opened over it, Escape closes only the Save dialog; Tab stays in the topmost
    dialog; on close focus returns to the Add button.
  - warp: `returnsTo: false` shows "<Dest> has no warp back to <Map>; add one there"; `warpCapable: false` shows the
    tile warning; neither disables Add; the Save dialog lists the same return-warp note for an unsaved one-way warp.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS + `npx vitest run packages/ui`.
- [ ] **Step 5: Conductor mutations:** drop the visit check on success → selection test red; let Escape through while
  in flight → in-flight test red.
- [ ] **Step 6: Commit** `feat(plan-14.1): add-event dialog and family field specs`.

### Task 9: Live acceptance and build check — Tier High (live, subject copies)

**Files:** `docs/superpowers/task-reports/pokemap-plan-14-gbc-editing-gaps/task-9-live.md`, driver in `task-9-shots/`.
- [ ] **Step 1:** scratch clones of the GBA subject and PerfPlus (Plan 13 Task 6 recipe; manifests before/after).
- [ ] **Step 2:** Playwright headless, both families: each kind and object type with defaults and with each script
  mode; new flag/var; placement cancel paths; undo/redo; Discard leaves files untouched; Save; diff every written file
  against the spec's expected text; a full flag gap / no free var shows the refusal with the form kept.
- [ ] **Step 3:** `make` in each scratch clone if the toolchain exists (exit code recorded, or "not run: <reason>").
- [ ] **Step 4:** gate (pass/fail/files), typecheck, UI build; real subjects unchanged.
- [ ] **Step 5: Commit** report + fixes (each fix its own commit with a regression test).

### Task 10: Final review and docs — Tier High

- [ ] Whole-branch review (user picks Codex `gpt-6-astra` or Claude Opus); fix findings with tests.
- [ ] `packages/ui/DESIGN.md` shared-module rows (AddEventBar, AddEventDialog, placement mode); LESSONS; RESUME status;
  roadmap Plan 14 status. Gate line in RESUME. STOP for the user before push/PR/merge.

## Review record

- Plan review 3: Codex `gpt-6-astra`: 3, 7, 8, 9, 10 addressed; remaining fixed here (GBC eligibility narrowed to
  this map's file + `home/` with negative fixtures; `TextChoice` provenance at create + `text()` hook; two-creates →
  commit witness and undo-restores-previous-replacement witness; snapshot wording).
- Plan review 2: Codex `gpt-6-astra`: findings 4, 5, 6, 11 addressed; partial ones and the new Important (whole-file,
  accumulated header replacements) folded in (bank rule by SECTION, text-preview route, real commit-time collision
  test, exact counter fixture, string offset, staged-constant options, validation/disabled witnesses, quarter parity,
  post-staging verifier seam, globalSetup snapshot before workers).
- Plan review 1: Codex `gpt-6-astra` (read-only), 2026-11-02: 10 Important, 1 Minor; all folded in (typed map-aware
  entry points, copy-preview route, trainer refs, injected fresh name check with commit-after-plan test, full undo
  snapshots, structured errors + barriers, corpus-derived fixtures, counter-aware const parser, unmapped spec items,
  mutations per task, temp snapshots for scans, origin-aware placement, Task 7 split into 7/8).
