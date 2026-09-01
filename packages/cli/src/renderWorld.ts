import type { Project } from "@pokemap/core/src/project.js";
import type { Placement } from "@pokemap/core/src/world/connections.js";

export interface PlacementRect {
  width: number;
  height: number;
  layoutName: string;
}

/**
 * Recovers a placement's real render size and layout name via
 * `proj.layoutForMap`, for both an ordinary placement (already sized by
 * buildWorld/autoLayoutUnplaced) and an applySidecar fallback placement
 * (`component: -1`, width:0, height:0 -- sidecar.ts has no Project to size
 * a manually-placed-but-not-yet-auto-clustered map; see
 * packages/core/test/world/sidecar.test.ts's "fabricates a placeholder
 * placement" test for that documented shape).
 *
 * Review fix: render-world used to skip every component:-1 placement
 * outright, reasoning in a comment that there was "no cheap way" to size
 * it -- but layoutForMap IS that cheap lookup (buildWorld has already
 * warmed proj's map cache for every map in the project by the time
 * render-world runs, so this is an in-memory array scan over `layouts`,
 * not a file read) and was already being called for every other placement
 * two lines below where the skip used to live. Net effect of the old code:
 * `render-world --no-dungeons` silently omitted every map the user had
 * manually dragged onto the canvas while dungeons was off -- a manual
 * placement, not an auto-placed dungeon map, and so not what --no-dungeons
 * is documented to exclude.
 *
 * Returns null only for the genuinely unrecoverable case: a manual
 * placement naming a map no longer in the project at all. sidecar.json is
 * the one hand-editable state file in this whole project (sidecar.ts's own
 * comment) and can go stale -- layoutForMap throws naming the map in that
 * case, which this turns into "skip", not a crash.
 */
export function resolvePlacementRect(proj: Project, p: Placement): PlacementRect | null {
  let layout;
  try {
    layout = proj.layoutForMap(p.map);
  } catch {
    return null;
  }
  return {
    width: p.width > 0 ? p.width : layout.width,
    height: p.height > 0 ? p.height : layout.height,
    layoutName: layout.name,
  };
}
