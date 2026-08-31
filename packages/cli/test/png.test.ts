import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";
import { encodePng, scanlineByteLength } from "../src/png.js";

describe("encodePng", () => {
  it("writes a valid signature and IHDR", () => {
    const buf = encodePng({ width: 2, height: 1, data: new Uint8ClampedArray([255,0,0,255, 0,255,0,255]) });
    expect(buf.readUInt32BE(0)).toBe(0x89504e47);
    expect(buf.readUInt32BE(16)).toBe(2);
    expect(buf.readUInt32BE(20)).toBe(1);
    expect(buf[24]).toBe(8); // bit depth
    expect(buf[25]).toBe(6); // colour type RGBA
  });

  it("round-trips pixel data through zlib, with a filter byte per row", () => {
    // Two rows, not one. A 2x1 image cannot catch a stride bug: the encoder
    // emits a filter byte per ROW, so a single-row fixture passes against an
    // implementation that writes one filter byte for the whole image, or that
    // copies rows at the wrong offset. Every byte here is distinct so a
    // misplaced row is visible rather than aliased.
    const row0 = [1,2,3,4, 5,6,7,8];
    const row1 = [9,10,11,12, 13,14,15,16];
    const src = new Uint8ClampedArray([...row0, ...row1]);
    const buf = encodePng({ width: 2, height: 2, data: src });

    let off = 8, idat: Buffer | null = null;
    while (off + 8 <= buf.length) {
      const len = buf.readUInt32BE(off);
      if (buf.toString("ascii", off + 4, off + 8) === "IDAT") { idat = buf.subarray(off + 8, off + 8 + len); break; }
      off += 12 + len;
    }
    const raw = inflateSync(idat!);

    // 2 rows x (1 filter byte + 8 data bytes).
    expect(raw.length).toBe(2 * (1 + 8));
    expect(raw[0]).toBe(0);
    expect([...raw.subarray(1, 9)]).toEqual(row0);
    expect(raw[9]).toBe(0);
    expect([...raw.subarray(10, 18)]).toEqual(row1);
  });

  it("emits a correct CRC for every chunk", () => {
    // Without this the encoder can be self-consistently wrong: our own reader
    // would round-trip happily while no other decoder accepts the file. Walk
    // the chunks and recompute each CRC over type+data, the way a decoder does.
    const buf = encodePng({ width: 3, height: 2, data: new Uint8ClampedArray(3 * 2 * 4).fill(200) });

    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    const crc = (b: Buffer) => {
      let c = 0xffffffff;
      for (const x of b) c = table[(c ^ x) & 0xff]! ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    };

    const seen: string[] = [];
    let off = 8;
    while (off + 12 <= buf.length) {
      const len = buf.readUInt32BE(off);
      const type = buf.toString("ascii", off + 4, off + 8);
      seen.push(type);
      expect(buf.readUInt32BE(off + 8 + len)).toBe(crc(buf.subarray(off + 4, off + 8 + len)));
      off += 12 + len;
    }
    expect(seen).toEqual(["IHDR", "IDAT", "IEND"]);
    expect(off).toBe(buf.length); // no trailing bytes
  });

  it("rejects a raster whose data length doesn't match width x height x 4", () => {
    // Otherwise a short buffer silently trails off into transparent black
    // (Buffer.alloc zero-fills) or throws ERR_OUT_OF_RANGE from inside
    // Buffer.copy, naming neither the raster nor the actual mismatch.
    expect(() => encodePng({ width: 4, height: 4, data: new Uint8ClampedArray(60) })).toThrow(/4x4/);
    expect(() => encodePng({ width: 4, height: 4, data: new Uint8ClampedArray(60) })).toThrow(/expected 64/);
  });

  it("rejects non-positive dimensions", () => {
    // 0x0 would otherwise produce a PNG the spec (11.2.2) forbids.
    expect(() => encodePng({ width: 0, height: 0, data: new Uint8ClampedArray(0) })).toThrow();
    expect(() => encodePng({ width: -1, height: 4, data: new Uint8ClampedArray(0) })).toThrow();
  });

  it("draws zlib's 4 GiB scanline boundary exactly at 32768", () => {
    // (4W + 1) x H is the byte length deflate must consume through zlib's
    // 32-bit avail_in; past 2**32 - 1 it wraps and truncates silently rather
    // than throwing. Asserted on the arithmetic directly -- allocating
    // either buffer for real would need on the order of 4 GiB.
    expect(scanlineByteLength(32767, 32767)).toBeLessThanOrEqual(0xffffffff);
    expect(scanlineByteLength(32768, 32768)).toBeGreaterThan(0xffffffff);
  });
});
