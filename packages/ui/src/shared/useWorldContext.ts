import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type React from "react";
import { ZOOM_LEVELS, zoomAboutPivot, type MapView, type Zoom } from "../components/mapView.js";
import { enterContextView, mapViewFromWorld, snapContextZoom, worldViewFromMapView } from "../world/contextView.js";

export interface ContextPlacement { x: number; y: number; width: number; height: number }

type RegisterFit = (fit: (() => void) | null) => void;
export const ContextMapFit = createContext<RegisterFit | null>(null);

/** Register the map canvas's own Fit, preserving its exact composite size and viewport fallback. */
export function useContextMapFit(fit: () => void, chromeless: boolean | undefined): void {
  const register = useContext(ContextMapFit);
  const latest = useRef(fit);
  latest.current = fit;
  useEffect(() => {
    if (!register || !chromeless) return;
    register(() => latest.current());
    return () => register(null);
  }, [register, chromeless]);
}

export interface UseWorldContextArgs {
  /** World px per unit at 1x: 16 (GBA tile) or 32 (GBC block). Required, no default. */
  native: number;
  context: { map: string; origin: { x: number; y: number } | null; onExitRequest(): void } | null;
  /** null unless the context map is placed with width > 0 && height > 0. */
  placement: ContextPlacement | null;
  world: { pan: { x: number; y: number }; zoom: number; setView(v: { pan: { x: number; y: number }; zoom: number }): void };
  /** Pivot for setContextZoom (its centre). */
  viewport: { w: number; h: number };
  /** The box for the pointer at snap time; the focus target on exit. */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Client px recorded by the host before entering; read and cleared at snap. */
  snapPointerRef: React.MutableRefObject<{ x: number; y: number } | null>;
  /** Family-specific: its context menu is open (it closes on its own window listener). */
  isBlocked(): boolean;
}

export interface WorldContext {
  registerFit: RegisterFit;
  fit(): void;
  fitEnabled: boolean;
  inContext: boolean;
  contextView: MapView | null;
  onContextViewChange(next: MapView): void;
  setContextZoom(z: Zoom): void;
  /** Keyboard +/-: toward `direction` from the nearest level (a wheel can leave a non-level zoom). No-op outside a snapped context. */
  stepZoom(direction: 1 | -1): void;
  overlayRef: React.RefObject<HTMLDivElement | null>;
  onOverlayDoubleClick(e: React.MouseEvent<HTMLDivElement>): void;
  maxWorldZoom(base: number): number;
}

