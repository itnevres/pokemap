import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { WireConflict } from "@pokemap/core/src/world/conflictAcceptance.js";
import { drawDiamond, themedLevelColorMap } from "./worldColours.js";
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
import { DungeonAutoLayoutSwitch, WorldToolbarSwitch } from "../world/DungeonAutoLayoutSwitch.js";
import { useStage } from "./useStage.js";
import { useWorldDrag, type WorldDragMove } from "./useWorldDrag.js";
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
  screenToWorld,
  worldToScreen,
  warpPoint,
  warpHit,
  hitPlacement,
  zoomWorldAboutPivot,
} from "./worldView.js";
import type { View } from "./view.js";
import type { EncounterEntry, SurfacePlacement, SurfaceWarp, SurfaceWorld, WorldSurfaceAdapter,
  WorldStatus, WorldOverlay } from "./worldSurfaceAdapter.js";

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
  const { adapter, mapFilter = null, jumpToMap, jumpToken, onOpenMap, onJumpToMap, onEditHere, context, tileVersions,
    onSelectMap, onPlacementsSaved, onLayoutChanged } = props;
  const [ledger] = useState(createPlacementLedger);
  const { world, error, reload, loadedGen, dismissError, move } = adapter.useWorld(ledger);
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
  const cancelDrag = useRef<() => void>(() => {});
  const stage = useStage<WorldView>({
    zoomPolicy: { kind: "continuous", factor: WHEEL_FACTOR, ...worldZoomRange(adapter.nativePx), boundsFor },
    mapName: "world",
    imgLoaded: false,
    pixelWidth: 0,
    pixelHeight: 0,
    bandNative: 0,
    side: "right",
    fit: stableFit,
    chromeless: true,
    onCancel: () => cancelDrag.current(),
  });
  const { canvasRef, containerRef, viewport, view, updateView } = stage;
  const { conflictAcceptance, contextMenu, snapPointerRef, menuPointRef, requestEditHere } = useConflictAcceptanceMenu({
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
    // The snap waits for the first fit: an earlier snap would be overwritten when the fit lands.
    placement: view.fitted && hasSize(contextPlacement) ? contextPlacement : null,
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
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [hover, setHover] = useState<WorldStatus<P, C, W>["hover"]>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  useEffect(() => {
    setHover(null);
    setTooltip(null);
    if (adapter.pruneSelectionOnFilter && mapFilter) {
      setSelected((current) => new Set([...current].filter((name) => mapFilter.has(name))));
    }
  }, [mapFilter, adapter.pruneSelectionOnFilter]);
  // { map, token }: a fresh object per jump, so the fade effect restarts even on a same-map re-jump.
  const [jumpHighlight, setJumpHighlight] = useState<{ map: string; token: number } | null>(null);

  // Map-list jump (P12-4m/p/q/u). Until the world and a filter that includes the map both exist, the token stays
  // unstamped so the jump retries when they change (a tree click can precede the GET). The highlight and reveal land
  // then; the jump fit waits for a measured viewport (both source canvases highlighted with no viewport measured).
  // The pending fit keeps the map name and re-resolves it when it lands: a filter that excludes the map by then
  // drops the fit (the filter fit stands), and a moved placement fits where it is now.
  const appliedJump = useRef<number | undefined>(undefined);
  const pendingJumpFit = useRef<string | null>(null);
  useEffect(() => {
    if (jumpToken !== undefined && jumpToken !== appliedJump.current && jumpToMap && world && inScope(jumpToMap)) {
      appliedJump.current = jumpToken;
      const p = world.placements.get(jumpToMap);
      pendingJumpFit.current = hasSize(p) ? p.map : null;
      if (hasSize(p)) {
        if (!mapFilter && !adapter.drawnByDefault(p)) setRevealed((old) => (old.has(p.map) ? old : new Set(old).add(p.map)));
        setJumpHighlight({ map: p.map, token: jumpToken });
      }
    }
    const name = pendingJumpFit.current;
    if (!name || viewport.w <= 0 || viewport.h <= 0) return;
    pendingJumpFit.current = null;
    const p = world?.placements.get(name);
    if (!hasSize(p) || !inScope(name)) return;
    initialFitDone.current = true;
    updateView({ ...jumpFit(p, viewport, worldZoomRange(adapter.nativePx)), fitted: true });
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

  // Draw records feed the conflict tooltip and context-menu hit tests.
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
  // A "scoped" adapter also counts in-scope placements its visibility predicate hides (adapter fact).
  // ponytail: O(n^2) over ~391 maps, once per drawn set; a spatial index if n grows.
  const sideByMap = useMemo(() => {
    const neighbours = adapter.borderNeighbours === "scoped" && world
      ? [...world.placements.values()].filter((p) => hasSize(p) && inScope(p.map))
      : drawn;
    const rects = neighbours.map((p) => ({ x: p.x, y: p.y, width: p.width, height: p.height }));
    return new Map(neighbours.map((p, i) => [p.map, pickBorderSide(rects[i]!, rects, adapter.border.band)]));
  }, [drawn, world, inScope, adapter.borderNeighbours, adapter.border.band]);
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
  const spotlightEntries = !spotlightHits ? [] : visible.map((p) => ({
    map: p.map,
    rect: rectByMap.get(p.map)!,
    hit: spotlightByMap.get(p.map) ?? null,
  }));

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

  const [saveError, setSaveError] = useState<{ map: string; message: string } | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const perMapErrors = adapter.saveErrorPolicy === "per-map";
  const messageOf = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);
  // Catch each outcome before joining: a first rejection must not reload over the other members' pending positions.
  // Each POST resolves only its gesture version. A later gesture owns the position even if this POST lands last.
  const commit = (moves: WorldDragMove[]) => {
    if (!world || !adapter.postPlacement || !moves.length) return;
    const post = adapter.postPlacement;
    void Promise.all(moves.map(async ({ map, x, y, version }) => {
      ledger.moved(map, version);
      try {
        await post({ map, x, y }, world);
        ledger.resolve(map, version, true);
        if (perMapErrors) setSaveError((current) => current?.map === map ? null : current);
        return map;
      } catch (cause) {
        ledger.resolve(map, version, false);
        // Save failures leave a working canvas in place. The next GET reconciles the failed optimistic position.
        setSaveError({ map, message: messageOf(cause) });
        return null;
      }
    })).then((saved) => {
      reload();
      const names = saved.filter((name): name is string => name !== null);
      if (names.length) onPlacementsSaved?.(names);
    });
  };
  const toWorld = (sx: number, sy: number) => screenToWorld({ x: sx, y: sy }, view);
  const hitTest = (wx: number, wy: number) => hitPlacement(drawn, wx, wy);
  const drag = useWorldDrag({
    stage,
    toWorld,
    hitTest,
    // Membership follows retained selection; only the gesture's hit test is restricted to drawn, in-scope maps.
    placement: (map) => world?.placements.get(map),
    selected,
    setSelected: (update) => setSelected(update),
    movePlacements: move,
    marqueeCandidates: () => visible,
    ledger,
    commit,
  });
  useLayoutEffect(() => { cancelDrag.current = drag.cancel; });

  const [dungeonsPending, setDungeonsPending] = useState<boolean | null>(null);
  const toggleGeneration = useRef(0);
  const toggleReloadGeneration = useRef<number | null>(null);
  const dungeonsOn = dungeonsPending ?? world?.dungeonAutoLayout ?? true;
  useEffect(() => {
    if (world && toggleReloadGeneration.current !== null && loadedGen >= toggleReloadGeneration.current) {
      toggleReloadGeneration.current = null;
      setDungeonsPending(null);
    }
  }, [world, loadedGen]);
  const toggleDungeons = async () => {
    if (!world || !adapter.postDungeons) return;
    const next = !dungeonsOn;
    const generation = ++toggleGeneration.current;
    toggleReloadGeneration.current = null;
    setDungeonsPending(next);
    try {
      await adapter.postDungeons(next, world);
      if (generation !== toggleGeneration.current) return;
      if (perMapErrors) setLayoutError(null);
      toggleReloadGeneration.current = reload();
      onLayoutChanged?.();
    } catch (cause) {
      if (generation !== toggleGeneration.current) return;
      setDungeonsPending(null);
      // An ignored older success may have changed the server: reload even after a failed latest toggle.
      reload();
      if (perMapErrors) setLayoutError(messageOf(cause));
      else setSaveError({ map: "", message: messageOf(cause) });
    }
  };

  const [warpsOn, setWarpsOn] = useState(false);
  const [linesOn, setLinesOn] = useState(false);
  const [warpError, setWarpError] = useState<string | null>(null);
  const [warpPopup, setWarpPopup] = useState<string | null>(null);
  const [warpVersion, setWarpVersion] = useState(0);
  const warpCache = useRef(new Map<string, readonly SurfaceWarp[] | null>());
  const warpRequests = useRef(new Map<string, object>());
  // Sample current adapter/world only when the scope or view changes. Error renders, new adapter objects and a
  // cache-version bump are not retry triggers: deleting a failed entry must never create a fetch/error render loop.
  const warpInputs = useRef({ adapter, world });
  useLayoutEffect(() => { warpInputs.current = { adapter, world }; });
  const warpNames = new Set<string>();
  if (warpsOn && !smallTilesAt(view.zoom, adapter.nativePx)) visible.forEach((p) => warpNames.add(p.map));
  if (mapFilter && linesOn) mapFilter.forEach((name) => {
    if (world?.placements.has(name)) warpNames.add(name);
  });
  const warpScope = JSON.stringify([...warpNames].sort());
  useEffect(() => {
    const current = warpInputs.current;
    if (!current.world || !current.adapter.fetchWarps) return;
    const names = JSON.parse(warpScope) as string[];
    for (const name of names) {
      if (warpCache.current.has(name)) continue;
      const request = {};
      warpCache.current.set(name, null);
      warpRequests.current.set(name, request);
      // Promise.resolve also routes a synchronous adapter failure into the same observable alert and retry policy.
      void Promise.resolve().then(() => {
        if (warpRequests.current.get(name) !== request) return null;
        return current.adapter.fetchWarps!(name, current.world!);
      }).then((warps) => {
        if (warpRequests.current.get(name) !== request || warps === null) return;
        warpRequests.current.delete(name);
        warpCache.current.set(name, warps);
        setWarpVersion((v) => v + 1);
      }).catch((cause: unknown) => {
        if (warpRequests.current.get(name) !== request) return;
        warpRequests.current.delete(name);
        warpCache.current.delete(name);
        setWarpError(messageOf(cause));
      });
    }
  }, [warpScope, view, warpsOn, linesOn, mapFilter, viewport.w, viewport.h]);
  useEffect(() => () => {
    for (const name of warpRequests.current.keys()) warpCache.current.delete(name);
    warpRequests.current.clear();
  }, []);
  const warpMarkerEntries = useMemo(() => {
    if (!warpsOn || smallTilesAt(view.zoom, adapter.nativePx)) return [];
    return visible.flatMap((p) => (warpCache.current.get(p.map) ?? []).map((warp, index) => {
      const point = warpPoint(p, warp.point, adapter.warpOffset ?? 1, view);
      return { key: `${p.map}:${index}`, sx: point.x, sy: point.y, warp };
    }));
  }, [warpsOn, visible, view, adapter.nativePx, adapter.warpOffset, warpVersion]);
  const connectionLines = useMemo(() => {
    if (!mapFilter || !linesOn || !world) return [];
    const style = typeof getComputedStyle === "function" ? getComputedStyle(document.documentElement) : null;
    const colors = adapter.connectionColors ?? [
      { token: "--connection-1", fallback: "#e879f9" },
      { token: "--connection-2", fallback: "#34d399" },
      { token: "--connection-3", fallback: "#fb923c" },
      { token: "--connection-4", fallback: "#60a5fa" },
      { token: "--connection-5", fallback: "#facc15" },
      { token: "--connection-6", fallback: "#f472b6" },
      { token: "--connection-7", fallback: "#2dd4bf" },
      { token: "--connection-8", fallback: "#a78bfa" },
    ];
    const palette = colors.map((c) => style?.getPropertyValue(c.token).trim() || c.fallback);
    const lines: Array<{ key: string; x1: number; y1: number; x2: number; y2: number; color: string }> = [];
    // Sort sources, keep warp order. Colours can shift while endpoints load; they settle in this stable order.
    for (const source of [...mapFilter].sort()) {
      const p = world.placements.get(source);
      if (!p) continue;
      (warpCache.current.get(source) ?? []).forEach((warp, index) => {
        const destination = adapter.resolveWarp
          ? adapter.resolveWarp(warp, warpCache.current, world)
          : warp.resolveDestination ? warp.resolveDestination(warpCache.current) : warp.destination;
        if (!destination || !mapFilter.has(destination.map)) return;
        const dest = world.placements.get(destination.map);
        if (!dest) return;
        // Both exact points use the same projection as markers, tiles and outlines; no guessed map centres.
        const a = warpPoint(p, warp.point, adapter.warpOffset ?? 1, view);
        const b = warpPoint(dest, destination.point, adapter.warpOffset ?? 1, view);
        lines.push({ key: `${source}:${index}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y,
          color: palette[lines.length % palette.length] ?? "#e879f9" });
      });
    }
    return lines;
  }, [mapFilter, linesOn, world, view, adapter, warpVersion]);

  const localPoint = (e: MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const markerAt = (e: MouseEvent<HTMLCanvasElement>) => {
    const s = localPoint(e);
    return warpHit(warpMarkerEntries, s.x, s.y);
  };
  const onClick = (e: MouseEvent<HTMLCanvasElement>) => {
    if (e.ctrlKey || e.metaKey || (e.shiftKey && !adapter.shiftClickSelects) || drag.dragMoved() || markerAt(e)) return;
    const s = localPoint(e);
    const w = toWorld(s.x, s.y);
    const hit = hitTest(w.x, w.y);
    setSelected(new Set(hit ? [hit.map] : []));
    // The app can veto its own selection (dirty-session confirmation); this local outline still follows the click.
    if (hit) onSelectMap?.(hit.map);
  };
  const onDoubleClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const modified = e.ctrlKey || e.metaKey;
    if (drag.dragMoved() || (modified && !adapter.modifiedDoubleClick)) return;
    const marker = !e.shiftKey && markerAt(e);
    if (marker) {
      if (marker.warp.popupMap) {
        setWarpError(null);
        setWarpPopup(marker.warp.popupMap);
      } else if (adapter.unresolvedWarpError) setWarpError(adapter.unresolvedWarpError);
      return;
    }
    const s = localPoint(e);
    const w = toWorld(s.x, s.y);
    const hit = hitTest(w.x, w.y);
    if (!hit) return;
    // Shift bypasses previews and opens Map view. Plain double-click edits here where the host provides it.
    if (e.shiftKey || !onEditHere) onOpenMap?.(hit.map);
    else if (!modified) requestEditHere(hit.map, { x: e.clientX, y: e.clientY });
  };
  const onMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    if (drag.onMouseMove(e)) return;
    const s = localPoint(e);
    const badge = badgesRef.current.find((b) => Math.hypot(b.x - s.x, b.y - s.y) <= BADGE_SIZE);
    setTooltip(badge ? { ...s, text: badge.text } : null);
    const w = toWorld(s.x, s.y);
    const hit = hitTest(w.x, w.y);
    const component = world?.components.find((c) => c.index === hit?.component) ?? null;
    setHover(hit ? { map: hit.map, placement: hit, component, width: hit.width, height: hit.height } : null);
  };
  const onContextMenu = (e: MouseEvent<HTMLCanvasElement>) => contextMenu.onContextMenu(e, (sx, sy) => {
    menuPointRef.current = { x: e.clientX, y: e.clientY };
    const badge = badgesRef.current.find((b) => Math.hypot(b.x - sx, b.y - sy) <= BADGE_SIZE) ?? null;
    const w = toWorld(sx, sy);
    return { map: badge?.map ?? hitTest(w.x, w.y)?.map ?? null, badge };
  });
  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const name = selected.size === 1 ? [...selected][0]! : null;
    const p = name && inScope(name) ? world?.placements.get(name) : undefined;
    if (contextMenu.onMenuKey(e, () => {
      if (!p) return null;
      const at = worldToScreen({ x: p.x + p.width / 2, y: p.y + p.height / 2 }, view);
      const box = canvasRef.current?.getBoundingClientRect();
      menuPointRef.current = { x: (box?.left ?? 0) + at.x, y: (box?.top ?? 0) + at.y };
      return { ...at, map: p.map };
    })) return;
    if (e.key === "Escape") setSelected(new Set());
    if (e.key === "Enter" && p) onOpenMap?.(p.map);
    if (!["+", "=", "-", "_"].includes(e.key)) return;
    e.preventDefault();
    const direction = e.key === "+" || e.key === "=" ? 1 : -1;
    // Pending context payloads must not fall through into continuous World zoom.
    if (worldContext.inContext) worldContext.stepZoom(direction);
    else updateView((v) => zoomWorldAboutPivot(v, direction === 1 ? WHEEL_FACTOR : 1 / WHEEL_FACTOR,
      viewport.w / 2, viewport.h / 2, boundsFor(v.zoom)));
  };
  const onDrop = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!world || !adapter.postPlacement) return;
    const map = e.dataTransfer.getData("text/plain");
    if (!map) return;
    const size = adapter.dropSize
      ? adapter.dropSize(map, world, mapFilter)
      : singletonSizes(world.components).get(map);
    if (!size) return;
    const box = e.currentTarget.getBoundingClientRect();
    const w = toWorld(e.clientX - box.left, e.clientY - box.top);
    const x = Math.round(w.x - size.width / 2);
    const y = Math.round(w.y - size.height / 2);
    // Begin outside the state updater and before optimistic movement, just as the drag dispatcher does.
    const version = ledger.begin(map);
    move(new Map([[map, { x, y }]]));
    commit([{ map, x, y, version }]);
  };

  // EncounterBorder owns tooltip state. Its DOM is observed for new content and for style writes, so clamping its
  // measured box also works for keyboard focus without replacing the shared border. A move between sprites with
  // the same text changes only left/top, so the anchor (not the content alone) decides a re-clamp; our own
  // translate writes leave the anchor unchanged and return early, so the attribute observer cannot loop.
  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    let clamped = "";
    const clamp = () => {
      const tip = root.querySelector<HTMLElement>(".encounter-border__tooltip");
      const anchor = tip ? `${tip.style.left}|${tip.style.top}|${tip.textContent}` : "";
      if (anchor === clamped) return;
      clamped = anchor;
      if (!tip) return;
      tip.style.maxWidth = `${viewport.w}px`;
      tip.style.boxSizing = "border-box";
      tip.style.whiteSpace = "normal";
      tip.style.overflowWrap = "anywhere";
      tip.style.translate = "0px";
      const box = tip.getBoundingClientRect();
      const frame = root.getBoundingClientRect();
      const dx = Math.max(frame.left - box.left, Math.min(0, frame.left + viewport.w - box.right));
      tip.style.translate = `${dx}px`;
    };
    const observer = new MutationObserver(clamp);
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["style"] });
    clamp();
    return () => observer.disconnect();
  }, [containerRef, viewport.w]);

  const reloadError = world && error ? `Could not reload the world: ${error}` : null;
  const dismissibleToast = (text: string | null, dismiss: () => void) => text && (
    <div className="world-canvas__toast" role="alert">
      <span className="world-canvas__toast-text">{text}</span>
      <button type="button" className="world-canvas__toast-dismiss" onClick={dismiss} aria-label="Dismiss error">
        ×
      </button>
    </div>
  );
  const toolbarError = (text: string | null) => text && (
    <div className="world-canvas__toolbar-group world-canvas__toolbar-group--save-error">
      <span className="world-canvas__toolbar-error" role="alert">{text}</span>
    </div>
  );
  const toasts = (
    <>
      <ConflictErrorToast error={conflictAcceptance.error} onDismiss={() => conflictAcceptance.setError(null)} />
      {!perMapErrors && dismissibleToast(saveError?.message ?? null, () => setSaveError(null))}
      {!perMapErrors && dismissibleToast(reloadError, dismissError)}
    </>
  );
  const overlays: Record<WorldOverlay, ReactNode> = {
    selection: selected.size > 0 && (
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
    ),
    jump: jumpHighlight && jumpRect && (
      <div className="world-canvas__selection" aria-hidden="true">
        {/* Keyed on the token: a same-map re-jump would otherwise reuse the node whose `forwards` fade
            animation already finished, so the flash would not restart (P12-4p). */}
        <div
          key={jumpHighlight.token}
          className="world-canvas__selection-outline world-canvas__jump-highlight"
          style={{ left: jumpRect.x, top: jumpRect.y, width: jumpRect.width, height: jumpRect.height }}
        />
      </div>
    ),
    warps: warpsOn && warpMarkerEntries.length > 0 && (
      <div className="world-canvas__warps" aria-hidden="true">
        {warpMarkerEntries.map((entry) => (
          <div key={entry.key} className="world-canvas__warp-marker" style={{ left: entry.sx, top: entry.sy }} />
        ))}
      </div>
    ),
    connections: mapFilter && linesOn && connectionLines.length > 0 && (
      <svg className="world-canvas__connections" aria-hidden="true">
        {connectionLines.map((line) => (
          <line key={line.key} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke={line.color} strokeWidth={2} />
        ))}
      </svg>
    ),
    marquee: drag.marqueeRect && (
      <div
        className="world-canvas__marquee"
        style={{
          left: Math.min(drag.marqueeRect.x0, drag.marqueeRect.x1),
          top: Math.min(drag.marqueeRect.y0, drag.marqueeRect.y1),
          width: Math.abs(drag.marqueeRect.x1 - drag.marqueeRect.x0),
          height: Math.abs(drag.marqueeRect.y1 - drag.marqueeRect.y0),
        }}
      />
    ),
    lens: (
      <LensOverlay lens={lens} entries={lensEntries} />
    ),
    spotlight: (
      <SpotlightOverlay hits={spotlightHits} entries={spotlightEntries} />
    ),
  };
  const overlayOrder: readonly WorldOverlay[] = adapter.overlayOrder
    ?? ["selection", "jump", "warps", "connections", "marquee", "lens", "spotlight"];
  return (
    <section className="world-canvas" aria-label="World canvas">
      <div className="world-canvas__toolbar">
        {adapter.fitFirst && <div className="world-canvas__toolbar-group">{fitButton}</div>}
        {adapter.toolbarExtras}
        {adapter.postDungeons && <DungeonAutoLayoutSwitch on={dungeonsOn} onToggle={toggleDungeons} />}
        {perMapErrors && toolbarError(layoutError ? `Could not save dungeon auto-layout: ${layoutError}` : null)}
        <WorldToolbarSwitch label="Warps" on={warpsOn} onToggle={() => {
          if (!warpsOn) setWarpError(null);
          setWarpsOn((on) => !on);
        }} />
        {mapFilter && <WorldToolbarSwitch label="Connection lines" on={linesOn} onToggle={() => {
          if (!linesOn) setWarpError(null);
          setLinesOn((on) => !on);
        }} />}
        {toolbarError(warpError ? `Warp data unavailable: ${warpError}` : null)}
        <EncounterFetchAlert count={failedCount} />
        {adapter.toolbarAfterEncounter}
        {perMapErrors && toolbarError(saveError ? `Could not save placement: ${saveError.message}` : null)}
        {perMapErrors && reloadError && (
          // Text truncates independently; putting the button inside it would clip the dismiss control.
          <div className="world-canvas__toolbar-group world-canvas__toolbar-group--save-error" role="alert">
            <span className="world-canvas__toolbar-error">{reloadError}</span>
            <button type="button" className="world-canvas__toast-dismiss" aria-label="Dismiss error" onClick={dismissError}>
              ×
            </button>
          </div>
        )}
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
            className={`world-canvas__stage${drag.draggingMap && adapter.draggingMapClass ? ` ${adapter.draggingMapClass}` : ""}`}
            width={viewport.w}
            height={viewport.h}
            tabIndex={0}
            aria-label={adapter.canvasLabel}
            onMouseDown={(e) => {
              // Plain marker downs still reset the trailing-drag guard and can pan; modified marker clicks never toggle.
              if (!markerAt(e) || (!e.ctrlKey && !e.metaKey)) drag.onMouseDown(e);
            }}
            onMouseMove={onMouseMove}
            onMouseUp={drag.onMouseUp}
            onMouseLeave={() => {
              drag.onMouseLeave();
              setHover(null);
              setTooltip(null);
            }}
            onPointerDown={(e) => {
              contextMenu.onPointerDown();
              if (e.button === 0) stage.onPointerDown(e);
            }}
            onPointerCancel={stage.onPointerCancel}
            onLostPointerCapture={stage.onLostPointerCapture}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            onKeyDown={onKeyDown}
            onContextMenu={onContextMenu}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
          />
          <EncounterBorder
            entries={borderEntries}
            zoom={view.zoom}
            lodZoom={adapter.nativePx * LOD_SCALE}
            {...adapter.border}
          />
          {overlayOrder.map((key) => (
            <Fragment key={key}>{overlays[key]}</Fragment>
          ))}
          <WorldContextOverlayMount context={context} ctx={worldContext} />
          <ConflictTooltip tooltip={tooltip} />
          <WorldContextMenu menu={contextMenu.menu} viewport={viewport} onClose={contextMenu.close} />
          {/* Conflict, save and reload failures can coincide; the host's toast wrapper keeps them stacked. */}
          {adapter.wrapToasts ? adapter.wrapToasts(toasts) : toasts}
        </div>
        {!worldContext.inContext && (
          <UnplacedRail unplacedNames={unplacedNames} filter={railFilter} onFilterChange={setRailFilter} />
        )}
      </div>
      <div className="world-canvas__status">
        {adapter.statusItems({
          world,
          mapFilter,
          zoomPercent,
          hiddenCount,
          unplacedCount: unplacedNames.length,
          acceptedCount: conflictAcceptance.acceptedCount,
          hover,
        })}
      </div>
      {warpPopup && world && adapter.renderWarpPopup?.(warpPopup, () => setWarpPopup(null), world)}
    </section>
  );
}
