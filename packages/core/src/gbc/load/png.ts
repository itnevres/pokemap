import { inflateSync } from "node:zlib";
import { unfilterScanlines } from "../../load/png.js";

/**
 * A decoded tileset PNG as per-pixel shades 0-3, row-major. GBC tileset
 * graphics are never truly indexed/paletted at the PNG level (GBC format
 * findings, "Tileset graphics"): 35 of 36 are grayscale depth 2 (colour type
 * 0), and PerfPlus's `port.png` is RGBA depth 8 (colour type 6) using
 * exactly 4 opaque grays. Both encode the same 4 GBC shade levels, so both
 * decode to this one shape rather than to `../../load/png.ts`'s indexed
 * `IndexedImage` (which requires a PLTE and doesn't apply here).
 */
export interface ShadeImage {
  width: number;
  height: number;
  /** One shade 0-3 per pixel, row-major. shade = 3 - grayLevel: rgbgfx's
   *  grayscale default makes white (the lightest sample) index 0 and black
   *  index 3 (GBC format findings, "Tileset graphics" -- shade mapping,
   *  pinned here against an independent .NET decoder, see png.test.ts). */
  shades: Uint8Array;
}

/** Non-interlaced grayscale depth 2 (colourType 0) or RGBA depth 8
 *  (colourType 6) only -- the two shapes the real corpus uses. Refuses
 *  (throws, naming what) any other colour type/depth, any interlaced PNG,
 *  a truncated IDAT, or -- for RGBA -- a pixel that isn't fully opaque, isn't
 *  gray (R=G=B), or isn't one of the 4 gray levels {0,85,170,255}. */
export function readShadesPng(buf: Buffer): ShadeImage {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const depth = buf[24]!;
  const colourType = buf[25]!;
  const interlace = buf[28]!;

  if (interlace !== 0) throw new Error("interlaced PNGs are not supported");

  let channels: number;
  if (colourType === 0 && depth === 2) channels = 1;
  else if (colourType === 6 && depth === 8) channels = 4;
  else {
    throw new Error(
      `unsupported PNG colour type ${colourType} / bit depth ${depth}; expected grayscale depth 2 (colour type 0) or RGBA depth 8 (colour type 6)`,
    );
  }

  const idat: Buffer[] = [];
  for (let off = 8; off + 8 <= buf.length; ) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const bytesPerRow = Math.ceil((width * depth * channels) / 8);
  const bpp = Math.max(1, Math.ceil((depth * channels) / 8));

  if (raw.length !== (bytesPerRow + 1) * height) {
    throw new Error(
      `truncated IDAT: expected ${(bytesPerRow + 1) * height} bytes for ${width}x${height} at depth ${depth}, got ${raw.length}`,
    );
  }

  const unfiltered = unfilterScanlines(raw, bytesPerRow, height, bpp);

  const shades = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let gray: number;
      if (colourType === 0) {
        // Depth-2 grayscale: 4 samples per byte, MSB first.
        const bitIndex = x * depth;
        const byteIndex = y * bytesPerRow + (bitIndex >> 3);
        const shift = 6 - (bitIndex & 7);
        gray = (unfiltered[byteIndex]! >> shift) & 0x3;
      } else {
        const i = y * bytesPerRow + x * 4;
        const r = unfiltered[i]!, g = unfiltered[i + 1]!, b = unfiltered[i + 2]!, a = unfiltered[i + 3]!;
        if (a !== 255) throw new Error(`pixel (${x}, ${y}): alpha ${a} !== 255 -- expected fully opaque`);
        if (r !== g || g !== b) throw new Error(`pixel (${x}, ${y}): not gray -- r=${r} g=${g} b=${b}`);
        if (r !== 0 && r !== 85 && r !== 170 && r !== 255) {
          throw new Error(`pixel (${x}, ${y}): gray value ${r} is not one of 0/85/170/255`);
        }
        gray = r >> 6;
      }
      shades[y * width + x] = 3 - gray;
    }
  }

  return { width, height, shades };
}
