import { describe, expect, it } from "vitest";
import { placeNearWarps, type WarpLink } from "../../src/world/nearWarp.js";
import { gbaWarpLinks, gbcWarpLinks } from "../../src/world/nearWarpAdapters.js";
import { resolveWorldPlacements } from "../../src/world/resolve.js";
import { buildWorld, type Placement } from "../../src/world/connections.js";
import { openProject } from "../../src/project.js";
import type { Project } from "../../src/project.js";
import { openGbcProject } from "../../src/gbc/project.js";
import { buildGbcWorld } from "../../src/gbc/world/connections.js";
import type { Sidecar } from "../../src/world/sidecar.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus } from "../gbc/helpers/corpus.js";

const p = (map: string, x: number, y: number, width: number, height: number, component: number): Placement => ({ map, x, y, width, height, component });
const link = (from: string, to: string, arrival: { x: number; y: number } | null, sourceOrdinal = 0): WarpLink => ({ from, to, sourceOrdinal, destinationOrdinal: arrival ? 0 : null, source: { x: 0, y: 0 }, arrival });
const run = (placements: Placement[], shown: string[], hidden: string[], warps: WarpLink[], gap = 1) => placeNearWarps({
  placements: new Map(placements.map((placement) => [placement.map, placement])), shown: new Set(shown), hidden: new Set(hidden),
  warps, sizes: new Map(placements.map((placement) => [placement.map, { width: placement.width, height: placement.height }])), gap,
  singletons: new Set(["Target", "A", "B"]),
});

describe("placeNearWarps", () => {
  it("keeps a map-resolved symbolic GBA warp as traversal-only", () => {
    const maps = {
      Source: { id: "MAP_SOURCE", warpEvents: [{ x: 3, y: 4, destMap: "MAP_GATE", destWarpId: "WARP_ID_DYNAMIC" }] },
      Gate: { id: "MAP_GATE", warpEvents: [] },
    };
    const project = { mapNames: () => Object.keys(maps), map: (name: keyof typeof maps) => maps[name] } as unknown as Project;
    expect(gbaWarpLinks(project)).toEqual([{
      from: "Source", to: "Gate", sourceOrdinal: 0, destinationOrdinal: null, source: { x: 3, y: 4 }, arrival: null,
    }]);
  });
  it("places Target north of Anchor from the resolved arrival endpoint and normalizes signed zero", () => {
    const result = run([p("Anchor", 0, 0, 12, 4, 0), p("Target", 100, 100, 3, 2, 1)], ["Anchor", "Target"], [], [link("Target", "Anchor", { x: 1, y: 0 })]);
    expect(result.get("Target")).toMatchObject({ x: 0, y: -3 });
    expect(result.get("Target")!.x).toBe(0);
    expect(Object.is(result.get("Target")!.x, -0)).toBe(false);
  });

  it("follows a forward Target to hidden Gate to Anchor chain using the final destination event", () => {
    const result = run([p("Anchor", 0, 0, 12, 4, 0), p("Target", 100, 100, 3, 2, 1)], ["Anchor", "Target"], ["Gate"],
      [link("Target", "Gate", null), { ...link("Gate", "Anchor", { x: 1, y: 0 }), source: { x: 99, y: 99 }, sourceOrdinal: 3 }]);
    expect(result.get("Target")).toMatchObject({ x: 0, y: -3 });
  });

  it("uses null arrivals for hidden traversal but never for a final shown anchor", () => {
    const placements = [p("Anchor", 0, 0, 12, 4, 0), p("Target", 100, 100, 3, 2, 1)];
    expect(run(placements, ["Anchor", "Target"], [], [link("Target", "Anchor", null)]).get("Target")).toMatchObject({ x: 100, y: 100 });
    expect(run(placements, ["Anchor", "Target"], ["Gate"], [link("Target", "Gate", null), link("Gate", "Anchor", { x: 1, y: 0 })]).get("Target")).toMatchObject({ x: 0, y: -3 });
  });

  it("takes the first free diagonal after a blocked preferred point and blocked cardinal offsets", () => {
    const obstacles = [[10, 10], [10, 9], [11, 10], [10, 11], [9, 10], [10, 8], [12, 10], [10, 12], [8, 10]]
      .map(([x, y], i) => p(`Block${i}`, x!, y!, 1, 1, i + 2));
    const result = run([p("Anchor", 10, 12, 1, 1, 0), p("Target", 100, 100, 1, 1, 1), ...obstacles],
      ["Anchor", "Target", ...obstacles.map((o) => o.map)], [], [link("Target", "Anchor", { x: 0, y: 0 })]);
    expect(result.get("Target")).toMatchObject({ x: 9, y: 9 });
  });

  it("chooses lexicographic anchor and target order independently of map and link order", () => {
    const placements = [p("ZAnchor", 0, 0, 12, 4, 0), p("AAnchor", 30, 0, 12, 4, 1), p("A", 100, 100, 3, 2, 2), p("B", 100, 100, 3, 2, 3)];
    const warps = [link("B", "AAnchor", { x: 1, y: 0 }), link("A", "ZAnchor", { x: 1, y: 0 }), link("A", "AAnchor", { x: 1, y: 0 }, 1), link("B", "ZAnchor", { x: 1, y: 0 }, 1)];
    const first = run(placements, placements.map((v) => v.map), [], warps);
    const reversed = run([...placements].reverse(), [...placements.map((v) => v.map)].reverse(), [], [...warps].reverse());
    expect(first.get("A")).toMatchObject({ x: 30, y: -3 });
    expect(first.get("B")).toMatchObject({ x: 30, y: -5 });
    expect(JSON.stringify([...first])).toBe(JSON.stringify([...reversed]));
  });
});

