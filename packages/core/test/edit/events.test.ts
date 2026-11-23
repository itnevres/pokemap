import { describe, it, expect } from "vitest";
import { moveEvent, setObjectGraphics, addEvent, deleteEvent, findWarpsTargetingByIndex, EVENT_ARRAY_KEY, eventSlot, appendIndex, dropPendingInsert } from "../../src/edit/events.js";
import type { InsertOp, RemoveOp } from "../../src/write/save.js";
import type { MapData } from "../../src/load/maps.js";

const BASE_MAP: MapData = {
  id: "MAP_TEST", name: "Test", layout: "LAYOUT_TEST", music: "MUS_ROUTE101",
  regionMapSection: "MAPSEC_TEST", mapType: "MAP_TYPE_ROUTE", weather: "WEATHER_NONE",
  connections: [],
  objectEvents: [{
    graphicsId: "OBJ_EVENT_GFX_BOY_1", x: 3, y: 4, elevation: 0,
    movementType: "MOVEMENT_TYPE_FACE_DOWN", movementRangeX: 0, movementRangeY: 0,
    trainerType: "TRAINER_TYPE_NONE", trainerSightOrBerryTreeId: "0", script: "X", flag: "0",
  }],
  warpEvents: [{ x: 5, y: 5, elevation: 0, destMap: "MAP_OTHER", destWarpId: "2" }],
  coordEvents: [], bgEvents: [],
};

describe("moveEvent", () => {
  it("writes only x and y via jsonEdits when elevation is omitted (negative case: no spurious elevation edit)", () => {
    const { jsonEdits, map } = moveEvent(BASE_MAP, "object", 0, 9, 10);
    expect(jsonEdits).toEqual([
      { path: ["object_events", 0, "x"], value: 9 },
      { path: ["object_events", 0, "y"], value: 10 },
    ]);
    expect(map.objectEvents[0]!.x).toBe(9);
    expect(map.objectEvents[0]!.y).toBe(10);
    expect(map.objectEvents[0]!.elevation).toBe(BASE_MAP.objectEvents[0]!.elevation); // untouched
    // Every other field on the moved event, and the event's own identity
    // (not a new object replacing it), untouched.
    expect(map.objectEvents[0]!.script).toBe("X");
    expect(map.warpEvents).toEqual(BASE_MAP.warpEvents); // other arrays untouched
  });

  it("also writes elevation via jsonEdits when a real elevation value is passed (positive case)", () => {
    const { jsonEdits, map } = moveEvent(BASE_MAP, "object", 0, 9, 10, 3);
    expect(jsonEdits).toEqual([
      { path: ["object_events", 0, "x"], value: 9 },
      { path: ["object_events", 0, "y"], value: 10 },
      { path: ["object_events", 0, "elevation"], value: 3 },
    ]);
    expect(map.objectEvents[0]!.elevation).toBe(3);
  });

  it("uses warp_events/coord_events/bg_events for the other three kinds", () => {
    expect(moveEvent(BASE_MAP, "warp", 0, 1, 1).jsonEdits[0]!.path).toEqual(["warp_events", 0, "x"]);
    expect(EVENT_ARRAY_KEY.coord).toBe("coord_events");
    expect(EVENT_ARRAY_KEY.bg).toBe("bg_events");
  });
});

describe("addEvent", () => {
  it("produces an insertOp appending to the correct array, and updates map's own in-memory list to match", () => {
    const newEvent = { graphics_id: "OBJ_EVENT_GFX_GIRL_1", x: 0, y: 0, elevation: 0, movement_type: "MOVEMENT_TYPE_FACE_UP", movement_range_x: 0, movement_range_y: 0, trainer_type: "TRAINER_TYPE_NONE", trainer_sight_or_berry_tree_id: "0", script: "Y", flag: "0" };
    const { insertOp, map } = addEvent(BASE_MAP, "object", newEvent);
    expect(insertOp).toEqual({ path: ["object_events"], index: 1, value: newEvent }); // appended after the existing one
    expect(map.objectEvents).toHaveLength(2);
    expect(map.objectEvents[1]!.graphicsId).toBe("OBJ_EVENT_GFX_GIRL_1");
  });

  it("appends at index 0 into an empty array", () => {
    const empty: MapData = { ...BASE_MAP, warpEvents: [] };
    const newWarp = { x: 1, y: 1, elevation: 0, dest_map: "MAP_X", dest_warp_id: "0" };
    const { insertOp } = addEvent(empty, "warp", newWarp);
    expect(insertOp.index).toBe(0);
  });

  it("coerces coord x/y/elevation to real numbers even when raw carries them as strings, rather than the spread silently reinstating the strings", () => {
    const newCoord = { type: "COORD_EVENT_WEATHER", x: "5", y: "7", elevation: "0" };
    const { map } = addEvent(BASE_MAP, "coord", newCoord);
    const added = map.coordEvents[0]!;
    expect(added.x).toBe(5);
    expect(added.y).toBe(7);
    expect(added.elevation).toBe(0);
    expect(typeof added.x).toBe("number");
    expect(typeof added.y).toBe("number");
    expect(typeof added.elevation).toBe("number");
  });
});

