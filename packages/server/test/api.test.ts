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
});
