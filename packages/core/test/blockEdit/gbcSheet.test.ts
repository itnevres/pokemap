import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateSync, inflateSync } from "node:zlib";
import { copySheetTile, encodeGrayPng, loadGbcReservedTiles, parseGbcReservedTiles } from "../../src/blockEdit/gbcSheet.js";
import { readShadesPng, type ShadeImage } from "../../src/gbc/load/png.js";
import { findDefEqu } from "../../src/gbc/load/asm.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus } from "../gbc/helpers/corpus.js";

const path = "gfx/tilesets/test.png";
const roofs = "\tld de, vTiles2 tile $0a\r\n";
const anims = "\tdw vTiles2 tile $14, AnimateWaterTile\r\n\tdw vTiles5 tile $03, AnimateFlowerTile\r\n";
const range = (start: number, length: number): number[] => Array.from({ length }, (_, i) => start + i);

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, -4)), out.length - 4);
  return out;
}

function chunks(png: Buffer): Buffer[] {
  const out: Buffer[] = [];
  for (let off = 8; off < png.length;) {
    const end = off + 12 + png.readUInt32BE(off);
    out.push(png.subarray(off, end));
    off = end;
  }
  return out;
}

function sheet(): ShadeImage {
  return { width: 128, height: 24, shades: Uint8Array.from({ length: 128 * 24 }, (_, i) =>
    ((i % 128) * 3 + Math.floor(i / 128) + Math.floor(i / (128 * 8)) * (i % 8 === 0 ? 1 : 0) + Math.floor((i % 128) / 8)) % 4) };
}

