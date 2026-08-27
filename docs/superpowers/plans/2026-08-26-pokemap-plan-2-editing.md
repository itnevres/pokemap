# PokeMap Plan 2 — Painting, Events, and Wild Sign Authoring

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Read [Plan 0](2026-08-26-pokemap-plan-0-roadmap.md) first — invariants I1–I8 bind every task.
>
> **RE-GRANULARISE BEFORE EXECUTING.** This plan is written to task level against APIs Plan 1 builds. Before starting, re-read it against the code Plan 1 actually produced and expand each task into the same step shape Plan 1 uses (failing test → run it → implement → run it → commit). Plan 0 §1 explains why this is stated rather than faked.

**Goal:** Give PokeMap its first write path — tile painting, collision and elevation, event editing, and wild sign authoring — without ever rewriting a file's schema.

**Architecture:** All writes funnel through one `save()` in `packages/core/src/write/save.ts`. Nothing else in the codebase calls `writeFile` on a decomp path. Every save is guarded, diff-previewed and user-initiated.

**Tech Stack:** As Plan 1. New: a command-pattern undo stack in `core`, no new dependencies.

**Success criteria — demonstrated, not asserted:**
1. Paint a tile in `NewBarkTown` (hns/640) and in `PetalburgCity` (emerald/512), save both, and confirm `git diff` in the decomp shows **only** the two `map.bin` files, changed by exactly the bytes painted.
2. The 5-engine identity corpus test still passes at zero bytes changed.
3. Add a wild sign to a map, build the ROM, and see the Pokémon standing there.
4. Attempting to save a layout with no `layout_version` is refused, by name, with the fix.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/core/src/write/save.ts` | The single write funnel. Guards, then writes. |
| `packages/core/src/write/guards.ts` | Refusals: missing `layout_version`, out-of-range metatile, warp collision |
| `packages/core/src/write/binary.ts` | `map.bin` / `border.bin` writing, change-detected |
| `packages/core/src/write/jsonArray.ts` | Explicit array insert/remove for `jsonEdit` |
| `packages/core/src/write/diff.ts` | What a pending save would change, before it happens |
| `packages/core/src/edit/commands.ts` | Command pattern + undo/redo stack |
| `packages/core/src/edit/paint.ts` | Pencil, bucket, dropper, rect, shift |
| `packages/core/src/edit/events.ts` | Add/move/delete object, warp, coord, bg events |
| `packages/core/src/signs/suggest.ts` | Species ranking and edge position suggestion |
| `packages/core/src/signs/script.ts` | Templated `scripts.inc` generation |
| `packages/core/src/signs/write.ts` | The sign write path, with guardrails |
| `packages/ui/src/components/MetatilePalette.tsx` | Tile picker |
| `packages/ui/src/components/Toolbar.tsx` | Tool selection, undo/redo, save |
| `packages/ui/src/components/SaveDialog.tsx` | Diff preview and confirm |
| `packages/ui/src/components/EventInspector.tsx` | Event property editing |
| `packages/ui/src/components/SignComposer.tsx` | Wild sign authoring flow |

---

## Task 1: Save guards

The refusals from spec §7. Written first, because everything after it depends on being unable to do damage.

**Files:** Create `packages/core/src/write/guards.ts`, `packages/core/test/write/guards.test.ts`

**Interface:**

```ts
export type Refusal = { code: string; message: string; fix: string; subject: string };

/** Returns refusals. An empty array means the save may proceed. */
export function guardLayoutSave(proj: Project, layoutName: string, blocks: Block[]): Refusal[];
export function guardMapSave(proj: Project, mapName: string, next: MapData): Refusal[];
```

**Required refusals, each with its own test:**

| Code | Condition | Fix text |
|---|---|---|
| `missing-layout-version` | `profile.supportsLayoutVersion` and the layout has no `layout_version` | "Run `python tools/donors/classify_layout_versions.py --write`, then reopen." |
| `metatile-out-of-range` | Any block's id fails `validateMetatileRange` for this layout's split | Names the ids and both tileset counts. |
| `border-size-mismatch` | Border block count ≠ `borderWidth * borderHeight` | Names the expected dimensions from `layouts.json`. |
| `warp-tile-moved` | A block under an existing warp event changed *and* the warp was not moved with it | Names the warp and its destination. |

The last one is `docs/human-porymap.md`'s standing rule — moving art out from under a warp silently unpairs it — turned into something the tool enforces instead of something you must remember.

**Key test:**

```ts
it("refuses to save a layout with no layout_version on an engine that supports it", () => {
  const r = guardLayoutSave(projWithoutVersion, "SomeLayout", blocks);
  expect(r.map((x) => x.code)).toContain("missing-layout-version");
  expect(r[0]!.fix).toMatch(/classify_layout_versions/);
});

