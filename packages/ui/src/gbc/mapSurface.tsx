import { useMemo } from "react";
import type { RGBA } from "@pokemap/core/src/render/raster.js";
import { drawGbcGrid, drawGbcCollision, drawGbcEvents, gbcStepInfo, type GbcQuadrantInfo, type GbcQuadrantKey, type GbcStepInfo } from "@pokemap/core/src/gbc/render/overlays.js";
import type { GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";
import type { GbcMapEvents } from "@pokemap/core/src/gbc/model/types.js";
import type { GbcStamp } from "@pokemap/core/src/gbc/edit/paint.js";
import type { GbcEventKind } from "@pokemap/core/src/gbc/edit/events.js";
import type { GbcPaintBody, UseGbcEditSessionResult } from "./hooks/useGbcEditSession.js";
import type { GbcActiveTool, GbcEventRef } from "./GbcMapCanvas.js";
import type { GbcTimeOfDay } from "./time.js";
import type { MapSurfaceAdapter } from "../canvas/mapSurfaceAdapter.js";
import { EventsLegendItems } from "../shared/LegendBar.js";
import { BORDER_BAND, borderSideFromConnections } from "../encounters/borderSide.js";

const BORDER_RINGS = 1;
/** Native px per world unit (one block) -- the encounter border's own scale, and what its band is measured in. */
const BLOCK_PX = 32;
/** The composite px of the map's top-left block (the border ring), on both axes: what the World view's in-context
 *  overlay aligns the composite by. Derived from the ring count, never a literal. */
export const GBC_COMPOSITE_ORIGIN = BORDER_RINGS * BLOCK_PX;

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
 * render's own origin. Compatibility export for callers/tests importing
 * GbcMapCanvas; the runtime MapSurface path uses shared cell helpers and
 * source-pixel hoverAt instead. Pure math remains directly testable against
 * a mocked getBoundingClientRect without a full mount+mousemove.
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


export function useGbcMapSurface(payload: GbcMapPayload, time: GbcTimeOfDay, editSession?: UseGbcEditSessionResult): MapSurfaceAdapter<GbcActiveTool, GbcPaintBody, GbcEventRef, GbcStamp, GbcStepInfo> {
  // The session's live blocks/events win once a session exists; the adapter callbacks below read the merged `data` by name and
  // never need to know which source it came from (the trick of `MapCanvas.tsx:215-228`).
  const sessionBlocks = editSession?.blocks;
  const sessionEvents = editSession?.events;
  const data = useMemo<GbcMapPayload>(
    () => (sessionBlocks && sessionEvents ? { ...payload, blocks: sessionBlocks, events: sessionEvents } : payload),
    [payload, sessionBlocks, sessionEvents],
  );
  const { layout } = data;
  const originX = GBC_COMPOSITE_ORIGIN;
  const originY = GBC_COMPOSITE_ORIGIN;
  const quadrantLabel = (key: GbcQuadrantKey, label: string, info: GbcQuadrantInfo, hovered: boolean) => {
    const text = formatQuadrant(label, info);
    return hovered ? <strong key={key}>{text}</strong> : <span key={key}>{text}</span>;
  };
  return {
    className: "gbc-map-canvas",
    // GBC paints 32px blocks, but collision quadrants, events and signs use a separate 16px step grid.
    // Unlike GBA there is no per-block elevation; the composite includes fixed 32px border rings.
    geometry: { pixelWidth: (layout.width + 2 * BORDER_RINGS) * BLOCK_PX,
      pixelHeight: (layout.height + 2 * BORDER_RINGS) * BLOCK_PX, origin: { x: originX, y: originY },
      paintCellPx: BLOCK_PX, eventCellPx: 16, width: layout.width, height: layout.height },
    blocks: data.blocks,
    // GBA's session reseeds blocks in a later tick and skips that first change. GBC derives its seed
    // during render: skipping a change here would swallow the first real paint (P12-8).
    skipFirstBlocksChange: false,
    // MapSurface debounces same-map block changes and retains a monotonic cache version across visits.
    // It passes zero without a session; omitting v at zero preserves the exact unpainted/read-only URL.
    imageUrl: (mapName, paintVersion) => `/api/render/${encodeURIComponent(mapName)}.png?border=${BORDER_RINGS}&time=${time}${paintVersion > 0 ? `&v=${paintVersion}` : ""}`,
    // Each layer declares every captured changing raster input; origins are module constants.
    // useRasterComposite compares deps by value, not fresh closure/array identity. DOM-only encounters
    // are absent from these deps so toggling them cannot destructively recomposite overlay pixels.
    overlays: [
      { key: "grid", label: "Grid", deps: [layout.width, layout.height],
        legend: <span className="map-canvas__legend-item"><i className="map-canvas__swatch map-canvas__swatch--grid" /> Grid</span>,
        draw: (raster) => drawGbcGrid(raster, originX, originY, layout.width, layout.height) },
      { key: "collision", label: "Collision", deps: [data],
        legend: <><span className="map-canvas__legend-item"><i className="map-canvas__swatch map-canvas__swatch--collision" /> Wall</span>
          <span className="map-canvas__legend-item"><i className="map-canvas__swatch map-canvas__swatch--water" /> Water</span></>,
        draw: (raster) => drawGbcCollision(raster, originX, originY, data, {
          wall: resolveOverlayColor("--overlay-collision", "rgba(220, 40, 40, 0.55)"),
          water: resolveOverlayColor("--encounter-water", "#06b6d4"),
        }) },
      { key: "events", label: "Events", deps: [data.events, layout.width, layout.height], legend: <EventsLegendItems />,
        draw: (raster) => drawGbcEvents(raster, originX, originY, data.events, 2 * layout.width, 2 * layout.height, {
          object: resolveOverlayColor("--event-object", "#3ccb5a"),
          warp: resolveOverlayColor("--event-warp", "#f0be28"),
          coord: resolveOverlayColor("--event-coord", "#c850f0"),
          bg: resolveOverlayColor("--event-bg", "#3ca0f0"),
        }) },
    ],
    // Intrinsic quadrant/event data is independent of overlay visibility: gbcStepInfo reads the payload
    // and hovered 16px step even while Collision/Events are off.
    hoverAt: (source) => gbcStepInfo(data, Math.floor((source.x - originX) / 16), Math.floor((source.y - originY) / 16)),
    statusItems: (hover) => [
      { key: "tileset", content: <>tileset {data.tileset.constName} &middot; {data.metatileCount} metatiles &middot; {layout.width}&times;{layout.height}</> },
      { key: "hover", className: `map-canvas__hover${hover ? "" : " map-canvas__hover--empty"}`, content: hover ? <>
        ({hover.bx}, {hover.by}) step ({hover.sx}, {hover.sy}) id {hex(hover.metatileId)}
        {hover.rendersAsBorder ? ` (renders as border ${hex(hover.border)})` : ""} &middot;{" "}
        {quadrantLabel("tl", "TL", hover.quadrants.tl, hover.quadrant === "tl")} &middot;{" "}
        {quadrantLabel("tr", "TR", hover.quadrants.tr, hover.quadrant === "tr")} &middot;{" "}
        {quadrantLabel("bl", "BL", hover.quadrants.bl, hover.quadrant === "bl")} &middot;{" "}
        {quadrantLabel("br", "BR", hover.quadrants.br, hover.quadrant === "br")}
        {hover.events.map((e) => ` \u00b7 ${e.kind} #${e.index} ${e.label}`).join("")}
      </> : <>Hover the map&hellip;</> },
    ],
    /** The apply body a pencil/bucket stroke sends at a block; null when there is nothing to send. rect/shift are applied once, at mouseup. */
    paintBody: (tool, cell) => {
      if (!tool.stamp) return null;
      if (tool.kind === "pencil") return { tool: "pencil", targets: [cell], stamp: tool.stamp, origin: cell };
      if (tool.kind === "bucket") {
        const first = tool.stamp.cells[0];
        if (!first) return null; // nothing sensible to fill with
        return { tool: "bucket", ...cell, replacement: { metatileId: first.metatileId } };
      }
      return null;
    },
    finishBody: (tool, start, end) => {
      if (tool.kind === "shift") return { tool: "shift", dx: end.x - start.x, dy: end.y - start.y };
      if (tool.kind === "rect" && tool.stamp) return { tool: "rect", x0: start.x, y0: start.y, x1: end.x, y1: end.y, stamp: tool.stamp, origin: start };
      return null;
    },
    findEventAt: (cell) => findEventAt(data.events, cell.x, cell.y),
    eventPosition: (event) => eventPosition(data.events, event),
    dropperStamp: (cell) => {
      const block = data.blocks[cell.y * layout.width + cell.x];
      return block ? { width: 1, height: 1, cells: [{ metatileId: block.metatileId }] } : null;
    },
    // Encounter border side (B4): the first of left, top, right, bottom with no connection (GBC's
    // directions are already compass names).
    encounters: { family: "gbc", side: borderSideFromConnections(new Set(data.map.connections.map((c) => c.direction))),
      band: BORDER_BAND.gbc, unitPx: BLOCK_PX, time,
      legendHint: `Encounters: hover or focus a sprite; dimmed = not at ${time}, + = level can roll up to 4 higher` },
  };
}
