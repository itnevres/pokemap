Needs changes (Critical 0, Important 3, Minor 6)

# Task 7 spec-compliance review: GBA block edit planner (Plan 14.2)

Reviewer: Claude Opus (`high-risk-reviewer`, spec pass; Codex at its limit). Checkout `wt-t7r` detached at `4629ca8`.
Reviewed: `git diff cf74410..HEAD` (`packages/core/src/blockEdit/gbaOps.ts`) and `git show 4632ed0` (`gbaOps.test.ts`,
`gbaFixture.ts`, stub, `index.ts` export). Requirements: plan Global Constraints, Review Focus, Task 7; spec Identity,
Data (GBA bullets), Save as new (GBA), Q4 predicate; rulings G1-G9, Task 6 R1/R1a, R3, R9. No vitest run (brief);
mutation verdicts below are hand-derived, plus the conductor's partial `mut_t7.out` (M1, M2, M3 KILLED at time of reading).

## Verdict summary

The planner follows G1-G9 closely: check order (triple layer, BAD_VALUE, SHARED_GRID, append limit, structural), changed
entries only (G3), per-consuming-layout structural check and cross-half sources (G4/G5, tile and palette, symbol and
local index), per-role append limits over every consuming layout (G6), clone-then-fields attribute append, R1 effective
bytes with R1a read failures, R3 grid winner, R9 revision, G8 confirm per map. All 12 plan Step-1 cases exist and the
four plan-listed mutations are killed. Three Important gaps: a Save-as-new cell is not bounded by the map (GBC parity,
Q10), the append-limit refusal names neither the file nor the limit (spec 135, Acceptance 3, G6) and its test regex
cannot tell, and no structural case discriminates "every consuming layout" from "the edited layout only".

## Critical

None.

## Important

### I1. Save-as-new cell is not checked against the map's width/height (conductor note confirmed)
`packages/core/src/blockEdit/gbaOps.ts:286-291` accepts any non-negative integer cell; `placement` (`:345-347`) echoes it.
GBC rejects the same input (`gbcOps.ts:26-29` `checkCell`: `cell.x >= map.width || cell.y >= map.height` → BAD_VALUE,
Task 6 R2 "without a cell inside the map → BAD_VALUE"). Spec Q10 / "Save as new" (spec:130-131, 223): Save as new
changes only the one clicked cell.
Failure scenario: fixture map `Emerald` is 2x2. `saveAsNew`, `from: "map"`, `cell: {x: 2, y: 0}` plans successfully
with `placement {x: 2, y: 0, blockId: 11}`. A grid writer that indexes `y*width + x` writes cell index 2, i.e. (0, 1), a
cell the user never clicked; `paintCells` (`edit/paint.ts:42`) instead silently skips it, so the block is appended but
placed nowhere and the undo entry records a placement that never happened. Neither outcome is caught by a test: no case
passes an out-of-range cell. Fix: bound by `layout.width` / `layout.height` (message starts with the map, as GBC) and add
a `BAD_VALUE: cell outside the map` case (e.g. `{x: 2, y: 0}` and `{x: 0, y: 2}`).
G-rulings do not restate R2 for GBA; this does not contradict them, it fills the same gap the GBC ruling closed.

### I2. Append-limit refusal names neither the file nor the limit; the tests cannot tell
`gbaOps.ts:308-313`: message is `${symbol}: cannot append metatile ${count}: layout ${use.layout} (${use.role}) has no
room within its split`. Spec:134-135 "At the cap, Save as new refuses naming the file and the limit"; Acceptance 3
"refuses at the cap/limit naming the file"; G6 "the first failing layout ... is named, with its limit". The message
starts with the tileset symbol (not the metatiles file) and contains no limit.
The tests look like they pin the limit but do not: `gbaOps.test.ts:78` `toMatch(/20|32/)` and `:167` `toMatch(/8/)` are
satisfied by the count, because at an exactly full file the count equals the limit (S: 20 = 32 − 12; A: 8 = 8).
Failure scenario: secondary S holds 22 entries (built for the Emerald split, now also consumed by FRLG layout F).
Save as new refuses with "gTileset_S: cannot append metatile 22: layout F (secondary) has no room within its split":
the user is told neither which file nor that F's limit is 20 secondary metatiles (32 − 12). Fix: name the metatiles
path and the limit (`primary`: `split.metatiles`; `secondary`: `metatilesTotal − split.metatiles`), and make the test
discriminate by staging a count above the limit (S with 21 entries: E 8+21 < 32 fits, F 12+21 ≥ 32 fails → message must
contain `20` and `data/tilesets/S/metatiles.bin`, and must not be satisfiable by `21`).

