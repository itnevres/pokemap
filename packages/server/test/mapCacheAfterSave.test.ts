// Plan H Task G, G1 pin test.
//
// After a commit that moves/adds events, every consumer that reads the hub's
// cached Project (mapCache, allMapsCache, ...) must report the SAVED data, not
// the data from before the save. All caches are primed BEFORE the commit so a
// stale copy would be observable. One `it` per consumer so a failure names it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { createServer, type PokemapServer } from "../src/index.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";

const MAP = "EcruteakCity";
const OTHER = "BurnedTower_1F"; // its warp 0 arrives at EcruteakCity warp 2 (dest_warp_id "2")
const OBJECT = { index: 0, from: { x: 35, y: 43 }, to: { x: 36, y: 44 } };
const WARP = { index: 2, from: { x: 22, y: 14 }, to: { x: 40, y: 10 } };
const ADDED = { x: 5, y: 5, elevation: 0, dest_map: "MAP_BURNED_TOWER_1F", dest_warp_id: "1" };

describe.skipIf(!hasProject(SUBJECT_ROOT))("GBA cached project after a save (temporary subject copy)", () => {
  let root: string, server: PokemapServer, base: string;
  let before: { map: any; warps: any; world: any };
  let addedIndex: number;

  const get = async (path: string, from = base) => {
    const r = await fetch(`${from}${path}`);
    return { status: r.status, body: await r.json() as any };
  };
  const post = async (path: string, body: unknown = {}) => {
    const r = await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() as any };
  };

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "pokemap-gba-mapcache-")).replace(/\\/g, "/");
    for (const part of ["data/layouts", "data/maps", "data/tilesets", "graphics/tilesets", "include", "src/data",
      "src/graphics.c", "charmap.txt", "porymap.project.cfg"]) {
      if (!existsSync(`${SUBJECT_ROOT}/${part}`)) continue;
      mkdirSync(dirname(`${root}/${part}`), { recursive: true });
      cpSync(`${SUBJECT_ROOT}/${part}`, `${root}/${part}`, { recursive: true });
    }
    server = await createServer({ projectPath: root, port: 0 });
    base = `http://127.0.0.1:${server.port}`;

    // Prime every cache with the pre-save state.
    const map = await get(`/api/map/${MAP}`);
    const warps = await get(`/api/warps/${MAP}`);
    const world = await get("/api/world");
    expect([map.status, warps.status, world.status]).toEqual([200, 200, 200]);
    expect((await get(`/api/defects/${MAP}`)).status).toBe(200); // primes the defects route too
    before = { map: map.body, warps: warps.body, world: world.body };
    expect(before.map.map.objectEvents[OBJECT.index]).toMatchObject(OBJECT.from);
    expect(before.map.map.warpEvents[WARP.index]).toMatchObject(WARP.from);
    addedIndex = before.map.map.warpEvents.length;
    // Building the warp-delete scan caches every map's pre-save warps.
    expect((await post(`/api/edit/${OTHER}/event/delete`, { kind: "warp", index: 0 })).status).toBe(200);
    expect((await post(`/api/edit/${OTHER}/discard`)).status).toBe(200);

    // One session, one commit: move an object and a warp, add a warp.
    expect((await post(`/api/edit/${MAP}/event/move`, { kind: "object", index: OBJECT.index, ...OBJECT.to })).status).toBe(200);
    expect((await post(`/api/edit/${MAP}/event/move`, { kind: "warp", index: WARP.index, ...WARP.to })).status).toBe(200);
    expect((await post(`/api/edit/${MAP}/event/add`, { kind: "warp", value: ADDED })).status).toBe(200);
    const plan = (await get(`/api/edit/${MAP}/plan`)).body;
    expect(plan.refusals).toEqual([]);
    const commit = await post(`/api/edit/${MAP}/commit`, { fingerprint: plan.fingerprint });
    expect(commit.status, JSON.stringify(commit.body)).toBe(200);
  }, 300_000);

  afterAll(async () => {
    await server?.close();
    if (root) {
      const target = resolve(root);
      if (!target.startsWith(resolve(tmpdir()) + sep) || !target.includes("pokemap-gba-mapcache-")) throw new Error("unsafe temporary path");
      rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  });

  it("map.json on disk holds the saved coordinates", () => {
    const disk = JSON.parse(readFileSync(`${root}/data/maps/${MAP}/map.json`, "utf8"));
    expect(disk.object_events[OBJECT.index]).toMatchObject(OBJECT.to);
    expect(disk.warp_events[WARP.index]).toMatchObject(WARP.to);
    expect(disk.warp_events[addedIndex]).toMatchObject(ADDED);
  });

  it("GET /api/map/:name returns the saved object and warp coordinates", async () => {
    const { status, body } = await get(`/api/map/${MAP}`);
    expect(status).toBe(200);
    expect(body.map.objectEvents[OBJECT.index]).toMatchObject(OBJECT.to);
    expect(body.map.warpEvents[WARP.index]).toMatchObject(WARP.to);
    expect(body.map.warpEvents).toHaveLength(addedIndex + 1);
    expect(body.map.warpEvents[addedIndex]).toMatchObject({ x: ADDED.x, y: ADDED.y, destMap: ADDED.dest_map });
  });

  it("GET /api/warps/:name lists the saved warp coordinates and the added warp", async () => {
    const { status, body } = await get(`/api/warps/${MAP}`);
    expect(status).toBe(200);
    expect(body.warps[WARP.index]).toMatchObject(WARP.to);
    expect(body.warps).toHaveLength(addedIndex + 1);
    expect(body.warps[addedIndex]).toMatchObject({ x: ADDED.x, y: ADDED.y, destMap: ADDED.dest_map, destMapName: OTHER });
  });

  it("GET /api/world places a warp-linked map from the saved warp arrival, like a fresh process", async () => {
    const live = await get("/api/world");
    expect(live.status).toBe(200);
    // Pin: placements come from the cached project plus the sidecar on every call, and `worldCache`
    // (connections and layouts only) never reads event data, so a fresh process is the oracle.
    const fresh = await createServer({ projectPath: root, port: 0 });
    try {
      const reference = await get("/api/world", `http://127.0.0.1:${fresh.port}`);
      expect(reference.status).toBe(200);
      expect(live.body.placements).toEqual(reference.body.placements);
    } finally { await fresh.close(); }
  }, 300_000);

  it("GET /api/defects/:name answers for the saved map exactly like a fresh process", async () => {
    // The route re-reads the cached project, so it must not serve defects derived from pre-save events.
    const live = await get(`/api/defects/${MAP}`);
    expect(live.status).toBe(200);
    expect(Array.isArray(live.body.defects)).toBe(true);
    expect(Array.isArray(live.body.incomplete)).toBe(true);
    const fresh = await createServer({ projectPath: root, port: 0 });
    try {
      const reference = await get(`/api/defects/${MAP}`, `http://127.0.0.1:${fresh.port}`);
      expect(reference.status).toBe(200);
      expect(live.body).toEqual(reference.body);
    } finally { await fresh.close(); }
  }, 300_000);

  it("event/delete warpRenumberWarnings scan sees the warp added and saved on another map", async () => {
    const r = await post(`/api/edit/${OTHER}/event/delete`, { kind: "warp", index: 1 });
    expect(r.status).toBe(200);
    expect(r.body.warpRenumberWarnings).toContainEqual({ fromMapId: "MAP_ECRUTEAK_CITY", warpIndex: addedIndex });
    expect((await post(`/api/edit/${OTHER}/discard`)).status).toBe(200);
  }, 300_000);

  it("a reopened edit session starts from the saved coordinates", async () => {
    // Re-moving an event onto its current position only opens the session and echoes its map.
    const { x, y } = before.map.map.objectEvents[1];
    const r = await post(`/api/edit/${MAP}/event/move`, { kind: "object", index: 1, x, y });
    expect(r.status).toBe(200);
    expect(r.body.map.objectEvents[OBJECT.index]).toMatchObject(OBJECT.to);
    expect(r.body.map.warpEvents[WARP.index]).toMatchObject(WARP.to);
    expect((await post(`/api/edit/${MAP}/discard`)).status).toBe(200);
  }, 300_000);
});
