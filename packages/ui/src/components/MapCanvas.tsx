import { useCallback, useEffect, useRef, useState } from "react";
import { drawGrid, drawCollision, drawElevation, drawEvents, type EventMark } from "@pokemap/core/src/render/overlays.js";
import type { LayoutRaster } from "@pokemap/core/src/render/layout.js";
import type { MapData } from "@pokemap/core/src/load/maps.js";
import type { EventKind } from "@pokemap/core/src/edit/events.js";
import type { MapLayoutData } from "../hooks/useMapLayout.js";
import type { UseEditSessionResult } from "../hooks/useEditSession.js";
import type { Stamp } from "@pokemap/core/src/edit/paint.js";
import type { CollisionElevation } from "./CollisionPalette.js";

/** A bare {kind,index} pointer at one event, the unit MapCanvas's own
 *  selection/drag interaction deals in -- resolving it into a full event
 *  object (EventInspector's own richer `SelectedEvent`) is the caller's job
 *  (App.tsx), same division of labour as CollisionPalette's own controlled
 *  `selected` prop: this component only ever needs to know WHICH event, not
 *  its full field set. */
export interface EventRef {
  kind: EventKind;
  index: number;
}

/** Finds whichever event (of any kind) occupies block cell (bx,by). Scans
 *  object, then warp, then coord, then bg, and returns the FIRST match --
 *  note this is NOT "whichever one paints on top": drawEvents
 *  (core/render/overlays.ts) draws its marks in that same object/warp/
 *  coord/bg order via sequential `blendRect` calls, so on a cell where more
 *  than one overlaps, bg is what's drawn LAST and therefore visually
 *  topmost, the opposite end of this scan. This picks object-first
 *  instead -- object events (NPCs, the player's usual click target) are
 *  the kind most worth prioritising for selection on an overlap, an
 *  arbitrary-but-documented choice, not a derived one. Whole-cell hit
 *  test, not a smaller radius: drawEvents's own `blendRect` tints the
 *  entire 16x16 block a marker sits on, so "under the cursor" already means
 *  "same block" for every existing read-only marker, not a bespoke shape
 *  this task invents. Pure and standalone (no ref extraction needed from
 *  drawEvents itself -- it returns EventMark[], which carries no per-kind
 *  index -- so this reads straight from `map`'s own four event arrays,
 *  which already have MapCanvas's `map` prop available). */
function findEventAt(map: MapData, bx: number, by: number): EventRef | null {
  const lists: [EventKind, { x: number; y: number }[]][] = [
    ["object", map.objectEvents], ["warp", map.warpEvents], ["coord", map.coordEvents], ["bg", map.bgEvents],
  ];
  for (const [kind, list] of lists) {
    const index = list.findIndex((e) => e.x === bx && e.y === by);
    if (index !== -1) return { kind, index };
  }
  return null;
}

/** Looks up one event's current x/y by {kind,index} -- used to draw the
 *  static selection ring (as opposed to `dragPreview`'s own in-flight
 *  candidate position, see the blit effect below). */
function eventPositionAt(map: MapData, ref: EventRef | null | undefined): { x: number; y: number } | null {
  if (!ref) return null;
  const list = ref.kind === "object" ? map.objectEvents : ref.kind === "warp" ? map.warpEvents : ref.kind === "coord" ? map.coordEvents : map.bgEvents;
  const e = list[ref.index];
  return e ? { x: e.x, y: e.y } : null;
}

