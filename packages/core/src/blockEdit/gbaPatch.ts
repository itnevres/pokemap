/**
 * Plan 14.2 Task 4: lossless GBA tileset file patchers. Every function here is
 * a pure function over bytes -- no disk, no project object -- and each one
 * edits ONLY its own target span, so an unchanged input returns identical
 * bytes and a real edit leaves every other byte exactly as it was.
 *
 * Refusals are the one core shape, `BlockEditRefusal`; every message starts
 * with the subject (the file path).
 */
import { TileEntry } from "../load/tilesetData.js";
import { EngineProfile, maskShift } from "../config/engine.js";
import { BlockEditRefusal } from "./types.js";

const TILES_PER_METATILE = 8;
const BYTES_PER_METATILE = TILES_PER_METATILE * 2;

/**
 * Replaces metatile `localIndex`'s 8 tile entries, or appends a metatile when
 * `localIndex` is the current count. `localIndex > count` is a bad value (a
 * caller must not silently create gaps). The blockset cap is the caller's check
 * (not enforced here). The input buffer is never mutated; an unchanged record
 * returns an identical buffer.
 *
 * Each entry is a u16: tile (10 bits), xFlip (bit 10), yFlip (bit 11), palette (4 bits at 12-15).
 * Order: bottom 4 entries, then top 4 entries.
 */
export function patchGbaMetatile(
  buf: Buffer,
  localIndex: number,
  entries: readonly TileEntry[],
  path: string,
): Buffer {
  if (!Number.isInteger(localIndex) || localIndex < 0) {
    throw new BlockEditRefusal("BAD_VALUE", `${path}: metatile index ${localIndex} is not a valid index`);
  }
  if (entries.length !== TILES_PER_METATILE) {
    throw new BlockEditRefusal("BAD_VALUE", `${path}: metatile must have exactly ${TILES_PER_METATILE} entries, got ${entries.length}`);
  }

  // Validate each entry
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    if (!Number.isInteger(e.tile) || e.tile < 0 || e.tile > 0x3ff) {
      throw new BlockEditRefusal("BAD_VALUE", `${path}: metatile entry ${i}: tile ${e.tile} exceeds 10 bits (0-0x3ff)`);
    }
    if (!Number.isInteger(e.palette) || e.palette < 0 || e.palette > 0x0f) {
      throw new BlockEditRefusal("BAD_VALUE", `${path}: metatile entry ${i}: palette ${e.palette} exceeds 4 bits (0-0x0f)`);
    }
  }

  const count = buf.length / BYTES_PER_METATILE;
  if (!Number.isInteger(count)) {
    throw new BlockEditRefusal("BAD_VALUE", `${path}: buffer length ${buf.length} is not a multiple of ${BYTES_PER_METATILE}`);
  }
  if (localIndex > count) {
    throw new BlockEditRefusal("BAD_VALUE", `${path}: metatile index ${localIndex} is outside the editable range 0-${count}`);
  }

  // Encode the 8 entries into 16 bytes
  const record = Buffer.alloc(BYTES_PER_METATILE);
  for (let i = 0; i < TILES_PER_METATILE; i++) {
    const e = entries[i]!;
    const val =
      (e.tile & 0x3ff) |
      (e.xFlip ? 0x400 : 0) |
      (e.yFlip ? 0x800 : 0) |
      ((e.palette & 0x0f) << 12);
    record.writeUInt16LE(val, i * 2);
  }

  if (localIndex === count) {
    // Append
    return Buffer.concat([buf, record]);
  }

  // Replace in place
  const out = Buffer.from(buf);
  record.copy(out, localIndex * BYTES_PER_METATILE);
  return out;
}

/**
 * Replaces metatile attribute `localIndex`'s behavior and/or layerType fields,
 * or appends an attribute word when `localIndex` is the current count.
 * The word width is `profile.metatileAttributesSize` (2 or 4 bytes).
 * Appending clones the word at `cloneFrom` (default 0) then applies the fields.
 * A value outside its mask throws `BAD_VALUE`; unedited bits are kept.
 */
