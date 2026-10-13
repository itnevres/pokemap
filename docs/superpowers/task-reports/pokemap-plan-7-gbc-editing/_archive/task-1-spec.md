# Task 1 executed spec: GBC save guards + EditSession/save funnel

Plan 7 Task 1, re-granularised against the real code at `be1e95c`. Risk class: **high** (write funnel, byte exactness, G2/G4/G7). Reviews stay split: Opus spec review, Sonnet quality review.

## Why first

Every later task (paint, events, server, UI, CLI, G5 gate) writes through this funnel. It must be unable to do damage before anything can feed it edits.

## Design decisions (coordinator; binding)

1. **The session holds current text, not an op list.**
   - GBA replays `jsonEdits`/`insertOps`/`removeOps` against `originalMapJson` at plan time. That is only because `jsonEdit.ts` needs the original.
   - GBC event edits (Task 3) will each be a surgical splice applied immediately: `eventsText -> eventsText'`. Then `events = parseMapEvents(eventsText')`.
   - So the session stores `eventsText` (current) and `originalEventsText` (as read from disk). No op list, no index-shift semantics, and no stale `AsmCall` offsets (every op re-locates against the current text).
   - G3 still holds: text only ever changes through splice primitives, never by regeneration. Task 1 doesn't add any text-editing ops. Tests simulate one with `spliceArg`/plain string surgery.
2. **The `.blk` write is a G2 byte patch, not a whole re-encode.**
   - `commit` reads the on-disk buffer, sets `bytes[i]` only for indices whose `metatileId` differs from `originalBlocks[i]`, and writes the buffer back.
   - Paths are `${proj.root}/${layout.blkPath}` and `${proj.root}/maps/${mapName}.asm` (the fixed path, per findings §3.1).
3. **Reuse the GBA shapes:** `Refusal` from `packages/core/src/write/guards.ts`, and `PendingChange` from `packages/core/src/write/save.ts`. The server/UI `SaveDialog` and the CLI `formatDiffText` already speak them. No new types for the same thing.
4. **`isDirty` is a plain field** (as in GBA). Task 4 makes `EditCommandStack` generic over `{ isDirty: boolean }` and reuses it. Task 1 never sets it to `true` itself; `open` sets `false`.
5. **No warp-tile-moved guard.** Plan 7's G4 list doesn't include it. Do not invent refusals (plan, Task 1 text).
6. **`>15 objects` is NOT a save guard.** `parseMapEvents` already throws on more than 15 objects, so a session's `events` can never exceed 15, and a save-level check would be dead code. Task 3's add-object op refuses before splicing. Do not add it here.

## Files

| File | Change |
|---|---|
| `packages/core/src/gbc/write/save.ts` | **new**: `GbcEditSession`, `GbcSavePlan`, `openGbcEditSession`, `planGbcSave`, `commitGbcSave`, `changedBlockIndices` |
| `packages/core/src/gbc/write/guards.ts` | **new**: `guardGbcSave(proj, session): Refusal[]` |
| `packages/core/src/write/diff.ts` | widen both params from `SavePlan` to `Pick<SavePlan, "changes" \| "refusals">`. Type-only; GBA behaviour is unchanged |
| `packages/core/test/write/noStrayWrites.test.ts` | add `join("src", "gbc", "write", "save.ts")` to `ALLOWED`; rename the test to "...except the sanctioned four" |
| `packages/core/test/gbc/write/save.test.ts` | **new** |
| `packages/core/test/gbc/write/guards.test.ts` | **new** |
| `packages/core/test/write/diff.test.ts` | add 1 test: a plain `{ changes, refusals }` object formats |

Nothing else. The server/CLI/UI aren't touched.

## Types (exact)

