Approved

# Plan 14.2 Task 4 spec-compliance review: GBA lossless patchers

Range `380b5e9..7fcc184` (one commit, `7fcc184 feat(plan-14.2): GBA lossless metatile/attribute patchers (Task 4)`).
Files: `packages/core/src/blockEdit/gbaPatch.ts` (new), `packages/core/src/blockEdit/index.ts` (+1 re-export),
`packages/core/test/blockEdit/gbaPatch.test.ts` (new), `task-4-report.md`. Nothing outside the task was touched; the
index.ts re-export is the obvious support edit and matches the Task 2/3 pattern.

Read-only review. I ran no tests. The conductor's typecheck pass, the 25/25 run, and the three KILLED mutations are
taken as given. I re-derived every hand fixture below.

## Interface and behaviour checklist

| Requirement (Task 4 / Global) | Where | Verdict |
|---|---|---|
| `patchGbaMetatile(buf, localIndex, entries, path): Buffer` signature | gbaPatch.ts:27-32 | OK |
| 8 entries, bottom 4 then top 4 (written in caller order, i*2) | gbaPatch.ts:36-38, 60-69 | OK. Order is the caller's array order, which matches the file layout. |
| tile 10 bits, xFlip bit 10, yFlip bit 11, palette 4 bits at 12-15 | gbaPatch.ts:42-48, 63-67 | OK, out-of-range values throw BAD_VALUE |
| append at count; `> count` is BAD_VALUE | gbaPatch.ts:55-57, 71-74 | OK |
| input never mutated; unchanged record gives identical bytes | gbaPatch.ts:77-79 (Buffer.from copy) | OK |
| `patchGbaAttribute(buf, localIndex, profile, fields, path, cloneFrom?)` signature | gbaPatch.ts:89-96 | OK |
| width from `profile.metatileAttributesSize` | gbaPatch.ts:101-109 | OK (2/4, LE u16/u32) |
| append clones word `cloneFrom` (default 0), then applies fields | gbaPatch.ts:133-156 | OK |
| value outside mask gives BAD_VALUE | gbaPatch.ts:115-121 | OK for contiguous masks (see Minor 2) |
| unedited bits kept | gbaPatch.ts:123-130 (`(word & ~mask) | ((v << shift) & mask)) >>> 0`) | OK, including bit 31 for u32 |
| uses `maskShift`, `TileEntry`, `EngineProfile` (no redefinition) | gbaPatch.ts:10-12 | OK |
| `assertNotTripleLayer(profile, cfgPath)` throws TRIPLE_LAYER | gbaPatch.ts:183-187 | OK |
| messages start with the subject | every throw interpolates `${path}` / `${cfgPath}` first | OK |
| one error shape, `BlockEditRefusal` | all throws | OK |

## Step-1 tests (presence and whether each proves its name)

- `no-op over every GBA tileset` (test:284-319): it walks every `metatiles.bin` / `metatile_attributes.bin` under
  `SUBJECT_ROOT/data/tilesets` (recursive, basename match) and rewrites **every** entry from its own decoded values.
  That covers more than the task's "entry 0". Each file must exist (`length > 0`), and the attribute width comes from
  the subject's own profile via `openProject`. `SUBJECT_ROOT` comes from `testConfig()` (helpers/corpus.ts:3-8), so
  the scratch-copy rule holds. Byte-order swap: the real data is asymmetric, so the `.equals(buf)` check fails.
  Proves its name.
- `metatile edit touches only 16 bytes` (test:40-60): bytes before and after the target span are compared, the
  target's 8 words are checked, and the input is checked unmutated. Proves it.