const sidecar = (manualPlacements: Sidecar["manualPlacements"] = {}): Sidecar => ({ version: 1, dungeonAutoLayout: true, manualPlacements, view: { x: 0, y: 0, zoom: 1 } });
const overlapPairs = (placements: Map<string, Placement>, shown: Set<string>): string[] => {
  const entries = [...placements].filter(([name]) => shown.has(name));
  const pairs: string[] = [];
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    const [an, a] = entries[i]!, [bn, b] = entries[j]!;
    if (a.width > 0 && a.height > 0 && b.width > 0 && b.height > 0 && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y) {
      pairs.push([an, bn].sort().join("/"));
    }
  }
  return pairs.sort();
};

itWithCorpus("GBA near-warp uses resolved zero-based arrivals for Granite Cave, Meteor Falls, and Seafloor Cavern", () => {
  const proj = openProject(SUBJECT_ROOT);
  const world = buildWorld(proj);
  const links = gbaWarpLinks(proj);
  expect(links.find((w) => w.from === "GraniteCave_1F" && w.sourceOrdinal === 0)).toMatchObject({ to: "Route106", source: { x: 37, y: 12 }, arrival: { x: 48, y: 16 } });
  expect(links.find((w) => w.from === "MeteorFalls_1F_1R" && w.sourceOrdinal === 0)).toMatchObject({ to: "Route114", source: { x: 27, y: 18 }, arrival: { x: 8, y: 63 } });
  expect(links.find((w) => w.from === "ShoalCave_LowTideEntranceRoom" && w.to === "Route125" && w.destinationOrdinal === 0)).toMatchObject({ arrival: { x: 22, y: 19 } });
  // All 54 symbolic dynamic ids in this corpus also target MAP_DYNAMIC, which
  // has no concrete map name and cannot form a traversable named edge.
  expect(proj.map("GoldenrodCity_DepartmentStoreElevator").warpEvents.some((w) => w.destWarpId === "WARP_ID_DYNAMIC" && w.destMap === "MAP_DYNAMIC")).toBe(true);
  const result = resolveWorldPlacements(proj, world, sidecar());
  const repeat = resolveWorldPlacements(proj, world, sidecar());
  for (const name of ["GraniteCave_1F", "MeteorFalls_1F_1R", "SeafloorCavern_Entrance", "SeafloorCavern_Room1"]) expect(result.get(name)).toEqual(repeat.get(name));
  expect(result.get("GraniteCave_1F")).toMatchObject({ x: 18, y: 366 });
  expect(result.get("MeteorFalls_1F_1R")).toMatchObject({ x: -30, y: 44 });
  expect(result.get("SeafloorCavern_Entrance")).toMatchObject({ x: 417, y: 1600 });
  expect(result.get("SeafloorCavern_Room1")).toMatchObject({ x: 440, y: 1537 });
  const shown = new Set(proj.mapNames().filter((name) => !["MAP_TYPE_INDOOR", "MAP_TYPE_NONE"].includes(proj.map(name).mapType)));
  expect(overlapPairs(result, shown)).toEqual([
    "AzaleaTown/Route34", "BellchimeTrail/LakeOfRage", "BellchimeTrail/LakeOfRageLowTide", "EcruteakCity/Route42",
    "GoldenrodCity/RuinsOfAlph_Outside", "LakeOfRage/LakeOfRageLowTide", "Route29/Route30", "Route35/RuinsOfAlph_Outside",
    "SafariZone_Enterance/SafariZone_Low_Right", "SafariZone_Low_Right/SafariZone_Top_Right",
  ]);
  const manual = resolveWorldPlacements(proj, world, sidecar({ GraniteCave_1F: { x: 0, y: 342 } }));
  expect(manual.get("GraniteCave_1F")).toMatchObject({ x: 0, y: 342 });
  expect(overlapPairs(manual, new Set(["GraniteCave_1F", "Route106"]))).toEqual(["GraniteCave_1F/Route106"]);
});

