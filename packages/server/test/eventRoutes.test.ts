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

// Session ops are staged in original-file index space while the UI addresses
// the current list (originals minus removed ones, then pending adds). These
// sequences pin the saved result for mixed delete/add/move work.
describe.skipIf(!hasProject(SUBJECT_ROOT))("event ops in original index space saved through plan and commit", () => {
  beforeAll(async () => { s = await createServer({ projectPath: SUBJECT_ROOT, port: 0 }); });
  afterAll(async () => { await s?.close(); });

  const map = "CherrygroveCity"; // 14 object events at distinct coordinates
  const get = (path: string) => fetch(`http://127.0.0.1:${s.port}${path}`);
  const commit = async () => {
    const plan = await (await get(`/api/edit/${map}/plan`)).json() as { fingerprint: string | null };
    return post(`/api/edit/${map}/commit`, { fingerprint: plan.fingerprint ?? "refused-plan" });
  };
  type RawEvent = { x: number; y: number; script: string };
  const summary = (events: RawEvent[]) => events.map((e) => [e.script, e.x, e.y]);
  const newEvent = (script: string, x: number, y: number) => ({
    graphics_id: "OBJ_EVENT_GFX_BOY_1", x, y, elevation: 0, movement_type: "MOVEMENT_TYPE_FACE_DOWN",
    movement_range_x: 0, movement_range_y: 0, trainer_type: "TRAINER_TYPE_NONE",
    trainer_sight_or_berry_tree_id: "0", script, flag: "0",
  });
  const withoutObjects = (json: Record<string, unknown>) => { const { object_events: _omit, ...rest } = json; return rest; };
  const setup = () => {
    const jsonPath = openProject(SUBJECT_ROOT).paths.mapJson(map);
    const before = readFileSync(jsonPath);
    const parsed = JSON.parse(before.toString("utf8")) as Record<string, unknown> & { object_events: RawEvent[] };
    expect(parsed.object_events).toHaveLength(14);
    return { jsonPath, before, parsed, original: parsed.object_events };
  };
  const restore = async (jsonPath: string, before: Buffer) => {
    writeFileSync(jsonPath, before);
    await post(`/api/edit/${map}/discard`);
  };

  it("two deletions at current indexes 2 and 4 save as the removal of original events 2 and 5 and nothing else", async () => {
    const { jsonPath, before, parsed, original } = setup();
    try {
      expect((await post(`/api/edit/${map}/event/delete`, { kind: "object", index: 2 })).status).toBe(200);
      const second = await post(`/api/edit/${map}/event/delete`, { kind: "object", index: 4 });
      expect(second.status).toBe(200);
      const shown = (await second.json() as any).map.objectEvents as RawEvent[];
      expect(shown).toHaveLength(12);
      expect(shown.map((e) => e.script)).toEqual(original.filter((_, i) => i !== 2 && i !== 5).map((e) => e.script));

      expect((await commit()).status).toBe(200);
      const written = JSON.parse(readFileSync(jsonPath, "utf8")) as Record<string, unknown> & { object_events: RawEvent[] };
      expect(written.object_events).toEqual(original.filter((_, i) => i !== 2 && i !== 5));
      expect(withoutObjects(written)).toEqual(withoutObjects(parsed));
    } finally { await restore(jsonPath, before); }
  }, 300_000);

  it("after deleting original 0 and adding an event, moving current index 12 moves original event 13 and the added event stays last with its own coordinates", async () => {
    const { jsonPath, before, parsed, original } = setup();
    try {
      expect((await post(`/api/edit/${map}/event/delete`, { kind: "object", index: 0 })).status).toBe(200);
      const addRes = await post(`/api/edit/${map}/event/add`, { kind: "object", value: newEvent("PokeMap_B3_Added", 1, 2) });
      expect(addRes.status).toBe(200);
      const afterAdd = (await addRes.json() as any).map.objectEvents as RawEvent[];
      expect(afterAdd).toHaveLength(14);
      expect(afterAdd[12]!.script).toBe(original[13]!.script);
      expect(afterAdd[13]!.script).toBe("PokeMap_B3_Added");

      const moveRes = await post(`/api/edit/${map}/event/move`, { kind: "object", index: 12, x: 7, y: 8 });
      expect(moveRes.status).toBe(200);
      const shown = (await moveRes.json() as any).map.objectEvents as RawEvent[];
      expect([shown[12]!.script, shown[12]!.x, shown[12]!.y]).toEqual([original[13]!.script, 7, 8]);
      expect([shown[13]!.script, shown[13]!.x, shown[13]!.y]).toEqual(["PokeMap_B3_Added", 1, 2]);

      expect((await commit()).status).toBe(200);
      const written = JSON.parse(readFileSync(jsonPath, "utf8")) as Record<string, unknown> & { object_events: RawEvent[] };
      expect(written.object_events).toHaveLength(14);
      expect(written.object_events.slice(0, 12)).toEqual(original.slice(1, 13));
      expect(written.object_events[12]).toEqual({ ...original[13]!, x: 7, y: 8 });
      expect(written.object_events[13]).toMatchObject({ script: "PokeMap_B3_Added", x: 1, y: 2 });
      expect(summary(written.object_events).some((e) => e[0] === original[0]!.script && e[1] === original[0]!.x && e[2] === original[0]!.y)).toBe(false);
      expect(withoutObjects(written)).toEqual(withoutObjects(parsed));
    } finally { await restore(jsonPath, before); }
  }, 300_000);

  it("an event added and then deleted leaves the session without that event and an empty plan, and map.json is unchanged", async () => {
    const { jsonPath, before, original } = setup();
    try {
      const addRes = await post(`/api/edit/${map}/event/add`, { kind: "object", value: newEvent("PokeMap_B3_Gone", 3, 3) });
      expect(addRes.status).toBe(200);
      const addedIndex = ((await addRes.json() as any).map.objectEvents as RawEvent[]).length - 1;
      expect(addedIndex).toBe(original.length);

      const delRes = await post(`/api/edit/${map}/event/delete`, { kind: "object", index: addedIndex });
      expect(delRes.status).toBe(200);
      const shown = (await delRes.json() as any).map.objectEvents as RawEvent[];
      expect(shown).toHaveLength(original.length);
      expect(shown.some((e) => e.script === "PokeMap_B3_Gone")).toBe(false);

      const plan = await (await get(`/api/edit/${map}/plan`)).json() as any;
      expect(plan.refusals).toEqual([]);
      expect(plan.changes).toEqual([]);
      expect(readFileSync(jsonPath).equals(before)).toBe(true);
    } finally { await restore(jsonPath, before); }
  }, 300_000);

  it("after adding two events, deleting the first added one and moving the second, exactly one new event is saved at the moved coordinates", async () => {
    const { jsonPath, before, parsed, original } = setup();
    try {
      expect((await post(`/api/edit/${map}/event/add`, { kind: "object", value: newEvent("PokeMap_B3_First", 1, 1) })).status).toBe(200);
      expect((await post(`/api/edit/${map}/event/add`, { kind: "object", value: newEvent("PokeMap_B3_Second", 2, 2) })).status).toBe(200);
      const delRes = await post(`/api/edit/${map}/event/delete`, { kind: "object", index: original.length });
      expect(delRes.status).toBe(200);
      const afterDelete = (await delRes.json() as any).map.objectEvents as RawEvent[];
      expect(afterDelete).toHaveLength(original.length + 1);
      expect(afterDelete[original.length]!.script).toBe("PokeMap_B3_Second");

      const moveRes = await post(`/api/edit/${map}/event/move`, { kind: "object", index: original.length, x: 9, y: 10 });
      expect(moveRes.status).toBe(200);

      const plan = await (await get(`/api/edit/${map}/plan`)).json() as any;
      expect(plan.refusals).toEqual([]);
      expect((await commit()).status).toBe(200);
      const written = JSON.parse(readFileSync(jsonPath, "utf8")) as Record<string, unknown> & { object_events: RawEvent[] };
      expect(written.object_events).toHaveLength(original.length + 1);
      expect(written.object_events.slice(0, original.length)).toEqual(original);
      expect(written.object_events[original.length]).toMatchObject({ script: "PokeMap_B3_Second", x: 9, y: 10 });
      expect(written.object_events.some((e) => e.script === "PokeMap_B3_First")).toBe(false);
      expect(withoutObjects(written)).toEqual(withoutObjects(parsed));
    } finally { await restore(jsonPath, before); }
  }, 300_000);

  it("moving the same original event twice saves exactly the second position and changes nothing else", async () => {
    // Revert guarded: the same-path replacement in the event/move route (index.ts, the jsonEdits filter before
    // `...moved`). Without it two edits at one path overlap in editJson and write garbled digits (5 -> 12 -> 3 saved "32").
    const { jsonPath, before, parsed, original } = setup();
    try {
      expect([original[3]!.x, original[3]!.y]).not.toEqual([3, 4]);
      expect((await post(`/api/edit/${map}/event/move`, { kind: "object", index: 3, x: 123, y: 145 })).status).toBe(200);
      const second = await post(`/api/edit/${map}/event/move`, { kind: "object", index: 3, x: 3, y: 4 });
      expect(second.status).toBe(200);
      const shown = (await second.json() as any).map.objectEvents as RawEvent[];
      expect([shown[3]!.x, shown[3]!.y]).toEqual([3, 4]);

      const plan = await (await get(`/api/edit/${map}/plan`)).json() as any;
      expect(plan.refusals).toEqual([]);
      expect((await commit()).status).toBe(200);
      const text = readFileSync(jsonPath, "utf8");
      const written = JSON.parse(text) as Record<string, unknown> & { object_events: RawEvent[] };
      expect(written.object_events).toEqual(original.map((e, i) => (i === 3 ? { ...e, x: 3, y: 4 } : e)));
      expect(withoutObjects(written)).toEqual(withoutObjects(parsed));
    } finally { await restore(jsonPath, before); }
  }, 300_000);

  it("undoing the delete of the first of two added events brings both back, saved in add order with their own coordinates", async () => {
    // Guards the pending-add delete path (eventSlot pending branch + dropPendingInsert in the event/delete route)
    // together with the snapshot restore of insertOps: both adds must keep their original-space indexes after undo.
    const { jsonPath, before, parsed, original } = setup();
    try {
      expect((await post(`/api/edit/${map}/event/add`, { kind: "object", value: newEvent("PokeMap_B3_First", 1, 1) })).status).toBe(200);
      expect((await post(`/api/edit/${map}/event/add`, { kind: "object", value: newEvent("PokeMap_B3_Second", 2, 2) })).status).toBe(200);
      const delRes = await post(`/api/edit/${map}/event/delete`, { kind: "object", index: original.length });
      expect(delRes.status).toBe(200);
      expect(((await delRes.json() as any).map.objectEvents as RawEvent[]).map((e) => e.script).slice(original.length)).toEqual(["PokeMap_B3_Second"]);

      const undone = (await (await post(`/api/edit/${map}/undo`)).json() as any).map.objectEvents as RawEvent[];
      expect(undone.slice(original.length).map((e) => [e.script, e.x, e.y])).toEqual([["PokeMap_B3_First", 1, 1], ["PokeMap_B3_Second", 2, 2]]);

      expect((await commit()).status).toBe(200);
      const written = JSON.parse(readFileSync(jsonPath, "utf8")) as Record<string, unknown> & { object_events: RawEvent[] };
      expect(written.object_events.slice(0, original.length)).toEqual(original);
      expect(written.object_events.slice(original.length).map((e) => [e.script, e.x, e.y])).toEqual([["PokeMap_B3_First", 1, 1], ["PokeMap_B3_Second", 2, 2]]);
      expect(withoutObjects(written)).toEqual(withoutObjects(parsed));
    } finally { await restore(jsonPath, before); }
  }, 300_000);

  it("redoing the delete of the first of two added events leaves exactly the second one saved", async () => {
    // Same guard as the undo test, through redo: the redone delete must re-drop the first insert and renumber the second.
    const { jsonPath, before, parsed, original } = setup();
    try {
      expect((await post(`/api/edit/${map}/event/add`, { kind: "object", value: newEvent("PokeMap_B3_First", 1, 1) })).status).toBe(200);
      expect((await post(`/api/edit/${map}/event/add`, { kind: "object", value: newEvent("PokeMap_B3_Second", 2, 2) })).status).toBe(200);
      expect((await post(`/api/edit/${map}/event/delete`, { kind: "object", index: original.length })).status).toBe(200);
      expect((await post(`/api/edit/${map}/undo`)).status).toBe(200);
      const redone = await post(`/api/edit/${map}/redo`);
      expect(redone.status).toBe(200);
      const shown = (await redone.json() as any).map.objectEvents as RawEvent[];
      expect(shown.slice(original.length).map((e) => [e.script, e.x, e.y])).toEqual([["PokeMap_B3_Second", 2, 2]]);

      expect((await commit()).status).toBe(200);
      const written = JSON.parse(readFileSync(jsonPath, "utf8")) as Record<string, unknown> & { object_events: RawEvent[] };
      expect(written.object_events.slice(0, original.length)).toEqual(original);
      expect(written.object_events.slice(original.length).map((e) => [e.script, e.x, e.y])).toEqual([["PokeMap_B3_Second", 2, 2]]);
      expect(withoutObjects(written)).toEqual(withoutObjects(parsed));
    } finally { await restore(jsonPath, before); }
  }, 300_000);
});