describe("GBC sheet PNG", () => {
  itWithGbcCorpus("encode round-trip for every PerfPlus tileset PNG", () => {
    const dir = join(GBC_SUBJECT_ROOT, "gfx/tilesets");
    const names = readdirSync(dir).filter((name) => name.endsWith(".png"));
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const original = readFileSync(join(dir, name));
      const image = readShadesPng(original);
      const encoded = encodeGrayPng(image);
      expect(readShadesPng(encoded), name).toEqual(image);
      expect(encoded.readUInt32BE(16), name).toBe(original.readUInt32BE(16));
      expect(encoded.readUInt32BE(20), name).toBe(original.readUInt32BE(20));
      // port.png is RGBA; encoding always normalizes to grayscale depth 2.
      expect([...encoded.subarray(24, 29)], name).toEqual([2, 0, 0, 0, 0]);
      if (original[25] === 0) expect(encoded.subarray(24, 26)).toEqual(original.subarray(24, 26));
    }
  });

  it("encodes partial packed bytes and valid chunk CRCs", () => {
    const image = { width: 5, height: 2, shades: Uint8Array.from([0, 1, 2, 3, 1, 3, 2, 1, 0, 2]) };
    const png = encodeGrayPng(image);
    expect(readShadesPng(png)).toEqual(image);
    expect(chunks(png).map((c) => c.toString("ascii", 4, 8))).toEqual(["IHDR", "IDAT", "IEND"]);
    for (const c of chunks(png)) expect(c.readUInt32BE(c.length - 4)).toBe(crc32(c.subarray(4, -4)));
  });

  it.each([15, 20])("copy changes only the target tile (all tiles compared), source %i", (from) => {
    const image = sheet();
    const png = encodeGrayPng(image);
    const before = Buffer.from(png);
    const copied = readShadesPng(copySheetTile(png, from, 33, path));
    for (let tile = 0; tile < 48; tile++) {
      const source = tile === 33 ? from : tile;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        expect(copied.shades[(Math.floor(tile / 16) * 8 + y) * 128 + tile % 16 * 8 + x]).toBe(
          image.shades[(Math.floor(source / 16) * 8 + y) * 128 + source % 16 * 8 + x]);
      }
    }
    expect(png).toEqual(before);
    expect(copied.shades).not.toEqual(image.shades);
  });

  it("no-op copy returns identical bytes", () => {
    const png = encodeGrayPng(sheet());
    expect(copySheetTile(png, 17, 17, path)).toBe(png);
  });

  it("identical distinct tiles preserve split IDAT bytes at a different compression level", () => {
    const png = encodeGrayPng({ width: 128, height: 8, shades: new Uint8Array(128 * 8) });
    const [ihdr, idat, iend] = chunks(png);
    const compressed = deflateSync(inflateSync(idat!.subarray(8, -4)), { level: 0 });
    const middle = Math.floor(compressed.length / 2);
    const split = Buffer.concat([png.subarray(0, 8), ihdr!, chunk("IDAT", compressed.subarray(0, middle)),
      chunk("IDAT", compressed.subarray(middle)), iend!]);
    expect(copySheetTile(split, 0, 1, path)).toBe(split);
  });

  it("preserves every non-IDAT chunk byte-for-byte", () => {
    const png = encodeGrayPng(sheet());
    const [ihdr, idat, iend] = chunks(png);
    const tagged = Buffer.concat([png.subarray(0, 8), ihdr!, chunk("tEXt", Buffer.from("Title\0Sheet")), idat!, chunk("tIME", Buffer.from([7, 234, 11, 10, 12, 0, 0])), iend!]);
    const withoutIdat = (b: Buffer) => chunks(b).filter((c) => c.toString("ascii", 4, 8) !== "IDAT");
    expect(withoutIdat(copySheetTile(tagged, 15, 33, path))).toEqual(withoutIdat(tagged));
  });

  it("RGBA source refused", () => {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(128);
    header.writeUInt32BE(8, 4);
    header[8] = 8;
    header[9] = 6;
    const raw = Buffer.alloc((128 * 4 + 1) * 8);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 128; x++) raw[y * 513 + 1 + x * 4 + 3] = 255;
    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
    expect(readShadesPng(png).shades.every((s) => s === 3)).toBe(true);
    expect(() => copySheetTile(png, 0, 1, path)).toThrowError(expect.objectContaining({ code: "BAD_VALUE", message: expect.stringContaining(path) }));
  });

  it("requires IHDR as the first chunk and rejects malformed PNGs and tile indices", () => {
    const png = encodeGrayPng(sheet());
    const reordered = Buffer.concat([png.subarray(0, 8), chunk("tEXt", Buffer.from("x\0y")), png.subarray(8)]);
    for (const bad of [reordered, Buffer.alloc(0), png.subarray(0, -2)]) {
      expect(() => copySheetTile(bad, 0, 1, path)).toThrowError(expect.objectContaining({ code: "BAD_VALUE", message: expect.stringContaining(path) }));
    }
    for (const index of [-1, 48, 1.5, NaN]) expect(() => copySheetTile(png, 0, index, path)).toThrowError(expect.objectContaining({ code: "BAD_VALUE" }));
  });
});

