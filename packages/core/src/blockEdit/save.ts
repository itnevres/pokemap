import type { Project } from "../project.js";
import type { GbcProject } from "../gbc/project.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AtomicEntry } from "../write/atomic.js";
import type { Refusal } from "../write/guards.js";
import { BlockEditRefusal, type TilesetFileEdit } from "./types.js";
import { canonicalTilesetPath } from "./canonicalTilesetPath.js";
import { insideRoot } from "../config/paths.js";
import { gbcTilesetsForFile } from "./usage.js";

export function mergeTilesetEdits(
  prior: readonly TilesetFileEdit[] | undefined,
  next: readonly TilesetFileEdit[],
): TilesetFileEdit[] {
  const merged = new Map<string, TilesetFileEdit>();
  for (const edits of [prior ?? [], next]) {
    const seen = new Set<string>();
    for (const edit of edits) {
      if (seen.has(edit.path)) {
        throw new BlockEditRefusal("BAD_VALUE", `${edit.path}: more than one staged edit`);
      }
      seen.add(edit.path);
      if (canonicalTilesetPath(edit.path) !== edit.path) {
        throw new BlockEditRefusal("BAD_VALUE", `${edit.path}: not a canonical repo-relative tileset path`);
      }
      if (!insideRoot(edit.path)) {
        throw new BlockEditRefusal("BAD_VALUE", `${edit.path}: path leaves the project`);
      }
      const first = merged.get(edit.path);
      merged.set(edit.path, first ? { path: edit.path, before: first.before, after: edit.after } : edit);
    }
  }
  return [...merged.values()].sort(comparePaths);
}

export function checkTilesetBaselines(root: string, edits: readonly TilesetFileEdit[]): void {
  for (const edit of changedTilesetEdits(edits)) {
    if (!tilesetBaselineMatches(root, edit)) {
      throw new BlockEditRefusal("FILE_CHANGED", `${edit.path}: changed on disk since the block edit was staged`);
    }
  }
}

export function gbaTilesetEffects(
  proj: Project,
  edits: readonly TilesetFileEdit[],
): { path: string; maps: string[] }[] {
  const changed = changedTilesetEdits(edits);
  if (changed.length === 0) return [];
  const symbolsByPath = new Map<string, Set<string>>();
  for (const symbol of proj.tilesetSymbols()) {
    const files = proj.tilesetPaths(symbol);
    for (const file of [files.metatilesBin, files.attributesBin]) {
      const path = canonicalTilesetPath(file);
      const symbols = symbolsByPath.get(path) ?? new Set<string>();
      symbols.add(symbol);
      symbolsByPath.set(path, symbols);
    }
  }
  const layouts = proj.mapNames().map((name) => ({ name, layout: proj.layoutForMap(name) }));
  return changed.map(({ path }) => {
    const symbols = symbolsByPath.get(path);
    const maps = layouts.filter(({ layout }) =>
      symbols?.has(layout.primaryTileset) || symbols?.has(layout.secondaryTileset)).map(({ name }) => name);
    return { path, maps: [...new Set(maps)].sort() };
  });
}

export function gbcTilesetEffects(
  proj: GbcProject,
  edits: readonly TilesetFileEdit[],
): { path: string; maps: string[] }[] {
  const changed = changedTilesetEdits(edits);
  // A staged file corrupted on disk can make a cold alias tileset fail to load and this scan
  // throw; accepted until Task 10's overlay serves staged bytes (task-8-rulings S7 addendum).
  return changed.map(({ path }) => {
    const tilesets = new Set(gbcTilesetsForFile(proj, path));
    return { path, maps: [...new Set(proj.maps.filter((map) => tilesets.has(map.tileset))
      .map((map) => map.name))].sort() };
  });
}

function comparePaths(a: { path: string }, b: { path: string }): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

/** Restored edits retain ownership, but do not participate in the save set. */
export function changedTilesetEdits(edits: readonly TilesetFileEdit[]): TilesetFileEdit[] {
  return edits.filter((edit) => !edit.after.equals(edit.before)).sort(comparePaths);
}

function tilesetBaselineMatches(root: string, edit: TilesetFileEdit): boolean {
  try {
    return readFileSync(resolve(root, edit.path)).equals(edit.before);
  } catch {
    return false;
  }
}

/** Plan-time diagnostics stay separate from commit's throwing baseline gate. */
export function tilesetBaselineRefusals(root: string, edits: readonly TilesetFileEdit[]): Refusal[] {
  return changedTilesetEdits(edits).filter((edit) => !tilesetBaselineMatches(root, edit)).map(({ path }) => ({
    code: "file-changed-on-disk", subject: path, path,
    message: `${path} changed on disk since the block edit was staged.`,
    fix: "Reopen the map before saving.",
  }));
}

export function tilesetSaveChanges(root: string, effects: readonly { path: string; maps: string[] }[]) {
  return effects.map(({ path, maps }) => ({
    path: resolve(root, path),
    kind: path.endsWith(".asm") ? "text" as const : "binary" as const,
    summary: `${path} -- tileset file edited (${maps.length} map${maps.length === 1 ? "" : "s"})`,
  }));
}

/** Entries share the session's Buffers (S8): never mutate `entry.before` / `entry.after` in place. */
export function prepareTilesetEdits(root: string, edits: readonly TilesetFileEdit[]): AtomicEntry[] {
  return changedTilesetEdits(edits).map((edit) => ({
    path: resolve(root, edit.path), before: edit.before, after: edit.after,
  }));
}

export function assertPreparedTilesetEdits(
  root: string, mapName: string, edits: readonly TilesetFileEdit[], entries: readonly AtomicEntry[],
): void {
  for (const edit of changedTilesetEdits(edits)) {
    const target = resolve(root, edit.path);
    const matches = entries.filter((entry) => resolve(entry.path) === target);
    if (matches.length !== 1 || !matches[0]!.before?.equals(edit.before) || !matches[0]!.after.equals(edit.after)) {
      throw new Error(`save refused: ${mapName}: ${edit.path}: tileset edit missing or stale in prepared save`);
    }
  }
}