### I3. No structural case is valid in the edited layout but invalid in another consuming layout
Spec:97-98 "a tileset consumed under two different splits refuses edits that would be valid under only one"; plan
Step 1 "a tile or palette outside **some** consuming layout's range refuses SPLIT_LIMIT naming the layout"; G4 "per
consuming layout". Implementation is correct (`gbaOps.ts:198-223` iterates every use), but the three cases at
`gbaOps.test.ts:80-83` all edit from `Emerald`, whose layout E is both the edited layout and the first, most restrictive
use, and every value is invalid in E itself.
Hand-derived mutant: `assertStructural(..., uses.filter((u) => u.layout === layout.id))` at `gbaOps.ts:318`.
tile 25 from Emerald: E 25 ≥ 8, 25 − 8 = 17 ≥ 16 (S sheet 128x8 = 16 tiles) → refuses naming E. palette 6: E 6 ≥ 2 →
S has 5 palettes → refuses naming E. palette 13: refuses. Every other case either expects no refusal or refuses
earlier (`:162` hits the append limit first). The mutant passes all 40 → SURVIVES. The same holds for a
`uses.slice(0, 1)` structural mutant (E is first).
Failure scenario the suite would miss: editing gTileset_A block 1 from map `Frlg` with tile 25 (F: 25 − 12 = 13 < 16,
valid) is accepted under the mutant, and layout E then indexes tile 17 of a 16-tile secondary sheet (garbage/out of
range on every Emerald-split map). Kill cases: `request(p, "Frlg")` with entry 0 tile 25 → SPLIT_LIMIT naming E; or
`request(p, "Extra")` with entry 0 palette 5 (X: T has 13 palettes, valid; E: S has 5, invalid) → SPLIT_LIMIT naming E.

## Minor

### M1. Fixture location differs from plan Task 7 Files and G9
Plan:376-377 and G9 name a checked-in project under `packages/core/test/fixtures/blockEdit/gba/` with a `-text`
`.gitattributes` entry; the tests use a runtime builder `packages/core/test/blockEdit/gbaFixture.ts` writing a fresh
`mkdtemp` project per case. Functionally equivalent or better (no binary files, every case gets a private copy, nothing
to mark `-text`), and the ledger (line 251-252) records it, but G9's text was not amended. Amend G9 (and the plan Files
line) to name the builder so Task 16's final review does not flag a missing fixture folder.

### M2. Three implemented branches have no killing test (hand-derived survivors)
- `gbaOps.ts:294` SHARED_GRID only for `from: "map"` (G2, Q9). Mutant `if (req.mode === "saveAsNew")` survives: the only
  palette Save-as-new case (`gbaOps.test.ts:73`) uses `Emerald`, whose grid is not shared. Scenario: Save as new from
  the palette while `SharedA` is open would wrongly refuse. Kill: palette Save-as-new on `SharedA` plans `newBlockId 4`.
- `gbaOps.ts:257` primary/secondary boundary (G1 `metatileId < split.metatiles`). Mutant `<=` survives: no case uses
  id = `split.metatiles` (tests use 1, 2, 4, 9/13, split+1, split+3). Scenario: id 8 on Emerald (S local 0) would be
  read as A local 8 and refused BAD_VALUE. Kill: OK with unchanged S local 0 at id 8 (Emerald) and 12 (Frlg) → edits `[]`.
- `gbaOps.ts:54-63, 90-98` R1a (failed read → BAD_VALUE `<canonical path>: <reason>`) is implemented but untested.
  Kill: delete `data/tilesets/A/attributes.bin` in the temp fixture → BAD_VALUE, message starts with that path.

### M3. Attribute file shorter or longer than the metatiles file breaks the clone rule silently
`gbaOps.ts:284, 325-326` pass the metatiles count to `patchGbaAttribute`. With surplus attribute words
(`attrCount > count`), Save as new replaces word `count` in place, so the new block starts from the surplus word, not
the source word (spec:139-140 "starts as a copy of the source block's whole word"). With `attrCount === local` in OK
mode, the patcher appends a word cloned from word 0. Not present in the subject (checked read-only: all 241
`data/tilesets/**` pairs have equal counts), so Minor; a one-line `attrBuf.length / size !== count` → BAD_VALUE naming
the attributes path would close it.

### M4. G8 / Task 5 target id for a primary whose local index is beyond a consuming layout's primary range
`gbaOps.ts:237` uses `target = local` for every primary use (as G8 and usage.ts:402 say). If a primary has more entries
than some consuming layout's `split.metatiles`, that layout cannot draw `local`; its id `local` is a secondary block.
Scenario: primary P (10 entries) consumed by E (8) and F (12); OK on P local 9 from F → E's grid id 9 (= S local 1)
makes `confirm` true and the usage line counts S's cells as P's. Not present in the subject (read-only check: the three
primaries consumed under both splits, General/Pyramid/TrainerHill, have ≤ 512 entries). Ruling gap, not an
implementation deviation; fix would skip a primary use when `local >= use.split.metatiles` here and in usage.ts.