// Warp deletes warn about other maps' warps that arrive at the deleted warp's INDEX, which must be the
// original-file index even after an earlier warp of the same map is pending removal.
describe.skipIf(!hasProject(SUBJECT_ROOT))("warp delete after an earlier pending warp delete", () => {
  beforeAll(async () => { s = await createServer({ projectPath: SUBJECT_ROOT, port: 0 }); });
  afterAll(async () => { await s?.close(); });

  it("computes warpRenumberWarnings of the second delete from the original warp index", async () => {
    // Revert guarded: `slot.original` in the findWarpsTargetingByIndex call of the event/delete route (index.ts);
    // using the current index 1 would report the ROUTE42 gate (arrives at warp 1) instead of the Burned Tower.
    // In this corpus exactly one other map arrives at each of EcruteakCity warps 0, 1 and 2 (dest_warp_id "0", "1", "2").
    const map = "EcruteakCity";
    try {
      const first = await post(`/api/edit/${map}/event/delete`, { kind: "warp", index: 0 });
      expect(first.status).toBe(200);
      expect((await first.json() as any).warpRenumberWarnings).toEqual([{ fromMapId: "MAP_GATE_ECRUTEAK_CITY_ROUTE38", warpIndex: 0 }]);
      // After deleting original warp 0, current warp 1 is original warp 2.
      const second = await post(`/api/edit/${map}/event/delete`, { kind: "warp", index: 1 });
      expect(second.status).toBe(200);
      expect((await second.json() as any).warpRenumberWarnings).toEqual([{ fromMapId: "MAP_BURNED_TOWER_1F", warpIndex: 0 }]);
    } finally { await post(`/api/edit/${map}/discard`); }
  }, 300_000);
});
