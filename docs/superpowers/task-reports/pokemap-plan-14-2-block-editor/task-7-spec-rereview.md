Approved (Critical 0, Important 0, Minor 2)

# Task 7 spec re-review, fix round 1 (GBA block edit planner, Plan 14.2)

Reviewer: Claude Opus, spec pass only. Checkout `rv-t7` detached at `a27eafc` (read-only). Scope:
`git diff 4629ca8..a27eafc -- packages/core/src/blockEdit/gbaOps.ts packages/core/test/blockEdit/`. No vitest run (brief).
Mutation verdicts below are hand-derived against the fixture (`mut_t7b.out` was still empty when read). Conductor
evidence checked: the red run at the test commit has 14 failures, each one a new fix-round expectation (cell bounds x2, append
limit x4, unknown map, border read, null entry, behavior missing, attribute count x4). Green: 61/61 at `ecf0eb4` and 62/62 at
`a27eafc`. Typecheck exit 0.

All file:line references are in the `a27eafc` checkout. `ops` is `packages/core/src/blockEdit/gbaOps.ts`. `test` is
`packages/core/test/blockEdit/gbaOps.test.ts`.

## Review-1 findings

| Finding | Status | Evidence |
|---|---|---|
| I1 cell not bounded by the map | Closed | ops:317-323. The cell must be an integer, at least 0, and below `layout.width` / `layout.height`, else `${req.map}: cell is outside the map` (G2a text, exact). test:80-88 checks `{2,0}` and `{0,2}` on the 2x2 Emerald and needs the message to start with `Emerald`. The bound mutant (M25) is killed: without the bound, the plan succeeds. Both cases were red before the fix. |
| I2 append-limit text | Closed | ops:336-346. The message matches the G6a exact format, `<metaPath>: layout <id> (<role>) allows <limit> metatiles; cannot append metatile <count>`. The tests discriminate: test:124-138 stages S with 21 entries (E: 21 < 24 passes; F: 21 < 20 fails) and checks for `20 metatiles` and `cannot append metatile 21`, so echoing the count cannot pass (M30 killed). The primary case at test:139-152 stages A with 9 entries (E limit 8) and checks for `8 metatiles` and `cannot append metatile 9`. `startsWith(metatilesBin)` kills M33 (attributes path). In test:112-123 (count 20), F gives 20 < 20, which kills M29 (`<=`) and M2 (`uses.slice(0,1)` lets E pass at 20 < 24). |
| I3 structural check on every consuming layout | Partly | The named mutant `uses.filter(u => u.layout === layout.id)` (M20) is killed. test:157-164 sends tile 25 from Frlg: F gives 25-12 = 13 < 16 (valid), E gives 25-8 = 17 >= 16 (refused, names E). test:165-172 sends palette 5 from Extra: X resolves to T with 13 palettes (valid); E resolves to S with 5 palettes (refused). Review 1's second mutant, `uses.slice(0,1)`, still survives. See N1. |
| M1 fixture location vs G9 | Closed | G9 is amended in `task-7-rulings.md` ("G9 amended") and in the plan Files line (plan:378 names `gbaFixture.ts`). |
| M2 three hand-derived survivors | Closed | (a) SHARED_GRID only from the map: test:100-110 runs a palette Save-as-new on `SharedA` and plans `newBlockId 4`, which kills M21. (b) Primary/secondary boundary: test:311-315 sends id 8 (Emerald) and id 12 (Frlg) as S local 0 and expects `edits []` and `tilesets [S]`. Under `<=` the id becomes A local 8 >= 4, giving BAD_VALUE (M22 killed). (c) R1a: test:317-322 removes A's `attributes.bin` and expects BAD_VALUE starting with the path. With the guard removed (M23), the native ENOENT goes through R1b and starts with `Emerald` (killed). |
| M3 attribute count vs metatile count | Closed | ops:286-288. The message is `${attrPath}: ${n} attribute words for ${count} metatiles` (G2b). test:362-380 checks a surplus word and a short file in both modes. By hand: 10/2 = 5 and 6/2 = 3 for count 4. Both messages are pinned. M26 is killed: in ok mode the patch then succeeds with `edits []`, and Save as new appends. |
| M4 primary local past a layout's split | Deferred by ruling | "Deferred" bullet in the fix-round rulings (Task 16). |
| M5 tests claim more than they assert | Closed | (a) test:262-268 now pins confirmation with A local 2. By hand: when both shared maps are staged, the R3 winner is SharedA `[0,0,0]`; F, H and X borders are `[1,0,0,0]`; Frlg and Extra are `[0]`, so `false`. With only SharedB `[2,0,0]` it is `true`. The reversed-winner mutant (M9) flips the first result. (b) test:180-219 checks layout-to-tileset pairs per layout segment (`segment()` cuts at the next layout id). The pairs are hand-checked: tile 8 gives E->S, F->A, H/X->T; palette 2 gives E->S (2>=2), F->A (2<3), H/X->T; S tile 0 gives E/F->A, O->B. A primary/secondary label swap fails these checks (M31). |
| M6 malformed entries escape as TypeError | Closed | ops:292-298 is the shape check and names the metatiles path (G2c). test:340-346 puts a null entry and requires the message to start with `metatilesBin`. The R1b wrapper alone would start with `Emerald`, so M27 is killed. |

