import type { Placement } from "./connections.js";

export interface WarpLink {
  from: string;
  to: string;
  sourceOrdinal: number;
  destinationOrdinal: number | null;
  source: { x: number; y: number };
  arrival: { x: number; y: number } | null;
}

export interface NearWarpInput {
  placements: Map<string, Placement>;
  shown: ReadonlySet<string>;
  hidden: ReadonlySet<string>;
  warps: readonly WarpLink[];
  sizes: ReadonlyMap<string, { width: number; height: number }>;
  gap: number;
  singletons?: ReadonlySet<string>;
}

type Path = { anchor: string; arrival: { x: number; y: number }; keys: string[]; distance: number };
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const ordinal = (n: number) => n < 0 ? "-1" : String(n).padStart(10, "0");
const key = (w: WarpLink) => JSON.stringify([w.from, ordinal(w.sourceOrdinal), w.to, ordinal(w.destinationOrdinal ?? -1)]);
const normalizeZero = (n: number) => n === 0 ? 0 : n;

/** Directed shortest warp path from a singleton through hidden maps to a placed anchor. */
function pathToAnchor(start: string, anchors: ReadonlySet<string>, shown: ReadonlySet<string>, hidden: ReadonlySet<string>, edges: ReadonlyMap<string, WarpLink[]>): Path | null {
  const queue: { map: string; keys: string[]; distance: number }[] = [{ map: start, keys: [], distance: 0 }];
  const seen = new Map<string, number>([[start, 0]]);
  const candidates: Path[] = [];
  let shortest = Infinity;
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    if (current.distance >= shortest) continue;
    for (const edge of edges.get(current.map) ?? []) {
      const distance = current.distance + 1;
      const keys = [...current.keys, key(edge)];
      if (anchors.has(edge.to)) {
        if (edge.arrival) {
          shortest = distance;
          candidates.push({ anchor: edge.to, arrival: edge.arrival, keys, distance });
        }
      } else if (hidden.has(edge.to) && !shown.has(edge.to) && distance < shortest && (seen.get(edge.to) ?? Infinity) >= distance) {
        seen.set(edge.to, distance);
        queue.push({ map: edge.to, keys, distance });
      }
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || compare(a.anchor, b.anchor) || compare(JSON.stringify(a.keys), JSON.stringify(b.keys)));
  return candidates[0] ?? null;
}

function intersects(a: Placement, b: Placement): boolean {
  return a.width > 0 && a.height > 0 && b.width > 0 && b.height > 0 &&
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function preferred(anchor: Placement, arrival: { x: number; y: number }, size: { width: number; height: number }, gap: number): { x: number; y: number } {
  const outsideX = Math.max(0, -arrival.x, arrival.x - anchor.width);
  const outsideY = Math.max(0, -arrival.y, arrival.y - anchor.height);
  const distances = [Math.abs(arrival.y) + outsideX, Math.abs(anchor.width - arrival.x) + outsideY,
    Math.abs(anchor.height - arrival.y) + outsideX, Math.abs(arrival.x) + outsideY];
  const side = distances.indexOf(Math.min(...distances)); // north, east, south, west
  const x = side === 1 ? anchor.x + anchor.width + gap : side === 3 ? anchor.x - gap - size.width : anchor.x + arrival.x - size.width / 2;
  const y = side === 0 ? anchor.y - gap - size.height : side === 2 ? anchor.y + anchor.height + gap : anchor.y + arrival.y - size.height / 2;
  return { x: normalizeZero(Math.round(x)), y: normalizeZero(Math.round(y)) };
}

/** Move shown singleton maps beside their nearest reachable warp entrance. Inputs stay untouched. */
export function placeNearWarps({ placements, shown, hidden, warps, sizes, gap, singletons: explicitSingletons }: NearWarpInput): Map<string, Placement> {
  const out = new Map([...placements].map(([name, p]) => [name, { ...p }]));
  const componentSizes = new Map<number, number>();
  for (const p of out.values()) componentSizes.set(p.component, (componentSizes.get(p.component) ?? 0) + 1);
  const singletons = new Set([...shown].filter((name) => {
    const p = out.get(name);
    return p !== undefined && (explicitSingletons ? explicitSingletons.has(name) : componentSizes.get(p.component) === 1);
  }));
  const fixed = new Set([...shown].filter((name) => out.has(name) && !singletons.has(name)));
  const edges = new Map<string, WarpLink[]>();
  for (const edge of warps) (edges.get(edge.from) ?? edges.set(edge.from, []).get(edge.from)!).push(edge);
  for (const list of edges.values()) list.sort((a, b) => compare(key(a), key(b)));

  // Find the full reachable set first. Unreachable singleton fallbacks block placement.
  const reachable = new Set<string>();
  const possibleAnchors = new Set(fixed);
  let grew = true;
  while (grew) {
    grew = false;
    for (const name of singletons) {
      if (!reachable.has(name) && pathToAnchor(name, possibleAnchors, shown, hidden, edges)) {
        reachable.add(name);
        possibleAnchors.add(name);
        grew = true;
      }
    }
  }
  const anchors = new Set(fixed);
  const pending = new Set(reachable);
  const obstacles = new Set([...shown].filter((name) => out.has(name) && !reachable.has(name)));
  while (pending.size) {
    const candidates = [...pending].map((name) => ({ name, path: pathToAnchor(name, anchors, shown, hidden, edges) }))
      .filter((candidate): candidate is { name: string; path: Path } => candidate.path !== null)
      .sort((a, b) => a.path.distance - b.path.distance || compare(a.name, b.name));
    if (!candidates.length) break;
    const { name, path } = candidates[0]!;
    const anchor = out.get(path.anchor)!;
    const size = sizes.get(name) ?? out.get(name)!;
    const base = preferred(anchor, path.arrival, size, gap);
    const old = out.get(name)!;
    let next: Placement = { ...old, ...size, ...base };
    const free = () => [...obstacles].every((other) => !intersects(next, out.get(other)!));
    if (!free()) {
      for (let radius = 1; ; radius++) {
        const offsets: [number, number][] = [[0, -radius], [radius, 0], [0, radius], [-radius, 0]];
        for (let y = -radius + 1; y < radius; y++) {
          if (y === 0) continue;
          const x = radius - Math.abs(y);
          offsets.push([-x, y], [x, y]);
        }
        let found = false;
        for (const [dx, dy] of offsets) {
          next = { ...next, x: normalizeZero(base.x + dx), y: normalizeZero(base.y + dy) };
          if (free()) { found = true; break; }
        }
        if (found) break;
      }
    }
    out.set(name, next);
    obstacles.add(name);
    anchors.add(name);
    pending.delete(name);
  }
  return out;
}
