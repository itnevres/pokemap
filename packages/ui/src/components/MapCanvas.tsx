import type { EventKind } from "@pokemap/core/src/edit/events.js";
import type { Stamp } from "@pokemap/core/src/edit/paint.js";
import type { MapLayoutData } from "../hooks/useMapLayout.js";
import type { UseEditSessionResult } from "../hooks/useEditSession.js";
import type { SettledChain } from "../shared/useStrokeChain.js";
import type { CollisionElevation } from "./CollisionPalette.js";
import type { MapView } from "./mapView.js";
import { MapSurface } from "../canvas/MapSurface.js";
import { useGbaMapSurface } from "../gba/mapSurface.js";
export { compositeOrigin } from "../gba/mapSurface.js";

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

export interface MapCanvasProps {
  onStrokeChain?: (chain: SettledChain, mounted: boolean) => void;
  /** Failed stroke requests reach the workspace dismissible banner (P12-4f). */
  onEditError?: (message: string) => void;
  mapName: string;
  data: MapLayoutData;
  /** Present only when editing is active for THIS map -- see
   *  useEditSession.ts. Every existing read-only consumer (Map mode's
   *  default view, WarpDestinationModal's preview) never passes this and
   *  is completely unaffected by anything in this task. */
  editSession?: UseEditSessionResult;
  /** Collision paints collision/elevation only and forces its overlay visible. */
  activeTool?:
    | { kind: "pencil" | "rect" | "bucket"; stamp: Stamp }
    | { kind: "collision"; value: CollisionElevation }
    | { kind: "shift" }
    | { kind: "dropper" }
    | { kind: "sign" }
    | null;
  onSignPick?: (x: number, y: number, anchor: DOMRect) => void;
  /** With no paint tool, select the event at the click, or deselect on a miss (also read-only). */
  onSelectEvent?: (ref: EventRef | null) => void;
  /** Controlled selection ring only; hit-testing always reads the live map. */
  selectedEventRef?: EventRef | null;
  /** Once on release, with the final event cell; preview moves are local only. */
  onMoveEvent?: (next: { kind: EventKind; index: number; x: number; y: number }) => void;
  /** Copies the entire block as a 1x1 stamp, including collision/elevation. */
  onDropperPick?: (stamp: Stamp) => void;
  /** Plan 9 (R2): the hovered block's metatile id whenever it changes; null when nothing is hovered. */
  onHoverMetatile?: (id: number | null) => void;
  /** Controlled pan/zoom (Plan 6c E1). When present the canvas renders exactly this view and owns no view
   *  state of its own: every zoom button, wheel tick, pan drag and Fit click is reported through
   *  `onViewChange` instead of applied, and there is NO automatic fit on image load (the parent owns
   *  placement; only the explicit Fit button reports a fitted view). Omit for the uncontrolled default.
   *  Do not switch between controlled and uncontrolled during one mount. In controlled mode two gestures
   *  fired before the parent re-renders both derive from the last rendered view (the second wins). */
  view?: MapView;
  /** Receives the view a user gesture would produce, computed from the current `view` prop (controlled mode). */
  onViewChange?: (next: MapView) => void;
  /** Plan 6c E4: no toolbar, status strip or overlay legend, and a transparent viewport (root modifier
   *  `map-canvas--chromeless`), so the stage canvas box equals the root box. Used by the in-context overlay on the
   *  world canvas, which drives zoom/pan (`view`/`onViewChange`) from its own bar. Painting is unchanged. */
  chromeless?: boolean;
}

// GBA supplies engine facts; MapSurface owns rendering and interaction.
export function MapCanvas({ selectedEventRef, ...props }: MapCanvasProps) {
  const adapter = useGbaMapSurface(props);
  return <MapSurface {...props} adapter={adapter} selectedEvent={selectedEventRef} />;
}
