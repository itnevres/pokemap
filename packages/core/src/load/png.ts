import { inflateSync } from "node:zlib";
import type { RGB } from "../model/types.js";

export interface IndexedImage {
  width: number;
  height: number;
  /** One palette index per pixel, row-major. */
  indices: Uint8Array;
  /** The PLTE chunk, for reference. Tileset rendering uses .pal files instead. */
  palette: RGB[];
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function readIndexedPng(buf: Buffer): IndexedImage {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const depth = buf[24]!;
  const colourType = buf[25]!;
  const interlace = buf[28]!;

  if (colourType !== 3) throw new Error(`unsupported PNG colour type ${colourType}; expected 3 (indexed)`);
  if (interlace !== 0) throw new Error("interlaced PNGs are not supported");
  if (depth !== 4 && depth !== 8) throw new Error(`unsupported PNG bit depth ${depth}; expected 4 or 8`);

  const palette: RGB[] = [];
  const idat: Buffer[] = [];
  for (let off = 8; off + 8 <= buf.length; ) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "PLTE") for (let i = 0; i + 2 < data.length; i += 3) palette.push({ r: data[i]!, g: data[i + 1]!, b: data[i + 2]! });
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const bytesPerRow = Math.ceil((width * depth) / 8);
  const unfiltered = Buffer.alloc(bytesPerRow * height);

  // bpp is 1 for both supported depths (sub-byte samples filter as 1 byte).
  const bpp = 1;
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (bytesPerRow + 1)]!;
    const src = raw.subarray(y * (bytesPerRow + 1) + 1, (y + 1) * (bytesPerRow + 1));
    const dst = unfiltered.subarray(y * bytesPerRow, (y + 1) * bytesPerRow);
    const prev = y === 0 ? null : unfiltered.subarray((y - 1) * bytesPerRow, y * bytesPerRow);
    for (let x = 0; x < bytesPerRow; x++) {
      const a = x >= bpp ? dst[x - bpp]! : 0;
      const b = prev ? prev[x]! : 0;
      const c = prev && x >= bpp ? prev[x - bpp]! : 0;
      const v = src[x]!;
      dst[x] =
        filter === 0 ? v :
        filter === 1 ? (v + a) & 0xff :
        filter === 2 ? (v + b) & 0xff :
        filter === 3 ? (v + ((a + b) >> 1)) & 0xff :
        filter === 4 ? (v + paeth(a, b, c)) & 0xff :
        (() => { throw new Error(`unknown PNG filter ${filter} on row ${y}`); })();
    }
  }

  const indices = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (depth === 8) indices[y * width + x] = unfiltered[y * bytesPerRow + x]!;
      else {
        const byte = unfiltered[y * bytesPerRow + (x >> 1)]!;
        indices[y * width + x] = (x & 1) === 0 ? byte >> 4 : byte & 0x0f;
      }
    }
  }

  return { width, height, indices, palette };
}
