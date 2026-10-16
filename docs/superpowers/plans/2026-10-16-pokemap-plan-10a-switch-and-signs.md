# Plan 10a: save-or-discard on switch + Sign tool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save/Discard/Cancel prompt on map switch (both families, discard waits for queued strokes), and a Sign toolbar
tool (both families) that places and edits readable signs with free or linked text kept current at save time.

**Architecture:** Pure core modules do the text work (charmap, wrap, marker/hash, per-family sign block read/write,
linked-text generators). Server routes stage sign edits into the existing server-side edit sessions (undoable via the
existing snapshot commands) and refresh linked signs when a plan is built. UI adds one shared switch prompt, one
`sign` tool kind, one sign editor popover, and a "Linked signs" notice in the Save dialog.

**Tech Stack:** TypeScript, React, Vitest (run from repo root), Node server (`packages/server`).

**Spec:** `docs/superpowers/specs/2026-10-16-pokemap-plan-10a-switch-and-signs-design.md` (rulings R1-R7, S1-S10,
S9a; acceptance A1-A7, B1-B9). Read it first; this plan cites rulings by id instead of repeating them.

## Global Constraints

- Nothing reaches disk except through the Save dialog's commit; commit writes exactly what the plan showed.
- No git dependency anywhere (baselines and hashes are in-tool).
- Never rewrite a sign body whose hash differs from its baseline (S7). Never touch a sign nobody opened (B6).
- Preserve each file's line endings (CRLF/LF), final-newline state and tab indentation byte-for-byte.
- Labels: GBC `<Map>PokemapSign<N>` / `<Map>PokemapSign<N>Text`; GBA `<Map>_EventScript_PokemapSign<N>` /
  `<Map>_Text_PokemapSign<N>`. Marker: GBC `; pokemap:sign <mode> <hash>`, GBA `@ pokemap:sign <mode> <hash>`,
  `<mode>` ∈ `free|name|species`.
- GBC: 18 chars/line, 2 lines/box. GBA: `GBA_SIGN_WIDTH = 36` chars/line (`ponytail:` char-count approximation of the
  proportional font; upgrade = per-glyph widths from the font table).
- Shortcut **G** = Sign tool; tooltip "Sign (G)". Capability `signTool: true` for both families.
- Vitest from repo root only; no jest-dom. Gate: `npm test > <scratch>/run.txt 2>&1` (baseline 2,837 pass / 0 fail /
  181 files; a lower pass count is a finding), `npm run typecheck`, `npm run build -w @pokemap/ui`.
- Commit with explicit pathspecs. Task reports to `docs/superpowers/task-reports/pokemap-plan-10a-switch-and-signs/`.

## Spec corrections made while planning (already applied to the spec)

- B3 GBC name: `landmarks.asm` has `NewBarkTownName: db "NEW BARK<BSP>TOWN@"`. `<BSP>` (breakable space) becomes a
  space in sign text → expected `NEW BARK TOWN`.
- S6 round trip, simplified: if the edited logical text equals the parsed logical text, the body bytes are kept as-is
  (only the marker is added); otherwise the body is rendered fresh per S3. Per-position `line`/`cont` preservation is
  dropped (YAGNI; unchanged text already round-trips exactly).

## Review Focus

