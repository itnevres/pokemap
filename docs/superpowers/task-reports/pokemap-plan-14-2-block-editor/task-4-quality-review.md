Needs changes

# Plan 14.2 Task 4 quality review: GBA lossless patchers

Range: `380b5e9..7fcc184` (worktree wt-t4). Read-only review: I ran no tests and edited no code. I read
`gbaPatch.ts`, `gbaPatch.test.ts`, `load/tilesetData.ts` (reader) and `config/engine.ts` (`maskShift`, profiles).

## What holds (re-derived by hand)

- Metatile encode `tile&0x3ff | x?0x400 | y?0x800 | pal<<12` matches the reader's decode at tilesetData.ts:86-91
  bit for bit. Entries are written in input order, so "bottom 4 then top 4" round-trips as long as the caller uses
  the reader's `metatile(id)` array order (the reader also emits file order).
- 32-bit masks. For `0x60000000`, `maskShift` gives 29 (`>>` sign-extends, but the loop stops at bit 29) and
  `mask >>> 29 = 3`, so the range check is right. In `applyFields`, `~mask` is `0x9fffffff` as an int32 and the
  `|` result can be negative, but the trailing `>>> 0` normalises it. The final `writeUInt32LE(word >>> 0)`
  normalises it a second time. For a bit-31 mask (`0x80000000`): shift is 31, `1<<31` is negative, `& mask` is
  still correct, and `>>> 0` fixes the sign. No sign bug.
- Precedence: `value > mask >>> maskShift(mask)` parses as `value > (mask >>> shift)`, which is correct.
- Losslessness: replace paths copy with `Buffer.from(buf)` and touch one record or word. Append uses
  `Buffer.concat` or `alloc+copy`. The input is never mutated. For an unchanged record the write is identical.
- `cloneFrom` bounds are checked before the read. A `localIndex > count` refusal and non-integer refusals are in
  place. Every message starts with `path` or `cfgPath`.
- Conductor mutations (byte-order swap, mask without shift, append ignores cloneFrom): I agree the named tests
  catch each one. Byte-order swap is caught by the corpus no-op. Mask without shift is caught by the width-2
  layerType test (3 & 0xf000 = 0). Ignoring cloneFrom is caught by `fromOne` (expects 0x78ab).

## Critical

None.

## Important

### I1. Behavior encode does not match the reader for a shifted behavior mask

- Where: gbaPatch.ts:116-129 (behavior validated and placed with `maskShift`) against tilesetData.ts:97.
  The reader does `behavior: (attr & metatileBehaviorMask)` with no shift. `layerType` is shifted at :96.
- The test at gbaPatch.test.ts:264-271 pins the shifted semantics, so the mismatch is now built into the tests.
- Failure scenario: a project's `porymap.project.cfg` sets `metatile_behavior_mask=0x0FF0`. The reader reports
  the behavior of word `0x0120` as `0x120`. The block editor fills its form from `ts.behavior()` and saves it
  unchanged. The patcher checks `0x120 > 0xff` and refuses with BAD_VALUE, so a no-op save fails. A value
  `<= 0xff` from the reader, such as `0x10` (the reader can return this only if the bits were already shifted),
  is shifted a second time and written to the wrong bits. That silently corrupts the attribute.
- Today's subject uses `0xFF` (shift 0), so no current test or corpus run can see this. The corpus no-op test
  (test:307) decodes with its own shifting `field()`, not with the reader, so it does not compare against the
  reader at all.
- Fix: pick one convention. Porymap's BitPacker shifts behavior, so the patcher's convention is the right one.
  Make tilesetData.ts:97 shift (`>>> maskShift(behaviorMask)`, which is a no-op for 0xff and 0x1ff). Then make
  the corpus no-op decode through the reader (`loadTileset(...).behavior/layerType`) instead of the inline
  `field()`. That way the test checks "field encode matches the reader", which is the actual contract. If the
  reader change is out of scope for this task, log it as a blocker for whichever task first feeds reader values
  into `patchGbaAttribute`.

## Minor

### M1. No test catches mutating the attribute input in place

- Where: gbaPatch.ts:163 (`Buffer.from(buf)`) and :149-150.
- Failure scenario: replace `const out = Buffer.from(buf)` with `const out = buf`. Every attribute test still
  passes. No attribute test re-checks `buf` afterwards, and the corpus no-op writes identical values. In this
  task, input immutability is what keeps the overlay and discard ownership safe: a later caller that passes the
  cached on-disk buffer would get it changed with no save.
- Fix: add one `expect(buf).toEqual(copyBefore)` to a width-2 replace test.

### M2. A width-2 profile with a mask above bit 15 throws RangeError instead of BlockEditRefusal

- Where: gbaPatch.ts:127 and :174.
- Failure scenario: a cfg with `base_game_version=pokefirered` and `metatile_attributes_size=2` keeps the FRLG
  layer mask `0x60000000`. `layerType: 1` passes validation (`1 <= 3`). `applyFields` produces a word above
  0xffff, and `writeUInt16LE` throws a Node `RangeError`. The route then answers 500 instead of 409 with
  `{error, code}`.
- Fix: refuse with BAD_VALUE (subject `path`) when `mask >>> 0 > 0xffff` and size is 2. Alternatively, skip the
  check and record it as a known edge case.

### M3. The range check does not reject non-contiguous masks

- Where: gbaPatch.ts:119.
- Failure scenario: mask `0x0500` gives shift 8 and a limit of 5. `behavior: 2` passes validation, then
  `(2<<8) & 0x500 = 0` drops the value silently with no refusal.
- Fix: also refuse when `((value << shift) & mask) >>> shift !== value`. This is one condition and covers every
  mask shape.

### M4. Appending to an empty attribute file is always refused, with a garbled message

- Where: gbaPatch.ts:136-139.
- Failure scenario: with `count = 0`, every `cloneFrom` fails, and the message reads
  `cloneFrom 0 is outside the valid range 0--1`. It is rare, because a tileset with no attributes also has no
  blocks to clone, but the message is poor and the case is untested.
- Fix: say "no attribute word to clone" when `count === 0`.

### M5. The doc comment promises a blockset cap that the code does not enforce

- Where: gbaPatch.ts:19-21 says "appending past the blockset cap is the blockset cap". No cap check exists in
  `patchGbaMetatile`, so an append past `metatilesPrimary` and similar limits succeeds.
- If the cap belongs to a later task (spec line 135, "refuses at the cap/limit naming the file"), fix the
  comment so a caller does not assume the patcher guards it.

### M6. Unit-test oracles copy the implementation and never exercise flips or palette

- Where: test:42-56 and :64-76.
- The expected values reuse the patcher's own formula, and every entry has `xFlip=false`, `yFlip=false` and
  `palette=0`. A swapped 0x400/0x800 or a wrong palette shift is caught only by the corpus test, which is
  `it.skipIf(!hasProject)` (helpers/corpus.ts:16) and is skipped wherever the corpus is absent.
- Fix: add one hand-written fixture, for example `{tile:0x2a5, xFlip:true, yFlip:false, palette:0xb}` gives
  `0xb6a5`, stored as bytes `a5 b6`.
