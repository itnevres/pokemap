import type { Block } from "../model/types.js";

/**
 * `.blk` is headerless: one byte per block, row-major, and the byte IS the
 * metatile id -- no collision/elevation bits (GBC format findings §3.2,
 * unlike GBA's `parseBlocks`). Length-agnostic: 2 real PerfPlus files
 * (CeruleanCave2F/B1) are oversize for their declared w*h and must still
 * round-trip whole. Reconciling size against w*h is Task 3's job, not this
 * codec's.
 */
export function parseBlk(buf: Buffer): Block[] {
  const out: Block[] = new Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = { metatileId: buf.readUInt8(i) };
  return out;
}

/**
 * The exact inverse of `parseBlk`. Refuses (throws, naming the block index
 * and value) any metatileId that is not an integer 0-255, rather than
 * masking or truncating it -- `256 & 0xff` is silently a legal 0, which
 * would be invisible over real data (I7) and would let a caller quietly
 * write the wrong block.
 */
export function encodeBlk(blocks: Block[]): Buffer {
  const buf = Buffer.alloc(blocks.length);
  blocks.forEach((b, i) => {
    if (!Number.isInteger(b.metatileId) || b.metatileId < 0 || b.metatileId > 255) {
      throw new Error(`block ${i}: metatileId ${b.metatileId} is not an integer 0-255`);
    }
    buf[i] = b.metatileId;
  });
  return buf;
}