1. A sign text label referenced by two scripts (shared text) → editor read-only "shared text"; never rewritten. (Task 3/4)
2. A file with CRLF endings and no final newline → inserted sign block uses CRLF; final-newline state unchanged. (Task 3)
3. Discard clicked while a paint stroke's `apply` is still in flight → discard request sent only after it settles. (Task 1)
4. Undo right after Place, then Save → no sign in the plan, `<N>` reusable. (Task 6)
5. Linked species on a map with no wild data → `No wild POKEMON here.` in both families (plain, charmap-safe; replaces
   the spec's `POKéMON`). (Task 5)

---

### Task 1: Save/Discard/Cancel switch prompt (D1) — **High** (save/discard ownership, async ordering)

**Files:**
- Create: `packages/ui/src/shared/SwitchPromptDialog.tsx`
- Modify: `packages/ui/src/gba/adapter.tsx:15,53-56` (drop `GUARD_TEXT`/`window.confirm`), `packages/ui/src/gbc/adapter.tsx:60-63`,
  `packages/ui/src/shell/adapter.ts` (`FamilyRuntime.leave` stays; add `pendingSwitch` plumbing only if needed),
  `packages/ui/src/shell/FamilyApp.tsx:50-70,230-235`
- Test: `packages/ui/test/shared/SwitchPromptDialog.test.tsx`, `packages/ui/test/shell/switchPrompt.test.tsx`

**Interfaces:**
- Produces: `SwitchPromptDialog({ mapName, busy, onSave, onDiscard, onCancel }): JSX` (`role="dialog"`,
  `aria-modal="true"`, text `You have unsaved changes on ${mapName}.`, buttons Save/Discard/Cancel, Cancel autofocus,
  Escape = onCancel, all buttons disabled while `busy`).
- Produces in FamilyApp: one `pendingSwitch: { go: () => void } | null` state. `runtime.leave(go, {sameMap})` in both
  adapters becomes: `if (sameMap || !session.isDirty) go(); else requestPrompt(go)`, where `requestPrompt` is passed
  in by FamilyApp (ignored while a prompt is already open, R6).
- Save (R3): sets `saveAfterSwitch = go`, opens the Save dialog; FamilyApp's `onCommitted` path runs `go` after the
  existing calls; Save-dialog cancel clears it.
- Discard (R4): `strokeSettled().then(() => session.discard()).then(go, (e) => setSwitchError(msg))`. GBA gains
  `setSwitchError` + banner the same way GBC has it (move the banner to the shared shell if both need it).

- [ ] **Step 1: Write failing tests** (both families via the existing FamilyApp/adapter test harnesses, e.g.
  `test/gbc/GbcAppEditing.test.tsx` and `test/AppEditingWiring.test.tsx` patterns):
  - `prompts on dirty switch; Cancel keeps map and sends no request` (A1): fetch spy has no `/discard` call; selected
    map unchanged.
  - `discard waits for queued stroke link` (A2): hold a stroke link's promise via a registered `SettledChain` whose
    `settled()` returns a deferred; click Discard; assert no `/discard` fetch; resolve; assert `/discard` fetched once,
    then the selection is the target. Run for GBA and GBC.
  - `save path switches only after commit` (A3): Save opens the Save dialog; dialog cancel → still on map, still dirty;
    commit → selection is target.
  - `discard failure shows switchError and stays` (A4).
  - `no prompt when clean or same map` (A5).
  - `second switch while prompt open is ignored` (R6).
- [ ] **Step 2:** `npx vitest run packages/ui/test/shared/SwitchPromptDialog.test.tsx packages/ui/test/shell/switchPrompt.test.tsx` → FAIL (module missing).
- [ ] **Step 3:** Implement per Interfaces. Update every existing test that stubbed `window.confirm` for the switch
  guard to drive the dialog instead (tests are moved, not dropped).
- [ ] **Step 4:** same command → PASS; then full gate.
- [ ] **Step 5: Mutation (A7):** remove the `strokeSettled()` wait → A2 fails; make GBA `leave` skip `session.discard()`
  → A2 (GBA) fails. Restore; record both in the task report.
- [ ] **Step 6: Commit** `feat(ui): save-or-discard prompt on map switch (D1)`.

### Task 2: Charmap and wrap — **High** (parses decomp source; hand-derived fixtures)

**Files:**
- Create: `packages/core/src/signs/charmap.ts`, `packages/core/src/signs/wrap.ts`
- Test: `packages/core/test/signs/charmap.test.ts`, `packages/core/test/signs/wrap.test.ts`

**Interfaces:**
- `interface Charmap { family: "gba" | "gbc"; has(token: string): boolean; widthOf(token: string): number }`
- `parseGbcCharmap(text: string): Charmap` — every `charmap "<x>", $nn` entry. Width: single printable char 1;
  `<BSP>` 1; `<PLAYER>`/`<RIVAL>` 7 (max name length); other `<...>` tokens 1 unless listed in a small
  `GBC_TOKEN_WIDTHS` table in the file (`<PK>` 1, `<MN>` 1, `<PKMN>` 2, …); control tokens (`@`, `<LF>`, `<PARA>`,
  `<LINE>`, `<CONT>`, `<DONE>`, `<PROMPT>`) are not allowed in user text (`has` → false).
- `parseGbaCharmap(text: string): Charmap` — `charmap.txt` lines `'c' = XX`, `NAME = XX ...`. Tokens appear in text
  as `{NAME}`; `{PLAYER}` 7, `{RIVAL}` 7, others 1. `$`, `\n`, `\l`, `\p` are not user characters.
- `tokenize(line: string, cm: Charmap): { tokens: string[] } | { refusal: string }` — GBC `<...>`, GBA `{...}`, else
  one char; refusal text `Character "${c}" is not in the charmap.` / `Unknown token ${t}.`; `"` always refused.
- `wrapSign(input: string, cm: Charmap, width: number): { paragraphs: string[][] } | { refusal: string }` — input
  lines split on `\n`; blank line = paragraph break; each input line kept as-is if its width ≤ `width`, else greedy
  word-wrapped at spaces; a single word wider than `width` → refusal `"${word}" is longer than one line (${width}).`

- [ ] **Step 1: Tests** (load real files from the subject roots via the same corpus-path helper other core tests use;
  skip like them when absent):
  - GBC charmap: `has("A")`, `has("<PLAYER>")`, `!has("@")`, `widthOf("<PLAYER>") === 7`, `has("<BSP>")`.
  - GBA charmap: `has("{UP_ARROW}")`, `has("{PLAYER}")`, `widthOf("{PLAYER}") === 7`.
  - wrap 18: `"CHERRYGROVE CITY - NEW BARK TOWN"` → `[["CHERRYGROVE CITY -", "NEW BARK TOWN"]]`;
    `"ROUTE 29\n\nCHERRYGROVE CITY -\nNEW BARK TOWN"` → `[["ROUTE 29"], ["CHERRYGROVE CITY -", "NEW BARK TOWN"]]`;
    `"ABCDEFGHIJKLMNOPQRS"` (19) → refusal containing `longer than one line (18)`; `"A\"B"` → refusal; GBC `"A~B"`
    (if `~` absent from charmap) → refusal naming `~`.
  - wrap counts `<PLAYER>` as 7: `"HI <PLAYER> HOW ARE YOU"` at 18 → `["HI <PLAYER>", "HOW ARE YOU"]`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS.
- [ ] **Step 5: Mutation (B9):** width 18→19 makes the 19-char refusal test fail; record.
- [ ] **Step 6: Commit** `feat(core): sign charmap + wrap`.

### Task 3: Marker + GBC sign block read/write + G5 sign case — **High** (writes subject source)

**Files:**
- Create: `packages/core/src/signs/marker.ts`, `packages/core/src/gbc/signs.ts`
- Modify: `packages/core/src/gbc/write/asmSplice.ts` (add `replaceLines`, leave `insertLineAfter` unchanged)
- Test: `packages/core/test/signs/marker.test.ts`, `packages/core/test/gbc/signs.test.ts`,
  `packages/core/test/gbc/write/writeGate.test.ts` (add a case; do not edit existing cases)

**Interfaces:**
- `marker.ts`: `type SignMode = "free" | "name" | "species"`; `signHash(body: string): string` (8 hex chars, FNV-1a
  32-bit over the body with line endings normalised to `\n`); `formatMarker(family, mode, hash): string`;
  `parseMarker(line: string): { mode: SignMode; hash: string } | null` (accepts both `;` and `@` prefixes).
- `asmSplice.ts`: `replaceLines(text: string, startLine: number, endLineExclusive: number, lines: string[]): string`
  — 0-based line indices; joins `lines` with the file's own EOL (detected from the first line ending; LF if none);
  keeps final-newline state; `lines` may be empty (delete).
- `gbc/signs.ts`:
  - `interface SignBlock { scriptLabel: string; textLabel: string | null; editable: boolean; reason: string | null;
    marker: { mode: SignMode; hash: string } | null; bodyStart: number; bodyEnd: number; body: string;
    paragraphs: string[][] }` (`bodyStart..bodyEnd` = lines after the text label through `done`, 0-based, exclusive end).
  - `findGbcSign(text: string, scriptLabel: string): SignBlock` — editable only for `<scriptLabel>:` followed by one
    `jumptext X` line, `X:` in the same file, X referenced exactly once (`jumptext X`/`writetext X`/`text_far X` count),
    body lines only `text`/`line`/`cont`/`para` with a string, then `done`. Reasons (exact strings): `script is not a
    single jumptext`, `text label not found in this file`, `shared text`, `unsupported text command <cmd>`.
  - `renderGbcBody(paragraphs: string[][]): string[]` — first line `\ttext "…"`, second line of a paragraph
    `\tline "…"`, further `\tcont "…"`, new paragraph = empty line then `\tpara "…"`, last `\tdone`.
  - `nextGbcSignNumber(text: string, mapName: string): number` — lowest N ≥ 1 with no `<Map>PokemapSign<N>:` label.
  - `insertGbcSign(text, mapName, n, mode, paragraphs): string` — inserts the S8 block plus one blank line directly
    above `<Map>_MapEvents:`; throws `missing <Map>_MapEvents: label` when absent. The bg_event line itself is added
    by the existing `addGbcEvent` (Task 6 calls both).
  - `updateGbcSign(text, block: SignBlock, mode, paragraphs, opts: { force: boolean }): string` — if
    `signHash(block.body) !== baselineHash` and `!force` → throws `hand-edited`. Baseline = marker hash when marked,
    else caller-supplied session-open body hash (Task 6 passes it). Keeps body bytes when `paragraphs` equals
    `block.paragraphs`; always writes/updates the marker line directly above the text label.

- [ ] **Step 1: Tests:**
  - marker: `parseMarker("; pokemap:sign name 1a2b3c4d")` → `{mode:"name",hash:"1a2b3c4d"}`; `@` variant; junk → null;
    `signHash("a\r\nb") === signHash("a\nb")`.
  - `findGbcSign(Route29.asm, "Route29Sign1")` → editable, `paragraphs === [["ROUTE 29"], ["CHERRYGROVE CITY -", "NEW BARK TOWN"]]`.
  - a shared-text fixture (two scripts `jumptext SameText`) → `reason === "shared text"`.
  - a real complex sign from PerfPlus (pick one `bg_event` whose script uses `opentext` / `jumpstd`) → not editable,
    reason starts `script is not a single jumptext`.
  - golden B1: inline fixture map (`Tiny.asm`, LF) + `insertGbcSign(..., 1, "free", [["HELLO"]])` equals the
    expected string exactly; same fixture with CRLF and no final newline → CRLF block, no final newline.
  - update unchanged text on Route29Sign1 → only difference is the inserted marker line.
  - hand edit: change one char in a marked body → throws `hand-edited`; `force:true` → rewritten.
  - G5: for every map in every corpus root (existing writeGate loop), `insertGbcSign` + `addGbcEvent` then undoing
    both (restore the original text) yields the original bytes; and the edited text re-parses with
    `parseMapEvents` with one more bg event.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS (G5 included).
- [ ] **Step 5: Mutation (B9):** skip the hash comparison → hand-edit test fails; break `parseMarker` prefix → marker
  test fails. Record.
- [ ] **Step 6: Commit** `feat(core): GBC sign blocks + marker`.

### Task 4: GBA sign blocks in scripts.inc + session replace — **High** (writes subject source; session snapshots)

**Files:**
- Create: `packages/core/src/signs/gbaSign.ts`
- Modify: `packages/core/src/write/save.ts` (`EditSession.scriptReplaces?`, plan + commit),
  `packages/server/src/editSessions.ts` (`Snapshot.scriptReplaces`, `snapshotOf`)
- Test: `packages/core/test/signs/gbaSign.test.ts`, `packages/core/test/write/saveScriptReplace.test.ts`

**Interfaces:**
- `gbaSign.ts`: same `SignBlock` shape as Task 3 (import the type from `gbc/signs.ts` or move it to `signs/marker.ts`;
  one definition). `findGbaSign(incText: string, scriptLabel: string): SignBlock` — editable only for
  `<label>::` + `msgbox X, MSGBOX_SIGN` + `end`; `X:` in the same file referenced once; body = `.string "…"` lines
  through the one ending `$"`. Paragraph/line mapping: `\p` ends a paragraph, `\n`/`\l` end a line, `$` ends the text.
  `renderGbaBody(paragraphs): string[]` — one `\t.string "…"` line per text line, with `\n` after line 1 of a
  paragraph, `\l` after later lines, `\p` between paragraphs, final `$`. `gbaSignScript(mapName, n): string[]` and
  `gbaSignText(mapName, n, mode, paragraphs): string[]` (S9 shapes); `nextGbaSignNumber(incText, mapName)`;
  `updateGbaSign(incText, block, mode, paragraphs, opts)` mirrors Task 3.
- `save.ts`: `interface ScriptReplace { path: string; before: string; after: string }` — whole-file text before and
  after. `planSave` adds one `kind: "text"` change per path (summary `Update sign text in scripts.inc`); refuses
  (`code: "script-changed-on-disk"`) when the file on disk no longer equals `before`. `commitSave` writes `after`.
  Appends (`scriptAppends`) for the same path apply after the replace.

- [ ] **Step 1: Tests:**
  - `findGbaSign(Route101/scripts.inc, "Route101_EventScript_RouteSign")` → editable, paragraphs
    `[["ROUTE 101", "{UP_ARROW} OLDALE TOWN"]]`.
  - render round trip: `renderGbaBody([["ROUTE 101", "{UP_ARROW} OLDALE TOWN"]])` equals
    `["\t.string \"ROUTE 101\\n\"", "\t.string \"{UP_ARROW} OLDALE TOWN$\""]`.
  - non-sign msgbox (`MSGBOX_NPC`) → reason `script is not a single msgbox sign`.
  - planSave with a `ScriptReplace` on a temp copy → one text change; file changed on disk before commit → refusal
    `script-changed-on-disk`; commit writes `after` byte-exact (CRLF fixture too).
  - snapshot/undo: `snapshotOf` carries `scriptReplaces`; undo restores the previous array.
- [ ] **Step 2-4:** FAIL → implement → PASS. **Step 5: Mutation:** drop the on-disk check → refusal test fails.
- [ ] **Step 6: Commit** `feat(core): GBA sign blocks + scriptReplaces`.

### Task 5: Linked text — names and species — **High** (parses decomp data; independent expected lists)

**Files:**
- Create: `packages/core/src/signs/linked.ts`
- Test: `packages/core/test/signs/linked.test.ts`

**Interfaces:**
- `gbaMapDisplayName(proj: Project, map: MapData): string` — `regionMapSection` → `[MAPSEC_X] = {…, sMapName_Y}` →
  `static const u8 sMapName_Y[] = _("…");` in `src/data/region_map/region_map_entries.h` (via
  `proj.paths.regionMapDir`). Throws a located error if not found.
- `gbcMapDisplayName(root: string, map: GbcMap): string` — `map.landmark` → index in
  `constants/landmark_constants.asm` (`const_def` + `const` order) → same index in `data/maps/landmarks.asm`'s
  `landmark x, y, Label` lines → `Label: db "…@"`; `<BSP>` → space, trailing `@` dropped.
- `gbaSpeciesNames(proj): Map<string, string>` (`SPECIES_X` → display name from `src/data/text/species_names.h`
  `[SPECIES_X] = _("Name")`), `gbcSpeciesNames(root): Map<string, string>` (`data/pokemon/names.asm` order joined with
  `loadGbcSpeciesIds`).
- `linkedSpecies(family, …): string[]` — GBA from `rankSpeciesForSign` (already deduped, best chance); GBC from
  `wildForMap` excluding swarm tables, dedupe keeping max chance across slots/times, sort by chance desc then name.
- `linkedText(mode: "name" | "species", name: string, species: string[]): string` — `name` → `name`;
  `species` → `${name}\n\n${species.join(", ")}`, or `${name}\n\nNo wild POKEMON here.` when empty.

- [ ] **Step 1: Tests:** `gbaMapDisplayName(Route101) === "ROUTE 101"`; `gbcMapDisplayName(NewBarkTown) === "NEW BARK TOWN"`;
  `gbcMapDisplayName(Route29) === "ROUTE 29"`. Species: write the expected Route 29 (GBC) and Route 101 (GBA) lists by
  reading `data/wild/johto_grass.asm` and `src/data/wild_encounters.json` by hand **before** implementing, and pin
  them as literal arrays (B3). Empty case → `No wild POKEMON here.`.
- [ ] **Step 2-4:** FAIL → implement → PASS. **Step 5: Mutation:** drop the `<BSP>` mapping → NewBarkTown test fails.
- [ ] **Step 6: Commit** `feat(core): linked sign text (names, species)`.

### Task 6: Server sign routes + refresh on plan — **High** (save ownership; plan/commit equality)

**Files:**
- Modify: `packages/server/src/index.ts` (GBA routes beside `/sign/add`), `packages/server/src/gbcEditRoutes.ts`
- Create: `packages/server/src/signRefresh.ts` (both families' refresh)
- Test: `packages/server/test/signRoutes.test.ts`, `packages/server/test/gbcSignRoutes.test.ts`

**Interfaces (both families, same wire shapes):**
- `GET /api/edit/:map/sign/at?x=&y=` → `{ kind: "empty" } | { kind: "other", eventKind: string } |
  { kind: "sign", scriptLabel, editable, reason, mode: SignMode | null, text: string, handEdited: boolean }`
  (`text` = paragraphs joined: lines `\n`, paragraphs `\n\n`; `mode` null for an unadopted original).
- `POST /api/edit/:map/sign/put` body `{ x, y, mode, text, scriptLabel?: string, force?: boolean }` → `{ map/events,
  isDirty }` like the event routes, or `{ refusals }` (wrap refusals, `hand-edited`, label errors). New sign = event
  add + block insert in ONE snapshot command (`"place sign"`); update = one command (`"update sign"`). Linked modes
  ignore `text` and generate it (Task 5).
- `POST /api/edit/:map/sign/resolve` body `{ scriptLabel, action: "refresh" | "unlink" }` → one undoable command.
- Session-open baselines: on session open, record `signHash(body)` for every sign block in the map's file
  (`Map<scriptLabel, hash>` on the session entry) — the S6 pre-adoption baseline.
- `signRefresh.ts`: `refreshLinkedSigns(entry): { session': …; notices: { scriptLabel: string; message: string }[] }`
  — pure over a copy; for every marked `name`/`species` sign regenerate; unchanged → no edit; hand-edited → skipped +
  notice `${scriptLabel} was edited outside PokeMap and was not refreshed.` Both plan routes call it and return
  `{ changes, refusals, signNotices }`; both commit routes call it again on the same session and commit that result
  (deterministic, so commit = plan; a test asserts equality of planned vs written bytes).

- [ ] **Step 1: Tests** (temp copies of the subject roots, as existing server route tests do):
  - place free sign on GBC Route29 empty tile → plan shows `.asm` change; commit; file equals expected fixture text.
  - same for GBA Route101 → `map.json` + `scripts.inc` changes.
  - `sign/at` on Route29Sign1 tile → `editable:true`, text `ROUTE 29\n\nCHERRYGROVE CITY -\nNEW BARK TOWN`.
  - undo after place → plan has no changes; next place reuses N=1 (Review Focus 4).
  - refresh B4: place `name` sign, commit; edit landmark/region-map string in the temp copy; open+plan → one change
    (body + marker hash); unchanged data → zero changes.
  - hand edit B5: alter body on disk after commit; plan → `signNotices` has it, commit leaves those bytes; `resolve
    refresh` → body rewritten in plan; `resolve unlink` → marker `free`, body kept.
  - B6: commit after only painting → no sign bytes changed (hash all sign blocks before/after).
  - discard after place → files byte-identical to before (hash).
- [ ] **Step 2-4:** FAIL → implement → PASS.
- [ ] **Step 5: Mutation:** commit path skips refresh → plan≠written test fails; refresh ignores hash → B5 fails.
- [ ] **Step 6: Commit** `feat(server): sign routes + linked refresh`.

### Task 7: Sign tool + editor popover + Save dialog notice — **Medium** (UI over tested API; wrong wiring fails tests)

**Files:**
- Modify: `packages/ui/src/components/Toolbar.tsx` (`ToolKind` += `"sign"`, `TOOL_KEY.sign = "G"`, label "Sign"),
  `packages/ui/src/components/toolIcons.tsx` (sign icon), `packages/ui/src/shell/adapter.ts` (`signTool` capability,
  `ALL_TOOLS`, `toolsFor`), `MapCanvas.tsx` + `gbc/GbcMapCanvas.tsx` (`onSignPick?: (x: number, y: number,
  anchor: DOMRect) => void` fired on mousedown when the active tool is `sign`; no paint),
  `packages/ui/src/components/SaveDialog.tsx` (render `signNotices` with Refresh/Unlink buttons that POST
  `sign/resolve` then re-fetch the plan; `isDiffPlan` treats `signNotices` as optional)
- Create: `packages/ui/src/shared/SignEditor.tsx`
- Test: `packages/ui/test/shared/SignEditor.test.tsx`, additions to `Toolbar.test.tsx`, `SaveDialog` tests

**Interfaces:**
- `SignEditor({ mapName, x, y, anchor, onDone, onCancel, onSessionUpdated })` — fetches `sign/at`; renders per S1/S2:
  empty → mode radios + textarea + preview + Place; sign editable → Update; `handEdited` → Overwrite / Free text
  buttons (`force:true` / mode `free`); not editable → `This sign's script is too complex to edit here: ${reason}`;
  other → `This tile already has a ${eventKind} event`. Preview renders the wrapped pages (client calls nothing extra:
  the server's refusal is authoritative; preview uses a simple width split for display only).
- [ ] **Step 1: Tests:** G selects Sign; clicking a tile with Sign opens the editor at that tile; each S1 branch text;
  Place POSTs `sign/put` with `{x,y,mode,text}`; refusal shown and editor stays open; Escape closes; Save dialog
  renders notices and Refresh POSTs `sign/resolve` then refetches `plan`.
- [ ] **Step 2-4:** FAIL → implement → PASS; gate; update `packages/ui/DESIGN.md` (Sign tool + editor + notice).
- [ ] **Step 5: Commit** `feat(ui): Sign tool, editor, save notice`.

### Task 8: Live acceptance, both families — **High** (evidence for D1 + B8)

Live per RESUME/LESSONS recipe (hub 5184 with preload, Vite 5183, headless Chromium). Before/after hashes of
porcelain + touched files. GBA project has the user's uncommitted changes: leave them; only the temp/sign files this
test touches may change, and the test restores them (discard or revert via the app) at the end.
- [ ] A6 both families: paint → switch → Discard → hashes equal pre-edit. Paint → switch → Save → files equal the diff.
- [ ] B8 both families: place a `name` sign, Save, diff matches, re-load map in app shows the bg event; GBC `.asm`
  re-parses. Then remove it again (undo before save, or hand-restore from the recorded bytes) so the subject ends
  byte-identical to the start; record hashes.
- [ ] Report `task-reports/pokemap-plan-10a-switch-and-signs/task-8-live.md` with screenshots.

### Task 9: Docs — **Low** (text only)

- [ ] RESUME "Unified UI" row + Git state. LESSONS: anything new. Commit `docs: Plan 10a status`.
