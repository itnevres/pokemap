import type { MapView, Zoom } from "../components/mapView.js";

/** World px per tile at native scale: world zoom 16 == MapCanvas zoom 1. */
const NATIVE = 16;

interface Point { x: number; y: number }

/** The nearest MapCanvas zoom (1|2|4) to a world zoom: clamp(round(log2(worldZoom / 16)), 0, 2) as 2^k. */
export function snapContextZoom(worldZoom: number): Zoom {
  const k = Math.min(2, Math.max(0, Math.round(Math.log2(worldZoom / NATIVE))));
  return (2 ** k) as Zoom;
}

/** The world view (zoom = 16*zoom px per tile) that puts the placement's centre at `pointer`. */
export function enterContextView(args: {
  placement: { x: number; y: number; width: number; height: number };
  pointer: Point;
  zoom: Zoom;
}): { zoom: number; pan: Point } {
  const { placement: p, pointer, zoom } = args;
  const scale = NATIVE * zoom;
  return {
    zoom: scale,
    pan: { x: Math.round(pointer.x - (p.x + p.width / 2) * scale), y: Math.round(pointer.y - (p.y + p.height / 2) * scale) },
  };
}

/** The MapCanvas view that draws the composite (border ring included; `originX/Y` = composite px of the map's
 *  top-left tile) exactly where the world canvas draws that map. Exact inverse of {@link worldViewFromMapView}. */
export function mapViewFromWorld(args: {
  placement: { x: number; y: number };
  worldPan: Point;
  worldZoom: number;
  originX: number;
  originY: number;
}): MapView {
  const { placement: p, worldPan, worldZoom, originX, originY } = args;
  const z = worldZoom / NATIVE;
  return { zoom: z as Zoom, pan: { x: p.x * worldZoom + worldPan.x - originX * z, y: p.y * worldZoom + worldPan.y - originY * z } };
}

/** The world view that a MapCanvas view corresponds to. Exact inverse of {@link mapViewFromWorld}. */
export function worldViewFromMapView(args: {
  placement: { x: number; y: number };
  view: MapView;
  originX: number;
  originY: number;
}): { zoom: number; pan: Point } {
  const { placement: p, view, originX, originY } = args;
  const scale = NATIVE * view.zoom;
  return { zoom: scale, pan: { x: view.pan.x + originX * view.zoom - p.x * scale, y: view.pan.y + originY * view.zoom - p.y * scale } };
}
