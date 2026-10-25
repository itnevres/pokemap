import type { RefObject } from "react";
import type { MapView, Zoom } from "../components/mapView.js";
import { fitWithBand } from "../encounters/fit.js";
import { useStageView, useStageZoom, useStageAutoFit, useStageFit } from "../canvas/useStage.js";

/**
 * ONE view value for a map canvas, controlled or not, so no setter is ever called inside another setter's
 * updater (StrictMode double-invokes updaters; Plan 6c E1, follow-up D1). `updateView` is the single write path.
 * Controlled: compute `next` from the latest props.view OUTSIDE any React updater and report it (a no-op result,
 * e.g. zoomAboutPivot at the same zoom, is not reported). Uncontrolled: set state.
 */
export function useCanvasView<T extends MapView>(controlledView: T | undefined, onViewChange: ((next: T) => void) | undefined) {
  // `onViewChange` goes through a ref so an inline callback never changes `updateView`'s identity (which would
  // re-create `fit` and re-bind the wheel listener on every parent render).
  return useStageView(controlledView, onViewChange);
}

export function useCanvasZoom<T extends MapView>(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  zoom: Zoom,
  updateView: (next: T | ((v: T) => T)) => void,
  zoomLevels: readonly Zoom[],
) {
  // A NATIVE listener with { passive: false }, not React's onWheel prop. React attaches wheel listeners as
  // passive, which makes e.preventDefault() a silent no-op: the page scrolls under the canvas while it zooms
  // (confirmed in the real app; jsdom does not enforce passive semantics, so no test catches a regression).
  const { applyZoom, centerPivot } = useStageZoom<T>(canvasRef, zoom, updateView, { kind: "stepped", levels: zoomLevels });
  return { applyZoom: (next: Zoom, pivotX: number, pivotY: number) => applyZoom(next as T["zoom"], pivotX, pivotY), centerPivot };
}

/**
 * Fits once per real map open, not on every render: the user's own zoom/pan must survive an overlay toggle or a
 * paint-triggered image reload. Controlled: the parent owns placement, so no auto-fit.
 */
export function useCanvasAutoFit(imgLoaded: boolean, mapName: string, controlled: boolean, fit: () => void) {
  return useStageAutoFit(imgLoaded, mapName, controlled, fit);
}

/**
 * Fit-to-screen for a map canvas, bound to the F shortcut (chrome on) or the world's context fit (chromeless).
 * `bandNative` is the encounter band in native pixels on the border's `side` (0 when encounters are off or the
 * canvas is chromeless), so the sprites fit too. Before the viewport is measured, the composite's native size is used.
 */
export function useCanvasFit<T extends MapView>(a: {
  viewport: { w: number; h: number };
  pixelWidth: number;
  pixelHeight: number;
  zoomLevels: readonly Zoom[];
  bandNative: number;
  side: Parameters<typeof fitWithBand>[0]["side"];
  updateView: (next: T | ((v: T) => T)) => void;
  chromeless?: boolean;
}) {
  return useStageFit<T>(a);
}