describe("deleteEvent", () => {
  it("produces a removeOp and drops the event from map's own in-memory list", () => {
    const { removeOp, map } = deleteEvent(BASE_MAP, "object", 0);
    expect(removeOp).toEqual({ path: ["object_events"], index: 0 });
    expect(map.objectEvents).toHaveLength(0);
  });

  it("refuses (throws) an index that does not exist", () => {
    expect(() => deleteEvent(BASE_MAP, "object", 5)).toThrow(/index 5/);
  });
});

describe("findWarpsTargetingByIndex", () => {
  it("warns when another map's warp targets the deleted warp's positional index", () => {
    const otherMapsWithId: { mapId: string; map: MapData }[] = [
      { mapId: "MAP_OTHER", map: { ...BASE_MAP, id: "MAP_OTHER", warpEvents: [
        { x: 0, y: 0, elevation: 0, destMap: "MAP_TEST", destWarpId: "0" }, // targets MAP_TEST's warp index 0 -- the one being deleted
      ] } },
      { mapId: "MAP_UNRELATED", map: { ...BASE_MAP, id: "MAP_UNRELATED", warpEvents: [
        { x: 0, y: 0, elevation: 0, destMap: "MAP_TEST", destWarpId: "1" }, // targets a DIFFERENT index -- not a match
      ] } },
    ];
    const warnings = findWarpsTargetingByIndex(otherMapsWithId, "MAP_TEST", 0);
    expect(warnings).toEqual([{ fromMapId: "MAP_OTHER", warpIndex: 0 }]);
  });

  it("returns an empty array when nothing targets the deleted index", () => {
    const others = [{ mapId: "MAP_OTHER", map: { ...BASE_MAP, warpEvents: [{ x: 0, y: 0, elevation: 0, destMap: "MAP_TEST", destWarpId: "9" }] } }];
    expect(findWarpsTargetingByIndex(others, "MAP_TEST", 0)).toEqual([]);
  });

  it("a non-numeric destWarpId (a symbolic constant) never matches, rather than coercing to a wrong number", () => {
    const others = [{ mapId: "MAP_OTHER", map: { ...BASE_MAP, warpEvents: [{ x: 0, y: 0, elevation: 0, destMap: "MAP_TEST", destWarpId: "WARP_ID_NONE" }] } }];
    expect(findWarpsTargetingByIndex(others, "MAP_TEST", 0)).toEqual([]);
  });

  it("a warp whose destWarpId numerically matches but whose destMap points elsewhere is not a match (teeth-proof)", () => {
    const others = [{ mapId: "MAP_OTHER", map: { ...BASE_MAP, warpEvents: [
      { x: 0, y: 0, elevation: 0, destMap: "MAP_SOMEWHERE_ELSE", destWarpId: "0" },
    ] } }];
    expect(findWarpsTargetingByIndex(others, "MAP_TEST", 0)).toEqual([]);
  });
});

describe("setObjectGraphics", () => {
  it("emits only the graphics edit and preserves the original map", () => {
    const graphics = "OBJ_EVENT_GFX_SPECIES(ODDISH)";
    const result = setObjectGraphics(BASE_MAP, 0, graphics);
    expect(result.jsonEdits).toEqual([{ path: ["object_events", 0, "graphics_id"], value: graphics }]);
    expect(result.map.objectEvents[0]).toEqual({ ...BASE_MAP.objectEvents[0], graphicsId: graphics });
    expect(BASE_MAP.objectEvents[0]!.graphicsId).toBe("OBJ_EVENT_GFX_BOY_1");
    expect(result.map.warpEvents).toBe(BASE_MAP.warpEvents);
  });
});

