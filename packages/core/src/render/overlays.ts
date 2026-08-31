import type { MapData } from "../load/maps.js";
import type { LayoutRaster } from "./layout.js";
import { blendRect, type RGBA } from "./raster.js";

const GRID: RGBA = { r: 255, g: 255, b: 255, a: 40 };
const COLLISION: RGBA = { r: 220, g: 40, b: 40, a: 110 };

export function drawGrid(r: LayoutRaster, step = 16): void {
  for (let x = 0; x < r.width; x += step) blendRect(r, x, 0, 1, r.height, GRID);
  for (let y = 0; y < r.height; y += step) blendRect(r, 0, y, r.width, 1, GRID);
}

export function drawCollision(r: LayoutRaster): void {
  for (let y = 0; y < r.blockHeight; y++) {
    for (let x = 0; x < r.blockWidth; x++) {
      const b = r.blocks[y * r.blockWidth + x];
      if (!b || b.collision === 0) continue;
      blendRect(r, r.originX + x * 16, r.originY + y * 16, 16, 16, COLLISION);
    }
  }
}

/**
 * Unlike `drawCollision`, this does not skip elevation 0 -- it is not a
 * sentinel the way collision 0 ("not blocked") is. Elevation is a 16-value
 * z-level and 0 is one of the meaningful ones (it means "inherit the
 * player's current elevation," distinct from an explicit level like 3),
 * measured to be the single most common value across the corpus (roughly
 * half to two-thirds of blocks on a typical map). Skipping it would draw
 * gaps that read as "no data" where the data is in fact "level 0."
 */
export function drawElevation(r: LayoutRaster): void {
  for (let y = 0; y < r.blockHeight; y++) {
    for (let x = 0; x < r.blockWidth; x++) {
      const b = r.blocks[y * r.blockWidth + x];
      if (!b) continue;
      const v = Math.round((b.elevation / 15) * 255);
      blendRect(r, r.originX + x * 16, r.originY + y * 16, 16, 16, { r: v, g: 0, b: 255 - v, a: 90 });
    }
  }
}

export type EventKind = "object" | "warp" | "coord" | "bg";
export interface EventMark { kind: EventKind; x: number; y: number; label: string; }

/** Returns the marks so the UI can make them interactive; also paints them. */
export function drawEvents(r: LayoutRaster, map: MapData): EventMark[] {
  const marks: EventMark[] = [
    ...map.objectEvents.map((o) => ({ kind: "object" as const, x: o.x, y: o.y, label: o.graphicsId })),
    ...map.warpEvents.map((w) => ({ kind: "warp" as const, x: w.x, y: w.y, label: `→ ${w.destMap}` })),
    ...map.coordEvents.map((c) => ({ kind: "coord" as const, x: Number(c.x), y: Number(c.y), label: "trigger" })),
    ...map.bgEvents.map((b) => ({ kind: "bg" as const, x: Number(b.x), y: Number(b.y), label: b.type })),
  ];

  const colour: Record<EventKind, RGBA> = {
    object: { r: 60, g: 200, b: 90, a: 150 },
    warp: { r: 240, g: 190, b: 40, a: 150 },
    coord: { r: 200, g: 80, b: 240, a: 150 },
    bg: { r: 60, g: 160, b: 240, a: 150 },
  };

  for (const m of marks) blendRect(r, r.originX + m.x * 16, r.originY + m.y * 16, 16, 16, colour[m.kind]);
  return marks;
}
