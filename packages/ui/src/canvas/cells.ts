import { screenToSource, type Point, type View } from "./view.js";

export interface CellGeometry extends View {
  originX: number;
  originY: number;
  cellPx: number;
}

/** Unbounded: rect/shift end cells may overshoot the map; the server skips out-of-range targets. */
export function rawCell(point: Point, geometry: CellGeometry): Point {
  const source = screenToSource(point, geometry);
  return {
    x: Math.floor((source.x - geometry.originX) / geometry.cellPx),
    y: Math.floor((source.y - geometry.originY) / geometry.cellPx),
  };
}

/** Single-cell paint and sign picks must do nothing on a click outside the map, never clamp to its edge. */
export function boundedCell(point: Point, geometry: CellGeometry, width: number, height: number): Point | null {
  const cell = rawCell(point, geometry);
  // NaN (zero zoom at the pan origin) slips past every comparison, so reject non-finite cells too.
  if (!Number.isFinite(cell.x) || !Number.isFinite(cell.y)) return null;
  return cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height ? null : cell;
}

export function cellRect(
  canvasClientRect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  canvasWidth: number,
  canvasHeight: number,
  cell: Point,
  { pan, zoom, originX, originY, cellPx }: CellGeometry,
): DOMRect {
  const scaleX = canvasClientRect.width / canvasWidth;
  const scaleY = canvasClientRect.height / canvasHeight;
  return new DOMRect(
    canvasClientRect.left + (pan.x + (originX + cell.x * cellPx) * zoom) * scaleX,
    canvasClientRect.top + (pan.y + (originY + cell.y * cellPx) * zoom) * scaleY,
    cellPx * zoom * scaleX,
    cellPx * zoom * scaleY,
  );
}
