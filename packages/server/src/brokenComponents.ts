import type { Project } from "@pokemap/core/src/project.js";
import type { BrokenPath, Layout } from "@pokemap/core/src/model/types.js";
import { PathEscapeError } from "@pokemap/core/src/gbc/load/pathGuard.js";

/**
 * Plan H F1c / D25: a layout, or a tileset it uses, whose path leaves the project is a
 * defect on the maps that use it. Those maps cannot be rendered, opened for editing or
 * saved until it is fixed; nothing else is blocked. This is the one place the GBA server
 * decides "is this map's layout usable".
 *
 * A broken layout throws `PathEscapeError` from `renderLayout`, but a broken tileset
 * throws a plain `Error` from `project.tileset` (Plan H F1d may unify that), so the
 * server checks both here instead of relying on either error type.
 */
export function brokenPathOfLayout(project: Project, layout: Layout): BrokenPath | undefined {
  if (layout.brokenPaths?.length) return layout.brokenPaths[0];
  for (const symbol of [layout.primaryTileset, layout.secondaryTileset]) {
    let paths;
    // An unknown tileset symbol is not a broken path: the caller's own read raises today's error for it.
    try { paths = project.tilesetPaths(symbol); } catch { continue; }
    if (paths.brokenPaths?.length) return paths.brokenPaths[0];
  }
  return undefined;
}

/** Throws a `PathEscapeError` carrying the defect when the layout or one of its tilesets is broken. */
export function refuseBrokenLayout(project: Project, layout: Layout): void {
  const broken = brokenPathOfLayout(project, layout);
  if (broken) throw new PathEscapeError(broken);
}

/** The 409 body for a refusal, or undefined when `error` is not one. Same status as the other typed refusals (`BlockEditRefusal`). */
export function brokenPathBody(error: unknown): BrokenPathBody | undefined {
  return error instanceof PathEscapeError ? refusalBody(error.brokenPath) : undefined;
}

export interface BrokenPathBody { error: string; code: "broken-path"; defect: BrokenPath }
export function refusalBody(defect: BrokenPath): BrokenPathBody {
  return { error: defect.message, code: "broken-path", defect };
}
