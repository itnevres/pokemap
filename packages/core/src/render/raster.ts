export interface Raster {
  width: number;
  height: number;
  /** RGBA, row-major, 4 bytes per pixel. */
  data: Uint8ClampedArray;
}

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function createRaster(width: number, height: number): Raster {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function fillRect(r: Raster, x0: number, y0: number, w: number, h: number, c: RGBA): void {
  for (let y = Math.max(0, y0); y < Math.min(r.height, y0 + h); y++) {
    for (let x = Math.max(0, x0); x < Math.min(r.width, x0 + w); x++) {
      const i = (y * r.width + x) * 4;
      r.data[i] = c.r;
      r.data[i + 1] = c.g;
      r.data[i + 2] = c.b;
      r.data[i + 3] = c.a;
    }
  }
}

/**
 * Source-over alpha compositing, for overlays that must tint rather than
 * replace. `fillRect` overwrites, which is correct when you are painting a
 * solid, and destroys the image underneath when you are painting a wash.
 */
export function blendRect(r: Raster, x0: number, y0: number, w: number, h: number, c: RGBA): void {
  const sa = c.a / 255;
  if (sa <= 0) return;
  for (let y = Math.max(0, y0); y < Math.min(r.height, y0 + h); y++) {
    for (let x = Math.max(0, x0); x < Math.min(r.width, x0 + w); x++) {
      const i = (y * r.width + x) * 4;
      const da = (r.data[i + 3] ?? 0) / 255;
      const out = sa + da * (1 - sa);
      if (out <= 0) continue;
      r.data[i] = Math.round((c.r * sa + (r.data[i] ?? 0) * da * (1 - sa)) / out);
      r.data[i + 1] = Math.round((c.g * sa + (r.data[i + 1] ?? 0) * da * (1 - sa)) / out);
      r.data[i + 2] = Math.round((c.b * sa + (r.data[i + 2] ?? 0) * da * (1 - sa)) / out);
      r.data[i + 3] = Math.round(out * 255);
    }
  }
}

/** Source-over blit. Fully transparent source pixels are skipped. */
export function blit(dst: Raster, src: Raster, dx: number, dy: number): void {
  for (let y = 0; y < src.height; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.height) continue;
    for (let x = 0; x < src.width; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dst.width) continue;
      const si = (y * src.width + x) * 4;
      if (src.data[si + 3] === 0) continue;
      const di = (ty * dst.width + tx) * 4;
      dst.data[di] = src.data[si]!;
      dst.data[di + 1] = src.data[si + 1]!;
      dst.data[di + 2] = src.data[si + 2]!;
      dst.data[di + 3] = src.data[si + 3]!;
    }
  }
}

/**
 * Nearest-neighbour scaled blit, for the world view's LOD levels.
 *
 * Sampling, never averaging: blending adjacent metatiles produces colours that
 * exist in neither, and a blurred tile is a lie about the art. `scale === 1`
 * must be byte-identical to `blit`.
 */
export function blitScaled(dst: Raster, src: Raster, dx: number, dy: number, scale: number): void {
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));

  for (let y = 0; y < h; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.height) continue;
    const sy = Math.min(src.height - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dst.width) continue;
      const sx = Math.min(src.width - 1, Math.floor(x / scale));
      const si = (sy * src.width + sx) * 4;
      if (src.data[si + 3] === 0) continue;
      const di = (ty * dst.width + tx) * 4;
      dst.data[di] = src.data[si]!;
      dst.data[di + 1] = src.data[si + 1]!;
      dst.data[di + 2] = src.data[si + 2]!;
      dst.data[di + 3] = src.data[si + 3]!;
    }
  }
}
