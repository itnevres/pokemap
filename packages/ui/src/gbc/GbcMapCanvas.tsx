import { useCallback, useEffect, useRef, useState } from "react";
import type { RGBA } from "@pokemap/core/src/render/raster.js";
import { drawGbcGrid, drawGbcCollision, drawGbcEvents, gbcStepInfo, type GbcQuadrantInfo, type GbcQuadrantKey, type GbcStepInfo } from "@pokemap/core/src/gbc/render/overlays.js";
import type { GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";

/** Matches `GbcApp.tsx`'s own `TimeOfDay` -- not imported from there
 *  directly (a leaf canvas component importing a type from the app shell
 *  that mounts it is the wrong dependency direction; `MapCanvas.tsx` never
 *  imports from `App.tsx` either), so this is redeclared, not reused. */
export type GbcTimeOfDay = "morn" | "day" | "nite";

/**
 * The read-only GBC map view (Plan 6b Task 4). Plan Q2 accepts this as a
 * deliberate DUPLICATE of `MapCanvas.tsx`'s pan/zoom/viewport mechanics
 * (about 150 lines), not a shared extraction -- `MapCanvas.tsx` is ~70%
 * editing machinery (paint-stroke race safety, event drag) this view has no
 * use for, and GBC's own geometry (32px blocks, a SEPARATE 16px step grid
 * for collision/events, no per-block elevation) does not map onto GBA's
 * `LayoutRaster`/`Block` shapes at all. Every mechanic below is lifted
 * DELIBERATELY from `MapCanvas.tsx`, cited by line, because that file's own
 * comments are this project's postmortems:
 * - `viewport` MUST stay in the blit effect's own dependency list
 *   (`MapCanvas.tsx:472-485` -- the Task 21 "toggling an overlay blanks the
 *   canvas" postmortem: an overlay toggle resizes the legend row, which
 *   resizes the viewport, which rewrites the canvas's width/height
 *   attributes, which clears its bitmap per the HTML canvas spec).
 * - `imgLoaded` resets on every URL change, not just once (`MapCanvas.tsx:
 *   386-388`), and the URL includes `time` here, so a time switch goes
 *   through a real false->true `imgLoaded` cycle exactly like a map switch.
 * - Fit runs once per `mapName` only (`fittedForMapRef`, `MapCanvas.tsx:
 *   401-416`), explicitly NOT keyed on `time` -- a time switch must never
 *   snap the player's zoom/pan back to fit.
 * - The wheel listener is native, `{ passive: false }` (`MapCanvas.tsx:
 *   549-575`) -- React's own `onWheel` is passive by default, so
 *   `preventDefault()` inside it is a silent no-op and the page scrolls
 *   underneath the canvas.
 * - A pristine base canvas is recomposited from the plain `<img>` on every
 *   toggle change (never mutated in place -- overlay blending is
 *   destructive), and a separate stage canvas re-blits that composite for
 *   pan/zoom only, never re-touching overlay pixels.
 *
 * Unlike GBA, hover does NOT depend on which overlays are toggled on:
 * `gbcStepInfo` is a pure function of the payload and the hovered step,
 * independent of `toggles` -- the status strip always shows the real
 * quadrant/event data under the cursor, whether or not Collision/Events are
 * currently painted.
 */

const BORDER_RINGS = 1;
const ZOOM_LEVELS = [1, 2, 4] as const;
type Zoom = (typeof ZOOM_LEVELS)[number];

interface Toggles {
  grid: boolean;
  collision: boolean;
  events: boolean;
}
const NO_TOGGLES: Toggles = { grid: false, collision: false, events: false };

export interface GbcMapCanvasProps {
  mapName: string;
  data: GbcMapPayload;
  time: GbcTimeOfDay;
  /** Fired with the hovered block's metatile id, or `null` on leave -- drives
   *  `GbcMetatilePalette`'s highlight. */
  hoveredMetatile?: (id: number | null) => void;
}

const hex = (n: number) => `0x${n.toString(16)}`;

/** Strips a `COLL_` prefix for display (`COLL_WALL` -> `WALL`) -- every
 *  `GbcCollisionInfoEntry.name` this payload can carry has it
 *  (`load/tileset.ts`'s own `loadGbcCollisionInfo`), so this is a plain
 *  slice, not a general-purpose strip. */
function shortCollisionName(name: string): string {
  return name.startsWith("COLL_") ? name.slice(5) : name;
}

/**
 * Client coordinates -> a 16px step, given the current pan/zoom and the
 * render's own origin -- the pure math half of hover, exported so it can be
 * tested directly against a mocked `getBoundingClientRect` rather than only
 * through a full mount+mousemove.
 */
export function clientToStep(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number },
  pan: { x: number; y: number },
  zoom: number,
  originX: number,
  originY: number,
): { sx: number; sy: number } {
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const compositeX = (x - pan.x) / zoom;
  const compositeY = (y - pan.y) / zoom;
  return {
    sx: Math.floor((compositeX - originX) / 16),
    sy: Math.floor((compositeY - originY) / 16),
  };
}

