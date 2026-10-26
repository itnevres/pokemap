import type { ReactNode } from "react";
import type { EncounterBorderProps } from "../shared/EncounterBorder.js";
import type { BorderSide } from "../encounters/borderSide.js";
import type { MapStatusItem } from "../shared/MapStatusStrip.js";
import type { RasterLayer } from "./useRasterComposite.js";
import type { Point } from "./view.js";

export interface MapTool { kind: string }
export interface MapHover { metatileId: number }
export interface MapOverlay extends Omit<RasterLayer, "enabled"> {
  label: string;
  legend: ReactNode;
  /** Collision editing forces its overlay on without changing the user's toggle. */
  forced?: boolean;
}

/** Built each render by a family. Closures may change; raster deps must name every captured input.
 * hoverAt receives composite source pixels, including the border origin. It must suppress overlay-derived
 * marks when that overlay is disabled; GBC's intrinsic step events need not depend on overlay visibility.
 */
export interface MapSurfaceAdapter<Tool extends MapTool, Body, Event, Stamp, Hover extends MapHover> {
  className?: string;
  geometry: { pixelWidth: number; pixelHeight: number; origin: Point; paintCellPx: number;
    eventCellPx: number; width: number; height: number };
  blocks: unknown;
  skipFirstBlocksChange: boolean;
  /** Version zero means no v parameter. The surface passes zero when no session is active. */
  imageUrl(mapName: string, paintVersion: number): string;
  overlays: readonly MapOverlay[];
  hoverAt(sourcePoint: Point, enabled: Readonly<Record<string, boolean>>): Hover | null;
  statusItems(hover: Hover | null, enabled: Readonly<Record<string, boolean>>): readonly MapStatusItem[];
  paintBody(tool: Tool, cell: Point): Body | null;
  finishBody(tool: Tool, start: Point, end: Point): Body | null;
  findEventAt(cell: Point): Event | null;
  eventPosition(event: Event): Point | null;
  dropperStamp(cell: Point): Stamp | null;
  encounters: { family: Parameters<typeof import("../encounters/useMapEncounterSummaries.js").useMapEncounterSummaries>[1];
    side: BorderSide; band: number; unitPx: number; time?: EncounterBorderProps["time"]; legendHint: string };
}