```ts
// gbc/write/save.ts
import type { Refusal } from "../../write/guards.js";
import type { PendingChange } from "../../write/save.js";
import type { GbcProject } from "../project.js";
import type { Block, GbcMap, GbcMapEvents, Layout } from "../model/types.js";

export interface GbcEditSession {
  mapName: string;
  /** proj.map(mapName) -- the project's cached header. Never mutated. */
  map: GbcMap;
  /** proj.layout(map).layout as opened. layout.blocks is the as-opened array; never mutated. */
  layout: Layout;
  /** Current, possibly-edited blocks (length === width*height). */
  blocks: Block[];
  /** MUST be a deep, independent copy (copy GBA EditSession.originalBlocks' doc comment, adapted). */
  originalBlocks: Block[];
  /** Current maps/<mapName>.asm text. Changes ONLY via asmSplice-family primitives (G3). */
  eventsText: string;
  /** Literal text read from disk at open. Never regenerated, never reassigned. */
  originalEventsText: string;
  /** parseMapEvents(eventsText, mapName) -- every edit op must keep this in step. */
  events: GbcMapEvents;
  /** parseMapEvents(originalEventsText, mapName). Independent object from `events`. */
  originalEvents: GbcMapEvents;
  /** Names of every map whose blkPath === layout.blkPath, this map included, in proj.maps order. */
  layoutSharedBy: string[];
  isDirty: boolean;
}

export interface GbcSavePlan {
  session: GbcEditSession;
  changes: PendingChange[];
  /** Display-only snapshot. The gate is commitGbcSave's fresh re-check (same contract as GBA SavePlan.refusals; copy that doc comment's substance). */
  refusals: Refusal[];
}
```

## Behaviour

### `openGbcEditSession(proj: GbcProject, mapName: string): GbcEditSession`

- `proj.map(mapName)`. An unknown name throws there; let it propagate (G4: unknown map).
- `proj.layout(map).layout`.
- Read `${proj.root}/maps/${mapName}.asm` as utf8 and parse it twice (`events` and `originalEvents` are independent objects).
- `blocks` and `originalBlocks` are two independent deep copies of `layout.blocks` (`map((b) => ({ ...b }))`), neither aliasing `layout.blocks`.
- `isDirty: false`.

### `changedBlockIndices(original: Block[], current: Block[]): number[]`

Ascending indices `i < min(len)` where `metatileId` differs. Exported for Task 4/6 reuse.

### `guardGbcSave(proj, session): Refusal[]` (gbc/write/guards.ts)

Refusals, in this order. `subject` is the file path named.

| code | When | subject |
|---|---|---|
| `blocks-length-changed` | `blocks.length !== originalBlocks.length` | `layout.blkPath` |
| `metatile-out-of-range` | any current block id that isn't an integer with `0 <= id < proj.tileset(map.tileset).metatiles.length`. One refusal listing the sorted unique bad ids. The fix text names the tileset const and its count | `layout.blkPath` |
| `layout-not-writable` | `!layout.writable` **and** `changedBlockIndices(...)` is non-empty. An unchanged non-writable layout is not refused, because nothing would be written to it | `layout.blkPath` |
| `object-const-desync` | if `originalEvents.objectConsts.length > 0`: `(consts' - consts) !== (objects' - objects)` (counts, current minus original). Else: `events.objectConsts.length !== 0`. The message names both deltas | `maps/<mapName>.asm` |
| `file-changed-on-disk` | blocks changed and the on-disk `.blk` doesn't match what the session opened: `disk = readFileSync(blk)`, `n = originalBlocks.length`, refused unless `disk.length >= n && disk.subarray(0, n).equals(encodeBlk(originalBlocks))`. It compares the prefix the patch writes into; bytes past `n` are never touched, so they don't need to match. Text changed and `readFileSync(asm, "utf8") !== originalEventsText`. Up to 2 refusals, one per file. Only checked for a file that would be written. Reads only | that file |

Notes:
- The metatile check runs over **all** current blocks, as GBA's does. The corpus has 0 out-of-range ids (findings §3.2), so an unedited real map never refuses.
- The guard only reads files and never writes (noStrayWrites).

### `planGbcSave(proj, session): GbcSavePlan`

- `refusals = guardGbcSave(proj, session)`.
- `changes`:
  - Blocks changed: `{ path: `${proj.root}/${layout.blkPath}`, kind: "binary", summary: `${layout.blkPath} -- ${n} block(s) changed` }`. Use GBA's pluralisation ("1 block", "3 blocks"). When `layoutSharedBy.length > 1`, append ` (shared by ${k} maps)`.
  - Text changed: `{ path: `${proj.root}/maps/${mapName}.asm`, kind: "text", summary: `maps/${mapName}.asm -- event block edited` }`.
- Blocks first, then text. Nothing else.

### `commitGbcSave(proj, plan): void`

