import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Placement, Component, Conflict, Bounds } from "@pokemap/core/src/gbc/world/connections.js";
import type { GbcWorldPayload } from "@pokemap/core/src/gbc/wire.js";
import { computeFit, drawDiamond } from "../components/WorldCanvas.js";
import { useGbcWorld } from "./hooks/useGbcWorld.js";
import type { GbcTimeOfDay } from "./time.js";

/**
 * The read-only GBC world view (Plan 6b Task 5). Mirrors `WorldCanvas.tsx`'s
 * own pan/zoom/viewport/culling/LOD mechanics, cited by line, for the same
 * reason `GbcMapCanvas.tsx`'s own header comment does it for `MapCanvas.tsx`
 * -- these are this project's postmortems, not style preferences:
 * - `viewport` MUST stay in the draw effect's own dependency list
 *   (`WorldCanvas.tsx:410-422`, the Task 21 canvas-blanking postmortem).
 * - A native `wheel` listener, `{ passive: false }` (`WorldCanvas.tsx:
 *   1361-1375`) -- React's own `onWheel` is passive, so `preventDefault()`
 *   inside it is a silent no-op and the page scrolls under the canvas.
 * - Culling via the `intersects` AABB test (`WorldCanvas.tsx:220-222`):
 *   only a placement whose tile-rect intersects the viewport is drawn,
 *   fetched, or hit-testable.
 * - Images load per visible placement only, cached by ref (never refetched
 *   once cached), with a `compositeVersion` bump when each arrives
 *   (`WorldCanvas.tsx:845-868`), plus a downscaled `small` canvas at
 *   `LOD_SCALE` for the LOD path.
 * - Conflict badges: `drawDiamond` (exported additively from
 *   `WorldCanvas.tsx`, Plan 6b Task 5) at the offending map's top-right
 *   corner, plus a hit-rect recorded for a floating hover tooltip
 *   (`WorldCanvas.tsx:1328-1346`).
 * - The map-list jump (`jumpToMap`/`jumpToken`) and its 2s fading outline
 *   (`WorldCanvas.tsx:616-694`, the "jumpHighlight" pattern).
 *
 * **Lessons from Task 4, applied here too (binding, `task-4-spec-review.md`
 * findings A/B):**
 * - **One `view: { zoom, pan }` state, updated by a single pure function.**
 *   GBA's own `MapCanvas.tsx:532-542` (and, before its own fix round,
 *   `GbcMapCanvas.tsx`'s first draft) nested a `setPan` call inside a
 *   `setZoom` updater -- harmless outside `<StrictMode>`, but `main.tsx`
 *   wraps the whole app in it, and React double-invokes updater functions
 *   there, applying the nested update twice (2x zoom lands off-centre, 4x
 *   goes fully off-canvas). Unlike `GbcMapCanvas`'s own STEPPED
 *   `zoomAboutPivot` (1x/2x/4x), the world's zoom is CONTINUOUS
 *   (`WHEEL_FACTOR`-multiplied, `WorldCanvas.tsx:1368`'s own mechanic), so
 *   `zoomWorldAboutPivot` below mirrors that continuous math instead of
 *   copying `GbcMapCanvas.tsx`'s stepped version verbatim -- both are pure,
 *   single-state-returning functions for the identical StrictMode reason.
 * - **`useGuardedFetch`'s per-URL reset doesn't matter here**: `useGbcWorld`
 *   fetches a single fixed URL (`/api/world` never changes), so there is no
 *   stale-payload-under-a-new-name risk `GbcMapCanvas`'s own `useGbcMap`
 *   had to guard against.
 * - **Take screenshots only after images have loaded**; a "blank" GBC world
 *   view is very likely a real bug given the fix-round precedent (a stale
 *   fit from the wrong map, or a not-yet-resolved fetch) -- instrument
 *   `drawImage` before explaining one away.
 *
 * GBC-specific, and out of scope entirely (plan Q2, "GBA-only features"):
 * no drag-to-place, no multi-select move, no dungeon auto-layout toggle, no
 * warp markers/connection lines, no sidecar POSTs. Selection is a plain
 * single click (`onSelectMap`); double-click opens the map in Map view
 * (`onOpenMap`) rather than a warp destination modal.
 */

