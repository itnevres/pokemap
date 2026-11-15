# Plan 14.2 Task 6, fix round 1 — test report

## Scope

Only `packages/core/test/blockEdit/gbcOps.test.ts` was changed. All new helpers live in that file; no source file, dependency, fixture, plan or ruling document was touched. Vitest was not run (per the brief); committing is left to the conductor.

Risk tier: high. The work pins ordering, parse and I/O error boundaries, staged-overlay semantics, and independently scanned numeric fixtures, all of which the new tests must catch without borrowing implementation logic.

## Fixture discipline

- Every expectation is built from the test's own parsing: `names()` reads `tilepal` text, `sourceLines()` keeps per-line endings, `usedOnSheet()` counts raw metatile bytes, `freeSlots()` re-derives the free/used/reserved split, and `expectOnlyPaletteTilesChanged` / `expectOnlyCollisionRecordChanged` compare text spans. Production planners are used only to apply the permitted low-level patchers when constructing inputs, never to decide an expected result.
- Scanned fixtures fail with an explicit message and a 60 s timeout (`localFixture`, `doubleLocalFixture`, the unshared/sheet-alias scans, the raw-zero scan).
- Free slots: `localFixture` only guarantees that `free[0]` has a palette name different from the target palette and different pixels. Tests that need a palette edit therefore use `free[0]`, or explicitly select a slot whose name differs (new reserved-slot test) or whose name is forced to differ (`doubleLocalFixture`).

## The 12 findings and what now pins them

1. **Mixed draft had no independent oracle.** The test no longer checks only a hand-assembled palette map. It now selects a mapped square that is neither the Local source nor square 5, compares every decoded sheet tile against the independently read baseline, compares the full `tilepal` name map after setting only the All tile and the allocated slot, and asserts the set of changed palette lines equals exactly the lines holding those two tiles.
2. **Collision losslessness was unasserted.** `expectOnlyCollisionRecordChanged` now runs on the ordinary edit (`record 1`) and on the `saveAsNew` surplus-record replacement (`record 40`). It requires exactly that record's line to differ, with the same indentation, comment and line ending, and every byte outside that line to be identical.
3. **Reuse above a lower free slot was untested.** The reuse test stages the sheet copy and palette name at `free[1]` while `free[0]` stays lower and free, then asserts the planner repoints to `free[1]` and emits no PNG or palette edit.
4. **All/Local ordering was unasserted.** Two interaction tests (`Local listed first`, `All listed first`) stage an identical copy at `free[1]` with palette P, insert that tile in a non-source square, rename it to Q with an All entry, and also apply a Local entry to the original source. Both orders require: all edits present, the source copied to the lowest free slot (B excluded) with P, the B square keeping B, B renamed to Q, and only those two palette tiles differing. R5a therefore has to resolve All entries before any Local reuse decision.
5. **A failed effective-file read had no refusal.** A temp corpus copy deletes the collision file for a valid unshared Forest map; the planner must throw `BlockEditRefusal("BAD_VALUE")` whose message starts with the canonical collision path. No subject substrings are required beyond that prefix.
6. **`ALL_WITH_SAVE_AS_NEW` did not offer alternatives.** The refusal must now contain both `Local` and `OK`, so the message cannot only describe the prohibition.
7. **Two Local allocations in one draft were untested.** `doubleLocalFixture` scans for a block with two distinct unreserved source tiles, two free slots, no reusable copy for either target palette, and slot names different from both new palettes. The test requires the two sources to take the lowest two slots in entry order, checks the metatile record, every sheet tile, the full palette name map, and the changed palette lines.
8. **`saveAsNew` with a Local entry was untested.** The appended block must receive the repointed tiles at `newBlockId`, block N must stay byte-identical, the sheet must copy to the lowest slot, and the palette must name the slot. `newBlockId` is the effective block count and no placement is returned.
9. **An untouched `$60` tile with a palette entry had no refusal.** A staged block puts `$60` at a square (so it is baseline, not an edited tile) and adds an All palette entry there. The planner must refuse `BAD_VALUE` naming the palette map; it must not fall through to an invalid-tile message for the metatiles file.
10. **Raw-zero border cells were only covered through the shared confirmation fixture.** A new test stages an all-zero grid for another unshared map that shares the metatiles file and uses the target block as its border. The edit must still produce changes and confirmation must be true, so an all-raw-zero map is still treated as drawing the block through its border rather than supplying independent interior use.
11. **An unreferenced reserved tile before the allocator's pick was untested.** The test selects an unreferenced, palette-mapped reserved tile that has a free slot above it whose name differs from the target palette. It appends blocks referencing every free tile below the reserved tile (none is a valid case too), so a scan that ignored reservations would stop at the reserved tile. The allocator must instead skip it and take the first free slot above. It checks the staged `before`, the repointed record, the sheet copy and the palette name.
12. **A tile referenced by the draft itself could be allocated.** A non-source square is set to `free[1]`, so the allocator must skip it and take `free[0]`. The test checks the record, the sheet and the palette, and that the square keeps `free[1]`.

## Existing tests whose expectations changed

- `mixed draft`: replaced the hand-built palette-map equality with decoded-pixel, full-name-map and changed-line oracles (change 1). This is the only existing *passing* test whose expected data changed.
- `Local reuses an identical non-reserved copy...`: the staged copy moved from `free[0]` to `free[1]` so a lower slot really is skipped (change 3). Behaviour expected is unchanged.
- `OK edits only block N's 16 bytes...` and `saveAsNew on forest replaces surplus record 40`: additive losslessness assertions only (change 2).
- `All + saveAsNew refuses ALL_WITH_SAVE_AS_NEW...`: adds the `Local`/`OK` subjects (change 6), which the current message does not satisfy.

## Expected failures against the current implementation

The implementation is expected to be fixed after this round, so these three tests should fail today and pass after the fix:

1. `All entries apply before Local entries (Local listed first)` — today the Local entry is processed first and reuses the staged copy at B before its All rename, so the source points at B and the slot's palette never changes. The All-first variant should already pass.
2. `a failed effective-file read refuses BAD_VALUE naming the file` — today the raw `ENOENT` from `readFileSync` escapes instead of a `BlockEditRefusal`.
3. `All + saveAsNew refuses ALL_WITH_SAVE_AS_NEW offering Local or OK` — today the message is `"<metatiles>: All palette edits cannot be saved as new"` and names neither alternative.

Every other new test is expected to pass against the current planner while pinning behaviour that a wrong fix (for example, dropping the reservation check, the draft-reference check, the free-slot ordering, or palette-line preservation) would break.

## Verification and limitations

- `npm run typecheck` could **not** be run in this session: the shell tool is permission-denied. The file was reviewed manually end to end for syntax and type issues (tuple narrowing in `doubleLocalFixture`, optional `slotAbove` result, immutable `palettes` literals), but the conductor must run typecheck before accepting this round.
- No Vitest run and no mutation checks were run, as directed. Fixture availability and the exact today/pass split above therefore rely on reading the planner and corpus helpers, not on execution.
- The reserved-slot test depends on the corpus having an eligible reserved tile with a free slot above it whose name differs from the target palette; if the scan cannot find one it fails with `"an unreferenced mapped reserved tile before a free slot"` rather than silently skipping.
- No commit was made.
