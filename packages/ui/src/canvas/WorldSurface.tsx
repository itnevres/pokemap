import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { WireConflict } from "@pokemap/core/src/world/conflictAcceptance.js";
import { drawDiamond, themedLevelColorMap } from "../components/WorldCanvas.js";
import { SpeciesSpotlight } from "../components/SpeciesSpotlight.js";
import type { MapView } from "../components/mapView.js";
import type { LensId } from "../components/LensPanel.js";
import { WorldContextMenu } from "../components/WorldContextMenu.js";
import { EncounterBorder } from "../shared/EncounterBorder.js";
import { pickBorderSide, type Rect } from "../encounters/borderSide.js";
import { useFitShortcut } from "../shared/useFitShortcut.js";
import { useWorldContext } from "../shared/useWorldContext.js";
import { WorldContextOverlayMount } from "../shared/WorldContextOverlay.js";
import { createPlacementLedger } from "../shared/placementLedger.js";
import { LensOverlay, useLensOverlayEntries } from "../shared/LensOverlay.js";
import { SpotlightOverlay } from "../shared/SpotlightOverlay.js";
import { EncounterFetchAlert, WorldLensControl, WorldLensLegend } from "../shared/WorldLensControls.js";
import { ConflictErrorToast, ConflictLegendItems, ConflictTooltip } from "../shared/WorldConflictOverlays.js";
import { BADGE_SIZE, conflictBadgeCenter } from "../shared/worldBadges.js";
import { useConflictAcceptanceMenu } from "../world/useConflictAcceptance.js";
import { conflictBadgeOffsets } from "../world/conflictAcceptance.js";
import { UnplacedRail } from "../world/UnplacedRail.js";
import { useStage } from "./useStage.js";
import { useWorldTiles } from "./useWorldTiles.js";
import {
  LOD_SCALE,
  WHEEL_FACTOR,
  computeFit,
  fitClusters,
  fitFilter,
  jumpFit,
  rectOf,
  singletonSizes,
  smallTilesAt,
  worldZoomBounds,
  worldZoomRange,
} from "./worldView.js";
import type { View } from "./view.js";
import type { EncounterEntry, SurfacePlacement, SurfaceWorld, WorldSurfaceAdapter } from "./worldSurfaceAdapter.js";

/** `fitted` lives in the one view value so a fit sets zoom, pan and `fitted` in one update. */
interface WorldView extends View {
  fitted?: boolean;
}
type Hit = { mapName?: string; percent: number; minLevel: number; maxLevel: number };
type Badge = { x: number; y: number; key: string; map: string; accepted: boolean; text: string };

const JUMP_HIGHLIGHT_MS = 2000;
const FAILED_ENCOUNTERS: EncounterEntry = { summaries: [], methodTint: null };
const sizeOf = <P extends SurfacePlacement>(p: P) => p;

function screenRect(p: SurfacePlacement, view: View): Rect {
  const r = rectOf(p, view);
  return { x: r.x, y: r.y, width: r.w, height: r.h };
}

function hasSize(p: SurfacePlacement | undefined): p is SurfacePlacement {
  return !!p && p.width > 0 && p.height > 0;
}

export interface WorldSurfaceProps<P extends SurfacePlacement, C extends WireConflict, W extends SurfaceWorld<P, C> = SurfaceWorld<P, C>> {
  adapter: WorldSurfaceAdapter<P, C, W>;
  mapFilter?: Set<string> | null;
  jumpToMap?: string | null;
  jumpToken?: number;
  onSelectMap?(name: string): void;
  onOpenMap?(name: string): void;
  onJumpToMap?(name: string): void;
  onPlacementsSaved?(names: string[]): void;
  onLayoutChanged?(): void;
  onEditHere?(name: string): void;
  context?: {
    map: string;
    origin: { x: number; y: number } | null;
    renderCanvas(view: MapView, onViewChange: (v: MapView) => void): ReactNode;
    onExitRequest(): void;
  };
  tileVersions?: Record<string, number>;
}

