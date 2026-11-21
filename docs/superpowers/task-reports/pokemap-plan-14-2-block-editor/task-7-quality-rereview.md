Approved: 0 Critical, 0 Important, 4 Minor

# Task 7 quality re-review: fix round 1 (`4629ca8..a27eafc`), Claude Opus

Scope: `packages/core/src/blockEdit/gbaOps.ts`, `packages/core/test/blockEdit/gbaOps.test.ts` and `gbaFixture.ts`, at
`a27eafc`, in the read-only checkout `rv-t7`. Static reading and `git` only. I did not run vitest.

Evidence I used:
- `t7-a27eafc-green.out`: 62 passed. `t7-fix1-tc.out`: typecheck exit 0 (taken at `ecf0eb4`, and `a27eafc` changes
  only tests).
- `mut_t7b.out` held only the baseline line (`62 passed`) when I read it. The mutation results below are my own hand
  traces against the fixture facts, not run results.

All line numbers refer to `gbaOps.ts` at `a27eafc` unless a test file is named.

## Closure of review-1 quality findings

| Finding | Status | Evidence |
|---|---|---|
| I1 cell outside the map | Closed | :317-323 adds `cell.x >= layout.width \|\| cell.y >= layout.height` and refuses with the message `${req.map}: cell is outside the map`. Tests `saveAsNew from the map refuses a cell outside the layout: 2,0 / 0,2` (test:80-88). Fixture layouts are 2x2, so without the bound the plan succeeds and `refusal()` throws `expected BAD_VALUE`. Mutant M25 is killed. |
| M1 attribute/metatile count mismatch | Closed | :286-288 refuses before any patcher runs. Save as new now always clones from `local < count` (:315), so the stale-surplus 0x3f45 case can no longer happen. Tests: surplus and short, each in OK and Save as new mode (test:368-386). Hand values: 10 bytes / 2 = 5 words for 4 metatiles, 6 / 2 = 3. Before the fix, OK mode with local 1 < 3 succeeded, so M26 is killed. One new message issue, see N1. |
| M2 native errors escape | Closed | The R1b wrapper is at :252-262. Tests: unknown map (test:328) and a missing O border read inside `gbaBlockUsage` on Save as new from the palette (test:334; confirm is false, so only usage reaches it). The Task 11 note about a missing `behavior`/`layerType` is now handled in the planner: :299-300, tests test:350-362. |
| M3 cost | Partly (the ruling's scope is met) | Met: one `cellsCache` per plan, shared by confirm and the revision (:352, :360, :364). `use.layoutObject` replaces `layoutById` and `layoutForMap` in the scan (:238). Not taken up by the ruling: usage still reads every grid and border again with its own cache (:377). `mapsByGridFile` and `mapsByLayout` are still rebuilt on every call instead of reusing usage.ts's generation-cached ones. |
| M4 limit not stated | Closed | The message at :343 matches G6a exactly. The `cannot append metatile 21` test (test:120-134) stages count 21: E 21<24 passes and F 21<20 fails, so the count cannot satisfy `20 metatiles`. M30 (limit replaced by count) is killed. The primary case (test:135-148): A staged at 9 is checked in sorted order, and E fails first with 9<8 false. M33 (wrong file) is killed by `startsWith(metatilesBin)`. |
| M5 surviving mutants | Closed (one residual from the fixture's limits) | Confirm secondary target (test:388-395): F's target is 12+1=13, E/O's is 9, and borders are `[1,0,0,0]`. M17 (`target = local`) matches F's border cell 1 in the "withoutFrlg" case, so the test fails as intended. Secondary-half subtraction: `tile 20` accepted (test:194-200), and M18 gives 20<16 false, so it refuses. Usage by local id (test:397-414) counts raw words independently. M19 asks for local 9 and counts ids 17/21, so it gets 0 instead of 1 for E. Cell bounds: see I1. Residual: the primary-half tile check (:209) still cannot fail, because every split.tiles ≤ 12 < 16 sheet tiles. That is a fixture limit, noted under N4. |
| M6 readability / dead code | Partly | Closed: the dedupe set is dropped; there is one `TileSource` type (:154, used for both); one patcher call per file (:314-315); `metatileId` is validated before `local` (:267 before :273); `NUM_PALS_TOTAL` is named (:31). Not closed: see N3. |
| M7 structural tileset loads | Open, acceptable | Unchanged (:209-213). Review 1 already judged it acceptable today. No action needed. |
| M8 test readability | Partly | The new tests are one statement per line. The pre-existing dense tests (e.g. test:46-73, :210-231) are unchanged. |

## Focus items from the brief

- **R1b wrapper.** `if (error instanceof BlockEditRefusal) throw error;` (:256) re-throws every refusal untouched,
  including TRIPLE_LAYER, SHARED_GRID, SPLIT_LIMIT and the path-prefixed BAD_VALUEs from `effectiveBytes`, `cells`
  and the patchers. Anything else becomes `BAD_VALUE "<map>: <message>"`, and the error text follows the s6 ruling
  (`instanceof Error ? message : String`). A programming error now reaches the caller as an ordinary 409, for example
  `BAD_VALUE "Emerald: Cannot read properties of undefined (reading 'xFlip')"`, with the stack and the original type
  gone. See N2.
- **BAD_VALUE stage order.** The checks run in this order:
  1. TRIPLE_LAYER (:265)
  2. metatile id (:267)
  3. map/layout lookup, wrapped (:269)
  4. reads (:278-279)
  5. metatiles length (:281)
  6. attribute count (:286)
  7. local range (:289)
  8. shape (:292-298)
  9. behavior/layerType integers (:299-300)
  10. flips (:301-306)
  11. patchers (:314-315)
  12. cell (:317-323)
  13. SHARED_GRID (:326-331)
  14. append limit (:335-347)
  15. structural (:350)

  Save as new refuses an invalid draft before SHARED_GRID and before the append limit. The `check order` test at
  test:233 and the patcher-moved-up path confirm this.

  Can the early append call throw anything but BAD_VALUE? I checked both patchers:
  - `patchGbaMetatile` at `count`: the length check passes and every entry is a non-null object. Missing or
    non-integer `tile`/`palette` gives BAD_VALUE (gbaPatch.ts:43-48). An append needs no in-bounds write, and
    `Buffer.concat` cannot throw here.
  - `patchGbaAttribute` at `count` with `cloneFrom = local`: :286 guarantees `count` whole words and :289 guarantees
    `local < count`, so the clone index is valid and the read is in range. Values are already integers, so the mask
    checks give BAD_VALUE (gbaPatch.ts:123-128). A 2-byte word stays ≤ 0xffff after `applyFields`, so
    `writeUInt16LE` cannot throw RangeError.

  Answer: no. Even a throw would only be re-labelled BAD_VALUE by the wrapper.
- **Shared `cells` cache.** It lives for one call (:352), so it cannot hold stale data across calls. Keys are
  repo-relative file paths, and only disk reads are cached. A staged grid is returned by `effectiveGrid` before
  `cells` is consulted (:117-119), so a staged grid can never poison the cache. Two layouts sharing a blockdata file
  hit the same key for the same bytes, which is correct. A border and a grid only collide if they are literally the
  same file. No wrong-layout hit is possible.
- **`consumingUses`' `layoutObject` (:48).** `gbaRelations` is built from `proj.layouts` (usage.ts:290-293), and the
  lookup map is built from the same array (:44), so `!` cannot yield undefined. Only a `layouts.json` with duplicate
  ids makes the two pick different objects (Map keeps the last; relations keeps both). That is degenerate input and
  not a finding. `gbaConsumingLayouts` could return `use.layout` directly and avoid the round-trip, which is optional.
- **Attribute count message for a ragged buffer.** See N1.
- **Messages start with their subject.** Every refusal does: map (:267, :321, :329), metatiles path (:282, :289,
  :297, :304, :343), attributes path (:287, :299, :300), symbol for structural (:218, per G4), and map for the R1b
  wrapper. Warnings start with `entry N`, which G5 allows.

## New findings

### Critical
None.

### Important
None.

### Minor

**N1. The attribute-count message can print a fractional word count.** Location: `gbaOps.ts:287`.

`${attrBuf.length / attributesSize}` assumes whole words. Failure scenario: a staged or on-disk `attributes.bin` of 9
bytes under a 2-byte profile, or 18 bytes under FRLG's 4-byte profile, refuses with
`.../attributes.bin: 4.5 attribute words for 4 metatiles`. The refusal is correct, but the text is confusing.

The same message family has a related case. :289 for an empty `metatiles.bin` (count 0) prints
`outside the editable range 0--1`.

Fix: when `attrBuf.length % attributesSize !== 0`, say `${attrPath}: ${attrBuf.length} bytes is not a whole number
of ${attributesSize}-byte attribute words`. Keep G2b's `N attribute words for M metatiles` for the whole-word case.

**N2. The R1b wrapper drops the original error, and it can name the wrong subject.** Location: `gbaOps.ts:255-260`,
with `mapsByGridFile` at :70-80.

The ruling mandates the re-label, so this is a debuggability note, not a ruling challenge.

1. The wrapper builds a new `BlockEditRefusal` with no `cause`. Scenario: a future refactor dereferences an undefined
   value. The route answers 409 `BAD_VALUE "Emerald: Cannot read properties of undefined..."`, the user is told their
   input is bad, and the stack is gone. Routes treat refusals as expected outcomes, so nothing is logged. Fix: give
   `BlockEditRefusal` an optional `{ cause }` (ES2022 `Error` options) and pass the caught error, so a route can log
   non-refusal causes.
2. The planner's own `mapsByGridFile` calls `proj.layoutForMap` for every map in the project (:73). usage.ts's
   `gbaMapsByGridFile` tolerates a map with an undefined layout (usage.ts:314-334). Scenario: one unrelated map.json
   names a layout missing from layouts.json. Every GBA block edit on every map then refuses with
   `BAD_VALUE "Route101: map Foo (...) references layout Bar, which is not defined..."`. The edited map is blamed for
   another map's defect, and editing is blocked project-wide. The real subject has 0 such maps (review 1's probe),
   hence Minor. Fix: reuse usage.ts's cached index (export it) instead of the local duplicate. This also closes N3's
   first item.

**N3. Review-1 M6 readability items still open.** None of these are bugs.
- `:70-92`: `mapsByGridFile` and `mapsByLayout` still duplicate usage.ts's generation-cached helpers, with the
  different failure behaviour in N2.
- `:317` and `:326`: two `req.mode === "saveAsNew" && req.from === "map"` blocks, now separated only by :325.
- `:353-357`: the edits are still built through a Map plus `path === metaPath ? ... : ...` ternaries. The same thing
  as two literal `{ path, before, after }` candidates filtered by `!before.equals(after)` is clearer.
- `:241-246`: `usedElsewhere` reads the border before it knows another map exists. It also re-evaluates the identical
  `effectiveGrid(layout)` once per other map name. The result depends only on the layout, and the cache makes the
  repeat cheap, but it reads as if it were per map. Clearer:
  `if (!names.some((n) => n !== mapName)) continue;` then one grid/border test.
- `:139-147` `changedIndices`: the `!== undefined` guards are dead in the planner path, because :292-295 guarantees 8
  entries. They are harmless, since `gbaCrossHalfWarnings` is exported and keeps its own guards.

**N4. Test-side residuals.** Locations: `gbaOps.test.ts:334-342`, `gbaFixture.ts` (every sheet is 128x8, which is
16 tiles).
- The primary-half tile branch (:209) is still unfalsifiable. No fixture split has `split.tiles` ≥ a primary's tile
  count. Scenario: the mutant `entry.tile < use.split.tiles ? true : ...` survives. A primary sheet with fewer tiles
  than its smallest split (e.g. B with 8 tiles and an entry picking tile 9 under F's 12-tile split) would pin it. This
  is low value, because real primaries fill their halves.
- `a failed border read inside usage` pins the wrapper's map prefix. If usage.ts later adopts the guarded reader, the
  correct `data/layouts/O/border.bin: ...` message would fail this test. Asserting `code === "BAD_VALUE"` plus
  `toContain("border.bin")` would survive that improvement.

## Did the fix round weaken any test?

No. Every changed assertion is stronger:
- `/20|32/` and `/8/` became the exact `N metatiles`, `cannot append metatile N` and `startsWith(metatilesBin)`
  checks.
- The cross-half test now ties each layout id to its own source via `segment()`. I hand-checked the pairs:
  - tile 8: E→S, F→A (12-tile split), H/X→T.
  - palette 2: E→S, F→A (3-palette split), H/X→T.
  - S tile 0: E/F→A, O→B.
- The shared-grid confirm addition uses local 2, which no disk grid or border contains, so only the R3 winner
  (SharedA when both are staged) decides. M9 (reversed winner) is killed.
- The added `Frlg`/`Extra` `[0]` grids in the first half of that test do not change its usage assertions.

No expected value is computed with the code under test. The usage test counts raw words itself, and the revision
oracle is independent.

## Not checked
- I did not run vitest or a mutation of my own (brief forbids it while `mut_t7b` runs). The kill claims above are
  hand traces.
- Task 6 files are out of scope.
- I did not do the spec-role items (G2c/G6a pinning in depth, the spec reviewer's I1-I3).