### M5. Two tests claim more than they assert
- `gbaOps.test.ts:126` "shared grid uses the alphabetically first staged map for usage **and confirmation**" asserts only
  usage (from usage.ts); no `confirm` assertion. (R3 winner in gbaOps is still killed by the revision case at `:105`.)
- `gbaOps.test.ts:84-89` cross-half cases check that every layout id and every tileset symbol appear, not which layout
  resolves to which tileset (G5 "every consuming layout id with the tileset it resolves to"). A mutant that swaps the
  primary/secondary label in `describeSources` survives. Kill: assert `E -> gTileset_S` / `F -> gTileset_A` pairs.

### M6. Malformed draft entries escape as TypeError instead of BAD_VALUE
`gbaOps.ts:276-277` dereferences `draft.entries[i]!`; a `null` entry or a non-array `entries` throws a native TypeError
(G2 asks for BAD_VALUE on draft validation). Task 11 answers 400 for a malformed body, so this only matters if a caller
bypasses the route; a `typeof entry !== "object" || entry === null` guard is enough.

## Answers to the brief's questions

- **Code + tests vs plan, spec, rulings:** compliant except I1 (cell bounds), I2 (refusal text) and the test gap I3.
  G1-G9 otherwise implemented as written; R1/R1a/R3/R9 applied (canonical paths, staged-then-disk, changed files only,
  sorted edits, unchanged draft → `[]`, revision of the pre-edit state over metatiles + attributes + R3 grid).
  `blockEditRevision`, `patchGbaMetatile`, `patchGbaAttribute` (`cloneFrom = local` on append), `assertNotTripleLayer`
  (`proj.paths.porymapCfg`), `gbaConsumingLayouts`, `gbaBlockUsage`, `canonicalTilesetPath` are called correctly.
- **Every plan Step-1 case present and asserting its name:** yes, all 12 (OK; primary + usage; map-visible id under
  both splits; collision/elevation under both splits; palette appends only; SHARED_GRID; tighter split; structural;
  three cross-half warnings + identical-source no-warning; untouched 13-15 entries; TRIPLE_LAYER; two subject smokes).
  Weak spots: `tighter split` does not pin the limit (I2); `structural` does not pin "some" layout (I3); smoke cases
  assert `edits []` instead of "after equals before", as the ledger (line 244) records under R1.
- **Oracle independence:** yes. Expected bytes come from the test's own `encode()` and hand constants (I re-derived:
  Emerald masks behavior 0xff, layer 0xf000; 0x0a12 → 0x2a34 with 0x34/2; clone 0x0a12 → 0x3a45 with 0x45/3; compose
  0x0a33 → 0x0a44), usage counts from raw `map.bin`/`border.bin` words masked 0x3ff, revision from an own SHA-1 framing
  (path, NUL, length, NUL, bytes; `grid\0`, count, NUL, ids). Cross-half cases also compare `plan().warnings` to
  `gbaCrossHalfWarnings()` (consistency only) but add independent token checks. `draft()` reads through the project
  loader (`load/tilesetData.ts`), not gbaOps.
- **Fixture:** deterministic (fixed bytes, fixed JSON, fixed 128x8 indexed PNG = 16 tiles; only the temp dir name
  varies). Models what the plan requires: primary A under E (emerald 8/8/2) and F (frlg 12/12/3); two secondaries S
  (5 palettes) and T (13); S paired with A and B (layouts E, F, O); blockdata `data/layouts/H/map.bin` shared by
  SharedA and SharedB (two maps on one layout; the two-layouts-one-file form is not modelled, but grouping is by file).
  Grid cells 0 and 2 carry collision/elevation bits 0x5800; A block 2 carries untouched palette 13-15 entries.
- **Plan-listed mutations (hand-derived, conductor run agrees where finished):**
  secondary id without offset → `newBlockId` 3 ≠ 11/15, KILLED (`:60`, `:66`; conductor M1 KILLED);
  limit from one split → E 8+20 < 32 fits, no refusal, KILLED (`:75`; conductor M2 KILLED);
  palette ignored in cross-half → no palette warning for palette 2 (E→S, F→A, H/X→T), KILLED (`:84` "palette only"; conductor M3 KILLED);
  attribute append without clone → clone word 0 (0x0021) gives 0x3045 ≠ 0x3a45, KILLED (`:66`).
- **Requirements untested:** cell inside the map (I1); limit text (I2); structural rule across consuming layouts (I3);
  SHARED_GRID skipped for palette Save as new, id = `split.metatiles` boundary, R1a read failure (M2).

Not checked: no vitest run (brief); `gbcOps.ts` beyond `blockEditRevision`/`checkCell` (Task 6 under separate review);
the conductor's mutations M4-M16 had not finished when this report was written.
