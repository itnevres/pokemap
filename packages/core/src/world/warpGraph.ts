import type { Project } from "../project.js";
import type { Placement, World } from "./connections.js";

export interface AutoLayoutOptions {
  /** When false, nothing is placed -- the user drags maps on by hand. */
  enabled?: boolean;
  /** Tiles of empty space between packed maps. */
  gap?: number;
  /** Where the dungeon shelf starts, in tiles. */
  originX?: number;
  originY?: number;
}

/**
 * Map names with no planar connection in either direction: own `connections`
 * is empty, and no other map's `connections` targets them. buildWorld still
 * places every one of these -- each becomes its own 1-map component, per its
 * own comment -- so `world.placements.has(n)` is true for every map, always,
 * and cannot tell these apart from a map with real planar neighbours. A
 * component of size 1 is the actual signal.
 *
 * Exported, not inlined into autoLayoutUnplaced, because a future "dungeons
 * off" view needs the same set for the opposite purpose: dropping these
 * names OUT of the base placement list rather than clustering them in.
 */
export function unplacedMapNames(world: World): Set<string> {
  const out = new Set<string>();
  for (const c of world.components) {
    if (c.maps.length === 1) out.add(c.maps[0]!);
  }
  return out;
}

/**
 * A starting guess, not a truth. Warps are not geometrically consistent --
 * two floors linked by a ladder have no defined relative position -- so this
 * groups warp-connected maps into clusters and shelf-packs each cluster. The
 * user drags to correct, and the correction is what persists (see
 * world/sidecar).
 */
export function autoLayoutUnplaced(proj: Project, world: World, opts: AutoLayoutOptions = {}): Map<string, Placement> {
  const out = new Map<string, Placement>();
  if (opts.enabled === false) return out;

  const gap = opts.gap ?? 4;
  const unplacedSet = unplacedMapNames(world);
  if (unplacedSet.size === 0) return out;
  const unplaced = [...unplacedSet];

  const idToName = new Map(proj.mapNames().map((n) => [proj.map(n).id, n]));

  // Union-find over warp links, restricted to unplaced maps.
  const parent = new Map<string, string>(unplaced.map((n) => [n, n]));
  const find = (n: string): string => {
    let r = n;
    while (parent.get(r) !== r) r = parent.get(r)!;
    while (parent.get(n) !== r) { const next = parent.get(n)!; parent.set(n, r); n = next; }
    return r;
  };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  for (const n of unplaced) {
    for (const w of proj.map(n).warpEvents) {
      const dest = idToName.get(w.destMap);
      if (dest && unplacedSet.has(dest)) union(n, dest);
    }
  }

  const clusters = new Map<string, string[]>();
  for (const n of unplaced) {
    const r = find(n);
    (clusters.get(r) ?? clusters.set(r, []).get(r)!).push(n);
  }

  const sizeOf = (name: string) => {
    // Delegates to layoutForMap rather than re-deriving layoutById(map(name)
    // .layout) by hand: that pair is exactly what layoutForMap already does,
    // including the I7 refusal (throws naming both map.json and
    // layouts.json) when the id doesn't resolve. Hand-rolling it here too
    // would silently drop that message the moment the two implementations
    // drift -- see packages/cli/src/context.ts's layoutNameFor for the same
    // lesson, and its regression test for how to prove the delegation
    // itself rather than just a message string. (connections.ts's own
    // sizeOf has this same hand-rolled shape; that one predates this file
    // and is a separate fast-follow, not this task's scope.)
    const { width, height } = proj.layoutForMap(name);
    return { width, height };
  };

  // Shelf-pack: clusters left to right, maps within a cluster in rows.
  const worldBottom = Math.max(0, ...world.components.map((c) => c.bounds.y + c.bounds.height));
  let shelfX = opts.originX ?? 0;
  const shelfY = opts.originY ?? worldBottom + 32;
  let componentIndex = world.components.length;

  for (const maps of clusters.values()) {
    const sorted = [...maps].sort((a, b) => sizeOf(b).height - sizeOf(a).height);
    const columns = Math.max(1, Math.ceil(Math.sqrt(sorted.length)));
    let x = shelfX, y = shelfY, rowHeight = 0, col = 0, clusterWidth = 0;

    for (const name of sorted) {
      const size = sizeOf(name);
      out.set(name, { map: name, x, y, ...size, component: componentIndex });
      x += size.width + gap;
      rowHeight = Math.max(rowHeight, size.height);
      clusterWidth = Math.max(clusterWidth, x - shelfX);
      if (++col >= columns) { col = 0; x = shelfX; y += rowHeight + gap; rowHeight = 0; }
    }

    shelfX += clusterWidth + gap * 4;
    componentIndex++;
  }

  return out;
}

/**
 * Plain BFS over `warpEvents`, forward-directional (a map's own warps to
 * their destination -- not the reverse), starting from `seedMap`.
 * Deliberately NOT the same traversal as `autoLayoutUnplaced`'s union-find
 * above: that one restricts to unplaced maps and treats a warp link as
 * symmetric (either endpoint can pull the other into its cluster), because
 * its whole job is grouping mutually-isolated maps together. This one has
 * no such restriction -- it walks the WHOLE corpus's warp graph from one
 * named seed, which is what "create a dungeon from this seed map" (spec
 * §5.2) actually needs: everything reachable by warp, full stop, for the
 * user to prune afterward. Always includes the seed itself, even with no
 * warps at all -- a one-map "dungeon" is still a valid, meaningful result,
 * not an empty set a caller has to special-case.
 */
export function warpConnectedMapsFrom(proj: Project, seedMap: string): Set<string> {
  const idToName = new Map(proj.mapNames().map((n) => [proj.map(n).id, n]));
  const seen = new Set<string>([seedMap]);
  const queue = [seedMap];
  while (queue.length) {
    const name = queue.shift()!;
    for (const w of proj.map(name).warpEvents) {
      const dest = idToName.get(w.destMap);
      if (dest && !seen.has(dest)) {
        seen.add(dest);
        queue.push(dest);
      }
    }
  }
  return seen;
}
