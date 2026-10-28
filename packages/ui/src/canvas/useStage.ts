import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { fitView, zoomAboutPivot, type Point, type View, type ZoomPolicy } from "./view.js";
import { useViewportMeasure } from "../shared/useViewportMeasure.js";
import { useFitShortcut } from "../shared/useFitShortcut.js";
import { useContextMapFit } from "../shared/useWorldContext.js";

type UpdateView<T> = (next: T | ((view: T) => T)) => void;
export type StageZoomPolicy = ZoomPolicy & ({ kind: "stepped" } | { kind: "continuous"; factor: number; boundsFor?: (zoom: number) => { min: number; max: number } });
const NO_FIT_LEVELS: readonly number[] = [];
const NO_FIT = () => {};

/** One view value and pure zoomAboutPivot avoid nested pan setters inside zoom updaters. StrictMode
 * double-invoked the old nested setter, applying pan twice and leaving a blank/off-centre canvas at 4x.
 * Controlled updates compute next from the latest committed prop outside updaters, reporting only changes;
 * uncontrolled updates use state. Neither path may report a gesture twice (Plan 6c E1). */
export function useStageView<T extends View>(controlledView: T | undefined, onViewChange: ((next: T) => void) | undefined) {
  const [ownView, setOwnView] = useState<T>({ zoom: 1, pan: { x: 0, y: 0 } } as T);
  const controlled = controlledView !== undefined;
  const view = controlledView ?? ownView;
  const latest = useRef({ view, onViewChange });
  // Publish only committed props; a suspended render must not leak a speculative controlled view.
  // onViewChange rides this ref so an inline callback never changes updateView's identity (which would
  // re-create fit and re-bind the wheel listener on every parent render).
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
  // Read through a ref published at commit: a new function identity never re-binds the wheel listener, and a
  // suspended render never leaks its bounds into a wheel event on the committed canvas.
  const boundsFor = useRef(policy.kind === "continuous" ? policy.boundsFor : undefined);
  useLayoutEffect(() => {
    boundsFor.current = policy.kind === "continuous" ? policy.boundsFor : undefined;
  });
  const zoomBy = (nextOf: (view: T) => T["zoom"], pivotX: number, pivotY: number) => updateView((view) => {
    const bounds = policy.kind === "continuous" ? boundsFor.current?.(view.zoom) : undefined;
    const result = zoomAboutPivot(view, nextOf(view), pivotX, pivotY, bounds ? { kind: "continuous", ...bounds } : policy);
    return result === view ? view : { ...view, ...result };
  });
  const applyZoom = (next: T["zoom"], pivotX: number, pivotY: number) => zoomBy(() => next, pivotX, pivotY);
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
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      if (policy.kind === "continuous") {
        // Read the updater's view so batched wheel events compound when uncontrolled; controlled stages
        // read the last committed prop (useStageView). 12b PR12b-I3.
        const f = event.deltaY < 0 ? policy.factor : 1 / policy.factor;
        zoomBy((view) => view.zoom * f, px, py);
      } else {
        const next = policy.levels[event.deltaY < 0
          ? Math.min(policy.levels.length - 1, policy.levels.indexOf(zoom) + 1)
          : Math.max(0, policy.levels.indexOf(zoom) - 1)]!;
        applyZoom(next as T["zoom"], px, py);
      }
    };
    // React wheel listeners are passive: preventDefault would silently fail and scroll the page underneath.
    // jsdom does not enforce passive semantics, so no test catches a regression here.
    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
  // Only the stepped branch reads `zoom`; a continuous stage binds once (a wheel never re-attaches the listener).
  }, [canvasRef, policy.kind === "stepped" ? zoom : undefined, updateView, policy.kind,
    policy.kind === "stepped" ? policy.levels : policy.min,
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
    // Fit once per map, never per time/paint reload: readiness can cycle false -> true for the same map,
    // and refitting then would discard the player's zoom/pan. Controlled views never auto-fit.
    // Fit is intentionally sampled at map readiness, never on overlay/paint changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgLoaded, mapName]);
}

/** Fit-to-screen, bound to the F shortcut (chrome on) or the world's context fit (chromeless). `bandNative` is
 * the encounter band in native px on the border's `side` (0 when encounters are off or chromeless), so the
 * sprites fit too. Before the viewport is measured, the composite's native size is used. */
export function useStageFit<T extends View>(a: {
  viewport: { w: number; h: number };
  pixelWidth: number;
  pixelHeight: number;
  zoomLevels: readonly T["zoom"][];
  bandNative: number;
  side: Parameters<typeof fitView>[0]["side"];
  updateView: UpdateView<T>;
  chromeless?: boolean;
  /** Stage callers may override fit; legacy map hooks retain their stepped fit contract. */
  fitOverride?: () => void;
}) {
  const { viewport, pixelWidth, pixelHeight, zoomLevels, bandNative, side, updateView, chromeless, fitOverride } = a;
  const fit = useCallback(() => {
    if (fitOverride) return fitOverride();
    updateView(fitView({ viewport, pixelWidth, pixelHeight, policy: { kind: "stepped", levels: zoomLevels }, bandNative, side }) as T);
  }, [viewport, pixelWidth, pixelHeight, zoomLevels, bandNative, side, updateView, fitOverride]);
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
  // Reading the container ref during render sees the previous commit (null initially). Measurement
  // state supplies one current size to both canvas attributes and Fit, instead of a permanent fallback.
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  useViewportMeasure(containerRef, setViewport);
  const { view, controlled, updateView } = useStageView(options.view, options.onViewChange);
  const zoom = useStageZoom(canvasRef, view.zoom, updateView, options.zoomPolicy);
  const fit = useStageFit({ viewport, pixelWidth: options.pixelWidth, pixelHeight: options.pixelHeight,
    zoomLevels: options.zoomPolicy.kind === "stepped" ? options.zoomPolicy.levels : NO_FIT_LEVELS,
    bandNative: options.bandNative, side: options.side, updateView, chromeless: options.chromeless,
    fitOverride: options.fit ?? (options.zoomPolicy.kind === "continuous" ? NO_FIT : undefined) });
  useStageAutoFit(options.imgLoaded, options.mapName, controlled, fit);

  const pan = useRef<{ start: Point; pan: Point } | null>(null);
  const capture = useRef<{ id: number; canvas: HTMLCanvasElement; captured: boolean } | null>(null);
  const onCancel = useRef(options.onCancel);
  useLayoutEffect(() => { onCancel.current = options.onCancel; });
  const releaseCapture = useCallback(() => {
    const active = capture.current;
    // Clear ownership BEFORE releasing: even a synchronous lost event is our release, not cancellation.
    capture.current = null;
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
    startPan, movePan, endPan, leavePan, hasCapture: () => !!capture.current?.captured,
    beginCapture, releaseCapture, onPointerDown: beginCapture, onPointerCancel: cancelCapture, onLostPointerCapture: cancelCapture };
}
