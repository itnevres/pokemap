Needs changes -- 0 Critical, 1 Important, 3 Minor.

Task 6 spec re-review (fix round 1), Plan 14.2. Reviewed `891361d` in the detached checkout `rv-t6`, against `c4600c7` (fix round) and `e2dfa27` (whole task). The review was static only: no vitest run and no edits. Mutation evidence comes from the conductor's `mut_t6b.out` (20 mutants, all KILLED), plus my own trace of each new test against the old and new code. Paths below are relative to the checkout. `ops` is `packages/core/src/blockEdit/gbcOps.ts`, `test` is `packages/core/test/blockEdit/gbcOps.test.ts`.

## Review-1 spec findings

1. **Local palette overwritten by a later All entry: Closed.**
   - Fix: ops:176-179 applies every All rename before the Local loop at ops:180. The Local reuse scan judges candidates by `currentPalette`, which is re-parsed from the renamed `paletteText` (ops:193, 198).
   - Test: `expectLocalSurvivesAllRename` (test:288-310), run in both entry orders (test:390-395). The fixture stages B = `free[1]` as an identical copy of the source in `f.pal`, puts B in the draft, and adds All B -> another palette.
   - Old code (c4600c7 loop order), localFirst: Local reuses B, then All renames B, so the plan has no gfx edit and the metatiles point to B. The test expects a gfx+meta+pal edit set and source squares moved to the free slot. The test fails on old code.
   - New code: B is renamed first, so reuse fails. B is in `d.tiles` (ops:218), so the copy lands on `free[0]`. This matches the test's `freeSlots(...)[0]`.
   - The test builds its own expectations: metatile bytes by assignment, pixels by comparing decoded tiles, names through the test's own `names()` parser. None come from production code.
   - allFirst passes on old code too, because the old code also used `currentPalette`. localFirst is the case that pins R5a.

2. **Mixed-draft oracle independence: Closed.**
   - test:563-580 no longer calls `copySheetTile` or `patchGbcPaletteMap`.
   - Pixels: each decoded sheet tile is compared with the before tile, and the slot is compared with the source pixels.
   - Palette: a full name map from the test's `names()` (test:24-36), with exactly two entries overridden. `expectOnlyPaletteTilesChanged` (test:190-196) also checks which lines changed, using the test's own `paletteLineHolding` scan.
   - The decoder (`readShadesPng`/`sliceTiles`) is the shared loader, not the planner or a patcher. That is acceptable.
   - `allSquare` is now a real `findIndex` (test:567) instead of the hard-coded 0 that could not fail.

3. **Collision "only record N" losslessness: Partly closed. Remaining gap filed as I1 below.**
   - `expectOnlyCollisionRecordChanged` (test:207-224) is now asserted in the OK test (test:322) and the forest surplus-record test (test:335).
   - It checks that only record N's line differs, that indentation, comment and line ending are preserved, and that the bytes outside record N are byte-identical. That closes "normalizes CRLF / strips comments" for content that exists in the corpus. Every corpus collision file has 64-128 `;` comments.
   - The CRLF and latin1 sentinel half was not done. See I1.

4. **ALL_WITH_SAVE_AS_NEW message lacks alternatives: Closed.**
   - Message at ops:160: `<metaPath>: an All palette change cannot be saved as new; use Local or OK`.
   - Test test:561-564 requires `Local` and `OK`. The old message contains neither, so the old code fails this test.

## Review-1 coverage gaps

- **Two Local allocations (`taken`): Covered.**
  - `doubleLocalFixture` (test:230-286) and the test at test:410-433.
  - Without `taken`, the second source would also choose slot1. `used` is computed once and slot1 is not in `d.tiles`, so the test's expected `slots[1]` mapping fails. Its expectations are independent.
- **Reuse ahead of a lower free slot: Covered.** test:373-379 uses `free[1]`, so `free[0]` is lower and still free. Mutant M5 (reuse disabled) kills it.
- **Local during Save as new: Covered.** test:434-448 checks: new block N appended with source squares moved to `free[0]`, block id unchanged, no placement for `from: "palette"`, PNG copy, and the palette name.
- **Untouched tile with no palette-map entry: Covered for behavior, but the planner guard is not pinned.** See M3.
- **Block-0-as-border confirm: Not effectively covered.** See M1.

## Rulings pinned by a failing-without-fix test