export function patchGbaAttribute(
  buf: Buffer,
  localIndex: number,
  profile: EngineProfile,
  fields: { behavior?: number; layerType?: number },
  path: string,
  cloneFrom?: number,
): Buffer {
  if (!Number.isInteger(localIndex) || localIndex < 0) {
    throw new BlockEditRefusal("BAD_VALUE", `${path}: attribute index ${localIndex} is not a valid index`);
  }

  const size = profile.metatileAttributesSize;
  if (size !== 2 && size !== 4) {
    throw new BlockEditRefusal("BAD_VALUE", `${path}: unsupported attribute size ${size}`);
  }

  const count = buf.length / size;
  if (!Number.isInteger(count)) {
    throw new BlockEditRefusal("BAD_VALUE", `${path}: buffer length ${buf.length} is not a multiple of ${size}`);
  }
  if (localIndex > count) {
    throw new BlockEditRefusal("BAD_VALUE", `${path}: attribute index ${localIndex} is outside the editable range 0-${count}`);
  }

  // Field units match the reader (load/tilesetData.ts): behavior is `word & mask` unshifted, layerType is shifted
  // down to the mask's low bit. A value must survive its own mask exactly (also rejects non-contiguous overflow).
  const specs = [
    { key: "behavior", mask: profile.metatileBehaviorMask >>> 0, shift: 0 },
    { key: "layerType", mask: profile.metatileLayerTypeMask >>> 0, shift: maskShift(profile.metatileLayerTypeMask) },
  ] as const;
  for (const { key, mask, shift } of specs) {
    const value = fields[key];
    if (value === undefined) continue;
    if (size === 2 && mask > 0xffff) {
      throw new BlockEditRefusal("BAD_VALUE", `${path}: ${key} mask 0x${mask.toString(16)} does not fit a 2-byte attribute`);
    }
    if (!Number.isInteger(value) || value < 0 || ((value << shift) & mask) >>> shift !== value) {
      throw new BlockEditRefusal("BAD_VALUE", `${path}: ${key} ${value} exceeds mask 0x${mask.toString(16)}`);
    }
  }

  function applyFields(word: number): number {
    for (const { key, mask, shift } of specs) {
      const value = fields[key];
      if (value !== undefined) word = ((word & ~mask) | ((value << shift) & mask)) >>> 0;
    }
    return word;
  }

  if (localIndex === count) {
    // Append: clone from cloneFrom (default 0)
    const cloneIndex = cloneFrom ?? 0;
    if (!Number.isInteger(cloneIndex) || cloneIndex < 0 || cloneIndex >= count) {
      throw new BlockEditRefusal("BAD_VALUE", count === 0
        ? `${path}: no attribute word to clone`
        : `${path}: cloneFrom ${cloneIndex} is outside the valid range 0-${count - 1}`);
    }

    let word: number;
    if (size === 2) {
      word = buf.readUInt16LE(cloneIndex * 2);
    } else {
      word = buf.readUInt32LE(cloneIndex * 4);
    }

    word = applyFields(word);

    const out = Buffer.alloc(buf.length + size);
    buf.copy(out, 0);
    if (size === 2) {
      out.writeUInt16LE(word, buf.length);
    } else {
      out.writeUInt32LE(word >>> 0, buf.length);
    }
    return out;
  }

  // Replace in place
  const out = Buffer.from(buf);
  const offset = localIndex * size;
  let word: number;
  if (size === 2) {
    word = buf.readUInt16LE(offset);
  } else {
    word = buf.readUInt32LE(offset);
  }

  word = applyFields(word);

  if (size === 2) {
    out.writeUInt16LE(word, offset);
  } else {
    out.writeUInt32LE(word >>> 0, offset);
  }
  return out;
}

/**
 * Throws `TRIPLE_LAYER` when the profile has `tripleLayerMetatiles` enabled.
 * The message starts with the config file path.
 */
export function assertNotTripleLayer(profile: EngineProfile, cfgPath: string): void {
  if (profile.tripleLayerMetatiles) {
    throw new BlockEditRefusal("TRIPLE_LAYER", `${cfgPath}: triple-layer metatiles are enabled; the block editor does not support them`);
  }
}