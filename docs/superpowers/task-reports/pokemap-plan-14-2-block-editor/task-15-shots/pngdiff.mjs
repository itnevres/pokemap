// usage: node pngdiff.mjs old.png new.png [tileA tileB]: IHDR of both, changed 8x8 tiles, new tileB == old tileA.
import { readFileSync } from "node:fs"; import { inflateSync } from "node:zlib";
function dec(f) {
  const d = readFileSync(f); let o = 8, idat = [], h;
  while (o < d.length) { const n = d.readUInt32BE(o), t = d.toString("ascii", o + 4, o + 8), c = d.subarray(o + 8, o + 8 + n);
    if (t === "IHDR") h = { w: c.readUInt32BE(0), h: c.readUInt32BE(4), depth: c[8], colorType: c[9], interlace: c[12] };
    if (t === "IDAT") idat.push(c); o += 12 + n; }
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[h.colorType], bpp = Math.max(1, (ch * h.depth) >> 3), stride = Math.ceil(h.w * ch * h.depth / 8);
  const raw = inflateSync(Buffer.concat(idat)), px = Buffer.alloc(stride * h.h);
  for (let y = 0; y < h.h; y++) { const f = raw[y * (stride + 1)], s = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) { const a = i >= bpp ? px[y * stride + i - bpp] : 0, b = y ? px[(y - 1) * stride + i] : 0, c = y && i >= bpp ? px[(y - 1) * stride + i - bpp] : 0;
      const p = a + b - c, pr = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      px[y * stride + i] = (s[i] + [0, a, b, (a + b) >> 1, pr][f]) & 255; } }
  const get = (x, y) => { const bit = x * ch * h.depth; if (h.depth >= 8) return px.subarray(y * stride + (bit >> 3), y * stride + (bit >> 3) + bpp).join(".");
    return (px[y * stride + (bit >> 3)] >> (8 - h.depth - (bit & 7))) & ((1 << h.depth) - 1); };
  return { h, get };
}
const [A, B, ta, tb] = process.argv.slice(2), a = dec(A), b = dec(B);
console.log("IHDR old", a.h, "new", b.h);
const w = a.h.w / 8, changed = new Set(); for (let y = 0; y < Math.min(a.h.h, b.h.h); y++) for (let x = 0; x < a.h.w; x++) if (a.get(x, y) !== b.get(x, y)) changed.add(((y >> 3) * w) + (x >> 3));
console.log("changed tiles", [...changed]);
if (ta) { let eq = true; const t = (n) => [(n % w) * 8, Math.floor(n / w) * 8]; const [ax, ay] = t(+ta), [bx, by] = t(+tb);
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) if (a.get(ax + i, ay + j) !== b.get(bx + i, by + j)) eq = false; console.log(`new tile ${tb} == old tile ${ta}:`, eq); }