- `attribute edit keeps other bits` for width 2 (test:123-151) and width 4 (test:153-172). Hand-checked:
  - FRLG `0xffffffff` with behavior `0x123` gives `0xffffff23`. The `& 0xfffffe00` part is `0xfffffe00`.
  - layerType 2 under mask `0x60000000` gives `0x40000000`. The other bits stay `0x9fffffff`.
  - Emerald `0xaaaa` with layerType 3 gives `0x3aaa`.
  - The shifted-mask case (test:264-271), `0xffff` with mask `0x0ff0` and behavior `0x12`, gives
    `0xf00f | 0x120 = 0xf12f`, as asserted.
  - "Mask without shift" is killed by the width-2 layerType test (`3 & 0xf000 = 0`, expected `0x3000`) and by the
    shifted-mask test.
- `mask overflow refused` (test:174-198): behavior `0x100` / layerType `0x10` on Emerald and `0x200` / `0x4` on
  FRLG, each one past its maximum. Code and subject prefix are asserted. Proves it.
- `append clones the source word then applies fields` (test:200-214). cloneFrom 0 gives `0x34ab` (high-byte check);
  cloneFrom 1 gives the full word `0x78ab`. The second assertion kills "append ignores cloneFrom". The default-0 case
  is a separate test (test:216-223). Proves it.
- `triple-layer refused` (test:244-261): profile flag true gives TRIPLE_LAYER with the cfg prefix; false does not
  throw; `engineProfile({enable_triple_layer_metatiles:"1"})` also gives TRIPLE_LAYER, so detection is from config.
  Proves it.

## Critical

None.

## Important

None.

## Minor

1. **Stale doc comment promises a cap check that does not exist.** gbaPatch.ts:19-21 says "appending past the
   blockset cap is the blockset cap". No `BLOCK_CAP` check exists in `patchGbaMetatile`, and per the spec ("GBA the
   primary/secondary metatile limit of every layout consuming the tileset", spec "Save as new") the cap depends on the
   layout. It cannot live in this byte-level patcher, so leaving it out is correct. The comment is wrong, though. A
   later task's implementer who reads it may assume the patcher enforces the GBA cap and skip the per-layout check.
   Then a Save as new on a full secondary appends metatile N past `split.metatiles`, and no refusal fires. Fix: delete
   the sentence, or say "the cap is enforced by the caller per consuming layout".

2. **Validation uses `mask >>> shift` as the maximum, which is only right for contiguous masks.** At gbaPatch.ts:118
   the check is `value > mask >>> maskShift(mask)`, and the write at line 127 is `(value << shift) & mask`. Take a
   non-contiguous porymap mask such as `metatile_behavior_mask=0x0f0f`. Value `0x10` passes validation
   (`0x10 <= 0xf0f`), and `0x10 & 0x0f0f = 0` then silently writes behavior 0. That breaks "a value must fit its
   mask" (spec, GBA metatile). It is unrealistic for both subjects (all defaults are contiguous), so this finding is
   Minor. Fix: refuse when `((value << shift) & mask) >>> shift !== value`.

3. **Width-2 behavior test does not use "all non-behavior bits set".** At test:124 the target word is `0xaaaa`, not
   `0xff??`, against the task's "(all non-behavior bits set)". A bug that cleared bit 8 or bit 10 (for example
   `& ~0x5ff` in place of `& ~0xff`) would pass that test, because those bits are already 0 in `0xaaaa`. Two other
   tests cover the gap: width 4 uses `0xffffffff`, and the shifted-mask test uses `0xffff`. Fix: use `[0xff, 0xff]`
   for word 1 and assert `& 0xff00 === 0xff00`.

4. **Append to an empty attribute file is always refused.** gbaPatch.ts:136-138 gives `count = 0`, so `cloneFrom 0 >= 0`
   throws BAD_VALUE with the message range "0--1". Neither subject has an empty attribute file, and a new tileset
   is out of scope, so this does not happen today. The message text is malformed, though. Optional: special-case
   `count === 0` in the message.

5. **`cloneFrom` can only name a word in the same buffer.** The task interface defines `cloneFrom` this way, so the
   implementation complies. The spec does say "a copy of the source block's whole word". If a later task appends to
   a secondary's attributes from a primary source block, the caller must read the source word itself and patch it
   in. This is not a Task 4 defect; it is noted for the Save-as-new task.
