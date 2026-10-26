import {
  zoomAboutPivot,
  sourceToScreen,
  screenToSource,
  type Point,
  type View,
} from "./view.js";
import type { Bounds } from "@pokemap/core/src/world/connections.js";

/** Shared wheel zoom factor (multiplicative per notch). */
export const WHEEL_FACTOR = 1.2;

/** Fraction of native resolution the cached LOD buffer renders at. */
export const LOD_SCALE = 0.25;

/** Jump fit fills this fraction of the viewport: 100% zooms in so tight it loses the surrounding context. */
export const JUMP_FILL_FRACTION = 0.6;

/** Screen px radius for warp marker hit-testing (P12-4i). */
export const WARP_HIT_RADIUS = 8;

/** World zoom is screen px per native unit (16 px tile, 32 px block); its range is a scale of it (P12-4j). */
export const WORLD_SCALE_MIN = 1 / 2048;

export const WORLD_SCALE_MAX = 1;

/** Axis-aligned rectangle in world (native) units. */
export type WorldRect = Bounds;

/** Placement-like object carrying map, position, size, and component index. */
export interface WorldPlacementLike {
  map: string;
  x: number;
  y: number;
  width: number;
  height: number;
  component: number;
}

/** Function that returns the true size of a placement (for orphans with 0×0 on the wire). */
export type SizeOf = (p: WorldPlacementLike) => { width: number; height: number };

/** Result of a fit computation: zoom and pan (screen px). */
export interface FitResult {
  zoom: number;
  pan: Point;
}

export function worldZoomRange(nativePx: number): { min: number; max: number } {
  return { min: nativePx * WORLD_SCALE_MIN, max: nativePx * WORLD_SCALE_MAX };
}

/**
 * Returns the effective zoom bounds for the current view.
 * The upper bound is max(maxWorldZoom(range.max), current) so the cap never
 * clamps below the current zoom (e.g. in-context editing).
 */
export function worldZoomBounds(
  nativePx: number,
  current: number,
  maxWorldZoom: (base: number) => number,
): { min: number; max: number } {
  const range = worldZoomRange(nativePx);
  return { min: range.min, max: Math.max(maxWorldZoom(range.max), current) };
}

/**
 * Zooms the view about a screen pivot, clamping to bounds.
 * Returns the same view object when the clamped zoom is unchanged (so callers
 * can use reference equality to skip work). Extra fields (e.g. `fitted`) survive.
 */
export function zoomWorldAboutPivot<V extends View>(
  view: V,
  factor: number,
  pivotX: number,
  pivotY: number,
  bounds: { min: number; max: number },
): V {
  const r = zoomAboutPivot(view, view.zoom * factor, pivotX, pivotY, {
    kind: "continuous",
    ...bounds,
  });
  return r === view ? view : { ...view, ...r };
}

/**
 * Union of placements' world rects. Uses `sizeOf(p)` (default: `p` itself) for
 * the size. Skips placements with width<=0 or height<=0. Returns null when
 * nothing remains.
 */
export function boundsOf(
  placements: Iterable<WorldPlacementLike>,
  sizeOf: SizeOf = (p) => p,
): WorldRect | null {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  let any = false;
  for (const p of placements) {
    const { width, height } = sizeOf(p);
    if (width <= 0 || height <= 0) continue;
    any = true;
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + width);
    y1 = Math.max(y1, p.y + height);
  }
  if (!any) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** The placement's real component, or null for a manual orphan (component -1) or a shelved placement:
 *  autoLayoutUnplaced gives shelved maps a synthetic index from `components.length` up. */
function componentOf<C>(p: WorldPlacementLike, components: readonly C[]): C | null {
  return p.component >= 0 && p.component < components.length ? components[p.component]! : null;
}

/**
 * The first-load and manual Fit (P12-4m, GBA's `fitWorld` rule): the multi-map components ("the world" as a
 * navigable place). Fitting every placement would include hundreds of single-map interiors shelved far from the
 * landmasses, shrinking the real world to a few stray pixels. Falls back to every placement when no cluster
 * qualifies; null for an empty world (Fit is then a no-op).
 */
export function fitClusters(
  placements: Iterable<WorldPlacementLike>,
  components: readonly { maps: readonly string[] }[],
  sizeOf?: SizeOf,
): WorldRect | null {
  const all = [...placements];
  const clusters = all.filter((p) => (componentOf(p, components)?.maps.length ?? 0) > 1);
  return boundsOf(clusters.length > 0 ? clusters : all, sizeOf);
}

/**
 * The dungeon-filter fit: only the members at a real world position (component resolves). A dungeon mixing one
 * outdoor member with shelved indoor floors once fit ~20,000x3,800 tiles (live, a 20-map Safari Zone) and read as
 * an empty canvas. Falls back to every member only when none is anchored, so an all-shelved dungeon still shows.
 */
export function fitFilter(
  placements: Iterable<WorldPlacementLike>,
  filter: ReadonlySet<string>,
  components: readonly { maps: readonly string[] }[],
  sizeOf?: SizeOf,
): WorldRect | null {
  const scoped: WorldPlacementLike[] = [];
  const anchored: WorldPlacementLike[] = [];
  for (const p of placements) {
    if (!filter.has(p.map)) continue;
    scoped.push(p);
    if (componentOf(p, components)) anchored.push(p);
  }
  return boundsOf(anchored.length > 0 ? anchored : scoped, sizeOf);
}

