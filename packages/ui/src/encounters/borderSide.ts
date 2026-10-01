/**
 * Encounter-border side selection (Plan 6c Task B2, pure).
 *
 * U4: side order left, top, right, bottom; the first free side wins. A side is
 * blocked when a placed map's rect and the side's band intersect with
 * POSITIVE area (half-open rects): flush against the map blocks, a gap of
 * exactly `band` or a bare corner contact does not. All four blocked -> the
 * side with the least overlap (ties by SIDE_ORDER). With no layout (map view)
 * a side is blocked when the map has a connection on it.
 */
import type { ConnectionDirection } from "@pokemap/core/src/load/maps.js";

export type BorderSide = "left" | "top" | "right" | "bottom";
export interface Rect { x: number; y: number; width: number; height: number }
export type CompassDir = "north" | "south" | "east" | "west";

export const SIDE_ORDER: readonly BorderSide[] = ["left", "top", "right", "bottom"];
/** Border band thickness in world units: 64 native px (GBA metatiles, GBC blocks). */
export const BORDER_BAND = { gba: 4, gbc: 2 } as const;

/** The band of thickness `band` just outside `rect` on `side`. */
export function bandRect(rect: Rect, side: BorderSide, band: number): Rect {
  const { x, y, width: w, height: h } = rect;
  switch (side) {
    case "left": return { x: x - band, y, width: band, height: h };
    case "top": return { x, y: y - band, width: w, height: band };
    case "right": return { x: x + w, y, width: band, height: h };
    case "bottom": return { x, y: y + h, width: w, height: band };
  }
}

/** Positive-area intersection of two half-open rects (0 when they only touch). */
export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * First free side in SIDE_ORDER, else the least-overlapped. `neighbours` may
 * include `rect` itself (or an equal rect): a band lies strictly outside its
 * rect, so it never overlaps it and blocks nothing; callers may pass one shared
 * list of every placed rect rather than a per-map copy. World units are integers (blocks /
 * metatiles), which is why a gap of exactly `band` is exactly zero area. `band <= 0`
 * returns `left`: no band can overlap anything.
 */
export function pickBorderSide(rect: Rect, neighbours: readonly Rect[], band: number): BorderSide {
  let best: BorderSide = SIDE_ORDER[0]!;
  let bestTotal = Infinity;
  for (const side of SIDE_ORDER) {
    const b = bandRect(rect, side, band);
    let total = 0;
    for (const n of neighbours) total += overlapArea(b, n);
    if (total === 0) return side;
    if (total < bestTotal) { best = side; bestTotal = total; }
  }
  return best;
}

const SIDE_DIR: Record<BorderSide, CompassDir> = { left: "west", top: "north", right: "east", bottom: "south" };

/** Map view (no layout): first side in SIDE_ORDER with no connection; all four -> left. */
export function borderSideFromConnections(dirs: ReadonlySet<CompassDir>): BorderSide {
  return SIDE_ORDER.find((s) => !dirs.has(SIDE_DIR[s])) ?? "left";
}

/** GBA connection direction -> compass name; dive/emerge are not planar sides. */
export function gbaDirToCompass(d: ConnectionDirection): CompassDir | undefined {
  switch (d) {
    case "up": return "north";
    case "down": return "south";
    case "left": return "west";
    case "right": return "east";
    default: return undefined;
  }
}
