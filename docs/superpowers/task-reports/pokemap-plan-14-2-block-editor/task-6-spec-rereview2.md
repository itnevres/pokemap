Approved -- 0 Critical, 0 Important, 0 Minor (3 notes, none blocking).

Task 6 spec re-review 2 (fix round 2), Plan 14.2. Reviewed `6287878` in the detached checkout `rv-t6`, against `891361d`. The review was static only: no vitest run and no edits. Scope is `git diff 891361d..6287878 -- packages/`: `b127bb1` changes tests only, and `6287878` adds the `errorText` helper. Paths are relative to the checkout. `ops` is `packages/core/src/blockEdit/gbcOps.ts`, `test` is `packages/core/test/blockEdit/gbcOps.test.ts`. Mutation evidence comes from the conductor's `mut_t6c.out` (baseline 57/57, 30 mutants all KILLED). I traced each new test by hand against the planner, and the results match that run.

## Closure of re-review 1 findings

### I1, planner latin1/CRLF round trip: Closed

Test at test:378-444. Helpers: `toCrlf` (test:236), `markLatin1Comments` (test:241-250), `countByte` (test:233), and `otherLineIndex` (test:252-256).

**Fixture**
- It uses the forest tileset, and block N is the first block that holds a palette-mapped tile.
- The collision and palette-map texts are converted to CRLF.
- A latin1 `0xE9` goes into a `;` comment on two lines of each file: the edited line (record N, and the tilepal line that holds `tile`) and one other line.
- Both files are staged, and the test asserts that both staged buffers contain `0x0D` and `0xE9` (test:406-409).
- The draft changes record N's first collision name and adds one All rename. The tiles do not change, so the tile validation at ops:144-148 skips every square.

**The four encoding sites, each mutated on its own**
- **ops:136, collision decoded as utf8.** In the staged bytes `E9 0D 0A`, the lone `E9` decodes to U+FFFD. The utf8 decoder resyncs at `0D`, so the CR survives. U+FFFD is then encoded as latin1 `0xFD` at ops:239. The `0xE9` count drops by 2 and the `0xFD` count rises by 2 (test:424, 426). `expectOnlyCollisionRecordChanged` also fails, because the other marked line now differs. Killed (M20).
- **ops:239, collision encoded as utf8.** `é` becomes `C3 A9`, so the `0xE9` count drops to 0 (test:424). Killed (M22).
- **ops:139, palette map decoded as utf8.** Same failure as ops:136, caught by test:433 and 435. The other-line check in `expectOnlyPaletteTilesChanged` (test:431) also fails. Killed (M21).
- **ops:240, palette map encoded as utf8.** The `0xE9` count drops to 0 (test:433). Killed (M23).

A line-ending normalizer in either path would change the CR counts (test:423, 432) and the line-count and line-equality checks. The test also catches that.

**Oracle independence**
- Expected palette names: built from the test's own `names()` on the staged text with one override (test:437-439).
- Changed palette lines: the test's own `paletteLineHolding`.
- Comment and line ending of the changed line: checked by raw string (test:440-442).
- Bytes outside record N: `expectOnlyCollisionRecordChanged`, a byte-exact join of every other line.
- One expectation uses a production function: record N's new contents are read back with `readGbcCollisionRecords` (test:427), which lives in `gbcPatch.ts`. That function is the reader, not a patcher, and the existing `draft()` helper already relies on it. The patchers, `copySheetTile`, and the planner supply no expected value. I accept this. See Note 1.

### M1, raw-zero border-cell confirm test: Closed

Test at test:885-908.

- Every map now gets a staged grid from `gridsFor(p, id)`. That fill value is 1 or 2, never `id`. `other` gets an all-zero grid, and `id = other.border > 0`.
- `effectiveGrid` (ops:22-26) returns the staged grid whenever any map on the same `.blk` has one. Here every map has one, so no grid includes `id`. Test:898-900 asserts that precondition with the test's own scan.
- The only way `confirm` can be true is `other.border === req.blockId` (ops:250). With the border clause removed, `confirm` is false and the test fails. `mut_t6c.out` M18 shows this test killed, alongside the older border test.
- See Note 2 for redundancy and naming.

### M2, R5a refusal precedence: Closed