it("refuses a block whose id is out of range for THIS layout's split", () => {
  // id 600 is legal on an hns layout and illegal on an emerald one.
  expect(guardLayoutSave(proj, emeraldLayout, [{ metatileId: 600, collision: 0, elevation: 3 }])
    .map((x) => x.code)).toContain("metatile-out-of-range");
  expect(guardLayoutSave(proj, hnsLayout, [{ metatileId: 600, collision: 0, elevation: 3 }]))
    .toEqual([]);
});
```

That second test is the whole thesis of the project expressed as an assertion.

---

## Task 2: Binary writing with change detection

**Files:** Create `packages/core/src/write/binary.ts`, `packages/core/test/write/binary.test.ts`

**Interface:**

```ts
export interface BinaryWrite { path: string; bytes: Buffer; changedBlocks: number[] }
/** Returns null when nothing changed — the file is then never touched. */
export function planBlockdataWrite(proj: Project, layoutName: string, blocks: Block[]): BinaryWrite | null;
```

Uses `encodeBlocks` from Plan 1 Task 11, whose exact-inverse property is already tested. Compares against the bytes currently on disk and returns `null` on equality, so opening a map and saving it without edits produces no write at all.

**Key tests:**
- Unchanged blocks → `null`.
- One changed block → a write whose `changedBlocks` is `[index]` and whose bytes differ from disk in exactly 2 bytes.
- Round-trip: `planBlockdataWrite(parseBlocks(disk))` is `null` for all 1,026 layouts. This is the binary half of invariant **I5**.

---

## Task 3: Explicit array insert and remove

Plan 1's `jsonEdit` deliberately refuses to add anything. Adding an object event is a real need, so it becomes its own named operation rather than a relaxation of the rule.

**Files:** Create `packages/core/src/write/jsonArray.ts`, `packages/core/test/write/jsonArray.test.ts`

**Interface:**

```ts
export function insertArrayElement(src: string, path: JsonPath, index: number, value: unknown): string;
export function removeArrayElement(src: string, path: JsonPath, index: number): string;
```

**Requirements, each tested:**
- Matches the surrounding indentation, detected from the existing elements — a new object event indents like its neighbours.
- Preserves the file's line endings.
- Inserting then removing the same element returns the original bytes exactly.
- Inserting into `[]` produces valid JSON with the file's own formatting.
- Never reorders or reformats sibling elements.

**The gate test:**

```ts
it("insert then remove is the identity across every real map.json", () => {
  for (const name of proj.mapNames()) {
    const src = readFileSync(proj.paths.mapJson(name), "utf8");
    const n = JSON.parse(src).object_events.length;
    const added = insertArrayElement(src, ["object_events"], n, SAMPLE_OBJECT_EVENT);
    expect(removeArrayElement(added, ["object_events"], n)).toBe(src);
  }
}, 900_000);
```

---

## Task 4: The save funnel and diff preview

**Files:** Create `packages/core/src/write/save.ts`, `packages/core/src/write/diff.ts`, tests for both

**Interface:**

```ts
export interface PendingChange { path: string; kind: "json" | "binary" | "inc"; before: string | Buffer; after: string | Buffer; summary: string }
export interface SavePlan { changes: PendingChange[]; refusals: Refusal[] }

