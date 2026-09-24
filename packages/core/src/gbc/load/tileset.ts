import type { Metatile } from "../model/types.js";

/**
 * `_metatiles.bin` is headerless: 16-byte records, each a 4x4 grid of tile
 * ids, row-major, no attribute bits (GBC format findings §3.2). The
 * per-tileset metatile count is `buf.length / 16` and is NOT a constant --
 * measured 40 (forest), 64 (most) or 128 (johto/johto_modern/kanto/
 * battle_tower_outside/unused_johto). Never derive the count from collision
 * data; `forest_collision.asm` has 64 lines for only 40 metatiles.
 *
 * Task 5 extends this file with palette-map and collision loading.
 */
export function parseMetatiles(buf: Buffer): Metatile[] {
  if (buf.length % 16 !== 0) {
    throw new Error(`metatiles buffer length ${buf.length} is not a multiple of 16`);
  }
  const out: Metatile[] = new Array(buf.length / 16);
  for (let i = 0; i < out.length; i++) {
    out[i] = { tiles: [...buf.subarray(i * 16, i * 16 + 16)] };
  }
  return out;
}

/**
 * The exact inverse of `parseMetatiles`. Refuses (throws, naming the
 * metatile index) a record whose `tiles` is not exactly 16 entries, and
 * refuses (throws, naming the metatile and tile index and value) any tile id
 * that is not an integer 0-255, rather than masking or truncating it.
 */
export function encodeMetatiles(ms: Metatile[]): Buffer {
  const buf = Buffer.alloc(ms.length * 16);
  ms.forEach((m, i) => {
    if (m.tiles.length !== 16) {
      throw new Error(`metatile ${i}: tiles.length ${m.tiles.length} !== 16`);
    }
    m.tiles.forEach((t, j) => {
      if (!Number.isInteger(t) || t < 0 || t > 255) {
        throw new Error(`metatile ${i} tile ${j}: ${t} is not an integer 0-255`);
      }
      buf[i * 16 + j] = t;
    });
  });
  return buf;
}