- Fresh `guardGbcSave(proj, plan.session)`. If non-empty, `throw new Error(`save refused: ${code (subject)}, ...`)` (GBA's format) and write nothing.
- Blocks changed: `bytes = readFileSync(blk)`, then `bytes[i] = blocks[i].metatileId` for each changed i, then `writeFileSync(blk, bytes)`. G2: untouched bytes are never re-encoded.
- Text changed: `writeFileSync(asm, session.eventsText)`.
- An unchanged file is never written (mtime proves it, see tests).
- A doc comment states it is the ONLY GBC decomp writer (G7). It isn't atomic across its 2 writes, same accepted risk as GBA (copy the substance).
- It does not mutate the session. Task 4/6 callers reopen after a commit.

## Tests (TDD: write each red first, commit each green step)

Hermetic fixtures in `mkdtempSync` dirs (cleanup in `afterEach`). Build a stub with `stubGbcProject` (`packages/core/test/gbc/helpers/stubGbcProject.ts`):
- `root: tmp`;
- `maps: [testMap, ...]`;
- `map: (n) => …` (throw `unknown map` otherwise);
- `layout: (m) => loadLayout(tmp, m)` (the real loader from `src/gbc/load/map.ts`);
- `tileset: () => ({ metatiles: new Array(4) })` cast as needed.

Fixture map `Testmap`, 2×2, `blkPath: "maps/Testmap.blk"`, bytes `[1,2,3,4]`, tileset cap 4. Fixture asm, LF, final newline:

```
	object_const_def
	const TESTMAP_A
	const TESTMAP_B

Testmap_MapScripts:
	def_scene_scripts

	def_callbacks

Testmap_MapEvents:
	db 0, 0 ; filler

	def_warp_events
	warp_event  1,  1, OTHER_MAP, 1

	def_coord_events

	def_bg_events

	def_object_events
	object_event  1,  2, SPRITE_A, SPRITEMOVEDATA_STILL, 0, 0, -1, -1, 0, OBJECTTYPE_SCRIPT, 0, ScriptA, -1
	object_event  2,  2, SPRITE_B, SPRITEMOVEDATA_STILL, 0, 0, -1, -1, 0, OBJECTTYPE_SCRIPT, 0, ScriptB, -1
```

Check this fixture parses with `parseMapEvents` (2 objects, 2 consts) before relying on it. Adjust only the whitespace if needed, and say so in the report.

Required tests (names approximate):

`save.test.ts`
1. open: `blocks` and `originalBlocks` are equal in value; arrays `!==`; element `[0]` objects `!==`; neither is `layout.blocks`. Mutating `session.blocks[0].metatileId` leaves `originalBlocks` and `layout.blocks` unchanged. `events !== originalEvents`. `isDirty === false`.
2. open: `layoutSharedBy` lists every same-`blkPath` map (fixture: 2 maps sharing, 1 other) in `proj.maps` order.
3. open: an unknown map name throws `/unknown map/`.
4. An unedited plan gives `changes: []`, `refusals: []`. Commit then writes nothing: set both files' mtime to a fixed past time with `utimesSync`, commit, and the mtimes are unchanged.
5. Paint index 2 to 0, plan: exactly 1 change, `kind: "binary"`, summary `maps/Testmap.blk -- 1 block changed`. Commit: disk `.blk` is exactly `[1,2,0,4]`, and the asm bytes and mtime are unchanged.
6. Shared layout: the summary ends ` (shared by 2 maps)`.
7. G2 patch proof: the fixture `.blk` has 1 extra trailing byte beyond w×h. Writing it while the layout loads oversize gives `writable:false`, so build this one with `writable:true` and `blocks` = first 4, through the stub's `layout` override. Commit a 1-block change and assert the trailing byte survives. (This is why the patch, not `encodeBlk`, is the writer.)
8. Text change: replace `object_event  2,` with `object_event  3,` through `spliceArg` + `locateEventCall` (`src/gbc/write/asmSplice.ts`), then re-parse `events`. Plan gives 1 `kind: "text"` change, summary `maps/Testmap.asm -- event block edited`. Commit: disk asm === `session.eventsText` byte for byte; `.blk` bytes and mtime unchanged.
9. Commit throws `/save refused: metatile-out-of-range/` and leaves both files byte-identical and mtime-unchanged.
10. Stale plan: plan with a valid edit, then set a block to 9 (out of range), then commit. It throws (the fresh re-check). Disk is unchanged.

`guards.test.ts`
11. `metatile-out-of-range` for ids `4`, `-1`, `1.5` (one refusal listing them sorted); not for `3` (cap boundary is exclusive).
12. `layout-not-writable`: a real oversize `.blk` (5 bytes for 2×2), loaded through the real `loadLayout` (`writable:false`). Unedited: no refusals and plan `changes: []`. Painted: refused, commit throws, disk still 5 bytes, identical.
13. `blocks-length-changed`: push 1 block, refused.
14. `object-const-desync`:
    - remove the 2nd `object_event` line only: refused;
    - remove it **and** `const TESTMAP_B`: no refusal;
    - a variant fixture with no `object_const_def`, removing one object: no refusal;
    - the same variant, adding a const line: refused.
15. `file-changed-on-disk`:
    - open, paint, externally `writeFileSync` different `.blk` bytes: refused, and the commit throws with the external bytes intact;
    - the same for the asm, after a text change;
    - no refusal when the external change is to a file the session doesn't write (blocks edited, asm changed externally).

`save.test.ts`, real corpus, read-only (`itWithGbcCorpus` from `test/gbc/helpers/corpus.ts`, `openGbcProject(GBC_SUBJECT_ROOT)`). These must never write:
16. NewBarkTown: an unedited plan gives `[]`/`[]`, `isDirty false`, `events.objects.length` matches `loadGbcMapEvents`.
17. Any map whose `blkPath === "maps/House1.blk"`: `layoutSharedBy.length === 50` (findings §3.6; re-measure, and if it differs, report it, don't silently pin a different number).
18. CeruleanCave2F: `layout.writable === false`. Unedited plan `[]`/`[]`. Painting one block (in memory only) gives a `layout-not-writable` refusal. **Do not call commit.**

`diff.test.ts`
19. `formatDiffText({ changes: [...], refusals: [...] })` with a plain object works and renders as today.

`noStrayWrites.test.ts`: the allowlist gains exactly the new file. The test still passes, and it fails if `writeFileSync` appears in `gbc/write/guards.ts`. Verify that by a temporary mutation, then remove it; don't commit the mutation.

## Teeth-proof (implementer runs each; reviewers re-run)

| ID | Mutation | Must go red |
|---|---|---|
| M1 | `originalBlocks: blocks` (alias) in open | test 1 |
| M2 | cap → `256` | tests 9, 11 |
| M3 | drop the `layout-not-writable` branch | test 12 |
| M4 | commit writes `encodeBlk(blocks)` instead of the patch | test 7 |
| M5 | drop the `file-changed-on-disk` branch | test 15 |
| M6 | commit throws on `plan.refusals` instead of a fresh guard | test 10 |
| M7 | drop the `object-const-desync` branch | test 14 |
| M8 | commit writes the asm unconditionally | tests 5 (mtime) and 4 |
| M9 | remove the gbc allowlist entry in noStrayWrites | noStrayWrites |

## Rules

- Run single files with `node node_modules/vitest/vitest.mjs run <file>` from the repo root. Run `npm run typecheck` before each commit.
- **Commit each green step with a pathspec commit:** `git commit -m "..." -- <paths>`. Never `git add -A`, never `git checkout`/`git restore`/`git stash` to undo an experiment. Revert a mutation by editing it back, then confirm with `git diff`.
- **Never write to PerfPlus** (`C:\Programming Projects\pokecrystal-PerfPlus`) or the GBA subject. Every write test uses a tmpdir.
- This repo has no `@testing-library/jest-dom` (irrelevant here: core only).
- Match the surrounding style: doc comments that explain *why*, and named refusals.

## Coordinator amendments (after the implementer's report, 2026-10-06)

- **The fixture tileset cap is 5, not 4.** With a cap of 4, the spec's own fixture byte `4` would be refused, which contradicts tests 4 and 5. Test 11's bad ids become `5, -1, 1.5`; `4` is the valid boundary. The guard semantics are unchanged (`0 <= id < cap`).
- **Shared-layout fixture is opt-in** (tests 2 and 6), so test 5's summary has no "(shared …)" suffix.
- `packages/core/test/gbc/helpers/saveFixture.ts` (the shared fixture) is accepted as an extra file.
- `diff.test.ts`: dropping the excess `session: {} as any` from one literal is accepted (it's forced by the `Pick<>` widening).
