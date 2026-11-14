import type { Project } from "../project.js";
import type { TileEntry } from "../load/tilesetData.js";
import type { BlockEditPlan, FileOverlay, StagedGrids } from "./types.js";

export interface GbaBlockDraft { entries: TileEntry[]; behavior: number; layerType: number }
export interface GbaBlockEditRequest {
  map: string; metatileId: number; mode: "ok" | "saveAsNew";
  from: "map" | "palette"; cell?: { x: number; y: number }; draft: GbaBlockDraft;
}
export function planGbaBlockEdit(proj: Project, req: GbaBlockEditRequest, staged: FileOverlay, grids: StagedGrids): BlockEditPlan {
  throw new Error("not implemented (Task 7)");
}
export function gbaCrossHalfWarnings(proj: Project, tilesetSymbol: string, draft: GbaBlockDraft, original: readonly TileEntry[]): string[] {
  throw new Error("not implemented (Task 7)");
}
