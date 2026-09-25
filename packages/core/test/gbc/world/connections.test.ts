import { describe, it, expect } from "vitest";
import { buildGbcWorld, boundsOf, layOutComponents } from "../../../src/gbc/world/connections.js";
import { openGbcProject, type GbcProject } from "../../../src/gbc/project.js";
import type { GbcMap, Connection } from "../../../src/gbc/model/types.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus } from "../helpers/corpus.js";

// ---------------------------------------------------------------------------
// Hand-derived fixture, built from the real GbcProject/GbcMap interfaces --
// no unchecked `as` casts. Every unused GbcProject method throws loudly if a
// test path reaches it by mistake (mirrors render/map.test.ts's own
// stubProject).
// ---------------------------------------------------------------------------

function makeMap(overrides: Partial<GbcMap>): GbcMap {
  return {
    name: "TestMap",
    constName: "TEST_MAP",
    group: 0,
    number: 1,
    width: 1,
    height: 1,
    blkPath: "maps/TestMap.blk",
    tileset: "TILESET_TEST",
    environment: "TOWN",
    landmark: "LANDMARK_NONE",
    music: "MUSIC_NONE",
    phoneFlag: "FALSE",
    palette: "PALETTE_DAY",
    fishGroup: "FISHGROUP_NONE",
    border: 0,
    connectionFlags: "0",
    connections: [],
    ...overrides,
  };
}

function conn(direction: Connection["direction"], targetName: string, targetConst: string, offset: number): Connection {
  return { direction, targetName, targetConst, offset };
}

function stubGbcProject(maps: GbcMap[]): GbcProject {
  const unused = (fn: string) => (): never => { throw new Error(`stub: ${fn} should not be called`); };
  const byName = new Map(maps.map((m) => [m.name, m]));
  return {
    root: "<stub>",
    maps,
    map: (name: string) => {
      const m = byName.get(name);
      if (!m) throw new Error(`stub: unknown map ${name}`);
      return m;
    },
    tileset: unused("tileset"),
    paletteTables: unused("paletteTables"),
    roofs: unused("roofs"),
    layout: unused("layout"),
    paddingWidth: unused("paddingWidth"),
    wild: unused("wild"),
    waterCollisionValues: unused("waterCollisionValues"),
    groupNames: unused("groupNames"),
    collisionInfo: unused("collisionInfo"),
  };
}

/**
 * A "+"-shaped fixture: Home in the middle, one neighbour in each direction,
 * each with a distinct non-zero offset. Every offset and size below is
 * invented for the test, not derived from the corpus.
 *
 *   North (6x5)
 *   West (5x8)  Home (10x8)  East (9x8)
 *   South (7x4)
 *
 * Home is listed first, so `buildGbcWorld`'s `remaining` set (built from
 * `proj.maps.map(m => m.name)`, insertion order) picks it as the BFS seed at
 * (0,0) -- the same "first in the array wins as seed" behaviour `buildWorld`
 * (GBA) has always had, not a new assumption this fixture depends on.
 */
function plusFixtureMaps(): GbcMap[] {
  return [
    makeMap({
      name: "Home", constName: "HOME", width: 10, height: 8,
      connections: [
        conn("north", "North", "NORTH", 2),
        conn("south", "South", "SOUTH", -1),
        conn("west", "West", "WEST", 3),
        conn("east", "East", "EAST", -2),
      ],
    }),
    makeMap({ name: "North", constName: "NORTH", width: 6, height: 5 }),
    makeMap({ name: "South", constName: "SOUTH", width: 7, height: 4 }),
    makeMap({ name: "West", constName: "WEST", width: 5, height: 8 }),
    makeMap({ name: "East", constName: "EAST", width: 9, height: 8 }),
  ];
}

