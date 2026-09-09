import { describe, it, expect } from "vitest";
import { autoLayoutUnplaced, unplacedMapNames, warpConnectedMapsFrom } from "../../src/world/warpGraph.js";
import { buildWorld, type World } from "../../src/world/connections.js";
import { openProject, type Project } from "../../src/project.js";
import type { MapData } from "../../src/load/maps.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const proj = openProject(SUBJECT_ROOT);

/**
 * A minimal stub, not the corpus: every map in the subject repo has a layout
 * id that resolves, so the delegation test below has no real fixture to
 * reach for. Mirrors packages/cli/test/context.test.ts's stubProject --
 * unused fields are wired to throw-on-call sentinels so a wrong code path
 * fails loudly (wrong stub touched) rather than by coincidence.
 */
function stubProject(overrides: Partial<Project>): Project {
  const unused = (fn: string) => (): never => { throw new Error(`stub: ${fn} should not be called`); };
  return {
    paths: unused("paths") as unknown as Project["paths"],
    profile: unused("profile") as unknown as Project["profile"],
    constants: unused("constants") as unknown as Project["constants"],
    layouts: [],
    groups: unused("groups") as unknown as Project["groups"],
    layoutByName: () => undefined,
    layoutById: () => undefined,
    layoutForMap: unused("layoutForMap"),
    splitFor: unused("splitFor"),
    tileset: unused("tileset"),
    tilesetSymbols: unused("tilesetSymbols"),
    map: unused("map"),
    mapNames: () => [],
    ...overrides,
  };
}

describe("autoLayoutUnplaced", () => {
  itWithCorpus("places every map that has no planar connections", () => {
    const world = buildWorld(proj);
    const before = world.placements.size;
    const placed = autoLayoutUnplaced(proj, world);
    // Pinned, not just non-zero -- matches connections.test.ts's own pin of
    // the same number (sizes.filter(n => n === 1).length). Measured directly
    // against the corpus twice (the existing sibling test, and a standalone
    // buildWorld + count run), not guessed.
    expect(placed.size).toBe(1028);
    expect(world.placements.size).toBe(before); // buildWorld's result is not mutated
  });

  itWithCorpus("clusters maps linked by warps near each other", () => {
    const world = buildWorld(proj);
    const placed = autoLayoutUnplaced(proj, world);
    const base = placed.get("NavelRock_Base");
    const bottom = placed.get("NavelRock_Bottom");
    // Both are singleton components today -- own connections is `0` and no
    // other map's connections array targets either (checked all 1,209) --
    // and NavelRock_Base's warp_events includes a warp to
    // MAP_NAVEL_ROCK_BOTTOM, so the warp graph should genuinely cluster them.
    // Asserting they resolved, rather than guarding the distance check
    // behind `if (base && bottom)`, is the point: a regression in the
    // unplaced predicate must fail this test, not skip past it silently.
    expect(base).toBeDefined();
    expect(bottom).toBeDefined();
    const dist = Math.hypot(base!.x - bottom!.x, base!.y - bottom!.y);
    expect(dist).toBeLessThan(400);
  });

  itWithCorpus("produces no overlapping placements", () => {
    const world = buildWorld(proj);
    const all = [...autoLayoutUnplaced(proj, world).values()];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i]!, b = all[j]!;
        const overlaps = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlaps).toBe(false);
      }
    }
  });

  itWithCorpus("returns an empty map when auto-layout is disabled", () => {
    const world = buildWorld(proj);
    expect(autoLayoutUnplaced(proj, world, { enabled: false }).size).toBe(0);
  });

  it("delegates layout resolution to Project.layoutForMap, not a hand-rolled lookup (I7)", () => {
    // Proves the delegation itself, not just a message string: if sizeOf
    // regressed to re-deriving the lookup with proj.map(name).layout +
    // proj.layoutById(...), it would call the stubbed layoutById (returns
    // undefined) and then the stubbed paths (throws "stub: paths should not
    // be called") while building its own message -- which does NOT match
    // /DELEGATED/ -- so this fails loudly on that regression instead of
    // passing by accident. Mirrors packages/cli/test/context.test.ts's
    // layoutNameFor test exactly, including the rationale: layoutForMap
    // already throws an I7-quality message naming both map.json and
    // layouts.json, so warpGraph has no business reimplementing it.
    const dangling = { id: "MAP_DANGLING", layout: "LAYOUT_DANGLING", warpEvents: [] } as unknown as MapData;
    const stubbed = stubProject({
      mapNames: () => ["Dangling"],
      map: () => dangling,
      layoutForMap: (name: string) => {
        throw new Error(`DELEGATED: map ${name} references a layout not in layouts.json`);
      },
    });
    const world: World = {
      placements: new Map(),
      components: [{ index: 0, maps: ["Dangling"], bounds: { x: 0, y: 0, width: 0, height: 0 } }],
      verticalLinks: [],
      conflicts: [],
    };

    expect(() => autoLayoutUnplaced(stubbed, world)).toThrow(/DELEGATED/);
  });
});

