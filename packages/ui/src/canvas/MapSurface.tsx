import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ZOOM_LEVELS, type MapView } from "../components/mapView.js";
import { EncounterBorder, type EncounterBorderEntry } from "../components/EncounterBorder.js";
import { useMapEncounterSummaries } from "../encounters/useMapEncounterSummaries.js";
import { CanvasZoomBar } from "../shared/CanvasZoomBar.js";
import { OverlayToggleGroup } from "../shared/OverlayToggleGroup.js";
import { EncountersLegendItem, LegendBar } from "../shared/LegendBar.js";
import { MapStatusStrip } from "../shared/MapStatusStrip.js";
import { MapCanvasViewport } from "../shared/MapCanvasViewport.js";
import { useStrokeChain, type SettledChain, type StrokeSession } from "../shared/useStrokeChain.js";
import { boundedCell, cellRect, rawCell } from "./cells.js";
import { screenToSource, type Point } from "./view.js";
import { useStage, useStageAutoFit } from "./useStage.js";
import { useRasterComposite } from "./useRasterComposite.js";
import type { MapHover, MapSurfaceAdapter, MapTool } from "./mapSurfaceAdapter.js";

// begin/apply/end return fresh blocks even without a content change. Coalesce the gesture's cache-bypassing
// renders into one trailing refresh; overlays still track live blocks immediately (MapCanvas's paint postmortem).
const PAINT_VERSION_DEBOUNCE_MS = 200;
const ZOOM_POLICY = { kind: "stepped", levels: ZOOM_LEVELS } as const;

export interface MapSurfaceProps<Tool extends MapTool, Body, Event, Stamp, Hover extends MapHover> {
  mapName: string;
  adapter: MapSurfaceAdapter<Tool, Body, Event, Stamp, Hover>;
  editSession?: StrokeSession<Body>;
  activeTool?: Tool | null;
  selectedEvent?: Event | null;
  onSelectEvent?: (event: Event | null) => void;
  onMoveEvent?: (event: Event & Point) => void;
  onSignPick?: (x: number, y: number, anchor: DOMRect) => void;
  onDropperPick?: (stamp: Stamp) => void;
  onHoverMetatile?: (id: number | null) => void;
  onEditError?: (message: string) => void;
  onStrokeChain?: (chain: SettledChain, mounted: boolean) => void;
  view?: MapView;
  onViewChange?: (view: MapView) => void;
  chromeless?: boolean;
}