describe("buildGbcWorld: hand-derived fixture", () => {
  it("places all four neighbours at the exact block coordinates the findings' formulas give", () => {
    const proj = stubGbcProject(plusFixtureMaps());
    const w = buildGbcWorld(proj);

    // Assertions are relative to Home, not absolute: `layOutComponents`
    // (the shared GBA shelf-pack) shifts every map in a component by the
    // SAME (dx, dy) so the component's tight bounding box starts at its
    // packed row/column origin -- here that shift is (+5, +5), since the
    // component's own pre-pack bounds are x:-5,y:-5 (West's x, North's y).
    // The formulas under test are about RELATIVE placement, so this checks
    // exactly that, the same way the GBA corpus test checks
    // `route.x === town.x - route.width` rather than an absolute number.
    const home = w.placements.get("Home")!;
    expect(home).toMatchObject({ width: 10, height: 8 });

    const north = w.placements.get("North")!;
    // north: target at (x + offset, y - targetHeight) = (home.x+2, home.y-5)
    expect(north).toMatchObject({ x: home.x + 2, y: home.y - 5, width: 6, height: 5 });

    const south = w.placements.get("South")!;
    // south: target at (x + offset, y + height) = (home.x-1, home.y+8)
    expect(south).toMatchObject({ x: home.x - 1, y: home.y + 8, width: 7, height: 4 });

    const west = w.placements.get("West")!;
    // west: target at (x - targetWidth, y + offset) = (home.x-5, home.y+3)
    expect(west).toMatchObject({ x: home.x - 5, y: home.y + 3, width: 5, height: 8 });

    const east = w.placements.get("East")!;
    // east: target at (x + width, y + offset) = (home.x+10, home.y-2)
    expect(east).toMatchObject({ x: home.x + 10, y: home.y - 2, width: 9, height: 8 });

    expect(w.conflicts).toEqual([]);
    expect(w.components).toHaveLength(1);
    expect(w.components[0]!.maps.sort()).toEqual(["East", "Home", "North", "South", "West"]);
  });

  it("records a conflict, naming both paths that placed the map differently, without throwing", () => {
    const maps = plusFixtureMaps();
    // East (pre-pack: Home.x+10, Home.y-2 = 0+10, 0-2 = 10,-2) gets a south
    // connection to a shared "Bridge" map: south -> (10+4, -2+8) = (14, 6).
    maps.find((m) => m.name === "East")!.connections = [conn("south", "Bridge", "BRIDGE", 4)];
    // North (pre-pack: 0+2, 0-5 = 2,-5) gets an east connection to the SAME
    // Bridge, at an offset chosen to disagree: east -> (2+6, -5+15) = (8, 10).
    maps.find((m) => m.name === "North")!.connections = [conn("east", "Bridge", "BRIDGE", 15)];
    maps.push(makeMap({ name: "Bridge", constName: "BRIDGE", width: 4, height: 4 }));

    const proj = stubGbcProject(maps);
    const w = buildGbcWorld(proj);

    // Conflict coordinates are recorded during the BFS, BEFORE
    // `layOutComponents`' end-of-build shelf-pack shift runs -- these are the
    // pre-pack numbers computed above, not `w.placements`' final (shifted)
    // ones.
    //
    // Fix round 1 (spec review Issue 1): pin the exact `Conflict`, not just
    // "both positions appear in either order" -- `viaB.from` is documented as
    // the map that ACTUALLY placed the target (`placedBy`), and a viaA/viaB
    // swap is a real, distinct bug (it would flip which map a UI should
    // trust) that the previous `toContainEqual`-in-either-order shape could
    // not catch. Home's own connections list is [north, south, west, east],
    // and each is pushed onto the BFS queue as it's placed, so North is
    // dequeued (and reaches Bridge) BEFORE East -- North places Bridge first
    // (`viaB`), and East's later, disagreeing edge becomes `viaA`.
    expect(w.conflicts).toEqual([
      { map: "Bridge", viaA: { from: "East", x: 14, y: 6 }, viaB: { from: "North", x: 8, y: 10 } },
    ]);

    // Bridge itself is still placed exactly once (whichever path won), not
    // dropped, and not duplicated across components.
    expect(w.placements.has("Bridge")).toBe(true);
    expect(w.components).toHaveLength(1);
  });

  it("refuses an unknown target const, naming the source map and the const", () => {
    const maps = plusFixtureMaps();
    maps.find((m) => m.name === "Home")!.connections.push(conn("north", "Ghost", "GHOST_CONST_NOT_A_REAL_MAP", 0));
    const proj = stubGbcProject(maps);

    expect(() => buildGbcWorld(proj)).toThrow(/Home/);
    expect(() => buildGbcWorld(proj)).toThrow(/GHOST_CONST_NOT_A_REAL_MAP/);
  });

  it("resolves by targetConst, not targetName -- a mismatched targetName is ignored", () => {
    // If this resolved by targetName instead, it would fail to find "Home"
    // (the const HOME maps to name "Home", but this connection's targetName
    // field is a red herring "NotHome") or would place a phantom map named
    // "NotHome" that never exists as its own GbcMap. Resolving through
    // targetConst gives the correct, real target regardless.
    const maps = plusFixtureMaps();
    const solo = makeMap({
      name: "Solo", constName: "SOLO", width: 4, height: 4,
      connections: [conn("east", "NotHome", "HOME", 0)],
    });
    maps.push(solo);
    const proj = stubGbcProject(maps);
    const w = buildGbcWorld(proj);

    // Solo becomes its own component (nothing points TO it: this is a
    // one-way edge, Home has no connection back to Solo), but its own
    // connection resolves correctly through the const to the REAL "Home"
    // (never a phantom "NotHome" placement).
    expect(w.placements.has("NotHome")).toBe(false);
    expect(w.placements.has("Solo")).toBe(true);
    expect(w.components).toHaveLength(2);

    // Fix round 1 (spec review Minor m4): this one-way edge into an
    // ALREADY-PLACED map of an EARLIER component is not "never considered" --
    // an earlier version of this comment claimed the BFS skips it, which is
    // wrong. Solo's queue-processing loop still runs `existing =
    // placements.get("Home")`, finds it (Home was placed while building the
    // FIRST component), and records a conflict when Solo's own computed
    // position for "Home" (east: `(Solo.x + Solo.width, Solo.y + 0)` =
    // `(4, 0)`, since Solo seeds its own component at `(0,0)`) disagrees with
    // Home's real position `(0, 0)` in ITS OWN component's pre-pack frame --
    // two coordinate frames that were never meant to be compared, since they
    // belong to different components entirely. This is inherited verbatim
    // from GBA's `buildWorld` (which has the identical cross-component
    // comparison for the same reason) and is moot on the real corpus (0
    // one-way edges, measured in "every connection reciprocates" below) --
    // documented here, and in `buildGbcWorld`'s own doc comment, rather than
    // fixed, since fixing it is out of this task's scope and GBA has never
    // needed to.
    expect(w.conflicts).toEqual([
      { map: "Home", viaA: { from: "Solo", x: 4, y: 0 }, viaB: { from: "Solo", x: 0, y: 0 } },
    ]);
  });

  it("places a map with no connections as its own 1-map component", () => {
    const maps = plusFixtureMaps();
    maps.push(makeMap({ name: "Solo", constName: "SOLO", width: 3, height: 3 }));
    const proj = stubGbcProject(maps);
    const w = buildGbcWorld(proj);

    expect(w.placements.size).toBe(6);
    const solo = w.components.find((c) => c.maps.length === 1 && c.maps[0] === "Solo");
    expect(solo).toBeDefined();
    // Size survives untouched; x/y are NOT asserted as (0,0) here -- the
    // end-of-build shelf-pack (`layOutComponents`) repacks every component's
    // origin, including a lone one, so Solo's final position depends on
    // which row it lands in next to the bigger component, not on its own
    // BFS-seed origin. That packing is covered by its own test below.
    expect(w.placements.get("Solo")).toMatchObject({ width: 3, height: 3 });
  });

  it("shelf-packs multiple components without overlap", () => {
    const maps = plusFixtureMaps();
    maps.push(makeMap({ name: "Solo1", constName: "SOLO1", width: 3, height: 3 }));
    maps.push(makeMap({ name: "Solo2", constName: "SOLO2", width: 300, height: 3 })); // wider than any reasonable row target
    const proj = stubGbcProject(maps);
    const w = buildGbcWorld(proj);

    expect(w.components).toHaveLength(3);
    for (let i = 0; i < w.components.length; i++) {
      for (let j = i + 1; j < w.components.length; j++) {
        const a = w.components[i]!.bounds, b = w.components[j]!.bounds;
        const overlaps = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlaps).toBe(false);
      }
    }
  });
});