describe("GBC runtime tile reservations", () => {
  it("parses roof range and both VRAM banks (including synthetic $83)", () => {
    expect(parseGbcReservedTiles(roofs, anims, 9)).toEqual(new Set([...range(0x0a, 9), 0x14, 0x83]));
    expect(parseGbcReservedTiles("ld de, vTiles2 tile $20", anims, 2)).toEqual(new Set([0x20, 0x21, 0x14, 0x83]));
  });

  it("reserves instruction operands and every labeled animation destination", () => {
    const operands = "ld hl, vTiles2 tile $5b\nTowerPillarTilePointer1: dw vTiles2 tile $2d, vTiles5 tile $03\nld hl, vTiles2 tile $38 ; vTiles2 tile $00\n";
    expect(parseGbcReservedTiles(roofs, operands, 9)).toEqual(new Set([...range(0x0a, 9), 0x5b, 0x2d, 0x83, 0x38]));
  });

  it("refuses an animation destination expression instead of truncating it", () => {
    for (const expr of ["dw vTiles2 tile $20 + 1, Frame", "ld hl, vTiles2 tile $20 + 1"]) {
      expect(() => parseGbcReservedTiles(roofs, expr, 9)).toThrowError(expect.objectContaining({ code: "RESERVATIONS_UNREADABLE", message: expect.stringContaining("tileset_anims.asm") }));
    }
  });

  it("ignores commented destinations and refuses missing live destinations", () => {
    expect(parseGbcReservedTiles(roofs, `${anims}; dw vTiles2 tile $00, Comment\n`, 9).has(0)).toBe(false);
    expect(() => parseGbcReservedTiles("; ld de, vTiles2 tile $0a", anims, 9)).toThrowError(expect.objectContaining({ code: "RESERVATIONS_UNREADABLE", message: expect.stringContaining("mapgroup_roofs.asm") }));
    expect(() => parseGbcReservedTiles(roofs, "; dw vTiles2 tile $14, Comment", 9)).toThrowError(expect.objectContaining({ code: "RESERVATIONS_UNREADABLE", message: expect.stringContaining("tileset_anims.asm") }));
  });

  itWithGbcCorpus("loads PerfPlus roof length and real runtime destinations", () => {
    const length = findDefEqu(readFileSync(join(GBC_SUBJECT_ROOT, "constants/tileset_constants.asm"), "utf8"), "ROOF_LENGTH", "constants/tileset_constants.asm");
    const reserved = loadGbcReservedTiles(GBC_SUBJECT_ROOT);
    for (const tile of range(0x0a, length)) expect(reserved.has(tile)).toBe(true);
    for (const tile of [0x14, 0x5b, 0x38, 0x2d]) expect(reserved.has(tile)).toBe(true);
    expect(reserved.has(0)).toBe(false);
  });

  it("refuses a missing anims file, constants file or ROOF_LENGTH definition", () => {
    const root = mkdtempSync(join(tmpdir(), "pokemap-reservations-"));
    try {
      mkdirSync(join(root, "engine/tilesets"), { recursive: true });
      mkdirSync(join(root, "constants"));
      writeFileSync(join(root, "engine/tilesets/mapgroup_roofs.asm"), roofs);
      writeFileSync(join(root, "constants/tileset_constants.asm"), "DEF ROOF_LENGTH EQU 9\n");
      expect(() => loadGbcReservedTiles(root)).toThrowError(expect.objectContaining({ code: "RESERVATIONS_UNREADABLE", message: expect.stringContaining("tileset_anims.asm") }));
      writeFileSync(join(root, "engine/tilesets/tileset_anims.asm"), anims);
      rmSync(join(root, "constants/tileset_constants.asm"));
      expect(() => loadGbcReservedTiles(root)).toThrowError(expect.objectContaining({ code: "RESERVATIONS_UNREADABLE", message: expect.stringContaining("constants/tileset_constants.asm") }));
      writeFileSync(join(root, "constants/tileset_constants.asm"), "; missing definition\n");
      expect(() => loadGbcReservedTiles(root)).toThrowError(expect.objectContaining({ code: "RESERVATIONS_UNREADABLE", message: expect.stringContaining("constants/tileset_constants.asm") }));
      writeFileSync(join(root, "constants/tileset_constants.asm"), "DEF ROOF_LENGTH EQU 9 + 1\n");
      expect(() => loadGbcReservedTiles(root)).toThrowError(expect.objectContaining({ code: "RESERVATIONS_UNREADABLE", message: expect.stringContaining("constants/tileset_constants.asm") }));
      writeFileSync(join(root, "constants/tileset_constants.asm"), "DEF ROOF_LENGTH EQU $09 ; plain literal\n");
      expect(loadGbcReservedTiles(root)).toEqual(new Set([...range(0x0a, 9), 0x14, 0x83]));
      rmSync(join(root, "engine/tilesets/mapgroup_roofs.asm"));
      expect(() => loadGbcReservedTiles(root)).toThrowError(expect.objectContaining({ code: "RESERVATIONS_UNREADABLE", message: expect.stringContaining("mapgroup_roofs.asm") }));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
