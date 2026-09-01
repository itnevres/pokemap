import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Placement, Component as WorldComponentInfo, Conflict, VerticalLink } from "@pokemap/core/src/world/connections.js";

/** The pixel size a placement's PNG renders at natively (`renderLayout`,
 *  border 0): 16px per tile, same constant the CLI's `render-world --scale
 *  16` calls "full size". */
const TILE_PX = 16;

/** Zoom is screen pixels per tile -- 16 is native resolution, matching the
 *  CLI's own `--scale` semantics (`16 = full size, 4 = overview`), so the
 *  same mental model applies whether the raster comes from the UI or the
 *  CLI. */
const MIN_ZOOM = 1 / 64;
const MAX_ZOOM = 16;
const WHEEL_FACTOR = 1.2;

/** Below this many screen px per tile, redraw from the cached downscaled
 *  buffer rather than the full-resolution source image -- see the LOD
 *  requirement in Task 25 Step 5. */
const LOD_ZOOM_THRESHOLD = 4;
/** Fraction of native resolution the cached LOD buffer is rendered at. */
const LOD_SCALE = 0.25;

const BADGE_SIZE = 10;

interface WorldPayload {
  placements: Record<string, Placement>;
  components: WorldComponentInfo[];
  conflicts: Conflict[];
  verticalLinks: VerticalLink[];
  sidecar: { dungeonAutoLayout: boolean };
}

interface WorldState {
  placements: Map<string, Placement>;
  components: WorldComponentInfo[];
  conflicts: Conflict[];
  verticalLinks: VerticalLink[];
  sidecarDungeonAutoLayout: boolean;
}

interface Viewport {
  w: number;
  h: number;
}

interface Pan {
  x: number;
  y: number;
}

interface ImageCacheEntry {
  loaded: boolean;
  img?: HTMLImageElement;
  small?: HTMLCanvasElement;
}

type DragState =
  | { kind: "pan"; startX: number; startY: number; startPan: Pan }
  | { kind: "map"; map: string; grabDX: number; grabDY: number }
  | null;

interface HoverInfo {
  map: string;
  component: WorldComponentInfo | null;
}

interface TooltipInfo {
  x: number;
  y: number;
  text: string;
}

/**
 * A placement from applySidecar's fallback branch (a manual position for a
 * map that isn't in the current base/auto set -- most commonly, dungeons is
 * off and the user just dragged a previously-unplaced map onto the canvas
 * from the side rail) carries `component: -1` and `width:0, height:0`
 * (sidecar.ts has no Project to size it correctly -- see
 * packages/core/test/world/sidecar.test.ts's "fabricates a placeholder
 * placement" test for the documented shape). `-1` does not index into
 * `components` (0-indexed): `components[-1]` is `undefined` in JS, not a
 * throw, but reading `.bounds`/`.maps` off it would be. Every caller that
 * needs a placement's real size or component goes through these two
 * helpers instead of indexing `components[placement.component]` directly.
 */
function sizeOfPlacement(p: Placement, sizeByMap: Map<string, { width: number; height: number }>): { width: number; height: number } {
  if (p.component !== -1) return p;
  return sizeByMap.get(p.map) ?? p;
}

function componentOfPlacement(p: Placement, components: WorldComponentInfo[]): WorldComponentInfo | null {
  return p.component >= 0 && p.component < components.length ? components[p.component]! : null;
}

/** AABB test in world-tile space. Mirrors the CLI's render-world culling
 *  exactly (`p.x + p.width <= bx || p.x >= bx + bw || ...`) so the two stay
 *  consistent. */
function intersects(px: number, py: number, pw: number, ph: number, x0: number, y0: number, x1: number, y1: number): boolean {
  return !(px + pw <= x0 || px >= x1 || py + ph <= y0 || py >= y1);
}

interface FitResult {
  zoom: number;
  pan: Pan;
}

/** Pure so a test can predict the result by hand, the same way MapCanvas's
 *  tests reason about `fit()`. Centres `bounds` in `viewport` at the
 *  largest zoom (clamped) that shows all of it. */