/**
 * `getComputedStyle` at composite time, with the dark-mode literal as the
 * fallback (`MapCanvas.tsx:521`'s own pattern) -- `parseColorToken` below
 * turns whichever string wins into an `RGBA` `blendRect` can use, since
 * canvas 2D APIs (unlike CSS) cannot take a raw `var(...)`/`rgba(...)`
 * string for compositing math.
 */
function resolveOverlayColor(varName: string, darkModeFallback: string): RGBA {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || darkModeFallback;
  return parseColorToken(raw);
}

/** DESIGN.md's `--overlay-collision` is an `rgba()` literal with its own
 *  alpha; `--encounter-water` and the `--event-*` tokens are plain opaque
 *  hex swatches (used elsewhere as solid legend chips, never as a
 *  translucent wash) -- for THIS overlay's purpose they need one, so a
 *  hex-only token gets this fixed alpha instead, roughly matching
 *  `--overlay-collision`'s own ~0.55 (140/255 = 0.549). An unparsable value
 *  (this file's own jsdom tests never load a real stylesheet) returns fully
 *  transparent rather than throwing, so a broken token can never crash the
 *  composite effect -- it would just silently fail to tint. */
const HEX_TOKEN_ALPHA = 140;

export function parseColorToken(value: string): RGBA {
  const v = value.trim();
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(v);
  if (rgba) {
    const [, r, g, b, a] = rgba;
    return { r: Number(r), g: Number(g), b: Number(b), a: a !== undefined ? Math.round(Number(a) * 255) : HEX_TOKEN_ALPHA };
  }
  const hexColor = /^#([0-9a-fA-F]{6})$/.exec(v);
  if (hexColor) {
    const h = hexColor[1]!;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: HEX_TOKEN_ALPHA };
  }
  return { r: 0, g: 0, b: 0, a: 0 };
}