export function planSave(proj: Project, session: EditSession): SavePlan;
/** Throws if the plan has refusals. This is the ONLY function that writes to a decomp. */
export function commitSave(plan: SavePlan): void;
```

`EditSession` is defined in Task 5 (`packages/core/src/edit/commands.ts`). Either do Task 5 first, or define the interface here and have Task 5 implement against it — the minimum this task needs is:

```ts
export interface EditSession {
  mapName: string;
  layoutName: string;
  blocks: Block[];          // current, possibly edited
  border: Block[];
  map: MapData;             // current, possibly edited
  originalMapJson: string;  // raw text, for surgical splicing
  isDirty: boolean;
}
```

**Requirements:**
- `planSave` never writes. It is safe to call on every keystroke.
- `commitSave` throws when `refusals` is non-empty — the UI cannot bypass a guard by not rendering it.
- A lint rule forbids `writeFileSync` / `writeFile` anywhere under `packages/core/src/` except `write/save.ts` and `world/sidecar.ts`. Add it in this task and let CI enforce it.
- `diff.ts` renders a `SavePlan` as human-readable text for the CLI (`pokemap diff`) and structured data for the UI.

**Key test:**

```ts
it("commitSave refuses a plan containing refusals", () => {
  const plan = planSave(proj, sessionWithOutOfRangeBlock);
  expect(plan.refusals.length).toBeGreaterThan(0);
  expect(() => commitSave(plan)).toThrow(/refus/i);
  expect(readFileSync(targetPath)).toEqual(originalBytes); // nothing written
});
```

---

## Task 5: Undo/redo

**Files:** Create `packages/core/src/edit/commands.ts`, `packages/core/test/edit/commands.test.ts`

Command pattern over an `EditSession` holding the in-memory `Block[]` and `MapData` for the open map. Every mutation is a command with `apply` and `revert`.

**Requirements:**
- Unbounded undo within a session; the stack clears on save.
- A stroke (mouse-down through mouse-up) is **one** command, not one per block — dragging a pencil across 40 tiles must undo in a single step.
- `session.isDirty` is false after undoing back to the loaded state, so the UI stops warning about unsaved changes when there are none.

---

## Task 6: Paint tools

**Files:** Create `packages/core/src/edit/paint.ts`, `packages/core/test/edit/paint.test.ts`

**Tools:** pencil, bucket fill, dropper, rectangle select/fill, block shift (the porymap "shift" that moves the whole grid without moving events).

**Requirements:**
- Every tool is a pure function `(blocks, args) => Block[]`, so it is testable with no canvas.
- Bucket fill is 4-connected on metatile id, bounded by the map edge, and iterative rather than recursive — some layouts are 60×80 and a recursive fill will blow the stack.
- Painting a multi-block selection tiles the source pattern.
- Dropper reads id, collision and elevation together.
- **No tool may produce a block whose id is outside the current layout's split.** The palette cannot offer one (Task 7), and the guard catches it if some other path does.

---

## Task 7: Metatile palette

**Files:** Create `packages/ui/src/components/MetatilePalette.tsx`, test

Invoke `frontend-design` and `ui-ux-pro-max`; follow `packages/ui/DESIGN.md` from Plan 1.

**Requirements:**
- Renders primary then secondary metatiles **for the open layout's split**, with the boundary drawn as a visible divider labelled with the actual number (512 or 640) and the layout's `layout_version`.
- Ids past the owning tileset's real count are shown struck through and are not selectable — the `Saffron_Temp` situation becomes visibly impossible to repeat.
- Selecting a rectangle of metatiles makes a stamp.
- Search by id, in hex, matching how `docs/human-porymap.md` writes them.

This panel is the most direct expression of the project's reason to exist. It should be impossible to use it and not know which boundary you are working against.

---

## Task 8: Collision and elevation painting

**Files:** Extend `packages/core/src/edit/paint.ts`, add `packages/ui/src/components/CollisionPalette.tsx`

**Requirements:**
- Collision and elevation paint independently of metatile id — painting collision must not disturb the id.
- Elevation 0–15, collision 0–3, taken from the engine profile masks rather than hardcoded.
- The overlay from Plan 1 Task 21 becomes interactive in this mode.

---

## Task 9: Save flow

**Files:** Create `packages/ui/src/components/SaveDialog.tsx`, `packages/ui/src/components/Toolbar.tsx`, tests

**Requirements:**
- **No autosave. No save on close. No save on navigate.** Invariant **I6**. There is a test that opens a map, navigates away, and asserts nothing was written.
- Ctrl+S opens the diff preview; it does not save.
- The dialog lists every file with a plain-language summary ("`data/layouts/NewBarkTown/map.bin` — 3 blocks changed") and shows refusals in red with their fix text, with the confirm button disabled.
- Leaving with unsaved changes warns, and the warning says which maps.

---

## Task 10: Event editing

**Files:** Create `packages/core/src/edit/events.ts`, `packages/ui/src/components/EventInspector.tsx`, tests

**Requirements:**
- Select, drag, add and delete object, warp, coord and bg events.
- Every field is editable, including ones PokeMap does not model — the inspector shows unknown keys read-only rather than dropping them, and `jsonEdit` leaves them alone regardless.
- Dragging an event writes only its `x`/`y` via `jsonEdit`; adding one uses `insertArrayElement`.
- Deleting a warp warns when another map's warp targets it by index, since warp ids are positional and deleting one renumbers the rest. This is a real footgun the decomp has no protection against.
- Engine-specific fields (`floor_number` on FireRed, `region` on expansion) appear only where the profile supports them, and are never added to a map that lacked them.

---

## Task 11: Wild sign — species suggestion

**Files:** Create `packages/core/src/signs/suggest.ts`, test

**Interface:**

```ts
export interface SignSuggestion { species: string; percent: number; minLevel: number; maxLevel: number; method: Method }
export function suggestSpecies(proj: Project, mapName: string): SignSuggestion[];