describe("boundsOf / layOutComponents (re-exported from the GBA module, used directly)", () => {
  it("boundsOf computes the tight bounding box of the named maps' placements", () => {
    const placements = new Map([
      ["A", { map: "A", x: 0, y: 0, width: 10, height: 5, component: 0 }],
      ["B", { map: "B", x: -3, y: 2, width: 4, height: 4, component: 0 }],
    ]);
    expect(boundsOf(["A", "B"], placements)).toEqual({ x: -3, y: 0, width: 13, height: 6 });
  });

  it("layOutComponents with no opts keeps GBA's own default gap/rowTarget (8/512)", () => {
    // Three same-size (200x10), same-`maps.length` (so the size-descending
    // sort leaves them in array order) components. With the real defaults
    // (gap 8, rowTarget 512): A at x=0, cursorX becomes 208; B fits at
    // x=208 (208+200=408 <= 512), cursorX becomes 416; C does NOT fit
    // (416+200=616 > 512) and wraps to a new row at (0, 10+8=18). Chosen so
    // EITHER default drifting (gap or rowTarget, either direction) flips at
    // least one of these three assertions -- pinning the exact behaviour
    // rather than something looser, since the GBA corpus suite that would
    // normally catch a default change can't run in this environment (Task 11
    // spec: "GBA tests can't run here ... the change must be provably
    // behaviour-neutral by inspection").
    const components = [
      { index: 0, maps: ["A"], bounds: { x: 0, y: 0, width: 200, height: 10 } },
      { index: 1, maps: ["B"], bounds: { x: 0, y: 0, width: 200, height: 10 } },
      { index: 2, maps: ["C"], bounds: { x: 0, y: 0, width: 200, height: 10 } },
    ];
    const placements = new Map([
      ["A", { map: "A", x: 0, y: 0, width: 200, height: 10, component: 0 }],
      ["B", { map: "B", x: 0, y: 0, width: 200, height: 10, component: 1 }],
      ["C", { map: "C", x: 0, y: 0, width: 200, height: 10, component: 2 }],
    ]);
    layOutComponents(components, placements);
    expect(placements.get("A")).toMatchObject({ x: 0, y: 0 });
    expect(placements.get("B")).toMatchObject({ x: 208, y: 0 });
    expect(placements.get("C")).toMatchObject({ x: 0, y: 18 });
  });
});

