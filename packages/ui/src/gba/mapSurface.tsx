import { useRef } from "react";
import { drawGrid, drawCollision, drawElevation, drawEvents, type EventMark } from "@pokemap/core/src/render/overlays.js";
import type { LayoutRaster } from "@pokemap/core/src/render/layout.js";
import type { MapData } from "@pokemap/core/src/load/maps.js";
import type { EventKind } from "@pokemap/core/src/edit/events.js";
import { readBlock, type Stamp } from "@pokemap/core/src/edit/paint.js";
import type { PaintApplyBody } from "../hooks/useEditSession.js";
import type { MapCanvasProps, EventRef } from "../components/MapCanvas.js";
import type { MapSurfaceAdapter } from "../canvas/mapSurfaceAdapter.js";
import { eventAt, firstEventAt, type EventLists } from "../canvas/events.js";
import { EventsLegendItems } from "../shared/LegendBar.js";
import { BORDER_BAND, borderSideFromConnections, gbaDirToCompass, type CompassDir } from "../encounters/borderSide.js";

/** Ordered object, warp, coord, bg lists (the scan order of `firstEventAt`). */
const eventLists = (map: MapData): EventLists<EventKind> =>
  [["object", map.objectEvents], ["warp", map.warpEvents], ["coord", map.coordEvents], ["bg", map.bgEvents]];

/** The server-baked border ring the canvas always requests -- see
 *  `/api/render/:name.png?border=N` and Task 21's step 5. Must stay in sync
 *  with the query string below and with how `originX`/`originY` are derived
 *  from `layout.borderWidth`/`borderHeight`. */
const BORDER_RINGS = 1;

/** Native px per world unit (one metatile) -- the paint/event cell, the encounter border's scale, and what its band is measured in. */
const METATILE_PX = 16;

/** Composite px of the map's top-left tile (the border ring offsets it). */
export function compositeOrigin(layout: { borderWidth: number; borderHeight: number }): { x: number; y: number } {
  return { x: BORDER_RINGS * layout.borderWidth * METATILE_PX, y: BORDER_RINGS * layout.borderHeight * METATILE_PX };
}

const hex = (n: number) => `0x${n.toString(16)}`;

interface Hover {
  bx: number;
  by: number;
  metatileId: number;
  collision: number;
  elevation: number;
  behavior: number;
  mark?: EventMark;
}