itWithGbcCorpus("GBC adapter preserves half-block endpoints and null out-of-range arrival", () => {
  const proj = openGbcProject(GBC_SUBJECT_ROOT);
  const links = gbcWarpLinks(proj);
  expect(links.find((w) => w.from === "CeruleanCave1F" && w.sourceOrdinal === 0)).toMatchObject({ to: "CeruleanCity", destinationOrdinal: 6, arrival: null });
  expect(links.find((w) => w.from === "IlexForestAzaleaGate" && w.sourceOrdinal === 2)).toMatchObject({ to: "AzaleaTown", destinationOrdinal: 6, arrival: { x: 1, y: 5 } });
  expect(links.find((w) => w.from === "IlexForestAzaleaGate" && w.sourceOrdinal === 3)).toMatchObject({ to: "AzaleaTown", destinationOrdinal: 7, arrival: { x: 1, y: 5.5 } });
  const world = buildGbcWorld(proj);
  const shown = new Set(proj.maps.filter((map) => !["INDOOR", "GATE"].includes(map.environment)).map((map) => map.name));
  const hidden = new Set(proj.maps.filter((map) => !shown.has(map.name)).map((map) => map.name));
  const input = { placements: world.placements, shown, hidden, warps: links, gap: 4,
    sizes: new Map([...world.placements].map(([name, p]) => [name, { width: p.width, height: p.height }])),
    singletons: new Set(world.components.filter((c) => c.maps.length === 1).map((c) => c.maps[0]!)) };
  const before = structuredClone([...world.placements]);
  const result = placeNearWarps(input);
  expect([...world.placements]).toEqual(before);
  expect([...placeNearWarps(input)]).toEqual([...result]);
  expect(result.get("IlexForest")).toMatchObject({ x: 40, y: 259 });
  expect(result.get("DarkCaveVioletEntrance")).toMatchObject({ x: 122, y: 197 });
  expect(result.get("BurnedTower1F")).toMatchObject({ x: 73, y: 166 });
  expect(result.get("BurnedTowerB1F")).toMatchObject({ x: 73, y: 153 });
  expect(overlapPairs(result, shown)).toEqual([]);
});