describe("unplacedMapNames", () => {
  it("returns exactly the maps in 1-map components, not those sharing a larger one", () => {
    // Corpus-free by design: pins the negative case (members of the 3-map
    // component must NOT appear) that autoLayoutUnplaced's corpus tests
    // cannot -- they only assert the result is non-empty and that two
    // specific singleton names appear in it, neither of which would catch an
    // over-inclusive filter (e.g. `maps.length >= 1`, which would return
    // every map from every component).
    const world: World = {
      placements: new Map(),
      components: [
        { index: 0, maps: ["A", "B", "C"], bounds: { x: 0, y: 0, width: 0, height: 0 } },
        { index: 1, maps: ["D"], bounds: { x: 0, y: 0, width: 0, height: 0 } },
        { index: 2, maps: ["E"], bounds: { x: 0, y: 0, width: 0, height: 0 } },
      ],
      verticalLinks: [],
      conflicts: [],
    };

    expect(unplacedMapNames(world)).toEqual(new Set(["D", "E"]));
  });
});

describe("warpConnectedMapsFrom", () => {
  /** A tiny synthetic warp graph -- deliberately NOT the corpus, so the
   *  exact reachable set can be hand-verified rather than merely
   *  "non-empty". `warps` maps a map name to the list of names it warps
   *  TO; ids are derived (`MAP_${name}`) so this stays self-contained. */
  function graphProject(warps: Record<string, string[]>): Project {
    const names = Object.keys(warps);
    const mapsByName = new Map(
      names.map((n) => [
        n,
        {
          id: `MAP_${n}`,
          warpEvents: warps[n]!.map((dest) => ({ x: 0, y: 0, elevation: 0, destMap: `MAP_${dest}`, destWarpId: "0" })),
        } as unknown as MapData,
      ]),
    );
    return stubProject({
      mapNames: () => names,
      map: (name: string) => mapsByName.get(name)!,
    });
  }

  it("returns exactly the transitively-reachable set, forward-directional -- no more and no less", () => {
    const proj = graphProject({
      A: ["B"],
      B: ["C", "D"],
      C: [],
      D: ["B"], // back-edge -- must not cause infinite recursion or a duplicate visit
      E: [],    // disconnected island -- must not appear
      F: ["A"], // one-way INTO A -- BFS from A must not reach back through it
    });
    const reached = warpConnectedMapsFrom(proj, "A");
    expect(reached).toEqual(new Set(["A", "B", "C", "D"]));
  });

  it("returns just the seed when it has no warps at all", () => {
    const proj = graphProject({ Solo: [] });
    expect(warpConnectedMapsFrom(proj, "Solo")).toEqual(new Set(["Solo"]));
  });

  it("ignores a warp to a destination id that resolves to no known map", () => {
    const proj = graphProject({ A: [] });
    // Manually inject a warp to an id with no matching map (a real
    // possibility if the corpus and this function ever disagree on which
    // maps exist) -- must be skipped, not throw.
    (proj.map("A").warpEvents as unknown[]).push({ x: 0, y: 0, elevation: 0, destMap: "MAP_GHOST", destWarpId: "0" });
    expect(warpConnectedMapsFrom(proj, "A")).toEqual(new Set(["A"]));
  });
});
