# Plan 10a2: Pokémon Indicator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename GBA "Add Wild Sign" to **Pokémon Indicator**, port it to GBC, and let both families edit a placed
Indicator's species and text.

**Architecture:** Pure core modules build, recognise and rewrite Indicator source per family (`core/src/indicator/`),
reusing the Sign tool's charmap/wrap/body renderers. Server routes under `indicator/*` stage edits into the existing
server-side sessions (one undoable snapshot per op). UI keeps today's dialog (renamed, family-neutral), adds an
**Edit Indicator** button to both event inspectors, and moves placed Indicators with the existing event drag.

**Tech Stack:** TypeScript, React, Vitest (run from repo root), Node server (`packages/server`).

**Spec:** `docs/superpowers/specs/2026-10-17-pokemap-plan-10a2-pokemon-indicator-design.md` (rulings I1-I4, builder
calls C1-C8, acceptance P1-P9). Read it first; this plan cites rulings by id instead of repeating them.

## Global Constraints

- Nothing reaches disk except through the Save dialog's commit; commit writes exactly what the plan showed.
- No git dependency anywhere. Never a partial write; every guard is a located refusal (file, line where known, fix).
- Preserve each file's line endings (CRLF/LF), final-newline state and tab indentation byte-for-byte.
- Labels (C2): GBA `<Map>_EventScript_PokemonIndicator<N>` / `<Map>_Text_PokemonIndicator<N>`; GBC
  `<Map>PokemonIndicator<N>` / `<Map>PokemonIndicator<N>Text`. `<N>` = lowest unused in that map's own file(s).
  Existing `_WildSign_<Species>` labels are never renamed.
