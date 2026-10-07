# Task 3 executed spec: GBC event editing (add / move / delete) + line insert/remove primitive

Plan 7 Task 3, re-granularised against the real code. Risk class: **high**: G3 splice byte exactness, error-boundary parsing, the positional `object_const_def` and `destWarp` hazards. Reviews stay split: Opus spec review, Sonnet quality review.

## Model (binding; follows Task 1 decision 1)

Every op is a pure function `text -> { text, events }`:
- `text` is the map's current `maps/<Name>.asm` text, which is `GbcEditSession.eventsText`;
- the result `events = parseMapEvents(text', mapName)`.

Every op re-locates against the text it is given, so there are no stale offsets. Task 4 assigns the result back onto the session. Nothing here touches the filesystem or a session.

`index` is the 0-based ordinal within one kind's array, the same ordinal as `GbcMapEvents.{warps,coords,bgs,objects}` and `locateEventCall`. Coordinates are event steps (16 px).

## Part A: line primitive (`packages/core/src/gbc/write/asmSplice.ts`)

Add three exports, with the same refusal style as `spliceArg` (throw, naming the problem):

```ts
/** Inserts `line` as a new line immediately after the line whose content ends at `lineEnd`. */
export function insertLineAfter(text: string, lineEnd: number, line: string): string;
/** Removes the line spanning [lineStart, lineEnd) together with exactly one terminator. */
export function removeLine(text: string, lineStart: number, lineEnd: number): string;
/** Every `<macro>` call after `<mapName>_MapEvents:`, absolute offsets, source order. */
export function locateEventCalls(text: string, mapName: string, macro: string): AsmCall[];
```

- **EOL:** `"\r\n"` if `text` contains `"\r\n"`, else `"\n"`. The corpus has no CRLF; support it anyway, and test it on a synthetic string.
- **`insertLineAfter`:**
  - Refuse unless `lineEnd === text.length`, or `text[lineEnd]` is `\n` or `\r`.
  - Refuse if `line` contains `\r` or `\n`.
  - If a terminator follows `lineEnd`, insert `line + eol` right after that terminator.
  - If `lineEnd === text.length` (a last line with no final newline), return `text + eol + line`. **The file stays without a final newline**, as `maps/CeruleanCave2F.asm` does today; its last line is `\tdef_object_events` with no `\n`.
- **`removeLine`:**
  - Refuse unless `lineStart` is 0 or follows `\n`, and `lineEnd` sits at a line end (as above).
  - If a terminator follows, remove `[lineStart, afterTerminator)`.
  - Otherwise (the last line, no terminator), also remove the **preceding** terminator: `[lineStart - eolLen, lineEnd)`, or `""` when `lineStart === 0`. This keeps the no-final-newline state.
  - So the exact inverses hold: `removeLine(insertLineAfter(t, e, L), <new line span>) === t`, and `insertLineAfter(removeLine(t, s, e), <prev line end>, t.slice(s, e)) === t`.
- **`locateEventCalls`:** same section bounding as `locateEventCall` (`labelTail`). Refactor `locateEventCall` to call it, so the behaviour and messages for existing callers are unchanged and every current `asmSplice.test.ts` still passes untouched.

## Part B: event ops (`packages/core/src/gbc/edit/events.ts`, new)

```ts
export type GbcEventKind = "warp" | "coord" | "bg" | "object";
export interface GbcEventEdit { text: string; events: GbcMapEvents; }

export function moveGbcEvent(text: string, mapName: string, kind: GbcEventKind, index: number, x: number, y: number): GbcEventEdit;
export function addGbcEvent(text: string, mapName: string, kind: GbcEventKind, args: string[], opts?: { mapConsts?: ReadonlySet<string>; objectConst?: string }): GbcEventEdit;
export function deleteGbcEvent(text: string, mapName: string, kind: GbcEventKind, index: number): GbcEventEdit;

export interface GbcWarpRenumberWarning { fromMap: string; warpIndex: number; destWarp: number; }
export function findGbcWarpsRetargetedByDelete(
  maps: { name: string; warps: GbcWarpEvent[] }[], deletedMapConst: string, deletedIndex: number,
): GbcWarpRenumberWarning[];
```

Macro per kind: `warp -> warp_event`, `coord -> coord_event`, `bg -> bg_event`, `object -> object_event`. Arg counts are 4, 4, 4, 13 (findings §3.1). `x`/`y` are always args 0 and 1.

### Shared validation (refuse with a message naming the map, kind and index or arg)

