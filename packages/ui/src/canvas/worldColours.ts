/** Conflict-badge diamond, drawn by the shared `WorldSurface` for both families. */
export function drawDiamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.lineTo(cx + size, cy);
  ctx.lineTo(cx, cy + size);
  ctx.lineTo(cx - size, cy);
  ctx.closePath();
  ctx.fill();
}

/** `#rrggbb` -> `[r, g, b]`, for the level-curve lens's blue/red
 *  interpolation (the level-curve lens) -- falls back to white on
 *  anything that doesn't parse, rather than throwing over a CSS variable
 *  that failed to resolve (e.g. jsdom in a test, or a stylesheet not yet
 *  loaded). */
function parseHexColor(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : [255, 255, 255];
}

/** Linear RGB interpolation between `a` and `b` at `t` (clamped to
 *  [0, 1]) -- deliberately plain RGB lerp, not perceptual (Lab/LCH)
 *  interpolation: the spec's own required copy is "Blue is low, red is
 *  high", a two-point read, not a request for a perceptually-uniform
 *  ramp across many steps. */
function lerpColor(a: [number, number, number], b: [number, number, number], t: number): string {
  const c = Math.min(1, Math.max(0, t));
  const r = Math.round(a[0] + (b[0] - a[0]) * c);
  const g = Math.round(a[1] + (b[1] - a[1]) * c);
  const bl = Math.round(a[2] + (b[2] - a[2]) * c);
  return `rgb(${r}, ${g}, ${bl})`;
}

/** `levelColorMap` over the entries that name a map, with the ramp ends read from the current theme
 *  (`--overlay-elevation-low` to `--danger`). Both world canvases' `levelColorByMap` memos call this. */
export function themedLevelColorMap(levelByMap: readonly { mapName?: string | null; averageLevel: number }[]): Map<string, string> {
  const entries = levelByMap.filter((e): e is typeof e & { mapName: string } => !!e.mapName);
  const style = typeof getComputedStyle === "function" ? getComputedStyle(document.documentElement) : null;
  const low = style?.getPropertyValue("--overlay-elevation-low").trim() || "#3b82f6";
  const high = style?.getPropertyValue("--danger").trim() || "#ef4444";
  return levelColorMap(entries, low, high);
}

/**
 * Pure: colours `entries` by each one's PERCENTILE RANK of `averageLevel` among the whole set (not the raw
 * value). `low`/`high` are `#rrggbb` strings already resolved by the caller; returns a Map from `mapName` to an
 * interpolated `rgb()` string ("Blue is low, red is high").
 *
 * Why rank, not a linear min-max scale: the corpus-wide range (~2.5 to ~66.35) is set by a handful of
 * post-game caves, while ~200 ordinary routes span only about 3-31. A linear scale compressed them into the
 * bottom third of the ramp (confirmed live: Johto read as one shade). Rank stays monotonic in level and
 * spreads colour where the data sits: Route101 to Route28 spans 0%-85% of the ramp, vs 0%-44% linear.
 */
export function levelColorMap(entries: { mapName: string; averageLevel: number }[], low: string, high: string): Map<string, string> {
  const out = new Map<string, string>();
  if (entries.length === 0) return out;
  const sortedLevels = entries.map((e) => e.averageLevel).sort((a, b) => a - b);
  const n = sortedLevels.length;
  // Lowest index whose level is >= `level` -- a plain binary search
  // (sortedLevels is sorted ascending), not a linear scan.
  const rankOf = (level: number): number => {
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sortedLevels[mid]! < level) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const lowRgb = parseHexColor(low);
  const highRgb = parseHexColor(high);
  for (const e of entries) {
    const t = n > 1 ? rankOf(e.averageLevel) / (n - 1) : 0.5;
    out.set(e.mapName, lerpColor(lowRgb, highRgb, t));
  }
  return out;
}
