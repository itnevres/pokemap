import type { ComponentProps, ReactNode } from "react";
import type { WireConflict } from "@pokemap/core/src/world/conflictAcceptance.js";
import type { PlacementLedger } from "../shared/placementLedger.js";
import type { SpeciesSummary } from "../encounters/summary.js";
import type { EncounterBorderProps } from "../shared/EncounterBorder.js";
import type { WorldLensLegend } from "../shared/WorldLensControls.js";
import type { View } from "./view.js";
import type { Point } from "./view.js";

type LensLegendProps = ComponentProps<typeof WorldLensLegend>;
export type WorldOverlay = "selection" | "jump" | "warps" | "connections" | "marquee" | "lens" | "spotlight";

/** A placement as the surface sees it. Width/height are real (the adapter resolves zero-sized wire orphans);
 *  `component` indexes `components`, -1 for a manual orphan. */
export interface SurfacePlacement {
  map: string;
  x: number;
  y: number;
  width: number;
  height: number;
  component: number;
}

export interface SurfaceComponent {
  index: number;
  maps: readonly string[];
  bounds: { x: number; y: number; width: number; height: number };
}

export interface SurfaceWorld<P extends SurfacePlacement, C extends WireConflict> {
  /** Iteration order is draw order and hit order (the last placement is topmost). */
  placements: ReadonlyMap<string, P>;
  /** Connected components; singletons supply the unplaced names. */
  components: readonly SurfaceComponent[];
  /** Conflicts drawn as badges, in this order. */
  conflicts: readonly C[];
  /** Whether dungeon auto-layout is on (Task 6 renders the switch). */
  dungeonAutoLayout: boolean;
}

/** One map's fetched encounters; the tint is that map's method-lens colour, or null. */
export interface EncounterEntry {
  summaries: SpeciesSummary[];
  methodTint: string | null;
}

/** Normalised source coordinates in the adapter's warp unit. Endpoint lookup stays adapter-owned. */
export interface SurfaceWarp {
  point: Point;
  /** Destination offered by the preview; unresolved destinations leave this unset. */
  popupMap?: string;
  destination?: { map: string; point: Point };
  /** A closure can retain a wire warp ID and look up its exact endpoint after the destination fetch lands. */
  resolveDestination?(cache: ReadonlyMap<string, readonly SurfaceWarp[] | null>): { map: string; point: Point } | null;
}

/** The world hook's result. The hook owns the GET, the optimistic positions and their reconciliation through the ledger.
 *  `W` lets a family carry extra world data (GBA's vertical links) typed through to its own adapter callbacks. */
export interface WorldData<P extends SurfacePlacement, C extends WireConflict, W extends SurfaceWorld<P, C> = SurfaceWorld<P, C>> {
  /** The loaded world, or null before the first GET resolves. */
  world: W | null;
  /** The last load error, or null. */
  error: string | null;
  /** Issues a GET; returns its generation. */
  reload(): number;
  /** Generation of the last applied GET. */
  loadedGen: number;
  /** Clears `error`. */
  dismissError(): void;
  /** Optimistic positions (drag frames, rail drop); Task 6 calls it. */
  move(positions: ReadonlyMap<string, { x: number; y: number }>): void;
}

export interface WorldStatus<P extends SurfacePlacement, C extends WireConflict, W extends SurfaceWorld<P, C> = SurfaceWorld<P, C>> {
  /** The loaded world, or null. */
  world: W | null;
  /** The active map filter, or null. */
  mapFilter: ReadonlySet<string> | null;
  /** Math.round(zoom / nativePx * 100). */
  zoomPercent: number;
  /** Placed, non-empty, not drawn by default and not revealed (global, not culled). */
  hiddenCount: number;
  /** Singleton maps with no placement. */
  unplacedCount: number;
  /** Accepted conflicts (conflictAcceptance.acceptedCount). */
  acceptedCount: number;
  /** Placement and component under the pointer; adapters retain their own status copy and native unit. */
  hover: { map: string; placement: P; component: SurfaceComponent | null; width: number; height: number } | null;
}

export interface WorldSurfaceAdapter<
  P extends SurfacePlacement, C extends WireConflict, W extends SurfaceWorld<P, C> = SurfaceWorld<P, C>
