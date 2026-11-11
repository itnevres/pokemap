import { readFileSync } from "node:fs";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { codeLines, findDefEquLine, parseNum, stripComment } from "../gbc/load/asm.js";
import { readShadesPng, type ShadeImage } from "../gbc/load/png.js";
import { BlockEditRefusal } from "./types.js";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ROOFS = "engine/tilesets/mapgroup_roofs.asm";
const ANIMS = "engine/tilesets/tileset_anims.asm";
const CONSTANTS = "constants/tileset_constants.asm";

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, -4)), out.length - 4);
  return out;
}

/** PNG grayscale samples are the inverse of the editor's GBC shades. */
export function encodeGrayPng(img: ShadeImage): Buffer {
  const { width, height, shades } = img;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 ||
      shades.length !== width * height || shades.some((s) => s > 3)) {
    throw new BlockEditRefusal("BAD_VALUE", "PNG: invalid dimensions or shades");
  }
  const stride = Math.ceil(width / 4);
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = y * (stride + 1) + 1 + (x >> 2);
    raw[offset] = raw[offset]! | ((3 - shades[y * width + x]!) << (6 - (x % 4) * 2));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 2;
  return Buffer.concat([PNG_SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

interface PngChunk { type: string; bytes: Buffer }

/** Validate framing before the shared decoder, which assumes IHDR's fixed offset. */
function pngChunks(png: Buffer): PngChunk[] {
  if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("invalid PNG signature");
  const chunks: PngChunk[] = [];
  let ended = false;
  for (let off = 8; off < png.length;) {
    if (ended || off + 12 > png.length) throw new Error("invalid PNG chunk framing");
    const length = png.readUInt32BE(off);
    const end = off + 12 + length;
    if (end > png.length) throw new Error("truncated PNG chunk");
    const type = png.toString("ascii", off + 4, off + 8);
    if (chunks.length === 0 ? type !== "IHDR" || length !== 13 : type === "IHDR") {
      throw new Error("first chunk must be the only IHDR (13 bytes)");
    }
    if (crc32(png.subarray(off + 4, end - 4)) !== png.readUInt32BE(end - 4)) throw new Error(`${type}: invalid CRC`);
    chunks.push({ type, bytes: png.subarray(off, end) });
    if (type === "IEND") {
      if (length !== 0) throw new Error("invalid IEND length");
      ended = true;
    }
    off = end;
  }
  if (!ended || !chunks.some((c) => c.type === "IDAT")) throw new Error("missing IDAT or IEND");
  return chunks;
}

/** Sheet indices use 16 eight-pixel tiles per row, independent of VRAM bank. */
export function copySheetTile(png: Buffer, fromIndex: number, toIndex: number, path: string): Buffer {
  try {
    const chunks = pngChunks(png);
    if (png[24] !== 2 || png[25] !== 0 || png[26] !== 0 || png[27] !== 0 || png[28] !== 0) {
      throw new Error("expected non-interlaced 2-bit grayscale PNG");
    }
    const image = readShadesPng(png);
    if (image.width !== 128 || image.height % 8 !== 0) throw new Error("expected 16 tiles per row and complete tile rows");
    const count = image.height / 8 * 16;
    for (const index of [fromIndex, toIndex]) {
      if (!Number.isInteger(index) || index < 0 || index >= count) throw new Error(`tile ${index} outside sheet (0-${count - 1})`);
    }
    if (fromIndex === toIndex) return png;
    const sourceX = fromIndex % 16 * 8;
    const sourceY = Math.floor(fromIndex / 16) * 8;
    const targetX = toIndex % 16 * 8;
    const targetY = Math.floor(toIndex / 16) * 8;
    let identical = true;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      if (image.shades[(sourceY + y) * image.width + sourceX + x] !==
          image.shades[(targetY + y) * image.width + targetX + x]) identical = false;
    }
    if (identical) return png;
    for (let y = 0; y < 8; y++) {
      const source = (sourceY + y) * image.width + sourceX;
      image.shades.copyWithin((targetY + y) * image.width + targetX, source, source + 8);
    }
    const encoded = pngChunks(encodeGrayPng(image));
    const idat = encoded.find((c) => c.type === "IDAT")!.bytes;
    let replaced = false;
    const output: Buffer[] = [PNG_SIGNATURE];
    for (const c of chunks) {
      if (c.type !== "IDAT") output.push(c.bytes);
      else if (!replaced) {
        output.push(idat);
        replaced = true;
      }
    }
    return Buffer.concat(output);
  } catch (e) {
    throw new BlockEditRefusal("BAD_VALUE", `${path}: ${(e as Error).message}`);
  }
}

function destinations(text: string, file: string, roof: boolean): number[] {
  const found: number[] = [];
  for (const line of codeLines(text)) {
    const code = stripComment(line.text);
    const roofPrefix = /^\s*ld\s+de\s*,\s*/i;
    if (roof && !roofPrefix.test(code)) continue;
    // Roof copies use ld de; animations conservatively reserve every live operand.
    const operands = roof ? code.replace(roofPrefix, "").split(",")[0]!.trim() : code;
    const pattern = roof ? /^vTiles([25])\s+tile\s+(.+)$/gi : /\bvTiles([25])\s+tile\s+([^,]+)/gi;
    for (const match of operands.matchAll(pattern)) {
      try {
        // The whole operand must be one literal: `$14 + 1` is refused, never truncated to `$14`.
        const index = parseNum(match[2]!.trim());
        if (!Number.isInteger(index) || index < 0 || index > 0x7f) throw new Error("tile index outside bank");
        found.push(index + (match[1] === "5" ? 0x80 : 0));
      } catch (e) {
        throw new BlockEditRefusal("RESERVATIONS_UNREADABLE", `${file}: ${(e as Error).message}`);
      }
    }
  }
  if (found.length === 0) throw new BlockEditRefusal("RESERVATIONS_UNREADABLE", `${file}: no tile destination found`);
  return found;
}

/** Runtime replacements reserve their destination slots on every editable sheet. */
export function parseGbcReservedTiles(roofsText: string, animsText: string, roofLength: number): Set<number> {
  const starts = destinations(roofsText, ROOFS, true);
  if (!Number.isInteger(roofLength) || roofLength <= 0 || starts.some((start) => start + roofLength > 256)) {
    throw new BlockEditRefusal("RESERVATIONS_UNREADABLE", `${CONSTANTS}: invalid ROOF_LENGTH ${roofLength}`);
  }
  const reserved = new Set(destinations(animsText, ANIMS, false));
  for (const start of starts) for (let i = 0; i < roofLength; i++) reserved.add(start + i);
  return reserved;
}

export function loadGbcReservedTiles(root: string): Set<number> {
  const read = (file: string): string => {
    try {
      return readFileSync(join(root, file), "utf8");
    } catch (e) {
      throw new BlockEditRefusal("RESERVATIONS_UNREADABLE", `${file}: ${(e as Error).message}`);
    }
  };
  const roofs = read(ROOFS);
  const constants = read(CONSTANTS);
  let roofLength: number;
  try {
    const line = findDefEquLine(constants, "ROOF_LENGTH", CONSTANTS);
    const value = stripComment(line).match(/^\s*DEF\s+ROOF_LENGTH\s+EQU\s+(\S+)\s*$/);
    if (!value) throw new Error("ROOF_LENGTH must be a single plain literal");
    roofLength = parseNum(value[1]!);
  } catch (e) {
    throw new BlockEditRefusal("RESERVATIONS_UNREADABLE", `${CONSTANTS}: ${(e as Error).message}`);
  }
  return parseGbcReservedTiles(roofs, read(ANIMS), roofLength);
}