export function MapSurface<Tool extends MapTool, Body, Event, Stamp, Hover extends MapHover>({
  mapName, adapter, editSession, activeTool, selectedEvent, onSelectEvent, onMoveEvent, onSignPick,
  onDropperPick, onHoverMetatile, onEditError, onStrokeChain, view, onViewChange, chromeless,
}: MapSurfaceProps<Tool, Body, Event, Stamp, Hover>) {
  const g = adapter.geometry;
  const imgRef = useRef<HTMLImageElement>(null);
  // One completion chain orders begin, every apply and end: even a fast click must not send end before
  // begin/apply settles. Registration lets shell discard await the entire chain, including end.
  const chain = useStrokeChain<Body>(mapName, (message) => onEditError?.(message));
  useEffect(() => {
    onStrokeChain?.(chain, true);
    return () => onStrokeChain?.(chain, false);
  }, [chain, onStrokeChain]);
  // Rect/shift capture one start, then apply once after all queued work. Pencil/collision remember only the
  // last cell: repeated mousemoves within it must not enqueue duplicate requests (GbcMapCanvas).
  const strokeStart = useRef<Point | null>(null);
  const lastCell = useRef<string | null>(null);
  // Capture event identity and its starting event-grid cell; preview moves locally, commit only on release.
  const eventDrag = useRef<{ event: Event; start: Point } | null>(null);
  const panning = useRef(false);
  const [dragPreview, setDragPreview] = useState<Point | null>(null);
  const [toggleState, setToggleState] = useState<{ map: string; values: Record<string, boolean> }>({ map: mapName, values: {} });
  const toggles = toggleState.map === mapName ? toggleState.values : {};
  const enabled = Object.fromEntries(adapter.overlays.map((layer) => [layer.key, !!toggles[layer.key] || !!layer.forced]));
  // Encounters are DOM over the viewport, separate from destructive raster toggles. Key by map so a
  // switch renders them off immediately, without fetching for the new map or briefly showing stale entries.
  const [encountersFor, setEncountersFor] = useState<string | null>(null);
  // Chromeless hides toolbar/legend/status only; it does not revoke an already-enabled encounter border.
  const encountersOn = encountersFor === mapName;
  const encounter = adapter.encounters;
  const { summaries, error: encounterError } = useMapEncounterSummaries(mapName, encounter.family, encountersOn);
  const [hoverState, setHover] = useState<{ map: string; value: Hover | null }>({ map: mapName, value: null });
  const hover = hoverState.map === mapName ? hoverState.value : null;
  const hoverId = hover?.metatileId ?? null;
  const hoverCallback = useRef(onHoverMetatile);
  useLayoutEffect(() => { hoverCallback.current = onHoverMetatile; });
  // Callback identity is not hover state: fresh parent callbacks must not clear an in-progress hover.
  // Notify only id transitions, including leave and map switch (P12-4l).
  useEffect(() => { hoverCallback.current?.(hoverId); }, [hoverId]);

  const [paintVersion, setPaintVersion] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previous = useRef({ map: mapName, blocks: adapter.blocks });
  const skipNextBump = useRef(adapter.skipFirstBlocksChange);
  useEffect(() => {
    const prev = previous.current;
    previous.current = { map: mapName, blocks: adapter.blocks };
    if (prev.map !== mapName) {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      skipNextBump.current = adapter.skipFirstBlocksChange;
      return;
    }
    if (prev.blocks === adapter.blocks) return;
    if (skipNextBump.current) { skipNextBump.current = false; return; }
    if (!editSession) return;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; setPaintVersion((version) => version + 1); }, PAINT_VERSION_DEBOUNCE_MS);
    // Session presence and policy are sampled on blocks changes, never themselves refresh triggers (P12-8).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapName, adapter.blocks]);
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);
  // Never reset the version: revisiting a painted map must not reuse its initial, stale browser cache key.
  const imageUrl = adapter.imageUrl(mapName, editSession ? paintVersion : 0);

  // End awaits every apply round trip, then a following stroke waits for end. With no capture, leave must
  // also close the server stroke or two edits squash into one undo step. A missing end cell abandons
  // rect/shift; pointer cancellation uses the same no-final-apply path (P12-4a).
  const finishStroke = (end: Point | null) => {
    const start = strokeStart.current;
    strokeStart.current = null;
    lastCell.current = null;
    if (!chain.isOpen()) return;
    chain.finish(start && end && activeTool ? adapter.finishBody(activeTool, start, end) : null);
  };
  const abandon = () => {
    finishStroke(null); // Cancel has no end cell: never apply a rectangle or shift using a stale preview.
    eventDrag.current = null;
    setDragPreview(null);
    panning.current = false;
  };
  const stage = useStage<MapView>({ mapName, view, onViewChange, zoomPolicy: ZOOM_POLICY,
    pixelWidth: g.pixelWidth, pixelHeight: g.pixelHeight, bandNative: encountersOn ? encounter.band * encounter.unitPx : 0,
    side: encounter.side, chromeless, imgLoaded: false, onCancel: abandon });
  const { pan, zoom } = stage.view;
  const selection = selectedEvent == null ? null : adapter.eventPosition(selectedEvent);
  const highlight = dragPreview ?? selection;
  const raster = useRasterComposite({ imageUrl, imgRef, stageRef: stage.canvasRef,
    width: g.pixelWidth, height: g.pixelHeight, view: stage.view, viewport: stage.viewport,
    layers: adapter.overlays.map((layer) => ({ ...layer, enabled: enabled[layer.key]! })),
    decorateDeps: [highlight?.x, highlight?.y, !!dragPreview, g.origin.x, g.origin.y, g.eventCellPx],
    decorate: (ctx) => {
      // Selection and the local drag candidate redraw only the stage, never the destructive overlay raster.
      // The candidate wins over the static ring; event geometry is in steps for GBC, not paint blocks.
      if (!highlight) return;
      const color = getComputedStyle(document.documentElement).getPropertyValue("--overlay-selection").trim() || "#22d3ee";
      ctx.save(); ctx.lineWidth = 2; ctx.strokeStyle = dragPreview ? "#ffffff" : color;
      ctx.strokeRect(pan.x + (g.origin.x + highlight.x * g.eventCellPx) * zoom + 1,
        pan.y + (g.origin.y + highlight.y * g.eventCellPx) * zoom + 1, g.eventCellPx * zoom - 2, g.eventCellPx * zoom - 2);
      ctx.restore();
    },
  });
  // Raster readiness is available after stage construction. Sample the same stage.fit once per map only;
  // paint/time reloads must never snap the player's view. useStage's internal readiness stays false here.
  useStageAutoFit(raster.imgLoaded, mapName, stage.controlled, stage.fit);
  // Real map switches clear local overlays/hover/drags; useStrokeChain retires the stroke itself.
  useLayoutEffect(() => {
    strokeStart.current = null;
    lastCell.current = null;
    eventDrag.current = null;
    panning.current = false;
    setDragPreview(null);
    setToggleState({ map: mapName, values: {} });
    setEncountersFor(null); // A -> B -> A must not bring A's encounter border back.
    setHover({ map: mapName, value: null });
  }, [mapName]);

  const geometry = (cellPx: number) => ({ ...stage.view, originX: g.origin.x, originY: g.origin.y, cellPx });
  const point = (event: MouseEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  // Single-cell starts are bounded (outside means no edit); rect/shift ends stay raw because the server
  // skips overshooting targets. Event selection/releases use their own raw grid, allowing outside deselect.
  const paintAt = (event: MouseEvent<HTMLCanvasElement>) => boundedCell(point(event), geometry(g.paintCellPx), g.width, g.height);
  const rawPaintAt = (event: MouseEvent<HTMLCanvasElement>) => rawCell(point(event), geometry(g.paintCellPx));
  const eventAt = (event: MouseEvent<HTMLCanvasElement>) => rawCell(point(event), geometry(g.eventCellPx));
  const onMouseDown = (event: MouseEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    if (activeTool?.kind === "sign") {
      const cell = boundedCell(point(event), geometry(g.eventCellPx), g.width * g.paintCellPx / g.eventCellPx, g.height * g.paintCellPx / g.eventCellPx);
      if (cell) onSignPick?.(cell.x, cell.y, cellRect(event.currentTarget.getBoundingClientRect(),
        event.currentTarget.width, event.currentTarget.height, cell, geometry(g.eventCellPx)));
      return;
    }
    // Event selection precedes paint only with no tool. Raw cells deliberately allow an outside deselect;
    // a miss falls through to pan (MapCanvas's event-selection rationale).
    if (!activeTool && onSelectEvent) {
      const cell = eventAt(event);
      const hit = adapter.findEventAt(cell);
      onSelectEvent(hit);
      if (hit !== null) { eventDrag.current = { event: hit, start: cell }; return; }
    }
    if (editSession && activeTool?.kind === "dropper") {
      // Read the whole family stamp, without beginning or ending a stroke.
      const cell = paintAt(event);
      const stamp = cell && adapter.dropperStamp(cell);
      if (stamp != null) onDropperPick?.(stamp);
      return;
    }
    if (editSession && activeTool) {
      const cell = paintAt(event);
      if (!cell) return;
      strokeStart.current = cell;
      lastCell.current = `${cell.x},${cell.y}`;
      chain.start(editSession, adapter.paintBody(activeTool, cell));
      return;
    }
    panning.current = true;
    stage.startPan(event);
  };
  const onMouseMove = (event: MouseEvent<HTMLCanvasElement>) => {
    if (eventDrag.current) { setDragPreview(eventAt(event)); return; } // Candidate only; never a per-move write.
    if (editSession && (activeTool?.kind === "pencil" || activeTool?.kind === "collision") && chain.isOpen() && event.buttons === 1) {
      const cell = paintAt(event);
      if (cell && lastCell.current !== `${cell.x},${cell.y}`) {
        lastCell.current = `${cell.x},${cell.y}`;
        const body = adapter.paintBody(activeTool, cell);
        if (body !== null) chain.queue(body);
      }
      return;
    }
    if (panning.current) stage.movePan(event);
    else setHover({ map: mapName, value: adapter.hoverAt(screenToSource(point(event), stage.view), enabled) });
  };
  const onMouseUp = (event: MouseEvent<HTMLCanvasElement>) => {
    if (eventDrag.current) {
      const cell = eventAt(event);
      // Capture locals BEFORE clearing ownership: only the release's raw cell is the final drop position.
      const { event: selected, start } = eventDrag.current;
      eventDrag.current = null;
      setDragPreview(null);
      if (cell.x !== start.x || cell.y !== start.y) onMoveEvent?.({ ...selected, ...cell });
    }
    // Dropper starts no chain, so finishStroke is a no-op for it.
    finishStroke(rawPaintAt(event)); // Unbounded rect/shift end: the server skips targets beyond the layout.
    panning.current = false;
    stage.endPan();
  };
  const onMouseLeave = () => {
    setHover({ map: mapName, value: null });
    // Capture held: leave clears hover only. Missing/refused capture: abandon drag without a reliable
    // final cell and finish the stroke without applying rect/shift (P12-4a no-capture fallback).
    if (!stage.hasCapture()) { abandon(); stage.endPan(); }
  };
  // The composite rect includes border rings, so sprites never cover map/border-block pixels.
  // Memoised: EncounterBorder clears tooltips on entries changes; unrelated renders must not clear one.
  const entries = useMemo<EncounterBorderEntry[]>(() => [{ map: mapName,
    rect: { x: pan.x, y: pan.y, width: g.pixelWidth * zoom, height: g.pixelHeight * zoom }, side: encounter.side, summaries }],
  [mapName, pan.x, pan.y, g.pixelWidth, g.pixelHeight, zoom, encounter.side, summaries]);
  const anyOverlay = adapter.overlays.some((layer) => enabled[layer.key]);
  return <section className={`map-canvas${adapter.className ? ` ${adapter.className}` : ""}${chromeless ? " map-canvas--chromeless" : ""}`} aria-label={`${mapName} canvas`}>
    {!chromeless && <div className="map-canvas__toolbar">
      <CanvasZoomBar zoom={zoom} zoomLevels={ZOOM_LEVELS} applyZoom={stage.applyZoom} centerPivot={stage.centerPivot} fit={stage.fit} />
      <OverlayToggleGroup toggles={[...adapter.overlays.map((layer) => ({ key: layer.key, label: layer.label,
        pressed: !!toggles[layer.key], onClick: () => setToggleState({ map: mapName, values: { ...toggles, [layer.key]: !toggles[layer.key] } }) })),
      { key: "encounters", label: "Encounters", pressed: encountersOn, onClick: () => setEncountersFor(encountersOn ? null : mapName) }]} />
    </div>}
    {!chromeless && (anyOverlay || encountersOn) && <LegendBar>
      {adapter.overlays.map((layer) => enabled[layer.key] ? <Fragment key={layer.key}>{layer.legend}</Fragment> : null)}
      {encountersOn && <EncountersLegendItem error={encounterError} empty={summaries?.length === 0} hint={encounter.legendHint} />}
    </LegendBar>}
    <MapCanvasViewport containerRef={stage.containerRef} canvasRef={stage.canvasRef} imgRef={imgRef}
      imageUrl={imageUrl} onImgLoad={raster.onImgLoad} onImgError={raster.onImgError}
      width={stage.viewport.w || g.pixelWidth} height={stage.viewport.h || g.pixelHeight}
      onPointerDown={(event) => { if (event.button === 0) stage.onPointerDown(event); }}
      onPointerCancel={stage.onPointerCancel} onLostPointerCapture={stage.onLostPointerCapture}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseLeave}>
      <EncounterBorder enabled={encountersOn} entries={entries} zoom={zoom * encounter.unitPx} lodZoom={0}
        band={encounter.band} time={encounter.time} />
    </MapCanvasViewport>
    {!chromeless && <MapStatusStrip items={adapter.statusItems(hover, enabled)} />}
  </section>;
}
