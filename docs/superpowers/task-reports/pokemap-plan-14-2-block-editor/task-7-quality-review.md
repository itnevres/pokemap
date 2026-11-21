Needs changes: 0 Critical, 1 Important, 8 Minor

# Task 7 quality review: GBA block edit planner (Claude Opus fallback, Codex at its limit)

Scope: `cf74410..4629ca8` (`packages/core/src/blockEdit/gbaOps.ts`) plus tests commit `4632ed0`
(`packages/core/test/blockEdit/{gbaOps.test.ts,gbaFixture.ts}`). gbcOps.ts not reviewed. Spec compliance is the other
reviewer's pass; spec items below are mentioned only where they are also a quality or correctness problem.

## What I verified myself

- Read the whole planner, `gbaPatch.ts`, `usage.ts` (GBA half), `project.ts`, `tilesetData.ts`, `blocks.ts`, the
  rulings G1-G9 and Task 6 R1/R3/R9.
- Typecheck: `tsc --noEmit` over `packages/core/src/**` plus both Task 7 test files (scratch tsconfig extending
  `tsconfig.base.json`, types from the main repo's node_modules), exit 0. The implementer's typecheck claim holds.
- No vitest (per brief). Instead, a read-only tsx probe
  (`C:\Users\Serve\AppData\Local\Temp\claude\8fd0350c313cb955\fd52805f-2f40-4daa-9fe0-26bda39faaf2\scratchpad\t7probe\edges.mts`
  and `...\t7probe\cost.mts`) ran the planner on fresh `makeGbaFixture()` temp roots (removed afterwards) and on the
  real GBA subject, opened read-only (the planner never writes). Results are quoted in the findings.
- Real subject facts (read-only probe): 1,209 maps, 1,020 layouts (not ~500), no layout with primary == secondary,
  no map with a missing map.json or unknown layout, no blockdata file shared by two layouts, 0 of 230 tilesets with an
  attribute/metatile count mismatch, `metatile_attributes_size=2`. 19 grid files differ from width*height*2, all on
  unused layouts.
- Hand-traced every focus edge listed in the brief. These are correct as written:
  - primary == secondary layout. The stable sort keeps the primary use before the secondary. Both targets
    (`local`, `split.metatiles + local`) are checked for confirm. Both append limits apply.
  - A tileset consumed by no layout: `gbaCrossHalfWarnings` returns `[]` (`sourcesDiffer([])` is false).
    `gbaBlockUsage` returns empty usage.
  - Secondary under two splits. `newBlockId` is `split.metatiles + n` of the edited map's split. The append limit is
    checked per consuming layout. The confirm target is computed per layout.
  - 32-bit attributes: the planner never computes an attribute offset itself. `patchGbaAttribute` owns the width.
  - Non-integer, negative or NaN `metatileId`: `primaryRole` and `local` are computed first (gbaOps.ts:257-259), but
    line 260 throws before either is used, so this is harmless (readability only, see M6).
  - Staged vs disk vs the project overlay. Entries, attribute words and the count come only from
    `effectiveBytes`. `proj.tileset()` is used only for sheet tile count and palettes, which a GBA block edit never
    changes (R1 allows these static facts).
  - R3 winner: the first sorted map of the blockdata file present in `grids`.
  - Revision: the two effective files before the edit, plus the edited map's R3 grid.
  - Grids and borders come from disk, consistent with the GBA edit session, which also parses the whole blockdata
    file (`editSessions.ts:44`). Borders are never staged today.
- Mutation evidence: the implementer's report has none ("remain for the conductor"). I could not run vitest, so I
  hand-traced the plan's four listed mutations. All four are caught:
  - secondary id without split offset: the `saveAsNew appends ... under each split` case expects `split + 3`; the
    mutant gives 3.
  - limit from one split: the `append limit ... tighter split` case. Under E only, 8+20=28<32, so nothing is refused
    and `refusal()` throws "expected SPLIT_LIMIT".
  - palette ignored in the cross-half check: the `palette only` case finds 0 relevant warnings and expects 1.
  - attribute append without clone: the `keeps the cell's collision and elevation` case expects 0x3a45; the mutant
    gives 0x3045.
  The `<` vs `<=` mutants of both append-limit formulas are also caught. Surviving mutants are listed in M5.

## Critical

None.

## Important

### I1. Save as new accepts a cell outside the map. The placement can land on a different cell or past the grid.

`packages/core/src/blockEdit/gbaOps.ts:286-291`, with the placement built at `:345-347`.

The check only rejects missing, non-integer or negative coordinates. It never compares against
`layout.width` / `layout.height`. Its GBC twin does (`gbcOps.ts:26-29`, Task 6 R2: "without a cell inside the map →
BAD_VALUE"), and the brief names cell bounds as a focus.

Probe result: `saveAsNew`, `from: "map"`, `cell: {x: 7, y: 5}` on the fixture's 2x2 `Emerald` returns
`placement {"x":7,"y":5,"blockId":4}` and no refusal.

Failure scenario: a stale popup, or a route bug, sends `{x: 2, y: 0}` for a width-2 map. Task 8 and Task 11 apply
`placement` to the session grid at `y*width + x = 2`, which is cell (0,1). The new block silently replaces a different
cell than the one the user right-clicked. `{x: 0, y: 2}` writes index 4, past the 4-cell array, so the grid grows or
the writer throws. The planner owns this validation, because it already emits the placement and refuses the other
cell defects.

Fix: add `cell.x >= layout.width || cell.y >= layout.height` to the condition at :288, with the message
`${req.map}: cell is outside the map`, matching GBC. Add a `BAD_VALUE: cell outside` case to the BAD_VALUE `it.each`.

## Minor

### M1. Attribute files shorter or longer than the metatiles file are handled inconsistently, and one case writes wrong bits silently.

`gbaOps.ts:271`, `:284`, `:324-326`.

The count comes only from the metatiles file. `patchGbaAttribute` replaces when the index is below the attribute
count and appends otherwise, ignoring `cloneFrom`. Probe results:

- **Attributes longer, Save as new.** The fixture's A attributes were staged with one surplus word, 0x0f00. Save as new
  with behavior 0x45 and layerType 3 writes the new word as **0x3f45**: the surplus word's bits plus the fields. The
  source clone would be **0x3a45** (source word 0x0a12). G6 says to clone the source. On an FRLG-style 4-byte profile,
  the bits not covered by behavior and layerType are terrain and encounter type. The new block silently inherits a
  stale encounter type, and nothing checks it.
- **Attributes shorter, OK mode, `local == attrCount`.** The validation call at :284 appends instead of refusing. The
  OK edit grows `attributes.bin` from 2 to 4 bytes with a word cloned from word 0. With `local > attrCount`, the same
  edit is refused as BAD_VALUE.
- **Attributes shorter, Save as new.** The BAD_VALUE from the real append at :325 surfaces only after SHARED_GRID,
  the append limit and the structural check. The probe got `SPLIT_LIMIT gTileset_A: entry 0 tile 25 ...` for a draft
  that should first have been refused for its attribute file. This is outside G2's order.

The real subject has 0 mismatches, hence Minor. Fix: one check after reading the files: if
`attrBuf.length !== count * profile.metatileAttributesSize`, refuse BAD_VALUE with
`${attrPath}: N attribute words for M metatiles`. Alternatively, apply it to Save as new only and require
`local < attrCount` for OK. Either way it runs in the BAD_VALUE stage.

### M2. Native errors escape the planner beside its own guarded reads.

R1a's intent is that no native fs error escapes the planner. The planner wraps its own reads (`effectiveBytes`,
`cells`) as BAD_VALUE, but its dependencies do not. Probe results:

- An unknown `req.map` throws a plain `Error: unknown map Nope; not listed in ...` from `proj.layoutForMap`
  (`:255`).
- A missing `data/layouts/O/border.bin` of another consuming layout, on a Save as new, throws raw
  `ENOENT ... open 'C:\...\border.bin'` from `gbaBlockUsage` (`:352`, `usage.ts:362`). The planner's own `cells()`
  turns the very same read into BAD_VALUE when `usedElsewhere` reaches it first (OK mode with edits). Which error the
  user sees depends on the mode.
- `proj.tileset(pairedSymbol)` in `assertStructural` (`:146`, `:212-213`) throws whatever `loadTileset` throws for a
  broken PNG or `.pal` of a paired tileset.

The route then answers 500 instead of 409. Fix: either wrap `gbaBlockUsage` and the structural tileset loads with the
same `path: reason` BAD_VALUE mapping, or have `gbaCells` in usage.ts use the guarded reader. A malformed draft also
gives a TypeError rather than a refusal: a `null` entry fails at :278, and a missing `behavior` or `layerType` passes,
because `patchGbaAttribute` skips undefined fields and the original is silently kept. That is acceptable only if the
Task 11 body validation covers it, so note it for Task 11.

### M3. Cost per call on the real subject: the planner re-reads every consuming grid and border that usage already read.

`gbaOps.ts:235`, `:241`, `:244`, `:335`, `:339`, `:352`.

Measured on the real subject (1,209 maps), warm cache:

| Call | Time |
|---|---|
| `mapsByGridFile`-style index, per call | ~5 ms (negligible) |
| `gbaBlockUsage(General, 1)` | ~175 ms |
| Plan for a changed General block 1 (`usedElsewhere` short-circuits early) | ~200 ms |
| Plan for a General block drawn by one map only (id 20, full `usedElsewhere` scan) | ~362 ms |

The full scan roughly doubles the I/O, because `usedElsewhere` builds its own cell cache and re-reads every consuming
layout's grid and border that `gbaBlockUsage` reads again with another cache. The revision reads the map's grid a
third time with `new Map()` (:339).

Also on these lines:
- `usedElsewhere` calls `proj.layoutById` (a linear find over 1,020 layouts) once per use.
- It calls `proj.layoutForMap(name)` once per map (:244), although `layout` is already that layout.
- It reads the border even when the only map on the layout is `req.map`.

Fix: one `cells` cache per plan call, shared by `usedElsewhere` and the revision, and passed to or shared with usage.
Use the `layout` already in hand. Reuse usage.ts's generation-cached `gbaMapsByLayout` / `gbaMapsByGridFile` instead of
rebuilding both per call (:65-88). This also removes the duplicate code (M6).

### M4. The append-limit refusal does not state the limit.

`gbaOps.ts:309-312`.

G6 says "the first failing layout ... is named, with its limit". The message is
`gTileset_S: cannot append metatile 20: layout F (secondary) has no room within its split`, which names no limit.
The tests pass only because the count equals the limit in both fixtures (20 = 32−12; 8 = split 8). Their regexes
`/20|32/` and `/8/` match the count. Fix: name the limit, e.g. `... layout F (secondary) allows 20 metatiles` (and
tighten the two test regexes so the count cannot satisfy them). The GBC twin BLOCK_CAP starts with the metatiles path.
G4 makes the symbol the subject for the structural check, and this message follows that, which is acceptable.

### M5. Test gaps: three surviving mutants on safety logic, by hand trace.

- **`gbaOps.ts:237`, confirm's secondary target.** The mutant `target = local` for every role survives. No test
  asserts `confirm` for a secondary-role edit. Even in the fixture, a secondary edit's other maps draw both 1 and
  9/13, so the mutant still answers true. Confirm is the only guard against editing a block other maps draw without a
  prompt. Suggested test: edit S local 1 from `Emerald`, stage `Other` and `Frlg` grids so that only `Frlg` draws
  `12+1`, and expect `confirm` to flip when that cell is removed.
- **`gbaOps.ts:210`, structural secondary-half subtraction.** The mutant `entry.tile < tileCount(use.secondary)`
  survives. Every fixture sheet has 16 tiles, and no test picks a tile in [16, 16+split.tiles). Tile 25 is invalid
  either way. The primary-half check (:209) cannot fail at all in this fixture, because split.tiles ≤ 12 < 16.
  Suggested test: tile 20 under E must be accepted (20−8=12<16).
- **`gbaOps.ts:352`, usage index.** The mutant `gbaBlockUsage(proj, symbol, req.metatileId, grids)` survives. Every
  usage assertion uses a primary block, where `local === metatileId`.
- There is no test for the I1 cell bounds.

The plan's four listed mutants are all caught (see above).

### M6. Readability and dead code in gbaOps.ts.

- `:176`, `:185`, `:191`: the `seen` dedupe set can never fire. Each warning embeds `entry ${i}` plus the kind, so it
  is unique by construction. G5's "Deduplicate" is satisfied trivially. Drop the set, or dedupe on the source
  description if that was the intent.
- `:150-151`: `TileSource` and `PaletteSource` are the same type.
- `:283-284` and `:321-326`: both patchers run twice. The first call is a validator whose result is discarded, and in
  Save as new it validates index `local`, not `count` (the root of M1's ordering). One call per file, kept in the
  BAD_VALUE stage, is clearer.
- `:257-260`: `primaryRole` and `local` are derived before `metatileId` is validated. Move line 260 first.
- `:286` and `:294`: two consecutive identical `saveAsNew && from === "map"` conditions.
- `:328-332`: the edits are built through a Map plus path-identity ternaries. Two literal candidates filtered by
  `!before.equals(after)` say the same thing.
- `:65-102` duplicate usage.ts's private `gbaMapsByLayout`, `gbaMapsByGridFile` and `gbaCells`, with different
  failure behaviour: this copy throws a plain Error if any map in the project names an unknown layout, while
  usage.ts's copy tolerates it.
- `:214`: the literal `13` would read better as a named `NUM_PALS_TOTAL` constant, as `render/metatile.ts` explains
  it.

### M7. Structural check loads every paired tileset whole for a sheet tile count.

`gbaOps.ts:145-147`, `:209-213`.

`proj.tileset()` decodes the PNG and reads all palettes, metatiles and attributes. For a General entry picking a
secondary-range tile, that loads up to 24 secondaries. The probe measured 39.5 ms on the first call and 5 ms
afterwards. The load repeats after each `setTilesetOverlay`, because the project clears its cache on every overlay
change. Acceptable today. Note it if `setTilesetOverlay` runs after every staged edit.

### M8. Test file readability.

`packages/core/test/blockEdit/gbaOps.test.ts`: many lines pack 5-10 statements (e.g. :57, :73, :84-89, :99, :110),
and one `it.each` row is an 8-tuple. Assertions are correct; I re-derived the hand values:
- 0x2a34 = (0x0a12 & ~0xf0ff) | 0x34 | 2<<12.
- 0x3a45 is the same with 0x45 and 3<<12.
- Grid ids [1,1,9,0]; interior 2 and border 1 per map.
- The R9 oracle re-implements the hash independently.

They are hard to review or extend. Not blocking.

## Fixture builder (`gbaFixture.ts`)

The fixture is deterministic: fixed content, a fresh `mkdtempSync` root per call, and a PNG with a valid CRC that the
loader decoded in my probe (128x8, so 16 tiles per sheet). Every root is pushed to `roots`. The file-level `afterEach`
covers the tests outside the `describe` block too, with retries for Windows. The subject smoke cases open the subject
read-only and the planner writes nothing.

It is a generated temp project rather than G9's checked-in `packages/core/test/fixtures/blockEdit/gba/` with
`.gitattributes -text`, which is the spec reviewer's call. Because every sheet has the same tile count (16), the
fixture cannot exercise the primary-half tile check at all (M5).

Not checked: I did not run vitest, so I did not run any mutation; all mutation results above are hand traces. I did
not review gbcOps.ts, Task 8+ consumers of `placement` (none exist yet), or the route-level body validation M2 depends
on.