describe("index spaces", () => {
  const sixObjects: MapData = {
    ...BASE_MAP,
    objectEvents: Array.from({ length: 6 }, (_, i) => ({ ...BASE_MAP.objectEvents[0]!, x: i, script: `S${i}` })),
  };
  const ins = (index: number, tag: string): InsertOp => ({ path: ["object_events"], index, value: { script: tag } });
  const rem = (index: number): RemoveOp => ({ path: ["object_events"], index });
  const session = (removeOps: RemoveOp[], insertOps: InsertOp[]) => ({ originalMap: sixObjects, removeOps, insertOps });
  const base = () => session([rem(2)], [ins(6, "A"), ins(7, "B")]);

  it("maps current indexes before the removed original straight to the same original index", () => {
    expect(eventSlot(base(), "object", 0)).toEqual({ pending: false, original: 0 });
    expect(eventSlot(base(), "object", 1)).toEqual({ pending: false, original: 1 });
  });

  it("maps current indexes at and after the removed original to the next surviving original", () => {
    expect(eventSlot(base(), "object", 2)).toEqual({ pending: false, original: 3 });
    expect(eventSlot(base(), "object", 4)).toEqual({ pending: false, original: 5 });
  });

  it("maps current indexes past the surviving originals to the pending inserts in order", () => {
    const sess = base();
    expect(eventSlot(sess, "object", 5)).toEqual({ pending: true, insert: sess.insertOps[0] });
    expect(eventSlot(sess, "object", 6)).toEqual({ pending: true, insert: sess.insertOps[1] });
  });

  it("throws for a current index beyond the last pending insert", () => {
    expect(() => eventSlot(base(), "object", 7)).toThrow(Error);
    expect(() => eventSlot(base(), "object", -1)).toThrow(Error);
  });

  it("skips every removed original when several are staged", () => {
    const sess = session([rem(2), rem(3)], []);
    expect(eventSlot(sess, "object", 1)).toEqual({ pending: false, original: 1 });
    expect(eventSlot(sess, "object", 2)).toEqual({ pending: false, original: 4 });
    expect(eventSlot(sess, "object", 3)).toEqual({ pending: false, original: 5 });
    expect(() => eventSlot(sess, "object", 4)).toThrow(Error);
  });

  it("is independent of the order the removeOps were staged in", () => {
    const sess = session([rem(3), rem(2)], []);
    expect(eventSlot(sess, "object", 2)).toEqual({ pending: false, original: 4 });
  });

  it("appendIndex is the original length plus the pending inserts already staged for that kind", () => {
    expect(appendIndex(base(), "object")).toBe(8);
    expect(appendIndex(session([rem(2)], []), "object")).toBe(6);
    expect(appendIndex(session([], []), "object")).toBe(6);
  });

  it("dropPendingInsert removes that insert and renumbers later inserts of the same array down by one", () => {
    const sess = base();
    const result = dropPendingInsert(sess, "object", sess.insertOps[0]!);
    expect(result).toEqual([ins(6, "B")]);
    expect(sess.insertOps).toEqual([ins(6, "A"), ins(7, "B")]); // input not mutated
  });

  it("dropping the last pending insert leaves earlier ones untouched", () => {
    const sess = base();
    expect(dropPendingInsert(sess, "object", sess.insertOps[1]!)).toEqual([ins(6, "A")]);
  });

  it("leaves inserts of other event kinds alone: warps are neither renumbered nor mapped through object ops", () => {
    const warpIns: InsertOp = { path: ["warp_events"], index: 1, value: { x: 1 } };
    const sess = { originalMap: sixObjects, removeOps: [rem(2)], insertOps: [ins(6, "A"), warpIns, ins(7, "B")] };
    expect(dropPendingInsert(sess, "object", sess.insertOps[0]!)).toEqual([warpIns, ins(6, "B")]);
    expect(appendIndex(sess, "warp")).toBe(2);
    expect(appendIndex(sess, "object")).toBe(8);
    expect(eventSlot(sess, "warp", 0)).toEqual({ pending: false, original: 0 });
    expect(eventSlot(sess, "warp", 1)).toEqual({ pending: true, insert: warpIns });
    expect(eventSlot(sess, "object", 5)).toEqual({ pending: true, insert: sess.insertOps[0] });
  });
});
