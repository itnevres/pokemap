import type { Project } from "../project.js";
import type { GbcProject } from "../gbc/project.js";
import type { TilesetFileEdit } from "./types.js";

export function mergeTilesetEdits(
  prior: readonly TilesetFileEdit[] | undefined,
  next: readonly TilesetFileEdit[],
): TilesetFileEdit[] {
  throw new Error("not implemented (Task 8)");
}

export function checkTilesetBaselines(root: string, edits: readonly TilesetFileEdit[]): void {
  throw new Error("not implemented (Task 8)");
}

export function gbaTilesetEffects(
  proj: Project,
  edits: readonly TilesetFileEdit[],
): { path: string; maps: string[] }[] {
  throw new Error("not implemented (Task 8)");
}

export function gbcTilesetEffects(
  proj: GbcProject,
  edits: readonly TilesetFileEdit[],
): { path: string; maps: string[] }[] {
  throw new Error("not implemented (Task 8)");
}