export function WorldSurface<P extends SurfacePlacement, C extends WireConflict, W extends SurfaceWorld<P, C> = SurfaceWorld<P, C>>(
  props: WorldSurfaceProps<P, C, W>,
) {
  const { adapter, mapFilter = null, jumpToMap, jumpToken, onOpenMap, onJumpToMap, onEditHere, context, tileVersions } = props;
  const [ledger] = useState(createPlacementLedger);
  const { world, error } = adapter.useWorld(ledger);
  const coverage = adapter.useCoverage();

  const fitRef = useRef<() => void>(() => {});
  const stableFit = useCallback(() => fitRef.current(), []);
  // The context hook needs the stage's outputs, so the in-context cap reaches the zoom clamp through a ref,
  // published at commit so a suspended render never leaks its cap into a wheel event.
  const maxZoomRef = useRef<(base: number) => number>((base) => base);
  const boundsFor = useCallback((z: number) => worldZoomBounds(adapter.nativePx, z, maxZoomRef.current), [adapter.nativePx]);
  // One view value updated by pure functions: StrictMode double-invokes updaters, so a setter nested in another's
  // updater would apply pan twice. `chromeless`: the surface binds F itself below; no ContextMapFit provider wraps a
  // world canvas, so the stage's context fit stays inert.
  const { canvasRef, containerRef, viewport, view, updateView } = useStage<WorldView>({
    zoomPolicy: { kind: "continuous", factor: WHEEL_FACTOR, ...worldZoomRange(adapter.nativePx), boundsFor },
    mapName: "world",
    imgLoaded: false,
    pixelWidth: 0,
    pixelHeight: 0,
    bandNative: 0,
    side: "right",
    fit: stableFit,
    chromeless: true,
  });
  const { conflictAcceptance, contextMenu, snapPointerRef } = useConflictAcceptanceMenu({
    conflicts: world?.conflicts,
    canvasRef,
    onOpenMap,
    onEditHere,
  });
  const inScope = useCallback((map: string) => !mapFilter || mapFilter.has(map), [mapFilter]);
  const contextPlacement = context && inScope(context.map) ? world?.placements.get(context.map) : undefined;
  const worldContext = useWorldContext({
    native: adapter.nativePx,
    context: context ?? null,
    placement: hasSize(contextPlacement) ? contextPlacement : null,
    world: { pan: view.pan, zoom: view.zoom, setView: (v) => updateView((prev) => ({ ...prev, zoom: v.zoom, pan: v.pan })) },
    viewport,
    canvasRef,
    snapPointerRef,
    isBlocked: () => contextMenu.menu !== null,
  });

  // Set by the first fit that lands (any fit or a jump), not the first attempt: a world or filter with nothing
  // sized to fit would otherwise stay unfitted, and draw nothing, until the user pressed Fit.
  const initialFitDone = useRef(false);
  // Manual and filter fit (P12-4m): the filter's anchored members, else the multi-map clusters.
  const fitWorld = useCallback(() => {
    if (!world) return;
    const bounds = mapFilter
      ? fitFilter(world.placements.values(), mapFilter, world.components)
      : fitClusters(world.placements.values(), world.components);
    if (!bounds) return;
    initialFitDone.current = true;
    updateView({ ...computeFit(bounds, viewport, worldZoomRange(adapter.nativePx)), fitted: true });
  }, [world, mapFilter, viewport, adapter.nativePx, updateView]);
  const fit = () => {
    if (worldContext.inContext) worldContext.fit();
    else fitWorld();
  };
  useLayoutEffect(() => {
    maxZoomRef.current = worldContext.maxWorldZoom;
    fitRef.current = fit;
  });
  const fitEnabled = !worldContext.inContext || worldContext.fitEnabled;
  useFitShortcut(fit, fitEnabled);

  // Initial fit, once, when the world and a measured viewport both exist. It sets `fitted` in the same update as
  // zoom and pan, and `visible` stays [] until then: culling against the mount default (zoom 1, pan 0) once
  // fetched and decoded ~308 of 391 map renders (measured live) where the fit shows ~80 (spec review F5).
  useEffect(() => {
    if (!world || initialFitDone.current || viewport.w <= 0 || viewport.h <= 0) return;
    fitWorld();
  }, [world, viewport, fitWorld]);

  // Fit once per filter Set instance, reset when the filter goes null so a re-open re-fits. `world` is a new
  // object on every drag frame, so without the stamp this re-fit mid-drag and stomped the user's view.
  const fittedFilter = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!mapFilter) {
      fittedFilter.current = null;
      return;
    }
    if (!world || viewport.w <= 0 || viewport.h <= 0 || fittedFilter.current === mapFilter) return;
    fittedFilter.current = mapFilter;
    fitWorld();
  }, [mapFilter, world, viewport, fitWorld]);

  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [selected] = useState<Set<string>>(() => new Set()); // Task 6: selection interaction sets this.
  // { map, token }: a fresh object per jump, so the fade effect restarts even on a same-map re-jump.
  const [jumpHighlight, setJumpHighlight] = useState<{ map: string; token: number } | null>(null);

  // Map-list jump (P12-4m/p/q/u). Until the world, a measured viewport and a filter that includes the map all
  // exist, the token stays unstamped so the jump retries when they change (a tree click can precede the GET).
  const appliedJump = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (jumpToken === undefined || jumpToken === appliedJump.current) return;
    if (!jumpToMap || !world || viewport.w <= 0 || viewport.h <= 0 || !inScope(jumpToMap)) return;
    appliedJump.current = jumpToken;
    const p = world.placements.get(jumpToMap);
    if (!hasSize(p)) return;
    if (!mapFilter && !adapter.drawnByDefault(p)) setRevealed((old) => (old.has(p.map) ? old : new Set(old).add(p.map)));
    initialFitDone.current = true;
    updateView({ ...jumpFit(p, viewport, worldZoomRange(adapter.nativePx)), fitted: true });
    setJumpHighlight({ map: p.map, token: jumpToken });
  }, [jumpToken, jumpToMap, world, mapFilter, inScope, viewport, adapter, updateView]);

  // The fade has its own effect scoped to the highlight alone: the jump effect also depends on `viewport`, so a
  // resize there would cancel the pending timer and never reschedule it.
  useEffect(() => {
    if (!jumpHighlight) return;
    const timer = setTimeout(() => setJumpHighlight(null), JUMP_HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [jumpHighlight]);

  // Everything drawn, in world placement order (P12-4t), with no pan/zoom dependency.
  const drawn = useMemo(() => {
    if (!world) return [];
    return [...world.placements.values()].filter((p) =>
      hasSize(p) && inScope(p.map) && (mapFilter !== null || adapter.drawnByDefault(p) || revealed.has(p.map)));
  }, [world, inScope, mapFilter, adapter, revealed]);
  // Culled to the viewport (AABB), and [] before the fit lands (see the initial-fit comment).
  const visible = useMemo(() => {
    if (!view.fitted) return [];
    const x0 = -view.pan.x / view.zoom;
    const y0 = -view.pan.y / view.zoom;
    const x1 = (viewport.w - view.pan.x) / view.zoom;
    const y1 = (viewport.h - view.pan.y) / view.zoom;
    return drawn.filter((p) => p.x < x1 && p.x + p.width > x0 && p.y < y1 && p.y + p.height > y0);
  }, [drawn, view, viewport]);
  const tiles = useWorldTiles({
    visible,
    imageUrl: adapter.imageUrl,
    sizeOf,
    nativePx: adapter.nativePx,
    cacheKey: adapter.cacheKey,
    tileVersions,
  });

  // Task 6 reads these for the conflict tooltip.
  const badgesRef = useRef<Badge[]>([]);
  // Tiles, then the adapter's extra layers, then conflict badges.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const small = smallTilesAt(view.zoom, adapter.nativePx);
    for (const p of visible) {
      const tile = tiles.tileFor(p.map);
      if (!tile) continue;
      const r = rectOf(p, view);
      ctx.drawImage(small ? tile.small : tile.img, r.x, r.y, r.w, r.h);
    }
    if (!world || !view.fitted) {
      badgesRef.current = [];
      return;
    }
    adapter.drawExtraLayers?.(ctx, { world, view, inScope });
    // Conflict badges are always drawn, never behind a toggle: connection bugs become visible as geometry.
    const style = typeof getComputedStyle === "function" ? getComputedStyle(document.documentElement) : null;
    const conflictColour = style?.getPropertyValue("--danger").trim() || "#ef4444";
    const acceptedColour = style?.getPropertyValue("--text-muted").trim() || "#6b7280";
    const tickColour = style?.getPropertyValue("--text-primary").trim() || "#fff";
    const offsets = conflictBadgeOffsets(world.conflicts, BADGE_SIZE * 2 + 2);
    const badges: Badge[] = [];
    for (const c of world.conflicts) {
      const p = world.placements.get(c.map);
      if (!inScope(c.map) || !hasSize(p)) continue;
      const { cx, cy } = conflictBadgeCenter(p, p, view.zoom, view.pan, offsets.get(c.key) ?? 0);
      const accepted = conflictAcceptance.isAccepted(c);
      drawDiamond(ctx, cx, cy, BADGE_SIZE, accepted ? acceptedColour : conflictColour);
      if (accepted) {
        ctx.fillStyle = tickColour;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("✓", cx, cy);
      }
      const prefix = accepted ? "Accepted (right-click to un-accept). " : "";
      badges.push({ x: cx, y: cy, key: c.key, map: c.map, accepted, text: prefix + adapter.conflictTooltip(c) });
    }
    badgesRef.current = badges;
    // `viewport` stays a dependency: resizing clears the canvas, so a redraw must follow even when nothing else
    // changed (the Task 21 canvas-blanking postmortem).
  }, [canvasRef, viewport, visible, tiles.version, tiles.tileFor, view, world, adapter, inScope, conflictAcceptance.acceptedKeys]);

  // Encounters per visible map, at most once ever (not keyed on cacheKey). The placeholder (null) is written
  // synchronously so an effect re-run never refetches. A failure is counted (disclosed, not silently "no
  // encounters") and stored as loaded-empty so the map never retries in a loop.
  const encounterCache = useRef(new Map<string, EncounterEntry | null>());
  const [encounterVersion, setEncounterVersion] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  useEffect(() => {
    for (const p of visible) {
      if (encounterCache.current.has(p.map)) continue;
      encounterCache.current.set(p.map, null);
      adapter.fetchEncounters(p.map).then(
        (entry) => {
          encounterCache.current.set(p.map, entry);
          setEncounterVersion((v) => v + 1);
        },
        () => {
          encounterCache.current.set(p.map, FAILED_ENCOUNTERS);
          setFailedCount((n) => n + 1);
          setEncounterVersion((v) => v + 1);
        },
      );
    }
  }, [visible, adapter]);

  // The one projection (P12-6): every overlay reads these rects.
  const rectByMap = useMemo(() => new Map(visible.map((p) => [p.map, screenRect(p, view)])), [visible, view]);
  // Border side over every drawn placement, not just visible ones: an off-screen neighbour still blocks a side.
  // ponytail: O(n^2) over ~391 maps, once per drawn set; a spatial index if n grows.
  const sideByMap = useMemo(() => {
    const rects = drawn.map((p) => ({ x: p.x, y: p.y, width: p.width, height: p.height }));
    return new Map(drawn.map((p, i) => [p.map, pickBorderSide(rects[i]!, rects, adapter.border.band)]));
  }, [drawn, adapter.border.band]);
  // `summaries` is undefined while loading, [] once a fetch failed. `encounterVersion` is not read: it is the
  // cache-bust for `encounterCache`, a ref (the lens entries take it for the same reason).
  const borderEntries = useMemo(() => visible.map((p) => ({
    map: p.map,
    rect: rectByMap.get(p.map)!,
    side: sideByMap.get(p.map) ?? "left" as const,
    summaries: encounterCache.current.get(p.map)?.summaries,
  })), [visible, rectByMap, sideByMap, encounterVersion]);

  const [lens, setLens] = useState<LensId | null>(null);
  const [spotlightHits, setSpotlightHits] = useState<Hit[] | null>(null);
  const levelColorByMap = useMemo(() => themedLevelColorMap(coverage.levelByMap), [coverage.levelByMap]);
  const methodTintFor = useCallback((map: string) => encounterCache.current.get(map)?.methodTint ?? null, []);
  const rectFor = useCallback((p: P) => rectByMap.get(p.map)!, [rectByMap]);
  const lensEntries = useLensOverlayEntries({
    lens,
    visible,
    rectFor,
    levelColorByMap,
    emptyMapNames: coverage.emptyMapNames,
    methodTintFor,
    encounterVersion,
  });
  // The best-percent hit per map.
  const spotlightByMap = useMemo(() => {
    const out = new Map<string, Hit>();
    for (const h of spotlightHits ?? []) {
      if (!h.mapName) continue;
      const best = out.get(h.mapName);
      if (!best || best.percent < h.percent) out.set(h.mapName, h);
    }
    return out;
  }, [spotlightHits]);
  const spotlightEntries = !spotlightHits ? [] : visible.map((p) => ({ map: p.map, rect: rectByMap.get(p.map)!, hit: spotlightByMap.get(p.map) ?? null }));

  const unplacedNames = useMemo(
    () => [...singletonSizes(world?.components).keys()].filter((name) => !world?.placements.has(name)).sort(),
    [world],
  );
  const [railFilter, setRailFilter] = useState("");
  const hiddenCount = useMemo(() => (world
    ? [...world.placements.values()].filter((p) => hasSize(p) && !adapter.drawnByDefault(p) && !revealed.has(p.map)).length
    : 0), [world, adapter, revealed]);
  const zoomPercent = Math.round(view.zoom / adapter.nativePx * 100);
  // A drawn but culled in-scope map falls back to rectOf, the same projection.
  const outline = (map: string): Rect | null => {
    const p = world?.placements.get(map);
    if (!hasSize(p) || !inScope(map)) return null;
    return rectByMap.get(map) ?? screenRect(p, view);
  };
  const jumpRect = jumpHighlight ? outline(jumpHighlight.map) : null;
  const fitButton = (
    <button type="button" className="map-canvas__btn" onClick={fit} disabled={!fitEnabled} title="Fit to screen (F)">
      Fit
    </button>
  );

  // Task 6: drag, selection, keyboard, hover, menus, warps, layout, placement and rail-drop handlers.
  return (
    <section className="world-canvas" aria-label="World canvas">
      <div className="world-canvas__toolbar">
        {adapter.fitFirst && <div className="world-canvas__toolbar-group">{fitButton}</div>}
        {adapter.toolbarExtras}
        <EncounterFetchAlert count={failedCount} />
        <div className="world-canvas__toolbar-group world-canvas__toolbar-group--grow">
          <SpeciesSpotlight<Hit> onHits={setSpotlightHits} />
          {/* A failed /api/coverage replaces the lenses with an error rather than claiming "0 maps have no
              encounters"; the spotlight has its own fetch and is unaffected. */}
          <WorldLensControl error={coverage.error} lens={lens} onChange={setLens} />
        </div>
        {!adapter.fitFirst && (
          <div className="world-canvas__toolbar-group">
            <span className="world-canvas__zoom-readout">{zoomPercent}%</span>
            {fitButton}
          </div>
        )}
      </div>
      <WorldLensLegend
        error={coverage.error}
        lens={lens}
        coverage={coverage.coverage}
        onJumpToMap={onJumpToMap}
        {...adapter.lensLegend}
      />
      <div className="world-canvas__legend">
        <ConflictLegendItems />
        {adapter.legendExtras}
      </div>
      <div className="world-canvas__body">
        <div className="world-canvas__viewport" ref={containerRef}>
          {!world && (
            <p className="app__canvas-placeholder">{error ? `Could not load the world: ${error}` : "Loading world…"}</p>
          )}
          <canvas
            ref={canvasRef}
            className="world-canvas__stage"
            width={viewport.w}
            height={viewport.h}
            tabIndex={0}
            aria-label={adapter.canvasLabel}
          />
          <EncounterBorder
            entries={borderEntries}
            zoom={view.zoom}
            lodZoom={adapter.nativePx * LOD_SCALE}
            {...adapter.border}
          />
          {selected.size > 0 && (
            <div className="world-canvas__selection" aria-hidden="true">
              {[...selected].map((map) => {
                const r = outline(map);
                return r && (
                  <div
                    key={map}
                    className="world-canvas__selection-outline"
                    data-map={map}
                    style={{ left: r.x, top: r.y, width: r.width, height: r.height }}
                  />
                );
              })}
            </div>
          )}
          {jumpHighlight && jumpRect && (
            <div className="world-canvas__selection" aria-hidden="true">
              {/* Keyed on the token: a same-map re-jump would otherwise reuse the node whose `forwards` fade
                  animation already finished, so the flash would not restart (P12-4p). */}
              <div
                key={jumpHighlight.token}
                className="world-canvas__selection-outline world-canvas__jump-highlight"
                style={{ left: jumpRect.x, top: jumpRect.y, width: jumpRect.width, height: jumpRect.height }}
              />
            </div>
          )}
          <LensOverlay lens={lens} entries={lensEntries} />
          <SpotlightOverlay hits={spotlightHits} entries={spotlightEntries} />
          <WorldContextOverlayMount context={context} ctx={worldContext} />
          <ConflictTooltip tooltip={null} />
          <WorldContextMenu menu={contextMenu.menu} viewport={viewport} onClose={contextMenu.close} />
          <ConflictErrorToast error={conflictAcceptance.error} onDismiss={() => conflictAcceptance.setError(null)} />
          {/* Task 6: warp overlays and popup, save and reload alerts. */}
        </div>
        <UnplacedRail unplacedNames={unplacedNames} filter={railFilter} onFilterChange={setRailFilter} />
      </div>
      <div className="world-canvas__status">
        {adapter.statusItems({
          world,
          mapFilter,
          zoomPercent,
          hiddenCount,
          unplacedCount: unplacedNames.length,
          acceptedCount: conflictAcceptance.acceptedCount,
          hover: null,
        })}
      </div>
    </section>
  );
}