export interface EdgeSlot { x: number; y: number; edge: "top" | "bottom" | "left" | "right"; facing: string }
export function suggestEdgeSlots(proj: Project, mapName: string, count: number): EdgeSlot[];
```

**Requirements:**
- `suggestSpecies` ranks by true encounter percentage from Plan 1 Task 26, so signs match what is actually catchable.
- `suggestEdgeSlots` returns border-adjacent, walkable (collision 0), elevation-3 tiles that are **not** warps, not on a connection seam, and not already occupied by an object event.
- `facing` is chosen so the sprite faces inward — `MOVEMENT_TYPE_FACE_RIGHT` on a left edge, and so on, matching the `CeladonCity` Poliwrath precedent.
- Returns fewer slots than asked rather than proposing a bad tile. A short list is honest; a bad placement corrupts a map.

---

## Task 12: Wild sign — script generation

**Files:** Create `packages/core/src/signs/script.ts`, test

Generates exactly the existing template, verified against `CeladonCity`:

```
{Map}_EventScript_{Species}::
	lock
	faceplayer
	waitse
	playmoncry SPECIES_{SPECIES}, CRY_MODE_NORMAL
	msgbox {Map}_Text_{Species}, MSGBOX_DEFAULT
	waitmoncry
	closemessage
	release
	end
```

**Requirements:**
- **Tabs, not spaces**, matching the existing `.inc` files. Assert this in a test by diffing against the real `CeladonCity_EventScript_Poliwrath` block.
- Appends only; never rewrites existing `.inc` content. The generated block goes after the last script and before any trailing text section, matching local convention.
- Symbol collision is checked against the whole file before writing; a collision is a refusal, not a rename.
- The paired `{Map}_Text_{Species}` entry is written with the user's text, escaped for the charmap.

**Golden test:**

```ts
it("regenerates CeladonCity's existing Poliwrath script byte-for-byte", () => {
  const generated = generateSignScript({ map: "CeladonCity", species: "SPECIES_POLIWRATH" });
  const actual = extractScript(readFileSync(P.mapScriptsInc("CeladonCity"), "utf8"), "CeladonCity_EventScript_Poliwrath");
  expect(generated.script).toBe(actual);
});
```

If the generator cannot reproduce a script a human already wrote, it is not ready to write new ones.

---

## Task 13: Wild sign — the write path

**Files:** Create `packages/core/src/signs/write.ts`, `packages/ui/src/components/SignComposer.tsx`, tests

**Requirements:**
- Writes the object event via `insertArrayElement` and the script via the `.inc` appender, as **one** `SavePlan` — both files or neither.
- Guardrails, each its own refusal code: `sign-on-warp`, `sign-on-seam`, `sign-off-table` (warning, not a block), `object-event-cap`, `symbol-collision`.
- The composer flow: pick map → ranked species list with icons and percentages → pick species → proposed slots shown on the canvas → drag to adjust → enter dialogue text → diff preview → save.
- The sprite drawn during placement is the real overworld sprite from Plan 1 Task 28, not a placeholder. Seeing the actual Pokémon while placing it is the point.

---

## Task 14: CLI write commands

**Files:** Modify `packages/cli/src/index.ts`, test

```
pokemap sign suggest <map> [--json]
pokemap sign add <map> <species> [--at x,y] [--text "..."] [--dry-run]
pokemap sign list <map>
pokemap diff
pokemap paint <map> --at x,y --metatile 0x123 [--dry-run]
```

**Requirements:**
- `--dry-run` prints the `SavePlan` and writes nothing. It is the default for `paint`; writing requires `--write`.
- Every command exits non-zero when refusals exist and prints them with their fix text.
- `sign add` without `--at` uses the top suggestion and says which one it chose.

This is the surface an AI agent uses to place signs across many maps and then `pokemap render` to check its own work.

---

## Task 15: Extend the corpus gate to real writes

**Files:** Modify `packages/core/test/write/corpus.test.ts`

**Requirements:**
- Copy each reference engine into a temp directory, open it, load every map, save with no edits through the real `commitSave`, and assert `zero bytes changed` across the whole tree.
- Then make one scripted edit per engine (change `music` on one map), save, and assert the diff is exactly that one value.
- Never run against the real subject repo. The test creates its own copies.

This is invariant **I5** upgraded from a text transform to the actual write path, and it is the gate for merging Plan 2.

---

## Plan 2 completion checklist

- [ ] `npm test` green, including the write-path corpus across 5 engines
- [ ] Paint one tile in an `emerald` map and one in an `hns` map, save both; `git diff` in the decomp shows exactly two `map.bin` files and nothing else
- [ ] `git status` in the decomp shows no unexpected file — especially not `layouts.json` or `region_map_sections.json`
- [ ] Open ten maps, change nothing, close them; `git status` is clean
- [ ] Add a wild sign, run `make` in the decomp, load the ROM, and **see the Pokémon standing at the map edge**
- [ ] `python tools/verify/check_metatile_range.py` in the decomp still reports only `Saffron_Temp`
