import { deflateSync } from "node:zlib";

export interface RasterLike { width: number; height: number; data: Uint8ClampedArray; }

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

// Indexed loop, not `for (const b of buf)`: measured 223ms vs 926ms over
// 128 MiB. Irrelevant at today's map sizes (largest IDAT is 152 KiB) but this
// is the encoder Task 16 calls per fixed map and Task 25 calls on very large
// images, so the cheap version is worth having now.
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// One allocation, one copy of `data` -- not three (a `type+data` concat, a
// `len+body+crc` concat, and the implicit copy each concat does of its
// inputs). CRC is computed over the same buffer the chunk is built in, via a
// subarray view, so it never touches `data` again after the initial copy.
function chunk(type: string, data: Buffer): Buffer {
  const len = data.length;
  const out = Buffer.allocUnsafe(len + 12);
  out.writeUInt32BE(len, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + len)), 8 + len);
  return out;
}

/**
 * (4W + 1) x H -- the byte length of the scanline stream (one filter byte per
 * row, plus RGBA pixel data) that deflate must consume whole.
 *
 * Exported as a pure function of width/height so the 4 GiB boundary zlib's
 * 32-bit `avail_in` draws can be asserted directly, without allocating
 * anywhere near that much memory just to exercise the check: 32767x32767
 * fits under 2**32 - 1, 32768x32768 does not.
 */
export function scanlineByteLength(width: number, height: number): number {
  return (width * 4 + 1) * height;
}

/** RGBA, 8-bit, non-interlaced, filter type 0 on every row. */
export function encodePng(r: RasterLike): Buffer {
  const stride = r.width * 4;

  // A short buffer would otherwise either leave trailing rows as transparent
  // black (silently -- Buffer.alloc zero-fills) or throw ERR_OUT_OF_RANGE
  // from deep inside Buffer.copy naming neither the raster nor the mismatch.
  // 0x0 raster would produce a PNG that the spec (11.2.2) forbids. Symmetric
  // with the same guard in load/png.ts's readIndexedPng.
  if (r.width <= 0 || r.height <= 0 || r.data.length !== stride * r.height) {
    throw new Error(
      `raster is ${r.width}x${r.height} with ${r.data.length} bytes; expected ${stride * r.height}`,
    );
  }

  // zlib's deflate takes scanline data through a 32-bit avail_in and wraps
  // silently past 4 GiB rather than throwing -- deflateSync(Buffer.alloc(2**32
  // + 16)) returns an 11-byte stream that inflates back to 16 bytes. Node's
  // own Buffer limit (2**53 - 1 on Node 24) does not protect against this.
  const scanlineBytes = scanlineByteLength(r.width, r.height);
  if (scanlineBytes > 0xffffffff) {
    throw new Error(
      `${r.width}x${r.height} needs ${scanlineBytes} bytes of scanline data; ` +
      `zlib truncates above 4 GiB. Render in tiles or use a lower LOD.`,
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(r.width, 0);
  ihdr.writeUInt32BE(r.height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const raw = Buffer.alloc(scanlineBytes);
  // Uint8ClampedArray.buffer may be larger than the view (e.g. a subarray of
  // a shared buffer), so byteOffset/length must be threaded through rather
  // than wrapping the whole underlying ArrayBuffer.
  const bytes = Buffer.from(r.data.buffer, r.data.byteOffset, r.data.length);
  for (let y = 0; y < r.height; y++) {
    raw[y * (stride + 1)] = 0;
    bytes.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
