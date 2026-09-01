import { useCallback, useEffect, useRef, useState } from "react";
import { drawGrid, drawCollision, drawElevation, drawEvents, type EventMark } from "@pokemap/core/src/render/overlays.js";
import type { LayoutRaster } from "@pokemap/core/src/render/layout.js";
import type { MapLayoutData } from "../hooks/useMapLayout.js";

export interface MapCanvasProps {
  mapName: string;
  data: MapLayoutData;
}

/** The server-baked border ring the canvas always requests -- see
 *  `/api/render/:name.png?border=N` and Task 21's step 5. Must stay in sync
 *  with the query string below and with how `originX`/`originY` are derived
 *  from `layout.borderWidth`/`borderHeight`. */
const BORDER_RINGS = 1;
const ZOOM_LEVELS = [1, 2, 4] as const;
type Zoom = (typeof ZOOM_LEVELS)[number];

const hex = (n: number) => `0x${n.toString(16)}`;

interface Toggles {
  grid: boolean;
  collision: boolean;
  elevation: boolean;
  events: boolean;
}

const NO_TOGGLES: Toggles = { grid: false, collision: false, elevation: false, events: false };

interface Hover {
  bx: number;
  by: number;
  metatileId: number;
  collision: number;
  elevation: number;
  behavior: number;
  mark?: EventMark;
}

/**
 * Every overlay's paint is destructive alpha compositing (Task 21's
 * `blendRect`), which is not invertible -- there is no way to "un-tint" a
 * cell once painted. So toggling never mutates a live raster in place;
 * instead every toggle change recomposites from the pristine, untouched
 * base pixels (this map's PNG, decoded once into `baseCanvasRef`) plus
 * whichever overlays are currently on. That recomposite is bounded by the
 * layout's own pixel size (a few hundred KB of Uint8ClampedArray at most --
 * the corpus's largest layout is under 2000x1000), so doing it locally,
 * synchronously, on every toggle click is the right shape: cheap, and never
 * a network round trip to re-render the PNG server-side.
 *
 * Panning and zooming are kept separate from that recomposite on purpose --
 * they redraw the *already-composited* buffer onto the visible canvas via
 * one scaled `drawImage`, so dragging or scrolling never re-touches overlay
 * pixels at all.
 */