- `x`/`y` (move, and add's args 0-1 after parsing): integers `0 <= v <= 255`. A `db` holds 1 byte.
- An index out of range for that kind.
- add: `args.length` must equal the kind's arg count. Each arg must be non-empty, trimmed, and free of `,`, `;`, `\r` and `\n` (the same structural rule as `spliceArg`). Args 0-1 must be plain decimal integers in range.

### `moveGbcEvent`

- Splice arg 1 (`y`) first, then arg 0 (`x`), on the call from `locateEventCall`. Splicing the later span first keeps the earlier offsets valid.
- Values are plain decimal strings. The original column padding sits outside the trimmed span, so it stays (`warp_event  6,  3,` → x=12 gives `warp_event  12,  3,`). That is accepted, and has to be byte-predictable in tests.
- A move to the same `(x, y)` returns `text` unchanged (`===`).

### `addGbcEvent` (appends: as in GBA, add always means append)

- **Anchor:** the last existing call of that macro in the section (`locateEventCalls`). If the section has none, the `def_<kind>_events` marker line after `_MapEvents:` (locate it the same way; it is a zero-arg call). A missing marker refuses; `parseMapEvents` would also refuse it.
- **New line format:** `\t<macro> ${pad2(x)}, ${pad2(y)}, ${args.slice(2).join(", ")}`, where `pad2 = String(v).padStart(2)`. That matches the corpus (`\twarp_event  6,  3, ELMS_LAB, 1`).
- **warp:** if `opts.mapConsts` is given and `args[2]` isn't in it, refuse with an unknown map const (G4). `args[3]` must be a decimal integer ≥ 1, or `-1`.
- **object:**
  - refuse when the map already has 15 objects (`NUM_OBJECTS EQU 16`; slot 0 is the player);
  - **`object_const_def` sync**, using the block at the top of the file (`object_const_def` followed immediately by `const NAME` lines, the same rule as `events.ts`'s `parseObjectConsts`; locate it with `codeLines` from `load/asm.ts` to get offsets):
    - consts count 0 (no block, or an empty block): no const is added;
    - consts count === objects count: also insert `\tconst ${name}` after the last const line. `name` is `opts.objectConst` if given; else `${mapName.toUpperCase()}_${sprite without "SPRITE_"}`, with a `2`, `3`, … suffix appended until it's unique among the file's existing consts. `name` must match `/^[A-Z_][A-Z0-9_]*$/` and be unique, else refuse;
    - otherwise (consts count > 0 and ≠ objects count; the corpus has 1 such map, `MoveDeletersHouse`, with 1 const for 2 objects): refuse, saying the const list is out of step and must be fixed by hand;
  - apply the const insert and the object insert to one text (the const block is above the event block; insert the object line first, then the const, or re-locate between them; either is fine if the result is right).
- The result `events` comes from re-parsing. A re-parse failure propagates; it would be a bug, because the validation above should prevent it.

### `deleteGbcEvent`

- Remove the located call's line with `removeLine`.
- **object**, with the same const-count cases as add:
  - 0 consts: remove the object line only;
  - consts === objects: also remove const line `index`. **Refuse** if that const's name occurs anywhere else in the file as a whole word, outside its own const line (scripts address objects by it, e.g. `turnobject NEWBARKTOWN_TEACHER, LEFT`). Later consts shift together with later objects, so they stay paired. Ceiling: references in *other* files aren't scanned. Note it in a `ponytail:` comment;
  - mismatched (MoveDeletersHouse): refuse.
- **warp:** no text-side extra. The renumbering warning is the caller's job, through `findGbcWarpsRetargetedByDelete`, because it needs other maps' events.

### `findGbcWarpsRetargetedByDelete`

- Deleting warp ordinal `k` (0-based) on the map with const `C` renumbers its 1-based ids `k+2..n` down by one, and orphans id `k+1`.
- Report every warp in `maps` (other maps **and** the map itself, except the deleted warp) whose `mapConst === C && destWarp >= k + 1`. `destWarp === -1` is never reported.
- Warnings only, never refusals (GBA parity). This is stricter than GBA's `findWarpsTargetingByIndex`, which only reports `=== index`. Document why: every later id shifts too.

## Files

| File | Change |
|---|---|
| `packages/core/src/gbc/write/asmSplice.ts` | + `insertLineAfter`, `removeLine`, `locateEventCalls`; `locateEventCall` refactored onto it |
| `packages/core/src/gbc/edit/events.ts` | **new** |
| `packages/core/test/gbc/write/asmSplice.test.ts` | + new tests in a **separate `describe` block** at the end. Existing tests stay byte-unchanged |
| `packages/core/test/gbc/edit/events.test.ts` | **new** |
| `packages/core/test/gbc/write/lineIdentity.test.ts` | **new**: corpus identity proof (Part C) |

## Part C: corpus identity proof for the line primitive (G5-style; read-only)

`lineIdentity.test.ts`, `itWithGbcCorpus`, over every root from `gbcCorpusRoots()` (today: PerfPlus only; Task 7 adds pret). For **every** `maps/<Name>.asm` of every map in `openGbcProject(root).maps` (391 for PerfPlus; assert that count for PerfPlus):

For each of the 4 kinds:
1. Anchor as `addGbcEvent` would (the last call, else the marker). `insertLineAfter` a synthetic line, then `removeLine` the inserted line (locate it as the line right after the anchor). Result `=== original`.
2. If the kind has ≥1 call, `removeLine` the last call, then `insertLineAfter` its original text after the previous line. Result `=== original`.

This covers both no-final-newline files (`CeruleanCave2F`, `CeruleanCaveB1`) and `CeruleanCave1F`'s trailing-space label. It reads only; no writes.

Plus, still read-only: for every map, `parseMapEvents(addGbcEvent(...bg...).text)` has exactly +1 bg and the rest unchanged. Use a fixed valid bg arg list, e.g. `["0","0","BGEVENT_READ","X"]`. If the 15-object cap makes an object add inapplicable, skip that kind for that map.

## Tests (hermetic, `events.test.ts` and `asmSplice.test.ts`; TDD, commit each green step)

Use a small fixture, plus the real NewBarkTown text **read** from PerfPlus inside `itWithGbcCorpus` tests (never written).

Primitive:
1. `insertLineAfter` mid-file, at a final line with `\n`, and at a final line without `\n`. Pin the exact expected strings.
2. `removeLine`: a middle line, a last line with `\n`, a last line without `\n`, and the only line. Pin the exact strings.
3. Round-trip inverses (both directions) on all of those shapes, plus a synthetic CRLF text.
4. Refusals: a mid-line offset, and a line containing `\n`.
5. `locateEventCalls` count and offsets; `locateEventCall` existing tests still green.

Ops:
6. Move a NewBarkTown warp 0 to (12,4). The exact resulting line is `\twarp_event  12,  4, ELMS_LAB, 1`. Every other byte is unchanged: compare the prefix and suffix around that line. `events.warps[0]` is `{x:12,y:4}`. A same-coordinate move returns the identical string.
7. Move refusals: x=256, x=-1, x=1.5, an index out of range.
8. Add a bg to NewBarkTown: a new line right after `bg_event  9, 13, …`, exactly `\tbg_event  1,  2, BGEVENT_READ, NewBarkTownSign`. `events.bgs.length` becomes 5.
9. Add a coord to a map with an empty coord section: it is inserted right after the `def_coord_events` line.
10. Add an object to the no-final-newline `CeruleanCave2F` text (read real): the file still ends without `\n`, and the last line is the new object.
11. Add an object to NewBarkTown: the object line is appended and `\tconst NEWBARKTOWN_TEACHER2` is inserted after `const NEWBARKTOWN_RIVAL` (auto-name with suffix, since `NEWBARKTOWN_TEACHER` exists). Pass `objectConst: "NEWBARKTOWN_GUIDE"` and get that name instead. A bad or duplicate `objectConst` refuses.
12. Object add refusals: a 15-object fixture; the MoveDeletersHouse-shaped fixture (1 const, 2 objects); a wrong arg count; an arg containing `,`.
13. Warp add: `mapConsts` missing the const refuses; `destWarp` `0` refuses, `-1` is accepted.
14. Delete an object on a fixture whose const isn't referenced elsewhere: both the object line and its const line are gone, and the remaining consts still pair positionally (`objectConsts[i]` ↔ `objects[i]`). Then feed it into Task 1's guard: build a session from the fixture through `stubGbcProject` and assert `guardGbcSave` has no `object-const-desync`.
15. Delete NewBarkTown object 0: refused, because `NEWBARKTOWN_TEACHER` is referenced by scripts in the file.
16. Delete on a 0-const fixture removes just the line. Delete on the MoveDeletersHouse-shaped fixture refuses.
17. Delete a warp: one line is removed and everything else is unchanged.
18. `findGbcWarpsRetargetedByDelete`, on a synthetic 3-map set:
    - deleting ordinal 1 on `C` reports dest 2 and 3, but not 1, not `-1`, and not warps to other consts;
    - same-map warps are included;
    - the deleted warp itself is excluded.

## Teeth-proof

| ID | Mutation | Must go red |
|---|---|---|
| E1 | `removeLine` (last line, no `\n`) does not remove the preceding terminator | 2, 3, lineIdentity |
| E2 | `insertLineAfter` at EOF appends `line + eol` (adds a final newline) | 1, 10, lineIdentity |
| E3 | move splices x before y (offsets go stale) | 6 |
| E4 | object add skips the const insert | 11, 14 |
| E5 | object delete skips the reference check | 15 |
| E6 | retarget scan uses `=== k+1` | 18 |
| E7 | retarget scan doesn't exempt `-1` | 18 |
| E8 | 15-object cap is off by one (`> 15`) | 12 |

## Rules

Same as Task 1: run single files with vitest, `npm run typecheck` before each commit, pathspec commits, and no git checkout/restore/stash. **Read-only on PerfPlus:** every PerfPlus text is read into memory, and nothing writes it.
