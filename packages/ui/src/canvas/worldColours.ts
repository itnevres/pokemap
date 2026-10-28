/** Exported (Plan 6b Task 5, additive): `GbcWorldCanvas` draws its own
 *  conflict badges with this exact helper rather than a copy -- GBC has no
 *  vertical links, so unlike `drawDiamond`, `drawTriangle` (dive/emerge)
 *  has no GBC use and is deliberately NOT exported alongside it. */
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

/**
 * Pure: colours `entries` by each one's PERCENTILE RANK of `averageLevel`
 * among the whole set (not the raw value). Percentile rank spreads the ramp
 * across ordinary routes instead of letting extreme post-game levels compress it.
 * `low`/`high` are `#rrggbb` strings (already
 * resolved from a CSS custom property by the caller); returns a Map from
 * `mapName` to an interpolated `rgb()` string.
 *
 * Exported additively (Plan 6b Task 6): `GbcWorldCanvas`'s own level-curve
 * lens reuses this exact ramp/algorithm against `/api/coverage`'s own
 * `levelByMap` (a structurally identical `{ mapName, averageLevel }[]`)
 * rather than re-deriving the same binary-search percentile logic a second
 * time -- the spec's own "reuse the helper if it's exported, or export it
 * additively" instruction. No existing GBA behaviour changes: this is the
 * SAME computation `levelColorByMap` always ran, just factored out of the
 * `useMemo` so it can be called from outside a React component too.
 */
// mapName -> a blue(low)/red(high) colour string (spec §9's "Blue is
// low, red is high"). Deliberately its OWN memo, keyed only on
// `coverageData` -- coverageData is fetched once and never again (I8:
// the project is read-only for all of Plan 1), so this runs once, not on
// every pan/zoom frame the way lensOverlayEntries below necessarily
// does.
//
// Review fix: this used to be a linear min-max scale across all 227
// maps' averageLevel. That is technically correct but visually useless
// for the design goal spec §9 actually states -- "look for maps that
// jump several levels above their neighbours" -- because the corpus-wide
// range (~2.5 to ~66.35) is set almost entirely by a handful of
// post-game caves (Mt Silver, Cerulean Cave), while ~200 ordinary routes
// actually span only about 3-31. A linear scale anchored on the true
// extremes compresses that whole ordinary range into roughly the bottom
// third of the ramp, so neighbouring routes a few levels apart end up
// nearly the same shade -- confirmed live: Johto read as one shade with
// a couple of outliers, not a gradient.
//
// Fixed by colouring on PERCENTILE RANK among all 227 levels instead of
// the raw value: `t` is a map's position in the level-sorted list,
// normalised to [0, 1]. This is still monotonic in level -- the lowest-
// level map is always the most blue and the highest always the most
// red, so "blue is low, red is high" still holds map-to-map -- but it
// spreads colour across the FULL ramp everywhere real data actually
// sits, rather than letting a few extreme outliers compress everything
// else. Verified against the real corpus: Route101 (2.5, Johto's own
// start) to Route28 (30.8, Johto's last route before Kanto) spans 0% to
// 85% of the ramp by rank, vs only 0% to 44% under the old linear scale.
//
// Reads --overlay-elevation-low/--danger live via getComputedStyle, the
// same call the conflict/dive/emerge badge colours in the draw effect
// drawers already make -- but, unlike those (re-read every frame), this
// is NOT reactive to a live theme toggle mid-session: it is computed
// once, when coverageData arrives, and cached until coverageData itself
// changes (never, in practice). Accepted as a minor imperfection for a
// desktop tool not expected to flip theme mid-session, rather than
// re-deriving 227 interpolated colours on every mouse-move frame for a
// toggle nothing else in surface reacts to live either.

/** `levelColorMap` over the entries that name a map, with the ramp ends read from the current theme
 *  (`--overlay-elevation-low` to `--danger`). Both world canvases' `levelColorByMap` memos call this. */
export function themedLevelColorMap(levelByMap: readonly { mapName?: string | null; averageLevel: number }[]): Map<string, string> {
  const entries = levelByMap.filter((e): e is typeof e & { mapName: string } => !!e.mapName);
  const style = typeof getComputedStyle === "function" ? getComputedStyle(document.documentElement) : null;
  const low = style?.getPropertyValue("--overlay-elevation-low").trim() || "#3b82f6";
  const high = style?.getPropertyValue("--danger").trim() || "#ef4444";
  return levelColorMap(entries, low, high);
}

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
