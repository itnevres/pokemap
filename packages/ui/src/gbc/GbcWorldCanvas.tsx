import { useMemo, type ReactNode } from "react";
import type { MapView } from "../components/mapView.js";
import { WorldSurface } from "../canvas/WorldSurface.js";
import { createGbcWorldSurface } from "./worldSurface.js";
import type { GbcTimeOfDay } from "./time.js";

export { GBC_LOD_ZOOM_THRESHOLD, projectGbcWarpPoint, zoomWorldAboutPivot, initialFitBounds,
  fitAllBounds, conflictTooltipText, shouldUseLod, jumpFit, methodTint } from "./worldSurface.js";
export type { GbcWorldView } from "./worldSurface.js";

export interface GbcWorldCanvasProps {
  time: GbcTimeOfDay;
  mapFilter?: Set<string> | null;
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
  /** A lens list entry (Empty maps) was clicked; the app selects the map and
   *  jumps there (the tree-click path). */
  onJumpToMap?: (name: string) => void;
  /** A placement POST succeeded (tree drop, rail drop, or Shift-drag move), with the saved name. */
  onPlacementsSaved?: (names: string[]) => void;
  /** The dungeon auto-layout toggle was saved; the app refreshes any world data it holds of its own. */
  onLayoutChanged?: () => void;
  /** Plan 7 Task 5b: a plain double-click on a map body (no modifier, no drag, not a warp marker) and the context
   *  menu's "Edit here". The app enters in-context editing and passes `context`. Unset: a double-click opens the
   *  map in Map view instead (Dungeon mode), and the menu offers no "Edit here". */
  onEditHere?: (name: string) => void;
  /** In-context editing: while set, an overlay fills the viewport box with a dim layer, the host's controlled
   *  editing canvas and a small bar. The world snaps once to this map and its zoom may reach 128 px per block. */
  context?: GbcWorldCanvasContext;
  /** Per-map render bust: when a map's number changes, only that map's tile is dropped and re-requested with
   *  `&v=<n>`; later loads of it (a time switch included) keep the `&v`. */
  tileVersions?: Record<string, number>;
}

export interface GbcWorldCanvasContext {
  map: string;
  /** Composite px of the map's top-left block (`GBC_COMPOSITE_ORIGIN`); null until the map's payload has loaded,
   *  when the overlay shows only the dim layer and the bar. */
  origin: { x: number; y: number } | null;
  /** The host's editing canvas (a chromeless, controlled `GbcMapCanvas`) for the view that lines it up with the world. */
  renderCanvas: (view: MapView, onViewChange: (next: MapView) => void) => ReactNode;
  /** Done, Escape, or a double-click on the overlay outside the map. The host decides whether to leave. */
  onExitRequest: () => void;
}

export function GbcWorldCanvas({ time, ...props }: GbcWorldCanvasProps) {
  const adapter = useMemo(() => createGbcWorldSurface(time), [time]);
  return (
    <WorldSurface adapter={adapter} {...props} />
  );
}