/** Native block size, px (`GbcWorldPayload.blockPx`, always 32). Zoom here
 *  is screen px PER BLOCK, not per tile -- see `computeFit`'s own
 *  `zoomBounds` doc comment for why GBA's `MAX_ZOOM` (a px/tile cap) is the
 *  wrong unit for this canvas. */
const BLOCK_PX = 32;

const GBC_MIN_ZOOM = 1 / 64;
const GBC_MAX_ZOOM = 32;
/** Passed to every `computeFit` call in this file -- GBC's zoom unit is
 *  screen px per BLOCK (native 32), not per tile (WorldCanvas.tsx's own
 *  MIN_ZOOM/MAX_ZOOM are a px/TILE cap of 16, which would silently limit a
 *  GBC fit to half native resolution). */
const GBC_ZOOM_BOUNDS = { min: GBC_MIN_ZOOM, max: GBC_MAX_ZOOM };

/** Continuous zoom step per wheel notch, same constant and same
 *  multiplicative mechanic as `WorldCanvas.tsx`'s own `WHEEL_FACTOR`
 *  (`WorldCanvas.tsx:23`) -- GBC's world zoom is continuous, unlike
 *  `GbcMapCanvas`'s own stepped 1x/2x/4x. */
const WHEEL_FACTOR = 1.2;

/** Fraction of native resolution the cached LOD buffer renders at --
 *  identical to `WorldCanvas.tsx`'s own `LOD_SCALE`. */
const LOD_SCALE = 0.25;

/** Below this many screen px per BLOCK, redraw from the downscaled `small`
 *  buffer rather than the full-resolution source image. GBA's own
 *  `LOD_ZOOM_THRESHOLD` is `4` = `16` (`TILE_PX`, GBA's native px/tile) *
 *  `LOD_SCALE`; GBC's block is 32px native, so its threshold is
 *  `32 * LOD_SCALE` = `8`, computed from the same named constants rather
 *  than a second unexplained literal. */
export const GBC_LOD_ZOOM_THRESHOLD = BLOCK_PX * LOD_SCALE; // 8

const BADGE_SIZE = 10;

/** "Fills about 60% of the viewport" (Task 5 spec's own jump wording) --
 *  distinct from `WorldCanvas.tsx`'s own map-list jump, which fits the
 *  target map at 100% via a bare `computeFit` call. A GBC map is usually
 *  much smaller relative to its neighbours than a GBA one is to the full
 *  1,209-map world, so landing at 100% would zoom in tight enough to lose
 *  all surrounding context (neighbouring maps, a conflict badge on an
 *  adjacent route); 60% leaves a visible margin. */
const JUMP_FILL_FRACTION = 0.6;

/** Same fade duration as `WorldCanvas.tsx`'s own jump highlight
 *  (`world-canvas-jump-fade`, `styles.css`). */
const JUMP_HIGHLIGHT_MS = 2000;

/** The canvas's whole pan/zoom state, updated as ONE value -- see the
 *  header comment's StrictMode citation. */
export interface GbcWorldView {
  zoom: number;
  pan: { x: number; y: number };
}

/**
 * Pure: given the current view, a multiplicative zoom factor (`>1` in,
 * `<1` out), and a pivot point in stage-canvas pixels, returns the view
 * that keeps the world-space point under the pivot fixed on screen --
 * clamped to `bounds` (default `GBC_ZOOM_BOUNDS`) -- or the SAME `view`
 * object when the clamped result doesn't actually change the zoom, so a
 * caller can use reference equality to skip work. Exported and
 * unit-tested with exact numbers, called from exactly one
 * `setView(v => zoomWorldAboutPivot(v, ...))` site (see the header
 * comment's StrictMode reasoning).
 */