export function computeFit(bounds: { x: number; y: number; width: number; height: number }, viewport: Viewport): FitResult {
  if (bounds.width <= 0 || bounds.height <= 0 || viewport.w <= 0 || viewport.h <= 0) {
    return { zoom: 1, pan: { x: 0, y: 0 } };
  }
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(viewport.w / bounds.width, viewport.h / bounds.height)));
  return {
    zoom,
    pan: {
      x: -bounds.x * zoom + (viewport.w - bounds.width * zoom) / 2,
      y: -bounds.y * zoom + (viewport.h - bounds.height * zoom) / 2,
    },
  };
}

function worldBoundsOf(placements: Map<string, Placement>, sizeByMap: Map<string, { width: number; height: number }>) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of placements.values()) {
    const size = sizeOfPlacement(p, sizeByMap);
    if (size.width <= 0 || size.height <= 0) continue; // a true orphan (removed map) -- unknowable, excluded
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + size.width); y1 = Math.max(y1, p.y + size.height);
  }
  if (x0 === Infinity) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * The stitched world: 1,209 maps culled to the viewport, panned and zoomed,
 * with drag-to-place, a dungeon-layout toggle backed by a side rail for
 * unplaced maps, and conflict/vertical-link badges. See
 * packages/ui/DESIGN.md for the palette/type/spacing tokens this consumes,
 * and this file's own comments for the LOD and culling mechanics.
 */
