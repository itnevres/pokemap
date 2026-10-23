import { describe, it, expect } from "vitest";
import { duplicateEventValue } from "../../src/gba/duplicateEvent.js";

const OBJ = {
  graphicsId: "OBJ_EVENT_GFX_BOY_1", x: 5, y: 6, elevation: 3, movementType: "MOVEMENT_TYPE_FACE_DOWN",
  movementRangeX: 2, movementRangeY: 1, trainerType: "TRAINER_TYPE_NORMAL", trainerSightOrBerryTreeId: "4",
  script: "Foo_EventScript_Boy", flag: "FLAG_X",
};

describe("duplicateEventValue", () => {
  it("object: every field back to raw snake_case, one tile right, no local_id", () => {
    const v = duplicateEventValue("object", { ...OBJ, local_id: 9 }, 20, 20);
    expect(v).toEqual({
      graphics_id: "OBJ_EVENT_GFX_BOY_1", x: 6, y: 6, elevation: 3, movement_type: "MOVEMENT_TYPE_FACE_DOWN",
      movement_range_x: 2, movement_range_y: 1, trainer_type: "TRAINER_TYPE_NORMAL", trainer_sight_or_berry_tree_id: "4",
      script: "Foo_EventScript_Boy", flag: "FLAG_X",
    });
    expect("local_id" in v).toBe(false);
  });
  it("warp", () => {
    expect(duplicateEventValue("warp", { x: 1, y: 2, elevation: 0, destMap: "MAP_BAR", destWarpId: "WARP_ID_NONE" }, 10, 10))
      .toEqual({ x: 2, y: 2, elevation: 0, dest_map: "MAP_BAR", dest_warp_id: "WARP_ID_NONE" });
  });
  it("coord trigger and weather keep every raw field", () => {
    const trig = { type: "trigger", x: 3, y: 3, elevation: 3, var: "VAR_A", var_value: "1", script: "S" };
    expect(duplicateEventValue("coord", trig, 10, 10)).toEqual({ ...trig, x: 4 });
    const weather = { type: "weather", x: 3, y: 3, elevation: 3, weather: "COORD_EVENT_WEATHER_RAIN" };
    expect(duplicateEventValue("coord", weather, 10, 10)).toEqual({ ...weather, x: 4 });
  });
  it("bg sign, hidden item and secret base keep every raw field", () => {
    const sign = { type: "sign", x: 2, y: 2, elevation: 0, player_facing_dir: "BG_EVENT_PLAYER_FACING_ANY", script: "S" };
    const item = { type: "hidden_item", x: 2, y: 2, elevation: 0, item: "ITEM_X", flag: "FLAG_HIDDEN_X", quantity: 1, underfoot: false };
    const base = { type: "secret_base", x: 2, y: 2, elevation: 0, secret_base_id: "SECRET_BASE_RED_CAVE1_1" };
    for (const b of [sign, item, base]) expect(duplicateEventValue("bg", b, 10, 10)).toEqual({ ...b, x: 3 });
  });
  it("right edge goes left; y clamps to the map; x never negative", () => {
    expect(duplicateEventValue("warp", { x: 9, y: 2, elevation: 0, destMap: "M", destWarpId: "0" }, 10, 10).x).toBe(8);
    expect(duplicateEventValue("bg", { type: "sign", x: 0, y: 99, elevation: 0 }, 1, 5)).toMatchObject({ x: 0, y: 4 });
  });
  it("coord/bg drop a stray local_id too", () => {
    expect("local_id" in duplicateEventValue("bg", { type: "sign", x: 0, y: 0, elevation: 0, local_id: 1 }, 5, 5)).toBe(false);
  });
});
