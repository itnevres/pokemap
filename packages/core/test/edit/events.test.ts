import { describe, it, expect } from "vitest";
import { moveEvent, addEvent, deleteEvent, findWarpsTargetingByIndex, EVENT_ARRAY_KEY } from "../../src/edit/events.js";
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
  it("writes only x and y via jsonEdits, for the correct array/index/key pair", () => {
    const { jsonEdits, map } = moveEvent(BASE_MAP, "object", 0, 9, 10);
    expect(jsonEdits).toEqual([
      { path: ["object_events", 0, "x"], value: 9 },
      { path: ["object_events", 0, "y"], value: 10 },
    ]);
    expect(map.objectEvents[0]!.x).toBe(9);
    expect(map.objectEvents[0]!.y).toBe(10);
    // Every other field on the moved event, and the event's own identity
    // (not a new object replacing it), untouched.
    expect(map.objectEvents[0]!.script).toBe("X");
    expect(map.warpEvents).toEqual(BASE_MAP.warpEvents); // other arrays untouched
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
