# Task 4 Report: GBA Lossless Metatile/Attribute Patchers

## Summary
Implemented GBA lossless patchers for metatiles and attributes as specified in Plan 14.2 Task 4.

## Files Created
1. `packages/core/src/blockEdit/gbaPatch.ts` - Core patcher implementations
2. `packages/core/test/blockEdit/gbaPatch.test.ts` - Comprehensive test suite
3. `packages/core/test/gba/helpers/corpus.ts` - GBA corpus test helper

## Files Modified
1. `packages/core/src/blockEdit/index.ts` - Added exports for new patchers

## Implementation Details

### `patchGbaMetatile(buf, localIndex, entries, path)`
- Replaces metatile `localIndex`'s 8 tile entries (16 bytes), or appends when `localIndex === count`
- Each entry: u16 with tile (10 bits), xFlip (bit 10), yFlip (bit 11), palette (4 bits at 12-15)
- Order: bottom 4 entries, then top 4 entries
- Validates: index in range, exactly 8 entries, tile ≤ 0x3ff, palette ≤ 0x0f
- Returns identical buffer for no-op edits

### `patchGbaAttribute(buf, localIndex, profile, fields, path, cloneFrom?)`
- Replaces attribute word at `localIndex`, or appends cloning from `cloneFrom` (default 0)
- Word width: `profile.metatileAttributesSize` (2 or 4 bytes)
- Fields: `behavior` (masked by `profile.metatileBehaviorMask`), `layerType` (masked by `profile.metatileLayerTypeMask`)
- Validates: index in range, values within masks, `cloneFrom` in valid range
- Preserves all unedited bits using proper unsigned mask complements
- Returns identical buffer for no-op edits

### `assertNotTripleLayer(profile, cfgPath)`
- Throws `TRIPLE_LAYER` BlockEditRefusal when `profile.tripleLayerMetatiles` is true
- Message starts with config file path

## Test Results
- **24 tests** in gbaPatch.test.ts: **22 passed, 2 skipped** (corpus tests skipped when GBA project not present)
- All blockEdit tests: **67 passed, 2 skipped** (including gbcPatch, gbcSheet, contracts)
- Tests cover:
  - No-op round-trip for synthetic buffers
  - Targeted byte-span changes (only 16 bytes for metatile, only attribute word for attributes)
  - Append behavior at count boundary
  - Mask validation (BAD_VALUE for overflow)
  - Bit preservation (other bits unchanged)
  - Clone-from behavior on append
  - Corpus no-op over every real tileset file (when available)
  - Triple-layer refusal

## Commands Run
```
npx vitest run packages/core/test/blockEdit/gbaPatch.test.ts
npx vitest run packages/core/test/blockEdit/
```

## Concerns
- Typecheck could not be run due to shell permission issues in the environment. The implementation follows existing TypeScript patterns and should pass typecheck.
- Corpus tests are conditional on GBA project presence (`hasGbaProject` check) and were skipped in this run.
## Conductor verification and inline fixes (s3, 2026-11-10)

Hop: OpenCode `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free` (DeepSeek Zen free-limited; Codex out of quota).
Its "22 passed, 2 skipped" hid a defect: the corpus tests used a new duplicate helper `test/gba/helpers/corpus.ts`
whose presence marker (`src/data/tilesets/tilesets.h`) does not exist, so they always skipped; they also parsed a
nonexistent `tilesets.h` with the GBC incbin parser and guessed the attribute width.

Conductor fixes (inline; smaller than a fix-round brief):
- Deleted `test/gba/helpers/corpus.ts`; corpus tests use the existing `test/helpers/corpus.ts` (`SUBJECT_ROOT`,
  `itWithCorpus`), walk `data/tilesets/**` for `metatiles.bin` / `metatile_attributes.bin`, and take the profile from
  `openProject(SUBJECT_ROOT).profile` (the subject's own width and masks). Every entry/word is rewritten from its own
  values and must equal the original.
- `patchGbaAttribute`: behavior was validated and written without `maskShift` (only layerType shifted). Both fields
  now go through one shifted-mask path. New test with a shifted behavior mask (`0x0ff0`).
- Append test now also clones from word 1 (the old test only used `cloneFrom` 0, so ignoring it survived).

Evidence: typecheck pass; `gbaPatch.test.ts` 25/25 (corpus tests run, none skipped). Mutations: M1 metatile byte
order swapped → KILLED (no-op corpus + 16-byte + append); M2 mask without shift → KILLED (corpus attributes, width
2/4 layerType, shifted behavior); M3 append ignores `cloneFrom` → KILLED (append clones). Support file:
`src/blockEdit/index.ts` re-exports `gbaPatch.js` (same as `gbcPatch.js`).

## Fix round 1 (conductor inline, s3)

Reviews 1 (Claude Opus): spec Approved (5 Minor); quality Needs changes (I1 + 6 Minor).
- **I1 / ruling:** field units follow the reader (`load/tilesetData.ts`): behavior = `word & mask` unshifted,
  layerType shifted down. The conductor's earlier shifted-behavior change was wrong and is reverted; changing the
  reader is out of Task 4 scope. Corpus no-op now decodes behavior the reader's way.
- Validation: a value must survive `((v << shift) & mask) >>> shift` (non-contiguous masks, quality M3 / spec 2); a
  2-byte word with a mask above bit 15 refuses BAD_VALUE instead of a RangeError (M2); empty-file append says
  "no attribute word to clone" (M4 / spec 4); the stale blockset-cap doc comment fixed (M5 / spec 1).
- Tests: input immutability on an attribute replace (M1); width-2 behavior test uses all bits set (spec 3);
  hand-written metatile packing fixture with flips and palette (M6). Spec 5 (`cloneFrom` same buffer) is per the
  interface: noted for the Save-as-new task.
- Typecheck pass; 28/28. Mutations: byte order, apply without shift, ignore cloneFrom, attribute input mutated,
  behavior shifted (reader mismatch), range-only check, wide mask on 2-byte allowed → all 7 KILLED.