## Fix-round rulings pinned

- **G2a**: ops:317-323, test:80-88 and the `missing cell` case at test:223-227. Exact text matches.
- **G2b / G2c**:
  - Entries shape: ops:292-298, test:340.
  - Behavior and layerType must be integers: ops:299-300, test:348-360. M28 and M32 are killed because `patchGbaAttribute` skips `undefined` fields (gbaPatch.ts:122), so without the explicit checks the plan returns `edits []`.
  - Attribute word count: ops:286-288, test:362-380.
  - Message subjects: metatiles path for entries, attributes path for behavior and layerType. Both are pinned by `startsWith`.
- **G6a exact format**: ops:343 matches the ruling word for word. Path, layout, limit and count are pinned. The `(<role>)` label is not pinned (N2).
- **R1b**: ops:252-262. A `BlockEditRefusal` is rethrown unchanged; anything else becomes `BAD_VALUE` `${req.map}: <message>`. Pinned by test:324-328 (unknown map `Nope`) and test:330-338. In that test the O border is missing on a palette Save-as-new: `confirm` is skipped, so the native read failure happens in `gbaBlockUsage` (usage.ts:362) and is relabelled with `Emerald`. M24 is killed. Both tests were red before the fix.
- **R1a**: ops:58-67, test:317-322 (above).
- **Error text** (`instanceof Error ? message : String`): ops:65, 101, 259.
- **Check order** (G2: triple, BAD_VALUE, SHARED_GRID, append, structural): ops:265, 267-323, 325-331, 333-347, 349-350.
  - The cell check sits after the patchers but is still in the BAD_VALUE stage, before SHARED_GRID.
  - test:229 shows BAD_VALUE before SHARED_GRID, and SHARED_GRID before the append limit (A staged at 8 would fail E's limit of 8).
  - test:299-309 shows the append limit before the structural check. Tile 25 from Frlg would be refused structurally in E, but the test needs a message starting with the metatiles path and containing `8 metatiles`, which only the append refusal produces.

## Oracle check of the new expectations (by hand against `gbaFixture.ts`)

- Splits: Emerald 8/8/2, FRLG 12/12/3, total 32.
- Secondary limits: E and O 24, F 20. Primary limits: E, H and X 8, F 12.
- Sheets: 16 tiles. Palettes: A and B 13, S 5, T 13.
- Every new numeric expectation (20, 21, 8, 9, 5/4, 3/4, newBlockId 4, the tile 25 and palette 5 verdicts, the pair lists, confirm with local 2, tile 20 accepted by E/F/H/X: 12, 8, 12, 12 < 16) agrees with these facts.
- None of the expected values comes from the code under test.
- Every new test has a mutant that fails it (above).
- Removed lines in the diff: the old `toMatch(/20|32/)`, `toMatch(/8/)` and bare symbol checks were replaced by stronger assertions. The added `Frlg`/`Extra` staged grids in the first R3 block do not change the SharedA usage being asserted.
- No test was weakened, and no new defect was found in `gbaOps.ts`.

## New findings

### N1 (Minor). Structural "every consuming layout" still survives a first-layout-only mutant
Location: ops:207 (`for (const use of uses)`) and test:153-179.

The mutant is `for (const use of uses.slice(0, 1))` inside `assertStructural`. Review 1 named it as a survivor, and it still survives. In the fixture, E sorts first and is always the strictest layout:
- A tiles: E and H/X allow tiles up to 23; F allows up to 27.
- A palettes: E and F allow 0-4; H/X allow 0-12.
- S tiles: E and O allow up to 23; F allows up to 27.
- S palettes: E, F and O allow 0-4.

No value is valid in E but invalid in a later layout, so every structural refusal still names E.

Failure scenario the suite would miss: a later refactor checks only the first sorted consumer, or breaks the loop after the first layout. Then a tileset whose first layout is the looser one accepts an entry that another layout cannot draw. An example is an FRLG-split layout whose id sorts before an Emerald one, with tile 25 on primary A. The Emerald layout then indexes tile 17 of a 16-tile secondary sheet.

Kill: add a consumer that sorts before E and has a looser split, for example an FRLG layout `D` with A+S, and send tile 25 from it, expecting SPLIT_LIMIT naming E. This changes usage expectations elsewhere. Alternatively, accept the residual risk in the ledger. The current code is correct.

### N2 (Minor). The role label in the G6a message is not pinned
Location: ops:343 and test:112-152, 299-309.

No test checks for `(secondary)` or `(primary)`. A mutant that hard-codes `(primary)` passes every append-limit test. In that case the S/F refusal reads `layout F (primary) allows 20 metatiles`, which misstates which half overflowed, and G6a's exact format is violated undetected.

Kill: in test:137, check for the full fragment `layout F (secondary) allows 20 metatiles; cannot append metatile 21`. Optionally check `layout E (primary)` at test:150.

## Not checked
- vitest (forbidden by the brief).
- `mut_t7b.out`, which was empty when read. The mutation verdicts are hand-derived.
- Quality-pass items (cache staleness, wrapper ergonomics, dead code).
- Task 6 files.