export interface MapCanvasProps {
  mapName: string;
  data: MapLayoutData;
  /** Present only when editing is active for THIS map -- see
   *  useEditSession.ts. Every existing read-only consumer (Map mode's
   *  default view, WarpDestinationModal's preview) never passes this and
   *  is completely unaffected by anything in this task. */
  editSession?: UseEditSessionResult;
  /** "collision" (Task 12) paints a stamp whose cell carries only
   *  collision/elevation -- no metatileId -- leaving the id untouched
   *  (paintCells's own field-by-field merge, see packages/core/src/edit/
   *  paint.ts). It reuses the pencil tool server-side (a single-cell
   *  targets array); it is its own `activeTool.kind` here only so the
   *  canvas knows to force the collision overlay visible while it's
   *  selected -- see `collisionForced` below. */
  activeTool?: { kind: "pencil" | "rect" | "bucket"; stamp: Stamp } | { kind: "collision"; value: CollisionElevation } | null;
  /** Task 14: click-to-select/drag-to-move for event markers. Gated on
   *  `!activeTool` (see onMouseDown below) rather than on `editSession` --
   *  select/deselect is harmless read-only navigation even without an open
   *  edit session (WarpDestinationModal's own read-only preview never
   *  passes these, so it is unaffected either way), and the natural
   *  App.tsx-level rule is simply "no paint tool is active." Every existing
   *  caller that omits these three props is completely unaffected (same
   *  "optional, additive" shape Task 11's editSession/activeTool pair
   *  established). */
  onSelectEvent?: (ref: EventRef | null) => void;
  /** The CURRENTLY selected event, for drawing its selection ring -- purely
   *  a visual echo of whatever the parent's own selection state holds
   *  (App.tsx), same controlled-prop shape CollisionPalette's `selected`
   *  already uses. Never read by the hit-test/drag logic itself, which
   *  always re-derives from the click position and the live `map`. */
  selectedEventRef?: EventRef | null;
  /** Fired once, on mouseup, with the event's final dropped cell -- never
   *  on every mousemove frame (see eventDragRef/dragPreview below, and this
   *  task's own teeth-proof for why the ref must be read into local consts
   *  BEFORE being cleared). Event move/add/delete are single-shot HTTP
   *  calls with no begin/apply/end lifecycle (unlike paint's stroke), so
   *  none of pendingPaintRef's race-guarding machinery applies here --
   *  verified, not assumed: there is no multi-request sequencing for a drag
   *  to race against. */
  onMoveEvent?: (next: { kind: EventKind; index: number; x: number; y: number }) => void;
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
export function MapCanvas({ mapName, data, editSession, activeTool, onSelectEvent, selectedEventRef, onMoveEvent }: MapCanvasProps) {
  const { layout, split, map: staticMap, blocks: staticBlocks } = data;
  // Live, server-tracked blocks while an edit session is open for this map;
  // the static `data.blocks` prop otherwise. Every effect below already
  // reads `blocks` by name and never needs to know which source it came
  // from. One real wrinkle: `editSession.blocks` is core's own `Block`
  // (metatileId/collision/elevation only) -- it carries no resolved tile
  // `behavior`, unlike `data.blocks` (server-enriched per /api/map/:name).
  // Recomputing behavior client-side would need the tileset's own behavior
  // table, which this component doesn't have -- out of scope for wiring
  // painting (Task 11). The one place that reads `.behavior` (hoverAt,
  // below) falls back to 0 for a live-edited cell rather than crashing.
  // Review-flagged tradeoff, accepted: 0 is MB_NORMAL, a real, common
  // behavior value, not a dedicated "unknown" sentinel -- so a freshly
  // painted cell's hover strip can read as genuine data when it is really
  // just unresolved. A distinguishable marker (e.g. `undefined` rendered
  // as "--") would fix that, but was judged not worth the extra
  // Hover/render-path plumbing for what the status strip already treats
  // as a soft, best-effort readout (the same panel already shows 0x0 for
  // a real MB_NORMAL tile with no way to tell the two apart today).
  const blocks = editSession ? editSession.blocks : staticBlocks;
  // Task 14: same live/static split as `blocks` just above, and for the
  // same reason -- event move/add/delete (useEditSession's own new
  // moveEvent/addEvent/deleteEvent methods) mutate `session.map` server-
  // side, not `session.blocks`/`session.border`, so the event MARKERS
  // this component draws (drawEvents(raster, map) in the composite effect
  // below, and this task's own findEventAt/eventPositionAt) must read the
  // live map once an edit session is open, or a move/add/delete would
  // never visibly update until the player switched maps and back. Falls
  // back to `data.map` (useMapLayout's own static fetch) exactly like
  // `blocks` falls back to `staticBlocks` -- every read-only caller
  // (WarpDestinationModal's preview, Map mode before an edit session
  // opens) is unaffected, since `editSession` is undefined there too.
  const map = editSession?.map ?? staticMap;

  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const rectStartRef = useRef<{ x: number; y: number } | null>(null);
  const marksRef = useRef<EventMark[]>([]);
  // Tracks the most recent in-flight paint request -- begin's own chain
  // (whose .then() callback sets rectStartRef for "rect", or paints
  // directly for pencil/bucket), or the latest pencil/bucket applyPaint.
  // `endActiveStroke` below (onMouseUp and onMouseLeave both route through
  // it) awaits this before deciding what to do. Confirmed live (Task 11
  // Step 8) against the real dev server, not hypothetical: without it, a
  // plain click's mouseup fired endStroke()'s own fetch immediately, and
  // on localhost it could beat the still-in-flight begin-then-apply chain
  // onto the wire (begin, end, apply, in that order) -- /paint/end then
  // snapshots blocks BEFORE the apply has mutated them, sees no change,
  // and clears strokeStartBlocks with no undo command pushed. The apply
  // arrives moments later and DOES mutate entry.session.blocks, but
  // nothing is tracking it anymore -- an edit silently invisible to undo/
  // redo. A code-review pass later found the SAME race, worse, on the
  // rect path specifically (see endActiveStroke's own doc comment: a fast
  // rect gesture could drop the paint entirely, not just its undo entry).
  // This is exactly the class of bug Plan 0 Section 7 says only a real
  // browser catches; no jsdom-driven test in this file reproduced it
  // originally because the mocked editSession never raced real requests
  // against each other -- the rect variant now has a deterministic
  // repro using a controlled, delayed beginStroke promise instead.
  const pendingPaintRef = useRef<Promise<void>>(Promise.resolve());
  // True from the moment onMouseDown begins an edit-session stroke until
  // that stroke actually ends (onMouseUp, or onMouseLeave's own mirrored
  // cleanup below). Lets onMouseLeave tell "a stroke is genuinely open"
  // apart from "editSession/activeTool are simply present" -- it must not
  // fire endStroke() on every ordinary mouse-out.
  const strokeOpenRef = useRef(false);
  // Task 14: set from onMouseDown's own hit-test the instant a click lands
  // on an event marker (with no paint tool active), holding the event's
  // {kind,index} AND the block cell the drag STARTED at -- the start cell
  // is what onMouseUp compares the final cell against to decide whether
  // anything actually moved (see the corrected onMouseUp below: those
  // fields are captured into local consts before this ref is nulled, not
  // read after -- the exact stale-ref-after-null mistake class Task 11's
  // endActiveStroke/pendingPaintRef pair was written to avoid; the teeth-
  // proof in this task's own report reintroduces the bug once to confirm
  // the test that would have caught it actually does).
  const eventDragRef = useRef<{ kind: EventKind; index: number; x: number; y: number } | null>(null);
  // Ephemeral, local-only preview of where a drag-in-progress WOULD drop --
  // never sent to the server (onMoveEvent fires once, from onMouseUp, with
  // the final cell only). Drawn by the blit effect below as a lightweight
  // stroke rect on the STAGE canvas itself, the same "cheap redraw, never
  // touches the persisted overlay composite" posture that effect already
  // takes for pan/zoom -- a drag preview is exactly that kind of ephemeral,
  // per-frame redraw, not a state change worth recompositing the whole
  // base image for.
  const [dragPreview, setDragPreview] = useState<{ kind: EventKind; index: number; x: number; y: number } | null>(null);

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

  // Task 12: the collision tool forces its own overlay visible regardless
  // of the manual toggle -- a painter must always see what they're
  // painting -- ORed into every place `toggles.collision` used to gate
  // overlay visibility below. The manual toggle BUTTON's own aria-pressed
  // still reflects `toggles.collision` alone (untouched), not this.
  const collisionForced = activeTool?.kind === "collision";
  const showCollision = toggles.collision || collisionForced;

  // Step 1: recomposite the pristine base + whichever overlays are on. Runs
  // only when the map, its data, or the toggle set (or collisionForced)
  // changes.
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

    const anyOverlay = toggles.grid || showCollision || toggles.elevation || toggles.events;
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
      if (showCollision) drawCollision(raster);
      if (toggles.elevation) drawElevation(raster);
      if (toggles.events) marksRef.current = drawEvents(raster, map);
      ctx.putImageData(imageData, 0, 0);
    }

