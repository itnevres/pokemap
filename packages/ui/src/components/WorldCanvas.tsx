import { useMemo, type ReactNode } from "react";
import type { MapView } from "./mapView.js";
import { WorldSurface } from "../canvas/WorldSurface.js";
import { computeFit as computeWorldFit, worldZoomRange } from "../canvas/worldView.js";
import { createGbaWorldSurface } from "../gba/worldSurface.js";

// Compat re-exports (plan Task 8); Task 9's re-export inventory deletes any without a consumer.
export { drawDiamond, levelColorMap, themedLevelColorMap } from "../canvas/worldColours.js";

/** GBA's default-bounds wrapper over `canvas/worldView.ts` computeFit: screen px per 16px tile.
 *  The shared P12-4j scale range is 1/2048..1; callers may still supply explicit native-unit bounds. */
export function computeFit(
  bounds: { x: number; y: number; width: number; height: number },
  viewport: { w: number; h: number },
  zoomBounds: { min: number; max: number } = worldZoomRange(16),
) {
  return computeWorldFit(bounds, viewport, zoomBounds);
}

/** Props for {@link WorldCanvas}: the map-list jump target (Task 2). */
export interface WorldCanvasProps {
  /** A map name to pan/zoom to, or null/undefined for none. Mirrors
   *  App.tsx's shared `selected` state -- set by clicking a name in the
   *  sidebar map list while in World mode. */
  jumpToMap?: string | null;
  /** Bumped by the caller on every click, even a re-click of the same
   *  name -- jumpToMap alone can't distinguish "jump here again" from "no
   *  change", since React state setters no-op on an identical primitive
   *  value. */
  jumpToken?: number;
  /** When set, only these maps are ever drawn, fetched, or hit-testable --
   *  everything else in WorldCanvas (pan/zoom/drag/multi-select/warp
   *  toggle) behaves exactly as in the full world view, just scoped. Used
   *  by Dungeon mode (App.tsx, a later task) to reuse this exact component
   *  rather than forking a second implementation. */
  mapFilter?: Set<string> | null;
  /** A lens list entry (Empty maps) was clicked; the app selects the map and
   *  jumps there (the tree-click path). Unset (a dungeon view) renders the
   *  entries disabled. */
  onJumpToMap?: (name: string) => void;
  /** A plain single click landed on a map (never a modifier click, the end of a
   *  drag, or a click on empty space). The app mirrors it into its own selection
   *  (sidebar highlight) but must not treat it as a jump request. */
  onSelectMap?: (name: string) => void;
  /** The context menu's "Open in Map view" (and Shift+double-click) on a map. Unset: the item is not offered. */
  onOpenMap?: (name: string) => void;
  /** A plain double-click on a map body (no modifier, no drag, not a warp marker) and the context menu's "Edit here".
   *  The app enters in-context editing and passes `context` below. Unset: double-click opens Map view (P12-4c). */
  onEditHere?: (name: string) => void;
  /** In-context editing (Plan 6c E4): while set, an overlay fills the viewport box with a dim layer, the host's
   *  controlled editing canvas and a small bar. The world snaps once to this map, at the pointer `onEditHere` recorded
   *  (or the viewport centre), and its zoom may reach 64 px per tile. */
  context?: WorldCanvasContext;
  /** Per-map render bust: when a map's number changes, only that map's tile is dropped and re-requested as
   *  `/api/render/<map>.png?v=<n>`; later loads of it keep the `?v`. */
  tileVersions?: Record<string, number>;
  /** Once per placement commit, with every acknowledged name (a tree or rail drop, a Shift-drag or group move);
   *  not called when none was acknowledged. The app mirrors them into tree visibility. */
  onPlacementsSaved?: (names: string[]) => void;
  /** The dungeon auto-layout toggle was saved. The app refreshes any world data it holds of its own. */
  onLayoutChanged?: () => void;
}

export interface WorldCanvasContext {
  map: string;
  /** Composite px of the map's top-left tile (`compositeOrigin`); null until its layout has loaded, when the overlay
   *  shows only the dim layer and the bar. */
  origin: { x: number; y: number } | null;
  /** The host's editing canvas (a chromeless, controlled `MapCanvas`) for the view that lines it up with the world. */
  renderCanvas: (view: MapView, onViewChange: (next: MapView) => void) => ReactNode;
  /** Done, Escape, or a double-click on the overlay outside the map. The host decides whether to leave (a dirty
   *  session opens its save dialog instead). */
  onExitRequest: () => void;
}

export function WorldCanvas(props: WorldCanvasProps = {}) {
  const adapter = useMemo(() => createGbaWorldSurface(), []);
  return (
    <WorldSurface adapter={adapter} {...props} />
  );
}