/**
 * Computes a centred fit for `bounds` inside `viewport`, clamped to `zoomBounds`.
 * Degenerate bounds or viewport → { zoom: 1, pan: { x: 0, y: 0 } }.
 */
export function computeFit(
  bounds: WorldRect,
  viewport: { w: number; h: number },
  zoomBounds: { min: number; max: number },
): FitResult {
  if (bounds.width <= 0 || bounds.height <= 0 || viewport.w <= 0 || viewport.h <= 0) {
    return { zoom: 1, pan: { x: 0, y: 0 } };
  }
  const zoom = Math.min(
    zoomBounds.max,
    Math.max(zoomBounds.min, Math.min(viewport.w / bounds.width, viewport.h / bounds.height)),
  );
  return centredFit(bounds, viewport, zoom);
}

/** Centres `bounds` in `viewport` at the given `zoom`. */
export function centredFit(
  bounds: WorldRect,
  viewport: { w: number; h: number },
  zoom: number,
): FitResult {
  return {
    zoom,
    pan: {
      x: -bounds.x * zoom + (viewport.w - bounds.width * zoom) / 2,
      y: -bounds.y * zoom + (viewport.h - bounds.height * zoom) / 2,
    },
  };
}

/**
 * The map-list jump: the UNCLAMPED "fits entirely" zoom is scaled by `fraction` FIRST, then clamped, so the map
 * fills about 60% of the viewport with its neighbours in view. Clamping first was wrong whenever the raw fit
 * exceeds the max (most real GBC maps): a 20x18 map in 1000x668 landed at a 0.52 fill, not 0.6 (live).
 */
export function jumpFit(
  bounds: WorldRect,
  viewport: { w: number; h: number },
  zoomBounds: { min: number; max: number },
  fraction = JUMP_FILL_FRACTION,
): FitResult {
  if (bounds.width <= 0 || bounds.height <= 0 || viewport.w <= 0 || viewport.h <= 0) {
    return { zoom: 1, pan: { x: 0, y: 0 } };
  }
  const rawZoom = Math.min(viewport.w / bounds.width, viewport.h / bounds.height);
  const zoom = Math.min(zoomBounds.max, Math.max(zoomBounds.min, rawZoom * fraction));
  return centredFit(bounds, viewport, zoom);
}

/**
 * Returns a Map of singleton component map -> its size (the component's bounds).
 * Both world canvases' `sizeByMap` memos call this.
 */
export function singletonSizes(
  components: readonly { maps: readonly string[]; bounds: { width: number; height: number } }[] | undefined,
): Map<string, { width: number; height: number }> {
  const m = new Map<string, { width: number; height: number }>();
  if (components) {
    for (const c of components) {
      if (c.maps.length === 1) m.set(c.maps[0]!, { width: c.bounds.width, height: c.bounds.height });
    }
  }
  return m;
}

/** Draw from the small LOD tile below native x LOD_SCALE (GBA 4 px/tile, GBC 8 px/block). */
export function smallTilesAt(zoom: number, nativePx: number): boolean {
  return zoom < nativePx * LOD_SCALE;
}

export const worldToScreen = sourceToScreen;
export const screenToWorld = screenToSource;

/** A placement's screen rect; `size` overrides it for a 0x0 orphan. */
export function rectOf(
  p: { x: number; y: number; width: number; height: number },
  view: View,
  size: { width: number; height: number } = p,
): { x: number; y: number; w: number; h: number } {
  return {
    x: p.x * view.zoom + view.pan.x,
    y: p.y * view.zoom + view.pan.y,
    w: size.width * view.zoom,
    h: size.height * view.zoom,
  };
}

/**
 * Projects a warp point: placement + (warp * warpOffset) in world units → screen.
 * The adapter supplies the offset (GBA warps are in tiles, offset 1; GBC warp
 * events are 16 px steps on 32 px blocks, offset 1/2).
 */
export function warpPoint(
  placement: Point,
  warp: Point,
  warpOffset: number,
  view: View,
): Point {
  return worldToScreen(
    { x: placement.x + warp.x * warpOffset, y: placement.y + warp.y * warpOffset },
    view,
  );
}

/** The first marker within WARP_HIT_RADIUS screen px of (sx, sy). */
export function warpHit<E extends { sx: number; sy: number }>(
  entries: readonly E[],
  sx: number,
  sy: number,
): E | undefined {
  for (const e of entries) {
    if (Math.hypot(e.sx - sx, e.sy - sy) <= WARP_HIT_RADIUS) return e;
  }
  return undefined;
}

/** The topmost (last drawn) placement under a world point; rects are half-open. */
export function hitPlacement<P extends WorldPlacementLike>(
  placements: readonly P[],
  wx: number,
  wy: number,
  sizeOf?: SizeOf,
): P | null {
  const getSize = sizeOf ?? ((p) => p);
  for (let i = placements.length - 1; i >= 0; i--) {
    const p = placements[i]!;
    const { width, height } = getSize(p);
    if (wx >= p.x && wx < p.x + width && wy >= p.y && wy < p.y + height) return p;
  }
  return null;
}
