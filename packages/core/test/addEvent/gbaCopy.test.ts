import { afterAll, beforeAll, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { copyGbaAddEventProject, removeGbaTemp } from "../helpers/gbaTempProject.js";
import { subjectSnapshot } from "../helpers/subjectSnapshot.js";
import { copyGbaScriptBody } from "../../src/addEvent/gbaCopy.js";
import { buildGbaAddEvent, type GbaAddCtx } from "../../src/addEvent/gbaBuild.js";
import { loadGbaEventOptions } from "../../src/addEvent/gbaOptions.js";
import { AddEventRefusal, type AddEventForm } from "../../src/addEvent/types.js";
import { parseMap, type MapData } from "../../src/load/maps.js";
import { parseGbaCharmap } from "../../src/signs/charmap.js";

let root: string, source: string, map: MapData, ctx: GbaAddCtx;
beforeAll(() => {
  root = copyGbaAddEventProject();
  source = readFileSync(join(root, "data/maps/Route101/scripts.inc"), "utf8");
  map = parseMap(readFileSync(join(root, "data/maps/Route101/map.json"), "utf8"));
  ctx = { options: loadGbaEventOptions(subjectSnapshot().gba!),
    mapOptions: { entryPoints: [], localScripts: ["Route101_EventScript_Youngster"],
      localTexts: ["Route101_Text_TakeTiredPokemonToPokeCenter"], scenes: [], warps: [] },
    root, mapName: "Route101", tileElevation: 3, freeFlags: [], freeVars: [], scriptReplaces: [],
    check: () => ({ taken: false }), charmap: parseGbaCharmap(readFileSync(join(root, "charmap.txt"), "utf8")) };
});
afterAll(() => { if (root) removeGbaTemp(root); });
function refused(text: string, label: string, code: string) {
  expect(() => copyGbaScriptBody(text, label)).toThrow(AddEventRefusal);
  try { copyGbaScriptBody(text, label); } catch (error) { expect(error).toMatchObject({ code }); }
}
const copyForm = (body: string, texts: Record<string, string>): AddEventForm => ({ kind: "object", x: 1, y: 1, objectType: "npc",
  fields: { sprite: "OBJ_EVENT_GFX_YOUNGSTER", movement: "MOVEMENT_TYPE_FACE_DOWN" },
  script: { mode: "copy", from: "Route101_EventScript_Youngster", label: "Route101_EventScript_Copied", body, texts } });

it("copy of Route101_EventScript_Youngster renames its text label", () => {
  const preview = copyGbaScriptBody(source, "Route101_EventScript_Youngster");
  expect(preview.body.trim()).toBe("msgbox Route101_Text_TakeTiredPokemonToPokeCenter, MSGBOX_NPC\n\tend");
  expect(Object.keys(preview.texts)).toEqual(["Route101_Text_TakeTiredPokemonToPokeCenter"]);
  expect(preview.texts.Route101_Text_TakeTiredPokemonToPokeCenter).toMatch(/\.string "TOWN right close by\.\$"\s*$/);
  const r = buildGbaAddEvent(map, source, copyForm(preview.body, preview.texts), ctx);
  const text = r.scriptAppends[0]!.text.replace(/\r\n/g, "\n");
  expect(r.value.script).toBe("Route101_EventScript_Copied");
  expect(text).toContain("Route101_EventScript_Copied::\n\tmsgbox Route101_Text_Copied, MSGBOX_NPC\n\tend\n");
  expect(text).toContain("Route101_Text_Copied:\n\t.string \"If POK\u00e9MON get tired, take them to\\n\"");
  expect(text).not.toContain("Route101_Text_TakeTiredPokemonToPokeCenter");
  expect(r.newNames).toEqual(["Route101_EventScript_Copied", "Route101_Text_Copied"]);
  // The staged copy parses back under the same grammar.
  expect(copyGbaScriptBody(source + "\n" + text, "Route101_EventScript_Copied").texts).toHaveProperty("Route101_Text_Copied");
});
it("a body reached by fall-through -> COPY_FALLTHROUGH", () => {
  refused("Route101_EventScript_Fall::\n\tlock\n\tfaceplayer\nRoute101_EventScript_Next::\n\tend\n", "Route101_EventScript_Fall", "COPY_FALLTHROUGH");
  // A label-only block falls straight into the next label.
  refused("Route101_EventScript_Fall::\nRoute101_EventScript_Next::\n\tend\n", "Route101_EventScript_Fall", "COPY_FALLTHROUGH");
  refused("Route101_EventScript_Fall::\n\tlock\n", "Route101_EventScript_Fall", "COPY_UNBOUNDED");
});
it("an edited body that loses its terminator -> COPY_UNBOUNDED on re-parse", () => {
  const preview = copyGbaScriptBody(source, "Route101_EventScript_Youngster");
  const edited = copyForm("\tmsgbox Route101_Text_TakeTiredPokemonToPokeCenter, MSGBOX_NPC\n", preview.texts);
  expect(() => buildGbaAddEvent(map, source, edited, ctx)).toThrow(AddEventRefusal);
  try { buildGbaAddEvent(map, source, edited, ctx); } catch (e) {
    expect(e).toMatchObject({ code: "COPY_UNBOUNDED", path: "data/maps/Route101/scripts.inc" });
  }
});
it("an edited body with an extra top-level definition is refused", () => {
  const edited = copyForm("\tcall Helper\n\tend\nHelper::\n\treturn\n", {});
  expect(() => buildGbaAddEvent(map, source, edited, ctx)).toThrow(expect.objectContaining({ code: "COPY_UNBOUNDED" }));
});
it("data, movement and text labels are not event scripts", () => {
  refused(source, "Route101_MapScripts", "COPY_NOT_SCRIPT");
  refused(source, "Route101_Movement_PreventExitSouth", "COPY_NOT_SCRIPT");
  refused(source, "Route101_Text_TakeTiredPokemonToPokeCenter", "COPY_NOT_SCRIPT");
  refused(source, "Route101_EventScript_Missing", "COPY_NOT_SCRIPT");
});
