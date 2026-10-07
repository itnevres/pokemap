/** Zoom steps shared by the GBA and GBC map canvases. */
export const ZOOM_LEVELS = [1, 2, 4] as const;
export type Zoom = (typeof ZOOM_LEVELS)[number];

/** A map canvas's whole pan/zoom state, updated as ONE value so React's
 *  <StrictMode> double-invoked updaters stay harmless (see Plan 6c E1, D1). */
export interface MapView {
  zoom: Zoom;
  pan: { x: number; y: number };
}

/**
 * Pure: given the current view, the next zoom level, and a pivot point in
 * STAGE-canvas pixels, returns the view that keeps the composite-space point
 * under the pivot fixed on screen -- or the SAME `view` object (not a new
 * one with equal fields) when `next === view.zoom`, so a caller can use
 * reference equality to skip work. Call it from a single updater site per
 * canvas (`setView(v => zoomAboutPivot(v, ...))`, or `MapCanvas`'s
 * `updateView`), so React's `<StrictMode>` double-invoking an updater with
 * the same input `v` is harmless -- both invocations compute the identical
 * result, and only one is ever committed. In `MapCanvas`'s controlled mode
 * it runs outside any React updater, exactly once per gesture.
 */
export function zoomAboutPivot(view: MapView, next: Zoom, pivotX: number, pivotY: number): MapView {
  if (view.zoom === next) return view;
  const cx = (pivotX - view.pan.x) / view.zoom;
  const cy = (pivotY - view.pan.y) / view.zoom;
  return { zoom: next, pan: { x: Math.round(pivotX - cx * next), y: Math.round(pivotY - cy * next) } };
}