> {
  /** Native px per world unit (16 tile, 32 block): zoom range, LOD, context native, zoom %. */
  nativePx: number;
  /** Called once per render, unconditionally. */
  useWorld(ledger: PlacementLedger): WorldData<P, C, W>;
  /** Request and response validation belong here. Rejection is a failed save, including a non-OK HTTP status. */
  postPlacement?(move: { map: string; x: number; y: number }, world: W): Promise<void>;
  postDungeons?(enabled: boolean, world: W): Promise<void>;
  /** Persistent dismissible errors, or errors cleared only by a subsequent success for that same map. */
  saveErrorPolicy?: "dismissible" | "per-map";
  /** Filter changes prune selection only where the existing host did so. */
  pruneSelectionOnFilter?: boolean;
  /** Drop guards and size lookup retain the host's existing rail semantics. */
  dropSize?(map: string, world: W, filter: ReadonlySet<string> | null): { width: number; height: number } | null;
  /** Native units per warp coordinate. */
  warpOffset?: number;
  /** Owns request, payload validation (including map identity), and normalisation. */
  fetchWarps?(map: string, world: W): Promise<readonly SurfaceWarp[]>;
  /** Resolves cache-dependent endpoints without guessing a destination corner when its exact warp is absent. */
  resolveWarp?(
    warp: SurfaceWarp,
    cache: ReadonlyMap<string, readonly SurfaceWarp[] | null>,
    world: W,
  ): { map: string; point: Point } | null;
  renderWarpPopup?(map: string, onClose: () => void, world: W): ReactNode;
  /** Unresolved preview behaviour is host-owned. */
  unresolvedWarpError?: string;
  /** Some hosts allow modified double-click previews and Map-view opens, while still guarding Edit-here. */
  modifiedDoubleClick?: boolean;
  /** Connection palette tokens and fallbacks, in stable source-map/warp-index order. */
  connectionColors?: readonly { token: string; fallback: string }[];
  /** Image URL for a placement at a tile version. */
  imageUrl(p: P, version: number | undefined): string;
  /** A change drops every cached tile (time of day, or a constant). */
  cacheKey: string | number;
  /** Shown in the unfiltered world unless revealed by a jump. */
  drawnByDefault(p: P): boolean;
  /** Extra canvas layers drawn after tiles and before conflict badges. */
  drawExtraLayers?(ctx: CanvasRenderingContext2D, a: { world: W; view: View; inScope(map: string): boolean }): void;
  /** Conflict badge tooltip text. */
  conflictTooltip(c: C): string;
  /** Per-map encounter fetch (rejects on failure). */
  fetchEncounters(map: string): Promise<EncounterEntry>;
  /** Encounter border band and the optional time used for dimming. */
  border: { band: EncounterBorderProps["band"]; time?: EncounterBorderProps["time"] };
  /** Lens coverage, its error, per-map average levels and the maps with no encounters. */
  useCoverage(): {
    coverage: LensLegendProps["coverage"];
    error: string | null;
    levelByMap: readonly { mapName?: string | null; averageLevel: number }[];
    emptyMapNames: ReadonlySet<string>;
  };
  /** Lens legend method key and copy. */
  lensLegend: { methodKey?: LensLegendProps["methodKey"]; legendCopy?: LensLegendProps["legendCopy"] };
  /** Status bar items, rendered inside `.world-canvas__status`. */
  statusItems(s: WorldStatus<P, C, W>): ReactNode;
  /** Canvas aria-label; omitted when the canvas has none. */
  canvasLabel?: string;
  /** Toolbar groups preceding the shared encounter and lens groups. */
  toolbarExtras?: ReactNode;
  /** Groups after the encounter alert (including the hosts' save/reload toolbar errors). */
  toolbarAfterEncounter?: ReactNode;
  /** Conflict/save/reload toasts stack in this wrapper where the host supplies it. */
  wrapToasts?(children: ReactNode): ReactNode;
  /** Host cursor modifier during map/group movement. */
  draggingMapClass?: string;
  /** Preserve the host's DOM stacking order; absent uses selection, jump, warps, connections, marquee, lenses. */
  overlayOrder?: readonly WorldOverlay[];
  /** Items following the shared conflict legend. */
  legendExtras?: ReactNode;
  /** Fit leads the toolbar (no zoom readout) instead of sharing the trailing zoom group. */
  fitFirst?: boolean;
}
