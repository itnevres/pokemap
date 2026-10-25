import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { fitView, zoomAboutPivot, type Point, type View, type ZoomPolicy } from "./view.js";
import { useViewportMeasure } from "../shared/useViewportMeasure.js";
import { useFitShortcut } from "../shared/useFitShortcut.js";
import { useContextMapFit } from "../shared/useWorldContext.js";

type UpdateView<T> = (next: T | ((view: T) => T)) => void;
export type StageZoomPolicy = ZoomPolicy & ({ kind: "stepped" } | { kind: "continuous"; factor: number });

/** Compute controlled updates outside React updaters: StrictMode must never report a gesture twice. */
export function useStageView<T extends View>(controlledView: T | undefined, onViewChange: ((next: T) => void) | undefined) {
  const [ownView, setOwnView] = useState<T>({ zoom: 1, pan: { x: 0, y: 0 } } as T);
  const controlled = controlledView !== undefined;
  const view = controlledView ?? ownView;
  const latest = useRef({ view, onViewChange });
  // Publish only committed props; a suspended render must not leak a speculative controlled view.
  useLayoutEffect(() => { latest.current = { view, onViewChange }; });
  const updateView = useCallback<UpdateView<T>>((next) => {
    if (!controlled) return setOwnView(next);
    const current = latest.current;
    const value = typeof next === "function" ? next(current.view) : next;
    if (value !== current.view) current.onViewChange?.(value);
  }, [controlled]);
  return { controlled, view, updateView };
}

export function useStageZoom<T extends View>(canvasRef: RefObject<HTMLCanvasElement | null>, zoom: number, updateView: UpdateView<T>, policy: StageZoomPolicy) {
  const applyZoom = (next: T["zoom"], pivotX: number, pivotY: number) => updateView((view) => {
    const result = zoomAboutPivot(view, next, pivotX, pivotY, policy);
    return result === view ? view : { ...view, ...result };
  });
  const centerPivot = (): [number, number] => {
    const canvas = canvasRef.current;
    return canvas ? [canvas.width / 2, canvas.height / 2] : [0, 0];
  };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const next = policy.kind === "continuous"
        ? zoom * (event.deltaY < 0 ? policy.factor : 1 / policy.factor)
        : policy.levels[event.deltaY < 0
          ? Math.min(policy.levels.length - 1, policy.levels.indexOf(zoom) + 1)
          : Math.max(0, policy.levels.indexOf(zoom) - 1)]!;
      applyZoom(next as T["zoom"], event.clientX - rect.left, event.clientY - rect.top);
    };
    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
  }, [canvasRef, zoom, updateView, policy.kind, policy.kind === "stepped" ? policy.levels : policy.min,
    policy.kind === "continuous" ? policy.max : undefined, policy.kind === "continuous" ? policy.factor : undefined]);
  return { applyZoom, centerPivot };
}