- GBC sprite (I3): `SPRITE_<SPECIES>` if the subject's `constants/sprite_constants.asm` defines it, else `SPRITE_MONSTER`.
- Text (C1): `wrapSign` + the subject charmap, width **18 in both families** (what Plan 10a shipped: GBA passes a
  literal `18` at `server/src/signRefresh.ts:82`; the 10a plan's `GBA_SIGN_WIDTH = 36` was never implemented). Task 1
  extracts `export const SIGN_WIDTH = 18` into `core/src/signs/wrap.ts` and points both Sign and Indicator callers at it.
- Strings (I1): feature name "Pokémon Indicator"; submit "Place" / "Update"; banner "Placed Pokémon Indicator: <label>".
- Capability `pokemonIndicator: true` for both families (replaces GBA `addSign`).
- Vitest from repo root only; no jest-dom. Gate: `npm test > <scratch>/run.txt 2>&1` (baseline **2,991 pass / 0 fail /
  192 files**; a lower pass count is a finding), `npm run typecheck`, `npm run build -w @pokemap/ui`. Known load-only
  flakes (rerun alone first): App.test "P selects Pencil", gbc/GbcAppEditing "beforeunload is registered only while
  dirty", others in LESSONS Testing chapter.
- Commit with explicit pathspecs. Task reports to `docs/superpowers/task-reports/pokemap-plan-10a2-pokemon-indicator/`.
- Delegate every implementer hop (`delegate` skill). Codex workspace-write cannot run vitest: the coordinator runs the
  gate. Reviews go to Codex read-only: Medium → `gpt-5.6-terra`, High → `gpt-6-astra` (spec and quality separate).

## Review Focus

1. Two Indicators of the same species on one map → two distinct numbered labels, no collision. (Task 1, Task 3)
2. Edit on an Indicator whose text label is also referenced by another script → Edit disabled, reason "shared text";
   nothing rewritten. (Task 1, Task 3)
3. GBC map at 15 objects → Place refused with the cap message; session unchanged. (Task 3)
4. GBC species whose name differs from its sprite spelling (e.g. `MR__MIME`) → generic sprite, never a guessed
   constant; the own-sprite set is the exact intersection of sprite constants and species constants. (Task 2)
5. Edit right after Place, then undo twice → session text equals the pre-Place text exactly. (Task 4)

---

### Task 1: GBA Indicator core (build, recognise, update) — **High** (writes subject source shape; recogniser is an error boundary)

**Files:**
- Create: `packages/core/src/indicator/gba.ts`
- Modify: `packages/core/src/edit/events.ts` (add `setObjectGraphics`)
- Delete: `packages/core/src/signs/script.ts`, `packages/core/src/signs/write.ts` (moved into `indicator/gba.ts`);
  their tests move to `packages/core/test/indicator/gba.test.ts` (tests moved, not dropped)
- Modify: `packages/core/src/signs/suggest.ts` (rename `rankSpeciesForSign` → `rankIndicatorSpecies`,
  `suggestSignPlacement` → `suggestIndicatorPlacement`; return types unchanged; update callers incl. `signs/linked.ts`)
- Modify: `packages/core/src/signs/wrap.ts` (`SIGN_WIDTH`), `packages/server/src/signRefresh.ts` (use it)
- Modify (imports only, so the gate passes before Task 4): `packages/server/src/index.ts:32-33`,
  `packages/cli/src/writeCommands.ts:7` → the new `indicator/gba.ts` names; route paths and behaviour change in Task 4
- Test: `packages/core/test/indicator/gba.test.ts`, `packages/core/test/edit/events.test.ts`

**Interfaces:**
- Produces:
  - `interface IndicatorSpecies { species: string; name: string; percent: number }` — `species` = bare constant
    (`MR__MIME`), `name` = display name (`MR.MIME`) from `gbaSpeciesNames` / `gbcSpeciesNames`. Family-neutral; no
    method field (the dialog shows only name and percent today).
  - `interface IndicatorBlock { scriptLabel: string; textLabel: string; species: string; text: string; editable: boolean; reason?: string }` (species bare uppercase, text = logical text with `\n` / blank-line paragraphs, per 10a S6 round trip)
  - `buildGbaIndicator(mapName: string, incText: string, mapScripts: string[], input: { x: number; y: number; elevation: number; species: string; paragraphs: string[][] }): { objectEvent: Record<string, unknown>; scriptLabel: string; textLabel: string; scriptAppendText: string }`
  - `findGbaIndicator(incText: string, event: { graphics_id: string; script: string }): IndicatorBlock | null` — `null` when the script block has no `playmoncry` (not an Indicator: no button); otherwise a block, `editable: false` + `reason` when the exact C3 shape, the single-reference text, or graphics/cry species agreement fails.
  - `updateGbaIndicator(incText: string, block: IndicatorBlock, species: string, paragraphs: string[][]): string` — rewrites only the `playmoncry` line and the text body; labels unchanged; identical input → identical output.
  - `gbaIndicatorGraphics(species: string): string` → `OBJ_EVENT_GFX_SPECIES(<SPECIES>)`
  - `guardGbaIndicatorWrite(root: string, mapName: string, scriptLabel: string): Refusal[]` (today's `guardSignWrite`, I1 fix text)
  - `setObjectGraphics(map: MapData, index: number, graphicsId: string): { map: MapData; jsonEdits: JsonEdit[] }` (same pattern as `moveEvent`)
- Consumes: `renderGbaBody`, `findGbaSign` body rules, `wrapSign` (Plan 10a).

- [ ] **Step 1: Write failing tests** in `gba.test.ts`:
  - `place golden`: `buildGbaIndicator("Route101", <fixture inc>, [], {x:5,y:7,elevation:0,species:"ZIGZAGOON",paragraphs:[["Zig!"]]})` → `scriptLabel === "Route101_EventScript_PokemonIndicator1"`, `objectEvent.graphics_id === "OBJ_EVENT_GFX_SPECIES(ZIGZAGOON)"`, and `scriptAppendText` equals the C3 block byte-for-byte (fixture file `test/fixtures/indicator/gba-place.inc`).
  - `numbering`: with `PokemonIndicator1` already in the inc and `PokemonIndicator2` referenced only in `mapScripts` → next is 3; same species twice → 1 then 2 (Review Focus 1).
  - `wrap`: a 60-char text renders as multiple `.string` lines with `\n`/`\l`/`\p` per `renderGbaBody`.
  - `recognise new + old`: a generated block and a legacy `_WildSign_Poliwrath` block (fixture copied from today's `generateSignScript` output) both return `editable: true`, species `POLIWRATH`, the exact text.
  - `refuse shapes`: extra script line, text label referenced twice (Review Focus 2: reason contains "shared text"), graphics `OBJ_EVENT_GFX_SPECIES(ODDISH)` with cry `SPECIES_POLIWRATH` → `editable: false` with reason; script without `playmoncry` → `null`.
  - `update`: species change rewrites only the cry line; text change only the body; no change → `===` input.
  - `events.test.ts`: `setObjectGraphics` emits one `JsonEdit` at `["object_events", i, "graphics_id"]`.
- [ ] **Step 2:** Run `npx vitest run packages/core/test/indicator packages/core/test/edit/events.test.ts` → FAIL (module missing).
  - `guards` (P7): unknown species (not in `species_names.h`) and missing `scripts.inc` → refusals naming the file.
- [ ] **Step 3:** Implement in `indicator/gba.ts`; move the existing `script.test.ts`/`write.test.ts` cases into `gba.test.ts`, updating names, the label convention and the input shape (`paragraphs` instead of `dialogue`). The newline-refusal case (`script.test.ts:57`) is replaced by the `wrap` case above (C1 removes that limit). List each changed expectation in the task report.
- [ ] **Step 4:** Run the Step 2 command → PASS. Run the full gate.
- [ ] **Step 5:** Mutation: make the recogniser accept a shared text label, and swap the numbering to species-named labels → named tests fail. Restore.
- [ ] **Step 6:** Commit `feat(core): GBA Pokémon Indicator build/recognise/update`.

### Task 2: GBC Indicator data (sprites, species, placement) — **High** (parses decomp data; independent expected lists)

**Files:**
- Create: `packages/core/src/indicator/gbcData.ts`
- Test: `packages/core/test/indicator/gbcData.test.ts`

**Interfaces:**
- Produces:
  - `loadGbcOwnSprites(root: string): Set<string>` — species constants (from `loadGbcSpeciesIds`) that have a `SPRITE_<SAME>` constant in `constants/sprite_constants.asm`; throws a located error if the file is unreadable.
  - `gbcIndicatorSprite(species: string, own: Set<string>): string`
  - `rankGbcIndicatorSpecies(proj: GbcProject, mapName: string): IndicatorSpecies[]` — `gbcEncounterSources` minus swarms, best chance per species, sorted like `linkedSpecies` (C6); `name` via `gbcSpeciesNames`. `IndicatorSpecies` from Task 1.
  - `suggestGbcIndicatorPlacement(proj: GbcProject, mapName: string): { x: number; y: number } | null` — STEP coords; grass = quadrant collision equal to `COLL_TALL_GRASS` via `parseCollisionConstants`; rule per C5 (scan order row-major, neighbours up/down/left/right, skip steps with an object_event).
- Consumes: `loadGbcSpeciesIds`, `gbcEncounterSources`, `parseCollisionConstants`, tileset collision (`gbcMapHasWaterTile` is the pattern to copy).

- [ ] **Step 1: Failing tests** against PerfPlus (`C:\Programming Projects\pokecrystal-PerfPlus`, read-only; skip-if-absent like existing GBC corpus tests):
  - `own sprites`: equals a hand-written list in the test, derived by reading PerfPlus `sprite_constants.asm` yourself (P3); includes `GEODUDE`, `SLOWPOKE`, `SNORLAX`; excludes `SENTRET`, `MONSTER`, `POKEMON`.
  - `sprite pick`: `GEODUDE` → `SPRITE_GEODUDE`; `SENTRET` → `SPRITE_MONSTER`; `MR__MIME` → `SPRITE_MONSTER` unless the list says otherwise (Review Focus 4).
  - `species Route29`: `name`s equal `linkedSpecies("gbc", proj, "Route29")` order (independent check: the 10a B3 expected list); one row asserts both `species` and `name`.
  - `names guard` (P7): a temp root without `data/pokemon/names.asm` → error naming that file.
  - `placement Route29`: result is in bounds, not `COLL_TALL_GRASS`, orthogonally next to one, no object there; a grass-free map (`NewBarkTown`) → `null` (P4).
  - `guard` (P7): a temp root without `sprite_constants.asm` → error naming that file.
- [ ] **Step 2:** `npx vitest run packages/core/test/indicator/gbcData.test.ts` → FAIL.
- [ ] **Step 3:** Implement `gbcData.ts`.
- [ ] **Step 4:** Step 2 command → PASS; full gate.
- [ ] **Step 5:** Mutation: drop the species-constant intersection (use every `SPRITE_*`) → `own sprites` fails. Restore.
- [ ] **Step 6:** Commit `feat(core): GBC Indicator sprites, species and placement`.

### Task 3: GBC Indicator source writer + recogniser + G5 case — **High** (writes subject source)

**Files:**
- Create: `packages/core/src/indicator/gbc.ts`
- Modify: `packages/core/test/gbc/write/writeGate.test.ts` (add one Place-then-undo case)
- Test: `packages/core/test/indicator/gbc.test.ts`, fixtures `packages/core/test/fixtures/indicator/gbc-*.asm` (CRLF + LF)

**Interfaces:**
- Produces:
  - `insertGbcIndicator(text: string, mapName: string, input: { x: number; y: number; species: string; sprite: string; paragraphs: string[][] }): { text: string; scriptLabel: string }` — `addGbcEvent(...,"object", [String(x), String(y), sprite, "SPRITEMOVEDATA_POKEMON", "0", "0", "-1", "-1", "0", "OBJECTTYPE_SCRIPT", "0", scriptLabel, "-1"])` then the C4 block above `<Map>_MapEvents:` via the multi-line primitive Plan 10a added (the one `insertGbcSign` uses).
  - `findGbcIndicator(text: string, event: { sprite: string; script: string }, own: Set<string>): IndicatorBlock | null` — `null` when the script block has no `cry` line; else `editable` per C4 exact shape, single-reference text, and sprite = `gbcIndicatorSprite(cry species, own)`.
  - `updateGbcIndicator(text: string, mapName: string, objectIndex: number, block: IndicatorBlock, species: string, sprite: string, paragraphs: string[][]): string` — `spliceArg` on the sprite arg, replace the `cry` line and the text body; labels and `object_const_def` untouched; identical input → identical output.
- Consumes: Task 1 `IndicatorBlock`; Task 2 `gbcIndicatorSprite`; `addGbcEvent`, `locateEventCall`, `spliceArg`, `replaceLines`, `renderGbcBody`.

- [ ] **Step 1: Failing tests:**
  - `place golden` (P2): Route29 fixture, `GEODUDE` → `SPRITE_GEODUDE`, and `SENTRET` → `SPRITE_MONSTER`; output equals expected fixture bytes, CRLF and LF variants; `object_const_def` gains `ROUTE29_GEODUDE` / `ROUTE29_MONSTER`.
  - `numbering`: two Indicators of one species → `Route29PokemonIndicator1`, `…2`.
  - `cap` (Review Focus 3): a fixture with 15 object_events → throws with the cap message.
  - `missing _MapEvents` → located refusal; `object_const_def` out of step (one const short) → `addGbcEvent`'s refusal surfaces unchanged.
  - `recognise/refuse`: generated block editable; extra line / shared text / sprite-cry mismatch → `editable: false` + reason; no `cry` → `null`.
  - `update`: species change rewrites only the sprite arg and cry line (diff of lines asserted); no change → `===`.
  - `writeGate`: Place then undo restores exact bytes on every corpus map.
- [ ] **Step 2:** `npx vitest run packages/core/test/indicator/gbc.test.ts packages/core/test/gbc/write/writeGate.test.ts` → FAIL.
- [ ] **Step 3:** Implement `indicator/gbc.ts`.
- [ ] **Step 4:** Step 2 command → PASS; full gate.
- [ ] **Step 5:** Mutation: skip the sprite/cry agreement check → `recognise/refuse` fails; emit LF into a CRLF file → golden fails. Restore.
- [ ] **Step 6:** Commit `feat(core): GBC Pokémon Indicator writer and recogniser`.

### Task 4: Server routes, both families + CLI rename — **High** (session/undo ownership; plan/commit equality)

**Files:**
- Modify: `packages/server/src/index.ts` (replace `sign/:map/suggestions` + `edit/:map/sign/add` with the C7 routes)
- Modify: `packages/server/src/gbcEditRoutes.ts` (add the same four routes for GBC)
- Modify: `packages/cli/src/index.ts`, `packages/cli/src/writeCommands.ts` (command `sign` → `indicator`, GBA only as today)
- Test: rename `packages/server/test/signRoutes.test.ts` → `indicatorRoutes.test.ts` (moved, not dropped); create
  `packages/server/test/gbcIndicatorRoutes.test.ts`; update `packages/cli/test/writeCommands.test.ts`

**Interfaces:**
- Routes (both families):
  - `GET /api/indicator/:map/suggestions` → `{ species: IndicatorSpecies[]; placement: { x: number; y: number } | null }`
  - `POST /api/edit/:map/indicator/add` body `{ x, y, elevation?, species, text }` → the family's existing event-op success body plus `scriptLabel`; 400 `{ refusals }` on wrap/charmap/guard failure.
  - `GET /api/edit/:map/indicator/at?index=<objectIndex>` → `{ indicator: IndicatorBlock | null }` (reads the session's current text, so it sees staged edits).
  - `POST /api/edit/:map/indicator/update` body `{ index, scriptLabel, species, text }` → event-op success body; 400 refusals if the block is not editable or `scriptLabel` no longer matches `index`.
- GBA add: `addEvent` + `scriptAppends` (today's path). GBA update: `setObjectGraphics` + `replaceGbaScripts(proj, session, updateGbaIndicator(effectiveGbaScripts(...), ...))`. GBC: whole-file `eventsText` edit. Each op goes through the family's existing snapshot helper (one undo step per op).

- [ ] **Step 1: Failing tests** (both route test files): suggestions shape; add stages and plan diff shows exactly the Task 1/3 bytes; add twice same species → two labels; update species → plan diff shows only graphics/sprite + cry lines; update with no change → empty plan diff for scripts; non-editable → 400 with reason; unreadable charmap (temp root) → 400 naming the file, session unchanged; any refused add/update leaves the session text and undo stack unchanged; Place → Update → undo ×2 → redo ×2, comparing the full staged source (GBA `map` + `scriptAppends` + `scriptReplaces`; GBC `eventsText`) at each step (P6, Review Focus 5); commit writes exactly the plan (read the files back); old `sign/add` route → 404.
- [ ] **Step 2:** `npx vitest run packages/server/test/indicatorRoutes.test.ts packages/server/test/gbcIndicatorRoutes.test.ts packages/cli/test/writeCommands.test.ts` → FAIL.
- [ ] **Step 3:** Implement routes and CLI rename.
- [ ] **Step 4:** Step 2 command → PASS; full gate.
- [ ] **Step 5:** Mutation: drop the snapshot before update → undo test fails. Restore.
- [ ] **Step 6:** Commit `feat(server): Pokémon Indicator routes for GBA and GBC`.

### Task 5: Dialog, toolbar, inspectors, both families — **High** (hub I/O response validation and stale-request ordering in the dialog and inspector fetches)

**Files:**
- Rename: `packages/ui/src/components/SignComposer.tsx` → `PokemonIndicatorDialog.tsx`; `packages/ui/test/SignComposer.test.tsx` → `PokemonIndicatorDialog.test.tsx`
- Modify: `packages/ui/src/components/Toolbar.tsx` (`onOpenSignComposer` → `onOpenIndicator`, I1 label), `MapEditingWorkspace.tsx`, `packages/ui/src/gba/adapter.tsx`, `packages/ui/src/gbc/adapter.tsx`, `packages/ui/src/gbc/GbcMapEditing.tsx`, `packages/ui/src/components/EventInspector.tsx`, `packages/ui/src/gbc/GbcEventInspector.tsx`, capability type, `packages/ui/src/hooks/useEditSession.ts` / `packages/ui/src/gbc/hooks/useGbcEditSession.ts` as needed
- Test: the renamed dialog test, `Toolbar.test.tsx`, `gbc/ToolbarGbc.test.tsx`, `MapEditingWorkspace*.test.tsx`, `AppEditingWiring.test.tsx`, a new `test/indicatorStrings.test.ts`

**Interfaces:**
- `PokemonIndicatorDialog` props: `{ mapName: string; edit?: { index: number; block: IndicatorBlock }; onDone: (scriptLabel: string, payload: unknown) => void; onCancel: () => void }`. Family-neutral: it only calls the C7 routes; each adapter turns `payload` into its own session update. Edit mode hides X/Y, prefills species and text, submit "Update".
- Inspectors: when the selected object event is non-null under `GET indicator/at`, show **Edit Indicator** (disabled with `reason` as its title/visible note when `editable: false`).

- [ ] **Step 1: Failing tests:** toolbar shows "Pokémon Indicator" in both families when `pokemonIndicator` is true and nothing when false; dialog Place posts `indicator/add` with `{x,y,species,text}`; refusal list renders; Edit mode posts `indicator/update` and hides X/Y; both inspectors show Edit Indicator for an Indicator, disabled with reason for a non-editable one, absent for a plain NPC; selecting event A then B quickly with A's `indicator/at` resolving last → the inspector shows B's state (stale response ignored, the pattern `SignComposer.tsx:79` already uses); a malformed `indicator/at` or `add` body → error text, no crash (keep the existing response type guards); `indicatorStrings.test.ts` greps `packages/ui/src` for `Wild Sign` / `Add Sign` / `wild sign` → none (P1), and asserts the Sign tool's "Sign (G)" tooltip still exists.
- [ ] **Step 2:** `npx vitest run packages/ui/test/PokemonIndicatorDialog.test.tsx packages/ui/test/indicatorStrings.test.ts packages/ui/test/Toolbar.test.tsx packages/ui/test/gbc/ToolbarGbc.test.tsx` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Step 2 command → PASS; full gate (typecheck + UI build included).
- [ ] **Step 5:** Commit `feat(ui): Pokémon Indicator dialog and Edit Indicator in both families`.

### Task 6: Live acceptance, both families — **High** (evidence for P8)

- [ ] Hub on 5184 via preload, Vite 5183, headless Chromium (LESSONS Live chapter). Manifests to absolute paths outside the subject. Record subject baselines first (RESUME "External baselines"; GBA subject has 8 user porcelain lines: leave them, restore anything written byte-identically).
- [ ] Per family: open a grassy route, Pokémon Indicator → Place (GBC: one own-sprite and one generic species), drag it to a new tile, Edit Indicator → change species and text, Save → files changed exactly as the diff showed; unrelated file hashes unchanged; restart the hub, reload: Indicator at the dragged position with the new sprite (GBC: `.asm` re-parses with the app's loader). Watch for sprite VRAM glitches (spec known limit).
- [ ] Restore the subjects byte-identically; re-measure baselines. Report to `task-reports/pokemap-plan-10a2-pokemon-indicator/task-6-live.md`.

### Task 7: Docs — **Low** (text only)

- [ ] RESUME status row + gate numbers; roadmap Plan 10 line "10a2 done"; `packages/ui/DESIGN.md` mention of the dialog name if present; LESSONS only for a new trap found. Commit with explicit pathspecs.
