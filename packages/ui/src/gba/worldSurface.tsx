import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Placement, Component as WorldComponentInfo, VerticalLink } from "@pokemap/core/src/world/connections.js";
import type { WireConflict } from "@pokemap/core/src/world/conflictAcceptance.js";
import type { WarpEvent } from "@pokemap/core/src/load/maps.js";
import type { PlacementLedger } from "../shared/placementLedger.js";
import type { SurfaceWorld, WorldSurfaceAdapter, SurfaceWarp } from "../canvas/worldSurfaceAdapter.js";
import { singletonSizes, rectOf } from "../canvas/worldView.js";
import { BADGE_SIZE } from "../shared/worldBadges.js";
import { BORDER_BAND } from "../encounters/borderSide.js";
import { isGbaEncountersPayload } from "../encounters/guards.js";
import { summariseGba } from "../encounters/summary.js";
import { fetchGuarded } from "../hooks/useGuardedFetch.js";
import { useCoverage } from "../hooks/useCoverage.js";
import { isDrawnByDefault } from "../world/visibility.js";
import { isRecord, isWireConflict } from "../world/conflictAcceptance.js";
import { WarpDestinationModal } from "../components/WarpDestinationModal.js";

/** The pixel size a placement's PNG renders at natively (`renderLayout`,
 *  border 0): 16px per tile, same constant the CLI's `render-world --scale
 *  16` calls "full size". */
const TILE_PX = 16;

/** Placement plus optional map type/manual fields. A fresh client-side rail drop has neither yet, so readers
 *  use ""/false defaults: the user deliberately placed it and it must draw immediately, before a server round trip.
 *  Older fixtures likewise omit these fields. The wire guard below keeps accepting both shapes. */
export interface GbaWorldPlacement extends Placement {
  mapType?: string;
  manual?: boolean;
}

interface WorldPayload {
  placements: Record<string, GbaWorldPlacement>;
  components: WorldComponentInfo[];
  conflicts: WireConflict[];
  verticalLinks: VerticalLink[];
  sidecar: { dungeonAutoLayout: boolean };
}

function isWorldPayload(value: unknown): value is WorldPayload {
  return isRecord(value) && isRecord(value.placements) && Array.isArray(value.components)
    && Array.isArray(value.conflicts) && value.conflicts.every(isWireConflict)
    && Array.isArray(value.verticalLinks) && isRecord(value.sidecar)
    && typeof value.sidecar.dungeonAutoLayout === "boolean";
}

export interface GbaSurfaceWorld extends SurfaceWorld<GbaWorldPlacement, WireConflict> {
  verticalLinks: readonly VerticalLink[];
}
interface RawWorld {
  placements: Map<string, GbaWorldPlacement>;
  components: WorldComponentInfo[];
  conflicts: WireConflict[];
  verticalLinks: VerticalLink[];
  dungeonAutoLayout: boolean;
}

/** Fetch and optimistic reconciliation remain one state transition. A GET owns the ledger snapshot from issue,
 *  while its keep set is captured at landing, before any React updater can be replayed. */
