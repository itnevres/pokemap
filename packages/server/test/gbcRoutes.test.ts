import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type PokemapServer } from "../src/index.js";
import { openGbcProject } from "@pokemap/core/src/gbc/project.js";
import { GBC_SUBJECT_ROOT, hasGbcProject } from "@pokemap/core/test/gbc/helpers/corpus.js";

let s: PokemapServer;
const get = async (path: string) => fetch(`http://127.0.0.1:${s.port}${path}`);
const post = async (path: string, body: unknown = {}) =>
  fetch(`http://127.0.0.1:${s.port}${path}`, { method: "POST", body: JSON.stringify(body) });
const patch = async (path: string, body: unknown = {}) =>
  fetch(`http://127.0.0.1:${s.port}${path}`, { method: "PATCH", body: JSON.stringify(body) });

// Same "hooks live INSIDE the describe" reasoning as api.test.ts's own
// GBA suite (see that file's comment, packages/server/test/api.test.ts:10-17):
// createServer opens the real project, so a hoisted beforeAll would run even
// under a skipped describe.
describe.skipIf(!hasGbcProject(GBC_SUBJECT_ROOT))("gbcRoutes", () => {
  beforeAll(async () => { s = await createServer({ projectPath: GBC_SUBJECT_ROOT, port: 0 }); });
  afterAll(async () => { await s?.close(); });

  it("GET /api/project reports the gbc family and the project's own root", async () => {
    const expectedRoot = openGbcProject(GBC_SUBJECT_ROOT).root; // computed independently of the server's own instance
    const r = await get("/api/project");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ family: "gbc", root: expectedRoot });
  });

  it("createServer against a gbc root returns family: \"gbc\" on the PokemapServer itself", () => {
    expect(s.family).toBe("gbc");
  });

  describe("GBA-only routes are refused with 501, naming the path, for every method", () => {
    const cases: { label: string; call: () => Promise<Response>; path: string }[] = [
      { label: "/api/warps/:name", path: "/api/warps/NewBarkTown", call: () => get("/api/warps/NewBarkTown") },
      { label: "/api/dungeons (bare)", path: "/api/dungeons", call: () => get("/api/dungeons") },
      { label: "/api/dungeons/:id (PATCH)", path: "/api/dungeons/x", call: () => patch("/api/dungeons/x") },
      { label: "/api/world/placement (POST)", path: "/api/world/placement", call: () => post("/api/world/placement") },
      { label: "/api/world/dungeons (POST)", path: "/api/world/dungeons", call: () => post("/api/world/dungeons") },
      { label: "/api/sign/:name/suggestions", path: "/api/sign/NewBarkTown/suggestions", call: () => get("/api/sign/NewBarkTown/suggestions") },
      { label: "/api/edit/:name/undo (POST)", path: "/api/edit/NewBarkTown/undo", call: () => post("/api/edit/NewBarkTown/undo") },
      { label: "/api/species/:name/icon.png", path: "/api/species/CHIKORITA/icon.png", call: () => get("/api/species/CHIKORITA/icon.png") },
    ];

    for (const { label, call, path } of cases) {
      it(label, async () => {
        const r = await call();
        expect(r.status).toBe(501);
        expect(await r.json()).toEqual({ error: `${path} is not supported for gbc (pokecrystal-family) projects yet` });
      });
    }
  });

  it("404s an unknown path", async () => {
    const r = await get("/api/nope");
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "not found" });
  });

  describe("near-misses that must NOT be refused (proves the 501 regex anchors)", () => {
    it("/api/worldx is a 404, not a 501 for /api/world/*", async () => {
      const r = await get("/api/worldx");
      expect(r.status).toBe(404);
    });

    it("/api/world/placementx is a 404 -- the $ anchor on world/placement$ must not match a longer path", async () => {
      const r = await get("/api/world/placementx");
      expect(r.status).toBe(404);
    });

    // Task 2 adds a real /api/species route; pinned as 404 here so that
    // task's own test can update this one rather than silently drifting.
    it("/api/species (bare, no name) is a 404 in this task -- Task 2 adds it", async () => {
      const r = await get("/api/species");
      expect(r.status).toBe(404);
    });
  });

  it("/api/map/NewBarkTown is a 404 in this task (Task 1b adds it) -- also proves the GBC handler, not the GBA one, answered", async () => {
    const r = await get("/api/map/NewBarkTown");
    expect(r.status).toBe(404);
  });

  it("/api/groups is a 404 in this task (the GBA-only route is not served by GBA code; Task 1b adds the GBC one)", async () => {
    const r = await get("/api/groups");
    expect(r.status).toBe(404);
  });
});
