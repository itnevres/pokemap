import type { Project } from "./project.js";
import type { BrokenPath, Layout } from "./model/types.js";
import { PathEscapeError } from "./gbc/load/pathGuard.js";

/**
 * Plan H F1d / D25: the one place core decides "is this layout usable". A
 * layout, or either tileset it uses, whose path leaves the project is a defect
 * on the maps that use it; those maps cannot be rendered, opened or saved, and
 * a reader acting on one named layout must refuse it before it reads any file.
 * A reader that walks EVERY layout skips a broken one and keeps serving the
 * healthy ones.
 *
 * `Project` is imported type-only so this module never joins a runtime import
 * cycle (project.ts imports pathGuard, not this).
 */

/**
 * The first `BrokenPath` that makes `layout` unusable, or `undefined`. The
 * layout's own blockdata/border paths first; then the primary tileset, then the
 * secondary. An unknown tileset symbol is NOT a broken path (the caller's own
 * read raises the real error for it), so it is skipped rather than reported.
 */
export function brokenPathOfLayout(proj: Project, layout: Layout): BrokenPath | undefined {
  if (layout.brokenPaths?.length) return layout.brokenPaths[0];
  for (const symbol of [layout.primaryTileset, layout.secondaryTileset]) {
    let paths: ReturnType<Project["tilesetPathsUnchecked"]>;
    try { paths = proj.tilesetPathsUnchecked(symbol); } catch { continue; }
    if (paths.brokenPaths?.length) return paths.brokenPaths[0];
  }
  return undefined;
}

/**
 * Throws a `PathEscapeError` carrying the defect when the layout or one of its
 * tilesets is broken. Call it before ANY file read in a reader that acts on one
 * named layout, so a broken component is refused without an outside read.
 */
export function assertLayoutUsable(proj: Project, layout: Layout): void {
  const broken = brokenPathOfLayout(proj, layout);
  if (broken) throw new PathEscapeError(broken);
}

/**
 * The layout-only form for readers that never touch tilesets (the binary
 * writers): refuses when the layout's OWN blockdata/border path leaves the
 * project. No `Project` needed, so it works from a bare `Layout`.
 */
export function assertLayoutFilesInside(layout: Layout): void {
  if (layout.brokenPaths?.length) throw new PathEscapeError(layout.brokenPaths[0]!);
}