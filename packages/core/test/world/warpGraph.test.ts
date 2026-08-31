import { describe, it, expect } from "vitest";
import { autoLayoutUnplaced } from "../../src/world/warpGraph.js";
import { buildWorld, type World } from "../../src/world/connections.js";
import { openProject, type Project } from "../../src/project.js";
import type { MapData } from "../../src/load/maps.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const proj = openProject(SUBJECT_ROOT);

/**
 * A minimal stub, not the corpus: every map in the subject repo has a layout
 * id that resolves (connections.ts's sibling sizeOf measured 0 of 1,209 maps
 * hitting that refusal), so the I7 test below has no real fixture to reach
 * for. Mirrors packages/cli/test/context.test.ts's stubProject -- unused
 * fields are wired to throw-on-call sentinels so a wrong code path fails
 * loudly (wrong stub touched) rather than by coincidence.
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
    expect(placed.size).toBeGreaterThan(0);
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

  it("refuses rather than guess a 0x0 size when a map's layout id does not resolve (I7)", () => {
    // Untested on the real corpus by construction -- every map's layout id
    // resolves there. Present anyway, for the same reason connections.ts's
    // sibling sizeOf is: a silent {0,0} here would also defeat the "no
    // overlapping placements" test above, since a zero-size box can never
    // overlap anything -- the bug would hide behind a passing test rather
    // than tripping one.
    const dangling = { id: "MAP_DANGLING", layout: "LAYOUT_DANGLING", warpEvents: [] } as unknown as MapData;
    const stubbed = stubProject({
      paths: {
        mapJson: (n: string) => `data/maps/${n}/map.json`,
        layoutsJson: "data/layouts/layouts.json",
      } as unknown as Project["paths"],
      mapNames: () => ["Dangling"],
      map: () => dangling,
      layoutById: () => undefined,
    });
    const world: World = {
      placements: new Map(),
      components: [{ index: 0, maps: ["Dangling"], bounds: { x: 0, y: 0, width: 0, height: 0 } }],
      verticalLinks: [],
      conflicts: [],
    };

    expect(() => autoLayoutUnplaced(stubbed, world)).toThrow(/data\/maps\/Dangling\/map\.json/);
    expect(() => autoLayoutUnplaced(stubbed, world)).toThrow(/LAYOUT_DANGLING/);
    expect(() => autoLayoutUnplaced(stubbed, world)).toThrow(/layouts\.json/);
  });
});
