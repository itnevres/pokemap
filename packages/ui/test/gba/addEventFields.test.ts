import { describe, expect, it } from "vitest";
import type { EventOptions, MapEventOptions } from "@pokemap/core/src/addEvent/types.js";
import { addEventFields, addEventDefaults } from "../../src/gba/addEventFields.js";

const options: EventOptions = {
  family: "gba", sprites: ["OBJ_EVENT_GFX_YOUNGSTER", "OBJ_EVENT_GFX_ITEM_BALL"],
  movements: ["MOVEMENT_TYPE_FACE_DOWN"], flags: ["FLAG_FOUND"], vars: ["VAR_TEMP"],
  items: ["ITEM_POTION"], trainers: [{ id: "TRAINER_RICK", label: "Rick" }],
  bgTypes: ["sign", "hidden_item", "secret_base"], facings: ["BG_EVENT_PLAYER_FACING_ANY"], secretBases: ["SECRET_BASE_RED_CAVE1"],
  palettes: ["0", "PAL_NPC_RED"], maps: ["ROUTE_29"], objectCap: 64, freeFlagSlots: 48, freeVarSlots: 9,
};
const map: MapEventOptions = { entryPoints: ["ObjectEvent", "Route29Npc"], localScripts: ["Route29Npc"], localTexts: ["Route29Text"], scenes: ["SCENE_ROUTE29_NOOP"], warps: [{ n: 0, x: 2, y: 3 }] };
const ctx = { mapName: "Route29", x: 2, y: 1, options, map };
const visible = (kind: "object" | "warp" | "coord" | "bg", type: "npc" | "itemball" | "trainer", values: Record<string, string> = {}) => addEventFields(kind, type, ctx).filter(f => !f.showIf || f.showIf(values));
const keys = (kind: "object" | "warp" | "coord" | "bg", type: "npc" | "itemball" | "trainer", values: Record<string, string> = {}) => visible(kind, type, values).map(f => f.key);

describe("gba add event field specs", () => {
  it("NPC exposes sprite, movement, ranges, flag and all three script modes", () => {
    expect(keys("object", "npc")).toEqual(expect.arrayContaining(["sprite", "movement", "rangeX", "rangeY", "flag", "script"]));
    expect(visible("object", "npc").find(f => f.key === "script")?.modes).toEqual(["existing", "copy", "new"]);
    expect(visible("object", "npc").find(f => f.key === "flag")?.modes).toEqual(["existing", "new"]);
  });
  it("item ball requires item and flag without script source", () => {
    expect(keys("object", "itemball")).toEqual(expect.arrayContaining(["item", "flag"]));
    expect(keys("object", "itemball")).not.toContain("script");
    expect(addEventDefaults("object", "itemball", ctx).flagMode).toBe("new");
    expect(visible("object", "itemball").find(f => f.key === "item")?.options).toEqual(["ITEM_POTION"]);
  });
  it("trainer has existing trainer, sight, beaten flag and exactly three new/copy text sources", () => {
    const fields = visible("object", "trainer");
    expect(fields.find(f => f.key === "trainer")?.options).toEqual(["TRAINER_RICK"]);
    expect(keys("object", "trainer")).toEqual(expect.arrayContaining(["trainer", "sightRange", "flag", "seen", "beaten", "after"]));
    for (const key of ["seen", "beaten", "after"]) expect(fields.find(f => f.key === key)?.modes).toEqual(["copy", "new"]);
    expect(keys("object", "trainer")).not.toContain("script");
  });
  it("warp provides map and destination warp values with engine numbering", () => {
    expect(keys("warp", "npc")).toEqual(expect.arrayContaining(["destMap", "destWarp"]));
    expect(visible("warp", "npc").find(f => f.key === "destWarp")?.options).toEqual(["0"]);
  });
  it("coord provides its engine trigger and script", () => {
    expect(keys("coord", "npc")).toEqual(expect.arrayContaining(["varName", "varValue", "elevation", "script"]));
    expect(visible("coord", "npc").find(f => f.key === "varName")?.modes).toEqual(["existing", "new"]);
  });
  it("bg visibility follows each supported type and never offers quantity or copy flags", () => {
    expect(keys("bg", "npc", { bgType: "sign" })).toEqual(expect.arrayContaining(["facing", "script", "elevation"]));
    expect(keys("bg", "npc", { bgType: "hidden_item" })).toEqual(["bgType", "elevation", "item", "flag"]);
    expect(keys("bg", "npc", { bgType: "secret_base" })).toEqual(["bgType", "elevation", "secretBase"]);
    for (const field of addEventFields("bg", "npc", ctx)) {
      expect(field.key).not.toBe("quantity");
      if (field.key === "flag") expect(field.modes).toEqual(["existing", "new"]);
    }
  });
  it("defaults use project values and choose the lowest unused local script name", () => {
    const first = addEventDefaults("object", "npc", ctx);
    expect(first.sprite).toBe("OBJ_EVENT_GFX_YOUNGSTER");
    expect(first.flagMode).toBe("existing"); expect(first.flag).toBe("0");
    expect(first.scriptLabel).toBe("Route29_EventScript_PokemapObject1");
    const next = addEventDefaults("object", "npc", { ...ctx, map: { ...map, localScripts: [...map.localScripts, first.scriptLabel!] } });
    expect(next.scriptLabel).toBe("Route29_EventScript_PokemapObject2");
    expect(first.elevation).toBe(""); // Workspace supplies the picked tile elevation, core remains the fallback.
  });
});
