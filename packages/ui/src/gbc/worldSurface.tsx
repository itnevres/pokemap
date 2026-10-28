import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Placement, Component, Conflict, Bounds } from "@pokemap/core/src/gbc/world/connections.js";
import type { WireConflict } from "@pokemap/core/src/world/conflictAcceptance.js";
import type { GbcWorldPlacement } from "@pokemap/core/src/gbc/wire.js";
import type { GbcEncounterSource } from "@pokemap/core/src/gbc/analyse/atlas.js";
import type { LensId, LensPanelSummary } from "../components/LensPanel.js";
import type { PlacementLedger, PlacementSnapshot } from "../shared/placementLedger.js";
import type { SurfaceWorld, WorldSurfaceAdapter } from "../canvas/worldSurfaceAdapter.js";
import { JUMP_FILL_FRACTION, jumpFit as worldJumpFit, singletonSizes,
  zoomWorldAboutPivot as worldZoomAboutPivot } from "../canvas/worldView.js";
import { BORDER_BAND } from "../encounters/borderSide.js";
import { summariseGbc } from "../encounters/summary.js";
import { fetchGuarded } from "../hooks/useGuardedFetch.js";
import { useGbcWorld } from "./hooks/useGbcWorld.js";
import { useGbcCoverage } from "./hooks/useGbcCoverage.js";
import { isGbcEncountersPayload, isGbcWarpsPayload, isRecord } from "./guards.js";
import { GbcWarpDestinationModal } from "./GbcWarpDestinationModal.js";
import type { GbcTimeOfDay } from "./time.js";

/** Native block size, px (`GbcWorldPayload.blockPx`, always 32). Zoom here
 *  is screen px PER BLOCK (32 px native), not per tile. */
const BLOCK_PX = 32;

const GBC_MIN_ZOOM = 1 / 64;
const GBC_MAX_ZOOM = 32;
/** GBC compatibility helpers use screen px per BLOCK (native 32), not per tile:
 *  a 16 px/TILE cap would silently limit a GBC fit to half native resolution. */
const GBC_ZOOM_BOUNDS = { min: GBC_MIN_ZOOM, max: GBC_MAX_ZOOM };

/** Fraction of native resolution the cached LOD buffer renders at --
 *  identical to `WorldCanvas.tsx`'s own `LOD_SCALE`. */
const LOD_SCALE = 0.25;

/** Below this many screen px per BLOCK, redraw from the downscaled `small`
 *  buffer rather than the full-resolution source image. GBA's own
 *  `LOD_ZOOM_THRESHOLD` is `4` = `16` (`TILE_PX`, GBA's native px/tile) *
 *  `LOD_SCALE`; GBC's block is 32px native, so its threshold is
 *  `32 * LOD_SCALE` = `8`, computed from the same named constants rather
 *  than a second unexplained literal. */
export const GBC_LOD_ZOOM_THRESHOLD = BLOCK_PX * LOD_SCALE; // 8

/** GBC warp events use 16px steps; world placements use 32px blocks. */
export function projectGbcWarpPoint(
  placement: { x: number; y: number },
  event: { x: number; y: number },
  zoom: number,
  pan: { x: number; y: number },
) {
  return { x: (placement.x + event.x / 2) * zoom + pan.x, y: (placement.y + event.y / 2) * zoom + pan.y };
}

/** The canvas's whole pan/zoom state, updated as ONE value: StrictMode replays updaters.
 *  `fitted` (fix round, F5) is part
 *  of this same state, not a separate one, precisely so the initial fit's
 *  `setView` can set the real zoom/pan AND flip `fitted` to true in one
 *  atomic update -- never a render where `fitted` is already true but
 *  `zoom`/`pan` are still the stale mount default, or vice versa. */
export interface GbcWorldView {
  zoom: number;
  pan: { x: number; y: number };
  fitted: boolean;
}

/** Compatibility wrapper (GBC default bounds) over `canvas/worldView.ts` `zoomWorldAboutPivot`: continuous
 *  zoom about a stage-pixel pivot, `fitted` carried over, the same object when the clamped zoom is unchanged. */
