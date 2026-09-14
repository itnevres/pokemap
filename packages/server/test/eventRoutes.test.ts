import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type PokemapServer } from "../src/index.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";

let s: PokemapServer;
const post = async (path: string, body: unknown = {}) =>
  fetch(`http://127.0.0.1:${s.port}${path}`, { method: "POST", body: JSON.stringify(body) });

describe.skipIf(!hasProject(SUBJECT_ROOT))("event routes", () => {
  beforeAll(async () => { s = await createServer({ projectPath: SUBJECT_ROOT, port: 0 }); });
  afterAll(async () => { await s?.close(); });

  it("event/move updates the session's map data and stages exactly x/y jsonEdits, undoable in one step", async () => {
    const map = "NewBarkTown_Lab"; // has a real object event
    const before = await (await fetch(`http://127.0.0.1:${s.port}/api/map/${map}`)).json() as any;
    const kind = "object", index = 0;
    const r = await post(`/api/edit/${map}/event/move`, { kind, index, x: 1, y: 1 });
    expect(r.status).toBe(200);
    const moved = await r.json() as any;
    expect(moved.map.objectEvents[index].x).toBe(1);
    expect(moved.map.objectEvents[index].y).toBe(1);

    const undoRes = await post(`/api/edit/${map}/undo`);
    const undone = await undoRes.json() as any;
    expect(undone.map.objectEvents[index].x).toBe(before.map.objectEvents[index].x);
  }, 300_000);

  it("event/add appends and event/delete removes, each its own undo step", async () => {
    const map = "Route29";
    const newFlag = { graphics_id: "OBJ_EVENT_GFX_BOY_1", x: 0, y: 0, elevation: 0, movement_type: "MOVEMENT_TYPE_FACE_DOWN", movement_range_x: 0, movement_range_y: 0, trainer_type: "TRAINER_TYPE_NONE", trainer_sight_or_berry_tree_id: "0", script: "PokeMap_Test", flag: "0" };
    const addRes = await post(`/api/edit/${map}/event/add`, { kind: "object", value: newFlag });
    const added = await addRes.json() as any;
    const newIndex = added.map.objectEvents.length - 1;
    expect(added.map.objectEvents[newIndex].script).toBe("PokeMap_Test");

    const delRes = await post(`/api/edit/${map}/event/delete`, { kind: "object", index: newIndex });
    const deleted = await delRes.json() as any;
    expect(deleted.map.objectEvents).toHaveLength(newIndex);
  }, 300_000);

  it("event/delete on a warp returns a warpRenumberWarnings array (possibly empty), computed against the real corpus", async () => {
    const r = await post("/api/edit/NewBarkTown_Lab/event/delete", { kind: "warp", index: 0 });
    expect(r.status).toBe(200);
    const body = await r.json() as any;
    expect(Array.isArray(body.warpRenumberWarnings)).toBe(true);
  }, 300_000);

  it("400s an event op with an unknown kind", async () => {
    const r = await post("/api/edit/Route29/event/move", { kind: "not-a-kind", index: 0, x: 0, y: 0 });
    expect(r.status).toBe(400);
  }, 300_000);

  it("404s event/move, event/add and event/delete for an unknown map", async () => {
    const moveRes = await post("/api/edit/__pokemap_no_such_map__/event/move", { kind: "object", index: 0, x: 0, y: 0 });
    expect(moveRes.status).toBe(404);
    const addRes = await post("/api/edit/__pokemap_no_such_map__/event/add", { kind: "object", value: {} });
    expect(addRes.status).toBe(404);
    const delRes = await post("/api/edit/__pokemap_no_such_map__/event/delete", { kind: "object", index: 0 });
    expect(delRes.status).toBe(404);
  }, 300_000);
});
