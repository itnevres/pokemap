import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RGBA } from "@pokemap/core/src/render/raster.js";
import { drawGbcGrid, drawGbcCollision, drawGbcEvents, gbcStepInfo, type GbcQuadrantInfo, type GbcQuadrantKey, type GbcStepInfo } from "@pokemap/core/src/gbc/render/overlays.js";
import type { GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";
import type { GbcMapEvents } from "@pokemap/core/src/gbc/model/types.js";
import type { GbcStamp } from "@pokemap/core/src/gbc/edit/paint.js";
import type { GbcEventKind } from "@pokemap/core/src/gbc/edit/events.js";
import type { GbcPaintBody, UseGbcEditSessionResult } from "./hooks/useGbcEditSession.js";
import { useStrokeChain } from "../shared/useStrokeChain.js";
import { useFitShortcut } from "../shared/useFitShortcut.js";
import type { SettledChain } from "../shared/useStrokeChain.js";
import type { GbcTimeOfDay } from "./time.js";
import { EncounterBorder, type EncounterBorderEntry } from "../components/EncounterBorder.js";
import { BORDER_BAND, borderSideFromConnections } from "../encounters/borderSide.js";
import { fitWithBand } from "../encounters/fit.js";
import { useMapEncounterSummaries } from "../encounters/useMapEncounterSummaries.js";
import { ZOOM_LEVELS, zoomAboutPivot, type MapView, type Zoom } from "../components/mapView.js";

/**
 * The GBC map view (Plan 6b Task 4: read-only; Plan 7 Task 5 added the optional editing props, see below). Plan Q2 accepts this as a
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
 * **One divergence from `MapCanvas.tsx` (as of Plan 6b; since closed), deliberate
 * (fix round, spec review finding 1):** `MapCanvas.tsx`'s own `applyZoom` then
 * nested a `setPan` call inside a `setZoom` updater function. React's `<StrictMode>` (which
 * `main.tsx` wraps the whole app in) double-invokes updater functions in
 * development to surface exactly this kind of impurity -- the nested
 * `setPan` fires twice, so the pan transform is applied twice, landing 2x
 * off-centre and going fully off-canvas (blank) at 4x on every map, not just
 * a large one. This file keeps ONE `view: { zoom, pan }` state updated by a
 * single, pure `zoomAboutPivot`, so StrictMode's double-invoke is harmless --
 * it is the standard fix for this exact class of bug. GBA had the same bug
 * and was fixed the same way in Plan 6c E1; both canvases now share
 * `components/mapView.ts` (`zoomAboutPivot` is re-exported below and
 * unit-tested in this canvas's own test file).
 *
 * **Editing (Plan 7 Task 5), all optional and additive** -- with none of the editing props the component is the
 * read-only view above, byte for byte (its image URL included). The paint chain is ported from `MapCanvas.tsx`,
 * not improvised; each piece below cites its postmortem:
 * - `pendingPaintRef` / `beginStroke().then(...)` / `endActiveStroke` awaiting it (`MapCanvas.tsx:242-269`,
 *   `796-857`): a fast click's mouseup must not put `endStroke` on the wire before the begin-then-apply chain.
 * - Captured rect/shift start, applied once at mouseup; `mouseleave` ends the stroke (`MapCanvas.tsx:892-906`).
 * - `paintVersion`, debounced, folded into the image URL as `&v=` only while a session exists
 *   (`MapCanvas.tsx:147-155`, `292-347`, `416-420`). One deliberate change: GBA's `skipNextBumpRef` swallows the
 *   first `blocks` change because its session hook re-seeds in a later tick; `useGbcEditSession` derives its seed
 *   at render, so there is no such tick and the same flag would swallow the first real paint. A map switch is
 *   excluded by comparing the previous map name instead. `v=` is also omitted while it is 0, so an unpainted map
 *   requests the exact read-only URL.
 * - Event select/drag precedence is `MapCanvas.tsx:712-761`: left button only; with no tool an event under the
 *   cursor is selected and dragged, else the click falls through to pan; the dropper only reads; any other tool
 *   opens a stroke.
 * Units: paint targets are BLOCKS (32 px); event hit-testing and moves are STEPS (16 px, `clientToStep`).
 *
 * Unlike GBA, hover does NOT depend on which overlays are toggled on:
 * `gbcStepInfo` is a pure function of the payload and the hovered step,
 * independent of `toggles` -- the status strip always shows the real
 * quadrant/event data under the cursor, whether or not Collision/Events are
 * currently painted.
 */

const BORDER_RINGS = 1;
/** Native px per world unit (one block) -- the encounter border's own scale, and what its band is measured in. */
const BLOCK_PX = 32;
/** The composite px of the map's top-left block (the border ring), on both axes: what the World view's in-context
 *  overlay aligns the composite by. Derived from the ring count, never a literal. */
export const GBC_COMPOSITE_ORIGIN = BORDER_RINGS * BLOCK_PX;

/** The canvas's whole pan/zoom state, updated as ONE value (fix round, spec
 *  review finding 1) -- see the header comment for why this replaced two
 *  separate `zoom`/`pan` state variables. Shared with `MapCanvas` (Plan 6c E1). */
export type GbcView = MapView;
export { zoomAboutPivot };

interface Toggles {
  grid: boolean;
  collision: boolean;
  events: boolean;
}
const NO_TOGGLES: Toggles = { grid: false, collision: false, events: false };

/** A bare pointer at one event -- selection is the parent's, resolved against the live events. */
export interface GbcEventRef {
  kind: GbcEventKind;
  index: number;
}

export type GbcActiveTool = { kind: "pencil" | "rect" | "bucket" | "shift" | "dropper"; stamp?: GbcStamp };

/** Debounce for the `&v=` bump: a stroke yields several fresh `blocks` arrays (see `MapCanvas.tsx:147-155`). */
const PAINT_VERSION_DEBOUNCE_MS = 200;

/** First event on step (sx,sy), scanning object, warp, coord, bg (the order and rationale of `MapCanvas.tsx:27-53`). */
function findEventAt(events: GbcMapEvents, sx: number, sy: number): GbcEventRef | null {
  const lists: [GbcEventKind, { x: number; y: number }[]][] = [["object", events.objects], ["warp", events.warps], ["coord", events.coords], ["bg", events.bgs]];
  for (const [kind, list] of lists) {
    const index = list.findIndex((e) => e.x === sx && e.y === sy);
    if (index !== -1) return { kind, index };
  }
  return null;
}

function eventPosition(events: GbcMapEvents, ref: GbcEventRef | null | undefined): { x: number; y: number } | null {
  if (!ref) return null;
  const list = ref.kind === "object" ? events.objects : ref.kind === "warp" ? events.warps : ref.kind === "coord" ? events.coords : events.bgs;
  const e = list[ref.index];
  return e ? { x: e.x, y: e.y } : null;
}

export interface GbcMapCanvasProps {
  onStrokeChain?: (chain: SettledChain, mounted: boolean) => void;
  mapName: string;
  data: GbcMapPayload;
  time: GbcTimeOfDay;
  /** Present once editing is mounted for this map. Its blocks and events win over `data`'s for drawing, hover
   *  and the dropper. Absent: the read-only view. */
  editSession?: UseGbcEditSessionResult;
  activeTool?: GbcActiveTool | null;
  /** Dropper: fired with the clicked block's id as a 1x1 stamp. */
  onDropperPick?: (stamp: GbcStamp) => void;
  /** The selected event, for the selection ring only (the hit test always re-derives from the click). */
  selectedEvent?: GbcEventRef | null;
  /** Fires with the hit event, or `null` on a click that hits nothing. Engaged only with no active tool. */
  onSelectEvent?: (ref: GbcEventRef | null) => void;
  /** Once, on mouseup, with the event's dropped STEP -- never per mousemove. */
  onMoveEvent?: (next: { kind: GbcEventKind; index: number; x: number; y: number }) => void;
  /** A failed paint request's message, for the parent's error banner. */
  onEditError?: (message: string) => void;
  /** Fired with the hovered block's metatile id, or `null` on leave -- drives
   *  `GbcMetatilePalette`'s highlight. */
  hoveredMetatile?: (id: number | null) => void;
  /** Controlled pan/zoom (Plan 7 Task 5b, as `MapCanvas`'s E1 prop). When present the canvas renders exactly this
   *  view, owns no view state, and never auto-fits on image load: a gesture reports the view it would produce
   *  through `onViewChange` instead of applying it. Do not switch between controlled and uncontrolled in one mount. */
  view?: GbcView;
  onViewChange?: (next: GbcView) => void;
  /** Hides the toolbar, legend and status strip (root modifier `map-canvas--chromeless`), so the stage box equals the
   *  root box. Used by the World view's in-context overlay. Painting is unchanged. */
  chromeless?: boolean;
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
 * Pure status-strip text for one quadrant: `<label> <name>` plus an optional
 * `(category[, talk])` suffix. Exported and table-tested directly (fix
 * round, spec review findings 5/7 -- previously this logic lived inline in
 * JSX and was only exercised through 3 full mount+mouseMove tests).
 *
 * Wording fix (spec review finding 7): the ORIGINAL rule ("append the
 * category whenever it isn't land") reads redundant for the common case --
 * a metatile literally named `COLL_WALL` categorised `wall` printed
 * `WALL wall`. The category is now dropped when the display NAME already
 * says it, case-insensitively (`WALL` + `wall` -> just `WALL`), and kept
 * otherwise, where it is genuinely informative (`BUOY` + `wall` ->
 * `BUOY (wall)`, since nothing about "BUOY" says "wall"). `land` never
 * shows a category at all, matching every prior version of this rule --
 * `FLOOR`/`land` would otherwise print on nearly every ordinary hover.
 * `talk` is never redundant with the name (it is independent information,
 * "this tile also fires a script"), so it is always appended when true,
 * even alongside a dropped category, e.g. a hypothetical talking land tile
 * would read `NAME (talk)`.
 */
export function formatQuadrant(label: string, info: GbcQuadrantInfo): string {
  const name = info.name ? shortCollisionName(info.name) : hex(info.value);
  const parts: string[] = [];
  if (info.category !== "land" && name.toLowerCase() !== info.category) parts.push(info.category);
  if (info.talk) parts.push("talk");
  return parts.length > 0 ? `${label} ${name} (${parts.join(", ")})` : `${label} ${name}`;
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
 *  hex-only token (6 or 3 digit) gets this fixed alpha instead, roughly
 *  matching `--overlay-collision`'s own ~0.55 (140/255 = 0.549). An 8-digit
 *  hex token's own trailing alpha byte is used as-is instead. */
const HEX_TOKEN_ALPHA = 140;

/** Fix round (spec review finding 12): an unparsable token used to return
 *  fully transparent, which is a SILENT no-tint -- a broken/renamed CSS
 *  variable would make an overlay quietly paint nothing, with no visible
 *  signal anything was wrong. Opaque magenta at the same fixed alpha as
 *  every other hex fallback is impossible to miss instead, the same
 *  "unmistakable, not invisible" convention `render/map.ts`'s own
 *  out-of-range `PLACEHOLDER` color already uses for a different broken
 *  case. This file's own jsdom tests never load a real stylesheet, so this
 *  path IS exercised there (and asserted on) -- it isn't only a live-app
 *  concern. */
const FALLBACK_COLOR: RGBA = { r: 255, g: 0, b: 255, a: HEX_TOKEN_ALPHA };

export function parseColorToken(value: string): RGBA {
  const v = value.trim();
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(v);
  if (rgba) {
    const [, r, g, b, a] = rgba;
    return { r: Number(r), g: Number(g), b: Number(b), a: a !== undefined ? Math.round(Number(a) * 255) : HEX_TOKEN_ALPHA };
  }
  const hex8 = /^#([0-9a-fA-F]{8})$/.exec(v);
  if (hex8) {
    const h = hex8[1]!;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: parseInt(h.slice(6, 8), 16) };
  }
  const hex6 = /^#([0-9a-fA-F]{6})$/.exec(v);
  if (hex6) {
    const h = hex6[1]!;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: HEX_TOKEN_ALPHA };
  }
  const hex3 = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(v);
  if (hex3) {
    const double = (c: string) => parseInt(c + c, 16);
    return { r: double(hex3[1]!), g: double(hex3[2]!), b: double(hex3[3]!), a: HEX_TOKEN_ALPHA };
  }
  return FALLBACK_COLOR;
}

export function GbcMapCanvas({ mapName, data: payload, time, hoveredMetatile, editSession, activeTool, onDropperPick, selectedEvent, onSelectEvent, onMoveEvent, onEditError, view: controlledView, onViewChange, chromeless, onStrokeChain }: GbcMapCanvasProps) {
  const { layout } = payload;
  // The session's live blocks/events win once a session exists; every effect below reads `data` by name and
  // never needs to know which source it came from (the trick of `MapCanvas.tsx:215-228`).
  const sessionBlocks = editSession?.blocks;
  const sessionEvents = editSession?.events;
  const data = useMemo<GbcMapPayload>(
    () => (sessionBlocks && sessionEvents ? { ...payload, blocks: sessionBlocks, events: sessionEvents } : payload),
    [payload, sessionBlocks, sessionEvents],
  );

  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  // Completion chain for begin, every queued apply and end (shared with the GBA canvas); the start cell of an
  // open rect/shift stroke is captured at mousedown.
  const chain = useStrokeChain<GbcPaintBody>(mapName, (message) => onEditError?.(message));
  useEffect(() => {
    onStrokeChain?.(chain, true);
    return () => onStrokeChain?.(chain, false);
  }, [chain, onStrokeChain]);
  const strokeStartRef = useRef<{ x: number; y: number } | null>(null);
  // The last block a pencil stroke painted: a held drag fires many mousemoves per block, and each would be a
  // parallel POST. Reset when the stroke ends.
  const lastCellRef = useRef<string | null>(null);
  // An event-marker drag in progress: its identity and the STEP it started on (MapCanvas.tsx:270-280).
  const eventDragRef = useRef<{ kind: GbcEventKind; index: number; x: number; y: number } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number } | null>(null);
  const [paintVersion, setPaintVersion] = useState(0);
  const paintVersionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevBlocksRef = useRef({ mapName, blocks: data.blocks });

  const [loadedImageUrl, setLoadedImageUrl] = useState<string | null>(null);
  const [toggles, setToggles] = useState<Toggles>(NO_TOGGLES);
  // The encounter border toggle (B4) is DOM over the viewport, not a canvas overlay, so it is not in
  // `Toggles`. It remembers WHICH map it was turned on for: a map switch reads as off in the very first
  // render (no fetch for the new map, no stale border), with no reset effect needed.
  const [encountersFor, setEncountersFor] = useState<string | null>(null);
  const encountersOn = encountersFor === mapName;
  // ONE view value (never a setter inside an updater). Controlled: `next` is computed OUTSIDE any updater from the
  // latest `view` prop and reported (a no-op result is not); uncontrolled: set state (MapCanvas.tsx's E1 pattern).
  const [ownView, setOwnView] = useState<GbcView>({ zoom: 1, pan: { x: 0, y: 0 } });
  const controlled = controlledView !== undefined;
  const view = controlledView ?? ownView;
  const { zoom, pan } = view;
  const viewRef = useRef(view);
  viewRef.current = view;
  // Through a ref so an inline callback never changes `updateView`'s identity (it would re-create `fit`).
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  const updateView = useCallback(
    (next: GbcView | ((v: GbcView) => GbcView)) => {
      if (!controlled) return setOwnView(next);
      const n = typeof next === "function" ? next(viewRef.current) : next;
      if (n !== viewRef.current) onViewChangeRef.current?.(n);
    },
    [controlled],
  );
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
  const originX = GBC_COMPOSITE_ORIGIN;
  const originY = GBC_COMPOSITE_ORIGIN;

  // Encounter border side (B4): the first of left, top, right, bottom with no connection (GBC's
  // directions are already compass names).
  const connections = data.map.connections;
  const side = useMemo(() => borderSideFromConnections(new Set(connections.map((c) => c.direction))), [connections]);
  const { summaries: encounterSummaries, error: encounterError } = useMapEncounterSummaries(mapName, "gbc", encountersOn);

  // `v=` only with a session and only once something was painted: a read-only viewer never needs a cache-bust,
  // and an unpainted map keeps today's exact URL (MapCanvas.tsx:416-420).
  const imageUrl = `/api/render/${encodeURIComponent(mapName)}.png?border=${BORDER_RINGS}&time=${time}${editSession && paintVersion > 0 ? `&v=${paintVersion}` : ""}`;
  const imgLoaded = loadedImageUrl === imageUrl;

  // Debounced bump when the blocks change for the SAME map (a real edit, undo, discard or a refetched payload).
  // paintVersion is deliberately never reset (MapCanvas.tsx:315-324: "same URL => same content" stays structural).
  useEffect(() => {
    const prev = prevBlocksRef.current;
    prevBlocksRef.current = { mapName, blocks: data.blocks };
    if (prev.mapName !== mapName) {
      if (paintVersionTimerRef.current) clearTimeout(paintVersionTimerRef.current);
      paintVersionTimerRef.current = null;
      return;
    }
    if (prev.blocks === data.blocks || !editSession) return;
    if (paintVersionTimerRef.current) clearTimeout(paintVersionTimerRef.current);
    paintVersionTimerRef.current = setTimeout(() => setPaintVersion((v) => v + 1), PAINT_VERSION_DEBOUNCE_MS);
    // editSession is read only as a presence flag; the blocks identity is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapName, data.blocks]);
  useEffect(() => () => {
    if (paintVersionTimerRef.current) clearTimeout(paintVersionTimerRef.current);
  }, []);

  // Fresh overlays/hover on a real map switch -- mirrors MapCanvas.tsx:371-374.
  useEffect(() => {
    setToggles(NO_TOGGLES);
    strokeStartRef.current = null; // the chain retires the stroke itself (useStrokeChain)
    lastCellRef.current = null;
    setEncountersFor(null); // only so A -> B -> A does not bring A's border back; B is already off without it
    setHover(null);
    hoveredMetatile?.(null);
    // hoveredMetatile is intentionally excluded: it is a plain prop
    // callback, not state this effect reads, and including it would re-run
    // (and re-clear the hover the player is mid-hovering) on every parent
    // re-render that passes a fresh inline function, not only on a real
    // map switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapName]);

  // Read THIS URL's mounted image: a cached image may already be decoded before its load event is observed.
  // An unconditional false here can also overwrite an early onLoad and strand the composite until another load.
  // Incomplete/failed images still wait for the normal load path (naturalWidth excludes complete-but-broken images).
  useEffect(() => {
    const img = imgRef.current;
    setLoadedImageUrl(img?.complete === true && img.naturalWidth > 0 ? imageUrl : null);
  }, [imageUrl]);

  const fit = useCallback(() => {
    const vw = viewport.w || pixelWidth;
    const vh = viewport.h || pixelHeight;
    // Encounters on: the content is the image plus one band on the border's side, so the sprites fit too.
    updateView(
      fitWithBand({
        pw: pixelWidth,
        ph: pixelHeight,
        vw,
        vh,
        levels: ZOOM_LEVELS,
        bandNative: encountersOn ? BORDER_BAND.gbc * BLOCK_PX : 0,
        side,
      }),
    );
  }, [pixelWidth, pixelHeight, viewport, encountersOn, side, updateView]);
  useFitShortcut(fit, !chromeless);

  // Once per real map open -- NOT on a time switch, which reuses the same
  // imgLoaded false->true cycle (MapCanvas.tsx:401-416's own fittedForMapRef
  // pattern, keyed on mapName alone).
  const fittedForMapRef = useRef<string | null>(null);
  useEffect(() => {
    if (imgLoaded && fittedForMapRef.current !== mapName) {
      if (!controlled) fit(); // controlled: the parent owns placement, no auto-fit
      fittedForMapRef.current = mapName;
    }
    // `fit` is intentionally excluded: it is a NEW function identity on
    // every render (a `useCallback` over `viewport`/`pixelWidth`/
    // `pixelHeight`), and this effect must run only when `imgLoaded` or
    // `mapName` actually change -- including `fit` would defeat the whole
    // "once per real map open" guard this effect exists for (a later
    // viewport resize would otherwise re-fit and reset the player's zoom).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgLoaded, mapName]);

  const onImgLoad = () => setLoadedImageUrl(imageUrl);

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
    // `anyOverlay` is intentionally excluded: it is a plain local
    // (`toggles.grid || toggles.collision || toggles.events`), deterministically
    // derived from the individual canvas-overlay flags listed below (not the whole
    // `toggles` object, so the DOM-only Encounters toggle never recomposites) -- it is not a
    // separately-changing dependency this effect could miss, just a
    // convenience name for a value already covered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgLoaded, toggles.grid, toggles.collision, toggles.events, data, pixelWidth, pixelHeight, originX, originY]);

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

    // Selection ring / drag preview: ephemeral, on the stage canvas only (MapCanvas.tsx:559-590), one STEP square.
    // The drag candidate wins over the static ring: it is where the event is about to land.
    const highlight = dragPreview ?? eventPosition(data.events, selectedEvent);
    if (highlight) {
      const size = 16 * zoom;
      const color = getComputedStyle(document.documentElement).getPropertyValue("--overlay-selection").trim() || "#22d3ee";
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = dragPreview ? "#ffffff" : color;
      ctx.strokeRect(pan.x + (originX + highlight.x * 16) * zoom + 1, pan.y + (originY + highlight.y * 16) * zoom + 1, size - 2, size - 2);
      ctx.restore();
    }
  }, [compositeVersion, zoom, pan, pixelWidth, pixelHeight, viewport, dragPreview, selectedEvent, data.events, originX, originY]);

  const toggle = (key: keyof Toggles) => setToggles((t) => ({ ...t, [key]: !t[key] }));

  // The drawn image, border ring included, in viewport px: sprites never cover map or border-block pixels.
  // Memoised so EncounterBorder's tooltip-clearing effect (keyed on `entries`) only fires when something moved.
  const borderEntries = useMemo<EncounterBorderEntry[]>(
    () => [{ map: mapName, rect: { x: pan.x, y: pan.y, width: pixelWidth * zoom, height: pixelHeight * zoom }, side, summaries: encounterSummaries }],
    [mapName, pan.x, pan.y, pixelWidth, pixelHeight, zoom, side, encounterSummaries],
  );

  const applyZoom = (next: Zoom, pivotX: number, pivotY: number) => updateView((v) => zoomAboutPivot(v, next, pivotX, pivotY));

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
    // `applyZoom` is intentionally excluded: it is a new function identity
    // on every render (not memoised), but it always calls the latest
    // `setView` updater regardless of when it was created, so re-running
    // this effect only on a real `zoom` change (to keep `idx` current) is
    // correct and avoids tearing down/re-attaching the native listener on
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, updateView]);

  const hoverAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { sx, sy } = clientToStep(clientX, clientY, rect, pan, zoom, originX, originY);
    const info = gbcStepInfo(data, sx, sy);
    setHover(info);
    hoveredMetatile?.(info ? info.metatileId : null);
  };

  /** Client -> block cell (32 px), unclamped: a rect's second corner may overshoot the edge (the server skips it). */
  const rawBlockAt = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.floor(((e.clientX - rect.left - pan.x) / zoom - originX) / BLOCK_PX),
      y: Math.floor(((e.clientY - rect.top - pan.y) / zoom - originY) / BLOCK_PX),
    };
  };
  /** Same, but null outside the layout -- a single-cell paint must not fire on a click off the map. */
  const blockAt = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    const c = rawBlockAt(e);
    return c.x < 0 || c.y < 0 || c.x >= layout.width || c.y >= layout.height ? null : c;
  };
  /** Client -> event step (16 px), through the real `clientToStep`. */
  const rawStepAt = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const { sx, sy } = clientToStep(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect(), pan, zoom, originX, originY);
    return { x: sx, y: sy };
  };

  /** The apply body a pencil/bucket stroke sends at a block; null when there is nothing to send. rect/shift are applied once, at mouseup. */
  const paintBody = (bx: number, by: number): GbcPaintBody | null => {
    if (!activeTool?.stamp) return null;
    if (activeTool.kind === "pencil") {
      return { tool: "pencil", targets: [{ x: bx, y: by }], stamp: activeTool.stamp, origin: { x: bx, y: by } };
    } else if (activeTool.kind === "bucket") {
      const cell = activeTool.stamp.cells[0];
      if (!cell) return null; // nothing sensible to fill with
      return { tool: "bucket", x: bx, y: by, replacement: { metatileId: cell.metatileId } };
    }
    return null;
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    // Ahead of the paint branch, and only with no active tool (MapCanvas.tsx:714-732). Unclamped on purpose:
    // a click just past the edge can still deselect. A miss falls through to the pan drag below.
    if (onSelectEvent && !activeTool) {
      const step = rawStepAt(e);
      const hit = findEventAt(data.events, step.x, step.y);
      onSelectEvent(hit);
      if (hit) {
        eventDragRef.current = { kind: hit.kind, index: hit.index, x: step.x, y: step.y };
        return;
      }
    }
    // Dropper: only READS a block; no stroke lifecycle (MapCanvas.tsx:733-743).
    if (editSession && activeTool?.kind === "dropper") {
      const cell = blockAt(e);
      const block = cell && data.blocks[cell.y * layout.width + cell.x];
      if (block) onDropperPick?.({ width: 1, height: 1, cells: [{ metatileId: block.metatileId }] });
      return;
    }
    if (editSession && activeTool) {
      const cell = blockAt(e);
      if (!cell) return;
      strokeStartRef.current = cell;
      lastCellRef.current = `${cell.x},${cell.y}`;
      chain.start(editSession, paintBody(cell.x, cell.y));
      return;
    }
    dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (eventDragRef.current) {
      setDragPreview(rawStepAt(e)); // local candidate only; onMoveEvent fires once, on mouseup
      return;
    }
    // A held pencil queues each new cell behind begin and every preceding apply round trip.
    if (editSession && activeTool?.kind === "pencil" && chain.isOpen() && e.buttons === 1) {
      const cell = blockAt(e);
      if (cell && lastCellRef.current !== `${cell.x},${cell.y}`) {
        lastCellRef.current = `${cell.x},${cell.y}`;
        const body = paintBody(cell.x, cell.y);
        if (body) chain.queue(body);
      }
      return;
    }
    if (dragRef.current) {
      const d = dragRef.current;
      updateView((v) => ({ ...v, pan: { x: d.panX + (e.clientX - d.x), y: d.panY + (e.clientY - d.y) } }));
    } else {
      hoverAt(e.clientX, e.clientY);
    }
  };

  /**
   * Ends whatever stroke onMouseDown opened -- shared by mouseup and by mouseleave (a drag that leaves the canvas
   * never fires onMouseUp, which used to leave the server's stroke open and squash two edits into one undo step).
   * `end` is the finishing block for rect/shift; null from mouseleave, which abandons an unapplied rect/shift.
   *
   * Append to the same completion chain using the captured start. End waits for every
   * apply round trip (not just its invocation), and a following stroke also waits for this end round trip.
   */
  const endActiveStroke = (end: { x: number; y: number } | null) => {
    if (!editSession || !chain.isOpen()) return;
    const start = strokeStartRef.current;
    strokeStartRef.current = null;
    lastCellRef.current = null;
    let last: GbcPaintBody | null = null;
    if (activeTool?.kind === "shift" && start && end) {
      last = { tool: "shift", dx: end.x - start.x, dy: end.y - start.y };
    } else if (activeTool?.kind === "rect" && activeTool.stamp && start && end) {
      last = { tool: "rect", x0: start.x, y0: start.y, x1: end.x, y1: end.y, stamp: activeTool.stamp, origin: start };
    }
    chain.finish(last);
  };

  const onMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Locals BEFORE the ref is nulled, never read after (the stale-ref mistake MapCanvas.tsx:860-871 postmortems).
    if (eventDragRef.current) {
      const step = rawStepAt(e);
      const { kind, index, x: ox, y: oy } = eventDragRef.current;
      eventDragRef.current = null;
      setDragPreview(null);
      if (step.x !== ox || step.y !== oy) onMoveEvent?.({ kind, index, x: step.x, y: step.y });
      return;
    }
    // The dropper never began a stroke, so it must not end one.
    if (editSession && activeTool && activeTool.kind !== "dropper") {
      endActiveStroke(rawBlockAt(e));
      return;
    }
    dragRef.current = null;
  };

  const onMouseLeave = () => {
    dragRef.current = null;
    setHover(null);
    hoveredMetatile?.(null);
    // A drag that exits is abandoned where it was, not committed (no reliable final cell).
    if (eventDragRef.current) {
      eventDragRef.current = null;
      setDragPreview(null);
    }
    if (editSession && activeTool && chain.isOpen()) endActiveStroke(null);
  };

  const quadrantLabel = (key: GbcQuadrantKey, label: string, info: GbcQuadrantInfo, hovered: boolean) => {
    const text = formatQuadrant(label, info);
    return hovered ? <strong key={key}>{text}</strong> : <span key={key}>{text}</span>;
  };

  return (
    <section className={`map-canvas gbc-map-canvas${chromeless ? " map-canvas--chromeless" : ""}`} aria-label={`${mapName} canvas`}>
      {!chromeless && <div className="map-canvas__toolbar">
        <div className="map-canvas__zoom" role="group" aria-label="Zoom">
          {ZOOM_LEVELS.map((z) => (
            <button key={z} type="button" className="map-canvas__btn" aria-pressed={zoom === z} onClick={() => applyZoom(z, ...centerPivot())}>
              {z}×
            </button>
          ))}
          <button type="button" className="map-canvas__btn" onClick={fit} title="Fit to screen (F)">
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
          <button type="button" className="map-canvas__btn" aria-pressed={encountersOn} onClick={() => setEncountersFor(encountersOn ? null : mapName)}>
            Encounters
          </button>
        </div>
      </div>}

      {!chromeless && (anyOverlay || encountersOn) && (
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
          {encountersOn &&
            (encounterError ? (
              <span className="map-canvas__legend-item" role="alert">
                {encounterError}
              </span>
            ) : (
              <span className="map-canvas__legend-item">
                {encounterSummaries?.length === 0
                  ? "Encounters: none on this map"
                  : `Encounters: hover or focus a sprite; dimmed = not at ${time}, + = level can roll up to 4 higher`}
              </span>
            ))}
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
        <EncounterBorder
          enabled={encountersOn}
          entries={borderEntries}
          zoom={zoom * BLOCK_PX}
          lodZoom={0}
          band={BORDER_BAND.gbc}
          time={time}
        />
      </div>

      {!chromeless && <div className="map-canvas__status">
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
      </div>}
    </section>
  );
}