export function zoomWorldAboutPivot(
  view: GbcWorldView,
  factor: number,
  pivotX: number,
  pivotY: number,
  bounds: { min: number; max: number } = GBC_ZOOM_BOUNDS,
): GbcWorldView {
  return worldZoomAboutPivot(view, factor, pivotX, pivotY, bounds);
}

/**
 * Compatibility export for existing helper callers; WorldSurface uses fitClusters on live member placements (P12-4m).
 * The union of every MULTI-map component's own bounds (`.maps.length > 1`)
 * -- the "3 landmasses" a corpus this size actually has, excluding the 323
 * single-map interiors that make up most of the 255x746-block canvas (Task
 * 5 spec's own corpus facts). `null` when there are none (an empty/all-
 * singleton world), so the caller can fall back to `fitAllBounds`. Pure,
 * reading only `component.bounds` (already computed by `buildGbcWorld`) --
 * no placement lookup needed, unlike GBA's own `worldBoundsOf`, which has
 * to reconstruct an orphan's size from a separate `sizeByMap` map that GBC
 * has no equivalent of (every GBC placement already carries its own real
 * width/height, Task 2's own wire shape).
 */
export function initialFitBounds(world: { components: readonly Component[] }): Bounds | null {
  const multi = world.components.filter((c) => c.maps.length > 1);
  if (multi.length === 0) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of multi) {
    x0 = Math.min(x0, c.bounds.x);
    y0 = Math.min(y0, c.bounds.y);
    x1 = Math.max(x1, c.bounds.x + c.bounds.width);
    y1 = Math.max(y1, c.bounds.y + c.bounds.height);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Compatibility export: union of every placement's own bounds (the pre-P12-4m Fit rule).
 *  `null` for an empty world. */
export function fitAllBounds(placements: Record<string, Placement>): Bounds | null {
  const list = Object.values(placements);
  if (list.length === 0) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of list) {
    if (p.width <= 0 || p.height <= 0) continue;
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + p.width);
    y1 = Math.max(y1, p.y + p.height);
  }
  if (x0 === Infinity) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * The CLI's own `noteLines` wording (`packages/cli/src/gbcCommands.ts`,
 * `noteLines`), reused verbatim rather than re-derived: `${map} placed via
 * ${viaB.from}; ${viaA.from} disagrees by (dx,dy)`, `dx,dy = viaA - viaB`.
 * For the real Route17 fixture (`viaA: {from: "Route18", x:30,y:50}`,
 * `viaB: {from: "Route16", x:30,y:49}`): "Route17 placed via Route16;
 * Route18 disagrees by (0,1)" -- re-measured directly against the live
 * corpus's `buildGbcWorld` output, not copied from the spec's prose.
 */
export function conflictTooltipText(c: Conflict): string {
  const dx = c.viaA.x - c.viaB.x;
  const dy = c.viaA.y - c.viaB.y;
  return `${c.map} placed via ${c.viaB.from}; ${c.viaA.from} disagrees by (${dx},${dy})`;
}

/** Pure LOD chooser -- the mutation the spec names explicitly ("use an LOD
 *  threshold of 4", GBA's own value) must fail against a zoom strictly
 *  between the two thresholds (4 <= zoom < 8). */
export function shouldUseLod(zoom: number): boolean {
  return zoom < GBC_LOD_ZOOM_THRESHOLD;
}