export function WorldCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageCacheRef = useRef<Map<string, ImageCacheEntry>>(new Map());
  const dragRef = useRef<DragState>(null);
  const conflictBadgesRef = useRef<Array<{ x: number; y: number; text: string }>>([]);

  const [world, setWorld] = useState<WorldState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dungeonsOverride, setDungeonsOverride] = useState<boolean | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ w: 0, h: 0 });
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [compositeVersion, setCompositeVersion] = useState(0);
  const [railFilter, setRailFilter] = useState("");
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const [isDraggingMap, setIsDraggingMap] = useState(false);

  const dungeonsOn = dungeonsOverride ?? world?.sidecarDungeonAutoLayout ?? true;

  // Measure the viewport, mirroring MapCanvas's established pattern exactly
  // (Task 21's canvas-blanking postmortem: a redraw effect that does not
  // depend on `viewport` leaves the canvas stale after any resize).
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

  // Fetch /api/world. Omits ?dungeons= until the user actually touches the
  // toggle, so the first load honours whatever the sidecar has stored
  // rather than silently overriding it with a hardcoded default.
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    const qs = dungeonsOverride === null ? "" : `?dungeons=${dungeonsOverride ? 1 : 0}`;
    fetch(`/api/world${qs}`)
      .then((r) => {
        if (!r.ok) throw new Error(`GET /api/world -> ${r.status}`);
        return r.json() as Promise<WorldPayload>;
      })
      .then((d) => {
        if (cancelled) return;
        setWorld({
          placements: new Map(Object.entries(d.placements)),
          components: d.components,
          conflicts: d.conflicts,
          verticalLinks: d.verticalLinks,
          sidecarDungeonAutoLayout: d.sidecar.dungeonAutoLayout,
        });
        setCompositeVersion((v) => v + 1);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [dungeonsOverride]);

  // Every map's true tile size, independent of which placements are
  // currently shown -- world.components lists every map in the project
  // always, regardless of the dungeon toggle or manual overrides (a
  // singleton component's bounds ARE that one map's own rect). Used to size
  // side-rail entries and to recover a component:-1 placement's real size
  // -- see sizeOfPlacement above.
  const sizeByMap = useMemo(() => {
    const m = new Map<string, { width: number; height: number }>();
    if (world) for (const c of world.components) if (c.maps.length === 1) m.set(c.maps[0]!, { width: c.bounds.width, height: c.bounds.height });
    return m;
  }, [world]);

  // Singleton maps not currently in `placements` -- i.e. hidden by the
  // dungeon toggle being off (or not yet auto-placed). A map the user has
  // manually dragged onto the canvas already appears in `placements` (via
  // applySidecar's override, regardless of the toggle) and so drops out of
  // this list on its own.
  const unplacedNames = useMemo(() => {
    if (!world) return [] as string[];
    const out: string[] = [];
    for (const c of world.components) {
      const name = c.maps.length === 1 ? c.maps[0]! : undefined;
      if (name && !world.placements.has(name)) out.push(name);
    }
    return out.sort();
  }, [world]);

  const filteredUnplaced = useMemo(() => {
    const q = railFilter.trim().toLowerCase();
    return q ? unplacedNames.filter((n) => n.toLowerCase().includes(q)) : unplacedNames;
  }, [unplacedNames, railFilter]);

  // Deliberately NOT auto-fit-to-the-whole-world on load: culling is what
  // makes 1,209 maps usable at all, and fitting the whole world into view
  // by definition puts every single placement's bounding box inside the
  // viewport, which would fetch all 1,209 source images on the very first
  // render -- the exact cost culling exists to avoid. The default view is
  // a modest, fixed zoom at the world origin; "Fit world" below is an
  // explicit action the user takes to reach an overview.
  //
  // That overview fits the connected landmasses/clusters, not literally
  // every placement, for the same underlying reason. Measured against the
  // live corpus: autoLayoutUnplaced's singleton shelf (Task 23) spans
  // roughly 25,600 tiles, while Hoenn+Johto+Kanto together span about 800
  // -- fitting the full extent zooms out more than 30x further than
  // needed, and "confirm Johto and Kanto read as continuous landmasses"
  // (this task's own Step 7) becomes impossible at that scale; they're a
  // few stray pixels. A singleton is any placement whose component has
  // exactly one map (the same test unplacedMapNames uses); excluding those
  // and fitting the rest is what actually shows "the world" as a navigable
  // place, matching spec §8.1's own framing rather than the letter of
  // "every placement".
  const fitWorld = useCallback(() => {
    if (!world) return;
    const landmasses = new Map(
      [...world.placements].filter(([, p]) => {
        const comp = componentOfPlacement(p, world.components);
        return comp !== null && comp.maps.length > 1;
      }),
    );
    const bounds = worldBoundsOf(landmasses.size > 0 ? landmasses : world.placements, sizeByMap);
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const fit = computeFit(bounds, viewport);
    setZoom(fit.zoom);
    setPan(fit.pan);
  }, [world, viewport, sizeByMap]);

  // Culling: only placements whose tile-rect intersects the current
  // viewport (in world-tile space) are considered "visible". With 1,209
  // maps this is what keeps both the draw loop and the image-loading effect
  // below cheap regardless of how far out the user has zoomed.
  const visible = useMemo(() => {
    if (!world) return [] as Placement[];
    const x0 = -pan.x / zoom, y0 = -pan.y / zoom;
    const x1 = (viewport.w - pan.x) / zoom, y1 = (viewport.h - pan.y) / zoom;
    const out: Placement[] = [];
    for (const p of world.placements.values()) {
      const size = sizeOfPlacement(p, sizeByMap);
      if (size.width <= 0 || size.height <= 0) continue; // unrenderable orphan, see sizeOfPlacement
      if (intersects(p.x, p.y, size.width, size.height, x0, y0, x1, y1)) out.push(p);
    }
    return out;
  }, [world, pan, zoom, viewport, sizeByMap]);

  // Load (and cache) the source image for every visible placement that
  // doesn't have one yet. A placement already in imageCacheRef is never
  // refetched, and one outside `visible` is never requested at all -- this
  // is the whole culling guarantee in one effect.
  useEffect(() => {
    for (const p of visible) {
      if (imageCacheRef.current.has(p.map)) continue;
      const entry: ImageCacheEntry = { loaded: false };
      imageCacheRef.current.set(p.map, entry);
      const size = sizeOfPlacement(p, sizeByMap);
      const img = new Image();
      img.onload = () => {
        entry.loaded = true;
        entry.img = img;
        const small = document.createElement("canvas");
        small.width = Math.max(1, Math.round(size.width * TILE_PX * LOD_SCALE));
        small.height = Math.max(1, Math.round(size.height * TILE_PX * LOD_SCALE));
        const sctx = small.getContext("2d");
        if (sctx) {
          sctx.imageSmoothingEnabled = false;
          sctx.drawImage(img, 0, 0, small.width, small.height);
        }
        entry.small = small;
        setCompositeVersion((v) => v + 1);
      };
      img.src = `/api/render/${encodeURIComponent(p.map)}.png`;
    }
  }, [visible, sizeByMap]);

  // The actual draw. Reads only from state already current in this render's
  // closure (never a stale ref captured by an earlier effect), so an image
  // that finishes loading after the user has since panned still lands in
  // the right place -- compositeVersion bumping is what re-runs this with
  // fresh pan/zoom, exactly mirroring MapCanvas's two-step
  // composite-then-blit split.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of visible) {
      const size = sizeOfPlacement(p, sizeByMap);
      const cache = imageCacheRef.current.get(p.map);
      if (!cache?.loaded) continue;
      const dx = p.x * zoom + pan.x, dy = p.y * zoom + pan.y;
      const dw = size.width * zoom, dh = size.height * zoom;
      const useSmall = zoom < LOD_ZOOM_THRESHOLD && cache.small;
      if (useSmall) ctx.drawImage(cache.small!, dx, dy, dw, dh);
      else if (cache.img) ctx.drawImage(cache.img, dx, dy, dw, dh);
    }

    if (!world) return;
    const style = typeof getComputedStyle === "function" ? getComputedStyle(document.documentElement) : null;
    const conflictColor = style?.getPropertyValue("--danger").trim() || "#ef4444";
    const diveColor = style?.getPropertyValue("--link-dive").trim() || "#3b82f6";
    const emergeColor = style?.getPropertyValue("--link-emerge").trim() || "#f97316";

    // Vertical links: 14 dive/emerge pairs with no planar meaning (excluded
    // from buildWorld's layout entirely) -- badged at the `from` map's
    // corner so they read as geometry rather than being invisible.
    for (const link of world.verticalLinks) {
      const p = world.placements.get(link.from);
      if (!p) continue;
      const size = sizeOfPlacement(p, sizeByMap);
      if (size.width <= 0 || size.height <= 0) continue;
      if (!intersects(p.x, p.y, size.width, size.height, -pan.x / zoom, -pan.y / zoom, (viewport.w - pan.x) / zoom, (viewport.h - pan.y) / zoom)) continue;
      const cx = p.x * zoom + pan.x + BADGE_SIZE;
      const cy = p.y * zoom + pan.y + size.height * zoom - BADGE_SIZE;
      drawTriangle(ctx, cx, cy, BADGE_SIZE, link.direction === "dive", link.direction === "dive" ? diveColor : emergeColor);
    }

    // Conflicts: a diamond at the offending map's top-right corner, plus a
    // hit-rect recorded for the hover tooltip below. Connection bugs become
    // visible as geometry -- these are never hidden behind a toggle.
    const badges: Array<{ x: number; y: number; text: string }> = [];
    for (const conflict of world.conflicts) {
      const p = world.placements.get(conflict.map);
      if (!p) continue;
      const size = sizeOfPlacement(p, sizeByMap);
      if (size.width <= 0 || size.height <= 0) continue;
      const cx = p.x * zoom + pan.x + size.width * zoom - BADGE_SIZE;
      const cy = p.y * zoom + pan.y + BADGE_SIZE;
      drawDiamond(ctx, cx, cy, BADGE_SIZE, conflictColor);
      badges.push({
        x: cx,
        y: cy,
        text: `${conflict.map}: via ${conflict.viaA.from} (${conflict.viaA.x},${conflict.viaA.y}) disagrees with via ${conflict.viaB.from} (${conflict.viaB.x},${conflict.viaB.y})`,
      });
    }
    conflictBadgesRef.current = badges;
  }, [compositeVersion, pan, zoom, viewport, visible, world, sizeByMap]);

  const screenToWorld = useCallback((sx: number, sy: number) => ({ x: (sx - pan.x) / zoom, y: (sy - pan.y) / zoom }), [pan, zoom]);

  // A NATIVE listener with { passive: false }, not React's onWheel prop.
  // React attaches wheel listeners as passive by default (for scroll
  // performance), which makes e.preventDefault() inside a React onWheel
  // handler a silent no-op -- confirmed against the real running app, not
  // hypothetical: it logs "Unable to preventDefault inside passive event
  // listener invocation" and, more importantly, the PAGE scrolls
  // underneath the canvas at the same time the canvas is trying to zoom.
  // No jsdom-based test catches this (jsdom does not enforce passive
  // listener semantics the way a real browser does), which is exactly why
  // this project's own test-design rules call for actually running the UI.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, e.deltaY < 0 ? zoom * WHEEL_FACTOR : zoom / WHEEL_FACTOR));
      const before = screenToWorld(sx, sy);
      setZoom(next);
      setPan({ x: sx - before.x * next, y: sy - before.y * next });
    };
    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
  }, [zoom, screenToWorld]);

  const hitTest = useCallback((wx: number, wy: number): Placement | null => {
    for (let i = visible.length - 1; i >= 0; i--) {
      const p = visible[i]!;
      const size = sizeOfPlacement(p, sizeByMap);
      if (wx >= p.x && wx < p.x + size.width && wy >= p.y && wy < p.y + size.height) return p;
    }
    return null;
  }, [visible, sizeByMap]);

  const postPlacement = (map: string, x: number, y: number) => {
    fetch("/api/world/placement", {
      method: "POST",
      body: JSON.stringify({ map, x, y }),
    }).catch(() => {
      // Best-effort: the optimistic local move already reflects the drag.
      // A failed POST means it will not survive a reload, not that the
      // in-session view is wrong -- there is nothing actionable to show the
      // user mid-drag for a single-user dev server.
    });
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const w = screenToWorld(sx, sy);
    const hit = hitTest(w.x, w.y);
    if (hit) {
      dragRef.current = { kind: "map", map: hit.map, grabDX: w.x - hit.x, grabDY: w.y - hit.y };
      setIsDraggingMap(true);
    } else {
      dragRef.current = { kind: "pan", startX: e.clientX, startY: e.clientY, startPan: pan };
    }
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag?.kind === "pan") {
      setPan({ x: drag.startPan.x + (e.clientX - drag.startX), y: drag.startPan.y + (e.clientY - drag.startY) });
      return;
    }
    if (drag?.kind === "map") {
      const rect = e.currentTarget.getBoundingClientRect();
      const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const nx = Math.round(w.x - drag.grabDX), ny = Math.round(w.y - drag.grabDY);
      setWorld((prev) => {
        if (!prev) return prev;
        const existing = prev.placements.get(drag.map);
        if (!existing || (existing.x === nx && existing.y === ny)) return prev;
        const next = new Map(prev.placements);
        next.set(drag.map, { ...existing, x: nx, y: ny });
        return { ...prev, placements: next };
      });
      setCompositeVersion((v) => v + 1);
      return;
    }

    // Not dragging: hover for the status strip and conflict tooltips.
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const badge = conflictBadgesRef.current.find((b) => Math.hypot(b.x - sx, b.y - sy) <= BADGE_SIZE);
    setTooltip(badge ? { x: sx, y: sy, text: badge.text } : null);

    const w = screenToWorld(sx, sy);
    const hit = hitTest(w.x, w.y);
    if (!hit || !world) {
      setHover(null);
      return;
    }
    setHover({ map: hit.map, component: componentOfPlacement(hit, world.components) });
  };

  const onMouseUp = () => {
    const drag = dragRef.current;
    if (drag?.kind === "map") {
      const p = world?.placements.get(drag.map);
      if (p) postPlacement(drag.map, p.x, p.y);
    }
    dragRef.current = null;
    setIsDraggingMap(false);
  };

  const onMouseLeaveCanvas = () => {
    dragRef.current = null;
    setIsDraggingMap(false);
    setHover(null);
    setTooltip(null);
  };

  const onDragOverCanvas = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
  };

  const onDropOnCanvas = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const map = e.dataTransfer.getData("text/plain");
    if (!map) return;
    const size = sizeByMap.get(map);
    if (!size) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const x = Math.round(w.x - size.width / 2), y = Math.round(w.y - size.height / 2);
    setWorld((prev) => {
      if (!prev) return prev;
      const next = new Map(prev.placements);
      next.set(map, { map, x, y, width: size.width, height: size.height, component: -1 });
      return { ...prev, placements: next };
    });
    setCompositeVersion((v) => v + 1);
    postPlacement(map, x, y);
  };

  const stageClassName = `world-canvas__stage${isDraggingMap ? " world-canvas__stage--dragging-map" : ""}`;

  return (
    <section className="world-canvas" aria-label="World canvas">
      <div className="world-canvas__toolbar">
        <div className="world-canvas__toolbar-group">
          <button
            type="button"
            role="switch"
            aria-checked={dungeonsOn}
            className="world-canvas__switch"
            onClick={() => setDungeonsOverride(!dungeonsOn)}
          >
            <span className="world-canvas__switch-thumb" />
          </button>
          <span className="world-canvas__dungeon-label">Dungeon auto-layout {dungeonsOn ? "on" : "off"}</span>
        </div>
        <div className="world-canvas__toolbar-group">
          <span className="world-canvas__zoom-readout">{Math.round((zoom / TILE_PX) * 100)}%</span>
          <button type="button" className="map-canvas__btn" onClick={fitWorld}>
            Fit world
          </button>
        </div>
      </div>

      <div className="world-canvas__legend">
        <span className="world-canvas__legend-item">
          <i className="world-canvas__swatch world-canvas__swatch--conflict" /> Conflict
        </span>
        <span className="world-canvas__legend-item">
          <i className="world-canvas__swatch world-canvas__swatch--dive" /> Dive
        </span>
        <span className="world-canvas__legend-item">
          <i className="world-canvas__swatch world-canvas__swatch--emerge" /> Emerge
        </span>
      </div>

      <div className="world-canvas__body">
        <div className="world-canvas__viewport" ref={containerRef}>
          {loadError ? (
            <p className="app__canvas-placeholder">Could not load the world: {loadError}</p>
          ) : !world ? (
            <p className="app__canvas-placeholder">Loading world…</p>
          ) : null}
          <canvas
            ref={canvasRef}
            className={stageClassName}
            width={viewport.w}
            height={viewport.h}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeaveCanvas}
            onDragOver={onDragOverCanvas}
            onDrop={onDropOnCanvas}
          />
          {tooltip && (
            <div className="world-canvas__tooltip" style={{ left: tooltip.x + 12, top: tooltip.y + 12 }} role="tooltip">
              {tooltip.text}
            </div>
          )}
        </div>

        <aside className="world-canvas__rail" aria-label="Unplaced maps">
          <div className="world-canvas__rail-header">
            <span className="world-canvas__rail-title">Unplaced</span>
            <span className="world-canvas__rail-count">{unplacedNames.length}</span>
          </div>
          <input
            className="world-canvas__rail-filter"
            placeholder="Filter…"
            value={railFilter}
            onChange={(e) => setRailFilter(e.target.value)}
          />
          {filteredUnplaced.length === 0 ? (
            <p className="world-canvas__rail-empty">
              {unplacedNames.length === 0 ? "Every map is placed." : `No matches for “${railFilter}”.`}
            </p>
          ) : (
            <ul className="world-canvas__rail-list">
              {filteredUnplaced.map((name) => (
                <li key={name}>
                  <button
                    type="button"
                    className="world-canvas__rail-item"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", name)}
                  >
                    {name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      <div className="world-canvas__status">
        <span className="world-canvas__status-item">
          placed <strong>{world ? world.placements.size : 0}</strong> · unplaced <strong>{unplacedNames.length}</strong> · conflicts{" "}
          <strong>{world ? world.conflicts.length : 0}</strong>
        </span>
        {hover ? (
          <span className="world-canvas__status-item world-canvas__hover">
            {hover.map}
            {hover.component ? ` · ${hover.component.maps.length}-map component` : " · manual placement (unknown component)"}
          </span>
        ) : (
          <span className="world-canvas__status-item world-canvas__hover world-canvas__hover--empty">Hover the world…</span>
        )}
      </div>
    </section>
  );
}

function drawTriangle(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, pointDown: boolean, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  if (pointDown) {
    ctx.moveTo(cx - size, cy - size);
    ctx.lineTo(cx + size, cy - size);
    ctx.lineTo(cx, cy + size);
  } else {
    ctx.moveTo(cx - size, cy + size);
    ctx.lineTo(cx + size, cy + size);
    ctx.lineTo(cx, cy - size);
  }
  ctx.closePath();
  ctx.fill();
}

function drawDiamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.lineTo(cx + size, cy);
  ctx.lineTo(cx, cy + size);
  ctx.lineTo(cx - size, cy);
  ctx.closePath();
  ctx.fill();
}