    setCompositeVersion((v) => v + 1);
  }, [imgLoaded, toggles, showCollision, blocks, layout, map, pixelWidth, pixelHeight, originX, originY]);

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

    // Task 14: event selection ring / drag preview -- an ephemeral stroke
    // on the STAGE canvas itself, drawn fresh on every blit exactly like
    // pan/zoom already are, never touching baseCanvasRef's own persisted
    // overlay composite (Step 1 above). A drag preview (the candidate drop
    // cell, tracked in `dragPreview` while eventDragRef is set) always wins
    // over the static selection ring when both would apply -- it is
    // showing where the event is ABOUT to land, not its real, still
    // unmoved position, so the two must never be drawn on top of each
    // other. `ctx.strokeRect` et al. are guarded behind `highlight` being
    // non-null, so a caller that never passes selectedEventRef/dragPreview
    // (every pre-Task-14 consumer) never calls a canvas API this file
    // didn't already call before this task.
    const highlight = dragPreview ?? eventPositionAt(map, selectedEventRef);
    if (highlight) {
      const sx = pan.x + (originX + highlight.x * 16) * zoom;
      const sy = pan.y + (originY + highlight.y * 16) * zoom;
      const size = 16 * zoom;
      // Canvas 2D `strokeStyle` cannot take a raw `var(...)` string (unlike
      // CSS properties) -- it must be a resolved colour, so this reads
      // DESIGN.md's own --overlay-selection token off the live document at
      // draw time instead of hardcoding one theme's hex. Falls back to the
      // dark-mode value if the custom property isn't set (e.g. no
      // stylesheet loaded, as in this file's own jsdom tests, none of
      // which ever reach this branch -- imgLoaded is false there, so this
      // whole effect returns above before this line).
      const selectionColor = getComputedStyle(document.documentElement).getPropertyValue("--overlay-selection").trim() || "#22d3ee";
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = dragPreview ? "#ffffff" : selectionColor;
      ctx.strokeRect(sx + 1, sy + 1, size - 2, size - 2);
      ctx.restore();
    }
  }, [compositeVersion, zoom, pan, pixelWidth, pixelHeight, viewport, dragPreview, selectedEventRef, map, originX, originY]);

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
    // `block` may be a live-edited core Block (no `.behavior` -- see the
    // `blocks` doc comment above); fall back to 0 rather than crashing on
    // `undefined.toString(16)` inside `hex()`.
    const behavior = (block as { behavior?: number }).behavior ?? 0;
    setHover({ bx, by, metatileId: block.metatileId, collision: block.collision, elevation: block.elevation, behavior, mark });
  };

  /** Raw client-coords -> block-cell math, unclamped -- a rect's own second
   *  corner is allowed to land past the layout edge (a drag that overshoots
   *  the map boundary); paintCells on the server already silently skips any
   *  out-of-range target, the same way it skips one mid-drag today. */
  const rawBlockAt = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.floor(((e.clientX - rect.left - pan.x) / zoom - originX) / 16),
      y: Math.floor(((e.clientY - rect.top - pan.y) / zoom - originY) / 16),
    };
  };

  /** Same math, but null outside the layout -- used where painting a single
   *  cell (pencil/bucket, or a rect's own start corner) must not fire on a
   *  click that lands off the map entirely. */
  const blockAt = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    const cell = rawBlockAt(e);
    if (cell.x < 0 || cell.y < 0 || cell.x >= layout.width || cell.y >= layout.height) return null;
    return cell;
  };

  const paintAt = (bx: number, by: number) => {
    if (!editSession || !activeTool) return;
    if (activeTool.kind === "pencil") {
      pendingPaintRef.current = editSession.applyPaint({ tool: "pencil", targets: [{ x: bx, y: by }], stamp: activeTool.stamp, origin: { x: bx, y: by } });
    } else if (activeTool.kind === "bucket") {
      const cell = activeTool.stamp.cells[0];
      // Runtime guard, not a non-null assertion: StampCell.metatileId is
      // optional ONLY because the collision tool needs a stamp cell that
      // omits it (Task 12's own widening of the type). Bucket's own stamp
      // is expected to always carry a real id (from a palette/dropper
      // pick), but nothing at the type level stops a future caller from
      // routing a collision-only stamp through "bucket" -- asserting here
      // would make that a silent lie (either a crash or a bogus
      // `replacement.metatileId: undefined` sent to the server). No-op
      // instead: there is nothing sensible to flood-fill with.
      if (cell?.metatileId === undefined) return;
      pendingPaintRef.current = editSession.applyPaint({ tool: "bucket", x: bx, y: by, replacement: { metatileId: cell.metatileId, collision: cell.collision, elevation: cell.elevation } });
    } else if (activeTool.kind === "collision") {
      // Reuses the pencil tool server-side with a 1x1 stamp whose cell
      // omits metatileId -- paintCells's own merge (Task 12's fix to
      // packages/core/src/edit/paint.ts) leaves the target's existing id
      // untouched, painting collision/elevation only.
      pendingPaintRef.current = editSession.applyPaint({
        tool: "pencil",
        targets: [{ x: bx, y: by }],
        stamp: { width: 1, height: 1, cells: [{ collision: activeTool.value.collision, elevation: activeTool.value.elevation }] },
        origin: { x: bx, y: by },
      });
    }
    // "rect" is handled entirely by onMouseUp below (it needs a start AND
    // end cell, unlike pencil/bucket/collision which act on a single cell)
    // -- see rectStartRef.
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    // Task 14: ahead of the Task 11 paint branch -- selection only engages
    // when no paint tool is active (activeTool null), the natural signal
    // that the player is in "select/move events" mode rather than
    // "paint" mode; the two never compete for the same click. Uses
    // rawBlockAt (unclamped), not blockAt: a click just past the layout
    // edge should still be able to DESELECT (onSelectEvent(null)) even
    // though no real event can ever live out there.
    if (onSelectEvent && !activeTool) {
      const cell = rawBlockAt(e);
      const hit = findEventAt(map, cell.x, cell.y);
      onSelectEvent(hit);
      if (hit) {
        eventDragRef.current = { kind: hit.kind, index: hit.index, x: cell.x, y: cell.y };
        return;
      }
      // No marker under the click: fall through to the ordinary pan-drag
      // start just below, exactly as if onSelectEvent had never been
      // passed -- deselecting must not also disable panning.
    }
    if (editSession && activeTool) {
      const cell = blockAt(e);
      if (!cell) return;
      strokeOpenRef.current = true;
      // Stored in pendingPaintRef too, not just fired-and-forgotten -- see
      // that ref's own doc comment above for why onMouseUp/onMouseLeave
      // need it.
      pendingPaintRef.current = editSession.beginStroke().then(() => {
        if (activeTool.kind === "rect") rectStartRef.current = cell;
        else paintAt(cell.x, cell.y);
      });
      return;
    }
    dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Task 14: an event marker drag in progress -- track the CANDIDATE
    // drop cell locally only (dragPreview, redrawn by the blit effect
    // below); onMoveEvent itself fires exactly once, from onMouseUp, never
    // here. No e.buttons===1 guard needed (unlike the pencil/collision
    // trail just below): eventDragRef is only ever non-null between this
    // component's own mousedown-hit and mouseup/mouseleave, so there is no
    // "hover vs. held-button" ambiguity to resolve the way a continuous
    // paint trail has.
    if (eventDragRef.current) {
      const cell = rawBlockAt(e);
      setDragPreview({ kind: eventDragRef.current.kind, index: eventDragRef.current.index, x: cell.x, y: cell.y });
      return;
    }
    // A pencil (or collision -- Task 12: painting collision by dragging
    // mirrors pencil's own trail, the natural expectation) drag paints a
    // trail as the mouse moves while the button is held -- jsdom's
    // synthetic mouseMove never sets `e.buttons` the way a real held-button
    // drag does (Step 9's teeth-proof), so this guard is exercised for real
    // only in a live browser, not by this file's own tests.
    if (editSession && (activeTool?.kind === "pencil" || activeTool?.kind === "collision") && rectStartRef.current === null && e.buttons === 1) {
      const cell = blockAt(e);
      if (cell) paintAt(cell.x, cell.y);
      return;
    }
    if (dragRef.current) {
      const d = dragRef.current;
      setPan({ x: d.panX + (e.clientX - d.x), y: d.panY + (e.clientY - d.y) });
    } else {
      hoverAt(e.clientX, e.clientY);
    }
  };

  /**
   * Ends whatever paint stroke onMouseDown opened -- shared by a normal
   * mouse-up and by onMouseLeave's own mirrored cleanup below, since a
   * drag that leaves the canvas before releasing the button never fires
   * React's own onMouseUp at all (Important review fix: without this
   * mirroring, that left the server-side session's stroke open
   * indefinitely -- the NEXT stroke's begin() does not override an
   * already-open one, by design, see paintRoutes.test.ts's own stray-
   * double-begin test -- so two unrelated edits would get squashed into
   * one undo step).
   *
   * `end` is the finishing cell for a rect; null from onMouseLeave, which
   * has no reliable finishing cell of its own -- an in-progress rect is
   * simply abandoned unpainted (nothing was ever applied for it, unlike
   * pencil/bucket which paint progressively) rather than guessed at from
   * wherever the cursor happened to exit.
   *
   * Critical review fix: this waits for `pendingPaintRef` -- which is
   * ALSO what onMouseDown's own beginStroke().then() chain populates --
   * before reading `rectStartRef.current` at all. The bug this closes,
   * reproduced live by review: a fast rect mousedown-then-mouseup could
   * reach here BEFORE that chain's callback had run, so `rectStartRef`
   * was still null, this fell into the "else" branch, and `applyPaint`
   * for the rect never fired at all -- not just left out of undo like the
   * pencil/bucket race, but silently dropped entirely, with no error.
   * Waiting on `pendingPaintRef` first guarantees the chain's callback
   * (which sets `rectStartRef`, or paints via `paintAt` for pencil/
   * bucket) has already run by the time this checks it -- see
   * `MapCanvas.test.tsx`'s own race-repro test for the deterministic
   * version of this, using a controlled, delayed `beginStroke` promise.
   */
  const endActiveStroke = (end: { x: number; y: number } | null) => {
    if (!editSession) return;
    strokeOpenRef.current = false;
    void pendingPaintRef.current.catch(() => {}).then(() => {
      if (activeTool?.kind === "rect" && rectStartRef.current && end) {
        const start = rectStartRef.current;
        rectStartRef.current = null;
        const applied = editSession
          .applyPaint({ tool: "rect", x0: start.x, y0: start.y, x1: end.x, y1: end.y, stamp: activeTool.stamp, origin: start })
          // Matches the pencil/bucket path just below: a rejected apply
          // must not leave the stroke stuck open forever.
          .catch(() => {});
        pendingPaintRef.current = applied;
        void applied.then(() => editSession.endStroke());
      } else {
        rectStartRef.current = null;
        void editSession.endStroke();
      }
    });
  };

  const onMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Task 14: ends an event-marker drag. Critical fix (this task's own
    // teeth-proof, Step 8, confirms it): `kind`/`index`/start `x`/`y` are
    // destructured into LOCAL consts BEFORE `eventDragRef.current` is set
    // to null, not read from the ref afterward -- reading a ref after
    // nulling it is exactly the stale-read mistake class Task 11's
    // endActiveStroke/pendingPaintRef pair exists to avoid on the paint
    // side (see that function's own doc comment above). Reads the mouseup
    // EVENT's own coordinates (rawBlockAt(e)), the same pattern rect's own
    // paint path already uses at mouseup (endActiveStroke(rawBlockAt(e))
    // just below) -- a real mouseup always carries accurate clientX/clientY
    // for wherever the cursor actually released, so there is no need for a
    // second "last known position" source of truth alongside dragPreview.
    if (eventDragRef.current) {
      const cell = rawBlockAt(e);
      const { kind, index, x: ox, y: oy } = eventDragRef.current;
      eventDragRef.current = null;
      setDragPreview(null);
      if (cell.x !== ox || cell.y !== oy) onMoveEvent?.({ kind, index, x: cell.x, y: cell.y });
      return;
    }
    if (editSession && activeTool) {
      endActiveStroke(rawBlockAt(e)); // unclamped -- see rawBlockAt's own doc comment
      return;
    }
    dragRef.current = null;
  };

  const onMouseLeave = () => {
    dragRef.current = null;
    setHover(null);
    // Task 14: mirrors onMouseUp's own event-drag cleanup for the same
    // reason the paint path mirrors it just below -- a drag that exits the
    // canvas before releasing the button never fires React's own
    // onMouseUp. Abandoned at wherever it was, not committed: there is no
    // reliable "final" cell to move to from a mouse-LEAVE (same posture
    // endActiveStroke(null) already takes for an abandoned rect).
    if (eventDragRef.current) {
      eventDragRef.current = null;
      setDragPreview(null);
    }
    if (editSession && activeTool && strokeOpenRef.current) endActiveStroke(null);
  };

  const imageUrl = `/api/render/${encodeURIComponent(mapName)}.png?border=${BORDER_RINGS}`;
  const anyOverlay = toggles.grid || showCollision || toggles.elevation || toggles.events;

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
          {showCollision && (
            <span className="map-canvas__legend-item" data-testid="collision-overlay" data-visible={showCollision}>
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