export function useGbaWorld(ledger: PlacementLedger) {
  const [raw, setRaw] = useState<RawWorld | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refetchGen, setRefetchGen] = useState(0);
  const [loadedGen, setLoadedGen] = useState(0);
  const refetchGeneration = useRef(0);
  const reload = useCallback(() => {
    const next = ++refetchGeneration.current;
    setRefetchGen(next);
    return next;
  }, []);
  const dismissError = useCallback(() => setError(null), []);

  // Fetch without a ?dungeons= override: the toggle persists sidecar.dungeonAutoLayout, so this GET reflects
  // the saved layout, just like a real reload. refetchGen identifies the GET after a toggle or settled commit.
  useEffect(() => {
    let cancelled = false;
    const snap = ledger.snapshot();
    fetchGuarded("/api/world", isWorldPayload)
      .then((d) => {
        if (cancelled) return;
        // Ownership depends on the version at GET issue and landing, never on coordinates. Capture before React's updater.
        const keep = new Set(ledger.versionedMaps().filter((name) =>
          !ledger.serverShows(name, snap) || (!(name in d.placements) && !ledger.dropAbsent(name, snap))));
        setRaw((previous) => {
          const placements = new Map(Object.entries(d.placements));
          for (const name of keep) {
            const local = previous?.placements.get(name);
            if (local) placements.set(name, local);
          }
          return {
            placements,
            components: d.components,
            conflicts: d.conflicts,
            verticalLinks: d.verticalLinks,
            dungeonAutoLayout: d.sidecar.dungeonAutoLayout,
          };
        });
        setError(null);
        // Only a GET issued at or after the successful toggle clears the surface's optimistic switch.
        setLoadedGen(refetchGen);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [refetchGen, ledger]);

  // Every singleton's true size is independent of placement visibility. Memoise on components, not the world:
  // drag frames replace placements but must not rebuild this 1,209-map size table each time.
  const sizes = useMemo(() => singletonSizes(raw?.components), [raw?.components]);
  const world = useMemo<GbaSurfaceWorld | null>(() => {
    if (!raw) return null;
    // applySidecar fabricates component:-1 placements at 0x0 because it has no Project to size them.
    // Restore their singleton bounds before the shared surface fits, culls, draws, or hit-tests them.
    const placements = new Map([...raw.placements].map(([name, p]) => {
      const size = p.component === -1 ? sizes.get(name) : undefined;
      return [name, size ? { ...p, ...size } : p] as const;
    }));
    return { ...raw, placements };
  }, [raw, sizes]);
  const move = useCallback((positions: ReadonlyMap<string, { x: number; y: number }>) => {
    setRaw((previous) => {
      if (!previous) return previous;
      const placements = new Map(previous.placements);
      for (const [map, at] of positions) {
        const p = placements.get(map);
        if (p) placements.set(map, { ...p, ...at });
        else {
          // A fresh rail drop is an immediate local placement, even while absent from the server's base layout.
          const size = sizes.get(map);
          if (size) placements.set(map, { map, ...at, ...size, component: -1 });
        }
      }
      return { ...previous, placements };
    });
  }, [sizes]);
  return { world, error, reload, loadedGen, dismissError, move };
}

/** Centralise visibility.ts's optional-field fallbacks for culling, hidden counts and jump reveal.
 *  A fabricated component:-1 rail placement has no type yet; isDrawnByDefault("", false) draws it immediately. */
function drawnByDefault(p: GbaWorldPlacement): boolean {
  return isDrawnByDefault(p.mapType ?? "", p.manual ?? false);
}

/** WarpEvent plus the destination name resolved by the server route. Source and destination use tile units. */
interface WireWarpEvent extends WarpEvent {
  destMapName?: string;
}
function isWarpsPayload(value: unknown): value is { warps: WireWarpEvent[] } {
  // The existing route has no required map identity field; only the coordinates and destination fields are consumed.
  return isRecord(value) && Array.isArray(value.warps) && value.warps.every((warp: unknown) =>
    isRecord(warp) && typeof warp.x === "number" && typeof warp.y === "number"
      && (warp.destMapName === undefined || typeof warp.destMapName === "string")
      && (typeof warp.destWarpId === "string" || typeof warp.destWarpId === "number"));
}
function useGbaSurfaceCoverage() {
  const { data, error } = useCoverage();
  // Coverage names need no id/name reconciliation; levels are coloured by rank in the shared surface.
  const emptyMapNames = useMemo(() => new Set(data?.mapsWithoutEncounters ?? []), [data]);
  return { coverage: data, error, levelByMap: data?.levelByMap ?? [], emptyMapNames };
}

export function createGbaWorldSurface(): WorldSurfaceAdapter<GbaWorldPlacement, WireConflict, GbaSurfaceWorld> {
  return {
    nativePx: TILE_PX,
    useWorld: useGbaWorld,
    postPlacement: async ({ map, x, y }) => {
      // fetch rejects only network failures; HTTP 400/500 must also surface as dismissible save errors.
      const response = await fetch("/api/world/placement", { method: "POST", body: JSON.stringify({ map, x, y }) });
      if (!response.ok) throw new Error(`POST /api/world/placement -> ${response.status}`);
    },
    postDungeons: async (enabled) => {
      // Persist the toggle rather than changing only the next GET's query. The surface reloads after settlement.
      const response = await fetch("/api/world/dungeons", { method: "POST", body: JSON.stringify({ enabled }) });
      if (!response.ok) throw new Error(`POST /api/world/dungeons -> ${response.status}`);
    },
    // Save failures live in one dismissible slot, separate from GET failures, even after a later successful POST.
    saveErrorPolicy: "dismissible",
    wrapToasts: (children) => (
      <div className="world-canvas__toasts">{children}</div>
    ),
    draggingMapClass: "world-canvas__stage--dragging-map",
    // No selection pruning, filter drop guard, modified double-click, Shift-click selection or overlay-order override:
    // GBA retains the adapter defaults, including drawn-only encounter-border neighbours and unguarded group membership.
    warpOffset: 1,
    // P12-4r: fetch visible maps only while Warps is on at/above LOD, plus every filter member while lines are on.
    // The surface owns that demand scope and evicts failed entries for a retry on the next view change (P12-4s).
    fetchWarps: async (map) => {
      const payload = await fetchGuarded(`/api/warps/${encodeURIComponent(map)}`, isWarpsPayload, `/api/warps/${map}`);
      return payload.warps.map((warp): SurfaceWarp => ({
        point: { x: warp.x, y: warp.y },
        popupMap: warp.destMapName,
        resolveDestination: (cache) => {
          if (!warp.destMapName) return null;
          // Both caches must have landed. The reciprocal destWarpId indexes the exact tile; a missing index
          // supplies no endpoint, never a guessed map corner or centre. Source-map/warp order stays surface-owned.
          const destination = cache.get(warp.destMapName)?.[Number(warp.destWarpId)];
          return destination ? { map: warp.destMapName, point: destination.point } : null;
        },
      }));
    },
    renderWarpPopup: (map, onClose) => (
      <WarpDestinationModal mapName={map} onClose={onClose} />
    ),
    imageUrl: (p, version) => `/api/render/${encodeURIComponent(p.map)}.png${version ? `?v=${version}` : ""}`,
    cacheKey: 0,
    drawnByDefault,
    drawExtraLayers: (ctx, { world, view }) => {
      const style = typeof getComputedStyle === "function" ? getComputedStyle(document.documentElement) : null;
      const diveColor = style?.getPropertyValue("--link-dive").trim() || "#3b82f6";
      const emergeColor = style?.getPropertyValue("--link-emerge").trim() || "#f97316";
      const width = ctx.canvas?.width ?? Infinity;
      const height = ctx.canvas?.height ?? Infinity;
      // Vertical links have no planar meaning (excluded from buildWorld's layout): badge the source's bottom-left
      // corner. The drawing context's canvas supplies the viewport; the adapter contract needs no second measure.
      // Preserve the old layer's direct placement lookup, including its documented out-of-filter badge possibility:
      // indoor/none maps normally connect by warps, so that edge case was unreachable on the measured corpus.
      for (const link of world.verticalLinks) {
        const p = world.placements.get(link.from);
        if (!p || p.width <= 0 || p.height <= 0) continue;
        const r = rectOf(p, view);
        if (r.x + r.w <= 0 || r.y + r.h <= 0 || r.x >= width || r.y >= height) continue;
        drawTriangle(ctx, r.x + BADGE_SIZE, r.y + r.h - BADGE_SIZE, BADGE_SIZE,
          link.direction === "dive", link.direction === "dive" ? diveColor : emergeColor);
      }
    },
    conflictTooltip: (c) => `${c.map}: via ${c.viaA.from} (${c.viaA.x},${c.viaA.y}) `
      + `disagrees with via ${c.viaB.from} (${c.viaB.x},${c.viaB.y})`,
    // Fetch every visible map independently of the border toggle, so enabling it shows cached summaries at once.
    // Summarise only on arrival. Failed maps are counted/disclosed by the surface instead of claiming no encounters.
    fetchEncounters: async (map) => {
      const url = `/api/encounters/${encodeURIComponent(map)}`;
      const { methods } = await fetchGuarded(url, isGbaEncountersPayload, url);
      // Reuse the border's fetched rows for the method lens: water > fishing > rock smash is display priority.
      const methodTint = methods.some((row) => row.method === "water_mons") ? "var(--encounter-water)"
        : methods.some((row) => row.method === "fishing_mons") ? "var(--encounter-fishing)"
        : methods.some((row) => row.method === "rock_smash_mons") ? "var(--encounter-rock-smash)" : null;
      return { summaries: summariseGba(methods), methodTint };
    },
    border: { band: BORDER_BAND.gba },
    useCoverage: useGbaSurfaceCoverage,
    lensLegend: {},
    // Counts and rail membership stay WORLD-wide even in dungeon mode. A rail drop adds to the world, not the dungeon.
    statusItems: ({ world, hiddenCount, unplacedCount, acceptedCount, hover }) => (
      <>
        <span className="world-canvas__status-item">
          {"placed "}
          <strong>{world ? world.placements.size : 0}</strong>
          {" · hidden "}
          <strong>{hiddenCount}</strong>
          {" · unplaced "}
          <strong>{unplacedCount}</strong>
          {" · "}
          <strong>{world ? world.conflicts.length : 0}</strong>
          {" conflicts · "}
          <strong>{acceptedCount}</strong>
          {" accepted"}
        </span>
        {hover ? (
          <span className="world-canvas__status-item world-canvas__hover">
            {hover.map}
            {hover.component ? ` · ${hover.component.maps.length}-map component` : " · manual placement (unknown component)"}
            {" · Shift+drag to move"}
          </span>
        ) : (
          <span className="world-canvas__status-item world-canvas__hover world-canvas__hover--empty">
            Hover the world…
          </span>
        )}
      </>
    ),
    // Dungeon, Warps and optional lines already occupy their original leading positions in the surface.
    // EncounterFetchAlert precedes the grow group (SpeciesSpotlight, lenses), then zoom readout and Fit.
    toolbarExtras: undefined,
    toolbarAfterEncounter: undefined,
    legendExtras: (
      <>
        <span className="world-canvas__legend-item">
          <i className="world-canvas__swatch world-canvas__swatch--dive" /> Dive
        </span>
        <span className="world-canvas__legend-item">
          <i className="world-canvas__swatch world-canvas__swatch--emerge" /> Emerge
        </span>
      </>
    ),
  };
}

function drawTriangle(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, pointDown: boolean, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  if (pointDown) {
    ctx.moveTo(cx - size, cy - size);
    ctx.lineTo(cx + size, cy - size);
    ctx.lineTo(cx, cy + size);
  } else {
    ctx.moveTo(cx - size, cy + size);
    ctx.lineTo(cx + size, cy + size);
    ctx.lineTo(cx, cy - size);
  }
  ctx.closePath();
  ctx.fill();
}