- **R5a:**
  - Ordering: pinned (localFirst, above).
  - Refusal precedence ("All entries' BAD_VALUE first, then Local's"): not pinned. See M2.
- **R1a: pinned.** test:547-555 deletes the collision file in a temp copy.
  - Without the inner try at ops:104-109, ENOENT reaches the R1b wrapper. The message then starts with the map name, so the `ts.collisionPath` prefix check fails.
  - Without either fix, a native Error escapes and the `toBeInstanceOf(BlockEditRefusal)` check fails.
- **R6a: pinned** (finding 4).
- **R1b: pinned.** test:556-559. `proj.map` throws a plain `Error` (`gbc/load/map.ts:327`). Without the wrapper at ops:83-91, the `BlockEditRefusal` instance check fails.

## New findings

### I1 (Important): the planner's text-encoding round trip is still unguarded

Locations: ops:134/237 (collision), ops:137/238 (palette map). Tests: test:322, 335.

- The planner decodes and re-encodes both texts as latin1.
- Every collision file in the corpus (`pokecrystal-PerfPlus/data/tilesets/*_collision.asm`, all 37 checked) has 0 CR bytes and 0 bytes above 0x7F. The palette fixtures come from the same corpus.
- Concrete failure: someone changes `toString("latin1")` / `Buffer.from(..., "latin1")` to the default utf8 at ops:134 and 237. A subject file with a latin1 `0xE9` in a comment would then be written back with `EF BF BD` in its place. That corrupts a subject-repo source file on every OK or Save-as-new, and every Task 6 test still passes.
- The gbcPatch unit tests cover CRLF and latin1 for the patchers themselves. The planner's own decode/encode choice is what has no test, and that is the case review 1 named.
- Fix: one test that stages a collision text (and ideally a palette-map text) with CRLF endings and a non-ASCII latin1 byte in a comment. Assert the full `after` buffer against a test-built expectation, where only record N's arguments differ.

### M1 (Minor): the "raw-zero border cells" confirm test does not test what its name says

Location: test:743-760.

- In `mut_t6b.out`, mutant M18 (`other.border === req.blockId ||` -> `false ||`) is killed only by the older test "confirm true when another map only uses it as its border". This new test passed with the border clause removed.
- So confirm is true here through another path: some third map on the same metatiles draws `id` in its disk grid. The test never excludes that.
- Its guard `expect(zeroGrid).not.toContain(id)` cannot fail, because `id = other.border > 0`.
- Behavior is still guarded by the older test, so this is a dead-weight test with a misleading name, not a production defect.
- Fix: choose `other` (and `map`) so that no other map on the metatiles draws `id` or has `border === id`, and assert that precondition with the test's own scan. Alternatively, drop the test.

### M2 (Minor): R5a refusal precedence is not pinned

Location: ops:176-181.

- The rule "All entries' BAD_VALUE before any Local refusal" holds in the code: the All loop runs first.
- No test pairs a Local refusal with an All BAD_VALUE. Example draft: a Local entry on a reserved source (RESERVED_TILE) listed first, then an All entry on an untouched `0x60` tile.
- The old in-order loop would return RESERVED_TILE, and no test notices if the order regresses.

### M3 (Minor): the planner's own no-palette-entry guard is redundant for All and untested for Local

Locations: ops:177 (All), ops:181 (Local). Test: test:651-658.

- `patchGbcPaletteMap` (gbcPatch.ts:174-175) already refuses tile ids `0x60`-`0x7F` with the same `<path>: tile .. has no palette-map entry` BAD_VALUE. So the test at test:651-658 (All scope) passes with ops:177 deleted. M14 kills it only through a different path.
- The Local guard at ops:181 is not exercised. Without it, Local on `0x60` refuses BAD_VALUE naming the gfx path (ops:192) instead of the palette-map path. That is still BAD_VALUE, so the impact is the message only.
- Fix: add a `scope: "local"` variant of the test, or accept the redundancy.

## Notes, not findings

- Out of fix-round scope: confirm uses `effectiveGrid(...).includes(req.blockId)` (ops:248). Editing block 0 from the palette route therefore confirms for any other map that has raw-0 cells, even though those cells draw that map's border. This over-confirms (it is safe) and follows R8 as written.
- Conductor evidence I could not independently re-run: typecheck, and 53/53 passing.