/**
 * The method lens's own per-map tint colour (Plan 6b Task 6) -- a fixed
 * display PRECEDENCE (spec's own "water > fish > headbutt > rock") for a map
 * whose sources include more than one non-grass method, not a ranking of
 * importance; mirrors `WorldCanvas.tsx`'s own `methodTintFor` exactly (same
 * "first match wins" shape, one CSS var per method). Grass is never tinted
 * (spec's own "Grass is never a tint" -- it's a lens about which maps reward
 * a specific ACTION beyond walking through grass, which every encounter-
 * carrying map already does). `sources` is `undefined` while the map's own
 * `/api/encounters` fetch hasn't resolved yet (nothing to tint YET, not "no
 * tint ever" -- this memo re-runs once it lands) and `[]` for a map with no
 * encounters at all (also nothing to tint, correctly).
 *
 * A fish source counts only if it's present in the ALREADY-FETCHED sources
 * for this map -- the server already drops fishing on a waterless map (the
 * Task 12 atlas rule, cited in the spec's own "no extra client logic"
 * note), so there is nothing further to check here.
 *
 * Exported and unit-tested for every precedence combination, including
 * mutation check #3 (swapping fish and water in the precedence order).
 */
export function methodTint(sources: GbcEncounterSource[] | undefined): string | null {
  if (!sources) return null;
  if (sources.some((s) => s.method === "water")) return "var(--encounter-water)";
  if (sources.some((s) => s.method === "fish")) return "var(--encounter-fishing)";
  if (sources.some((s) => s.method === "headbutt")) return "var(--encounter-headbutt)";
  if (sources.some((s) => s.method === "rock")) return "var(--encounter-rock-smash)";
  return null;
}

/** `LensLegend`'s own `methodKey` for the GBC method lens (spec's own list,
 *  and the coordinator's swatch-slug amendment: only "water", "fishing",
 *  "headbutt" and "rock-smash" -- grass is never in this key, since it's
 *  never tinted; see `methodTint`'s own doc comment). Module scope, not
 *  recreated per render -- `LensLegend`'s own `methodKey` prop is read by
 *  reference identity nowhere that matters (a plain render-time read), but
 *  there is no reason to allocate a fresh array every render either. */
const GBC_METHOD_LENS_KEY: Array<{ slug: string; label: string }> = [
  { slug: "water", label: "Water (surfing)" },
  { slug: "fishing", label: "Fish" },
  { slug: "headbutt", label: "Headbutt" },
  { slug: "rock-smash", label: "Rock Smash" },
];

/** `LensLegend`'s own `legendCopy` override for the GBC lens legend (spec's
 *  own exact copy for level-curve and method; empty-maps/unused-species are
 *  left at `LensLegend`'s own GBA defaults, which already read generically
 *  off `summary` and need no GBC-specific wording). Module scope, for the
 *  same reason as `GBC_METHOD_LENS_KEY` above. */
const GBC_LEGEND_COPY: Partial<Record<LensId, (s: LensPanelSummary) => string>> = {
  "level-curve": () =>
    "Colour is the average encounter level: an unweighted mean of each source's average. Blue is low, red is high.",
  method: () => "Which maps reward surfing, fishing, headbutting trees or rock smash.",
};

/** Compatibility wrapper (GBC default bounds) over `canvas/worldView.ts` `jumpFit` (60% fill, scaled before
 *  clamping; the rationale lives there). */
export function jumpFit(
  bounds: Bounds,
  viewport: { w: number; h: number },
  zoomBounds: { min: number; max: number } = GBC_ZOOM_BOUNDS,
  fraction: number = JUMP_FILL_FRACTION,
) {
  return worldJumpFit(bounds, viewport, zoomBounds, fraction);
}

export type GbcSurfaceWorld = SurfaceWorld<GbcWorldPlacement, WireConflict>;

const EMPTY_PLACEMENT_SNAPSHOT: PlacementSnapshot = { mapStates: new Map() };

function isPlacementSaved(x: unknown): x is { ok: true } {
  return isRecord(x) && x.ok === true;
}

function isLayoutSaved(x: unknown): x is { dungeonAutoLayout: boolean } {
  return isRecord(x) && typeof x.dungeonAutoLayout === "boolean";
}