export function useGbaMapSurface({ data, editSession, activeTool }: Pick<MapCanvasProps, "data" | "editSession" | "activeTool">): MapSurfaceAdapter<NonNullable<MapCanvasProps["activeTool"]>, PaintApplyBody, EventRef, Stamp, Hover> {
  const { layout, split, map: staticMap, blocks: staticBlocks } = data;
  // Live blocks/map while an edit session is open for this map, the static `data` otherwise; the callbacks below
  // read them by name. Event move/add/delete mutate `session.map`, so event marks must read the live map too.
  // `editSession.blocks` is core's `Block` and carries no resolved tile `behavior` (hoverAt falls back to 0).
  const blocks = editSession ? editSession.blocks : staticBlocks;
  const map = editSession?.map ?? staticMap;

  // Marks from the last events draw, keyed by map name so a map switch can never surface the previous map's marks.
  const marks = useRef<{ name: string; list: EventMark[] } | null>(null);
  const origin = compositeOrigin(layout);
  // GBA drawers resolve their fixed RGBA colours in core/render/overlays.ts, not CSS tokens.
  // Supply the layout metadata that the generic raster deliberately does not know.
  const withLayout = (raster: { width: number; height: number; data: Uint8ClampedArray }): LayoutRaster => ({
    ...raster, layoutName: layout.name, blockWidth: layout.width, blockHeight: layout.height,
    originX: origin.x, originY: origin.y, outOfRangeCount: 0, blocks,
  });
  /** The apply body a pencil/bucket/collision stroke sends at a block; null when there is nothing to send.
   *  rect/shift are applied once, at mouseup (MapSurface.finishStroke). */
  const paintBody = (activeTool: NonNullable<MapCanvasProps["activeTool"]>, { x: bx, y: by }: { x: number; y: number }): PaintApplyBody | null => {
    if (activeTool.kind === "pencil") {
      return { tool: "pencil", targets: [{ x: bx, y: by }], stamp: activeTool.stamp, origin: { x: bx, y: by } };
    } else if (activeTool.kind === "bucket") {
      const cell = activeTool.stamp.cells[0];
      // StampCell.metatileId is optional only for the collision tool; bucket needs a real id, so no-op without one.
      if (cell?.metatileId === undefined) return null;
      return { tool: "bucket", x: bx, y: by, replacement: { metatileId: cell.metatileId, collision: cell.collision, elevation: cell.elevation } };
    } else if (activeTool.kind === "collision") {
      // Reuses the pencil tool server-side with a 1x1 stamp whose cell omits metatileId: collision/elevation only.
      return {
        tool: "pencil",
        targets: [{ x: bx, y: by }],
        stamp: { width: 1, height: 1, cells: [{ collision: activeTool.value.collision, elevation: activeTool.value.elevation }] },
        origin: { x: bx, y: by },
      };
    }
    return null;
  };

  return {
    geometry: { pixelWidth: (layout.width + 2 * BORDER_RINGS * layout.borderWidth) * METATILE_PX,
      pixelHeight: (layout.height + 2 * BORDER_RINGS * layout.borderHeight) * METATILE_PX,
      origin, paintCellPx: METATILE_PX, eventCellPx: METATILE_PX, width: layout.width, height: layout.height },
    blocks,
    // useEditSession reseeds blocks after map switches; that first change is not paint (P12-8).
    skipFirstBlocksChange: true,
    // A session alone must not reload the unpainted image (P12-4h). The surface passes zero read-only.
    imageUrl: (name, version) => `/api/render/${encodeURIComponent(name)}.png?border=${BORDER_RINGS}${version > 0 ? `&v=${version}` : ""}`,
    // Every layer captures layout/blocks via withLayout. Encounters never invalidate the raster.
    overlays: [
      { key: "grid", label: "Grid", deps: [layout, blocks], draw: (raster) => drawGrid(withLayout(raster)),
        legend: <span className="map-canvas__legend-item"><i className="map-canvas__swatch map-canvas__swatch--grid" /> Grid</span> },
      // A painter must see collision even when the manual toggle is off; its aria-pressed stays manual.
      { key: "collision", label: "Collision", forced: activeTool?.kind === "collision", deps: [layout, blocks],
        draw: (raster) => drawCollision(withLayout(raster)),
        legend: <span className="map-canvas__legend-item" data-testid="collision-overlay" data-visible={true}>
          <i className="map-canvas__swatch map-canvas__swatch--collision" /> Collision</span> },
      { key: "elevation", label: "Elevation", deps: [layout, blocks], draw: (raster) => drawElevation(withLayout(raster)),
        legend: <span className="map-canvas__legend-item"><i className="map-canvas__swatch map-canvas__swatch--elevation" /> Elevation (low &rarr; high)</span> },
      { key: "events", label: "Events", deps: [layout, blocks, map], legend: <EventsLegendItems />,
        draw: (raster) => { marks.current = { name: map.name, list: drawEvents(withLayout(raster), map) }; } },
    ],
    hoverAt: (source, enabled) => {
      const bx = Math.floor((source.x - origin.x) / METATILE_PX);
      const by = Math.floor((source.y - origin.y) / METATILE_PX);
      if (bx < 0 || by < 0 || bx >= layout.width || by >= layout.height) return null;
      const block = blocks[by * layout.width + bx];
      if (!block) return null;
      // Live core Blocks have no resolved behaviour table; 0 remains the accepted MB_NORMAL fallback.
      const behavior = (block as { behavior?: number }).behavior ?? 0;
      const mark = enabled.events && marks.current?.name === map.name ? marks.current.list.find((m) => m.x === bx && m.y === by) : undefined;
      return { bx, by, metatileId: block.metatileId, collision: block.collision, elevation: block.elevation, behavior, mark };
    },
    statusItems: (hover) => [
      { key: "version", content: <>layout_version <strong>{split.version}</strong></> },
      { key: "split", content: <>split metatiles {split.metatiles} &middot; tiles {split.tiles} &middot; pals {split.pals}</> },
      { key: "hover", className: `map-canvas__hover${hover ? "" : " map-canvas__hover--empty"}`, content: hover ? <>
        ({hover.bx}, {hover.by}) id {hex(hover.metatileId)} &middot; collision {hover.collision} &middot; elevation {hover.elevation} &middot;
        behavior {hex(hover.behavior)}
        {hover.mark ? ` \u00b7 ${hover.mark.kind}: ${hover.mark.label}` : ""}
      </> : <>Hover the map&hellip;</> },
    ],
    paintBody,
    finishBody: (tool, start, end) => {
      // A zero-length shift is a harmless no-op server-side, with no undo entry.
      if (tool.kind === "shift") return { tool: "shift", dx: end.x - start.x, dy: end.y - start.y };
      if (tool.kind === "rect") return { tool: "rect", x0: start.x, y0: start.y, x1: end.x, y1: end.y, stamp: tool.stamp, origin: start };
      return null;
    },
    findEventAt: (cell) => firstEventAt(eventLists(map), cell),
    eventPosition: (event) => eventAt(eventLists(map), event),
    dropperStamp: (cell) => {
      // Read the WHOLE block, like Porymap's eyedropper: collision/elevation must follow the art.
      const block = readBlock(blocks, layout.width, layout.height, cell.x, cell.y);
      return block ? { width: 1, height: 1, cells: [{ metatileId: block.metatileId, collision: block.collision, elevation: block.elevation }] } : null;
    },
    // First unconnected planar side; dive/emerge are dropped. Preview fixtures may omit connections.
    encounters: { family: "gba", side: borderSideFromConnections(new Set((map.connections ?? [])
      .map((c) => gbaDirToCompass(c.direction)).filter((d): d is CompassDir => d !== undefined))),
      band: BORDER_BAND.gba, unitPx: METATILE_PX, legendHint: "Encounters: hover or focus a sprite" },
  };
}