export function zoomWorldAboutPivot(
  view: GbcWorldView,
  factor: number,
  pivotX: number,
  pivotY: number,
  bounds: { min: number; max: number } = GBC_ZOOM_BOUNDS,
): GbcWorldView {
  const next = Math.min(bounds.max, Math.max(bounds.min, view.zoom * factor));
  if (next === view.zoom) return view;
  const cx = (pivotX - view.pan.x) / view.zoom;
  const cy = (pivotY - view.pan.y) / view.zoom;
  return { zoom: next, pan: { x: pivotX - cx * next, y: pivotY - cy * next } };
}

/** AABB test in world-block space -- copied from `WorldCanvas.tsx`'s own
 *  `intersects` (not imported: that file exports it as a plain, unexported
 *  local function, and duplicating one four-line predicate is simpler than
 *  making it a second additive export). */
function intersects(px: number, py: number, pw: number, ph: number, x0: number, y0: number, x1: number, y1: number): boolean {
  return !(px + pw <= x0 || px >= x1 || py + ph <= y0 || py >= y1);
}

/**
 * The union of every MULTI-map component's own bounds (`.maps.length > 1`)
 * -- the "3 landmasses" a corpus this size actually has, excluding the 323
 * single-map interiors that make up most of the 255x746-block canvas (Task
 * 5 spec's own corpus facts). `null` when there are none (an empty/all-
 * singleton world), so the caller can fall back to `fitAllBounds`. Pure,
 * reading only `component.bounds` (already computed by `buildGbcWorld`) --
 * no placement lookup needed, unlike GBA's own `worldBoundsOf`, which has
 * to reconstruct an orphan's size from a separate `sizeByMap` map that GBC
 * has no equivalent of (every GBC placement already carries its own real
 * width/height, Task 2's own wire shape).
 */
export function initialFitBounds(world: { components: readonly Component[] }): Bounds | null {
  const multi = world.components.filter((c) => c.maps.length > 1);
  if (multi.length === 0) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of multi) {
    x0 = Math.min(x0, c.bounds.x);
    y0 = Math.min(y0, c.bounds.y);
    x1 = Math.max(x1, c.bounds.x + c.bounds.width);
    y1 = Math.max(y1, c.bounds.y + c.bounds.height);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** The union of every placement's own bounds -- "Fit all" (Task 5 spec).
 *  `null` for an empty world. */
export function fitAllBounds(placements: Record<string, Placement>): Bounds | null {
  const list = Object.values(placements);
  if (list.length === 0) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of list) {
    if (p.width <= 0 || p.height <= 0) continue;
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + p.width);
    y1 = Math.max(y1, p.y + p.height);
  }
  if (x0 === Infinity) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * The CLI's own `noteLines` wording (`packages/cli/src/gbcCommands.ts`,
 * `noteLines`), reused verbatim rather than re-derived: `${map} placed via
 * ${viaB.from}; ${viaA.from} disagrees by (dx,dy)`, `dx,dy = viaA - viaB`.
 * For the real Route17 fixture (`viaA: {from: "Route18", x:30,y:50}`,
 * `viaB: {from: "Route16", x:30,y:49}`): "Route17 placed via Route16;
 * Route18 disagrees by (0,1)" -- re-measured directly against the live
 * corpus's `buildGbcWorld` output, not copied from the spec's prose.
 */
export function conflictTooltipText(c: Conflict): string {
  const dx = c.viaA.x - c.viaB.x;
  const dy = c.viaA.y - c.viaB.y;
  return `${c.map} placed via ${c.viaB.from}; ${c.viaA.from} disagrees by (${dx},${dy})`;
}

/** Pure LOD chooser -- the mutation the spec names explicitly ("use an LOD
 *  threshold of 4", GBA's own value) must fail against a zoom strictly
 *  between the two thresholds (4 <= zoom < 8). */
