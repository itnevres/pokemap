import { describe, expect, it } from "vitest";
import type { EventOptions, MapEventOptions } from "@pokemap/core/src/addEvent/types.js";
import { addEventFields, addEventDefaults } from "../../src/gbc/addEventFields.js";

const options: EventOptions = {
  family: "gbc", sprites: ["SPRITE_YOUNGSTER"],
  movements: ["SPRITEMOVEDATA_STANDING_DOWN"], flags: ["EVENT_FOUND"], vars: [],
  items: ["POTION"], trainers: [{ id: "YOUNGSTER,JOEY1", label: "Joey" }],
  bgTypes: ["BGEVENT_READ", "BGEVENT_ITEM", "BGEVENT_IFSET", "BGEVENT_IFNOTSET"], facings: ["BG_EVENT_PLAYER_FACING_ANY"], secretBases: ["SECRET_BASE_RED_CAVE1"],
  palettes: ["0", "PAL_NPC_RED"], maps: ["ROUTE_29"], objectCap: 15, freeFlagSlots: 48, freeVarSlots: 9,
};
const map: MapEventOptions = { entryPoints: ["ObjectEvent", "Route29Npc"], localScripts: ["Route29Npc"], localTexts: ["Route29Text"], scenes: ["SCENE_ROUTE29_NOOP"], warps: [{ n: 1, x: 2, y: 3 }] };
const ctx = { mapName: "Route29", x: 2, y: 1, options, map };
const visible = (kind: "object" | "warp" | "coord" | "bg", type: "npc" | "itemball" | "trainer", values: Record<string, string> = {}) => addEventFields(kind, type, ctx).filter(f => !f.showIf || f.showIf(values));
const keys = (kind: "object" | "warp" | "coord" | "bg", type: "npc" | "itemball" | "trainer", values: Record<string, string> = {}) => visible(kind, type, values).map(f => f.key);

describe("gbc add event field specs", () => {
  it("NPC exposes sprite, movement, ranges, flag and all three script modes", () => {
    expect(keys("object", "npc")).toEqual(expect.arrayContaining(["sprite", "movement", "rangeX", "rangeY", "flag", "script"]));
    expect(visible("object", "npc").find(f => f.key === "script")?.modes).toEqual(["existing", "copy", "new"]);
    expect(visible("object", "npc").find(f => f.key === "flag")?.modes).toEqual(["existing", "new"]);
  });
  it("item ball requires item and flag without script source", () => {
    expect(keys("object", "itemball")).toEqual(expect.arrayContaining(["item", "flag"]));
    expect(keys("object", "itemball")).not.toContain("script");
    expect(addEventDefaults("object", "itemball", ctx).flagMode).toBe("new");
    expect(visible("object", "itemball").find(f => f.key === "item")?.options).toEqual(["POTION"]);
  });
  it("trainer has existing trainer, sight, beaten flag and exactly three new/copy text sources", () => {
    const fields = visible("object", "trainer");
    expect(fields.find(f => f.key === "trainer")?.options).toEqual(["YOUNGSTER,JOEY1"]);
    expect(keys("object", "trainer")).toEqual(expect.arrayContaining(["trainer", "sightRange", "flag", "seen", "beaten", "after"]));
    for (const key of ["seen", "beaten", "after"]) expect(fields.find(f => f.key === key)?.modes).toEqual(["copy", "new"]);
    expect(keys("object", "trainer")).not.toContain("script");
  });
  it("warp provides map and destination warp values with engine numbering", () => {
    expect(keys("warp", "npc")).toEqual(expect.arrayContaining(["destMap", "destWarp"]));
    expect(visible("warp", "npc").find(f => f.key === "destWarp")?.options).toEqual(["1"]);
  });
  it("coord provides its engine trigger and script", () => {
    expect(keys("coord", "npc")).toEqual(expect.arrayContaining(["scene", "script"]));
    expect(visible("coord", "npc").find(f => f.key === "scene")?.options).toEqual(["-1", "SCENE_ROUTE29_NOOP"]);
  });
  it("bg visibility follows each supported type and never offers quantity or copy flags", () => {
    expect(keys("bg", "npc", { bgType: "BGEVENT_READ" })).toEqual(["bgType", "script"]);
    expect(keys("bg", "npc", { bgType: "BGEVENT_ITEM" })).toEqual(["bgType", "label", "item", "flag"]);
    for (const bgType of ["BGEVENT_IFSET", "BGEVENT_IFNOTSET"]) expect(keys("bg", "npc", { bgType })).toEqual(["bgType", "label", "flag", "script"]);
    expect(visible("bg", "npc").find(f => f.key === "bgType")?.options).not.toContain("BGEVENT_COPY");
    for (const field of addEventFields("bg", "npc", ctx)) {
      expect(field.key).not.toBe("quantity");
      if (field.key === "flag") expect(field.modes).toEqual(["existing", "new"]);
    }
  });
  it("conditional BG wrappers have a distinct generated label from the selected script", () => {
    const values = addEventDefaults("bg", "npc", ctx);
    expect(values.label).toBe("Route29PokemapBg1Wrapper");
    expect(values.label).not.toBe(values.scriptLabel);
  });
  it("defaults use project values and choose the lowest unused local script name", () => {
    const first = addEventDefaults("object", "npc", ctx);
    expect(first.sprite).toBe("SPRITE_YOUNGSTER");
    expect(first.flagMode).toBe("existing"); expect(first.flag).toBe("-1");
    expect(first.scriptLabel).toBe("Route29PokemapObject1");
    const next = addEventDefaults("object", "npc", { ...ctx, map: { ...map, localScripts: [...map.localScripts, first.scriptLabel!] } });
    expect(next.scriptLabel).toBe("Route29PokemapObject2");
    expect(first.palette).toBe("0"); expect(first.hourStart).toBe("-1"); expect(first.hourEnd).toBe("-1"); expect(keys("object", "npc")).toContain("objectConst");
  });
});