// ---------------------------------------------------------------------------
// Corpus
// ---------------------------------------------------------------------------

describe("buildGbcWorld: corpus", () => {
  itWithGbcCorpus("NewBarkTown/Route29: exact relative placement", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const w = buildGbcWorld(proj);
    const nbt = w.placements.get("NewBarkTown")!;
    const route29 = w.placements.get("Route29")!;
    // NewBarkTown -west-> Route29, offset 0.
    expect(route29.x).toBe(nbt.x - route29.width);
    expect(route29.y).toBe(nbt.y);
  });

  itWithGbcCorpus("AzaleaTown/Route34: connection west, Route34, ROUTE_34, -18", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const w = buildGbcWorld(proj);
    const azalea = w.placements.get("AzaleaTown")!;
    const route34 = w.placements.get("Route34")!;
    expect(route34.y).toBe(azalea.y - 18);
    expect(route34.x).toBe(azalea.x - route34.width);
  });

  itWithGbcCorpus("places all 391 maps into 326 components: 35+31+2 multi-map, 323 singletons", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const w = buildGbcWorld(proj);
    expect(w.placements.size).toBe(391);
    expect(w.components.length).toBe(326);

    const sizes = w.components.map((c) => c.maps.length).sort((a, b) => b - a);
    expect(sizes.slice(0, 3)).toEqual([35, 31, 2]);
    expect(sizes.filter((n) => n === 1).length).toBe(323);
    expect(sizes.filter((n) => n > 1).length).toBe(3);
    expect(w.components.reduce((n, c) => n + c.maps.length, 0)).toBe(391);
  });

  itWithGbcCorpus("NewBarkTown's component has 31 maps, named here, and is NOT Kanto's", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const w = buildGbcWorld(proj);
    const componentOf = (m: string) => w.components[w.placements.get(m)!.component]!;

    const nbtComponent = componentOf("NewBarkTown");
    expect(nbtComponent.maps).toHaveLength(31);
    // Measured member set (Johto's overworld-connected maps). A change here
    // means the corpus's connection graph itself changed, not noise to
    // reba baseline.
    expect(nbtComponent.maps.sort()).toEqual([
      "AzaleaTown", "BlackthornCity", "CherrygroveCity", "CianwoodCity", "EcruteakCity",
      "GoldenrodCity", "LakeOfRage", "MahoganyTown", "NewBarkTown", "OlivineCity",
      "Route26", "Route27", "Route29", "Route30", "Route31", "Route32", "Route33",
      "Route34", "Route35", "Route36", "Route37", "Route38", "Route39", "Route40",
      "Route41", "Route42", "Route43", "Route44", "Route45", "Route46", "VioletCity",
    ].sort());

    // Kanto (PalletTown's landmass) is a SEPARATE component -- the
    // Kanto<->Johto ferry (Olivine<->Vermilion) is a warp, not a planar
    // `connection` record, so it plays no part in this BFS.
    expect(componentOf("NewBarkTown")).not.toBe(componentOf("PalletTown"));
    expect(componentOf("PalletTown").maps).toHaveLength(35);
  });

  /**
   * Measured, not guessed: **2**. `Route18` and `Route17` are each placed
   * differently depending which of two paths reaches them first. Both edges
   * involved (Route17<->Route18, Route16<->Route17) are themselves
   * INDIVIDUALLY reciprocal (measured, "every connection reciprocates" below)
   * -- the disagreement is not a bad `connection` line, but a longer cycle
   * that fails to close in the plane. Spec review (task-11-spec-review.md
   * §1.2, hand-derived and cross-checked against an independent stitcher)
   * traced the actual non-closing cycle: a 13-map loop Route16 -> Route17 ->
   * Route18 -> FuchsiaCity -> Route15 -> Route14 -> Route13 -> Route12 ->
   * LavenderTown -> Route8 -> SaffronCity -> Route7 -> CeladonCity -> back to
   * Route16, which disagrees with the direct Route17<->Route18 edge by
   * exactly 1 block in y. (Fix round 1, spec review Minor m6: an earlier
   * version of this comment named a "Route16/17/18/FuchsiaCity/Route19/
   * Route15 loop" -- there is no 4-6 map loop here at all, Route19 is not on
   * the real cycle, and "loop" undersold that it takes 13 maps to fail to
   * close.) Confirmed by mutation: PerfPlus's `attributes.asm` connection
   * lines are byte-identical to vanilla pret/pokecrystal's, so this is a real
   * retail-game data fact, not a PerfPlus-specific or implementation bug --
   * the same class of finding as GBA's own Safari Zone/RuinsOfAlph/
   * EcruteakCity conflicts (`packages/core/test/world/connections.test.ts`).
   * Reporting it instead of silently picking one side is the feature
   * (Porymap never builds a global coordinate space, so it can't surface
   * this at all).
   */
  itWithGbcCorpus("reports exactly the 2 measured contradictions, by full identity, never silently picking one", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const w = buildGbcWorld(proj);
    for (const c of w.conflicts) {
      expect([c.viaA.x, c.viaA.y]).not.toEqual([c.viaB.x, c.viaB.y]);
    }
    // Fix round 1 (spec review Issue 1): pin every conflict's full identity
    // (map, both `from` names, both coordinate pairs, pre-pack), not just
    // the count -- a viaA/viaB swap or a wrong `from` name would previously
    // have passed this test.
    expect(w.conflicts).toEqual([
      { map: "Route18", viaA: { from: "Route17", x: 40, y: 87 }, viaB: { from: "FuchsiaCity", x: 40, y: 88 } },
      { map: "Route17", viaA: { from: "Route18", x: 30, y: 50 }, viaB: { from: "Route16", x: 30, y: 49 } },
    ]);
  });

  /**
   * All 142 `connection` records in the corpus reciprocate: every A->B has a
   * B->A partner whose offset is exactly -o, measured directly from
   * `GbcMap.connections` (independent of `buildGbcWorld`'s own placement
   * math) -- 71 pairs, 0 one-way. A sign error on either axis of the
   * PLACEMENT formulas would not change this count (it's a property of the
   * source data, not of `buildGbcWorld`), which is exactly why the
   * conflict-count pin above, not this one, is what the mutation-check's
   * axis-negation cases must flip.
   */
  itWithGbcCorpus("every connection reciprocates with the negated offset: 71 pairs, 0 unpaired", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const rev: Record<Connection["direction"], Connection["direction"]> = {
      west: "east", east: "west", north: "south", south: "north",
    };
    const byConst = new Map(proj.maps.map((m) => [m.constName, m]));

    let reciprocated = 0;
    let unpaired = 0;
    let mismatches = 0;
    for (const m of proj.maps) {
      for (const c of m.connections) {
        const target = byConst.get(c.targetConst)!;
        const back = target.connections.find((bc) => bc.direction === rev[c.direction] && bc.targetConst === m.constName);
        if (!back) { unpaired++; continue; }
        reciprocated++;
        if (back.offset !== -c.offset) mismatches++;
      }
    }
    expect(reciprocated / 2).toBe(71);
    expect(unpaired).toBe(0);
    expect(mismatches).toBe(0);
  });

  /**
   * Fix round 1 (quality review Important #1): `GBC_ROW_TARGET`/`GBC_GAP`'s
   * specific values (256/8) were previously asserted only by doc comment --
   * mutating them to 50/1 left every existing test green, since
   * "shelf-packs multiple components without overlap" holds for ANY
   * positive rowTarget/gap. Pinning the full packed extent (measured: 255
   * blocks wide, 746 tall) is sensitive to both: a smaller `rowTarget` would
   * wrap Johto (235 blocks wide) into a second, narrower row, shrinking the
   * width and growing the height; a different `gap` shifts every row
   * boundary. `boundsOf` (re-exported from the GBA module) computes this
   * directly over every placed map's key, not a hand-summed loop.
   */
  itWithGbcCorpus("packs the whole world into a 255x746-block bounding box", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const w = buildGbcWorld(proj);
    const allMaps = [...w.placements.keys()];
    expect(allMaps).toHaveLength(391);
    expect(boundsOf(allMaps, w.placements)).toEqual({ x: 0, y: 0, width: 255, height: 746 });
  });

  itWithGbcCorpus("Johto and Kanto land in separate, non-overlapping rows", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const w = buildGbcWorld(proj);
    const johto = w.components[w.placements.get("NewBarkTown")!.component]!;
    const kanto = w.components[w.placements.get("PalletTown")!.component]!;
    // Both are wider than a too-small rowTarget (e.g. 50) could fit
    // side-by-side without wrapping into each other's row -- if a mutated
    // rowTarget wrapped Johto (235 blocks wide) mid-landmass or merged it
    // into Kanto's row, their y-ranges would overlap.
    const yRangesOverlap =
      johto.bounds.y < kanto.bounds.y + kanto.bounds.height &&
      kanto.bounds.y < johto.bounds.y + johto.bounds.height;
    expect(yRangesOverlap).toBe(false);
  });
});
