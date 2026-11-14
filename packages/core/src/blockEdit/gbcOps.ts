import type { GbcProject } from "../gbc/project.js";
import type { GbcTileset } from "../gbc/model/types.js";
import type { BlockEditPlan, FileOverlay, GridIds, StagedGrids } from "./types.js";

export function gbcSheetToTileId(ts: GbcTileset): (sheetIndex: number) => number | null {
  throw new Error("not implemented (Task 6)");
}
export interface GbcBlockDraft {
  tiles: number[];
  collision: [string, string, string, string];
  palettes: { square: number; palName: string; scope: "all" | "local" }[];
}
export interface GbcBlockEditRequest {
  map: string;
  blockId: number;
  mode: "ok" | "saveAsNew";
  from: "map" | "palette";
  cell?: { x: number; y: number };
  draft: GbcBlockDraft;
}
export function resolveGbcEditTarget(proj: GbcProject, map: string, cell: { x: number; y: number }, grids: StagedGrids): { blockId: number; viaBorder: boolean } {
  throw new Error("not implemented (Task 6)");
}
export function blockEditRevision(files: ReadonlyMap<string, Buffer>, grid: GridIds): string {
  throw new Error("not implemented (Task 6)");
}
export function planGbcBlockEdit(proj: GbcProject, req: GbcBlockEditRequest, staged: FileOverlay, grids: StagedGrids): BlockEditPlan {
  throw new Error("not implemented (Task 6)");
}