export function GbcMapCanvas({ mapName, data, time, hoveredMetatile }: GbcMapCanvasProps) {
  const { layout } = data;

  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const [imgLoaded, setImgLoaded] = useState(false);
  const [toggles, setToggles] = useState<Toggles>(NO_TOGGLES);
  const [zoom, setZoom] = useState<Zoom>(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState<GbcStepInfo | null>(null);
  const [compositeVersion, setCompositeVersion] = useState(0);
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

  const pixelWidth = (layout.width + 2 * BORDER_RINGS) * 32;
  const pixelHeight = (layout.height + 2 * BORDER_RINGS) * 32;
  const originX = BORDER_RINGS * 32;
  const originY = BORDER_RINGS * 32;

  const imageUrl = `/api/render/${encodeURIComponent(mapName)}.png?border=${BORDER_RINGS}&time=${time}`;

  // Fresh overlays/hover on a real map switch -- mirrors MapCanvas.tsx:371-374.
  useEffect(() => {
    setToggles(NO_TOGGLES);
    setHover(null);
    hoveredMetatile?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapName]);

  // Reset per URL (map OR time switch) -- MapCanvas.tsx:386-388's own
  // reasoning: the composite effect must wait for THIS image's real load,
  // not recomposite whatever the <img> still shows from the previous url.
  useEffect(() => {
    setImgLoaded(false);
  }, [imageUrl]);

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

  // Once per real map open -- NOT on a time switch, which reuses the same
  // imgLoaded false->true cycle (MapCanvas.tsx:401-416's own fittedForMapRef
  // pattern, keyed on mapName alone).
  const fittedForMapRef = useRef<string | null>(null);
  useEffect(() => {
    if (imgLoaded && fittedForMapRef.current !== mapName) {
      fit();
      fittedForMapRef.current = mapName;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgLoaded, mapName]);

  const onImgLoad = () => setImgLoaded(true);

  const anyOverlay = toggles.grid || toggles.collision || toggles.events;

  // Step 1: recomposite the pristine base + whichever overlays are on.
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

    if (anyOverlay) {
      const imageData = ctx.getImageData(0, 0, pixelWidth, pixelHeight);
      const raster = { width: pixelWidth, height: pixelHeight, data: imageData.data };
      if (toggles.grid) drawGbcGrid(raster, originX, originY, layout.width, layout.height);
      if (toggles.collision) {
        drawGbcCollision(raster, originX, originY, data, {
          wall: resolveOverlayColor("--overlay-collision", "rgba(220, 40, 40, 0.55)"),
          water: resolveOverlayColor("--encounter-water", "#06b6d4"),
        });
      }
      if (toggles.events) {
        drawGbcEvents(raster, originX, originY, data.events, 2 * layout.width, 2 * layout.height, {
          object: resolveOverlayColor("--event-object", "#3ccb5a"),
          warp: resolveOverlayColor("--event-warp", "#f0be28"),
          coord: resolveOverlayColor("--event-coord", "#c850f0"),
          bg: resolveOverlayColor("--event-bg", "#3ca0f0"),
        });
      }
      ctx.putImageData(imageData, 0, 0);
    }

    setCompositeVersion((v) => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgLoaded, toggles, data, pixelWidth, pixelHeight, originX, originY]);

  // Step 2: cheap re-blit for pan/zoom -- `viewport` MUST stay in this list
  // (see the header comment's Task 21 citation).
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

  // Native, { passive: false } -- see the header comment.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  const hoverAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { sx, sy } = clientToStep(clientX, clientY, rect, pan, zoom, originX, originY);
    const info = gbcStepInfo(data, sx, sy);
    setHover(info);
    hoveredMetatile?.(info ? info.metatileId : null);
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
    hoveredMetatile?.(null);
  };

  const quadrantLabel = (key: GbcQuadrantKey, label: string, info: GbcQuadrantInfo, hovered: boolean) => {
    const name = info.name ? shortCollisionName(info.name) : hex(info.value);
    const category = info.category !== "land" ? ` ${info.category}` : "";
    const talk = info.talk ? " +talk" : "";
    const text = `${label} ${name}${category}${talk}`;
    return hovered ? <strong key={key}>{text}</strong> : <span key={key}>{text}</span>;
  };

  return (
    <section className="map-canvas" aria-label={`${mapName} canvas`}>
      <div className="map-canvas__toolbar">
        <div className="map-canvas__zoom" role="group" aria-label="Zoom">
          {ZOOM_LEVELS.map((z) => (
            <button key={z} type="button" className="map-canvas__btn" aria-pressed={zoom === z} onClick={() => applyZoom(z, ...centerPivot())}>
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
            <>
              <span className="map-canvas__legend-item">
                <i className="map-canvas__swatch map-canvas__swatch--collision" /> Wall
              </span>
              <span className="map-canvas__legend-item">
                <i className="map-canvas__swatch map-canvas__swatch--water" /> Water
              </span>
            </>
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
          tileset {data.tileset.constName} · {data.metatileCount} metatiles · {layout.width}×{layout.height}
          {!layout.writable ? " · not writable" : ""}
        </span>
        {hover ? (
          <span className="map-canvas__status-item map-canvas__hover">
            ({hover.bx}, {hover.by}) step ({hover.sx}, {hover.sy}) id {hex(hover.metatileId)}
            {hover.rendersAsBorder ? ` (renders as border ${hex(hover.border)})` : ""} ·{" "}
            {quadrantLabel("tl", "TL", hover.quadrants.tl, hover.quadrant === "tl")} ·{" "}
            {quadrantLabel("tr", "TR", hover.quadrants.tr, hover.quadrant === "tr")} ·{" "}
            {quadrantLabel("bl", "BL", hover.quadrants.bl, hover.quadrant === "bl")} ·{" "}
            {quadrantLabel("br", "BR", hover.quadrants.br, hover.quadrant === "br")}
            {hover.events.map((e) => ` · ${e.kind} #${e.index} ${e.label}`).join("")}
          </span>
        ) : (
          <span className="map-canvas__status-item map-canvas__hover map-canvas__hover--empty">Hover the map…</span>
        )}
      </div>
    </section>
  );
}