export function MapCanvas({ mapName, data }: MapCanvasProps) {
  const { layout, split, map, blocks } = data;

  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const marksRef = useRef<EventMark[]>([]);

  const [imgLoaded, setImgLoaded] = useState(false);
  const [toggles, setToggles] = useState<Toggles>(NO_TOGGLES);
  const [zoom, setZoom] = useState<Zoom>(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState<Hover | null>(null);
  const [compositeVersion, setCompositeVersion] = useState(0);
  // Measured, not read from the ref during render: a ref read at render time
  // always sees the previous commit (null on the very first pass), which
  // would size the canvas off the fallback forever. Measuring in an effect
  // and storing it in state gives both the JSX width/height attributes and
  // `fit()` one consistent, up-to-date source.
  const [viewport, setViewport] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setViewport({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const pixelWidth = (layout.width + 2 * BORDER_RINGS * layout.borderWidth) * 16;
  const pixelHeight = (layout.height + 2 * BORDER_RINGS * layout.borderHeight) * 16;
  const originX = BORDER_RINGS * layout.borderWidth * 16;
  const originY = BORDER_RINGS * layout.borderHeight * 16;

  // Reset per-map view state (fresh image, fresh overlays) whenever the map
  // itself changes -- otherwise NewBarkTown would inherit PetalburgCity's pan
  // and toggle state on selection.
  useEffect(() => {
    setImgLoaded(false);
    setToggles(NO_TOGGLES);
    setHover(null);
  }, [mapName]);

  const fit = useCallback(() => {
    const vw = viewport.w || pixelWidth;
    const vh = viewport.h || pixelHeight;
    let z: Zoom = 1;
    for (const level of ZOOM_LEVELS) {
      if (pixelWidth * level <= vw && pixelHeight * level <= vh) z = level;
    }
    setZoom(z);
    setPan({ x: Math.round((vw - pixelWidth * z) / 2), y: Math.round((vh - pixelHeight * z) / 2) });
  }, [pixelWidth, pixelHeight, viewport]);

  useEffect(() => {
    if (imgLoaded) fit();
    // Only re-fit on image load / map change, not on every render -- the
    // user's own zoom/pan must survive an overlay toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgLoaded, mapName]);

  const onImgLoad = () => setImgLoaded(true);

  // Step 1: recomposite the pristine base + whichever overlays are on. Runs
  // only when the map, its data, or the toggle set changes.
  useEffect(() => {
    if (!imgLoaded || !imgRef.current) return;
    let base = baseCanvasRef.current;
    if (!base) {
      base = document.createElement("canvas");
      baseCanvasRef.current = base;
    }
    base.width = pixelWidth;
    base.height = pixelHeight;
    const ctx = base.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, pixelWidth, pixelHeight);
    ctx.drawImage(imgRef.current, 0, 0);

    const anyOverlay = toggles.grid || toggles.collision || toggles.elevation || toggles.events;
    marksRef.current = [];
    if (anyOverlay) {
      const imageData = ctx.getImageData(0, 0, pixelWidth, pixelHeight);
      const raster: LayoutRaster = {
        width: pixelWidth,
        height: pixelHeight,
        data: imageData.data,
        layoutName: layout.name,
        blockWidth: layout.width,
        blockHeight: layout.height,
        originX,
        originY,
        outOfRangeCount: 0,
        blocks,
      };
      if (toggles.grid) drawGrid(raster);
      if (toggles.collision) drawCollision(raster);
      if (toggles.elevation) drawElevation(raster);
      if (toggles.events) marksRef.current = drawEvents(raster, map);
      ctx.putImageData(imageData, 0, 0);
    }

    setCompositeVersion((v) => v + 1);
  }, [imgLoaded, toggles, blocks, layout, map, pixelWidth, pixelHeight, originX, originY]);

  // Step 2: cheap re-blit of the already-composited buffer for pan/zoom.
  //
  // Must depend on `viewport` too, not just compositeVersion/zoom/pan: the
  // stage canvas's `width`/`height` JSX attributes are driven by
  // `viewport.w || pixelWidth` / `viewport.h || pixelHeight` (below), and
  // setting a canvas's width/height attribute -- even attributes React
  // writes on its behalf -- clears its bitmap to fully transparent, per the
  // HTML spec, independent of anything this effect does. The overlay legend
  // row is a sibling of the viewport inside the same flex column, so it
  // changes `.map-canvas__viewport`'s box size the instant a toggle turns
  // on, which fires the ResizeObserver, which updates `viewport`, which
  // changes the canvas's attributes and blanks it -- and without `viewport`
  // in this dependency list, nothing redraws it afterward. This was the
  // root cause of "toggling an overlay blanks the canvas."
  useEffect(() => {
    const canvas = canvasRef.current;
    const base = baseCanvasRef.current;
    if (!canvas || !base) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0, pixelWidth, pixelHeight, pan.x, pan.y, pixelWidth * zoom, pixelHeight * zoom);
  }, [compositeVersion, zoom, pan, pixelWidth, pixelHeight, viewport]);

  const toggle = (key: keyof Toggles) => setToggles((t) => ({ ...t, [key]: !t[key] }));

  const applyZoom = (next: Zoom, pivotX: number, pivotY: number) => {
    setZoom((prevZoom) => {
      if (next === prevZoom) return prevZoom;
      setPan((prevPan) => {
        const cx = (pivotX - prevPan.x) / prevZoom;
        const cy = (pivotY - prevPan.y) / prevZoom;
        return { x: Math.round(pivotX - cx * next), y: Math.round(pivotY - cy * next) };
      });
      return next;
    });
  };

  const centerPivot = (): [number, number] => {
    const c = canvasRef.current;
    return c ? [c.width / 2, c.height / 2] : [0, 0];
  };

  // A NATIVE listener with { passive: false }, not React's onWheel prop.
  // React attaches wheel listeners as passive by default (for scroll
  // performance), which makes e.preventDefault() inside a React onWheel
  // handler a silent no-op -- confirmed against the real running app, not
  // hypothetical: it logs "Unable to preventDefault inside passive event
  // listener invocation" and, more importantly, the PAGE scrolls underneath
  // the canvas at the same time the canvas is trying to zoom. Same defect,
  // same fix, as WorldCanvas.tsx's own wheel handler (Task 25) -- this file
  // predates that fix and carried the identical bug. No jsdom-based test
  // catches this (jsdom does not enforce passive listener semantics the way
  // a real browser does), which is exactly why this project's own
  // test-design rules call for actually running the UI.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const idx = ZOOM_LEVELS.indexOf(zoom);
      const nextIdx = e.deltaY < 0 ? Math.min(ZOOM_LEVELS.length - 1, idx + 1) : Math.max(0, idx - 1);
      applyZoom(ZOOM_LEVELS[nextIdx]!, x, y);
    };
    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
  }, [zoom]);

  const hoverAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const compositeX = (x - pan.x) / zoom;
    const compositeY = (y - pan.y) / zoom;
    const bx = Math.floor((compositeX - originX) / 16);
    const by = Math.floor((compositeY - originY) / 16);
    if (bx < 0 || by < 0 || bx >= layout.width || by >= layout.height) {
      setHover(null);
      return;
    }
    const block = blocks[by * layout.width + bx];
    if (!block) {
      setHover(null);
      return;
    }
    const mark = marksRef.current.find((m) => m.x === bx && m.y === by);
    setHover({ bx, by, metatileId: block.metatileId, collision: block.collision, elevation: block.elevation, behavior: block.behavior, mark });
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current) {
      const d = dragRef.current;
      setPan({ x: d.panX + (e.clientX - d.x), y: d.panY + (e.clientY - d.y) });
    } else {
      hoverAt(e.clientX, e.clientY);
    }
  };

  const onMouseUp = () => {
    dragRef.current = null;
  };

  const onMouseLeave = () => {
    dragRef.current = null;
    setHover(null);
  };

  const imageUrl = `/api/render/${encodeURIComponent(mapName)}.png?border=${BORDER_RINGS}`;
  const anyOverlay = toggles.grid || toggles.collision || toggles.elevation || toggles.events;

  return (
    <section className="map-canvas" aria-label={`${mapName} canvas`}>
      <div className="map-canvas__toolbar">
        <div className="map-canvas__zoom" role="group" aria-label="Zoom">
          {ZOOM_LEVELS.map((z) => (
            <button
              key={z}
              type="button"
              className="map-canvas__btn"
              aria-pressed={zoom === z}
              onClick={() => applyZoom(z, ...centerPivot())}
            >
              {z}×
            </button>
          ))}
          <button type="button" className="map-canvas__btn" onClick={fit}>
            Fit
          </button>
        </div>
        <div className="map-canvas__toggles" role="group" aria-label="Overlays">
          <button type="button" className="map-canvas__btn" aria-pressed={toggles.grid} onClick={() => toggle("grid")}>
            Grid
          </button>
          <button type="button" className="map-canvas__btn" aria-pressed={toggles.collision} onClick={() => toggle("collision")}>
            Collision
          </button>
          <button type="button" className="map-canvas__btn" aria-pressed={toggles.elevation} onClick={() => toggle("elevation")}>
            Elevation
          </button>
          <button type="button" className="map-canvas__btn" aria-pressed={toggles.events} onClick={() => toggle("events")}>
            Events
          </button>
        </div>
      </div>

      {anyOverlay && (
        <div className="map-canvas__legend">
          {toggles.grid && (
            <span className="map-canvas__legend-item">
              <i className="map-canvas__swatch map-canvas__swatch--grid" /> Grid
            </span>
          )}
          {toggles.collision && (
            <span className="map-canvas__legend-item">
              <i className="map-canvas__swatch map-canvas__swatch--collision" /> Collision
            </span>
          )}
          {toggles.elevation && (
            <span className="map-canvas__legend-item">
              <i className="map-canvas__swatch map-canvas__swatch--elevation" /> Elevation (low → high)
            </span>
          )}
          {toggles.events && (
            <>
              <span className="map-canvas__legend-item">
                <i className="map-canvas__swatch map-canvas__swatch--event-object" /> Object
              </span>
              <span className="map-canvas__legend-item">
                <i className="map-canvas__swatch map-canvas__swatch--event-warp" /> Warp
              </span>
              <span className="map-canvas__legend-item">
                <i className="map-canvas__swatch map-canvas__swatch--event-coord" /> Coord
              </span>
              <span className="map-canvas__legend-item">
                <i className="map-canvas__swatch map-canvas__swatch--event-bg" /> Bg
              </span>
            </>
          )}
        </div>
      )}

      <div className="map-canvas__viewport" ref={containerRef}>
        <img ref={imgRef} src={imageUrl} onLoad={onImgLoad} alt="" className="map-canvas__source-image" />
        <canvas
          ref={canvasRef}
          className="map-canvas__stage"
          width={viewport.w || pixelWidth}
          height={viewport.h || pixelHeight}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
        />
      </div>

      <div className="map-canvas__status">
        <span className="map-canvas__status-item">
          layout_version <strong>{split.version}</strong>
        </span>
        <span className="map-canvas__status-item">
          split metatiles {split.metatiles} · tiles {split.tiles} · pals {split.pals}
        </span>
        {hover ? (
          <span className="map-canvas__status-item map-canvas__hover">
            ({hover.bx}, {hover.by}) id {hex(hover.metatileId)} · collision {hover.collision} · elevation {hover.elevation} ·
            behavior {hex(hover.behavior)}
            {hover.mark ? ` · ${hover.mark.kind}: ${hover.mark.label}` : ""}
          </span>
        ) : (
          <span className="map-canvas__status-item map-canvas__hover map-canvas__hover--empty">Hover the map…</span>
        )}
      </div>
    </section>
  );
}
