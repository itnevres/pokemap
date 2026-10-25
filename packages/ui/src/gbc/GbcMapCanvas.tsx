import type { GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";
import type { GbcStamp } from "@pokemap/core/src/gbc/edit/paint.js";
import type { GbcEventKind } from "@pokemap/core/src/gbc/edit/events.js";
import type { UseGbcEditSessionResult } from "./hooks/useGbcEditSession.js";
import type { SettledChain } from "../shared/useStrokeChain.js";
import type { GbcTimeOfDay } from "./time.js";
import type { MapView } from "../components/mapView.js";
import { MapSurface } from "../canvas/MapSurface.js";
import { useGbcMapSurface } from "./mapSurface.js";
export { GBC_COMPOSITE_ORIGIN, clientToStep, formatQuadrant, parseColorToken } from "./mapSurface.js";
export { zoomAboutPivot } from "../components/mapView.js";

/** Shared pan/zoom value; useStageView keeps updates pure under StrictMode (Plan 6c E1). */
export type GbcView = MapView;

/** A bare pointer at one event -- selection is the parent's, resolved against the live events. */
export interface GbcEventRef {
  kind: GbcEventKind;
  index: number;
}

export type GbcActiveTool = { kind: "pencil" | "rect" | "bucket" | "shift" | "dropper" | "sign"; stamp?: GbcStamp };

export interface GbcMapCanvasProps {
  onStrokeChain?: (chain: SettledChain, mounted: boolean) => void;
  mapName: string;
  data: GbcMapPayload;
  time: GbcTimeOfDay;
  /** Present once editing is mounted for this map. Its blocks and events win over `data`'s for drawing, hover
   *  and the dropper. Absent: the read-only view. */
  editSession?: UseGbcEditSessionResult;
  activeTool?: GbcActiveTool | null;
  onSignPick?: (x: number, y: number, anchor: DOMRect) => void;
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

// GBC supplies engine geometry, readouts and edit bodies; MapSurface owns rendering and interaction.
export function GbcMapCanvas({ hoveredMetatile, ...props }: GbcMapCanvasProps) {
  const adapter = useGbcMapSurface(props.data, props.time, props.editSession);
  return <MapSurface {...props} adapter={adapter} onHoverMetatile={hoveredMetatile} />;
}