export function shouldUseLod(zoom: number): boolean {
  return zoom < GBC_LOD_ZOOM_THRESHOLD;
}

interface FitResult {
  zoom: number;
  pan: { x: number; y: number };
}

/**
 * The map-list jump's own fit: like `computeFit(bounds, viewport,
 * zoomBounds)`, but the resulting zoom is scaled down by `fraction` (default
 * `JUMP_FILL_FRACTION`) after computing the "fits entirely" zoom, then
 * re-centred at that smaller zoom -- "fills about 60% of the viewport", not
 * "fits exactly". Exported and unit-tested directly against `computeFit`'s
 * own pinned numbers.
 */
export function jumpFit(
  bounds: Bounds,
  viewport: { w: number; h: number },
  zoomBounds: { min: number; max: number } = GBC_ZOOM_BOUNDS,
  fraction: number = JUMP_FILL_FRACTION,
): FitResult {
  const fit = computeFit(bounds, viewport, zoomBounds);
  const zoom = Math.min(zoomBounds.max, Math.max(zoomBounds.min, fit.zoom * fraction));
  return {
    zoom,
    pan: {
      x: -bounds.x * zoom + (viewport.w - bounds.width * zoom) / 2,
      y: -bounds.y * zoom + (viewport.h - bounds.height * zoom) / 2,
    },
  };
}

interface ImageCacheEntry {
  loaded: boolean;
  img?: HTMLImageElement;
  small?: HTMLCanvasElement;
}

interface HoverInfo {
  map: string;
  component: Component | null;
  width: number;
  height: number;
}

interface TooltipInfo {
  x: number;
  y: number;
  text: string;
}

export interface GbcWorldCanvasProps {
  time: GbcTimeOfDay;
  /** A map name to jump to, or null/undefined for none -- mirrors
   *  `WorldCanvas.tsx`'s own `jumpToMap` (`GbcApp`'s tree clicks). */
  jumpToMap?: string | null;
  /** Bumped on every tree click, even a re-click of the same name --
   *  `jumpToMap` alone can't tell "jump here again" from "no change". */
  jumpToken?: number;
  /** Fired when a single click hits a placement -- `GbcApp` uses this to
   *  keep the sidebar tree's own highlight in sync with the canvas. */
  onSelectMap?: (name: string) => void;
  /** Fired when a double-click hits a placement -- `GbcApp` switches to Map
   *  view with that map selected. */
  onOpenMap?: (name: string) => void;
}

/**
 * The stitched GBC world: all 391 maps culled to the viewport, panned and
 * zoomed, read-only. See this file's own header comment for the mechanics
 * reproduced from `WorldCanvas.tsx`, and `packages/ui/DESIGN.md` for the
 * `world-canvas__*` classes reused verbatim below.
 */
