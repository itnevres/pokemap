import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type PokemapServer } from "../src/index.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";
import { readFileSync, writeFileSync } from "node:fs";
import { openProject } from "@pokemap/core/src/project.js";

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

  it("event/move accepts an optional elevation, persisted as a real jsonEdit (not just local session.map state)", async () => {
    const map = "NewBarkTown_Lab";
    const before = await (await fetch(`http://127.0.0.1:${s.port}/api/map/${map}`)).json() as any;
    const kind = "object", index = 0;
    const beforeElevation = before.map.objectEvents[index].elevation as number;
    const newElevation = beforeElevation + 1;

    // Field-edit count BEFORE this move -- read as a delta rather than an
    // absolute number, since this map's session is shared with earlier
    // tests in this file (e.g. the warp-delete test below leaves its own
    // removeOp staged, uncommitted) and isn't reset between them.
    const fieldEditCount = (plan: any): number => {
      const jsonChange = plan.changes.find((c: any) => c.kind === "json");
      if (!jsonChange) return 0;
      return Number(/(\d+) field edit/.exec(jsonChange.summary)![1]);
    };
    const planBefore = await (await fetch(`http://127.0.0.1:${s.port}/api/edit/${map}/plan`)).json() as any;
    const countBefore = fieldEditCount(planBefore);

    const r = await post(`/api/edit/${map}/event/move`, { kind, index, x: 2, y: 2, elevation: newElevation });
    expect(r.status).toBe(200);
    const moved = await r.json() as any;
    expect(moved.map.objectEvents[index].elevation).toBe(newElevation);

    // The important part: confirm the elevation edit was actually STAGED
    // onto session.jsonEdits (planSave's own field-edit count), not just
    // reflected in the response's local map copy -- x/y alone would stage 2
    // more field edits, elevation riding along makes it 3 more.
    const planAfter = await (await fetch(`http://127.0.0.1:${s.port}/api/edit/${map}/plan`)).json() as any;
    expect(fieldEditCount(planAfter) - countBefore).toBe(3);

    const undoRes = await post(`/api/edit/${map}/undo`);
    const undone = await undoRes.json() as any;
    expect(undone.map.objectEvents[index].elevation).toBe(beforeElevation);
  }, 300_000);

  it("400s event/move when elevation is present but not a number", async () => {
    const r = await post("/api/edit/Route29/event/move", { kind: "object", index: 0, x: 0, y: 0, elevation: "not-a-number" });
    expect(r.status).toBe(400);
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

// Save-path sequences over event ops. The suite's SUBJECT_ROOT is the scratch
// copy made by testRootsSetup; each test still restores the map.json it
// commits and discards any left-over session.
describe.skipIf(!hasProject(SUBJECT_ROOT))("event ops saved through plan and commit", () => {
  beforeAll(async () => { s = await createServer({ projectPath: SUBJECT_ROOT, port: 0 }); });
  afterAll(async () => { await s?.close(); });

  const get = (path: string) => fetch(`http://127.0.0.1:${s.port}${path}`);
  const commit = async (map: string) => {
    const plan = await (await get(`/api/edit/${map}/plan`)).json() as { fingerprint: string | null };
    return post(`/api/edit/${map}/commit`, { fingerprint: plan.fingerprint ?? "refused-plan" });
  };
  type RawEvent = { x: number; y: number; script: string };
  const summary = (events: RawEvent[]) => events.map((e) => [e.script, e.x, e.y]);

  it("an event added and then moved in the same session is saved at the moved coordinates", async () => {
    const map = "Route29";
    const jsonPath = openProject(SUBJECT_ROOT).paths.mapJson(map);
    const before = readFileSync(jsonPath);
    const original = JSON.parse(before.toString("utf8")).object_events as RawEvent[];
    try {
      const value = { graphics_id: "OBJ_EVENT_GFX_BOY_1", x: 0, y: 0, elevation: 0, movement_type: "MOVEMENT_TYPE_FACE_DOWN", movement_range_x: 0, movement_range_y: 0, trainer_type: "TRAINER_TYPE_NONE", trainer_sight_or_berry_tree_id: "0", script: "NULL", flag: "0" };
      const added = await (await post(`/api/edit/${map}/event/add`, { kind: "object", value })).json() as any;
      const newIndex = added.map.objectEvents.length - 1;
      expect(newIndex).toBe(original.length);

      const moveRes = await post(`/api/edit/${map}/event/move`, { kind: "object", index: newIndex, x: 5, y: 6 });
      expect(moveRes.status).toBe(200);

      const plan = await (await get(`/api/edit/${map}/plan`)).json() as any;
      expect(plan.refusals).toEqual([]);
      expect(plan.changes.some((c: any) => c.kind === "json")).toBe(true);

      const commitRes = await commit(map);
      expect(commitRes.status).toBe(200);
      const written = JSON.parse(readFileSync(jsonPath, "utf8")).object_events as RawEvent[];
      expect(written).toHaveLength(original.length + 1);
      expect(summary(written.slice(0, original.length))).toEqual(summary(original));
      expect([written[original.length]!.x, written[original.length]!.y]).toEqual([5, 6]);
    } finally {
      writeFileSync(jsonPath, before);
      await post(`/api/edit/${map}/discard`);
    }
  }, 300_000);

  it("after an earlier event is deleted, moving the event shown at index 4 saves the move on the event that was originally at index 5", async () => {
    const map = "CherrygroveCity"; // 14 object events at distinct coordinates
    const jsonPath = openProject(SUBJECT_ROOT).paths.mapJson(map);
    const before = readFileSync(jsonPath);
    const original = JSON.parse(before.toString("utf8")).object_events as RawEvent[];
    expect(original.length).toBeGreaterThanOrEqual(6);
    try {
      const delRes = await post(`/api/edit/${map}/event/delete`, { kind: "object", index: 2 });
      expect(delRes.status).toBe(200);
      const moveRes = await post(`/api/edit/${map}/event/move`, { kind: "object", index: 4, x: 3, y: 4 });
      expect(moveRes.status).toBe(200);
      // The UI's index 4 is the original event 5 once event 2 is pending removal.
      const shown = (await moveRes.json() as any).map.objectEvents;
      expect(shown[4].script).toBe(original[5]!.script);
      expect([shown[4].x, shown[4].y]).toEqual([3, 4]);

      const commitRes = await commit(map);
      expect(commitRes.status).toBe(200);
      const written = JSON.parse(readFileSync(jsonPath, "utf8")).object_events as RawEvent[];
      const expected = original.filter((_, i) => i !== 2).map((e, i) => (i === 4 ? { ...e, x: 3, y: 4 } : e));
      expect(summary(written)).toEqual(summary(expected));
    } finally {
      writeFileSync(jsonPath, before);
      await post(`/api/edit/${map}/discard`);
    }
  }, 300_000);
});
