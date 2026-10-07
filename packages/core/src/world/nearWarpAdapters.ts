import type { Project } from "../project.js";
import type { GbcProject } from "../gbc/project.js";
import { loadGbcMapEvents } from "../gbc/load/events.js";
import type { WarpLink } from "./nearWarp.js";

/** Preserve directed GBA links even when a symbolic destination warp has no arrival coordinate. */
export function gbaWarpLinks(proj: Project): WarpLink[] {
  const names = proj.mapNames();
  const byId = new Map(names.map((name) => [proj.map(name).id, name]));
  const links: WarpLink[] = [];
  for (const from of names) {
    proj.map(from).warpEvents.forEach((event, sourceOrdinal) => {
      const to = byId.get(event.destMap);
      if (!to) return;
      const destinationOrdinal = /^(0|[1-9]\d*)$/.test(event.destWarpId) ? Number(event.destWarpId) : null;
      const destination = destinationOrdinal === null ? undefined : proj.map(to).warpEvents[destinationOrdinal];
      links.push({
        from, to, sourceOrdinal, destinationOrdinal,
        source: { x: event.x, y: event.y },
        arrival: destination ? { x: destination.x, y: destination.y } : null,
      });
    });
  }
  return links;
}

/** GBC event coordinates are 16-pixel steps; world placements are 32-pixel blocks. */
export function gbcWarpLinks(proj: GbcProject): WarpLink[] {
  const byConst = new Map(proj.maps.map((map) => [map.constName, map.name]));
  const events = new Map(proj.maps.map((map) => [map.name, loadGbcMapEvents(proj.root, map).events.warps]));
  const links: WarpLink[] = [];
  for (const map of proj.maps) {
    events.get(map.name)!.forEach((event, sourceOrdinal) => {
      const to = byConst.get(event.mapConst);
      if (!to) return;
      const destinationOrdinal = event.destWarp > 0 ? event.destWarp - 1 : null;
      const destination = destinationOrdinal === null ? undefined : events.get(to)?.[destinationOrdinal];
      links.push({
        from: map.name, to, sourceOrdinal, destinationOrdinal,
        source: { x: event.x / 2, y: event.y / 2 },
        arrival: destination ? { x: destination.x / 2, y: destination.y / 2 } : null,
      });
    });
  }
  return links;
}

/** Follow outgoing GBC warp-map edges, including hidden maps and cycles. */
export function gbcWarpConnectedMapsFrom(seedMap: string, links: readonly WarpLink[]): Set<string> {
  const outgoing = new Map<string, string[]>();
  for (const { from, to } of links) {
    const targets = outgoing.get(from) ?? [];
    targets.push(to);
    outgoing.set(from, targets);
  }
  const seen = new Set<string>([seedMap]);
  const queue = [seedMap];
  for (let i = 0; i < queue.length; i++) {
    for (const to of outgoing.get(queue[i]!) ?? []) {
      if (seen.has(to)) continue;
      seen.add(to);
      queue.push(to);
    }
  }
  return seen;
}