function useGbcSurfaceWorld(ledger: PlacementLedger) {
  // The ledger snapshot taken as each world GET was issued, by generation. A response can land in the same batch as a
  // newer GET's issue, so its own snapshot must survive that issue; reconciliation prunes older generations.
  const issued = useRef(new Map<number, PlacementSnapshot>());
  const { data, error, reload, loadedGen, dismissError } = useGbcWorld(true, (gen) => {
    issued.current.set(gen, ledger.snapshot());
  });
  const [overrides, setOverrides] = useState<Record<string, { x: number; y: number }>>({});
  // Pair each world response with the ledger snapshot taken when its GET was issued, never with saved coordinates.
  useEffect(() => {
    if (!data) return;
    const snap = issued.current.get(loadedGen) ?? EMPTY_PLACEMENT_SNAPSHOT;
    // Older generations can never land now (their GETs were cancelled or superseded).
    for (const gen of issued.current.keys()) {
      if (gen < loadedGen) issued.current.delete(gen);
    }
    // Capture ownership before the updater so React can replay it without reading mutable refs.
    const keep = new Set(ledger.versionedMaps().filter((name) =>
      !ledger.serverShows(name, snap) || (!(name in data.placements) && !ledger.dropAbsent(name, snap))));
    setOverrides((previous) => Object.fromEntries(Object.entries(previous).filter(([name]) => keep.has(name))));
  }, [data, loadedGen, ledger]);
  // Every singleton map's own size (its component's bounds): sizes a rail drop of a map absent from placements.
  const sizes = useMemo(() => singletonSizes(data?.components), [data?.components]);
  const world = useMemo<GbcSurfaceWorld | null>(() => {
    if (!data) return null;
    const placements = new Map(Object.entries(data.placements).map(([name, placement]) => {
      const at = overrides[name];
      return [name, at ? { ...placement, ...at, manual: true } : placement] as const;
    }));
    // A map dropped from the rail while absent (dungeon auto-layout off): a manual placement of its own size.
    for (const [name, at] of Object.entries(overrides)) {
      const size = sizes.get(name);
      if (!placements.has(name) && size) {
        placements.set(name, { map: name, ...at, ...size, component: -1, mapType: "", manual: true });
      }
    }
    return { placements, components: data.components, conflicts: data.conflicts,
      dungeonAutoLayout: data.sidecar.dungeonAutoLayout };
  }, [data, overrides, sizes]);
  const move = useCallback((positions: ReadonlyMap<string, { x: number; y: number }>) => {
    setOverrides((previous) => ({ ...previous, ...Object.fromEntries(positions) }));
  }, []);
  return { world, error, reload, loadedGen, dismissError, move };
}

function useGbcSurfaceCoverage() {
  const { data, error } = useGbcCoverage();
  // Coverage-derived lenses are time-independent; a time switch only re-dims EncounterBorder.
  const emptyMapNames = useMemo(() => new Set(data?.mapsWithoutEncounters ?? []), [data]);
  return { coverage: data, error, levelByMap: data?.levelByMap ?? [], emptyMapNames };
}