Helper `expectAllBadValueBeforeLocalRefusal` at test:342-361, run in both orders (test:520-525).

**Fixture**
- Metatiles staged with square 0 set to a reserved, palette-mapped source and square 2 set to `0x60`. The draft reads the staged bytes, so the tiles equal the source block and nothing is validated at ops:144-148.
- Local entry on square 0 with a palette different from the current one, so it is a real change. All entry on square 2 with `RED`. `initialPalette.names[0x60]` is undefined, so that entry is also a change.

**Current code**
- The All loop (ops:178-181) runs first and refuses at ops:179 with `BAD_VALUE <palPath>: tile 96 has no palette-map entry`. That matches the expected code and the palette-map path.

**In-order loop, Local listed first**
- The Local entry is processed first.
- The no-entry guard (ops:183) passes, because the source is mapped.
- LOCAL_SHEET_MISMATCH does not fire, because `localFixture` excludes mismatched sheets.
- `reserved.has(source)` (ops:190) then throws `RESERVED_TILE`, which does not match `BAD_VALUE`, so the test fails.
- The All-first case passes on an in-order loop, as expected. M29 (All loop after the Local loop) kills both orders.

**Non-vacuity**
- The second call (test:357-360) proves that the Local entry alone refuses `RESERVED_TILE` with the `tile $xx:` prefix, which matches ops:191.
- `loadGbcReservedTiles` is the shared loader, not the planner, and the second call checks it against planner behavior.

### M3, Local no-palette-entry guard: Closed

Test at test:783-800.

- Local on a staged `0x60` square refuses `BAD_VALUE` whose message contains the palette-map path and does not start with the gfx path.
- Without ops:183, the result is either `RESERVED_TILE` (if `0x60` were reserved) or `BAD_VALUE <gfxPath>: tile 96 has no sheet pixels` from ops:194. Either fails the test. M27 killed.
- The All-scope guard at ops:179 is still redundant with `patchGbcPaletteMap` (gbcPatch.ts:174-175). Re-review 1 allowed that as an option, so it is not reopened.

## Other checks in the brief

- **`paletteLineHolding` CRLF change (test:183-194).** JS `.` does not match `\r`, and `$` without the `m` flag anchors at the end of the string. The old helper therefore never matched a CRLF tilepal line. Stripping a trailing `\r` is a no-op for LF text, and the corpus palette maps the existing tests read are LF. Line indices are unchanged. The existing tests mean the same thing as before.
- **Source change `errorText` (ops:20, 91, 110, 119).** An `Error` value gives the same text as before. A non-Error throw now reads as `String(error)` instead of `undefined`. The refusal code and the message prefix are unchanged, and no other source line changed.
- **New expectations checked by hand.** I checked every new `expect` in the four tests and the helpers. None is tautological except test:901 (Note 2), and none takes its expected value from the planner, a patcher, or `copySheetTile`.

## New findings

None.

## Notes (not findings)

1. **Record N contents use the production reader.** test:427 reads record N with `readGbcCollisionRecords`. If the reader and `patchGbcCollision` shared a field-order bug, this assertion would not notice. The line-level check still pins that only record N changed and kept its indentation, comment and ending, and that its content differs. The gbcPatch unit tests own the patcher's argument layout. A hand-built expected record line would remove the dependency, but that is optional.
2. **The M1 test is now a duplicate.**
   - It is behaviorally the same as "confirm true when another map only uses it as its border" (test:880-884). The all-zero grid for `other` does not affect the result, because the planner never treats raw-zero cells as the border (ops:250 matches only `req.blockId`).
   - The "raw-zero border cells" title therefore describes the fixture, not a code path.
   - test:901 (`other.border === id`) cannot fail, because `id` is defined as `other.border` at test:894.
   - This is harmless. Renaming or deleting the test is optional.
3. **The non-Error branch of `errorText` has no test.** Reverting `errorText` to `(error as Error).message` would survive the suite. The only effect is the message text for a non-Error throw, and nothing in the planner's call graph throws non-Errors today. This was the quality reviewer's Minor, and it is not a spec requirement.

Not re-run by me: the 57/57 baseline, the 30-mutant run, and typecheck. I took these from the conductor's `mut_t6c.out`, and they agree with my traces for M18 and M20-M29.
