import type { EngineProfile } from "../config/engine.js";
import type { Block } from "../model/types.js";

export function parseBlocks(buf: Buffer, p: EngineProfile): Block[] {
  const out: Block[] = new Array(buf.length >> 1);
  for (let i = 0; i < out.length; i++) {
    const v = buf.readUInt16LE(i * 2);
    out[i] = {
      metatileId: v & p.blockMetatileIdMask,
      collision: (v & p.blockCollisionMask) >>> p.blockCollisionShift,
      elevation: (v & p.blockElevationMask) >>> p.blockElevationShift,
    };
  }
  return out;
}

/**
 * The exact inverse of `parseBlocks`, and Plan 2's whole write path depends on
 * that being true rather than approximately true.
 *
 * It refuses a field that will not fit its mask instead of masking it away.
 * `(4 << 10) & 0xC00` is 0 and `(7 << 10) & 0xC00` is 3, so a caller writing an
 * out-of-range collision would silently store a different, perfectly legal
 * value -- invisible to any round-trip over real data, because real data is
 * always in range (I7).
 */
export function encodeBlocks(blocks: Block[], p: EngineProfile): Buffer {
  const fits = (value: number, mask: number, shift: number) => ((value << shift) & mask) >>> shift === value;

  const buf = Buffer.alloc(blocks.length * 2);
  blocks.forEach((b, i) => {
    if ((b.metatileId & p.blockMetatileIdMask) !== b.metatileId) {
      throw new Error(`block ${i}: metatileId ${b.metatileId} does not fit mask 0x${p.blockMetatileIdMask.toString(16)}`);
    }
    if (!fits(b.collision, p.blockCollisionMask, p.blockCollisionShift)) {
      throw new Error(`block ${i}: collision ${b.collision} does not fit mask 0x${p.blockCollisionMask.toString(16)}`);
    }
    if (!fits(b.elevation, p.blockElevationMask, p.blockElevationShift)) {
      throw new Error(`block ${i}: elevation ${b.elevation} does not fit mask 0x${p.blockElevationMask.toString(16)}`);
    }
    buf.writeUInt16LE(
      b.metatileId |
      ((b.collision << p.blockCollisionShift) & p.blockCollisionMask) |
      ((b.elevation << p.blockElevationShift) & p.blockElevationMask), i * 2);
  });
  return buf;
}
