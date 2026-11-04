import { afterAll, beforeAll, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { copyGbaAddEventProject, removeGbaTemp } from "../helpers/gbaTempProject.js";
import { subjectSnapshot } from "../helpers/subjectSnapshot.js";
import { freeGbaSlots, loadGbaEventOptions } from "../../src/addEvent/gbaOptions.js";
import { buildGbaAddEvent, defaultGbaLabels, type GbaAddCtx } from "../../src/addEvent/gbaBuild.js";
import { AddEventRefusal, type AddEventForm } from "../../src/addEvent/types.js";
import { parseMap, type MapData } from "../../src/load/maps.js";
import { parseGbaCharmap } from "../../src/signs/charmap.js";
import { applyScriptAppend } from "../../src/write/save.js";

const INC = "data/maps/Route101/scripts.inc";
let root: string, inc: string, map: MapData, ctx: GbaAddCtx, flagsDisk: string, varsDisk: string;
beforeAll(() => {
  const snap = subjectSnapshot().gba!;
  root = copyGbaAddEventProject();
  inc = readFileSync(join(root, INC), "utf8");
  map = parseMap(readFileSync(join(root, "data/maps/Route101/map.json"), "utf8"));
  flagsDisk = readFileSync(join(root, "include/constants/flags.h"), "utf8");
  varsDisk = readFileSync(join(root, "include/constants/vars.h"), "utf8");
  ctx = { options: loadGbaEventOptions(snap),
    mapOptions: { entryPoints: ["Route101_EventScript_Youngster", "0x0"], localScripts: ["Route101_EventScript_Youngster"],
      localTexts: ["Route101_Text_TakeTiredPokemonToPokeCenter"], scenes: [], warps: [] },
    root, mapName: "Route101", tileElevation: 5, freeFlags: freeGbaSlots(snap, "FLAG"), freeVars: freeGbaSlots(snap, "VAR"),
    scriptReplaces: [], check: () => ({ taken: false }),
    charmap: parseGbaCharmap(readFileSync(join(root, "charmap.txt"), "utf8")) };
});
afterAll(() => { if (root) removeGbaTemp(root); });

const npc = (): AddEventForm => ({ kind: "object", x: 3, y: 4, objectType: "npc",
  fields: { sprite: "OBJ_EVENT_GFX_YOUNGSTER", movement: "MOVEMENT_TYPE_FACE_DOWN" },
  script: { mode: "new", label: "Route101_EventScript_PokemapObject1", text: "Hello there!" } });
const trainer = (): AddEventForm => ({ kind: "object", x: 3, y: 4, objectType: "trainer",
  fields: { sprite: "OBJ_EVENT_GFX_YOUNGSTER", movement: "MOVEMENT_TYPE_FACE_DOWN", trainer: "TRAINER_RICK", sightRange: "4" },
  texts: { seen: { mode: "new", text: "Seen!" }, beaten: { mode: "new", text: "Beaten!" }, after: { mode: "new", text: "After!" } } });
const itemball = (flag = "FLAG_POKEMAP_POTION"): AddEventForm => ({ kind: "object", x: 3, y: 4, objectType: "itemball",
  fields: { item: "ITEM_POTION" }, flag: { mode: "new", name: flag } });
const build = (form = npc(), source: string | null = inc, context = ctx) => buildGbaAddEvent(map, source, form, context);
const lf = (s: string) => s.replace(/\r\n/g, "\n");
const renamed = (disk: string, slot: string, name: string) => disk.replace(new RegExp(`(#define[ \\t]+)${slot}\\b`), `$1${name}`);
function refuses(code: string, fn: () => unknown, path = INC) {
  try { fn(); throw new Error("expected refusal"); }
  catch (e) {
    expect(e).toBeInstanceOf(AddEventRefusal);
    expect(e).toMatchObject({ code, path });
    expect((e as Error).message).toContain("Route101");
    expect((e as Error).message).toContain(path);
  }
}

it("npc new", () => {
  const r = build();
  expect(r.value).toMatchObject({ graphics_id: "OBJ_EVENT_GFX_YOUNGSTER", x: 3, y: 4, elevation: 5, flag: "0",
    trainer_type: "TRAINER_TYPE_NONE", script: "Route101_EventScript_PokemapObject1" });
  expect(r.scriptAppends).toHaveLength(1);
  expect(r.scriptAppends[0]!.path.replace(/\\/g, "/")).toMatch(/\/data\/maps\/Route101\/scripts\.inc$/);
  const text = lf(r.scriptAppends[0]!.text);
  expect(text).toContain("Route101_EventScript_PokemapObject1::\n\tmsgbox Route101_Text_PokemapObject1, MSGBOX_NPC\n\tend\n");
  expect(text).toContain("Route101_Text_PokemapObject1:\n\t.string \"Hello there!$\"");
  expect(r.scriptReplaces).toEqual([]);
  expect(r.newNames).toEqual(["Route101_EventScript_PokemapObject1", "Route101_Text_PokemapObject1"]);
  expect(r.created).toEqual({ kind: "object", index: map.objectEvents.length });
});
it("itemball", () => {
  const r = build(itemball());
  expect(r.value).toMatchObject({ graphics_id: "OBJ_EVENT_GFX_ITEM_BALL", flag: "FLAG_POKEMAP_POTION",
    script: "Route101_EventScript_PokemapObject1" });
  // Subject data/maps/Route102/scripts.inc: Route102_EventScript_ItemPotion is `finditem ITEM_POTION` / `end`.
  expect(lf(r.scriptAppends[0]!.text)).toContain("Route101_EventScript_PokemapObject1::\n\tfinditem ITEM_POTION\n\tend\n");
  expect(r.scriptReplaces).toHaveLength(1);
  const edit = r.scriptReplaces[0]!;
  expect(edit.path.replace(/\\/g, "/")).toMatch(/\/include\/constants\/flags\.h$/);
  expect(edit.before).toBe(flagsDisk);
  expect(edit.after).not.toBe(flagsDisk);
  expect(edit.after).toBe(renamed(flagsDisk, ctx.freeFlags[0]!, "FLAG_POKEMAP_POTION"));
  expect(r.newNames).toContain("FLAG_POKEMAP_POTION");
});
it("two new flags", () => {
  const first = build(itemball("FLAG_POKEMAP_FIRST"));
  const second = build(itemball("FLAG_POKEMAP_SECOND"), applyScriptAppend(inc, first.scriptAppends[0]!),
    { ...ctx, scriptReplaces: first.scriptReplaces });
  expect(second.value.script).toBe("Route101_EventScript_PokemapObject2");
  expect(second.scriptReplaces).toHaveLength(1);
  const edit = second.scriptReplaces[0]!;
  expect(edit.before).toBe(flagsDisk);
  expect(edit.after).toBe(renamed(renamed(flagsDisk, ctx.freeFlags[0]!, "FLAG_POKEMAP_FIRST"), ctx.freeFlags[1]!, "FLAG_POKEMAP_SECOND"));
  const before = flagsDisk.split("\n"), after = edit.after.split("\n");
  expect(after).toHaveLength(before.length);
  expect(after.filter((line, i) => line !== before[i])).toHaveLength(2);
  expect(first.scriptReplaces[0]!.after).not.toContain("FLAG_POKEMAP_SECOND");
  expect(ctx.scriptReplaces).toEqual([]);
});
it("text provenance", () => {
  const f = trainer(); f.texts!.seen = { mode: "copy", from: "ForeignText", text: "Hi" };
  refuses("COPY_NOT_SCRIPT", () => build(f));
  // A stale localTexts entry that is a script, not dialogue, in this scripts.inc.
  f.texts!.seen = { mode: "copy", from: "Route101_EventScript_Youngster", text: "Hi" };
  refuses("COPY_NOT_SCRIPT", () => build(f, inc, { ...ctx, mapOptions: { ...ctx.mapOptions, localTexts: ["Route101_EventScript_Youngster"] } }));
  f.texts!.seen = { mode: "copy", from: "Route101_Text_TakeTiredPokemonToPokeCenter", text: "Copied hello!" };
  expect(lf(build(f).scriptAppends[0]!.text)).toContain('.string "Copied hello!$"');
});
it("trainer existing", () => {
  const r = build(trainer());
  expect(r.value).toMatchObject({ trainer_type: "TRAINER_TYPE_NORMAL", trainer_sight_or_berry_tree_id: "4",
    script: "Route101_EventScript_PokemapObject1", flag: "0" });
  // Subject data/maps/Route102/scripts.inc:63-66, Route102_EventScript_Rick:
  //   trainerbattle_single TRAINER_RICK, Route102_Text_RickIntro, Route102_Text_RickDefeated
  //   msgbox Route102_Text_RickPostBattle, MSGBOX_AUTOCLOSE
  //   end
  const text = lf(r.scriptAppends[0]!.text);
  expect(text).toContain("Route101_EventScript_PokemapObject1::\n" +
    "\ttrainerbattle_single TRAINER_RICK, Route101_Text_PokemapObject1Intro, Route101_Text_PokemapObject1Defeated\n" +
    "\tmsgbox Route101_Text_PokemapObject1PostBattle, MSGBOX_AUTOCLOSE\n\tend\n");
  for (const [label, value] of [["Intro", "Seen!"], ["Defeated", "Beaten!"], ["PostBattle", "After!"]]) {
    expect(text).toContain(`Route101_Text_PokemapObject1${label}:\n\t.string "${value}$"`);
  }
  const bad = trainer(); bad.fields.trainer = "TRAINER_NOT_REAL";
  refuses("BAD_OPTION", () => build(bad), "data/maps/Route101/map.json");
});
it("coord new var", () => {
  const f: AddEventForm = { kind: "coord", x: 1, y: 2, fields: { varValue: "1" },
    varName: { mode: "new", name: "VAR_POKEMAP_STATE" }, script: { mode: "existing", label: "Route101_EventScript_Youngster" } };
  const r = build(f);
  expect(r.value).toEqual({ type: "trigger", x: 1, y: 2, elevation: 5, var: "VAR_POKEMAP_STATE", var_value: "1",
    script: "Route101_EventScript_Youngster" });
  expect(r.scriptReplaces).toHaveLength(1);
  expect(r.scriptReplaces[0]!.path.replace(/\\/g, "/")).toMatch(/\/include\/constants\/vars\.h$/);
  expect(r.scriptReplaces[0]!.before).toBe(varsDisk);
  expect(r.scriptReplaces[0]!.after).toBe(renamed(varsDisk, ctx.freeVars[0]!, "VAR_POKEMAP_STATE"));
  expect(r.created).toEqual({ kind: "coord", index: map.coordEvents.length });
  refuses("NO_VAR_SLOT", () => build(f, inc, { ...ctx, freeVars: [] }), "include/constants/vars.h");
});
it("bg", () => {
  const sign = build({ kind: "bg", x: 1, y: 2, fields: { bgType: "sign", facing: "BG_EVENT_PLAYER_FACING_NORTH" },
    script: { mode: "new", label: "Route101_EventScript_PokemapBg1", text: "A sign." } });
  expect(sign.value).toEqual({ type: "sign", x: 1, y: 2, elevation: 5, player_facing_dir: "BG_EVENT_PLAYER_FACING_NORTH",
    script: "Route101_EventScript_PokemapBg1" });
  expect(lf(sign.scriptAppends[0]!.text)).toContain("Route101_EventScript_PokemapBg1::\n\tmsgbox Route101_Text_PokemapBg1, MSGBOX_SIGN\n\tend\n");
  const hidden = build({ kind: "bg", x: 1, y: 2, fields: { bgType: "hidden_item", item: "ITEM_POTION" },
    flag: { mode: "existing", name: "FLAG_HIDDEN_ITEM_ROUTE_104_SUPER_POTION" } });
  expect(Object.keys(hidden.value)).toEqual(["type", "x", "y", "elevation", "item", "flag"]);
  expect(hidden.value).toEqual({ type: "hidden_item", x: 1, y: 2, elevation: 5, item: "ITEM_POTION",
    flag: "FLAG_HIDDEN_ITEM_ROUTE_104_SUPER_POTION" });
  expect(hidden.value).not.toHaveProperty("quantity");
  expect(hidden.scriptAppends).toEqual([]);
  const base = build({ kind: "bg", x: 1, y: 2, fields: { bgType: "secret_base", secretBase: ctx.options.secretBases[0]! } });
  expect(base.value).toEqual({ type: "secret_base", x: 1, y: 2, elevation: 5, secret_base_id: ctx.options.secretBases[0] });
  refuses("BAD_OPTION", () => build({ kind: "bg", x: 1, y: 2, fields: { bgType: "secret_base", secretBase: "SECRET_BASE_RED_CAVE1" } }),
    "data/maps/Route101/map.json");
  for (const r of [sign, hidden, base]) expect(typeof r.value.elevation).toBe("number");
});
it("warp", () => {
  const r = build({ kind: "warp", x: 1, y: 2, fields: { destMap: "LittlerootTown", destWarp: "1" } });
  expect(r.value).toEqual({ x: 1, y: 2, elevation: 5, dest_map: "MAP_LITTLEROOT_TOWN", dest_warp_id: "1" });
  expect(r.created).toEqual({ kind: "warp", index: 0 });
  refuses("BAD_OPTION", () => build({ kind: "warp", x: 1, y: 2, fields: { destMap: "LittlerootTown", destWarp: "99" } }),
    "data/maps/Route101/map.json");
});
it("NO_SCRIPTS_INC when scriptsInc is null; existing still works", () => {
  refuses("NO_SCRIPTS_INC", () => build(npc(), null));
  const copy = npc(); copy.script = { mode: "copy", from: "Route101_EventScript_Youngster", label: "Route101_EventScript_Copied",
    body: "\tmsgbox Route101_Text_TakeTiredPokemonToPokeCenter, MSGBOX_NPC\n\tend\n", texts: {} };
  refuses("NO_SCRIPTS_INC", () => build(copy, null));
  refuses("NO_SCRIPTS_INC", () => build(itemball(), null));
  const existing = npc(); existing.script = { mode: "existing", label: "Route101_EventScript_Youngster" };
  const r = build(existing, null);
  expect(r.value.script).toBe("Route101_EventScript_Youngster");
  expect(r.scriptAppends).toEqual([]);
});
it("LABEL_TAKEN", () => {
  const taken1 = (name: string) => ({ taken: name === "Route101_EventScript_PokemapObject1" });
  expect(defaultGbaLabels("Route101", "object", taken1)).toEqual({
    script: "Route101_EventScript_PokemapObject2", text: "Route101_Text_PokemapObject2" });
  expect(build(itemball(), inc, { ...ctx, check: taken1 }).value.script).toBe("Route101_EventScript_PokemapObject2");
  refuses("LABEL_TAKEN", () => build(npc(), inc, { ...ctx, check: taken1 }));
  // Defined in this scripts.inc, even when the injected check misses it.
  const local = npc(); local.script = { mode: "new", label: "Route101_EventScript_Youngster", text: "Hi" };
  refuses("LABEL_TAKEN", () => build(local));
  refuses("LABEL_TAKEN", () => build(itemball(), inc, { ...ctx, check: name => ({ taken: name === "FLAG_POKEMAP_POTION" }) }),
    "include/constants/flags.h");
});
it("NAME_INVALID and failed create leaves context byte-identical", () => {
  const before = JSON.stringify(ctx);
  const f = itemball(); f.fields.label = "1abc";
  refuses("NAME_INVALID", () => build(f));
  expect(JSON.stringify(ctx)).toBe(before);
});