export function GbcWorldCanvas({ time, jumpToMap, jumpToken, onSelectMap, onOpenMap }: GbcWorldCanvasProps) {
  const { data: world, error } = useGbcWorld();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageCacheRef = useRef<Map<string, ImageCacheEntry>>(new Map());
  const conflictBadgesRef = useRef<Array<{ x: number; y: number; text: string }>>([]);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  // Same "did a real drag happen" guard `WorldCanvas.tsx`'s own
  // `dragMovedRef` is for -- a plain click/dblclick fires even after a
  // same-element drag (browsers do not suppress it), so this is what
  // actually tells the two apart.
  const dragMovedRef = useRef(false);

  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<GbcWorldView>({ zoom: 1, pan: { x: 0, y: 0 } });
  const { zoom, pan } = view;
  const [compositeVersion, setCompositeVersion] = useState(0);
  const [selectedMap, setSelectedMap] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const [jumpHighlight, setJumpHighlight] = useState<string | null>(null);

  // Measure the viewport -- WorldCanvas.tsx:410-422's own pattern.
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

  // Initial fit: once, as soon as the world AND a real viewport are both
  // available -- the multi-map-components-only bounds (Task 5 spec), not
  // GBA's own "no auto-fit at all" posture. Safe to do eagerly here (unlike
  // GBA's 1,209-map world): the fit bounds only cover the 3 real landmasses
  // to begin with, so the very first render never loads more than what
  // that bounding box's own culling already shows.
  const initialFitDoneRef = useRef(false);
  useEffect(() => {
    if (!world || initialFitDoneRef.current) return;
    if (viewport.w <= 0 || viewport.h <= 0) return;
    initialFitDoneRef.current = true;
    const bounds = initialFitBounds(world) ?? fitAllBounds(world.placements);
    if (bounds) setView(computeFit(bounds, viewport, GBC_ZOOM_BOUNDS));
  }, [world, viewport]);

  const fitAll = useCallback(() => {
    if (!world) return;
    const bounds = fitAllBounds(world.placements);
    if (bounds) setView(computeFit(bounds, viewport, GBC_ZOOM_BOUNDS));
  }, [world, viewport]);

  // Culling: only placements whose block-rect intersects the current
  // viewport are "visible" -- WorldCanvas.tsx:758-817's own pattern, minus
  // every GBA-only concern (mapType visibility, mapFilter, sizeByMap) that
  // has no GBC equivalent.
  const visible = useMemo(() => {
    if (!world) return [] as Placement[];
    const x0 = -pan.x / zoom, y0 = -pan.y / zoom;
    const x1 = (viewport.w - pan.x) / zoom, y1 = (viewport.h - pan.y) / zoom;
    const out: Placement[] = [];
    for (const p of Object.values(world.placements)) {
      if (p.width <= 0 || p.height <= 0) continue;
      if (intersects(p.x, p.y, p.width, p.height, x0, y0, x1, y1)) out.push(p);
    }
    return out;
  }, [world, pan, zoom, viewport]);

  // GBC-specific: a time switch drops the WHOLE image cache (every
  // reference), so a stale day/nite image is never drawn under the new
  // time and never held alongside it -- decoded renders are ~153MB PER
  // TIME OF DAY at native size (Task 5 spec's own measured fact), so this
  // canvas holds at most one time's worth at once.
  useEffect(() => {
    imageCacheRef.current.clear();
    setCompositeVersion((v) => v + 1);
  }, [time]);

  // Load (and cache) the source image for every visible placement that
  // doesn't have one yet, keyed by map name only -- WorldCanvas.tsx:
  // 845-868's own pattern. Depends on `time` too (not just `visible`) so a
  // time switch re-populates the now-empty cache above with the new time's
  // URLs for whatever is still visible.
  useEffect(() => {
    for (const p of visible) {
      if (imageCacheRef.current.has(p.map)) continue;
      const entry: ImageCacheEntry = { loaded: false };
      imageCacheRef.current.set(p.map, entry);
      const img = new Image();
      img.onload = () => {
        entry.loaded = true;
        entry.img = img;
        const small = document.createElement("canvas");
        small.width = Math.max(1, Math.round(p.width * BLOCK_PX * LOD_SCALE));
        small.height = Math.max(1, Math.round(p.height * BLOCK_PX * LOD_SCALE));
        const sctx = small.getContext("2d");
        if (sctx) {
          sctx.imageSmoothingEnabled = false;
          sctx.drawImage(img, 0, 0, small.width, small.height);
        }
        entry.small = small;
        setCompositeVersion((v) => v + 1);
      };
      img.src = `/api/render/${encodeURIComponent(p.map)}.png?time=${time}`;
    }
  }, [visible, time]);

  // The actual draw. `viewport` MUST stay in this dependency list (see the
  // header comment's Task 21 citation).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const useLod = shouldUseLod(zoom);
    for (const p of visible) {
      const cache = imageCacheRef.current.get(p.map);
      if (!cache?.loaded) continue;
      const dx = p.x * zoom + pan.x, dy = p.y * zoom + pan.y;
      const dw = p.width * zoom, dh = p.height * zoom;
      if (useLod && cache.small) ctx.drawImage(cache.small, dx, dy, dw, dh);
      else if (cache.img) ctx.drawImage(cache.img, dx, dy, dw, dh);
    }

    if (!world) return;
    const style = typeof getComputedStyle === "function" ? getComputedStyle(document.documentElement) : null;
    const conflictColor = style?.getPropertyValue("--danger").trim() || "#ef4444";

    // Conflicts: a diamond at Conflict.map's top-right corner, plus a
    // hit-rect for the hover tooltip below -- WorldCanvas.tsx:1328-1346's
    // own pattern, never hidden behind a toggle.
    const badges: Array<{ x: number; y: number; text: string }> = [];
    for (const conflict of world.conflicts) {
      const p = world.placements[conflict.map];
      if (!p || p.width <= 0 || p.height <= 0) continue;
      const cx = p.x * zoom + pan.x + p.width * zoom - BADGE_SIZE;
      const cy = p.y * zoom + pan.y + BADGE_SIZE;
      drawDiamond(ctx, cx, cy, BADGE_SIZE, conflictColor);
      badges.push({ x: cx, y: cy, text: conflictTooltipText(conflict) });
    }
    conflictBadgesRef.current = badges;
  }, [compositeVersion, pan, zoom, viewport, visible, world]);

  const screenToWorld = useCallback((sx: number, sy: number) => ({ x: (sx - pan.x) / zoom, y: (sy - pan.y) / zoom }), [pan, zoom]);

  // Native, { passive: false } -- see the header comment.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? WHEEL_FACTOR : 1 / WHEEL_FACTOR;
      setView((v) => zoomWorldAboutPivot(v, factor, x, y));
    };
    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
  }, []);

  const hitTest = useCallback(
    (wx: number, wy: number): Placement | null => {
      for (let i = visible.length - 1; i >= 0; i--) {
        const p = visible[i]!;
        if (wx >= p.x && wx < p.x + p.width && wy >= p.y && wy < p.y + p.height) return p;
      }
      return null;
    },
    [visible],
  );

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    dragMovedRef.current = false;
    dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag) {
      dragMovedRef.current = true;
      setView((v) => ({ ...v, pan: { x: drag.panX + (e.clientX - drag.x), y: drag.panY + (e.clientY - drag.y) } }));
      return;
    }

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
    const component = hit.component >= 0 && hit.component < world.components.length ? world.components[hit.component]! : null;
    setHover({ map: hit.map, component, width: hit.width, height: hit.height });
  };

  const onMouseUp = () => {
    dragRef.current = null;
  };

  const onMouseLeave = () => {
    dragRef.current = null;
    setHover(null);
    setTooltip(null);
  };

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragMovedRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const hit = hitTest(w.x, w.y);
    setSelectedMap(hit ? hit.map : null);
    if (hit) onSelectMap?.(hit.map);
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragMovedRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const hit = hitTest(w.x, w.y);
    if (hit) onOpenMap?.(hit.map);
  };

  // Map-list jump: centre jumpToMap at ~60% of the viewport, then flash an
  // outline -- WorldCanvas.tsx:639-667's own "retry once world itself
  // changes" reasoning (a tree click can arrive before /api/world has
  // resolved, e.g. switching to World mode right after selecting a map in
  // Map mode), guarded so an already-handled token is never re-applied.
  const appliedJumpTokenRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (jumpToken === undefined || jumpToken === appliedJumpTokenRef.current) return;
    if (!jumpToMap || !world) return; // retry once `world` itself changes
    appliedJumpTokenRef.current = jumpToken;
    const p = world.placements[jumpToMap];
    if (!p || p.width <= 0 || p.height <= 0) return;
    setView(jumpFit({ x: p.x, y: p.y, width: p.width, height: p.height }, viewport));
    setJumpHighlight(jumpToMap);
  }, [jumpToken, jumpToMap, world, viewport]);

  // The 2s fade-out, kept in its own effect scoped to `jumpHighlight` alone
  // -- WorldCanvas.tsx:669-694's own review-fix reasoning: coupling this to
  // the jump-triggering effect above (which also depends on `viewport`,
  // which can change independently, e.g. a window resize) would kill and
  // never reschedule the pending timer.
  useEffect(() => {
    if (!jumpHighlight) return;
    const timer = setTimeout(() => setJumpHighlight(null), JUMP_HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [jumpHighlight]);

  const zoomPercent = Math.round((zoom / BLOCK_PX) * 100);
  const selectedRect = selectedMap && world?.placements[selectedMap] ? world.placements[selectedMap]! : null;
  const jumpRect = jumpHighlight && world?.placements[jumpHighlight] ? world.placements[jumpHighlight]! : null;

  return (
    <section className="world-canvas gbc-world-canvas" aria-label="World canvas">
      <div className="world-canvas__toolbar">
        <div className="world-canvas__toolbar-group">
          <button type="button" className="map-canvas__btn" onClick={fitAll}>
            Fit all
          </button>
        </div>
      </div>

      <div className="world-canvas__legend">
        <span className="world-canvas__legend-item">
          <i className="world-canvas__swatch world-canvas__swatch--conflict" /> Conflict
        </span>
      </div>

      <div className="world-canvas__body">
        <div className="world-canvas__viewport" ref={containerRef}>
          {error ? (
            <p className="app__canvas-placeholder">Could not load the world: {error}</p>
          ) : !world ? (
            <p className="app__canvas-placeholder">Loading world…</p>
          ) : null}
          <canvas
            ref={canvasRef}
            className="world-canvas__stage"
            width={viewport.w}
            height={viewport.h}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeave}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
          />
          {selectedRect && (
            <div className="world-canvas__selection" aria-hidden="true">
              <div
                className="world-canvas__selection-outline"
                style={{ left: selectedRect.x * zoom + pan.x, top: selectedRect.y * zoom + pan.y, width: selectedRect.width * zoom, height: selectedRect.height * zoom }}
              />
            </div>
          )}
          {jumpRect && (
            <div className="world-canvas__selection" aria-hidden="true">
              {/* Keyed on jumpToken (WorldCanvas.tsx:1838-1851's own review
                  fix): without it, re-jumping to the same map name reuses
                  the same DOM node, whose `forwards`-filling fade animation
                  has already finished, so it would not visibly restart. */}
              <div
                key={jumpToken}
                className="world-canvas__selection-outline world-canvas__jump-highlight"
                style={{ left: jumpRect.x * zoom + pan.x, top: jumpRect.y * zoom + pan.y, width: jumpRect.width * zoom, height: jumpRect.height * zoom }}
              />
            </div>
          )}
          {tooltip && (
            <div className="world-canvas__tooltip" style={{ left: tooltip.x + 12, top: tooltip.y + 12 }} role="tooltip">
              {tooltip.text}
            </div>
          )}
        </div>
      </div>

      <div className="world-canvas__status">
        <span className="world-canvas__status-item">
          {world ? world.components.length : 0} components · {world ? Object.keys(world.placements).length : 0} maps · zoom {zoomPercent}%
        </span>
        {hover ? (
          <span className="world-canvas__status-item world-canvas__hover">
            {hover.map}
            {hover.component ? ` · component #${hover.component.index} (${hover.component.maps.length} maps) · ${hover.width}×${hover.height} blocks` : ""}
          </span>
        ) : (
          <span className="world-canvas__status-item world-canvas__hover world-canvas__hover--empty">Hover the world…</span>
        )}
      </div>
    </section>
  );
}
