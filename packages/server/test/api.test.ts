import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { createServer, type PokemapServer } from "../src/index.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { norm } from "@pokemap/core/src/config/paths.js";

let s: PokemapServer;
const get = async (path: string) => fetch(`http://127.0.0.1:${s.port}${path}`);
const post = async (path: string, body: unknown) =>
  fetch(`http://127.0.0.1:${s.port}${path}`, { method: "POST", body: JSON.stringify(body) });

// The hooks live INSIDE the describe, not beside it. `createServer` opens the
// real project, so an `it`-level guard is too late -- but so is a
// `describe.skipIf` with the hooks hoisted above it, because a file-level
// `beforeAll` is not covered by a suite's skip and runs anyway. Putting them
// inside is what actually makes the skip work.
describe.skipIf(!hasProject(SUBJECT_ROOT))("server", () => {
  beforeAll(async () => { s = await createServer({ projectPath: SUBJECT_ROOT, port: 0 }); });
  afterAll(async () => { await s?.close(); });

  it("GET /api/project reports the gba family and the project's normalised root (Plan 6b family isolation)", async () => {
    const r = await get("/api/project");
    expect(r.status).toBe(200);
    const body = await r.json() as { family: string; root: string };
    expect(body).toEqual({ family: "gba", root: norm(SUBJECT_ROOT) });
  });

  // Spec review finding 5: SUBJECT_ROOT itself has no trailing slash, so the
  // test above can't tell the normalised `project.paths.root` from the raw
  // `opts.projectPath` -- a route answering with the raw input would still
  // pass it. A second server, opened with a trailing slash appended, is the
  // one input that can tell the two apart.
  it("GET /api/project reports the normalised root, not the raw projectPath, when given a trailing slash", async () => {
    const slashServer = await createServer({ projectPath: `${SUBJECT_ROOT}/`, port: 0 });
    try {
      const expectedRoot = norm(SUBJECT_ROOT);
      const r = await fetch(`http://127.0.0.1:${slashServer.port}/api/project`);
      expect(await r.json()).toEqual({ family: "gba", root: expectedRoot });
      expect(expectedRoot.endsWith("/")).toBe(false);
    } finally {
      await slashServer.close();
    }
  });

  it("lists map groups", async () => {
    const r = await get("/api/groups");
    expect(r.status).toBe(200);
    const body = await r.json() as { groupOrder: string[]; groups: Record<string, string[]> };
    expect(body.groupOrder[0]).toBe("gMapGroup_TownsAndRoutes");
    expect(body.groups[body.groupOrder[0]!]).toContain("NewBarkTown");
  });

  it("GET /api/defects returns structural defects and 404s unknown maps", async () => {
    const r = await get("/api/defects/Route101");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ defects: [], incomplete: [] });
    expect((await get("/api/defects/NoSuchMap")).status).toBe(404);
    const bad = await (await get("/api/defects/Saffron_Temp")).json() as any;
    expect(bad.incomplete).toEqual([]);
    expect(bad.defects).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "gameplay" })]));
  });

  it("returns a map's header, split and layout metadata", async () => {
    const body = await (await get("/api/map/NewBarkTown")).json() as any;
    expect(body.map.id).toBe("MAP_NEW_BARK_TOWN");
    expect(body.layout.name).toBe("NewBarkTown_Layout");
    expect(body.split.metatiles).toBe(640);
    expect(body.split.version).toBe("hns");
    // MetatilePalette needs these to size its grid -- values verified
    // independently against project.tileset(layout.primaryTileset/
    // secondaryTileset).metatileCount for NewBarkTown_Layout
    // (gTileset_Johto_General / gTileset_NewBarkTown), not guessed.
    expect(body.primaryCount).toBe(640);
    expect(body.secondaryCount).toBe(144);
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

  it("renders live edited state once an edit session is open, bypassing the PNG cache entirely", async () => {
    // Route30 is untouched by any other test in this file (or, since each
    // test file gets its own server instance via its own beforeAll, by any
    // other test file's paint either) -- no risk of a stray already-open
    // session making this test pass by accident.
    const map = "Route30";
    const disk = Buffer.from(await (await get(`/api/render/${map}.png?border=0`)).arrayBuffer());

    await post(`/api/edit/${map}/paint/begin`, {});
    const applied = await (await post(`/api/edit/${map}/paint/apply`, {
      tool: "pencil", targets: [{ x: 0, y: 0 }], stamp: { width: 1, height: 1, cells: [{ metatileId: 42 }] }, origin: { x: 0, y: 0 },
    })).json() as any;
    expect(applied.blocks[0].metatileId).toBe(42); // the session really did change block (0,0)

    const live = Buffer.from(await (await get(`/api/render/${map}.png?border=0`)).arrayBuffer());
    // A real, discriminating pixel-level assertion, not just status 200: the
    // PNG served while the session is open must differ from the PNG served
    // before any edit existed.
    expect(live.equals(disk)).toBe(false);

    // Undo reverts the session's blocks back to disk state; the render must
    // follow -- proof this route is reading the session live, not caching
    // the one live render it happened to produce. /paint/end first, same as
    // this project's own established pattern (paintRoutes.test.ts): undo
    // reverts the stack's last pushed command, and nothing is pushed until
    // /end closes the stroke.
    await post(`/api/edit/${map}/paint/end`, {});
    await post(`/api/edit/${map}/undo`, {});
    const afterUndo = Buffer.from(await (await get(`/api/render/${map}.png?border=0`)).arrayBuffer());
    expect(afterUndo.equals(disk)).toBe(true);
  }, 300_000);

  it("an untouched map keeps rendering identically -- opening a session elsewhere doesn't disable its render", async () => {
    // Spec-review honesty fix (issue 3): this asserts GoldenrodCity's render
    // is byte-identical across two fetches with no session ever opened for
    // it. renderLayout is deterministic, so this does NOT by itself prove
    // pngCache was actually hit the second time -- it would pass exactly
    // the same way with pngCache deleted entirely. What it DOES prove: the
    // live-session branch above (keyed on editSessions.has(name)) has no
    // observable effect on a DIFFERENT map's render, i.e. no cross-map
    // leakage from the new bypass logic. Proving an actual cache hit would
    // need a real observability hook (a hit counter, or spying on the
    // server's internal pngCache Map) that does not exist today; not
    // worth adding for this one assertion.
    const a = Buffer.from(await (await get("/api/render/GoldenrodCity.png?border=0")).arrayBuffer());
    const b = Buffer.from(await (await get("/api/render/GoldenrodCity.png?border=0")).arrayBuffer());
    expect(a.equals(b)).toBe(true);
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

  it("returns a map's warp events, with each destination resolved to a map NAME too", async () => {
    // NewBarkTown_Lab's real first warp -- read directly from the subject
    // decomp's own data/maps/NewBarkTown_Lab/map.json before writing this
    // test, not assumed.
    const body = await (await get("/api/warps/NewBarkTown_Lab")).json() as any;
    expect(body.mapName).toBe("NewBarkTown_Lab");
    const toTown = body.warps.find((w: any) => w.destMap === "MAP_NEW_BARK_TOWN");
    expect(toTown).toBeDefined();
    expect(toTown.x).toBe(6);
    expect(toTown.y).toBe(12);
    expect(toTown.destWarpId).toBe("0");
    // The one thing this route adds beyond the raw parsed data: destMap
    // (a raw MAP_ID constant) resolved onto a real map NAME too, the same
    // idToName enrichment /api/coverage and /api/where already use for the
    // identical reason (the client only ever works with map names).
    expect(toTown.destMapName).toBe("NewBarkTown");
  });

  it("404s an unknown map for /api/warps too", async () => {
    expect((await get("/api/warps/NoSuchMap")).status).toBe(404);
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

  it("GET /api/species returns every species name, sorted", async () => {
    const r = await get("/api/species");
    expect(r.status).toBe(200);
    const species = await r.json() as string[];
    expect(species.length).toBeGreaterThan(300);
    expect(species).toContain("SPECIES_ESPEON");
    expect(species).toEqual([...species].sort());
  });

  it("renders one metatile as a 16x16 PNG, split-aware", async () => {
    const r = await get("/api/metatile/PetalburgCity_Layout/0.png");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    const buf = Buffer.from(await r.arrayBuffer());
    expect(buf.readUInt32BE(16)).toBe(16);
    expect(buf.readUInt32BE(20)).toBe(16);
  });

  it("404s an unknown layout name for the metatile route", async () => {
    expect((await get("/api/metatile/NoSuchLayout/0.png")).status).toBe(404);
  });

  it("400s a non-integer metatile id", async () => {
    expect((await get("/api/metatile/PetalburgCity_Layout/abc.png")).status).toBe(400);
  });
});


describe("defects route parse failures (temporary project)", () => {
  let root: string, server: PokemapServer;
  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "pokemap-defects-api-"));
    for (const dir of ["include/constants", "data/maps/Test", "data/maps/Other", "data/layouts", "src/data/tilesets"]) {
      mkdirSync(join(root, dir), { recursive: true });
    }
    const put = (path: string, data: string | Buffer) => writeFileSync(join(root, path), data);
    put("include/fieldmap.h", "");
    put("include/constants/map_groups.h", "#define MAP_TEST (0 | (0 << 8))\n#define MAP_OTHER (1 | (0 << 8))\n");
    put("data/maps/map_groups.json", JSON.stringify({ group_order: ["g"], g: ["Test", "Other"] }));
    for (const name of ["Test", "Other"]) put(`data/maps/${name}/map.json`, JSON.stringify({
      id: `MAP_${name.toUpperCase()}`, name, layout: "L", warp_events: [], object_events: [],
    }));
    put("data/layouts/layouts.json", JSON.stringify({ layouts: [{ id: "L", name: "L", width: 2, height: 2,
      primary_tileset: "gTileset_Test", secondary_tileset: "gTileset_Test", blockdata_filepath: "data/layouts/map.bin" }] }));
    put("data/layouts/map.bin", Buffer.alloc(10)); // Known C1 independent of cross-map lookups.
    put("src/data/tilesets/headers.h", "const struct Tileset gTileset_Test = {\n.metatiles = gMetatiles_Test,\n.metatileAttributes = gAttributes_Test,\n};");
    put("src/data/tilesets/metatiles.h", 'const u16 gMetatiles_Test[] = INCBIN_U16("./metatiles.bin");\nconst u16 gAttributes_Test[] = INCBIN_U16("./attributes.bin");');
    put("src/data/tilesets/graphics.h", "");
    put("src/graphics.c", "");
    put("metatiles.bin", Buffer.alloc(16));
    put("attributes.bin", Buffer.alloc(2));
    put("tiles.png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAMAAAAoyzS7AAAAA1BMVEUAAACnej3aAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==", "base64"));
    server = await createServer({ projectPath: root, port: 0 });
  });
  afterAll(async () => {
    await server?.close();
    if (root) rmSync(root, { recursive: true, force: true });
  });
  it.each(["{", '{"warp_events":{}}'])("returns the selected defect despite unrelated malformed JSON/events: %s", async (bad) => {
    writeFileSync(join(root, "data/maps/Other/map.json"), bad);
    const r = await fetch(`http://127.0.0.1:${server.port}/api/defects/Test`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      defects: [expect.objectContaining({ kind: "size", file: "data/layouts/map.bin" })],
      incomplete: [{ file: "data/maps/Other/map.json", reason: expect.any(String) }],
    });
  });
  it.each([false, true])("reports a missing warp target only when the map index is complete: %s", async (complete) => {
    const mapFile = join(root, "data/maps/Test/map.json");
    const before = readFileSync(mapFile);
    const otherFile = join(root, "data/maps/Other/map.json");
    const otherBefore = readFileSync(otherFile);
    try {
      writeFileSync(join(root, "data/layouts/map.bin"), Buffer.alloc(8));
      writeFileSync(otherFile, complete ? JSON.stringify({ id: "MAP_OTHER", name: "Other", layout: "L", warp_events: [], object_events: [] }) : "{");
      writeFileSync(mapFile, JSON.stringify({ ...JSON.parse(before.toString()), warp_events: [{ dest_map: "MAP_UNKNOWN_X", dest_warp_id: "0" }] }));
      const r = await fetch(`http://127.0.0.1:${server.port}/api/defects/Test`);
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({
        defects: complete ? [expect.objectContaining({ kind: "build", message: expect.stringContaining("MAP_UNKNOWN_X") })] : [],
        incomplete: complete ? [] : [{ file: "data/maps/Other/map.json", reason: expect.any(String) }],
      });
    } finally {
      writeFileSync(mapFile, before);
      writeFileSync(otherFile, otherBefore);
      writeFileSync(join(root, "data/layouts/map.bin"), Buffer.alloc(10));
    }
  });
  it("retains structural defects when the GBA index throws and retries after the backoff", async () => {
    const isolated = await createServer({ projectPath: root, port: 0 });
    const readDir = fs.readdirSync;
    const spy = vi.spyOn(fs, "readdirSync").mockImplementation(((...args: Parameters<typeof readDir>) => {
      if (String(args[0]).replace(/\\/g, "/") === root.replace(/\\/g, "/")) throw new Error("injected unreadable symbol directory");
      return Reflect.apply(readDir, fs, args);
    }) as typeof readDir);
    syncBuiltinESMExports();
    try {
      const get = () => fetch(`http://127.0.0.1:${isolated.port}/api/defects/Test`);
      const first = await get();
      expect(first.status).toBe(200);
      const partial = await first.json() as { defects: unknown[]; incomplete: { reason: string }[] };
      expect(partial).toMatchObject({ defects: [expect.objectContaining({ kind: "size" })], incomplete: expect.arrayContaining([
        expect.objectContaining({ reason: expect.stringContaining("C7-C9") }),
      ]) });
      spy.mockRestore(); syncBuiltinESMExports();
      expect(JSON.stringify(await (await get()).json())).toContain("C7-C9"); // Within the 5 s backoff the failure is reused.
      const later = Date.now() + 5_000;
      vi.spyOn(Date, "now").mockReturnValue(later);
      const second = await get();
      expect(second.status).toBe(200);
      const complete = await second.json() as { defects: unknown[]; incomplete: { reason: string }[] };
      expect(complete.defects).toEqual(partial.defects);
      expect(complete.incomplete.some((entry) => entry.reason.includes("C7-C9"))).toBe(false);
    } finally {
      spy.mockRestore(); syncBuiltinESMExports(); vi.mocked(Date.now).mockRestore?.(); await isolated.close();
    }
  });
  it("returns 500 with the selected map filename when it is malformed", async () => {
    writeFileSync(join(root, "data/maps/Test/map.json"), "{");
    const r = await fetch(`http://127.0.0.1:${server.port}/api/defects/Test`);
    expect(r.status).toBe(500);
    expect(await r.json()).toMatchObject({ error: expect.stringContaining("data/maps/Test/map.json") });
  });
});