/** In-context editing of one world map, shared by the GBA and GBC world canvases (`native` is the per-family parameter). */
export function useWorldContext(args: UseWorldContextArgs): WorldContext {
  const { native, context, placement, world, viewport, canvasRef, snapPointerRef } = args;
  const inContext = context !== null;
  const contextName = context?.map ?? null;
  const contextOrigin = context?.origin ?? null;
  const hasOrigin = contextOrigin !== null;
  const mapFitRef = useRef<(() => void) | null>(null);
  const [hasMapFit, setHasMapFit] = useState(false);
  const registerFit = useCallback<RegisterFit>((fit) => {
    mapFitRef.current = fit;
    setHasMapFit(fit !== null);
  }, []);
  const fitEnabled = !!(placement && contextOrigin && hasMapFit);
  const fit = () => {
    if (fitEnabled) mapFitRef.current?.();
  };

  // Snap once per entry: the context map's centre goes to the recorded pointer (canvas centre if none), at the nearest
  // of 1x/2x/4x. It waits for `context.origin` (the map's layout): the host mounts its editing chrome in that same
  // commit, which moves and resizes this canvas, so the pointer (client px) is converted with the canvas box as it is
  // NOW, not as it was at the click. `snappedFor` gates the overlay canvas so it never mounts at the pre-snap zoom.
  // The ref is the same-tick guard (a StrictMode double run must not snap twice); one setView, never nested. Leaving
  // context hands focus back to the canvas (the Done button unmounts).
  const snappedForRef = useRef<string | null>(null);
  const [snappedFor, setSnappedFor] = useState<string | null>(null);
  useEffect(() => {
    if (contextName === null) {
      if (snappedForRef.current !== null) canvasRef.current?.focus();
      snappedForRef.current = null;
      setSnappedFor(null);
      return;
    }
    if (!hasOrigin || snappedForRef.current === contextName || !placement) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    snappedForRef.current = contextName;
    const box = canvas.getBoundingClientRect();
    const client = snapPointerRef.current;
    snapPointerRef.current = null;
    const next = enterContextView({
      placement: { x: placement.x, y: placement.y, width: placement.width, height: placement.height },
      pointer: client ? { x: client.x - box.left, y: client.y - box.top } : { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 },
      zoom: snapContextZoom(world.zoom, native),
      native,
    });
    world.setView(next);
    setSnappedFor(contextName);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- zoom is read at entry only; the ref guard above is what governs re-entry.
  }, [contextName, placement?.x, placement?.y, placement?.width, placement?.height, hasOrigin]);

  // Exits: Escape (a window listener in the CAPTURE phase, only while in context). Capture runs before every bubble
  // handler, so what it checks is still the DOM the key press found: SaveDialog, WarpDestinationModal and SignComposer
  // close on Escape from a React handler without stopping propagation (and React may flush that unmount before a
  // bubble listener on window ran), and the context menu closes on its own window listener. Skipped when another
  // handler already took the key (defaultPrevented), when a context menu or a modal dialog is open, and when the key
  // came from a text field (those use Escape locally).
  const onExitRequestRef = useRef(context?.onExitRequest);
  onExitRequestRef.current = context?.onExitRequest;
  const isBlockedRef = useRef(args.isBlocked);
  isBlockedRef.current = args.isBlocked;
  useEffect(() => {
    if (!inContext) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || isBlockedRef.current() || document.querySelector('[aria-modal="true"]')) return;
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
      onExitRequestRef.current?.();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [inContext]);

  // The overlay's controlled map view: the world's own pan/zoom, expressed in the composite's frame.
  const contextView =
    snappedFor === contextName && placement && contextOrigin
      ? mapViewFromWorld({ placement, worldPan: world.pan, worldZoom: world.zoom, originX: contextOrigin.x, originY: contextOrigin.y, native })
      : null;
  const onContextViewChange = (next: MapView) => {
    if (!placement || !contextOrigin) return;
    world.setView(worldViewFromMapView({ placement, view: next, originX: contextOrigin.x, originY: contextOrigin.y, native }));
  };
  const setContextZoom = (z: Zoom) => {
    if (!contextView) return;
    const next = zoomAboutPivot(contextView, z, viewport.w / 2, viewport.h / 2);
    if (next !== contextView) onContextViewChange(next);
  };
  const stepZoom = (direction: 1 | -1) => {
    if (!contextView) return;
    const z = contextView.zoom;
    const target =
      direction === 1
        ? (ZOOM_LEVELS.find((l) => l > z) ?? ZOOM_LEVELS[ZOOM_LEVELS.length - 1]!)
        : ([...ZOOM_LEVELS].reverse().find((l) => l < z) ?? ZOOM_LEVELS[0]);
    setContextZoom(target);
  };
  const overlayRef = useRef<HTMLDivElement>(null);
  const onOverlayDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest(".world-canvas__context-bar") || !placement || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const x0 = placement.x * world.zoom + world.pan.x, y0 = placement.y * world.zoom + world.pan.y;
    const inside = sx >= x0 && sx < x0 + placement.width * world.zoom && sy >= y0 && sy < y0 + placement.height * world.zoom;
    if (!inside) context?.onExitRequest();
  };

  return { registerFit, fit, fitEnabled, inContext, contextView, onContextViewChange, setContextZoom, stepZoom, overlayRef, onOverlayDoubleClick, maxWorldZoom: (base) => (inContext ? base * 4 : base) };
}
