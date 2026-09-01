import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type PokemapServer } from "../src/index.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";

let s: PokemapServer;
const get = async (path: string) => fetch(`http://127.0.0.1:${s.port}${path}`);

// The hooks live INSIDE the describe, not beside it. `createServer` opens the
// real project, so an `it`-level guard is too late -- but so is a
// `describe.skipIf` with the hooks hoisted above it, because a file-level
// `beforeAll` is not covered by a suite's skip and runs anyway. Putting them
// inside is what actually makes the skip work.
describe.skipIf(!hasProject(SUBJECT_ROOT))("server", () => {
  beforeAll(async () => { s = await createServer({ projectPath: SUBJECT_ROOT, port: 0 }); });
  afterAll(async () => { await s?.close(); });

  it("lists map groups", async () => {
    const r = await get("/api/groups");
    expect(r.status).toBe(200);
    const body = await r.json() as { groupOrder: string[]; groups: Record<string, string[]> };
    expect(body.groupOrder[0]).toBe("gMapGroup_TownsAndRoutes");
    expect(body.groups[body.groupOrder[0]!]).toContain("NewBarkTown");
  });

  it("returns a map's header, split and layout metadata", async () => {
    const body = await (await get("/api/map/NewBarkTown")).json() as any;
    expect(body.map.id).toBe("MAP_NEW_BARK_TOWN");
    expect(body.layout.name).toBe("NewBarkTown_Layout");
    expect(body.split.metatiles).toBe(640);
    expect(body.split.version).toBe("hns");
  });

  it("includes per-block collision/elevation/behaviour so the canvas can overlay and hover them", async () => {
    // MapCanvas draws collision/elevation overlays and a hover status strip
    // client-side, entirely off data already on the page -- no per-hover
    // network round trip. That requires the raw block grid, which the PNG
    // route (pixels only) and the map route (header metadata only, until now)
    // do not carry.
    const body = await (await get("/api/map/PetalburgCity")).json() as any;
    expect(Array.isArray(body.blocks)).toBe(true);
    // 30x30, matching layout.width * layout.height -- same fixture, same
    // count Task 21's core overlay test measures independently.
    expect(body.blocks.length).toBe(900);
    const blocked = body.blocks.filter((b: any) => b.collision !== 0).length;
    expect(blocked).toBe(429);
    for (const b of body.blocks) {
      expect(typeof b.metatileId).toBe("number");
      expect(typeof b.collision).toBe("number");
      expect(typeof b.elevation).toBe("number");
      expect(typeof b.behavior).toBe("number");
    }
  });

  it("serves a rendered layout as a PNG", async () => {
    const r = await get("/api/render/PetalburgCity.png?border=1");
    expect(r.headers.get("content-type")).toBe("image/png");
    const buf = Buffer.from(await r.arrayBuffer());
    expect(buf.readUInt32BE(0)).toBe(0x89504e47);
  });

  it("404s an unknown map rather than throwing", async () => {
    expect((await get("/api/map/NoSuchMap")).status).toBe(404);
  });

  it("404s an unknown render target too, and refuses a bad border", async () => {
    // The render route resolves its target through project.map(), which throws
    // for an unknown name. Without a guard that throw reaches the outer catch
    // and becomes a 500 -- the right answer is 404, the same as /api/map.
    expect((await get("/api/render/NoSuchMap.png")).status).toBe(404);

    // `Number("abc")` is NaN, which propagates into the raster dimensions.
    // Task 15 fixed exactly this on the CLI; the server reuses that parser
    // rather than growing its own second-best copy.
    expect((await get("/api/render/PetalburgCity.png?border=abc")).status).toBe(400);
    expect((await get("/api/render/PetalburgCity.png?border=1.5")).status).toBe(400);
  });

  it("keys the PNG cache on the border, not just the map", async () => {
    // Collapsing the cache key to the map name alone serves the first-rendered
    // size forever. Every other test in this file requests each target once, so
    // nothing else can catch it.
    const plain = Buffer.from(await (await get("/api/render/PetalburgCity.png")).arrayBuffer());
    const bordered = Buffer.from(await (await get("/api/render/PetalburgCity.png?border=1")).arrayBuffer());

    // IHDR width is at byte 16; 30 blocks at 16px, plus one 2-block ring each side.
    expect(plain.readUInt32BE(16)).toBe(30 * 16);
    expect(bordered.readUInt32BE(16)).toBe((30 + 4) * 16);
    expect(plain.equals(bordered)).toBe(false);
  });

  it("serves a species icon as a 32x32 PNG", async () => {
    const r = await get("/api/species/SPECIES_ESPEON/icon.png");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    const buf = Buffer.from(await r.arrayBuffer());
    expect(buf.readUInt32BE(0)).toBe(0x89504e47);
    expect(buf.readUInt32BE(16)).toBe(32);
    expect(buf.readUInt32BE(20)).toBe(32);
  });

  it("serves the overworld sprite via ?source=overworld", async () => {
    const icon = Buffer.from(await (await get("/api/species/SPECIES_POLIWRATH/icon.png")).arrayBuffer());
    const overworld = Buffer.from(await (await get("/api/species/SPECIES_POLIWRATH/icon.png?source=overworld")).arrayBuffer());
    expect(overworld.readUInt32BE(16)).toBe(32);
    expect(overworld.readUInt32BE(20)).toBe(32);
    // Same nominal size, different sheet (icon.png vs the object-event pic) --
    // a route that silently ignored ?source= would serve byte-identical PNGs.
    expect(icon.equals(overworld)).toBe(false);
  });

  it("404s a species with no art rather than throwing", async () => {
    expect((await get("/api/species/SPECIES_NOT_A_REAL_MON/icon.png")).status).toBe(404);
  });

  it("400s an unrecognised ?source=", async () => {
    expect((await get("/api/species/SPECIES_ESPEON/icon.png?source=bogus")).status).toBe(400);
  });

  it("404s a frame past the sheet's last real one, rather than 200ing a blank PNG", async () => {
    // Espeon's icon.png has exactly 2 frames -- inherited from
    // renderSpeciesIcon's own bounds check (packages/core/src/render/
    // species.ts), not reimplemented here.
    expect((await get("/api/species/SPECIES_ESPEON/icon.png?frame=99")).status).toBe(404);
  });

  it("returns a map's per-method species chances as true percentages, not slot counts", async () => {
    // Route101's day table: every land_mons slot is SPECIES_ESPEON (weights
    // 20+20+10+10+10+10+5+5+4+4+1+1 = 100), matching
    // packages/core/test/load/encounters.test.ts's own fixture facts exactly.
    const body = await (await get("/api/encounters/Route101")).json() as any;
    expect(body.mapId).toBe("MAP_ROUTE101");
    const landRows = body.methods.filter((r: any) => r.method === "land_mons");
    expect(landRows.length).toBe(1);
    expect(landRows[0].rod).toBeUndefined(); // rod is fishing-only
    expect(landRows[0].chances.length).toBe(1);
    const espeon = landRows[0].chances[0];
    expect(espeon.species).toBe("SPECIES_ESPEON");
    expect(espeon.percent).toBeCloseTo(100, 5);
    expect(espeon.minLevel).toBe(2);
    expect(espeon.maxLevel).toBe(3);
    // 12 slots collapse to one entry -- the count that would leak through if
    // a caller mistakenly displayed slots.length as if it were the percentage.
    expect(espeon.slots.length).toBe(12);
  });

  it("defaults to entry 0 (day), not a map's other variants", async () => {
    const body = await (await get("/api/encounters/Route101")).json() as any;
    const landChances = body.methods.find((r: any) => r.method === "land_mons").chances;
    expect(landChances[0].species).toBe("SPECIES_ESPEON");
    expect(landChances.some((c: any) => c.species === "SPECIES_UMBREON")).toBe(false);
  });

  it("splits fishing into three separate rod rows, not one Old-Rod-only default", async () => {
    // Route102's real fishing_mons: mons
    // [Magikarp,Goldeen,Magikarp,Goldeen,Corphish x6], weights
    // [70,30,60,20,20,40,40,15,4,1]. FISHING_RODS segments this as
    // old=[0,2) good=[2,5) super=[5,10) -- verified directly against the
    // subject decomp's own wild_encounters.json before writing this test,
    // not assumed.
    const body = await (await get("/api/encounters/Route102")).json() as any;
    const fishing = body.methods.filter((r: any) => r.method === "fishing_mons");
    expect(fishing.length).toBe(3);
    expect(fishing.map((r: any) => r.rod).sort()).toEqual(["good", "old", "super"]);

    const byRod = Object.fromEntries(fishing.map((r: any) => [r.rod, r.chances]));
    const oldSpecies = Object.fromEntries(byRod.old.map((c: any) => [c.species, c.percent]));
    expect(oldSpecies.SPECIES_MAGIKARP).toBeCloseTo(70, 5);
    expect(oldSpecies.SPECIES_GOLDEEN).toBeCloseTo(30, 5);
    expect(oldSpecies.SPECIES_CORPHISH).toBeUndefined(); // Corphish is Good/Super Rod only

    const goodSpecies = Object.fromEntries(byRod.good.map((c: any) => [c.species, c.percent]));
    expect(goodSpecies.SPECIES_MAGIKARP).toBeCloseTo(60, 5);
    expect(goodSpecies.SPECIES_GOLDEEN).toBeCloseTo(20, 5);
    expect(goodSpecies.SPECIES_CORPHISH).toBeCloseTo(20, 5);

    const superSpecies = Object.fromEntries(byRod.super.map((c: any) => [c.species, c.percent]));
    expect(Object.keys(superSpecies)).toEqual(["SPECIES_CORPHISH"]);
    expect(superSpecies.SPECIES_CORPHISH).toBeCloseTo(100, 5); // 40+40+15+4+1 across 5 slots

    // Each rod totals 100 independently -- not 300 for treating all 10
    // slots as one distribution, and not silently just the Old Rod's 100.
    for (const rod of ["old", "good", "super"]) {
      const total = byRod[rod].reduce((a: number, c: any) => a + c.percent, 0);
      expect(total).toBeCloseTo(100, 5);
    }
  });

  it("returns an empty methods array for a map with no encounter table, not a 404", async () => {
    // 982 of 1,209 maps carry no table at all (spec §9) -- an ordinary state,
    // not an error. NewBarkTown_Lab is a plain interior with none.
    const r = await get("/api/encounters/NewBarkTown_Lab");
    expect(r.status).toBe(200);
    const body = await r.json() as any;
    expect(body.methods).toEqual([]);
  });

  it("404s an unknown map for /api/encounters too", async () => {
    expect((await get("/api/encounters/NoSuchMap")).status).toBe(404);
  });

  it("returns coverage summary counts, and resolves a map name onto each levelByMap entry", async () => {
    const body = await (await get("/api/coverage")).json() as any;
    // Same real numbers packages/core/test/analyse/coverage.test.ts pins
    // directly against coverage() -- this route is a thin wire wrapper
    // around that exact function, so these must agree.
    expect(body.encounterTables).toBe(497);
    expect(body.mapsWithEncounters).toBe(227);
    expect(body.mapsWithoutEncounters.length).toBe(982);
    expect(body.unusedSpecies).toContain("SPECIES_ABOMASNOW");

    // The one thing this route adds beyond coverage() itself: mapName
    // resolved onto every levelByMap entry, since the world view keys its
    // placements by map NAME, not mapId (world/connections.ts's own
    // Placement.map) -- coverage()'s own levelByMap is keyed by mapId only.
    const route101 = body.levelByMap.find((m: any) => m.mapId === "MAP_ROUTE101");
    expect(route101).toBeDefined();
    expect(route101.mapName).toBe("Route101");
    expect(route101.averageLevel).toBeGreaterThan(1);
  });

  it("finds where a species appears, case-insensitively and with or without the SPECIES_ prefix", async () => {
    const body = await (await get("/api/where/ESPEON")).json() as any;
    const route101 = body.find((h: any) => h.mapId === "MAP_ROUTE101");
    expect(route101).toBeDefined();
    expect(route101.method).toBe("land_mons");
    expect(route101.percent).toBeCloseTo(100, 5);
    expect(route101.minLevel).toBe(2);

    expect(await (await get("/api/where/espeon")).json()).toEqual(body);
    expect(await (await get("/api/where/SPECIES_ESPEON")).json()).toEqual(body);
  });

  it("returns an empty array for a species that appears nowhere, not a 404", async () => {
    const r = await get("/api/where/NOT_A_REAL_MON");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual([]);
  });
});
