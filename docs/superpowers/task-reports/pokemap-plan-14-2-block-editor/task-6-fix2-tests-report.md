# Plan 14.2 Task 6, fix round 2 — test report

## Scope

Only `packages/core/test/blockEdit/gbcOps.test.ts` was changed. All new helpers live in that file; no source file, dependency, fixture, plan or ruling document was touched. Vitest was not run (per the brief; the conductor runs it). No commit was made.

Risk tier: high. The work pins byte-level losslessness of the planner's text round trip and an R5a refusal-precedence boundary, all via fixtures derived from the test's own byte/text work.

## Fixture discipline

- Every expectation is built from the test's own parsing: `names()` reads `tilepal` text, `sourceLines()` keeps per-line endings, `lineCode`/`lineComment` feed the changed-line oracles, and `readGbcCollisionRecords` is used only where the plan's own parser shape is wanted. Production planners are used only to run the plan; never to decide an expected result.
- No test borrows `patchGbcCollision`/`patchGbcPaletteMap`/`copySheetTile` to compute an expected value. Expected bytes are engineered inputs (latin1 + CRLF + an embedded `0xE9`) compared as raw byte counts and line spans.
- Scanned fixtures fail with explicit messages; CRLF conversions go through one shared `toCrlf` (`\r\n` collapsed to `\n` first), so a lone-CR file cannot end up mixed.

## What was added per item

1. **Byte-lossless text round trip.** New corpus test `staged CRLF and latin1 text survives the planner byte for byte`. A forest block with a palette-mapped tile is chosen by scan (`expect.fail` via a `toBeDefined` message when absent); staged collision and palette-map buffers are built from disk bytes by the test's own string work: latin1 decode, CRLF normalization, and `0xE9` embedded in a `;` comment on the record-N line (collision) / edited-tile line (palette) and on at least one other line each (lines without a comment get a trailing ` ; caf\u00E9`). Both staged buffers are asserted to contain `0x0D` and `0xE9`. One OK edit re-points block N's first collision name to another name found in the file's own collision text and carries one `scope: "all"` entry renaming the mapped tile to `alternate(current)`. Asserts: `edit.before` equals the staged buffers (not disk); collision `after` passes `expectOnlyCollisionRecordChanged`, keeps the staged `0x0D`/`0xE9` counts, contains no `EF BF BD` and no new `0xFD` (checked as `0xFD` byte count equal to the staged buffer's), and `readGbcCollisionRecords(after)[N]` equals the draft's four names; palette `after` passes `expectOnlyPaletteTilesChanged`, passes the same `0x0D`/`0xE9`/`EF BF BD`/`0xFD` checks, maps every tile to its staged name except the renamed tile, and the changed line keeps its comment with the `0xE9` and its `\r\n`.
2. **Raw-zero border confirmation.** `confirm true when another map reaches the block only through raw-zero border cells` rewritten: every map is staged (`gridsFor(p, id)`, filler never equal to `id`), `other`'s grid is then replaced with all-zero, a scan asserts no staged grid contains `id`, `other.border === id` is asserted, and the plan must emit edits and confirm `true`. The old `expect(zeroGrid).not.toContain(id)` guard was dropped; the test's name is unchanged. Only the border clause can now answer `true`.
3. **R5a All BAD_VALUE precedes Local refusal.** New corpus helper `expectAllBadValueBeforeLocalRefusal(order)` plus two tests (`Local listed first` / `All listed first`). From a `localFixture` with a mapped reserved source staged at square 0 and `0x60` staged at square 2 (draft built from staged bytes so both are untouched), a `scope: "local"` entry on square 0 and a `scope: "all"` entry on square 2; both orders must refuse `BAD_VALUE` naming the palette-map path (not `RESERVED_TILE`). Precondition asserted in the same helper: the draft with only the Local entry refuses `RESERVED_TILE` naming `tile $xx:`.
4. **Local entry on a no-entry tile.** `Local palette entry on an untouched tile with no palette-map entry refuses BAD_VALUE`: the `$60` fixture copied as a `scope: "local"` variant; expects `BAD_VALUE`, message names the palette-map path, and message does **not** start with the gfx (PNG) path. The negative prefix check is asserted manually because `refusal()` only supports a positive `prefix` argument.

## Existing lines changed

- `paletteLineHolding`: lines are now stripped of one trailing `\r` before the `tilepal` match (line indices unchanged, LF behaviour identical). This was necessary because `expectOnlyPaletteTilesChanged` (which item 1 must call on CRLF text) calls this helper, and the old regex could not match a line ending in `\r`. This is the only edit to pre-existing code; no existing assertion was loosened or removed.
- `confirm true when another map reaches the block only through raw-zero border cells`: rewritten body as specified in item 2; signature, name and the scan/`expect.fail` fallback structure kept.
- The two `itWithGbcCorpus` blocks for item 3 are new; the item 4 test is new; the item 1 test is new.
- New module-level helpers: `countByte`, `toCrlf`, `markLatin1Comments`, `otherLineIndex`, `expectAllBadValueBeforeLocalRefusal`. All other tests, helpers and imports are untouched.

## Expected pass / fail

All four items pin behaviour the current implementation already has (CRLF/latin1-safe patchers, `edit.before` = staged bytes, border-clause confirmation, All-before-Local ordering and its precedence over Local's `RESERVED_TILE`, `BAD_VALUE` for a `0x60` tile regardless of scope). None is expected to fail; if one does, it means an implementation change happened that this round did not sanction.

## Verification and limitations

- `npm run typecheck` could **not** be run in this session: the shell tool rejected the command as permission-denied (only a read-only `git diff` pass succeeded; `npm` and `cat`/`ls`/`grep` via shell are blocked). The file was reviewed manually end to end for syntax and type issues (tuple narrowing, `readonly` arrays, contextual typing of `palettes` literals, `Buffer.reduce` on `Uint8Array`, `indexOf(";")` on latin1 text). The conductor must run typecheck before accepting this round.
- No Vitest run and no mutation checks, as directed; fixture availability on this machine was not exercised. The CRLF/latin1 oracle relies on `scanCalls`/`codeLines` excluding `\r` from line spans and on `names()` splitting on `/\r?\n/`; both were read, not executed.
- 0xFD check is implemented as equality of 0xFD byte counts between staged and `after` (the spec's "no 0xFD byte that the staged buffer did not have"); since the `after` text differs from the staged text only inside ASCII name spans, count equality is sufficient to detect any new 0xFD.
- Item 1 does not assert the `metatiles` edit away: it pins collision and palette only, as specified.
- Combined `git diff` (test file only) is the single artifact for review; no commit was made.
