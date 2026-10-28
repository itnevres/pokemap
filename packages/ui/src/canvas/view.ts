import { fitWithBand } from "../encounters/fit.js";
import type { BorderSide } from "../encounters/borderSide.js";

export interface Point {
  x: number;
  y: number;
}

/** One pan/zoom value keeps StrictMode's double-invoked updaters harmless. */
export interface View<Z extends number = number> {
  zoom: Z;
  pan: Point;
}

/** Zoom steps shared by the GBA and GBC map canvases. */
export const ZOOM_LEVELS = [1, 2, 4] as const;
export type Zoom = (typeof ZOOM_LEVELS)[number];

/** A map canvas's whole pan/zoom state, updated as ONE value so React's
 *  <StrictMode> double-invoked updaters stay harmless (see Plan 6c E1, D1). */
export interface MapView extends View<Zoom> {}

export interface SteppedZoomPolicy<Z extends number = number> {
  kind: "stepped";
  levels: readonly Z[];
}

export interface ContinuousZoomPolicy {
  kind: "continuous";
  min: number;
  max: number;
}

export type ZoomPolicy<Z extends number = number> = SteppedZoomPolicy<Z> | ContinuousZoomPolicy;

export function screenToSource(point: Point, view: View): Point {
  return { x: (point.x - view.pan.x) / view.zoom, y: (point.y - view.pan.y) / view.zoom };
}

export function sourceToScreen(point: Point, view: View): Point {
  return { x: view.pan.x + point.x * view.zoom, y: view.pan.y + point.y * view.zoom };
}

export function zoomAboutPivot<Z extends number>(view: View<Z>, nextZoom: Z, pivotX: number, pivotY: number, policy: SteppedZoomPolicy<Z>): View<Z>;
export function zoomAboutPivot(view: View, nextZoom: number, pivotX: number, pivotY: number, policy: ZoomPolicy): View;
/** Keeps the pivot's source point fixed; unchanged zoom preserves identity so callers can skip work. */
export function zoomAboutPivot(view: View, nextZoom: number, pivotX: number, pivotY: number, policy: ZoomPolicy): View {
  const next = policy.kind === "continuous" ? Math.min(policy.max, Math.max(policy.min, nextZoom)) : nextZoom;
  if (view.zoom === next) return view;
  const source = screenToSource({ x: pivotX, y: pivotY }, view);
  const x = pivotX - source.x * next;
  const y = pivotY - source.y * next;
  // Maps align pan to stage pixels; continuous world zoom must retain fractional pan.
  return { zoom: next, pan: policy.kind === "stepped" ? { x: Math.round(x), y: Math.round(y) } : { x, y } };
}

/** Before viewport measurement, fit against the composite's native size, as the map canvases do today. */
export function fitView<Z extends number>(a: {
  viewport: { w: number; h: number };
  pixelWidth: number;
  pixelHeight: number;
  policy: SteppedZoomPolicy<Z>;
  bandNative: number;
  side: BorderSide;
}): View<Z> {
  return fitWithBand({
    pw: a.pixelWidth,
    ph: a.pixelHeight,
    vw: a.viewport.w || a.pixelWidth,
    vh: a.viewport.h || a.pixelHeight,
    levels: a.policy.levels,
    bandNative: a.bandNative,
    side: a.side,
  });
}
