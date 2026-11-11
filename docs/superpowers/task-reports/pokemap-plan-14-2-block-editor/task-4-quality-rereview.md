Approved

# Plan 14.2 Task 4 quality re-review (fix round 1)

Scope: `git diff 7fcc184..1cad519` in the wt-t4 worktree. Read-only: I ran no tests and edited no code. I checked
the bit arithmetic by hand.

## I1 ruling: patcher follows the reader's units. Sound.

- Behavior now uses `shift: 0` with `mask >>> 0`, and layerType uses `maskShift`. This matches tilesetData.ts:96-97
  exactly, so any value the reader gives the UI goes back through the patcher with no change. For every default
  mask (0xff, 0x1ff) and for the subject cfg (0xFF), the two conventions give the same result, so nothing changes
  for real data.
- The reader-convention test checks it by hand. Mask `0x0ff0` with behavior `0x120` on `0xffff` gives
  `(0xffff & ~0x0ff0) | 0x120 = 0xf12f`. Behavior `0x12` gives `0x12 & 0x0ff0 = 0x10`, which is not `0x12`, so it
  is refused. Correct.
- The corpus no-op now decodes behavior the reader's way, so the test checks the actual contract.
- Known divergence (not a defect in this task): Porymap shifts behavior, while the reader and the patcher do not.
  For a project with a shifted behavior mask, PokeMap's behavior numbers would not match Porymap's `MB_*`
  constants. It should be recorded where the ruling is logged (spec or RESUME), so a later task that maps
  behavior names does not hit it.

## M1-M6: all resolved

- **M1:** the width-2 behavior test now uses an all-ones word and asserts `buf` is unchanged. Swapping
  `Buffer.from(buf)` for `buf` would fail it.
- **M2:** `size === 2 && mask > 0xffff` now refuses with BAD_VALUE, and the message starts with the path. The
  check runs only when that field is edited, so behavior-only edits on such a profile still work. The test covers
  FRLG masks with size 2.
- **M3:** the round-trip check `((value << shift) & mask) >>> shift !== value` holds up on every edge I tried:
  - Mask `0x0500` with value 2 gives 0, so it is refused.
  - Mask `0x60000000` with value 3 gives `0x60000000 >>> 29 = 3`, so it is accepted.
  - Value 11 at shift 29 loses bit 32 and gives 3, so it is refused.
  - A bit-31 mask with value 1 gives `-2^31 & -2^31`, and `>>> 31` gives 1, so it is accepted.
  - Behavior 0x80000000 with mask 0xffffffff: `<<0` gives an int32, and `>>> 0` turns it back into 2147483648,
    so it is accepted.
  - A value of 2^32 or more is truncated by ToInt32 and then fails the comparison, so it is refused.
- **M4:** an empty buffer now gives "`<path>`: no attribute word to clone", and a test checks the message.
- **M5:** the doc comment now says the caller owns the cap.
- **M6:** a hand-written fixture covers flips and palette. Entry 3 encodes as
  `0x2a5|0x400|0xb000 = 0xb6a5`, stored as bytes `a5 b6`. Entry 0 encodes as `0x001|0x800|0x2000 = 0x2801`,
  stored as bytes `01 28`. Both expectations are correct, and the test does not depend on the corpus.

## New defects

None blocking.

- Minor, informational: if a cfg sets bit 31 in the behavior mask, the reader's `attr & mask` returns a negative
  int32, because the reader does not apply `>>> 0`. The patcher refuses any value below 0, so a no-op save on that
  profile would be refused rather than corrupted. Real configs do not do this. The safe fix belongs in the reader
  if it is ever needed.
