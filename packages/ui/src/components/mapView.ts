import { ZOOM_LEVELS, zoomAboutPivot as canvasZoomAboutPivot, type MapView, type Zoom } from "../canvas/view.js";

export { ZOOM_LEVELS, type Zoom, type MapView } from "../canvas/view.js";

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
  return canvasZoomAboutPivot(view, next, pivotX, pivotY, { kind: "stepped", levels: ZOOM_LEVELS });
}