export function createGbcWorldSurface(time: GbcTimeOfDay): WorldSurfaceAdapter<GbcWorldPlacement, WireConflict> {
  return {
    // Native block size, px: zoom is screen px PER BLOCK, rather than per 16px event step.
    nativePx: BLOCK_PX,
    useWorld: useGbcSurfaceWorld,
    postPlacement: async ({ map, x, y }) => {
      await fetchGuarded("/api/world/placement", isPlacementSaved, undefined, {
        method: "POST", body: JSON.stringify({ map, x, y }),
      });
    },
    postDungeons: async (enabled) => {
      await fetchGuarded("/api/world/dungeons", isLayoutSaved, undefined, {
        method: "POST", body: JSON.stringify({ enabled }),
      });
    },
    // A success clears only its own map's failure, never one the user has not read yet (final review M5).
    saveErrorPolicy: "per-map",
    pruneSelectionOnFilter: true,
    dropSize: (map, world, filter) => {
      if (filter && !filter.has(map)) return null;
      return world.placements.get(map) ?? singletonSizes(world.components).get(map) ?? null;
    },
    // GBC warp events use 16px steps; world placements use 32px blocks.
    warpOffset: 1 / 2,
    fetchWarps: async (map) => {
      const url = `/api/warps/${encodeURIComponent(map)}`;
      const payload = await fetchGuarded(url, isGbcWarpsPayload);
      if (payload.mapName !== map) throw new Error(`GET ${url} returned the wrong map`);
      return payload.warps.map((warp) => ({
        point: { x: warp.x, y: warp.y },
        popupMap: warp.destEvent ? warp.destMapName : undefined,
        destination: warp.destMapName && warp.destEvent ? {
          map: warp.destMapName,
          point: { x: warp.destEvent.x, y: warp.destEvent.y },
        } : undefined,
      }));
    },
    renderWarpPopup: (map, onClose) => (
      <GbcWarpDestinationModal mapName={map} time={time} onClose={onClose} />
    ),
    unresolvedWarpError: "This warp destination could not be resolved",
    modifiedDoubleClick: true,
    // A stationary Shift-click selects like a plain click (old GbcWorldCanvas onClick had no modifier guard).
    shiftClickSelects: true,
    imageUrl: (p, version) =>
      `/api/render/${encodeURIComponent(p.map)}.png?time=${time}${version ? `&v=${version}` : ""}`,
    // A time switch drops the WHOLE image cache: decoded renders are ~153MB PER TIME OF DAY at native size.
    // Keep at most one time's worth, and never draw a stale day/nite image under the new time.
    cacheKey: time,
    drawnByDefault: (p) => p.manual || (p.mapType !== "INDOOR" && p.mapType !== "GATE"),
    conflictTooltip: conflictTooltipText,
    // One fetch per map, independent of time: sources contain every method/time/rod/list variant.
    // Time switches dim the cached summaries at render, rather than fetching or filtering sources again.
    // Guard failures must remain visible rather than look like a map with genuinely no encounters (spec review F4).
    fetchEncounters: async (map) => {
      const url = `/api/encounters/${encodeURIComponent(map)}`;
      const payload = await fetchGuarded(url, isGbcEncountersPayload, url);
      return { summaries: summariseGbc(payload.sources), methodTint: methodTint(payload.sources) };
    },
    // A hidden indoor/gate neighbour still blocks a border side (every in-scope placement counts).
    borderNeighbours: "scoped",
    border: { band: BORDER_BAND.gbc, time },
    useCoverage: useGbcSurfaceCoverage,
    lensLegend: { methodKey: GBC_METHOD_LENS_KEY, legendCopy: GBC_LEGEND_COPY },
    statusItems: ({ world, mapFilter, zoomPercent, acceptedCount, hover }) => (
      <>
        <span className="world-canvas__status-item">
          {world?.components.length ?? 0} components · {mapFilter
            ? [...mapFilter].filter((name) => world?.placements.has(name)).length
            : world?.placements.size ?? 0} maps · zoom {zoomPercent}% · {world?.conflicts.length ?? 0} conflicts · {acceptedCount} accepted
        </span>
        {hover ? (
          <span className="world-canvas__status-item world-canvas__hover">
            {hover.map}
            {hover.component
              ? ` · component #${hover.component.index} (${hover.component.maps.length} maps) · ${hover.width}×${hover.height} blocks`
              : ""}
          </span>
        ) : (
          <span className="world-canvas__status-item world-canvas__hover world-canvas__hover--empty">
            Hover the world…
          </span>
        )}
      </>
    ),
    canvasLabel: "World map. Plus or minus zooms; Enter opens the selected map.",
    fitFirst: true,
    // These toolbar slots are empty in GBC. Per-map save/reload groups follow the encounter alert in the surface;
    // the shared grow group then contains SpeciesSpotlight and WorldLensControl, in their original DOM order.
    toolbarExtras: undefined,
    toolbarAfterEncounter: undefined,
    // Preserve the original overlay stacking order; selection and marquee are the P12-3 additions.
    overlayOrder: ["warps", "connections", "lens", "spotlight", "selection", "jump", "marquee"],
  };
}
