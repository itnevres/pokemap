import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { zoomAboutPivot, type MapView, type Zoom } from "../components/mapView.js";

/**
 * ONE view value for a map canvas, controlled or not, so no setter is ever called inside another setter's
 * updater (StrictMode double-invokes updaters; Plan 6c E1, follow-up D1). `updateView` is the single write path.
 * Controlled: compute `next` from the latest props.view OUTSIDE any React updater and report it (a no-op result,
 * e.g. zoomAboutPivot at the same zoom, is not reported). Uncontrolled: set state.
 */
export function useCanvasView<T extends MapView>(controlledView: T | undefined, onViewChange: ((next: T) => void) | undefined) {
  const [ownView, setOwnView] = useState<T>({ zoom: 1, pan: { x: 0, y: 0 } } as T);
  const controlled = controlledView !== undefined;
  const view = controlledView ?? ownView;
  const viewRef = useRef(view);
  viewRef.current = view;
  // `onViewChange` goes through a ref so an inline callback never changes `updateView`'s identity (which would
  // re-create `fit` and re-bind the wheel listener on every parent render).
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  const updateView = useCallback(
    (next: T | ((v: T) => T)) => {
      if (!controlled) return setOwnView(next);
      const n = typeof next === "function" ? next(viewRef.current) : next;
      if (n !== viewRef.current) onViewChangeRef.current?.(n);
    },
    [controlled],
  );
  return { controlled, view, updateView };
}

export function useCanvasZoom<T extends MapView>(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  zoom: Zoom,
  updateView: (next: T | ((v: T) => T)) => void,
  zoomLevels: readonly Zoom[],
) {
  const applyZoom = (next: Zoom, pivotX: number, pivotY: number) => updateView((v) => zoomAboutPivot(v, next, pivotX, pivotY) as T);

  const centerPivot = (): [number, number] => {
    const c = canvasRef.current;
    return c ? [c.width / 2, c.height / 2] : [0, 0];
  };

  // A NATIVE listener with { passive: false }, not React's onWheel prop. React attaches wheel listeners as
  // passive, which makes e.preventDefault() a silent no-op: the page scrolls under the canvas while it zooms
  // (confirmed in the real app; jsdom does not enforce passive semantics, so no test catches a regression).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const idx = zoomLevels.indexOf(zoom);
      const nextIdx = e.deltaY < 0 ? Math.min(zoomLevels.length - 1, idx + 1) : Math.max(0, idx - 1);
      applyZoom(zoomLevels[nextIdx]!, x, y);
    };
    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
  }, [zoom, updateView]);

  return { applyZoom, centerPivot };
}

/**
 * Fits once per real map open, not on every render: the user's own zoom/pan must survive an overlay toggle or a
 * paint-triggered image reload. Controlled: the parent owns placement, so no auto-fit.
 */
export function useCanvasAutoFit(imgLoaded: boolean, mapName: string, controlled: boolean, fit: () => void) {
  const fittedForMapRef = useRef<string | null>(null);
  useEffect(() => {
    if (imgLoaded && fittedForMapRef.current !== mapName) {
      if (!controlled) fit();
      fittedForMapRef.current = mapName;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgLoaded, mapName]);
}