export function useStageAutoFit(imgLoaded: boolean, mapName: string, controlled: boolean, fit: () => void) {
  const fittedForMapRef = useRef<string | null>(null);
  useEffect(() => {
    if (imgLoaded && fittedForMapRef.current !== mapName) {
      if (!controlled) fit();
      fittedForMapRef.current = mapName;
    }
    // Fit is intentionally sampled at map readiness, never on overlay/paint changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgLoaded, mapName]);
}

export function useStageFit<T extends View>(a: {
  viewport: { w: number; h: number };
  pixelWidth: number;
  pixelHeight: number;
  zoomLevels: readonly T["zoom"][];
  bandNative: number;
  side: Parameters<typeof fitView>[0]["side"];
  updateView: UpdateView<T>;
  chromeless?: boolean;
}) {
  const { viewport, pixelWidth, pixelHeight, zoomLevels, bandNative, side, updateView, chromeless } = a;
  const fit = useCallback(() => {
    updateView(fitView({ viewport, pixelWidth, pixelHeight, policy: { kind: "stepped", levels: zoomLevels }, bandNative, side }) as T);
  }, [viewport, pixelWidth, pixelHeight, zoomLevels, bandNative, side, updateView]);
  useFitShortcut(fit, !chromeless);
  useContextMapFit(fit, chromeless);
  return fit;
}

export interface StageOptions<T extends View = View> {
  view?: T;
  onViewChange?: (next: T) => void;
  zoomPolicy: StageZoomPolicy;
  mapName: string;
  imgLoaded: boolean;
  pixelWidth: number;
  pixelHeight: number;
  /** Map fit is stepped; continuous world surfaces can supply their own fit callback. */
  fit?: () => void;
  bandNative: number;
  side: Parameters<typeof fitView>[0]["side"];
  chromeless?: boolean;
  onCancel?: () => void;
}

/** Pointer handlers manage capture only. Gesture start/move/commit belong to compatibility mouse handlers. */
export function useStage<T extends View = View>(options: StageOptions<T>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  useViewportMeasure(containerRef, setViewport);
  const { view, controlled, updateView } = useStageView(options.view, options.onViewChange);
  const zoom = useStageZoom(canvasRef, view.zoom, updateView, options.zoomPolicy);
  const fit = useCallback(() => {
    if (options.fit) return options.fit();
    if (options.zoomPolicy.kind === "stepped") {
      updateView(fitView({ viewport, pixelWidth: options.pixelWidth, pixelHeight: options.pixelHeight,
        policy: options.zoomPolicy, bandNative: options.bandNative, side: options.side }) as T);
    }
  }, [options.fit, options.zoomPolicy, viewport, options.pixelWidth, options.pixelHeight, options.bandNative, options.side, updateView]);
  useFitShortcut(fit, !options.chromeless);
  useContextMapFit(fit, options.chromeless);
  useStageAutoFit(options.imgLoaded, options.mapName, controlled, fit);

  const pan = useRef<{ start: Point; pan: Point } | null>(null);
  const capture = useRef<{ id: number; canvas: HTMLCanvasElement; captured: boolean } | null>(null);
  const [captured, setCaptured] = useState(false);
  const onCancel = useRef(options.onCancel);
  useLayoutEffect(() => { onCancel.current = options.onCancel; });
  const releaseCapture = useCallback(() => {
    const active = capture.current;
    // Clear ownership BEFORE releasing: even a synchronous lost event is our release, not cancellation.
    capture.current = null;
    setCaptured(false);
    if (active?.captured) {
      try { active.canvas.releasePointerCapture?.(active.id); } catch { /* Already released by the browser. */ }
    }
  }, []);
  const beginCapture = (event: { pointerId: number; currentTarget: HTMLCanvasElement }): boolean => {
    if (capture.current) return capture.current.id === event.pointerId && capture.current.captured;
    const canvas = event.currentTarget;
    let held = false;
    try {
      if (canvas.setPointerCapture) {
        canvas.setPointerCapture(event.pointerId);
        held = canvas.hasPointerCapture ? canvas.hasPointerCapture(event.pointerId) : true;
      }
    } catch { /* Best effort: the surface retains its end-on-leave fallback. */ }
    capture.current = { id: event.pointerId, canvas, captured: held };
    setCaptured(held);
    return held;
  };
  const cancelCapture = (event: { pointerId: number }) => {
    if (capture.current?.id !== event.pointerId) return;
    pan.current = null;
    releaseCapture();
    onCancel.current?.();
  };
  // Normal pointer-up may implicitly release capture before the compatibility mouse-up. It is never a cancel.
  useEffect(() => {
    const canvas = canvasRef.current;
    const up = (event: PointerEvent) => {
      if (capture.current?.id === event.pointerId) releaseCapture();
    };
    canvas?.addEventListener("pointerup", up);
    return () => canvas?.removeEventListener("pointerup", up);
  }, [releaseCapture]);
  useLayoutEffect(() => () => {
    pan.current = null;
    releaseCapture();
  }, [options.mapName, releaseCapture]);

  const startPan = (point: { clientX: number; clientY: number }) => {
    if (pan.current) return;
    pan.current = { start: { x: point.clientX, y: point.clientY }, pan: view.pan };
  };
  const movePan = (point: { clientX: number; clientY: number }) => {
    const drag = pan.current;
    if (drag) updateView((current) => ({ ...current, pan: {
      x: drag.pan.x + point.clientX - drag.start.x, y: drag.pan.y + point.clientY - drag.start.y,
    } }));
  };
  const endPan = () => { pan.current = null; releaseCapture(); };
  // Hover is the surface's concern; only uncaptured drags terminate on leave.
  const leavePan = () => { if (!capture.current?.captured) endPan(); };
  return { canvasRef, containerRef, viewport, controlled, view, updateView, ...zoom, fit,
    startPan, movePan, endPan, leavePan, captured, hasCapture: () => !!capture.current?.captured,
    beginCapture, releaseCapture, onPointerDown: beginCapture, onPointerCancel: cancelCapture, onLostPointerCapture: cancelCapture };
}
